// Lutefisk renderer: library, application shell, section management, live
// preview wiring, autosave and exports.
import {
  h, icon, dialog, toast, confirmDialog, debounce, assetUrl, popover, closePopovers, segmented, generatedCover, timeAgo, brandMark,
} from './ui.js';
import { createEditor } from './editor.js';
import { createDevicePreview } from './preview-device.js';
import { createPrintPreview } from './preview-print.js';
import { openBookSettings, openTemplates, openStats, generatedPanel, sheet } from './panels.js';
import { createGoals, goalMeter, openGoals, sessionClock } from './goals.js';
import { createScreenplayApp, scriptCover, fdxToFountain, osfToFountain } from './screenplay-app.js';
import { openScreenplayGuide } from './screenplay-guide.js';
import { openChapterStats } from './chapter-stats.js';
import { createCommentRail } from './comments.js';
import { writeFountain, parseFountain } from '../shared/fountain.js';
import { FORMATS } from '../shared/screenplay.js';
import {
  GROUPS, SECTION_TYPES, DEFAULT_CONTENT, defaultBook, ensureSections, newId, numberSections, CHAPTER_HEADINGS,
} from '../shared/sections.js';
import { renderSection, prepare, citer } from '../shared/bookhtml.js';
import { joinScenes, splitAtBreaks, countBlocks, sceneSnippet } from '../shared/scenes.js';
import { formatEntry, sortKey } from '../shared/citations.js';
import { researchPanel, researchReference, newResearchItem, isTextItem, RESEARCH_ICON, RESEARCH_LABEL, promptLink } from './research.js';
import { templateById, TEMPLATES, setCustomTemplates } from '../shared/templates.js';
import { fontStack } from '../shared/fonts.js';

const B = window.lutefisk;
document.documentElement.classList.add(`os-${B.platform}`);

const app = {
  book: null,
  contents: {},
  currentId: null,
  previewId: null, // section shown in the preview (follows the editor while typing)
  dirtyFiles: new Set(),
  removed: [],
  dirtyNotes: new Set(),
  removedNotes: [],
  expanded: new Set(),
  pinnedId: null,
  metaDirty: false,
  view: 'device',
  htmlCache: new Map(),
};

const root = document.getElementById('app');
const els = {};
let mode = 'library'; // 'library' | 'book' | 'screenplay'
const screenplay = createScreenplayApp({ root, B, onLibrary: () => showLibrary() });
const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const countWords = (t) => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;

/* ================================================================ zoom */

const ZOOMS = [80, 90, 100, 110, 125, 140, 160, 180, 200];
let editorZoom = (() => { try { return Number(localStorage.getItem('lutefisk.editorZoom')) || 110; } catch { return 110; } })();
function applyZoom() {
  document.documentElement.style.setProperty('--editor-zoom', String(editorZoom / 100));
  if (els.zoomLbl) els.zoomLbl.textContent = `${editorZoom}%`;
  try { localStorage.setItem('lutefisk.editorZoom', String(editorZoom)); } catch { /* storage unavailable */ }
}
function zoom(dir) {
  if (dir === 0) editorZoom = 100;
  else {
    const i = ZOOMS.findIndex((z) => z >= editorZoom);
    editorZoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (ZOOMS[i] === editorZoom ? i : dir > 0 ? i - 1 : i) + dir))];
  }
  applyZoom();
}
applyZoom();

/* ============================================================== library */

async function showLibrary() {
  closePopovers();
  if (app.book) { await save(); app.goals.measured(true); app.goals.archiveSession(); await app.goals.flush(); }
  if (mode === 'screenplay') await screenplay.close();
  mode = 'library';
  document.title = 'Lutefisk';
  let data = { books: [], libraryDir: '', home: '' };
  try { data = await B.library(); } catch (err) { toast(clean(err), 'error'); }
  const pretty = (p) => (data.home && p.startsWith(data.home) ? p.slice(data.home.length + 1) : p).split(/[\\/]/).filter(Boolean).join(' › ');

  const grid = h('div', { class: 'lib-grid' });
  grid.append(h('button', { class: 'lib-new', onclick: () => newBookSheet(data) },
    h('div', { class: 'lib-new-cover' }, icon('plus', 34)), h('div', { class: 'lib-meta' }, h('b', {}, 'New Project'), h('span', {}, 'Book or screenplay'))));
  for (const b of data.books) {
    const cover = b.kind === 'screenplay' ? scriptCover({ Title: b.title, Author: b.author }) : b.cover ? h('img', { src: b.cover, alt: '' }) : generatedCover(b.title, b.author, fontStack(templateById(b.template).head));
    const more = h('button', { class: 'lib-more', title: 'More', 'aria-label': `More options for ${b.title}`, onclick: (e) => {
      e.stopPropagation();
      popover(more, [
        { label: 'Open', icon: 'book', onClick: () => openRecent(b.dir) },
        { label: B.platform === 'darwin' ? 'Show in Finder' : 'Show in Folder', icon: 'folder', onClick: () => B.revealPath(b.dir) },
        '-',
        { label: 'Remove from Recents', icon: 'minus', onClick: async () => { await B.forgetBook(b.dir); showLibrary(); } },
      ], { align: 'right' });
    } }, icon('more', 18));
    grid.append(h('div', { class: 'lib-book', tabindex: 0, role: 'button', 'aria-label': `Open ${b.title}`,
      onclick: () => openRecent(b.dir), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecent(b.dir); } } },
    h('div', { class: 'lib-cover' }, cover, h('div', { class: 'lib-spine' })), more,
    h('div', { class: 'lib-meta' }, h('b', { title: b.title }, b.title), h('span', {}, b.author || 'No author'),
      h('small', {}, `${b.kind === 'screenplay' ? 'Screenplay · ' : ''}${b.words.toLocaleString()} words · ${timeAgo(b.modified)}`))));
  }

  const view = h('div', { class: 'library' },
    h('div', { class: 'lib-titlebar drag' }),
    h('div', { class: 'lib-brand' }, brandMark(52, 'lib-brand-mark'), h('div', {}, h('div', { class: 'brand-word' }, 'Lutefisk'), h('div', { class: 'brand-tag' }, 'Write, design and publish books and screenplays, privately.'))),
    h('header', { class: 'lib-head' },
      h('div', {}, h('h1', {}, 'Library'), h('p', {}, data.books.length ? `${data.books.length} ${data.books.length === 1 ? 'book' : 'books'}` : 'Your books will appear here.')),
      h('div', { class: 'lib-actions' },
        h('button', { class: 'btn', onclick: openBook }, icon('folder', 16), 'Open…'),
        h('button', { class: 'btn', onclick: () => importScreenplay(data) }, icon('script', 16), 'Import Screenplay…'),
        h('button', { class: 'btn primary', onclick: () => newBookSheet(data) }, icon('plus', 16), 'New Project'))),
    h('main', { class: 'lib-scroll' }, grid,
      !data.books.length ? h('div', { class: 'lib-empty' }, brandMark(96, 'lib-empty-mark'), h('p', {}, 'Create your first book, or drag a book folder onto this window.')) : null),
    h('footer', { class: 'lib-foot' }, icon('eye', 14), h('span', {}, `New books are saved to ${pretty(data.libraryDir)}. Everything stays on this computer — no accounts, no cloud, no tracking.`)),
    h('div', { class: 'drop-hint' }, h('div', {}, icon('folder', 40), h('b', {}, 'Drop to open book'))));
  root.replaceChildren(view);
  app.book = null;
}

async function newBookSheet(lib) {
  let parent = lib.libraryDir;
  const pretty = (p) => (lib.home && p.startsWith(lib.home) ? p.slice(lib.home.length + 1) : p).split(/[\\/]/).filter(Boolean).join(' › ');
  let kind = 'book';
  const fmtSel = h('select', { 'aria-label': 'Format' }, Object.values(FORMATS).map((f) => h('option', { value: f.id }, f.label)));
  const title = h('input', { type: 'text', placeholder: 'Untitled Book', 'aria-label': 'Title' });
  const subtitle = h('input', { type: 'text', placeholder: 'Optional', 'aria-label': 'Subtitle' });
  const author = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Author' });
  const tplSel = h('select', { 'aria-label': 'Template' }, ['General', 'Fiction', 'Literary', 'Nonfiction'].map((c) =>
    h('optgroup', { label: c }, TEMPLATES.filter((t) => t.category === c).map((t) => h('option', { value: t.id }, t.name)))));
  try { author.value = localStorage.getItem('lutefisk.author') || ''; } catch { /* ignore */ }
  const locLbl = h('span', { class: 'loc-path' }, pretty(parent));
  const preview = h('div', { class: 'nb-preview' });
  const draw = () => {
    const t = templateById(tplSel.value);
    if (kind === 'screenplay') preview.replaceChildren(scriptCover({ Title: title.value || 'Untitled Screenplay', Author: author.value }));
    else preview.replaceChildren(generatedCover(title.value || 'Untitled Book', author.value, fontStack(t.head)), h('div', { class: 'lib-spine' }));
  };
  const kindSeg = segmented([{ value: 'book', label: 'Book', icon: 'book' }, { value: 'screenplay', label: 'Screenplay', icon: 'script' }], 'book', (v) => {
    kind = v;
    title.placeholder = v === 'book' ? 'Untitled Book' : 'Untitled Screenplay';
    for (const el of form.querySelectorAll('.book-only')) el.hidden = v !== 'book';
    for (const el of form.querySelectorAll('.script-only')) el.hidden = v !== 'screenplay';
    authorLbl.textContent = v === 'book' ? 'Author' : 'Written by';
    create.textContent = v === 'book' ? 'Create Book' : 'Create Screenplay';
    draw();
  }, { label: 'Project type' });
  const authorLbl = h('span', {}, 'Author');
  for (const el of [title, author]) el.addEventListener('input', draw);
  tplSel.addEventListener('change', draw);
  draw();
  const create = h('button', { type: 'submit', class: 'btn primary' }, 'Create Book');
  const form = h('form', { class: 'nb-form' },
    h('div', { class: 'nb-kind' }, kindSeg),
    h('label', { class: 'fld' }, h('span', {}, 'Title'), title),
    h('label', { class: 'fld book-only' }, h('span', {}, 'Subtitle'), subtitle),
    h('label', { class: 'fld' }, authorLbl, author),
    h('label', { class: 'fld book-only' }, h('span', {}, 'Design'), tplSel),
    h('label', { class: 'fld script-only', hidden: true }, h('span', {}, 'Format'), fmtSel),
    h('div', { class: 'fld' }, h('span', {}, 'Location'), h('div', { class: 'loc-row' }, icon('folder', 16), locLbl,
      h('button', { type: 'button', class: 'btn small', onclick: async () => { const p = await B.chooseLocation(); if (p) { parent = p; locLbl.textContent = pretty(p); } } }, 'Change…'))),
    h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'), create));
  const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') close(); } },
    h('div', { class: 'dlg nb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'New Book' },
      h('div', { class: 'nb-side' }, preview), h('div', { class: 'nb-main' }, h('h2', {}, 'New Project'), form)));
  const close = () => overlay.remove();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    create.disabled = true;
    if (kind === 'screenplay') {
      try { localStorage.setItem('lutefisk.author', author.value.trim()); } catch { /* ignore */ }
      const t = title.value.trim() || 'Untitled Screenplay';
      const tp = { Title: t, Credit: 'Written by', Author: author.value.trim(), 'Draft date': new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) };
      const book = { format: 'lutefisk/1', kind: 'screenplay', title: t, author: author.value.trim(), uuid: crypto.randomUUID(), screenplay: { format: fmtSel.value }, preview: { device: 'ipad', fontSize: 100, font: '', theme: 'light' }, research: [], goals: {}, sections: [] };
      const first = fmtSel.value === 'tv' ? [{ type: 'act', text: 'TEASER' }, { type: 'transition', text: 'FADE IN:' }, { type: 'scene', text: '' }] : [{ type: 'transition', text: 'FADE IN:' }, { type: 'scene', text: '' }];
      try {
        const data = await B.newBook({ book, contents: { __script: writeFountain(tp, first) }, parent });
        close();
        if (data) loadBookData(data);
      } catch (err) { create.disabled = false; toast(clean(err), 'error', 6000); }
      return;
    }
    const book = ensureSections(defaultBook({ title: title.value.trim() || 'Untitled Book', subtitle: subtitle.value.trim(), author: author.value.trim() }));
    book.template = tplSel.value;
    book.uuid = crypto.randomUUID();
    try { localStorage.setItem('lutefisk.author', author.value.trim()); } catch { /* ignore */ }
    const contents = {};
    for (const s of book.sections) contents[s.id] = DEFAULT_CONTENT[s.type] || '';
    contents[book.sections.find((s) => s.type === 'chapter').id] = '';
    try {
      const data = await B.newBook({ book, contents, parent });
      close();
      if (data) loadBookData(data);
    } catch (err) { create.disabled = false; toast(clean(err), 'error', 6000); }
  });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  title.focus();
}

async function importScreenplay(lib) {
  try {
    const f = await B.importScreenplay();
    if (!f) return;
    const fountain = f.ext === 'fdx' ? fdxToFountain(f.text) : f.ext === 'osf' || /^\s*<\?xml[\s\S]{0,400}Open Screenplay Format/.test(f.text) ? osfToFountain(f.text) : f.text;
    const parsed = parseFountain(fountain);
    const tp = Object.keys(parsed.titlePage).length ? parsed.titlePage : { Title: f.name, Credit: 'Written by' };
    const t = String(tp.Title || f.name).replace(/[*_]/g, '');
    const book = { format: 'lutefisk/1', kind: 'screenplay', title: t, author: String(tp.Author || '').split('\n')[0], uuid: crypto.randomUUID(), screenplay: { format: 'feature' }, preview: { device: 'ipad', fontSize: 100, font: '', theme: 'light' }, research: [], goals: {}, sections: [] };
    const data = await B.newBook({ book, contents: { __script: writeFountain(tp, parsed.elements) }, parent: (lib || await B.library()).libraryDir });
    toast(`Imported ${parsed.elements.filter((e) => e.type === 'scene').length} scenes from ${{ fdx: 'Final Draft', osf: 'Fade In', fountain: 'Fountain' }[f.ext] || f.ext.toUpperCase()}`, 'ok');
    if (data) loadBookData(data);
  } catch (err) { toast(clean(err), 'error', 6000); }
}

async function openBook() {
  try { const data = await B.openBook(); if (data) { if (app.book) await save(); loadBookData(data); } } catch (err) { toast(clean(err), 'error', 6000); }
}
async function openRecent(dir) {
  try { loadBookData(await B.openRecent(dir)); } catch (err) { toast(clean(err), 'error', 6000); }
}

// Drag a book folder (or its book.yaml) onto the window to open it.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dropping'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  dragDepth = 0; document.body.classList.remove('dropping');
  const f = e.dataTransfer.files[0];
  if (!f || (app.book && e.target.closest?.('.ProseMirror'))) return;
  try { const data = await B.openDropped(f); if (app.book) await save(); loadBookData(data); } catch (err) { toast(clean(err), 'error', 6000); }
});

/* =============================================================== shell */

function buildShell() {
  els.docTitle = h('div', { class: 'doc-title' });
  els.save = h('div', { class: 'doc-sub', 'aria-live': 'polite' });
  const tbBtn = (ic, label, onClick, extra = {}) => h('button', { class: 'tb-item', title: label, onclick: onClick, ...extra }, icon(ic, 18), h('span', {}, label));
  const exportBtn = h('button', { class: 'btn primary export-btn', onclick: () => popover(exportBtn, [
    { header: 'Export as' },
    { label: 'EPUB', hint: 'E-readers & stores', icon: 'book', onClick: () => doExport('epub') },
    { label: 'PDF', hint: 'Print-ready', icon: 'print', onClick: () => doExport('pdf') },
    { label: 'Word', hint: '.docx', icon: 'doc', onClick: () => doExport('docx') },
    { label: 'Markdown', hint: '.md + images', icon: 'textSize', onClick: () => doExport('md') },
    { label: 'Rich Text', hint: '.rtf', icon: 'doc', onClick: () => doExport('rtf') },
    { label: 'MOBI', hint: 'older Kindles', icon: 'device', onClick: () => doExport('mobi') },
  ], { align: 'right', width: 230 }) }, icon('share', 15), 'Export');

  const titlebar = h('header', { class: 'titlebar drag' },
    h('div', { class: 'tb-left' },
      h('button', { class: 'tb-icon tb-brand', title: 'Lutefisk Library (⇧⌘L)', 'aria-label': 'Library', onclick: showLibrary }, brandMark(22)),
      h('button', { class: 'tb-icon', title: 'Toggle sidebar', 'aria-label': 'Toggle sidebar', onclick: toggleSidebar }, icon('sidebar', 18))),
    h('div', { class: 'tb-doc' }, els.docTitle, els.save),
    h('div', { class: 'tb-right' },
      els.previewBtn = tbBtn('device', 'Preview', () => togglePreview()),
      tbBtn('focus', 'Focus', () => toggleWritingFocus()),
      tbBtn('gear', 'Book', () => openBookSettings(app)),
      tbBtn('palette', 'Design', () => openTemplates(app)),
      tbBtn('cite', 'Sources', () => openBibliography()),
      tbBtn('target', 'Goals', () => openGoals(app, app.goals, sheet)),
      tbBtn('chart', 'Insights', () => openStats(app)),
      h('span', { class: 'tb-sep' }),
      exportBtn));

  els.sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Sections' });
  els.secKind = h('div', { class: 'sec-kind' });
  els.secTitle = h('input', { class: 'sec-title', 'aria-label': 'Section title', placeholder: 'Title', spellcheck: 'true' });
  els.secSub = h('input', { class: 'sec-subtitle', 'aria-label': 'Chapter subtitle', placeholder: 'Subtitle (optional)', spellcheck: 'true', hidden: true });
  els.secSub.addEventListener('input', () => { const s = currentSection(); if (!s || currentScene()) return; if (els.secSub.value.trim()) s.subtitle = els.secSub.value; else delete s.subtitle; app.markDirty(); app.htmlCache?.clear?.(); schedulePreview(); });
  els.secSub.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.editor.focus(); } });
  els.notesBtn = h('button', { class: 'scene-btn notes-btn', title: 'Your notes about this chapter or scene — never printed', onclick: () => toggleNotes() }, icon('doc', 14), els.notesLabel = h('span', {}, 'Notes'));
  els.notesBox = h('div', { class: 'notes-box', hidden: true });
  els.statsBtn = h('button', { class: 'scene-btn stats-btn', title: 'Statistics: dates, writing time, words and language analysis', onclick: () => notesTarget && openStatsFor(notesTarget.id) }, icon('chart', 14), h('span', {}, 'Stats'));
  els.dcSwitch = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': 'Drop cap for this chapter' });
  els.dcRow = h('label', { class: 'dc-chip', title: 'Drop cap at the start of this chapter' }, icon('dropcap', 15), h('span', {}, 'Drop cap'), els.dcSwitch);
  els.headSel = h('select', { class: 'head-sel', 'aria-label': 'Chapter heading for all chapters', title: 'How every chapter is headed' });
  els.headSel.addEventListener('change', () => {
    const v = els.headSel.value;
    if (v === 'title-on' || v === 'title-off') app.book.chapterTitles = v === 'title-on';
    else app.book.chapterNumbering = v;
    syncHeadSel();
    app.markDirty(); app.htmlCache.clear(); refreshSidebar(); app.refreshPreview(true);
    const s = currentSection(); if (s) selectSectionHeader(s);
  });
  els.headRow = h('label', { class: 'dc-chip' }, h('span', {}, 'Heading'), els.headSel);
  els.sceneBtn = h('button', { class: 'scene-btn scenes-menu', title: 'Scenes in this chapter', onclick: () => sceneActions(els.sceneBtn) }, icon('scene', 15), els.sceneBtnLabel = h('span', {}, 'Scenes'), icon('chevron', 12));
  els.dcSwitch.addEventListener('change', () => {
    const s = currentSection();
    if (!s) return;
    if (els.dcSwitch.checked) delete s.dropCap; else s.dropCap = false;
    app.markDirty(); app.htmlCache.clear(); app.refreshPreview(true);
  });
  els.secExtra = h('div', { class: 'sec-extra' });
  els.editorMount = h('div', { class: 'editor-mount' });
  els.genMount = h('div', { class: 'gen-mount', hidden: true });
  els.status = h('span', { class: 'st-words' });
  app.goals = createGoals(app);
  els.goalMeter = goalMeter(app, app.goals, () => openGoals(app, app.goals, sheet));
  els.clock = sessionClock(app, app.goals);
  app.goals.onUpdate = () => { els.goalMeter.draw(); els.clock.draw(); };
  els.zoomLbl = h('button', { class: 'zoom-val', title: 'Actual size (⌘0)', onclick: () => zoom(0) });
  const zoomCtl = h('div', { class: 'zoom-ctl', role: 'group', 'aria-label': 'Text zoom' },
    h('button', { title: 'Zoom out (⌘−)', 'aria-label': 'Zoom out', onclick: () => zoom(-1) }, icon('minus', 14)),
    els.zoomLbl,
    h('button', { title: 'Zoom in (⌘+)', 'aria-label': 'Zoom in', onclick: () => zoom(1) }, icon('plus', 14)));
  applyZoom();
  const editorPane = h('section', { class: 'editor-pane' },
    h('div', { class: 'sec-head' }, h('div', { class: 'sec-kind-row' }, els.secKind, h('div', { class: 'sec-opts' }, els.headRow, els.statsBtn, els.notesBtn, els.sceneBtn)), els.secTitle, els.secSub), els.notesBox, els.secExtra, els.editorMount, els.genMount,
    h('footer', { class: 'statusbar' }, els.status, els.goalMeter.el, els.clock.el, h('span', { class: 'spacer' }), h('button', { class: 'btn small plain focus-exit', onclick: () => toggleWritingFocus(false) }, 'Exit Focus (Esc)'), zoomCtl));

  els.viewSeg = segmented([{ value: 'device', label: 'E-book', icon: 'device' }, { value: 'print', label: 'Print', icon: 'print' }, { value: 'research', label: 'Research', icon: 'pin' }], 'device', (v) => setView(v), { label: 'Preview' });
  els.researchHost = h('div', { class: 'pv-host research-host', hidden: true });
  els.deviceHost = h('div', { class: 'pv-host' });
  els.printHost = h('div', { class: 'pv-host', hidden: true });
  els.focusBtn = h('button', { class: 'chip-toggle focus-btn', title: 'Enlarge preview (⌥⌘F)', 'aria-label': 'Enlarge preview', onclick: () => toggleFocus() }, icon('expand', 15), h('span', {}, 'Enlarge'));
  const previewPane = h('section', { class: 'preview-pane' }, h('div', { class: 'pv-switch' }, h('span', { class: 'pv-switch-side' }), els.viewSeg, h('span', { class: 'pv-switch-side right' }, els.focusBtn)), els.deviceHost, els.printHost, els.researchHost);
  const splitter = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize' });
  els.workspace = h('main', { class: 'workspace' }, els.sidebar, editorPane, splitter, previewPane);
  els.shell = h('div', { class: 'shell' }, titlebar, els.workspace);

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const start = e.clientX;
    const startW = previewPane.getBoundingClientRect().width;
    document.body.classList.add('resizing');
    const move = (ev) => { const w = Math.max(380, Math.min(window.innerWidth - 700, startW - (ev.clientX - start))); els.workspace.style.setProperty('--preview-w', `${w}px`); };
    const up = () => { document.body.classList.remove('resizing'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  els.secTitle.addEventListener('input', () => {
    const node = currentScene() || currentResearch() || currentSection();
    if (!node) return;
    node.title = els.secTitle.value;
    app.markDirty(); refreshSidebar(); if (!currentResearch() && !currentScene()) schedulePreview();
  });
  els.secTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.editor.focus(); } });

  let railFrame = 0;
  const railSoon = () => { cancelAnimationFrame(railFrame); railFrame = requestAnimationFrame(() => { app.comments?.selectionChanged(); app.comments?.update(); }); };
  app.editor = createEditor(els.editorMount, {
    onChange(tr) {
      if (tr.docChanged || tr.selectionSet) railSoon();
      if (tr.docChanged) { pendingSerialize = true; app.goals.activity(); trackActivity(app.currentId); }
      if (writingFocus) requestAnimationFrame(() => app.editor.centerCaret());
      if (currentResearch()) { if (tr.docChanged) { flushSerializeSoon(); } updateStatusSoon(); return; }
      app.previewId = currentSection()?.id || app.currentId; // editing snaps the preview back to the cursor
      schedulePreview(true);
    },
    pickCitation: (attrs) => pickCitation(attrs),
    formatCitation: (ref, loc) => citer(app.book || {})(ref, loc),
    importImage: () => app.importImage(),
    onAssetChanged: () => { app.htmlCache.clear(); app.refreshPreview(true); },
    createComment: (id, quote) => app.comments?.create(id, quote),
    commentsChanged: () => railSoon(),
    deleteComment: (id) => { app.comments?.remove(id); railSoon(); },
    addIndexTerm: (term) => {
      app.book.index ||= { terms: [] };
      if (!app.book.index.terms.includes(term)) app.book.index.terms.push(term);
      enableSection('index');
      app.markDirty();
      toast(`“${term}” added to the index`);
    },
  });
  app.comments = createCommentRail(app, app.editor);
  { const load = app.editor.load.bind(app.editor); app.editor.load = (...a) => { const r = load(...a); railSoon(); return r; }; }
  window.addEventListener('resize', railSoon);

  app.device = createDevicePreview(els.deviceHost, app);
  app.print = createPrintPreview(els.printHost, app);
}

function selectSectionHeader(s) {
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === s.id);
  els.secKind.textContent = s.type === 'chapter' ? (n?.label || 'Chapter (no number)') : SECTION_TYPES[s.type].label;
}

function syncHeadSel() {
  const b = app.book;
  if (!b) return;
  const tplDefault = templateById(b.template).numbering;
  const word = b.chapterWord || 'Chapter';
  els.headSel.replaceChildren(
    h('optgroup', { label: 'Number' },
      h('option', { value: '' }, `Template default (${(CHAPTER_HEADINGS.find(([k]) => k === tplDefault)?.[1] || 'Chapter One').replace(/^Chapter/, word)})`),
      CHAPTER_HEADINGS.map(([k, l]) => h('option', { value: k }, l.replace(/^Chapter/, word)))),
    h('optgroup', { label: 'Chapter titles' },
      h('option', { value: 'title-on' }, `${b.chapterTitles !== false ? '✓ ' : ''}Show chapter titles`),
      h('option', { value: 'title-off' }, `${b.chapterTitles === false ? '✓ ' : ''}Hide chapter titles`)));
  els.headSel.value = b.chapterNumbering || '';
}

let previewHidden = (() => { try { return localStorage.getItem('lutefisk.previewHidden.book') === '1'; } catch { return false; } })();
function applyPreviewHidden() {
  els.workspace.classList.toggle('no-preview', previewHidden);
  els.previewBtn.classList.toggle('on', !previewHidden);
  els.previewBtn.title = previewHidden ? 'Show preview (⌥⌘P)' : 'Hide preview (⌥⌘P)';
}
function togglePreview(force) {
  previewHidden = force != null ? !force : !previewHidden;
  try { localStorage.setItem('lutefisk.previewHidden.book', previewHidden ? '1' : '0'); } catch { /* ignore */ }
  applyPreviewHidden();
  if (!previewHidden) { fullPrint = true; app.device.build(); schedulePreview(false, true); }
}

function toggleFocus(force) {
  const on = force ?? !els.workspace.classList.contains('focus-preview');
  els.workspace.classList.toggle('focus-preview', on);
  els.focusBtn.replaceChildren(icon(on ? 'collapse' : 'expand', 15), h('span', {}, on ? 'Restore' : 'Enlarge'));
  els.focusBtn.title = on ? 'Restore layout (⌥⌘F)' : 'Enlarge preview (⌥⌘F)';
}

function toggleSidebar() {
  els.workspace.classList.toggle('no-sidebar');
}

/* ============================================================= sections */

/** Locate a scene by id → { chapter, scene, index } */
function findScene(id) {
  for (const c of app.book?.sections || []) {
    const i = (c.scenes || []).findIndex((x) => x.id === id);
    if (i >= 0) return { chapter: c, scene: c.scenes[i], index: i };
  }
  return null;
}
const findResearch = (id) => (app.book?.research || []).find((r) => r.id === id);
const currentScene = () => findScene(app.currentId)?.scene || null;
const currentResearch = () => findResearch(app.currentId) || null;
/** The book section being edited (a scene's chapter counts as its section). */
const currentSection = () => app.book?.sections.find((s) => s.id === app.currentId) || findScene(app.currentId)?.chapter || null;
const hasScenes = (s) => Array.isArray(s?.scenes) && s.scenes.length > 0;
function rejoin(chapter) {
  if (!hasScenes(chapter)) return;
  const md = joinScenes(chapter.scenes, app.contents);
  if (md !== app.contents[chapter.id]) { app.contents[chapter.id] = md; app.dirtyFiles.add(chapter.id); }
}
app.sections = () => prepare(app.book);
const enabledSections = () => app.book.sections.filter((s) => s.enabled !== false);

function enableSection(type) {
  const s = app.book.sections.find((x) => x.type === type);
  if (s && s.enabled === false) { s.enabled = true; app.markDirty(); refreshSidebar(); }
}
app.enableSection = enableSection;

const TYPE_ICON = { 'title-page': 'doc', toc: 'ul', bibliography: 'cite', index: 'index', endnotes: 'footnote', 'about-author': 'doc', chapter: 'doc' };

function refreshSidebar() {
  const sb = els.sidebar;
  const book = app.book;
  if (!book) return;
  const numbered = numberSections(book.sections, templateById(book.template), book);
  const label = (s) => {
    const n = numbered.find((x) => x.id === s.id);
    if (s.type === 'chapter') return s.title || n?.label || 'Untitled Chapter';
    return n?.displayTitle || s.title || SECTION_TYPES[s.type]?.label;
  };
  sb.replaceChildren();
  const coverBtn = h('button', { class: 'sb-book', onclick: () => openBookSettings(app, 'cover'), title: 'Book details & cover' },
    h('div', { class: 'sb-cover' }, book.cover ? h('img', { src: assetUrl(book.cover), alt: '' }) : generatedCover(book.title, book.author, fontStack(templateById(book.template).head)), h('div', { class: 'lib-spine' })),
    h('div', { class: 'sb-book-meta' }, h('b', {}, book.title || 'Untitled'), h('span', {}, book.author || 'Add author')));
  sb.append(coverBtn);

  const scroller = h('div', { class: 'sb-scroll' });
  for (const g of GROUPS) {
    const included = book.sections.filter((s) => SECTION_TYPES[s.type]?.group === g.id && (s.enabled !== false || SECTION_TYPES[s.type].multi));
    const available = book.sections.filter((s) => SECTION_TYPES[s.type]?.group === g.id && s.enabled === false && !SECTION_TYPES[s.type].multi);
    const addBtn = h('button', { class: 'sb-add', title: `Add to ${g.label}`, 'aria-label': `Add to ${g.label}` }, icon('plus', 15));
    addBtn.addEventListener('click', () => {
      const items = [];
      if (g.id === 'body') items.push({ label: 'Chapter', icon: 'doc', hint: '⇧⌘N', onClick: () => addSection('chapter') });
      if (g.id === 'back') items.push({ label: 'Appendix', icon: 'doc', onClick: () => addSection('appendix') });
      if (items.length && available.length) items.push('-');
      for (const s of available) items.push({ label: SECTION_TYPES[s.type].label, icon: TYPE_ICON[s.type] || 'doc', hint: SECTION_TYPES[s.type].generated ? 'Automatic' : '', onClick: () => { s.enabled = true; app.markDirty(); selectSection(s.id); } });
      if (!items.length) items.push({ label: 'All sections added', disabled: true });
      popover(addBtn, items, { width: 220 });
    });
    const ul = h('ul', { class: 'sb-list', role: 'listbox', 'aria-label': g.label });
    for (const s of included) {
      const def = SECTION_TYPES[s.type];
      const words = def.generated ? 0 : countWords(app.contents[s.id]);
      const li = h('li', { class: `sb-row${s.id === app.currentId ? ' active' : ''}`, role: 'option', 'aria-selected': String(s.id === app.currentId), draggable: def.multi ? 'true' : null, tabindex: -1 });
      const scenes = hasScenes(s);
      const open = scenes && (app.expanded.has(s.id) || findScene(app.currentId)?.chapter === s);
      const disc = scenes ? h('span', { class: `sb-disc${open ? ' open' : ''}`, role: 'button', 'aria-label': open ? 'Collapse scenes' : 'Expand scenes', onclick: (e) => { e.stopPropagation(); if (open) app.expanded.delete(s.id); else app.expanded.add(s.id); refreshSidebar(); } }, icon('next', 12)) : null;
      if (scenes) li.classList.add('has-scenes');
      const name = h('button', { class: 'sb-name', onclick: () => selectSection(s.id), oncontextmenu: (e) => { e.preventDefault(); rowMenu(name, s); } },
        disc || icon(TYPE_ICON[s.type] || 'doc', 15),
        h('span', { class: 'sb-label' }, label(s)),
        def.generated ? h('span', { class: 'sb-badge' }, 'Auto') : h('span', { class: 'sb-count' }, words ? words.toLocaleString() : ''));
      const more = h('button', { class: 'sb-more', title: 'More', 'aria-label': 'More', onclick: (e) => { e.stopPropagation(); rowMenu(more, s); } }, icon('more', 16));
      li.append(name, more);
      if (def.multi) {
        li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-section', s.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-section')) { e.preventDefault(); li.classList.add('drop'); } });
        li.addEventListener('dragleave', () => li.classList.remove('drop'));
        li.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); li.classList.remove('drop'); reorder(e.dataTransfer.getData('text/x-section'), s.id); });
      }
      ul.append(li);
      if (open) for (const [i, sc] of s.scenes.entries()) ul.append(sceneRow(s, sc, i));
    }
    scroller.append(h('section', { class: 'sb-group' }, h('div', { class: 'sb-head' }, h('span', {}, g.label), addBtn), ul));
  }
  scroller.append(researchGroup());
  sb.append(scroller);
  const total = enabledSections().reduce((n, s) => n + (SECTION_TYPES[s.type].generated ? 0 : countWords(app.contents[s.id])), 0);
  sb.append(h('div', { class: 'sb-foot' }, `${total.toLocaleString()} words`));
  els.docTitle.textContent = book.title || 'Untitled';
  document.title = `${book.title || 'Untitled'} — Lutefisk`;
  updateStatus();
}
app.refreshSidebar = refreshSidebar;

function rowMenu(anchor, s) {
  const def = SECTION_TYPES[s.type];
  const items = [];
  if (!def.generated) items.push({ label: 'Statistics…', icon: 'chart', onClick: () => openStatsFor(s.id) }, '-');
  if (def.multi) {
    items.push({ label: 'Move Up', icon: 'up', onClick: () => moveSection(s.id, -1) }, { label: 'Move Down', icon: 'down', onClick: () => moveSection(s.id, 1) });
    if (s.type === 'chapter') items.push({ label: 'New Chapter After', icon: 'plus', onClick: () => { app.currentId = s.id; addSection('chapter'); } });
    if (SCENE_TYPES.includes(s.type)) {
      items.push('-');
      if (hasScenes(s)) {
        items.push({ label: 'Add Scene', icon: 'plus', onClick: () => addScene(s) });
        items.push({ label: 'Combine Scenes into Chapter', icon: 'doc', onClick: () => combineScenes(s) });
      } else {
        items.push({ label: 'Split into Scenes', icon: 'scene', hint: 'at scene breaks', onClick: () => splitChapter(s) });
        items.push({ label: 'Add Scene', icon: 'plus', onClick: () => addScene(s) });
      }
    }
    items.push('-', { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteSection(s.id) });
  } else {
    items.push({ label: 'Remove from Book', icon: 'minus', onClick: () => { s.enabled = false; app.markDirty(); if (app.currentId === s.id) selectSection(enabledSections().find((x) => x.type === 'chapter')?.id); else refreshSidebar(); schedulePreview(); } });
  }
  popover(anchor, items, { width: 210 });
}

function addSection(type) {
  const s = { id: newId(type.slice(0, 3)), type, enabled: true, title: type === 'chapter' ? '' : 'Appendix', stats: { created: new Date().toISOString(), days: {} } };
  const list = app.book.sections;
  const cur = currentSection();
  let idx;
  const lastOfType = list.map((x) => x.type).lastIndexOf(type);
  if (cur && cur.type === type) idx = list.indexOf(cur) + 1;
  else if (lastOfType >= 0) idx = lastOfType + 1;
  else idx = type === 'chapter' ? list.findIndex((x) => x.type === 'epilogue' || SECTION_TYPES[x.type].group === 'back') : list.findIndex((x) => ['endnotes', 'bibliography', 'index', 'about-author'].includes(x.type));
  if (idx < 0) idx = list.length;
  list.splice(idx, 0, s);
  app.contents[s.id] = '';
  app.dirtyFiles.add(s.id);
  app.markDirty();
  selectSection(s.id);
  els.secTitle.focus();
}

async function deleteSection(id) {
  const s = app.book.sections.find((x) => x.id === id);
  if (s.type === 'chapter' && app.book.sections.filter((x) => x.type === 'chapter').length <= 1) { toast('A book needs at least one chapter.', 'warn'); return; }
  const words = countWords(app.contents[id]);
  if (!(await confirmDialog(`Delete “${s.title || SECTION_TYPES[s.type].label}”?`, `${words.toLocaleString()} words will be moved to the book’s .trash folder.`))) return;
  const i = app.book.sections.indexOf(s);
  app.book.sections.splice(i, 1);
  app.removed.push(id);
  for (const sc of s.scenes || []) { app.removed.push(sc.id); delete app.contents[sc.id]; app.dirtyFiles.delete(sc.id); app.editor.forget(sc.id); }
  delete app.contents[id];
  app.dirtyFiles.delete(id);
  app.editor.forget(id);
  app.markDirty();
  if (app.currentId === id || findScene(app.currentId) === null && !currentResearch() && !app.book.sections.some((x) => x.id === app.currentId)) selectSection((app.book.sections[i] || app.book.sections[i - 1]).id);
  else refreshSidebar();
}

function moveSection(id, dir) {
  const list = app.book.sections;
  const i = list.findIndex((s) => s.id === id);
  const type = list[i].type;
  let j = i + dir;
  while (j >= 0 && j < list.length && list[j].type !== type) j += dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  app.markDirty(); refreshSidebar(); schedulePreview();
}
function reorder(fromId, toId) {
  const list = app.book.sections;
  const from = list.findIndex((s) => s.id === fromId);
  const to = list.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0 || from === to || list[from].type !== list[to].type) return;
  const [s] = list.splice(from, 1);
  list.splice(to, 0, s);
  app.markDirty(); refreshSidebar(); schedulePreview();
}

function selectSection(id, goTo) {
  flushSerialize();
  if (findScene(id)) return selectScene(id);
  if (findResearch(id)) return selectResearch(id);
  const s = app.book.sections.find((x) => x.id === id);
  if (!s) return;
  if (hasScenes(s)) return selectChapterOverview(s, goTo);
  app.currentId = id;
  app.previewId = id;
  app.previewSpecial = null;
  const def = SECTION_TYPES[s.type];
  selectSectionHeader(s);
  els.secTitle.hidden = !!def.generated || ['dedication', 'epigraph', 'copyright'].includes(s.type);
  els.secTitle.value = s.title || '';
  els.secTitle.placeholder = s.type === 'chapter' ? 'Chapter title' : def.label;
  els.dcRow.hidden = !['chapter', 'prologue', 'epilogue'].includes(s.type);
  els.dcSwitch.checked = s.dropCap !== false;
  els.headRow.hidden = s.type !== 'chapter';
  els.sceneBtn.hidden = !SCENE_TYPES.includes(s.type);
  els.sceneBtnLabel.textContent = 'Scenes';
  els.secSub.hidden = !SCENE_TYPES.includes(s.type); els.secSub.value = s.subtitle || '';
  showNotesButton(s);
  syncHeadSel();
  els.secExtra.replaceChildren();
  if (s.type === 'about-author') {
    els.secExtra.append(h('div', { class: 'photo-row' },
      app.book.authorPhoto ? h('img', { src: assetUrl(app.book.authorPhoto), alt: 'Author photo' }) : h('div', { class: 'photo-ph' }, icon('image', 18)),
      h('button', { class: 'btn small', onclick: async () => { const rel = await app.importImage(); if (rel) { app.book.authorPhoto = rel; app.markDirty(); selectSection(id); } } }, app.book.authorPhoto ? 'Replace Photo…' : 'Add Author Photo…'),
      app.book.authorPhoto ? h('button', { class: 'btn small plain', onclick: () => { app.book.authorPhoto = ''; app.markDirty(); selectSection(id); } }, 'Remove') : null));
  }
  if (def.generated) {
    els.editorMount.hidden = true;
    els.genMount.hidden = false;
    els.genMount.replaceChildren(generatedPanel(app, s));
  } else {
    els.genMount.hidden = true;
    els.editorMount.hidden = false;
    app.editor.load(id, app.contents[id] ?? '');
  }
  refreshSidebar();
  pendingGoTo = goTo || 'caret';
  schedulePreview(false, true);
}

/* ================================================================ scenes */

function sceneLabel(sc, i) {
  return sc.title || sceneSnippet(app.contents[sc.id]) || `Scene ${i + 1}`;
}

function sceneRow(chapter, sc, i) {
  const active = sc.id === app.currentId;
  const li = h('li', { class: `sb-row scene${active ? ' active' : ''}`, role: 'option', 'aria-selected': String(active), draggable: 'true', tabindex: -1 });
  const name = h('button', { class: 'sb-name', onclick: () => selectSection(sc.id), oncontextmenu: (e) => { e.preventDefault(); sceneMenu(name, chapter, sc); } },
    icon('scene', 14), h('span', { class: 'sb-label' }, sceneLabel(sc, i)), h('span', { class: 'sb-count' }, countWords(app.contents[sc.id]).toLocaleString()));
  const more = h('button', { class: 'sb-more', title: 'More', 'aria-label': 'More', onclick: (e) => { e.stopPropagation(); sceneMenu(more, chapter, sc); } }, icon('more', 16));
  li.append(name, more);
  li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-scene', sc.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));
  li.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-scene')) { e.preventDefault(); li.classList.add('drop'); } });
  li.addEventListener('dragleave', () => li.classList.remove('drop'));
  li.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); li.classList.remove('drop'); moveSceneTo(e.dataTransfer.getData('text/x-scene'), chapter, chapter.scenes.indexOf(sc)); });
  return li;
}

/** Statistics sheet for a chapter, section or scene. */
function openStatsFor(id) {
  flushSerialize();
  const found = findScene(id);
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  if (found) {
    const chTitle = numbered.find((x) => x.id === found.chapter.id)?.tocTitle || found.chapter.title || 'Chapter';
    openChapterStats(app, sheet, found.scene, { title: `${chTitle} · ${found.scene.title || `Scene ${found.index + 1}`}` });
    return;
  }
  const sec = app.book.sections.find((x) => x.id === id);
  if (!sec) return;
  openChapterStats(app, sheet, sec, { title: numbered.find((x) => x.id === id)?.tocTitle || sec.title || SECTION_TYPES[sec.type]?.label || 'Section', sceneTitles: (sec.scenes || []).map((sc, i) => sc.title || sceneSnippet(app.contents[sc.id], 5) || `Scene ${i + 1}`) });
}

/** Drag a scene card onto another to put it in that position. */
function dragCard(chapter, sc, i, el) {
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-scene', sc.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/x-scene')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    el.classList.toggle('drop-before', !after);
    el.classList.toggle('drop-after', after);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const after = el.classList.contains('drop-after');
    el.classList.remove('drop-before', 'drop-after');
    const id = e.dataTransfer.getData('text/x-scene');
    if (!id || id === sc.id) return;
    moveSceneTo(id, chapter, i + (after ? 1 : 0));
    selectSection(chapter.id);
  });
  return el;
}

function sceneMenu(anchor, chapter, sc) {
  const i = chapter.scenes.indexOf(sc);
  const others = app.book.sections.filter((x) => (x.type === 'chapter' || x.type === 'appendix') && x !== chapter);
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  popover(anchor, [
    { label: 'Scene Statistics…', icon: 'chart', onClick: () => openStatsFor(sc.id) },
    '-',
    { label: 'Add Scene After', icon: 'plus', onClick: () => addScene(chapter, i + 1) },
    { label: 'Move Up', icon: 'up', disabled: i === 0, onClick: () => moveSceneTo(sc.id, chapter, i - 1) },
    { label: 'Move Down', icon: 'down', disabled: i === chapter.scenes.length - 1, onClick: () => moveSceneTo(sc.id, chapter, i + 2) },
    ...(others.length ? ['-', { header: 'Move to' }, ...others.slice(0, 12).map((c) => ({ label: numbered.find((n) => n.id === c.id)?.tocTitle || c.title || 'Chapter', icon: 'doc', onClick: () => moveSceneTo(sc.id, c, (c.scenes || []).length) }))] : []),
    '-',
    { label: 'Delete Scene…', icon: 'trash', danger: true, onClick: () => deleteScene(chapter, sc) },
  ], { width: 240 });
}

/** Turn the chapter's existing text into the first scene(s), then add a new one. */
function ensureScenes(chapter, split) {
  if (hasScenes(chapter)) return;
  flushSerialize();
  const parts = split ? splitAtBreaks(app.contents[chapter.id] || '') : [app.contents[chapter.id] || ''];
  chapter.scenes = parts.map((text) => {
    const sc = { id: newId('sce'), title: '' };
    app.contents[sc.id] = text;
    app.dirtyFiles.add(sc.id);
    return sc;
  });
  app.editor.forget(chapter.id);
}

/* ---- per-chapter / per-scene activity: created, updated, time spent, words per day.
   Stored in book.yaml next to each section so it travels with the book. */
const ACTIVE_GAP = 90000;
const lastEdit = new Map();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function nodeById(id) {
  const sc = findScene(id);
  return sc ? sc.scene : app.book?.sections.find((s) => s.id === id);
}
function statsOf(node, id) {
  node.stats ||= {};
  const st = node.stats;
  if (!st.created) st.created = app.fileTimes?.[id]?.created || new Date().toISOString();
  st.days ||= {};
  return st;
}
function trackActivity(id) {
  const node = id && nodeById(id);
  if (!node) return;
  const st = statsOf(node, id);
  const now = Date.now();
  const prev = lastEdit.get(id) || 0;
  const day = (st.days[today()] ||= { w: 0, s: 0 });
  if (prev && now - prev <= ACTIVE_GAP) { const secs = Math.round((now - prev) / 1000); st.seconds = (st.seconds || 0) + secs; day.s += secs; }
  lastEdit.set(id, now);
  st.updated = new Date(now).toISOString();
  st.edits = (st.edits || 0) + 1;
}
/** Called when an editor's text is written back: records net words for today. */
function trackWords(id) {
  const node = id && nodeById(id);
  if (!node || !node.stats) return;
  const words = countWords(app.contents[id]);
  const st = node.stats;
  if (st.lastWords == null) { st.lastWords = words; return; }
  const delta = words - st.lastWords;
  if (delta) { (st.days[today()] ||= { w: 0, s: 0 }).w += delta; st.lastWords = words; }
}

const SCENE_TYPES = ['chapter', 'prologue', 'epilogue', 'appendix'];

/* Notes: private notes on a chapter or scene (never printed or exported). */
let notesTarget = null;
function showNotesButton(node) {
  notesTarget = node;
  els.statsBtn.hidden = false;
  if (node.synopsis && !node.notes) { node.notes = node.synopsis; app.markDirty(); }
  delete node.synopsis;
  els.notesBtn.hidden = false;
  els.notesBtn.classList.toggle('has', !!node.notes);
  els.notesLabel.textContent = node.notes ? 'Notes •' : 'Notes';
  els.notesBox.hidden = true;
}
function toggleNotes(force) {
  const node = notesTarget;
  if (!node) return;
  const open = force ?? els.notesBox.hidden;
  if (!open) { els.notesBox.hidden = true; return; }
  const ta = h('textarea', { rows: 4, placeholder: 'Ideas, research, reminders, what this needs to do… Only you see these notes.', spellcheck: 'true', 'aria-label': 'Notes' });
  ta.value = node.notes || '';
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(320, Math.max(80, ta.scrollHeight))}px`; };
  ta.addEventListener('input', () => {
    if (ta.value.trim()) node.notes = ta.value; else delete node.notes;
    els.notesBtn.classList.toggle('has', !!node.notes);
    els.notesLabel.textContent = node.notes ? 'Notes •' : 'Notes';
    fit(); app.markDirty();
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); toggleNotes(false); app.editor.focus(); } });
  els.notesBox.replaceChildren(h('div', { class: 'notes-head' }, icon('doc', 14), h('b', {}, 'Notes'), h('span', { class: 'hint' }, 'Private — never printed or exported'), h('button', { class: 'tb-btn', title: 'Close notes', onclick: () => toggleNotes(false) }, icon('close', 14))), ta);
  els.notesBox.hidden = false;
  requestAnimationFrame(() => { fit(); ta.focus(); });
}

/** The scenes popover in the editor header. */
function sceneActions(anchor) {
  const found = findScene(app.currentId);
  const chapter = found?.chapter || currentSection();
  if (!chapter) return;
  const mod = window.lutefisk.platform === 'darwin' ? '⌥⌘' : 'Ctrl+Alt+';
  const items = [];
  if (found) {
    items.push(
      { label: 'New Scene After This', icon: 'plus', hint: `${mod}N`, onClick: () => addScene(chapter, found.index + 1) },
      { label: 'Split Scene at Cursor', icon: 'scene', hint: `${mod}K`, onClick: () => splitAtCursor() },
      '-',
      { label: 'Scene Notes', icon: 'doc', onClick: () => toggleNotes(true) },
      { label: 'Scene Overview', icon: 'cards', onClick: () => selectSection(chapter.id) },
      { label: 'Move Up', icon: 'up', disabled: found.index === 0, onClick: () => moveSceneTo(found.scene.id, chapter, found.index - 1) },
      { label: 'Move Down', icon: 'down', disabled: found.index === chapter.scenes.length - 1, onClick: () => moveSceneTo(found.scene.id, chapter, found.index + 2) },
      '-',
      { label: 'Delete Scene…', icon: 'trash', danger: true, onClick: () => deleteScene(chapter, found.scene) },
    );
  } else if (hasScenes(chapter)) {
    items.push(
      { label: 'Add Scene', icon: 'plus', hint: `${mod}N`, onClick: () => addScene(chapter) },
      { label: 'Combine into One Chapter', icon: 'doc', onClick: () => combineScenes(chapter) },
    );
  } else {
    items.push(
      { header: 'Work on this chapter in scenes' },
      { label: 'Split at Scene Breaks', icon: 'scene', onClick: () => splitChapter(chapter) },
      { label: 'Split at Cursor', icon: 'scene', hint: `${mod}K`, onClick: () => splitAtCursor() },
      { label: 'Add a New Scene', icon: 'plus', hint: `${mod}N`, onClick: () => addScene(chapter) },
    );
  }
  popover(anchor, items);
}

/** ⌥⌘N: a new scene after the current one (or at the end of the chapter). */
function newSceneHere() {
  const found = findScene(app.currentId);
  if (found) return addScene(found.chapter, found.index + 1);
  const s = currentSection();
  if (s && SCENE_TYPES.includes(s.type)) return addScene(s);
  toast('Select a chapter to add a scene to it');
}

/** ⌥⌘K: split the current scene (or chapter) in two at the caret. */
function splitAtCursor() {
  const found = findScene(app.currentId);
  const chapter = found?.chapter || currentSection();
  if (!chapter || !SCENE_TYPES.includes(chapter.type) || (!found && hasScenes(chapter))) { toast('Put the cursor where the new scene should start'); return; }
  flushSerialize();
  const { before, after } = app.editor.splitAtCaret();
  const fresh = { id: newId('sce'), title: '' };
  if (found) {
    app.contents[found.scene.id] = before;
    app.dirtyFiles.add(found.scene.id);
    app.editor.forget(found.scene.id);
    chapter.scenes.splice(found.index + 1, 0, fresh);
  } else {
    const first = { id: newId('sce'), title: '' };
    app.contents[first.id] = before;
    app.dirtyFiles.add(first.id);
    chapter.scenes = [first, fresh];
    app.editor.forget(chapter.id);
  }
  app.contents[fresh.id] = after;
  app.dirtyFiles.add(fresh.id);
  rejoin(chapter);
  app.expanded.add(chapter.id);
  app.markDirty();
  toast(`Split into scene ${chapter.scenes.indexOf(fresh)} and ${chapter.scenes.indexOf(fresh) + 1}`, 'ok');
  selectSection(fresh.id);
}

function splitChapter(chapter) {
  ensureScenes(chapter, true);
  rejoin(chapter);
  app.expanded.add(chapter.id);
  app.markDirty();
  toast(chapter.scenes.length > 1 ? `Split into ${chapter.scenes.length} scenes at the scene breaks` : 'Chapter is now one scene — add more from the sidebar');
  selectSection(chapter.scenes[0].id);
}

function addScene(chapter, at) {
  const wasEmpty = !hasScenes(chapter);
  ensureScenes(chapter, false);
  const sc = { id: newId('sce'), title: '', stats: { created: new Date().toISOString(), days: {} } };
  chapter.scenes.splice(at ?? chapter.scenes.length, 0, sc);
  app.contents[sc.id] = '';
  app.dirtyFiles.add(sc.id);
  rejoin(chapter);
  app.expanded.add(chapter.id);
  app.markDirty();
  if (wasEmpty) toast('Your chapter text is now the first scene');
  selectSection(sc.id);
  els.secTitle.focus();
}

async function deleteScene(chapter, sc) {
  const words = countWords(app.contents[sc.id]);
  if (words && !(await confirmDialog(`Delete “${sceneLabel(sc, chapter.scenes.indexOf(sc))}”?`, `${words.toLocaleString()} words will be moved to the book’s .trash folder.`))) return;
  const i = chapter.scenes.indexOf(sc);
  chapter.scenes.splice(i, 1);
  app.removed.push(sc.id);
  delete app.contents[sc.id];
  app.dirtyFiles.delete(sc.id);
  app.editor.forget(sc.id);
  if (!chapter.scenes.length) delete chapter.scenes;
  else rejoin(chapter);
  if (!hasScenes(chapter)) { app.dirtyFiles.add(chapter.id); }
  app.markDirty();
  selectSection(hasScenes(chapter) ? chapter.scenes[Math.min(i, chapter.scenes.length - 1)].id : chapter.id);
}

function moveSceneTo(sceneId, target, index) {
  const from = findScene(sceneId);
  if (!from) return;
  flushSerialize();
  from.chapter.scenes.splice(from.index, 1);
  if (from.chapter === target && index > from.index) index -= 1;
  if (!hasScenes(target)) ensureScenes(target, false);
  target.scenes.splice(Math.max(0, Math.min(index, target.scenes.length)), 0, from.scene);
  if (!from.chapter.scenes.length) { delete from.chapter.scenes; app.contents[from.chapter.id] = ''; app.dirtyFiles.add(from.chapter.id); }
  rejoin(from.chapter); rejoin(target);
  app.expanded.add(target.id);
  app.markDirty(); app.htmlCache.clear();
  refreshSidebar(); schedulePreview(false, true);
}

function combineScenes(chapter) {
  flushSerialize();
  rejoin(chapter);
  for (const sc of chapter.scenes) { app.removed.push(sc.id); app.dirtyFiles.delete(sc.id); app.editor.forget(sc.id); delete app.contents[sc.id]; }
  delete chapter.scenes;
  app.dirtyFiles.add(chapter.id);
  app.editor.forget(chapter.id);
  app.markDirty();
  toast('Scenes combined into one chapter');
  selectSection(chapter.id);
}

function resetHeaderControls() {
  els.dcRow.hidden = true; els.headRow.hidden = true; els.secTitle.hidden = false; els.sceneBtn.hidden = true;
  els.secSub.hidden = true; els.notesBtn.hidden = true; els.statsBtn.hidden = true; els.notesBox.hidden = true; els.notesBox.replaceChildren();
  els.secExtra.replaceChildren();
}

function selectScene(id) {
  const { chapter, scene, index } = findScene(id);
  app.currentId = id;
  app.previewId = chapter.id;
  app.previewSpecial = null;
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === chapter.id);
  resetHeaderControls();
  els.secKind.textContent = `${n?.tocTitle || chapter.title || 'Chapter'} · Scene ${index + 1} of ${chapter.scenes.length}`;
  els.secTitle.value = scene.title || '';
  els.secTitle.placeholder = 'Scene title (for you — not printed)';
  els.dcRow.hidden = index !== 0;
  els.dcSwitch.checked = chapter.dropCap !== false;
  els.sceneBtn.hidden = false;
  els.sceneBtnLabel.textContent = `Scene ${index + 1} of ${chapter.scenes.length}`;
  showNotesButton(scene);
  els.genMount.hidden = true;
  els.editorMount.hidden = false;
  app.editor.load(id, app.contents[id] ?? '');
  app.expanded.add(chapter.id);
  refreshSidebar();
  pendingGoTo = 'caret';
  schedulePreview(false, true);
}

function selectChapterOverview(chapter, goTo) {
  app.currentId = chapter.id;
  app.previewId = chapter.id;
  app.previewSpecial = null;
  resetHeaderControls();
  selectSectionHeader(chapter);
  els.secTitle.value = chapter.title || '';
  els.secTitle.placeholder = 'Chapter title';
  els.headRow.hidden = chapter.type !== 'chapter';
  els.dcRow.hidden = false;
  els.dcSwitch.checked = chapter.dropCap !== false;
  els.sceneBtn.hidden = false;
  els.sceneBtnLabel.textContent = `${chapter.scenes.length} Scene${chapter.scenes.length === 1 ? '' : 's'}`;
  els.secSub.hidden = false; els.secSub.value = chapter.subtitle || '';
  showNotesButton(chapter);
  syncHeadSel();
  els.editorMount.hidden = true;
  els.genMount.hidden = false;
  const cards = h('div', { class: 'scene-cards' }, chapter.scenes.map((sc, i) => dragCard(chapter, sc, i, h('button', { class: 'scene-card', draggable: 'true', title: 'Click to open · drag to reorder', onclick: () => selectSection(sc.id), oncontextmenu: (e) => { e.preventDefault(); sceneMenu(e.currentTarget, chapter, sc); } },
    h('div', { class: 'sc-num' }, `Scene ${i + 1}`),
    h('b', {}, sc.title || 'Untitled scene'),
    h('p', {}, sceneSnippet(app.contents[sc.id], 28) || 'Empty'),
    sc.notes ? h('span', { class: 'sc-note', title: sc.notes }, icon('doc', 12), 'Notes') : null,
    h('small', {}, `${countWords(app.contents[sc.id]).toLocaleString()} words`)))),
  h('button', { class: 'scene-card add', onclick: () => addScene(chapter) }, icon('plus', 22), h('span', {}, 'Add Scene')));
  els.genMount.replaceChildren(h('div', { class: 'gen-panel wide' },
    h('p', { class: 'hint' }, 'This chapter is made of scenes. In the book they are joined with scene breaks. Drag the cards here — or the scenes in the sidebar — to change their order, or drag a scene in the sidebar onto another chapter to move it.'),
    cards,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => combineScenes(chapter) }, 'Combine into One Chapter'))));
  app.expanded.add(chapter.id);
  refreshSidebar();
  pendingGoTo = goTo || 'start';
  schedulePreview(false, true);
}

/* ============================================================== research */

function researchGroup() {
  const items = app.book.research || [];
  const addBtn = h('button', { class: 'sb-add', title: 'Add research', 'aria-label': 'Add research' }, icon('plus', 15));
  addBtn.addEventListener('click', () => popover(addBtn, [
    { label: 'New Note', icon: 'doc', onClick: () => addResearch('note') },
    { label: 'New Character', icon: 'person', onClick: () => addResearch('character') },
    { label: 'New Place', icon: 'pin', onClick: () => addResearch('place') },
    { label: 'Web Link…', icon: 'link', onClick: async () => { const l = await promptLink(); if (l) addResearch('link', l); } },
    '-',
    { label: 'Import Files…', icon: 'folder', hint: 'Images, PDFs, docs', onClick: () => importResearch() },
  ], { width: 230 }));
  const ul = h('ul', { class: 'sb-list', role: 'listbox', 'aria-label': 'Research' });
  for (const r of items) {
    const active = r.id === app.currentId;
    const li = h('li', { class: `sb-row${active ? ' active' : ''}${r.id === app.pinnedId ? ' pinned' : ''}`, role: 'option', 'aria-selected': String(active), draggable: 'true', tabindex: -1 });
    const name = h('button', { class: 'sb-name', onclick: () => selectSection(r.id), oncontextmenu: (e) => { e.preventDefault(); researchMenu(name, r); } },
      icon(RESEARCH_ICON[r.kind] || 'doc', 15), h('span', { class: 'sb-label' }, r.title || 'Untitled'),
      r.id === app.pinnedId ? h('span', { class: 'sb-badge' }, 'Beside') : h('span', { class: 'sb-count' }, isTextItem(r) ? (countWords(app.contents[r.id]) || '').toLocaleString() : ''));
    const more = h('button', { class: 'sb-more', title: 'More', 'aria-label': 'More', onclick: (e) => { e.stopPropagation(); researchMenu(more, r); } }, icon('more', 16));
    li.append(name, more);
    li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-research', r.id); li.classList.add('dragging'); });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-research')) { e.preventDefault(); li.classList.add('drop'); } });
    li.addEventListener('dragleave', () => li.classList.remove('drop'));
    li.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation(); li.classList.remove('drop');
      const list = app.book.research; const from = list.findIndex((x) => x.id === e.dataTransfer.getData('text/x-research')); const to = list.indexOf(r);
      if (from >= 0 && to >= 0 && from !== to) { const [m] = list.splice(from, 1); list.splice(to, 0, m); app.markDirty(); refreshSidebar(); }
    });
    ul.append(li);
  }
  if (!items.length) ul.append(h('li', { class: 'sb-empty' }, 'Notes, characters, places, links and files for your book. Never exported.'));
  return h('section', { class: 'sb-group research' }, h('div', { class: 'sb-head' }, h('span', {}, 'Research'), addBtn), ul);
}

function researchMenu(anchor, r) {
  popover(anchor, [
    { label: 'Open Beside Editor', icon: 'pin', onClick: () => pinResearch(r.id) },
    ...(r.kind === 'link' ? [{ label: 'Open in Browser', icon: 'share', onClick: () => B.openExternal(r.url).catch(() => toast('Invalid web address', 'warn')) }] : []),
    ...(r.file ? [{ label: 'Open with Default App', icon: 'folder', onClick: () => B.openResearchFile(r.file).catch((err) => toast(clean(err), 'error')) }] : []),
    '-',
    { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteResearch(r) },
  ], { width: 230 });
}

function addResearch(kind, extra = {}) {
  flushSerialize();
  const { item, text } = newResearchItem(kind, extra);
  app.book.research.push(item);
  if (isTextItem(item)) { app.contents[item.id] = text; app.dirtyNotes.add(item.id); }
  app.markDirty();
  selectSection(item.id);
  if (isTextItem(item)) { els.secTitle.focus(); els.secTitle.select(); }
}

async function importResearch() {
  let res;
  try { res = await B.importResearch(); } catch (err) { toast(clean(err), 'error', 6000); return; }
  if (!res?.length) return;
  let last;
  for (const r of res) {
    if (r.kind === 'note') { const { item } = newResearchItem('note', { title: r.title }); app.book.research.push(item); app.contents[item.id] = r.text; app.dirtyNotes.add(item.id); last = item; }
    else { const item = { id: newId('res'), kind: r.kind, title: r.title, file: r.file, size: r.size }; app.book.research.push(item); last = item; }
  }
  app.markDirty();
  toast(`Added ${res.length} item${res.length === 1 ? '' : 's'} to Research`, 'ok');
  selectSection(last.id);
}

async function deleteResearch(r) {
  if (!(await confirmDialog(`Delete “${r.title}”?`, isTextItem(r) ? 'The note will be moved to the book’s .trash folder.' : 'It will be removed from Research. The file stays in the book’s research folder.'))) return;
  app.book.research = app.book.research.filter((x) => x !== r);
  if (isTextItem(r)) { app.removedNotes.push(r.id); app.dirtyNotes.delete(r.id); delete app.contents[r.id]; app.editor.forget(r.id); }
  if (app.pinnedId === r.id) app.pinnedId = null;
  app.markDirty();
  if (app.currentId === r.id) selectSection(app.book.sections.find((x) => x.type === 'chapter').id);
  else { refreshSidebar(); if (app.view === 'research') drawResearchView(); }
}

function pinResearch(id) {
  app.pinnedId = id;
  refreshSidebar();
  setView('research');
}

function selectResearch(id) {
  const r = findResearch(id);
  app.currentId = id;
  resetHeaderControls();
  els.secKind.textContent = `Research · ${RESEARCH_LABEL[r.kind] || 'Item'}`;
  els.secTitle.value = r.title || '';
  els.secTitle.placeholder = 'Title';
  if (isTextItem(r)) {
    els.genMount.hidden = true;
    els.editorMount.hidden = false;
    app.editor.load(id, app.contents[id] ?? '');
  } else {
    els.editorMount.hidden = true;
    els.genMount.hidden = false;
    els.genMount.replaceChildren(researchPanel(app, r));
  }
  refreshSidebar();
  updateStatus();
}

function drawResearchView() {
  const items = app.book.research || [];
  const pinned = findResearch(app.pinnedId) || null;
  const sel = h('select', { 'aria-label': 'Research item' }, h('option', { value: '' }, items.length ? 'Choose research…' : 'No research yet'),
    items.map((r) => h('option', { value: r.id }, `${RESEARCH_LABEL[r.kind]}: ${r.title}`)));
  sel.value = pinned?.id || '';
  sel.addEventListener('change', () => { app.pinnedId = sel.value || null; refreshSidebar(); drawResearchView(); });
  els.researchHost.replaceChildren(h('div', { class: 'pv-bar' }, h('label', { class: 'pv-ctl' }, icon('pin', 15), sel),
    h('span', { class: 'spacer' }), pinned && isTextItem(pinned) ? h('button', { class: 'btn small', onclick: () => selectSection(pinned.id) }, 'Edit') : null),
  h('div', { class: 'ref-scroll' }, researchReference(app, pinned)));
}

/* ============================================================== citations */

function pickCitation(attrs) {
  return new Promise((resolve) => {
    const style = app.book.citationStyle || 'apa';
    const entries = [...(app.book.bibliography || [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    let chosen = attrs?.ref || entries[0]?.id || null;
    const search = h('input', { type: 'text', placeholder: 'Search sources…', 'aria-label': 'Search sources' });
    const locator = h('input', { type: 'text', placeholder: 'e.g. 12 or 12–14 (optional)', 'aria-label': 'Page' });
    locator.value = attrs?.locator || '';
    const list = h('div', { class: 'cite-list', role: 'listbox' });
    const sample = h('div', { class: 'cite-sample' });
    const cite = citer(app.book);
    const draw = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren(...entries.filter((e) => !q || JSON.stringify([e.title, e.authors, e.container, e.date]).toLowerCase().includes(q)).map((e) => {
        const row = h('button', { type: 'button', class: `cite-row${e.id === chosen ? ' on' : ''}`, role: 'option', 'aria-selected': String(e.id === chosen), onclick: () => { chosen = e.id; draw(); }, ondblclick: () => finish() });
        row.innerHTML = '';
        const div = h('div', { class: 'cite-full' });
        div.innerHTML = formatEntry(e, style); // escaped by formatEntry
        row.append(div);
        return row;
      }));
      if (!entries.length) list.append(h('p', { class: 'hint' }, 'Your bibliography is empty. Add sources first — paste a link in Sources.'));
      sample.textContent = chosen ? `Will appear as: ${cite(chosen, locator.value.trim())}` : '';
    };
    search.addEventListener('input', draw);
    locator.addEventListener('input', draw);
    const finish = () => { if (!chosen) return; done({ ref: chosen, locator: locator.value.trim() }); };
    const done = (v) => { overlay.remove(); resolve(v); };
    const form = h('form', { class: 'dlg-form', onsubmit: (e) => { e.preventDefault(); finish(); } },
      search, list,
      h('label', { class: 'fld' }, h('span', {}, style === 'mla' ? 'Page' : 'Page or location'), locator),
      sample,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn plain', style: { marginRight: 'auto' }, onclick: () => { done(undefined); openBibliography(); } }, 'Add New Source…'),
        attrs ? h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, 'Remove') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => done(undefined) }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn primary', disabled: !entries.length }, attrs ? 'Update' : 'Insert Citation')));
    const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(undefined); } } },
      h('div', { class: 'dlg wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Insert citation' }, h('h2', {}, attrs ? 'Edit Citation' : 'Insert Citation'), form));
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    draw();
    search.focus();
  });
}

/* ============================================================ focus mode */

let writingFocus = false;
function toggleWritingFocus(force) {
  writingFocus = force ?? !writingFocus;
  els.shell.classList.toggle('writing-focus', writingFocus);
  if (writingFocus) {
    if (els.editorMount.hidden) { const ch = currentSection(); if (ch && hasScenes(ch)) selectSection(ch.scenes[0].id); }
    app.editor.focus();
    requestAnimationFrame(() => app.editor.centerCaret());
    toast('Focus mode — press Esc to exit', 'info', 1800);
  } else { schedulePreview(false, true); }
}

/* ===================================================== preview position */

// The preview can browse the whole book: front cover → every section → end.
app.previewSpecial = null; // 'cover' | 'end' | null
app.hasPrevSection = () => true;
app.hasNextSection = () => true;
app.previewStep = (dir) => {
  const list = app.sections();
  if (app.previewSpecial === 'cover') { if (dir > 0) { app.previewSpecial = null; app.previewId = list[0]?.id; pendingGoTo = 'start'; schedulePreview(); } return; }
  if (app.previewSpecial === 'end') { if (dir < 0) { app.previewSpecial = null; app.previewId = list[list.length - 1]?.id; pendingGoTo = 'end'; schedulePreview(); } return; }
  const i = list.findIndex((s) => s.id === app.previewId);
  const t = list[i + dir];
  if (t) { app.previewId = t.id; pendingGoTo = dir > 0 ? 'start' : 'end'; }
  else app.previewSpecial = dir < 0 ? 'cover' : 'end';
  schedulePreview();
};
app.previewJump = (where) => {
  const list = app.sections();
  app.previewSpecial = where === 'cover' || where === 'end' ? where : null;
  if (where === 'first') { app.previewId = list[0]?.id; pendingGoTo = 'start'; }
  schedulePreview();
};
app.gotoSection = (dir) => app.previewStep(dir);

/* ============================================================== preview */

let pendingSerialize = false;
let pendingGoTo = null;
let frame = 0;
let fullPrint = false;
let followCaret = false;

function flushSerialize() {
  if (!pendingSerialize || !app.currentId) return;
  pendingSerialize = false;
  const md = app.editor.markdown();
  if (md === app.contents[app.currentId]) return;
  app.contents[app.currentId] = md;
  if (currentResearch()) app.dirtyNotes.add(app.currentId);
  else {
    app.dirtyFiles.add(app.currentId);
    trackWords(app.currentId);
    const sc = findScene(app.currentId);
    if (sc) rejoin(sc.chapter);
  }
  app.markDirty();
}
const flushSerializeSoon = debounce(() => { flushSerialize(); }, 400);

/** Render section HTML (cached per section + context). */
app.renderSectionHtml = (sec, extra = {}) => {
  const key = JSON.stringify([app.book.notesPlacement, extra.tocPages || null, extra.indexPages || null, sec.label, sec.displayTitle, sec.tocTitle]);
  const src = app.contents[sec.id] ?? '';
  const generated = SECTION_TYPES[sec.type]?.generated || sec.type === 'about-author' || sec.type === 'copyright';
  const c = app.htmlCache.get(sec.id);
  if (!generated && c && c.src === src && c.key === key) return c.html;
  const r = renderSection(sec, {
    book: app.book, contents: app.contents, assetUrl, sections: app.sections(),
    tocPages: extra.tocPages || null, indexPages: extra.indexPages || null,
    allNotes: sec.type === 'endnotes' ? collectNotes() : [],
  });
  if (!generated) app.htmlCache.set(sec.id, { src, key, html: r.html });
  return r.html;
};
function collectNotes() {
  if (app.book.notesPlacement !== 'book') return [];
  return app.sections().filter((s) => !SECTION_TYPES[s.type]?.generated).map((s) => ({ id: s.id, title: s.tocTitle, notes: renderSection(s, { book: app.book, contents: app.contents, assetUrl }).notes }));
}

function schedulePreview(fromEditor = false, jump = false) {
  if (jump) pendingGoTo ||= 'caret';
  if (fromEditor) { followCaret = true; app.previewSpecial = null; }
  updateStatusSoon();
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; renderPreview(); });
}
app.refreshPreview = (full = false) => { if (full) fullPrint = true; app.htmlCache.clear(); app.editor?.refreshCitations(); if (app.view === 'research') drawResearchView(); schedulePreview(false, true); };
app.refreshPreviewSoon = debounce(() => app.refreshPreview(), 250);
app.refreshAll = () => { app.htmlCache.clear(); refreshSidebar(); app.device.build(); fullPrint = true; schedulePreview(false, true); };

function renderPreview() {
  if (!app.book) return;
  flushSerialize();
  if (previewHidden) return;
  const sections = app.sections();
  const tpl = templateById(app.book.template);
  let sec = sections.find((s) => s.id === app.previewId);
  const cur = currentSection();
  let excluded = false;
  if (!sec && app.previewId === app.currentId && cur) {
    excluded = true;
    sec = numberSections([{ ...cur, enabled: true }], tpl, app.book)[0];
  }
  if (!sec) { sec = sections[0]; app.previewId = sec?.id; }
  if (!sec) return;
  const scHere = findScene(app.currentId);
  const editingHere = (sec.id === app.currentId || scHere?.chapter.id === sec.id) && !SECTION_TYPES[sec.type]?.generated && !excluded && !currentResearch();
  let caret = editingHere && (followCaret || pendingGoTo === 'caret') ? app.editor.caret() : null;
  if (caret && scHere) {
    // Blocks before this scene: earlier scenes plus one scene break each.
    let offset = 0;
    for (const prev of scHere.chapter.scenes.slice(0, scHere.index)) if ((app.contents[prev.id] || '').trim()) offset += countBlocks(app.contents[prev.id]) + 1;
    caret = { ...caret, index: caret.index + offset };
  }
  const goTo = pendingGoTo;
  pendingGoTo = null;
  followCaret = false;
  els.deviceHost.classList.toggle('excluded', excluded);
  els.printHost.classList.toggle('excluded', excluded);

  if (app.view === 'research') { drawResearchView(); return; }
  if (app.view === 'device') {
    let before = 0, total = 0, chars = 0;
    for (const s of sections) {
      const n = (app.contents[s.id] || '').length + 400;
      if (s.id === sec.id) { before = total; chars = n; }
      total += n;
    }
    const idx = sections.findIndex((s) => s.id === sec.id);
    app.device.render({
      html: app.renderSectionHtml(sec), sectionTitle: sec.tocTitle, bookTitle: app.book.title || '', before, chars, total,
      special: app.previewSpecial, sectionIndex: idx, sectionCount: sections.length,
      goTo: goTo === 'end' ? 'end' : goTo === 'start' ? 'start' : null,
    }, caret);
  } else {
    app.print.update(sec.id, caret, { full: fullPrint, jump: !!goTo && goTo !== 'start' && goTo !== 'end' ? true : !!goTo, edge: goTo });
    fullPrint = false;
  }
}

function setView(v) {
  app.view = v;
  els.viewSeg.setValue(v);
  els.deviceHost.hidden = v !== 'device';
  els.printHost.hidden = v !== 'print';
  els.researchHost.hidden = v !== 'research';
  if (v === 'print') fullPrint = true;
  schedulePreview(false, true);
}
app.printPageCount = () => app.print.pageCount;

/* ============================================================ status bar */

function updateStatus() {
  if (!app.book || !els.status) return;
  const r = currentResearch();
  if (r) {
    els.status.textContent = isTextItem(r) ? `${countWords(app.editor.view.state.doc.textContent).toLocaleString()} words · research (not in book)` : `${RESEARCH_LABEL[r.kind]} · research (not in book)`;
    return;
  }
  const sc = findScene(app.currentId);
  if (sc) {
    const here = countWords(app.editor.view.state.doc.textContent);
    els.status.textContent = `${here.toLocaleString()} words in scene · ${countWords(app.contents[sc.chapter.id]).toLocaleString()} in chapter`;
    return;
  }
  const s = currentSection();
  const book = enabledSections().reduce((n, x) => n + (SECTION_TYPES[x.type].generated ? 0 : countWords(x.id === app.currentId && pendingSerialize ? '' : app.contents[x.id])), 0);
  if (!s || SECTION_TYPES[s.type].generated || hasScenes(s)) { els.status.textContent = `${book.toLocaleString()} words in book`; return; }
  const here = countWords(app.editor.view.state.doc.textContent);
  els.status.textContent = `${here.toLocaleString()} words · ${(book - (pendingSerialize ? 0 : countWords(app.contents[s.id])) + here).toLocaleString()} in book`;
}
const updateStatusSoon = debounce(updateStatus, 300);

/* ========================================================== persistence */

const autosave = debounce(() => save(), 900);
function setSaveState(text, cls) { els.save.textContent = text; els.save.className = `doc-sub ${cls}`; }
app.markDirty = () => {
  app.metaDirty = true;
  setSaveState('Edited', 'pending');
  autosave();
};

let saving = null;
async function save() {
  if (!app.book) return;
  flushSerialize();
  if (saving) await saving;
  if (!app.metaDirty && !app.dirtyFiles.size && !app.removed.length && !app.dirtyNotes.size && !app.removedNotes.length) return;
  const files = {};
  for (const id of app.dirtyFiles) files[id] = app.contents[id] ?? '';
  const notes = {};
  for (const id of app.dirtyNotes) notes[id] = app.contents[id] ?? '';
  const removed = [...app.removed];
  const removedNotes = [...app.removedNotes];
  app.dirtyFiles.clear(); app.removed = []; app.metaDirty = false; app.dirtyNotes.clear(); app.removedNotes = [];
  saving = B.saveBook({ book: plainBook(), files, removed, notes, removedNotes })
    .then(() => { setSaveState('Saved', 'ok'); app.goals.measured(); })
    .catch((err) => {
      for (const id of Object.keys(files)) app.dirtyFiles.add(id);
      for (const id of Object.keys(notes)) app.dirtyNotes.add(id);
      app.removed.push(...removed); app.removedNotes.push(...removedNotes); app.metaDirty = true;
      setSaveState('Not saved', 'err');
      toast(`Couldn’t save: ${clean(err)}`, 'error', 6000);
    })
    .finally(() => { saving = null; });
  return saving;
}
const plainBook = () => JSON.parse(JSON.stringify(app.book));

app.importImage = async () => {
  try { return await B.importImage(); } catch (err) { toast(clean(err), 'error'); return null; }
};

function loadBookData(data) {
  if (!data) return;
  if (data.book?.kind === 'screenplay') {
    app.book = null;
    mode = 'screenplay';
    screenplay.open(data);
    return;
  }
  mode = 'book';
  const book = data.book;
  const d = defaultBook();
  for (const k of Object.keys(d)) if (book[k] === undefined) book[k] = d[k];
  book.print = { ...d.print, ...(book.print || {}) };
  book.preview = { ...d.preview, ...(book.preview || {}) };
  book.uuid ||= crypto.randomUUID();
  ensureSections(book);
  book.research = Array.isArray(book.research) ? book.research : [];
  setCustomTemplates(book.customTemplates);
  app.book = book;
  app.contents = data.contents || {};
  app.fileTimes = data.fileTimes || {};
  app.dirtyNotes = new Set();
  app.removedNotes = [];
  app.expanded = new Set();
  app.pinnedId = null;
  for (const s of book.sections) if (hasScenes(s)) for (const sc of s.scenes) app.contents[sc.id] ??= '';
  for (const r of book.research) if (isTextItem(r)) app.contents[r.id] ??= '';
  for (const s of book.sections) if (!(s.id in app.contents)) app.contents[s.id] = DEFAULT_CONTENT[s.type] || '';
  app.dirtyFiles = new Set(book.sections.filter((s) => !(s.id in (data.contents || {}))).map((s) => s.id));
  for (const s of book.sections) rejoin(s);
  app.removed = [];
  app.htmlCache.clear();
  app.previewSpecial = null;
  app.editor.reset();
  root.replaceChildren(els.shell);
  applyPreviewHidden();
  app.device.build();
  app.print.init();
  const first = book.sections.find((s) => s.type === 'chapter') || book.sections[0];
  selectSection(first.id);
  setView('device');
  setSaveState('Saved', 'ok');
  if (app.dirtyFiles.size) app.markDirty();
  requestAnimationFrame(() => app.editor.focus());
  app.goals.load();
}

/* =============================================================== export */

async function doExport(kind) {
  if (!app.book) return;
  await save();
  try {
    let out;
    if (kind === 'pdf') {
      const prev = app.view;
      if (prev !== 'print') setView('print');
      out = await app.print.exportPdf();
      if (prev !== 'print') setView(prev);
    } else {
      toast(`Preparing ${({ epub: 'EPUB', docx: 'Word document', md: 'Markdown', rtf: 'RTF', mobi: 'MOBI' })[kind]}…`);
      out = await ({ epub: B.exportEpub, docx: B.exportDocx, md: B.exportMarkdown, rtf: B.exportRtf, mobi: B.exportMobi })[kind]({ book: plainBook(), contents: { ...app.contents } });
    }
    if (out) toast(`Exported ${out.split(/[\\/]/).pop()}`, 'ok', 4000);
  } catch (err) { toast(`Export failed: ${clean(err)}`, 'error', 7000); }
}

function openBibliography() {
  const s = app.book.sections.find((x) => x.type === 'bibliography');
  if (s) { s.enabled = true; app.markDirty(); selectSection(s.id); }
}

/* ================================================================= menu */

B.onMenu(async (cmd) => {
  if (mode === 'screenplay' && !['new-book', 'open-book', 'library', 'import-screenplay', 'zoom-in', 'zoom-out', 'zoom-reset', 'toggle-sidebar', 'flush-and-close', 'new-chapter'].includes(cmd)) return screenplay.menu(cmd);
  switch (cmd) {
    case 'import-screenplay': return importScreenplay();
    case 'help-screenplay': return openScreenplayGuide(sheet);
    case 'new-book': await showLibrary(); return newBookSheet(await B.library());
    case 'open-book': return openBook();
    case 'library': return showLibrary();
    case 'save': if (app.book) { await save(); toast('Saved', 'ok', 1200); } return undefined;
    case 'new-chapter': return app.book && addSection('chapter');
    case 'new-scene': return app.book && newSceneHere();
    case 'split-scene': return app.book && splitAtCursor();
    case 'export-epub': return doExport('epub');
    case 'export-pdf': return doExport('pdf');
    case 'export-docx': return doExport('docx');
    case 'export-md': return doExport('md');
    case 'export-rtf': return doExport('rtf');
    case 'export-mobi': return doExport('mobi');
    case 'reveal': return app.book && B.revealBook();
    case 'view-device': if (app.book) { togglePreview(true); setView('device'); } return undefined;
    case 'view-print': if (app.book) { togglePreview(true); setView('print'); } return undefined;
    case 'view-stats': return app.book && openStats(app);
    case 'zoom-in': return zoom(1);
    case 'zoom-out': return zoom(-1);
    case 'zoom-reset': return zoom(0);
    case 'toggle-sidebar': return app.book && toggleSidebar();
    case 'toggle-preview': return app.book && togglePreview();
    case 'focus-mode': return app.book && toggleWritingFocus();
    case 'flush-and-close': try { if (mode === 'screenplay') await screenplay.close(); await save(); if (app.book) { app.goals.measured(true); app.goals.archiveSession(); await app.goals.flush(); } } finally { B.closeReady(); } return undefined;
    default: return undefined;
  }
});

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mode === 'screenplay') {
    if (mod && e.key === 's') { e.preventDefault(); screenplay.save(); }
    if (e.key === 'Escape' && screenplay.focus && !document.querySelector('.overlay, .popover')) { e.preventDefault(); screenplay.toggleFocus(false); }
    if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); screenplay.toggleFocus(); }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1); }
    if (mod && e.key === '-') { e.preventDefault(); zoom(-1); }
    if (mod && e.key === '0') { e.preventDefault(); zoom(0); }
    return;
  }
  if (mod && e.key === 's') { e.preventDefault(); save(); }
  if (e.key === 'Escape' && writingFocus && !document.querySelector('.overlay, .popover')) { e.preventDefault(); toggleWritingFocus(false); }
  if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F') && app.book) { e.preventDefault(); toggleWritingFocus(); }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1); }
  if (mod && e.key === '-') { e.preventDefault(); zoom(-1); }
  if (mod && e.key === '0') { e.preventDefault(); zoom(0); }
  if (mod && e.altKey && (e.key === 'f' || e.key === 'ƒ' || e.code === 'KeyF') && app.book) { e.preventDefault(); toggleFocus(); }
});

// Log progress when the window loses focus, so history survives crashes.
window.addEventListener('blur', () => { if (app.book) { app.goals.measured(); app.goals.flush(); } });

/* ================================================================= boot */

buildShell();
showLibrary();
