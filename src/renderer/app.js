// Lutefisk renderer: library, application shell, section management, live
// preview wiring, autosave and exports.
import {
  h, icon, dialog, toast, confirmDialog, debounce, assetUrl, popover, closePopovers, segmented, generatedCover, timeAgo, brandMark, installTooltips, rangeBubble,
} from './ui.js';
import { createEditor } from './editor.js';
import { createDevicePreview } from './preview-device.js';
import { createPrintPreview } from './preview-print.js';
import { openBookSettings, openTemplates, openStats, generatedPanel, sheet, allTemplates, applyTemplate } from './panels.js';
import { openTemplateEditor } from './template-editor.js';
import { titleCheckButton, recaseAll } from './title-check.js';
import { bookTitleStyle } from '../shared/titlecase.js';
import { openHelp, startTour, resumeTour } from './help.js';
import { openLogline, openSnippets, pickSnippet, snippetRail, openTodos, overdueCount } from './notebook.js';
import { toBin, binCount, openRecycleBin } from './bin.js';
import { STYLES as CITE_STYLES } from '../shared/citations.js';
import { createGoals, goalMeter, openGoals, stopwatchControl, sessionPopover, applyGoalReset } from './goals.js';
import { openInsights } from './history.js';
import { openCharacters, suggestNames } from './characters.js';
import { openPlot } from './plot.js';
import { createSearch } from './search.js';
import { replaceInMarkdown } from './editor.js';
import { loadSettings, settings, autosaver, openSettings, backupProject, backupDialog, themeButton, onSettings, addDictionaryWord } from './settings.js';
import { setDictionary, warmUp } from './spellcheck.js';
import { countMentions } from '../shared/characters.js';
import { createCommentRail } from './comments.js';
import {
  GROUPS, SECTION_TYPES, DEFAULT_CONTENT, defaultBook, ensureSections, newId, numberSections, aboutAuthorsLabel, CHAPTER_HEADINGS, syncAuthors,
} from '../shared/sections.js';
import { renderSection, prepare, citer } from '../shared/bookhtml.js';
import { TRIMS } from '../shared/print.js';
import { joinScenes, splitAtBreaks, countBlocks, sceneSnippet, proseText } from '../shared/scenes.js';
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
let mode = 'library'; // 'library' | 'book'
const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const countWords = (t) => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;

/* ================================================================ zoom */

const ZOOMS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300];
const ZMIN = 25, ZMAX = 300;
let editorZoom = (() => { try { return Math.min(ZMAX, Math.max(ZMIN, Number(localStorage.getItem('lutefisk.editorZoom')) || 110)); } catch { return 110; } })();
function applyZoom() {
  document.documentElement.style.setProperty('--editor-zoom', String(editorZoom / 100));
  if (els.zoomRange && Number(els.zoomRange.value) !== editorZoom) { els.zoomRange.value = String(editorZoom); els.zoomBubble?.(); }
  try { localStorage.setItem('lutefisk.editorZoom', String(editorZoom)); } catch { /* storage unavailable */ }
}
function zoom(dir) {
  if (dir === 0) editorZoom = 100;
  else if (!ZOOMS.includes(editorZoom)) editorZoom = Math.max(ZMIN, Math.min(ZMAX, editorZoom + dir * 10));
  else {
    const i = ZOOMS.findIndex((z) => z >= editorZoom);
    editorZoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (ZOOMS[i] === editorZoom ? i : dir > 0 ? i - 1 : i) + dir))];
  }
  applyZoom();
}
applyZoom();

/* ============================================================== library */

/** In manual-save mode, ask before leaving a project with unsaved changes. Returns false to keep it open. */
async function confirmLeave() {
  if (settings.autosave) return true;
  const dirty = app.book && (app.metaDirty || app.dirtyFiles.size || app.removed.length || app.dirtyNotes.size || app.removedNotes.length || pendingSerialize);
  if (!dirty) return true;
  B.closeHold();
  const keep = await dialog({ title: 'Save your changes?', message: 'This project has changes that haven’t been saved.', ok: 'Save', cancel: 'Don’t Save' });
  if (!keep) discardChanges = true;
  return true;
}
let discardChanges = false;

async function showLibrary() {
  closePopovers();
  await confirmLeave();
  if (app.book) { if (!discardChanges) await save(); app.goals.measured(true); app.goals.archiveSession(); await app.goals.flush(); }
  discardChanges = false;
  mode = 'library';
  document.title = 'Lutefisk';
  let data = { books: [], libraryDir: '', home: '' };
  try { data = await B.library(); } catch (err) { toast(clean(err), 'error'); }
  const pretty = (p) => (data.home && p.startsWith(data.home) ? p.slice(data.home.length + 1) : p).split(/[\\/]/).filter(Boolean).join(' › ');

  const grid = h('div', { class: 'lib-grid' });
  grid.append(h('button', { class: 'lib-new', onclick: () => newBookSheet(data) },
    h('div', { class: 'lib-new-cover' }, icon('plus', 34)), h('div', { class: 'lib-meta' }, h('b', {}, 'New Book'), h('span', {}, 'Start writing'))));
  for (const b of data.books) {
    const cover = b.cover ? h('img', { src: b.cover, alt: '' }) : generatedCover(b.title, b.author, fontStack(templateById(b.template).head), b.subtitle);
    const more = h('button', { class: 'lib-more', title: 'More', 'aria-label': `More options for ${b.title}`, onclick: (e) => {
      e.stopPropagation();
      popover(more, [
        { label: 'Open', icon: 'book', onClick: () => openRecent(b.dir) },
        { label: B.platform === 'darwin' ? 'Show in Finder' : 'Show in Folder', icon: 'folder', onClick: () => B.revealPath(b.dir) },
        { label: 'Back Up…', icon: 'download', onClick: () => backupProject(b.dir, { choose: !settings.backupDir }) },
        '-',
        { label: 'Remove from Recents', icon: 'minus', onClick: async () => { await B.forgetBook(b.dir); showLibrary(); } },
        { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteProject(b) },
      ], { align: 'right' });
    } }, icon('more', 18));
    grid.append(h('div', { class: 'lib-book', tabindex: 0, role: 'button', 'aria-label': `Open ${b.title}`,
      onclick: () => openRecent(b.dir), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecent(b.dir); } } },
    h('div', { class: 'lib-cover' }, cover, h('div', { class: 'lib-spine' })), more,
    h('div', { class: 'lib-meta' }, h('b', { title: b.title }, b.title), h('span', {}, b.author || 'No author'),
      h('small', {}, `${b.words.toLocaleString()} words · ${timeAgo(b.modified)}`))));
  }

  const view = h('div', { class: 'library' },
    h('div', { class: 'lib-titlebar drag' }),
    h('div', { class: 'lib-brand' }, brandMark(52, 'lib-brand-mark'), h('div', {}, h('div', { class: 'brand-word' }, 'Lutefisk'), h('div', { class: 'brand-tag' }, 'Write, design and publish books, privately.')),
),
    h('header', { class: 'lib-head' },
      h('div', {}, h('h1', {}, 'Library'), h('p', {}, data.books.length ? `${data.books.length} ${data.books.length === 1 ? 'book' : 'books'}` : 'Your books will appear here.')),
      h('div', { class: 'lib-actions' },
        h('button', { class: 'btn', title: 'Open a book folder', onclick: openBook }, icon('folder', 16), 'Open…'),
        h('button', { class: 'btn primary', onclick: () => newBookSheet(data) }, icon('plus', 16), 'New Book'),
        h('div', { class: 'lib-tools' },
          h('button', { class: 'lib-gear', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings(sheet) }, icon('gear', 20)),
          themeButton(),
          h('button', { class: 'lib-gear', title: 'Help — how to make your first book, and a guided tour (F1)', 'aria-label': 'Help', onclick: () => openHelp(app) }, icon('help', 20))))),
    h('main', { class: 'lib-scroll' }, grid,
      !data.books.length ? h('div', { class: 'lib-empty' }, brandMark(96, 'lib-empty-mark'), h('p', {}, 'Create your first book, or drag a book folder onto this window.'),
        h('div', { class: 'lib-empty-acts' },
          h('button', { class: 'btn primary', onclick: () => newBookSheet(data) }, icon('plus', 15), 'New Book'),
          h('button', { class: 'btn', onclick: () => startTour(app) }, icon('play', 14), 'Show Me How'),
          h('button', { class: 'btn plain', onclick: () => openHelp(app) }, icon('help', 15), 'Help'))) : null),
    h('footer', { class: 'lib-foot' }, icon('eye', 14), h('span', {}, `New books are saved to ${pretty(data.libraryDir)}. Everything stays on this computer — no accounts, no cloud, no tracking.`)),
    h('div', { class: 'drop-hint' }, h('div', {}, icon('folder', 40), h('b', {}, 'Drop to open book'))));
  root.replaceChildren(view);
  app.book = null;
}

async function deleteProject(b) {
  const kind = 'book';
  const ok = await dialog({
    title: `Delete “${b.title || 'Untitled'}”?`,
    message: `The whole ${kind} folder — every chapter, image and note in it — moves to the ${B.platform === 'darwin' ? 'Trash' : B.platform === 'win32' ? 'Recycle Bin' : 'Trash'}. You can restore it from there until you empty it.`,
    ok: `Delete ${kind[0].toUpperCase()}${kind.slice(1)}`,
  });
  if (!ok) return;
  try { await B.deleteProject(b.dir); toast(`Moved “${b.title || 'Untitled'}” to the ${B.platform === 'win32' ? 'Recycle Bin' : 'Trash'}`, 'ok', 3000); } catch (err) { toast(clean(err), 'error', 6000); }
  showLibrary();
}

/** Back Up Book: a copy of the whole book folder, beside it or anywhere you choose. */
app.backupBook = () => backupDialog(app, () => save());

/** Delete the open book (Book settings › General): asks first, then moves its folder to the Trash. */
app.deleteOpenBook = async () => {
  const title = app.book?.title || 'Untitled';
  const bin = B.platform === 'win32' ? 'Recycle Bin' : 'Trash';
  const ok = await dialog({
    title: `Delete “${title}”?`,
    message: `The whole book folder — every chapter, image, note and backup inside it — moves to the ${bin}. You can restore it from there until you empty it.`,
    fields: [{ name: 'confirm', label: `Type the book’s title to confirm: ${title}`, placeholder: title }],
    ok: 'Delete Book',
  });
  if (!ok) return false;
  if (ok.confirm.trim().toLowerCase() !== title.trim().toLowerCase()) { toast('The title didn’t match — the book was not deleted', 'error', 3500); return false; }
  for (const o of document.querySelectorAll('.overlay')) o.remove();
  try {
    await save();
    app.goals.archiveSession(); await app.goals.flush();
    await B.deleteOpenBook();
  } catch (err) { toast(clean(err), 'error', 6000); return false; }
  app.book = null;
  app.dirtyFiles?.clear(); app.metaDirty = false;
  toast(`Moved “${title}” to the ${bin}`, 'ok', 3000);
  discardChanges = true;
  showLibrary();
  return true;
};

async function newBookSheet(lib) {
  let parent = lib.newBookDir || lib.libraryDir;
  const pretty = (p) => (lib.home && p.startsWith(lib.home) ? p.slice(lib.home.length + 1) : p).split(/[\\/]/).filter(Boolean).join(' › ');
  const title = h('input', { type: 'text', placeholder: 'Untitled Book', 'aria-label': 'Title' });
  const subtitle = h('input', { type: 'text', placeholder: 'Optional', 'aria-label': 'Subtitle' });
  const author = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Author' });
  const tplSel = h('select', { 'aria-label': 'Template' }, ['General', 'Fiction', 'Literary', 'Nonfiction'].map((c) =>
    h('optgroup', { label: c }, TEMPLATES.filter((t) => t.category === c).sort((a, b) => a.name.localeCompare(b.name)).map((t) => h('option', { value: t.id }, t.name)))));
  tplSel.value = 'classic';
  let titleStyle = 'apa'; // same default as citations
  const tcOpts = { getStyle: () => titleStyle, setStyle: (id) => { titleStyle = id; } };
  try { author.value = localStorage.getItem('lutefisk.author') || ''; } catch { /* ignore */ }
  const locLbl = h('span', { class: 'loc-path' }, pretty(parent));
  const preview = h('div', { class: 'nb-preview' });
  const draw = () => {
    const t = templateById(tplSel.value);
    preview.replaceChildren(generatedCover(title.value || 'Untitled Book', author.value, fontStack(t.head)), h('div', { class: 'lib-spine' }));
  };
  const authorLbl = h('span', {}, 'Author');
  for (const el of [title, author]) el.addEventListener('input', draw);
  tplSel.addEventListener('change', draw);
  draw();
  const create = h('button', { type: 'submit', class: 'btn primary' }, 'Create Book');
  const form = h('form', { class: 'nb-form' },
    h('label', { class: 'fld' }, h('span', {}, 'Title'), h('div', { class: 'title-row' }, title, titleCheckButton(title, tcOpts))),
    h('label', { class: 'fld book-only' }, h('span', {}, 'Subtitle'), h('div', { class: 'title-row' }, subtitle, titleCheckButton(subtitle, tcOpts))),
    h('label', { class: 'fld author-fld' }, authorLbl, author),
    h('label', { class: 'fld book-only' }, h('span', {}, 'Design'), tplSel),
    h('div', { class: 'fld' }, h('span', {}, 'Location'), h('div', { class: 'loc-row' }, icon('folder', 16), locLbl,
      h('button', { type: 'button', class: 'btn small', onclick: async () => { const p = await B.chooseLocation(); if (p) { parent = p; locLbl.textContent = pretty(p); } } }, 'Change…'))),
    h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'), create));
  const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') close(); } },
    h('div', { class: 'dlg nb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'New Book' },
      h('div', { class: 'nb-side' }, preview), h('div', { class: 'nb-main' }, h('h2', {}, 'New Book'), form)));
  const close = () => overlay.remove();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    create.disabled = true;
    const book = ensureSections(defaultBook({ title: title.value.trim() || 'Untitled Book', subtitle: subtitle.value.trim(), author: author.value.trim() }));
    book.template = tplSel.value;
    if (titleStyle !== 'apa') book.titleStyle = titleStyle;
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

async function openBook() {
  try {
    const data = await B.openBook();
    if (!data) return;
    await confirmLeave();
    if (app.book && !discardChanges) await save();
    discardChanges = false;
    loadBookData(data);
  } catch (err) { toast(clean(err), 'error', 6000); }
}
async function openRecent(dir) {
  try { loadBookData(await B.openRecent(dir)); } catch (err) { toast(clean(err), 'error', 6000); }
}

// Drag a book folder (or its lutefisk.yaml) onto the window to open it.
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
    { label: 'Markdown', hint: '.md + images', icon: 'textSize', onClick: () => doExport('md') },
    { label: 'MOBI', hint: 'older Kindles', icon: 'device', onClick: () => doExport('mobi') },
    { label: 'PDF', hint: 'Print-ready', icon: 'print', onClick: () => doExport('pdf') },
    { label: 'Rich Text', hint: '.rtf', icon: 'doc', onClick: () => doExport('rtf') },
    { label: 'Text', hint: '.txt — plain text', icon: 'textSize', onClick: () => doExport('txt') },
    { label: 'Word', hint: '.docx', icon: 'doc', onClick: () => doExport('docx') },
  ], { align: 'right', width: 230 }) }, icon('share', 15), 'Export');

  const titlebar = h('header', { class: 'titlebar drag' },
    h('div', { class: 'tb-left' },
      h('button', { class: 'tb-icon tb-brand', title: 'Lutefisk Library (⇧⌘L)', 'aria-label': 'Library', onclick: showLibrary }, brandMark(22))),
    h('div', { class: 'tb-doc' }, els.docTitle, h('div', { class: 'tb-doc-sub' }, els.tbCount = h('span', { class: 'tb-count', 'aria-live': 'off' }), els.save,
      h('button', { class: 'tb-backup', title: 'Back Up Book — save a copy of the whole book folder, beside it or in another folder', onclick: () => app.backupBook() }, icon('download', 12), 'Back Up'))),
    h('div', { class: 'tb-right' }, exportBtn,
      h('div', { class: 'tb-tools' },
        h('button', { class: 'tb-icon', title: 'Settings', 'aria-label': 'Settings', onclick: () => openSettings(sheet) }, icon('gear', 18)),
        themeButton(),
        h('button', { class: 'tb-icon tb-help', title: 'Help — a short guide and a guided tour (F1)', 'aria-label': 'Help', onclick: () => openHelp(app) }, icon('help', 18)))));

  els.sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Sections' });
  els.secKind = h('div', { class: 'sec-kind' });
  els.secTitle = h('input', { class: 'sec-title', 'aria-label': 'Section title', placeholder: 'Title', spellcheck: 'true' });
  els.secSub = h('input', { class: 'sec-subtitle', 'aria-label': 'Chapter subtitle', placeholder: 'Subtitle (optional)', spellcheck: 'true', hidden: true });
  els.secSub.addEventListener('input', () => { const s = currentSection(); if (!s || currentScene()) return; if (els.secSub.value.trim()) s.subtitle = els.secSub.value; else delete s.subtitle; app.markDirty(); app.htmlCache?.clear?.(); schedulePreview(); });
  els.secSub.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.editor.focus(); } });
  els.commentsBtn = h('button', { class: 'sb-tool ed-icon-btn comments-btn', onclick: () => setCommentsHidden(!commentsHidden_()) });
  els.snipBtn = h('button', { class: 'sb-tool ed-icon-btn snippets-btn', onclick: () => setSnippetsShown(!snippetsShown) });
  // Check spelling and grammar now (same as F7): checks, then opens the first problem.
  els.spellBtn = h('button', { class: 'sb-tool ed-icon-btn spell-now-btn', title: 'Check Spelling and Grammar Now (F7)', 'aria-label': 'Check spelling and grammar now', onclick: () => checkSpellingNow() }, icon('spell', 18));
  els.snipRail = snippetRail(app, {
    onNew: () => openSnippets(app, sheet, { targets: snippetTargets, insert: insertSnippetInto }, refreshSidebar, { fresh: true }),
    onEdit: (sn) => openSnippets(app, sheet, { targets: snippetTargets, insert: insertSnippetInto }, refreshSidebar, { edit: sn.id }),
    onClose: () => setSnippetsShown(false),
  });
  els.dcSwitch = h('input', { type: 'checkbox', class: 'switch', role: 'switch', 'aria-label': 'Drop cap for this chapter' });
  els.dcRow = h('label', { class: 'dc-chip', title: 'Drop cap at the start of this chapter' }, icon('dropcap', 15), h('span', {}, 'Drop cap'), els.dcSwitch);
  els.headRow = h('span', { hidden: true }); // chapter heading style now lives in Book › Chapters and the templates
  els.chaptersBtn = h('button', { class: 'scene-btn chapters-menu', title: 'Chapters — go to any chapter or other part of the book', onclick: () => chapterJumpMenu(els.chaptersBtn) }, icon('toc', 15), h('span', {}, 'Chapters'), icon('chevron', 12));
  els.sceneBtn = h('button', { class: 'scene-btn scenes-menu', title: 'Scenes — split this chapter into scenes, add a scene, or go to one', onclick: () => sceneActions(els.sceneBtn) }, icon('scene', 15), els.sceneBtnLabel = h('span', {}, 'Scenes'), icon('chevron', 12));
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
  els.clock = stopwatchControl(app, app.goals);
  const stat = (label) => { const num = h('span', { class: 'bb-num' }); const unit = h('span', { class: 'bb-unit' }, label); return { num, unit, el: h('div', { class: 'bb-stat' }, num, unit) }; };
  els.bbWords = stat('words');
  els.bbPages = stat('pages');
  els.bbToday = stat('today');
  els.bbGoal = h('div', { class: 'bb-goal', hidden: true }, h('i'));
  els.bbWords.el.append(els.bbGoal);
  els.bbDeltaW = h('span', { class: 'bb-dw' });
  els.bbDeltaP = h('span', { class: 'bb-dp' });
  els.bbArrow = h('span', { class: 'bb-arrow' });
  els.bbSession = h('button', { class: 'bb-session', onclick: () => app.openInsights(), oncontextmenu: (e) => { e.preventDefault(); sessionPopover(els.bbSession, app.goals, { onNew: () => { app.sessionStart = null; drawBookBar(); } }); } },
    els.bbArrow, h('span', { class: 'bb-delta-txt' }, els.bbDeltaW, els.bbDeltaP), h('span', { class: 'bb-tag' }, 'this session'));
  const insights = () => app.openInsights();
  // Bottom of the editor: the numbers. Click any of them for Insights; the stopwatch sits at the right.
  els.bookBar = h('div', { class: 'book-bar', role: 'status', 'aria-live': 'off' },
    h('button', { class: 'bb-group bb-book', title: 'The whole book, updated as you type — click for Insights', onclick: insights }, els.bbWords.el, h('span', { class: 'bb-div' }), els.bbPages.el),
    els.bbSession,
    h('button', { class: 'bb-group bb-today-g', title: 'Words today — click for Insights', onclick: insights }, els.bbToday.el),
    h('span', { class: 'spacer' }),
    h('button', { class: 'bb-here', title: 'This chapter — click for Insights', onclick: () => app.openInsights('text') }, els.status),
    h('button', { class: 'chip-toggle focus-btn focus-exit on', title: 'Exit Focus — back to the binder and preview (Esc)', onclick: () => toggleWritingFocus(false) }, icon('collapse', 15), h('span', {}, 'Exit Focus')),
    els.clock.el);
  app.goals.onUpdate = () => { els.goalMeter.draw(); els.clock.draw(); drawBookBar(); };
  // Text size for the editor — the same A–A slider as the device preview.
  els.zoomRange = h('input', { type: 'range', min: ZMIN, max: ZMAX, step: 5, class: 'pv-size', 'aria-label': 'Editor text size' });
  els.zoomRange.addEventListener('input', () => { editorZoom = Number(els.zoomRange.value); applyZoom(); });
  els.zoomRange.addEventListener('dblclick', () => zoom(0));
  const zoomCtl = h('div', { class: 'pv-ctl size-ctl editor-size', title: 'Editor text size (⌘+ / ⌘−; double-click for actual size) — doesn’t change the book' },
    h('button', { class: 'small-a', 'aria-label': 'Smaller text', onclick: () => zoom(-1) }, 'A'), els.zoomRange,
    h('button', { class: 'big-a', 'aria-label': 'Larger text', onclick: () => zoom(1) }, 'A'));
  els.zoomBubble = rangeBubble(els.zoomRange);
  applyZoom();
  // Editor focus — the same chip as the preview's.
  els.edFocusBtn = h('button', { class: 'chip-toggle focus-btn ed-focus-btn', title: 'Focus on writing — hide everything else (⇧⌘F)', 'aria-label': 'Focus on writing', onclick: () => toggleWritingFocus() }, icon('expand', 15), h('span', {}, 'Focus'));
  els.edTop = h('div', { class: 'ed-top' },
    h('div', { class: 'sec-opts' }, els.chaptersBtn, els.sceneBtn, els.spellBtn, els.commentsBtn, els.snipBtn, els.headTools = h('span', { class: 'sec-tools' })),
    h('span', { class: 'spacer' }),
    zoomCtl, els.edFocusBtn,
    h('button', { class: 'sb-tool', title: 'Hide the editor', 'aria-label': 'Hide the editor', onclick: () => setPane('editor', false) }, icon('panelHide', 16)));
  const editorPane = h('section', { class: 'editor-pane' },
    paneRail('editor', 'Editor', 'pen'),
    els.edTop,
    h('div', { class: 'sec-head' }, h('div', { class: 'sec-kind-row' }, els.secKind),
      h('div', { class: 'title-row' }, els.secTitle, els.secTitleCheck = titleCheckButton(els.secTitle, titleCheckOpts(true))),
      h('div', { class: 'title-row sub' }, els.secSub, els.secSubCheck = titleCheckButton(els.secSub, titleCheckOpts(false)))), els.secExtra, els.editorMount, els.genMount,
    h('footer', { class: 'book-bar-wrap' }, els.bookBar));
  els.zoomCtl = zoomCtl;

  els.viewSeg = segmented([{ value: 'device', label: 'E-book', icon: 'device', title: 'E-book — the book as it reads on a phone, tablet or e-reader' }, { value: 'print', label: 'Print', icon: 'print', title: 'Print — the printed book as an open spread, exactly as the PDF will be' }], 'device', (v) => setView(v), { label: 'Preview' });
  els.pvRow1 = h('div', { class: 'pv-row1-slot' });
  els.pvZoom = h('div', { class: 'pv-row1-slot pv-zoom-slot' });
  els.researchHost = h('div', { class: 'pv-host research-host', hidden: true });
  els.deviceHost = h('div', { class: 'pv-host' });
  els.printHost = h('div', { class: 'pv-host', hidden: true });
  els.focusBtn = h('button', { class: 'chip-toggle focus-btn', title: 'Focus — show only the preview, full screen (⌥⌘P). Esc to exit.', 'aria-label': 'Focus on the preview', onclick: () => toggleFocus() }, icon('expand', 15), h('span', {}, 'Focus'));
  const previewPane = h('section', { class: 'preview-pane' },
    paneRail('preview', 'Preview', 'device'),
    h('div', { class: 'pv-switch' }, els.viewSeg, els.pvZoom, h('span', { class: 'spacer' }), els.pvRow1, els.focusBtn,
      h('button', { class: 'sb-tool', title: 'Hide the preview', 'aria-label': 'Hide the preview', onclick: () => setPane('preview', false) }, icon('panelHide', 16))),
    els.deviceHost, els.printHost, els.researchHost);
  const splitter = h('div', { class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', title: 'Drag to resize' });
  els.editorPane = editorPane;
  els.previewPane = previewPane;
  els.sidebarRail = paneRail('binder', 'Binder', 'binderHide');
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
  // Spelling and grammar: Harper, on this computer.
  const spellKinds = () => new Set(['spell', ...(settings.spellGrammar !== false ? ['grammar'] : []), ...(settings.spellStyle !== false ? ['style'] : [])]);
  let spellSig = '';
  const spellChanged = () => {
    const sig = JSON.stringify([settings.spellOn, settings.spellDialect, settings.spellGrammar, settings.spellStyle, settings.dictionary]);
    if (sig === spellSig) return;
    spellSig = sig;
    setDictionary(settings.dictionary || []).finally(() => app.editor?.recheckSpelling?.());
  };
  onSettings(spellChanged);
  spellChanged();
  if (settings.spellOn !== false) setTimeout(() => warmUp(settings.spellDialect || 'american'), 1500);
  app.editor = createEditor(els.editorMount, {
    spell: {
      enabled: () => settings.spellOn !== false, dialect: () => settings.spellDialect || 'american', kinds: spellKinds,
      auto: () => settings.spellMode !== 'manual',
      onBusy: (on) => els.spellBtn?.classList.toggle('busy', on),
      onResult: () => { els.spellBtn?.classList.remove('busy'); if (spellJump) { spellJump = false; requestAnimationFrame(() => { if (!app.editor.nextSpellProblem(1)) toast('No spelling or grammar problems found', 'ok', 1600); }); } },
    },
    spellOff: () => toast('Spelling and grammar checking is off — turn it on in Settings › Spelling & Grammar', 'info', 2600),
    spellNow: () => { spellJump = true; },
    spellNone: () => toast(app.editor.spellChecked() || settings.spellMode !== 'manual' ? 'No spelling or grammar problems here' : 'Press F7 to check this text first', 'info', 1600),
    addWord: (w) => addDictionaryWord(w).then(() => toast(`Added “${w}” to your dictionary`, 'ok', 1600)),
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
    snippets: () => app.book?.snippets || [],
    pickSnippet: (at) => pickSnippet(app, at, (md) => app.editor.insertMarkdown(md), refreshSidebar),
    dropSnippet: (id, pos) => dropSnippet(id, pos),
    citationStyles: () => CITE_STYLES.map((st) => ({ ...st, on: (app.book?.citationStyle || 'apa') === st.id })),
    setCitationStyle: (id) => { if (!app.book) return; app.book.citationStyle = id; app.editor.redraw(); app.markDirty(); app.htmlCache.clear(); app.refreshPreview(true); toast(`Every citation and reference is now in ${CITE_STYLES.find((x) => x.id === id)?.label}`, 'ok', 2200); },
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
  els.editorMount.append(els.snipRail); // beside the text, under the toolbar
  app.search = createSearch({
    units: (scope = 'book') => {
      const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
      const out = [];
      const cur = findScene(app.currentId);
      const curChapter = cur ? cur.chapter.id : app.currentId;
      for (const s of numbered) {
        if (scope === 'chapter' && s.id !== curChapter) continue;
        if (scope === 'scene' && (cur ? s.id !== cur.chapter.id : s.id !== app.currentId)) continue;
        if (SECTION_TYPES[s.type]?.generated) continue;
        const title = s.type === 'chapter' ? (s.displayTitle ? `${s.label}: ${s.displayTitle}` : s.label) : s.displayTitle;
        if (hasScenes(s)) s.scenes.forEach((sc, i) => { if (scope !== 'scene' || sc.id === app.currentId) out.push({ id: sc.id, title, sub: sceneLabel(sc, i), md: app.contents[sc.id] }); });
        else out.push({ id: s.id, title, md: app.contents[s.id] });
      }
      if (scope === 'book' || ((scope === 'scene' || scope === 'chapter') && currentResearch())) for (const r of app.book.research || []) if (r.kind === 'note' && (scope === 'book' || r.id === app.currentId)) out.push({ id: r.id, title: r.title || 'Note', sub: 'Research', md: app.contents[r.id] });
      return out;
    },
    hasSelection: () => app.editor.hasSelection(),
    selectionText: () => app.editor.selectionText(),
    inSelection: (m) => { const sel = app.editor.view.state.selection; return !sel.empty && m.from >= sel.from && m.to <= sel.to; },
    replaceAt: (id, re, i, to) => {
      flushSerialize();
      if (app.currentId !== id) selectSection(id);
      app.editor.replace(re, to, { index: i });
      flushSerialize();
    },
    replaceAll: (scope, re, to) => {
      flushSerialize();
      let count = 0;
      if (scope === 'selection') { count = app.editor.replace(re, to, { inSelection: true }); flushSerialize(); return count; }
      for (const u of app.search.unitsFor(scope)) {
        if (u.id === app.currentId) { count += app.editor.replace(re, to); flushSerialize(); continue; }
        const res = replaceInMarkdown(app.contents[u.id] || '', re, to);
        if (!res.count) continue;
        count += res.count;
        app.contents[u.id] = res.md;
        app.editor.forget(u.id);
        if (findResearch(u.id)) app.dirtyNotes.add(u.id); else app.dirtyFiles.add(u.id);
        const sc = findScene(u.id);
        if (sc) rejoin(sc.chapter);
      }
      app.markDirty(); refreshSidebar(); schedulePreview(false, true);
      return count;
    },
    flush: () => flushSerialize(),
    open: (id, re, i) => {
      if (app.currentId !== id) selectSection(id);
      requestAnimationFrame(() => { if (app.currentId === id) app.editor.search(re, i); });
    },
    highlight: (re) => app.editor.search(re, -1),
    clear: () => app.editor.clearSearch(),
    onActive: (on) => els.sidebar?.classList.toggle('searching', on),
  });
  app.comments = createCommentRail(app, app.editor);
  app.comments.onCount = (open, all) => { commentCount = { open, all }; drawCommentsBtn(); };
  { const load = app.editor.load.bind(app.editor); app.editor.load = (...a) => { const r = load(...a); railSoon(); return r; }; }
  window.addEventListener('resize', railSoon);

  app.device = createDevicePreview(els.deviceHost, app);
  app.print = createPrintPreview(els.printHost, app);
  app.openTemplates = () => openTemplates(app);
  app.templateList = () => allTemplates(app);
  app.useTemplate = (id) => { const t = allTemplates(app).all.find((x) => x.id === id); if (t) applyTemplate(app, t, { quiet: true }); };
  app.editTemplate = () => openTemplateEditor(app, templateById(app.book.template), { current: true });
  app.openInsights = (tab) => openInsights(app, app.goals, sheet, { tab, trimLabel: () => TRIMS[app.book.print?.trim || '6x9']?.label.split(' (')[0] || '' });
  applyPanes();
}

function selectSectionHeader(s) {
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === s.id);
  els.secKind.textContent = s.type === 'chapter' ? (n?.label || 'Chapter (no number)') : s.type === 'about-author' ? aboutAuthorsLabel(app.book) : SECTION_TYPES[s.type].label;
}

function syncHeadSel() { /* the chapter heading style moved to Book › Chapters */ }

// Books always show the preview; Focus (editor or preview) covers hiding things.
let previewHidden = false;
function applyPreviewHidden() {
  els.workspace.classList.toggle('no-preview', previewHidden);
}
function togglePreview(force) {
  previewHidden = force != null ? !force : !previewHidden;
  try { localStorage.setItem('lutefisk.previewHidden.book', previewHidden ? '1' : '0'); } catch { /* ignore */ }
  applyPreviewHidden();
  if (!previewHidden) { fullPrint = true; app.device.build(); schedulePreview(false, true); }
}

/** Preview Focus: the e-book or print preview fills the window, nothing else. Esc exits. */
let previewFocus = false;
function toggleFocus(force) {
  previewFocus = force ?? !previewFocus;
  if (previewFocus && writingFocus) toggleWritingFocus(false);
  els.shell.classList.toggle('preview-focus', previewFocus);
  els.focusBtn.replaceChildren(icon(previewFocus ? 'collapse' : 'expand', 15), h('span', {}, previewFocus ? 'Exit Focus' : 'Focus'));
  els.focusBtn.title = previewFocus ? 'Exit Focus — back to the editor and binder (Esc)' : 'Focus — show only the preview, full screen (⌥⌘P). Esc to exit.';
  els.focusBtn.classList.toggle('on', previewFocus);
  requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); schedulePreview(false, true); });
  if (previewFocus) toast('Preview focus — press Esc to exit', 'info', 1800);
}

/* ---- book bar: live totals for the whole book, change this session, running clock */
app.sessionStart = null;
/** Editor text with block breaks kept, so words in adjacent paragraphs don't run together. */
const liveText = () => { const d = app.editor.view.state.doc; return d.textBetween(0, d.content.size, '\n', ' '); };
let liveBase = null;
/** Words of prose only — no markup, image paths, code, math or tables. Cached per text. */
const proseCache = new Map();
function proseWords(id) {
  const md = app.contents[id] || '';
  const hit = proseCache.get(id);
  if (hit?.md === md) return hit.n;
  const n = countWords(proseText(md));
  proseCache.set(id, { md, n });
  return n;
}
function liveBookWords() {
  if (!app.book) return 0;
  // Saved markdown and the live editor count a few things differently (citations, figures),
  // so track the editor's change since the last save and add it to the saved count.
  const nowLive = countWords(liveText());
  if (!pendingSerialize || liveBase?.id !== app.currentId) liveBase = { id: app.currentId, live: nowLive };
  const live = pendingSerialize ? proseWords(app.currentId) + nowLive - liveBase.live : null;
  const sc = findScene(app.currentId);
  let n = 0;
  for (const x of enabledSections()) {
    if (SECTION_TYPES[x.type].generated) continue;
    let w = proseWords(x.id);
    if (live != null && x.id === app.currentId) w = live;
    else if (live != null && sc?.chapter === x) w += live - proseWords(sc.scene.id);
    n += w;
  }
  return n;
}
function wordsPerPage(words) {
  const printed = app.printPageCount?.() || 0;
  return printed && app.print?.wordsAtCount ? Math.max(120, app.print.wordsAtCount / printed) : 275;
}
/* ---- content search */
function focusSearch() {
  if (writingFocus) toggleWritingFocus(false);
  if (previewFocus) toggleFocus(false);
  if (!panes.binder) setPane('binder', true);
  app.search.focus();
}

/* ---- show / hide the binder, editor and preview. A hidden pane leaves a slim rail to bring it back. */
const panes = (() => { try { return { binder: true, editor: true, preview: true, ...JSON.parse(localStorage.getItem('lutefisk.panes') || '{}') }; } catch { return { binder: true, editor: true, preview: true }; } })();
if (!panes.editor && !panes.preview) panes.editor = true;
function paneRail(which, label, ic) {
  return h('button', { class: 'pane-rail', title: `Show the ${label.toLowerCase()}`, 'aria-label': `Show the ${label.toLowerCase()}`, onclick: () => setPane(which, true) }, icon(ic, 16), h('span', {}, label));
}
function applyPanes() {
  if (!els.workspace) return;
  const RAIL = '34px';
  const both = panes.editor && panes.preview;
  const side = panes.binder ? 'var(--sidebar-w)' : RAIL;
  const ed = both ? 'minmax(420px, 1fr)' : panes.editor ? '1fr' : RAIL;
  const pv = both ? 'var(--preview-w)' : panes.preview ? '1fr' : RAIL;
  els.workspace.style.gridTemplateColumns = `${side} ${ed} ${both ? '1px' : '0'} ${pv}`;
  els.sidebar.classList.toggle('collapsed', !panes.binder);
  els.editorPane.classList.toggle('collapsed', !panes.editor);
  els.previewPane.classList.toggle('collapsed', !panes.preview);
  requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); schedulePreview(false, true); });
}
function setPane(which, on) {
  panes[which] = on;
  // Never hide both the editor and the preview.
  if (!on && which === 'editor' && !panes.preview) panes.preview = true;
  if (!on && which === 'preview' && !panes.editor) panes.editor = true;
  try { localStorage.setItem('lutefisk.panes', JSON.stringify(panes)); } catch { /* ignore */ }
  applyPanes();
}
function toggleSidebar() { setPane('binder', !panes.binder); }

/* ---- Chapters menu: jump to any part of the book */
function chapterJumpMenu(anchor) {
  if (!app.book) return;
  flushSerialize();
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  const groups = { front: 'Front Matter', body: 'Body', back: 'Back Matter' };
  const curChapter = findScene(app.currentId)?.chapter.id || app.currentId;
  const items = [];
  let g = null;
  for (const sec of numbered) {
    const grp = SECTION_TYPES[sec.type]?.group || 'body';
    if (grp !== g) { g = grp; if (items.length) items.push('-'); items.push({ header: groups[grp] || 'Body' }); }
    const label = sec.type === 'chapter' ? (sec.displayTitle ? `${sec.label ? `${sec.label}: ` : ''}${sec.displayTitle}` : sec.label || 'Untitled Chapter') : (sec.tocTitle || sec.displayTitle || SECTION_TYPES[sec.type]?.label);
    const words = SECTION_TYPES[sec.type]?.generated ? '' : countWords(hasScenes(sec) ? joinScenes(sec.scenes, app.contents, { all: true }) : app.contents[sec.id]).toLocaleString();
    items.push({ label: `${sec.id === curChapter ? '✓ ' : ''}${label}${sec.exclude ? ' (excluded)' : ''}`, hint: words, icon: sec.type === 'chapter' ? 'doc' : SECTION_TYPES[sec.type]?.generated ? 'toc' : 'doc', onClick: () => selectSection(sec.id) });
  }
  popover(anchor, items, { width: 300, maxHeight: 520 });
}

/* ---- Capitalize My Title */
function titleCheckOpts(withAll) {
  return {
    getStyle: () => bookTitleStyle(app.book),
    setStyle: (id) => { if (app.book && app.book.titleStyle !== id) { app.book.titleStyle = id; app.markDirty(); } },
    applyAll: withAll ? {
      label: 'Every chapter and scene title in',
      run: async (style) => {
        const items = [];
        for (const sec of app.book.sections) { if (!SECTION_TYPES[sec.type]?.generated && sec.title) items.push(sec); for (const sc of sec.scenes || []) if (sc.title) items.push(sc); }
        const subs = app.book.sections.filter((x) => x.subtitle);
        const n = recaseAll(items, style) + recaseAll(subs, style, (x) => x.subtitle, (x, v) => { x.subtitle = v; });
        app.book.titleStyle = style;
        app.markDirty(); refreshSidebar(); schedulePreview(false, true);
        const cur = currentScene() || currentSection();
        if (cur) { els.secTitle.value = cur.title || ''; if (!els.secSub.hidden) els.secSub.value = cur.subtitle || ''; }
        toast(n ? `${n} title${n === 1 ? '' : 's'} recapitalized` : 'Every title already follows that style', 'ok', 2500);
      },
    } : null,
  };
}

/* ---- story tools: characters and the plot board */
function storyUnits() {
  flushSerialize();
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book);
  return numbered.filter((s) => SECTION_TYPES[s.type]?.group === 'body' && !SECTION_TYPES[s.type].generated).map((s) => {
    const md = hasScenes(s) ? joinScenes(s.scenes, app.contents, { all: true }) : app.contents[s.id];
    return {
      id: s.id,
      title: s.type === 'chapter' ? s.tocTitle : s.displayTitle,
      short: s.type === 'chapter' ? String(s.number) : (SECTION_TYPES[s.type].label[0] || ''),
      text: proseText(md),
      parts: hasScenes(s) ? s.scenes.map((sc, i) => { const t = proseText(app.contents[sc.id]); return { title: sceneLabel(sc, i), count: (c) => countMentions(t, c) }; }) : [],
    };
  });
}
function storyCtx(extra = {}) {
  const ctx = {
    book: app.book, kind: 'book', unitWord: 'chapter',
    markDirty: () => app.markDirty(),
    jump: (id) => { ctx.close?.(); selectSection(id); },
    help: (topic) => openHelp(app, { topic }),
    ...extra,
  };
  return ctx;
}
function openCast(select) {
  if (!app.book) return;
  openCharacters(storyCtx({ units: storyUnits, suggest: () => suggestNames(storyUnits().map((u) => u.text).join('\n')) }), sheet, { select });
}
function openPlotBoard(view) {
  if (!app.book) return;
  if (view) { try { localStorage.setItem('lutefisk.plotView', view); } catch { /* ignore */ } }
  openPlot(storyCtx({
    sources: () => {
      flushSerialize();
      return numberSections(app.book.sections, templateById(app.book.template), app.book)
        .filter((s) => SECTION_TYPES[s.type]?.group === 'body' && !SECTION_TYPES[s.type].generated)
        .flatMap((s) => [
          { id: s.id, col: s.id, depth: 0, title: s.type === 'chapter' ? s.tocTitle : s.displayTitle, words: countWords(hasScenes(s) ? joinScenes(s.scenes, app.contents, { all: true }) : app.contents[s.id]), text: hasScenes(s) ? '' : sceneSnippet(app.contents[s.id] || '', 24) },
          ...(hasScenes(s) ? s.scenes.map((sc, i) => ({ id: sc.id, col: s.id, depth: 1, title: sceneLabel(sc, i), words: countWords(app.contents[sc.id]), text: sceneSnippet(app.contents[sc.id] || '', 24) })) : []),
        ]);
    },
    timeline: () => numberSections(app.book.sections, templateById(app.book.template), app.book)
      .filter((s) => SECTION_TYPES[s.type]?.group === 'body')
      .map((s) => ({ id: s.id, title: s.type === 'chapter' ? (s.displayTitle || s.label) : s.displayTitle, short: s.type === 'chapter' ? `Ch ${s.number}` : SECTION_TYPES[s.type].label })),
  }), sheet);
}

/* ---- snippets panel: every snippet beside the text, ready to drag in */
let snippetsShown = (() => { try { return localStorage.getItem('lutefisk.snippetsShown') === '1'; } catch { return false; } })();
function setSnippetsShown(v) {
  snippetsShown = !!v;
  if (snippetsShown && !commentsHidden_()) setCommentsHidden(true);
  try { localStorage.setItem('lutefisk.snippetsShown', snippetsShown ? '1' : '0'); } catch { /* ignore */ }
  drawSnippetsBtn();
}
function drawSnippetsBtn() {
  if (!els.snipBtn) return;
  const n = (app.book?.snippets || []).length;
  const show = snippetsShown && !!app.book && !currentResearch?.();
  els.snipBtn.hidden = !app.book || !!currentResearch?.();
  els.snipBtn.classList.toggle('on', show);
  els.snipBtn.setAttribute('aria-pressed', String(show));
  els.snipBtn.title = `Snippets — ${show ? 'hide' : 'show'} your snippets beside the text, ready to drag in${n ? ` (${n})` : ''}`;
  els.snipBtn.setAttribute('aria-label', show ? 'Hide snippets' : 'Show snippets');
  els.snipBtn.replaceChildren(icon(show ? 'snippet' : 'snippetOff', 17), n ? h('span', { class: 'snip-btn-n' }, String(n)) : '');
  if (show && app.comments && !commentsHidden_()) { app.comments.setHidden(true); drawCommentsBtn(); }
  els.snipRail.hidden = !show;
  els.editorMount.classList.toggle('with-snippets', show);
  if (show) els.snipRail.draw();
}
/** A snippet dropped into the text: insert it there, then it leaves Snippets. */
function dropSnippet(id, pos) {
  const list = app.book?.snippets || [];
  const sn = list.find((x) => x.id === id);
  if (!sn) return;
  if (!app.editor.insertMarkdownAt(sn.text, pos)) return;
  app.book.snippets = list.filter((x) => x !== sn);
  app.markDirty();
  refreshSidebar();
  toast(`Inserted “${sn.title || 'snippet'}”`, 'ok', 1800);
}

/* ---- comments: show or hide the highlights and the margin of balloons */
let commentCount = { open: 0, all: 0 };
const commentsHidden_ = () => !!app.comments?.hidden;
// Comments and Snippets share the right side: opening one closes the other.
function setCommentsHidden(v) {
  app.comments?.setHidden(v);
  if (!v && snippetsShown) setSnippetsShown(false);
  drawCommentsBtn();
}
/* ---- spelling and grammar: F7 (or the ABC button) checks now and goes to the first problem */
let spellJump = false;
function checkSpellingNow() {
  if (!app.editor) return;
  if (settings.spellOn === false) { toast('Spelling and grammar checking is off — turn it on in Settings › Spelling & Grammar', 'info', 2600); return; }
  spellJump = true;
  els.spellBtn?.classList.add('busy');
  app.editor.checkSpellingNow();
}

function drawCommentsBtn() {
  if (!els.commentsBtn) return;
  const hiddenNow = commentsHidden_();
  const n = commentCount.open;
  els.commentsBtn.hidden = !app.book || !!currentResearch?.();
  els.commentsBtn.classList.toggle('on', !hiddenNow);
  els.commentsBtn.setAttribute('aria-pressed', String(!hiddenNow));
  els.commentsBtn.title = hiddenNow
    ? `Comments — show the comment margin on the right (⌥⌘C). ${n ? `${n} open comment${n === 1 ? '' : 's'}.` : 'Select text and press ⌃⌥M to add one.'}`
    : `Comments — hide the comment margin (⌥⌘C). ${n ? `${n} open comment${n === 1 ? '' : 's'}.` : 'Select text and press ⌃⌥M to add one.'}`;
  els.commentsBtn.setAttribute('aria-label', hiddenNow ? 'Show comments' : 'Hide comments');
  els.commentsBtn.replaceChildren(icon(hiddenNow ? 'commentOff' : 'comment', 17));
}

function drawBookBar() {
  if (!app.book || !els.bookBar) return;
  const words = liveBookWords();
  if (!app.sessionStart) app.sessionStart = { words, at: Date.now() };
  const wpp = wordsPerPage(words);
  const pages = Math.max(words ? 1 : 0, Math.round(words / wpp));
  els.bbWords.num.textContent = words.toLocaleString();
  els.bbPages.num.textContent = `${pages.toLocaleString()}`;
  els.bbPages.unit.textContent = pages === 1 ? 'page' : 'pages';
  const exact = !!app.printPageCount?.();
  els.tbCount.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'} · ${exact ? '' : '~'}${pages.toLocaleString()} page${pages === 1 ? '' : 's'}`;
  els.tbCount.title = exact ? 'The whole book: words, and pages in the print layout' : `The whole book: words, and approximate pages (about ${Math.round(wpp)} words a page)`;
  els.bbPages.el.title = app.printPageCount?.() ? 'Pages in the print layout' : `Approximate — about ${Math.round(wpp)} words a page. Open the Print preview for an exact count.`;
  const target = Number(app.book.goals?.targetWords) || 0;
  els.bbGoal.hidden = !target;
  if (target) { els.bbGoal.firstChild.style.width = `${Math.min(100, (words / target) * 100)}%`; els.bbWords.el.title = `${words.toLocaleString()} of ${target.toLocaleString()} words (${Math.floor((words / target) * 100)}%)`; } else els.bbWords.el.title = '';
  const dw = words - app.sessionStart.words;
  const dp = dw / wpp;
  const dir = dw > 0 ? 'up' : dw < 0 ? 'down' : 'flat';
  els.bbSession.className = `bb-session ${dir}`;
  els.bbArrow.replaceChildren(icon(dir === 'down' ? 'down' : dir === 'up' ? 'up' : 'minus', 12));
  els.bbDeltaW.textContent = `${dw > 0 ? '+' : dw < 0 ? '−' : ''}${Math.abs(dw).toLocaleString()} words`;
  els.bbDeltaP.textContent = `${dp > 0 ? '+' : dp < 0 ? '−' : ''}${Math.abs(dp).toFixed(1)} pages`;
  const last = app.goals.sessionLog?.()[0];
  els.bbSession.title = `This session — words added or removed since you opened the book (${app.sessionStart.words.toLocaleString()} words then). Click for Insights; right-click for session details.${last ? `\nLast session: ${new Date(last.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${last.words >= 0 ? '+' : '−'}${Math.abs(last.words).toLocaleString()} words` : ''}`;
  const today = app.goals.today('book');
  const goal = app.goals.dailyTarget('book');
  els.bbToday.num.textContent = `${today > 0 ? '+' : ''}${today.toLocaleString()}`;
  els.bbToday.unit.textContent = goal ? `of ${goal.toLocaleString()} today` : 'today';
  const pr = app.goals.progress('book');
  els.bbToday.el.classList.toggle('met', pr.has ? pr.met : goal > 0 && today >= goal);
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
  drawSnippetsBtn();
  const numbered = numberSections(book.sections, templateById(book.template), book);
  const label = (s) => {
    const n = numbered.find((x) => x.id === s.id);
    if (s.type === 'chapter') return s.title || (s.exclude ? 'Untitled Chapter' : n?.label) || 'Untitled Chapter';
    return n?.displayTitle || s.title || SECTION_TYPES[s.type]?.label;
  };
  sb.replaceChildren(els.sidebarRail);
  const filterOn = filterActive();
  const filterBtn = h('button', { class: `sb-tool${filterOn ? ' on' : ''}`, title: 'Filter by label or status', 'aria-label': 'Filter by label or status', onclick: () => filterMenu(filterBtn) }, icon('filter', 15));
  sb.append(h('div', { class: 'pane-head sb-top' }, h('span', { class: 'pane-title' }, 'Binder'), filterBtn,
    h('button', { class: 'sb-tool', title: 'Hide the binder', 'aria-label': 'Hide the binder', onclick: () => setPane('binder', false) }, icon('binderHide', 16))));
  if (filterOn) sb.append(h('div', { class: 'sb-filterbar' }, icon('filter', 12),
    h('span', {}, [...binderFilter.labels].map((id) => labelById(id)?.name).concat([...binderFilter.statuses], binderFilter.excluded ? ['Excluded'] : []).filter(Boolean).join(', ')),
    h('button', { title: 'Clear filter', 'aria-label': 'Clear filter', onclick: clearFilter }, icon('close', 11))));
  const goalPr = app.goals?.progress?.('book');
  // The book: its cover (click for Book settings), and beside it Goals and Insights.
  const coverBtn = h('button', { class: 'sb-cover-btn', onclick: () => openBookSettings(app, 'general'), title: `${book.title || 'Untitled'}${book.author ? ` — ${book.author}` : ''}\nBook settings — details, cover, chapters, print`, 'aria-label': 'Book settings' },
    h('div', { class: 'sb-cover' }, book.cover ? h('img', { src: assetUrl(book.cover), alt: '' }) : generatedCover(book.title, book.author, fontStack(templateById(book.template).head), book.subtitle), h('div', { class: 'lib-spine' })));
  const sideBtn = (ic, text, sub, onclick, title) => h('button', { class: 'sb-side-btn', onclick, title }, icon(ic, 15), h('span', { class: 'sb-label' }, text), sub ? h('span', { class: 'sb-count' }, sub) : null);
  sb.append(h('div', { class: 'sb-book' }, coverBtn,
    h('div', { class: 'sb-book-side' },
      h('button', { class: 'sb-book-title', title: `${book.title || 'Untitled'} — Book settings`, onclick: () => openBookSettings(app, 'general') }, book.title || 'Untitled'),
      sideBtn('target', 'Goals', goalPr?.has ? `${Math.floor(goalPr.pct * 100)}%` : '', () => openGoals(app, app.goals, sheet), 'Writing goals and deadline'),
      sideBtn('chart', 'Insights', '', () => app.openInsights(), 'Insights — the whole book: writing history, daily charts and analysis of your text'))),
    app.search.bar);

  const scroller = h('div', { class: 'sb-scroll' });
  const navRow = (ic, text, sub, onclick, extra) => h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name', onclick }, icon(ic, 15), h('span', { class: 'sb-label' }, text), sub ? h('span', { class: 'sb-count' }, sub) : null), extra || null);
  // The logline: your story in a sentence, above everything else.
  const ll = (book.logline || '').trim();
  scroller.append(h('section', { class: 'sb-group nav-group logline' }, h('ul', { class: 'sb-list' },
    h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name sb-logline', title: ll ? `Logline — ${ll}` : 'Logline — your story in one or two sentences', onclick: () => openLogline(app, sheet, refreshSidebar) },
      icon('logline', 15), h('span', { class: 'sb-label' }, ll ? h('span', { class: 'sb-ll-text' }, ll) : 'Logline'), ll ? null : h('span', { class: 'sb-count' }, 'Add'))))));
  for (const g of GROUPS) {
    const included = book.sections.filter((s) => SECTION_TYPES[s.type]?.group === g.id && (s.enabled !== false || SECTION_TYPES[s.type].multi));
    const available = book.sections.filter((s) => SECTION_TYPES[s.type]?.group === g.id && s.enabled === false && !SECTION_TYPES[s.type].multi);
    const addBtn = h('button', { class: 'sb-add', title: `Add to ${g.label}`, 'aria-label': `Add to ${g.label}` }, icon('plus', 15));
    addBtn.addEventListener('click', () => {
      const items = [];
      if (g.id === 'body') items.push({ label: 'Chapter', icon: 'doc', hint: '⇧⌘N', onClick: () => addSection('chapter') });
      if (g.id === 'back') items.push({ label: 'Appendix', icon: 'doc', onClick: () => addSection('appendix') });
      if (items.length && available.length) items.push('-');
      for (const s of available) items.push({ label: s.type === 'about-author' ? aboutAuthorsLabel(app.book) : SECTION_TYPES[s.type].label, icon: TYPE_ICON[s.type] || 'doc', hint: SECTION_TYPES[s.type].generated ? 'Automatic' : '', onClick: () => { s.enabled = true; app.markDirty(); selectSection(s.id); } });
      if (!items.length) items.push({ label: 'All sections added', disabled: true });
      popover(addBtn, items, { width: 220 });
    });
    const ul = h('ul', { class: 'sb-list', role: 'listbox', 'aria-label': g.label });
    for (const s of included) {
      const def = SECTION_TYPES[s.type];
      const words = def.generated ? 0 : countWords(app.contents[s.id]);
      const sceneHit = filterActive() && hasScenes(s) && s.scenes.some(matchesFilter);
      const hit = filterActive() && (matchesFilter(s) || sceneHit);
      const li = h('li', { class: `sb-row${s.id === app.currentId ? ' active' : ''}${s.exclude ? ' excluded' : ''}${filterActive() ? (hit ? ' hit' : ' dim') : ''}`, title: s.exclude ? 'Excluded from export and preview' : null, role: 'option', 'aria-selected': String(s.id === app.currentId), draggable: def.multi ? 'true' : null, tabindex: -1 });
      const scenes = hasScenes(s);
      const open = scenes && (app.expanded.has(s.id) || findScene(app.currentId)?.chapter === s || (filterActive() && s.scenes.some(matchesFilter)));
      const disc = scenes ? h('span', { class: `sb-disc${open ? ' open' : ''}`, role: 'button', 'aria-label': open ? 'Collapse scenes' : 'Expand scenes', onclick: (e) => { e.stopPropagation(); if (open) app.expanded.delete(s.id); else app.expanded.add(s.id); refreshSidebar(); } }, icon('next', 12)) : null;
      if (scenes) li.classList.add('has-scenes');
      const name = h('button', { class: 'sb-name', onclick: () => selectSection(s.id), oncontextmenu: (e) => { e.preventDefault(); rowMenu(name, s); } },
        disc || icon(TYPE_ICON[s.type] || 'doc', 15),
        ...rowDecor(s).slice(0, 1),
        h('span', { class: 'sb-label' }, label(s)),
        ...rowDecor(s).slice(1),
        s.exclude ? h('span', { class: 'sb-excl', title: 'Excluded from export' }, icon('eyeOff', 13)) : null,
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
  const nChars = (book.characters || []).length;
  const nCards = (book.plot?.cards || []).filter((c) => c.col !== null).length;
  const nEvents = (book.plot?.cards || []).length;
  scroller.append(h('section', { class: 'sb-group nav-group story' }, h('div', { class: 'sb-head' }, h('span', {}, 'Tools')), h('ul', { class: 'sb-list sb-notebook' },
    navRow('people', 'Characters', nChars ? String(nChars) : '', () => openCast()),
    navRow('plot', 'Plot', nCards ? `${nCards} card${nCards === 1 ? '' : 's'}` : '', () => openPlotBoard('board')),
    navRow('clock', 'Timeline', nEvents ? `${nEvents} event${nEvents === 1 ? '' : 's'}` : '', () => openPlotBoard('timeline')),
    snippetsRow(),
    todoRow())));
  scroller.append(researchGroup());
  scroller.append(binRow());
  sb.append(scroller, app.search.panel);
  sb.classList.toggle('searching', app.search.active);
  const total = enabledSections().reduce((n, s) => n + (SECTION_TYPES[s.type].generated ? 0 : countWords(app.contents[s.id])), 0);
  sb.append(h('div', { class: 'sb-foot' }, `${total.toLocaleString()} words`));
  els.docTitle.textContent = book.title || 'Untitled';
  document.title = `${book.title || 'Untitled'} — Lutefisk`;
  updateStatus();
}
app.refreshSidebar = refreshSidebar;

/* ---- labels, statuses and export inclusion, shared by chapter and scene menus.
   Labels and statuses are per book (book.labels, book.statuses); the defaults
   are used until you add your own. */
const DEFAULT_LABELS = [['red', 'Red', '#e5484d'], ['orange', 'Orange', '#f76b15'], ['yellow', 'Yellow', '#e2b203'], ['green', 'Green', '#30a46c'], ['blue', 'Blue', '#0090ff']].map(([id, name, color]) => ({ id, name, color }));
const LABEL_PALETTE = ['#e5484d', '#f76b15', '#e2b203', '#30a46c', '#0090ff', '#8e4ec6', '#d6409f', '#12a594', '#8d8d86', '#a18072'];
const DEFAULT_STATUSES = ['To Do', 'In Progress', 'First Draft', 'Needs Review', 'Reviewed', 'Revised', 'Finished'];
const STATUS_ICON = { 'To Do': 'status', 'In Progress': 'clock', 'First Draft': 'pen', 'Needs Review': 'comment', Reviewed: 'eye', Revised: 'rotate', Finished: 'check' };
/** A chapter or scene can have several statuses (older books stored one, as status). */
const statusesOf = (x) => (Array.isArray(x?.statuses) ? x.statuses : x?.status ? [x.status] : []);
function setStatuses(x, list) {
  delete x.status;
  if (list.length) x.statuses = [...new Set(list)]; else delete x.statuses;
}
const bookLabels = () => (Array.isArray(app.book?.labels) && app.book.labels.length ? app.book.labels : DEFAULT_LABELS);
const bookStatuses = () => {
  const list = Array.isArray(app.book?.statuses) && app.book.statuses.length ? app.book.statuses : DEFAULT_STATUSES;
  if (list.includes('Reviewed')) return list;
  // Books with their own list get Reviewed too, after Needs Review.
  const i = list.indexOf('Needs Review');
  return i >= 0 ? [...list.slice(0, i + 1), 'Reviewed', ...list.slice(i + 1)] : [...list, 'Reviewed'];
};
const labelById = (id) => bookLabels().find((l) => l.id === id);
const binderFilter = { labels: new Set(), statuses: new Set(), excluded: false };
const filterActive = () => binderFilter.labels.size + binderFilter.statuses.size > 0 || binderFilter.excluded;
const clearFilter = () => { binderFilter.labels.clear(); binderFilter.statuses.clear(); binderFilter.excluded = false; refreshSidebar(); };
const matchesFilter = (x) => (!binderFilter.labels.size || binderFilter.labels.has(x.label))
  && (!binderFilter.statuses.size || statusesOf(x).some((st) => binderFilter.statuses.has(st)))
  && (!binderFilter.excluded || !!x.exclude);

function rowDecor(x) {
  const lb = x.label && labelById(x.label);
  return [
    lb ? h('span', { class: 'sb-dot', style: { background: lb.color }, title: lb.name }) : null,
    ...statusesOf(x).slice(0, 3).map((st) => h('span', { class: `sb-status${st === 'Finished' ? ' done' : ''}`, title: st }, icon(STATUS_ICON[st] || 'tag', 12))),
  ];
}

async function newLabel(target) {
  let color = LABEL_PALETTE.find((c) => !bookLabels().some((l) => l.color === c)) || LABEL_PALETTE[0];
  const sw = h('div', { class: 'lbl-row' }, LABEL_PALETTE.map((c) => {
    const b = h('button', { type: 'button', class: `lbl-sw${c === color ? ' on' : ''}`, style: { background: c }, 'aria-label': c, onclick: () => { color = c; sw.querySelectorAll('.lbl-sw').forEach((x) => x.classList.toggle('on', x === b)); } });
    return b;
  }));
  const res = await dialog({ title: 'New Label', fields: [{ name: 'name', label: 'Name', placeholder: 'e.g. Flashback, Needs research, Mara POV' }], body: h('div', { class: 'fld' }, h('span', {}, 'Color'), sw), ok: 'Add Label' });
  const name = res?.name?.trim();
  if (!name) return;
  if (!Array.isArray(app.book.labels) || !app.book.labels.length) app.book.labels = DEFAULT_LABELS.map((l) => ({ ...l }));
  const existing = app.book.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
  const lb = existing || { id: newId('lbl'), name, color };
  if (!existing) app.book.labels.push(lb);
  if (target) target.label = lb.id;
  app.markDirty(); refreshSidebar();
}
function labelMenu(anchor, target, after) {
  popover(anchor, [
    { header: 'Label' },
    ...bookLabels().map((l) => ({ label: l.name, node: null, icon: target.label === l.id ? 'check' : null, swatch: l.color, onClick: () => { target.label = l.id; app.markDirty(); refreshSidebar(); after?.(); } })),
    '-',
    { label: 'New Label…', icon: 'plus', onClick: () => newLabel(target).then(() => after?.()) },
    target.label ? { label: 'Remove Label', icon: 'close', onClick: () => { delete target.label; app.markDirty(); refreshSidebar(); after?.(); } } : null,
  ].filter(Boolean), { width: 220 });
}
async function newStatus(target) {
  const res = await dialog({ title: 'New Status', fields: [{ name: 'name', label: 'Status', placeholder: 'e.g. With editor, Line edit' }], ok: 'Add Status' });
  const name = res?.name?.trim().slice(0, 40);
  if (!name) return;
  if (!Array.isArray(app.book.statuses) || !app.book.statuses.length) app.book.statuses = [...DEFAULT_STATUSES];
  if (!app.book.statuses.some((x) => x.toLowerCase() === name.toLowerCase())) app.book.statuses.push(name);
  if (!app.book.statuses.includes('Reviewed')) app.book.statuses = bookStatuses();
  if (target) setStatuses(target, [...statusesOf(target), app.book.statuses.find((x) => x.toLowerCase() === name.toLowerCase())]);
  app.markDirty(); refreshSidebar();
}
/** An invisible stand-in at a rectangle, for reopening a menu whose button was redrawn. */
function ghostAnchor(r) {
  const g = h('span', { 'aria-hidden': 'true', style: { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: 'none' } });
  document.body.append(g);
  return g;
}
/** Statuses: pick as many as apply; the menu stays open so you can tick several. */
function statusMenu(anchor, target, after) {
  const cur = statusesOf(target);
  const toggle = (st) => {
    // Remember where the menu was: the binder redraws, so reopen it at the same spot.
    const r = anchor.getBoundingClientRect();
    setStatuses(target, cur.includes(st) ? cur.filter((x) => x !== st) : [...cur, st]);
    app.markDirty(); refreshSidebar(); after?.();
    const at = anchor.isConnected ? anchor : ghostAnchor(r);
    setTimeout(() => { statusMenu(at, target, after); if (at !== anchor) at.remove(); });
  };
  popover(anchor, [
    { header: 'Status — choose any that apply' },
    ...bookStatuses().map((st) => ({ label: st, icon: cur.includes(st) ? 'check' : STATUS_ICON[st] || 'tag', onClick: () => toggle(st) })),
    '-',
    { label: 'New Status…', icon: 'plus', onClick: () => newStatus(target).then(() => after?.()) },
    cur.length ? { label: 'Clear Statuses', icon: 'close', onClick: () => { setStatuses(target, []); app.markDirty(); refreshSidebar(); after?.(); } } : null,
  ].filter(Boolean), { width: 240 });
}
function filterMenu(anchor) {
  const toggle = (set, v) => { if (set.has(v)) set.delete(v); else set.add(v); refreshSidebar(); };
  popover(anchor, [
    { header: 'Show only — label' },
    ...bookLabels().map((l) => ({ label: l.name, swatch: l.color, icon: binderFilter.labels.has(l.id) ? 'check' : null, onClick: () => toggle(binderFilter.labels, l.id) })),
    '-', { header: 'Show only — status' },
    ...bookStatuses().map((st) => ({ label: st, icon: binderFilter.statuses.has(st) ? 'check' : STATUS_ICON[st] || 'tag', onClick: () => toggle(binderFilter.statuses, st) })),
    '-', { header: 'Show only — export' },
    { label: 'Excluded from Export & Print', icon: binderFilter.excluded ? 'check' : 'eyeOff', onClick: () => { binderFilter.excluded = !binderFilter.excluded; refreshSidebar(); } },
    ...(filterActive() ? ['-', { label: 'Clear Filter', icon: 'close', onClick: clearFilter }] : []),
  ], { width: 230 });
}
/** The shared part of the chapter/scene context menu. */
function organizeItems(anchor, target, onExport) {
  const lb = target.label && labelById(target.label);
  return [
    { label: 'Label', icon: 'tag', hint: lb ? lb.name : '', onClick: () => setTimeout(() => labelMenu(anchor, target)) },
    { label: 'Status', icon: 'status', hint: statusesOf(target).join(', '), onClick: () => setTimeout(() => statusMenu(anchor, target)) },
    exportItem(target, onExport),
  ];
}
function exportItem(target, onChange) {
  return target.exclude
    ? { label: 'Include in Export', icon: 'eye', onClick: () => { delete target.exclude; onChange(); toast('Included in export and preview', 'info', 1500); } }
    : { label: 'Exclude from Export', icon: 'eyeOff', onClick: () => { target.exclude = true; onChange(); toast('Excluded from export and preview — it stays in your manuscript', 'info', 2200); } };
}
const afterExportChange = () => { app.markDirty(); refreshSidebar(); schedulePreview(false, true); };

function rowMenu(anchor, s) {
  const def = SECTION_TYPES[s.type];
  const items = [];
  if (s.type === 'chapter') items.push({ label: 'New Chapter Before', icon: 'plus', onClick: () => addSection('chapter', { before: s }) }, { label: 'New Chapter After', icon: 'plus', onClick: () => addSection('chapter', { after: s }) }, '-');
  if (!def.generated) items.push(...organizeItems(anchor, s, afterExportChange), '-');
  if (def.multi) {
    items.push({ label: 'Move Up', icon: 'up', onClick: () => moveSection(s.id, -1) }, { label: 'Move Down', icon: 'down', onClick: () => moveSection(s.id, 1) });
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

function addSection(type, { before, after } = {}) {
  const s = { id: newId(type.slice(0, 3)), type, enabled: true, title: type === 'chapter' ? '' : 'Appendix', stats: { created: new Date().toISOString(), days: {} } };
  const list = app.book.sections;
  const cur = currentSection();
  let idx;
  const lastOfType = list.map((x) => x.type).lastIndexOf(type);
  if (before) idx = list.indexOf(before);
  else if (after) idx = list.indexOf(after) + 1;
  else if (cur && cur.type === type) idx = list.indexOf(cur) + 1;
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
  if (!(await confirmDialog(`Delete “${s.title || SECTION_TYPES[s.type].label}”?`, `${words.toLocaleString()} words. It moves to the Recycle Bin, where you can restore it.`))) return;
  flushSerialize();
  const i = app.book.sections.indexOf(s);
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === id);
  const texts = { [id]: app.contents[id] || '' };
  for (const sc of s.scenes || []) texts[sc.id] = app.contents[sc.id] || '';
  toBin(app.book, { kind: 'section', title: s.type === 'chapter' ? ([n?.label, s.title].filter(Boolean).join(': ') || 'Chapter') : (s.title || SECTION_TYPES[s.type].label), item: s, texts, where: { index: i, after: app.book.sections[i - 1]?.id || null } });
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
  const aboutLbl = s.type === 'about-author' ? aboutAuthorsLabel(app.book) : '';
  els.secTitle.value = aboutLbl && /^about the authors?$/i.test((s.title || '').trim()) ? aboutLbl : s.title || '';
  els.secTitle.placeholder = s.type === 'chapter' ? 'Chapter title' : aboutLbl || def.label;
  els.dcRow.hidden = !['chapter', 'prologue', 'epilogue'].includes(s.type);
  els.dcSwitch.checked = s.dropCap !== false;
  els.headRow.hidden = s.type !== 'chapter';
  els.sceneBtn.hidden = !SCENE_TYPES.includes(s.type);
  els.sceneBtnLabel.textContent = 'Scenes';
  els.secSub.hidden = !SCENE_TYPES.includes(s.type); els.secSub.value = s.subtitle || '';
  showNotesButton(s);
  syncHeadSel();
  els.secExtra.replaceChildren();
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
  const li = h('li', { class: `sb-row scene${active ? ' active' : ''}${sc.exclude ? ' excluded' : ''}${filterActive() ? (matchesFilter(sc) ? ' hit' : ' dim') : ''}`, title: sc.exclude ? 'Excluded from export and preview' : null, role: 'option', 'aria-selected': String(active), draggable: 'true', tabindex: -1 });
  const name = h('button', { class: 'sb-name', onclick: () => selectSection(sc.id), oncontextmenu: (e) => { e.preventDefault(); sceneMenu(name, chapter, sc); } },
    icon('scene', 14), ...rowDecor(sc).slice(0, 1), h('span', { class: 'sb-label' }, sceneLabel(sc, i)), ...rowDecor(sc).slice(1), sc.exclude ? h('span', { class: 'sb-excl', title: 'Excluded from export' }, icon('eyeOff', 13)) : null, h('span', { class: 'sb-count' }, countWords(app.contents[sc.id]).toLocaleString()));
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
    { label: 'New Chapter Before', icon: 'plus', onClick: () => addSection('chapter', { before: chapter }) },
    { label: 'New Chapter After', icon: 'plus', onClick: () => addSection('chapter', { after: chapter }) },
    '-',
    ...organizeItems(anchor, sc, () => { rejoin(chapter); afterExportChange(); }),
    '-',
    { label: 'Add Scene Before', icon: 'plus', onClick: () => addScene(chapter, i) },
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
   Stored in lutefisk.yaml next to each section so it travels with the book. */
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

/* A chapter or scene was opened: refresh the Comments button. */
function showNotesButton(node) {
  if (node.synopsis && !node.notes) { node.notes = node.synopsis; app.markDirty(); } // older books: keep the text, no longer shown
  delete node.synopsis;
  drawCommentsBtn();
  drawSnippetsBtn();
  if (els.spellBtn) els.spellBtn.hidden = !app.book;
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
  if (words && !(await confirmDialog(`Delete “${sceneLabel(sc, chapter.scenes.indexOf(sc))}”?`, `${words.toLocaleString()} words. It moves to the Recycle Bin, where you can restore it.`))) return;
  flushSerialize();
  const i = chapter.scenes.indexOf(sc);
  const cn = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === chapter.id);
  toBin(app.book, { kind: 'scene', title: sceneLabel(sc, i), item: sc, texts: { [sc.id]: app.contents[sc.id] || '' }, where: { chapter: chapter.id, index: i, from: [cn?.label, chapter.title].filter(Boolean).join(': ') } });
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
  app.contents[chapter.id] = joinScenes(chapter.scenes, app.contents, { all: true });
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
  els.secSub.hidden = true; els.commentsBtn.hidden = true; els.snipBtn.hidden = true; els.snipRail.hidden = true; els.spellBtn.hidden = true;
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
  els.secTitle.placeholder = 'Scene title';
  els.dcRow.hidden = index !== 0;
  els.dcSwitch.checked = chapter.dropCap !== false;
  els.sceneBtn.hidden = false;
  els.sceneBtnLabel.textContent = `Scene ${index + 1} of ${chapter.scenes.length}`;
  showNotesButton(scene);
  const drawSceneTools = () => els.secExtra.replaceChildren(organizeTools(scene, { kind: 'scene', onChange: drawSceneTools, insights: () => openSceneInsights(chapter, scene) }));
  drawSceneTools();
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
  const redraw = () => selectChapterOverview(chapter);
  const cards = h('div', { class: 'scene-cards' }, chapter.scenes.map((sc, i) => {
    const card = h('div', { class: `scene-card${sc.exclude ? ' excluded' : ''}`, draggable: 'true', title: 'Click to open · drag to reorder', role: 'button', tabindex: '0',
      onclick: (e) => { if (!e.target.closest('.sc-tools')) selectSection(sc.id); },
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); selectSection(sc.id); } },
      oncontextmenu: (e) => { e.preventDefault(); sceneMenu(e.currentTarget, chapter, sc); } },
    h('div', { class: 'sc-num' }, `Scene ${i + 1}`, sc.exclude ? h('span', { class: 'sc-excl', title: 'Excluded from export' }, icon('eyeOff', 12), 'Excluded') : null),
    h('b', {}, sc.title || 'Untitled scene'),
    h('p', {}, sceneSnippet(app.contents[sc.id], 28) || 'Empty'),
    h('small', {}, `${countWords(app.contents[sc.id]).toLocaleString()} words`),
    organizeTools(sc, { kind: 'scene', compact: true, onChange: redraw, insights: () => openSceneInsights(chapter, sc) }));
    return dragCard(chapter, sc, i, card);
  }),
  h('button', { class: 'scene-card add', onclick: () => addScene(chapter) }, icon('plus', 22), h('span', {}, 'Add Scene')));
  // The chapter as a whole: Insights, label, status and export.
  const tools = organizeTools(chapter, { kind: 'chapter', onChange: redraw, insights: () => openChapterInsights(chapter) });
  els.genMount.replaceChildren(h('div', { class: 'gen-panel wide' },
    tools,
    cards,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', onclick: () => combineScenes(chapter) }, 'Combine into One Chapter'))));
  app.expanded.add(chapter.id);
  refreshSidebar();
  pendingGoTo = goTo || 'start';
  schedulePreview(false, true);
}

/**
 * Insights, Label, Status and Exclude from export for a chapter or a scene.
 * compact: the small version on scene cards (icons, label dot, status and a switch).
 */
function organizeTools(target, { kind, compact = false, onChange, insights }) {
  const lb = target.label && labelById(target.label);
  const chip = (ic, text, title, onclick, cls = '') => h('button', { type: 'button', class: `chip-toggle ch-chip ${cls}`.trim(), title, 'aria-label': title, onclick: (e) => { e.stopPropagation(); onclick(e); } }, ic, text ? h('span', {}, text) : null);
  const sw = h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: !!target.exclude, 'aria-label': `Exclude this ${kind} from export` });
  sw.addEventListener('click', (e) => e.stopPropagation());
  sw.addEventListener('change', () => {
    if (sw.checked) target.exclude = true; else delete target.exclude;
    afterExportChange();
    toast(sw.checked ? 'Excluded from export and preview — it stays in your manuscript' : 'Included in export and preview', 'info', 1800);
    onChange?.();
  });
  return h('div', { class: `ch-tools${compact ? ' sc-tools' : ''}`, onmousedown: (e) => e.stopPropagation(), draggable: compact ? 'false' : null, ondragstart: compact ? (e) => { e.preventDefault(); e.stopPropagation(); } : null },
    chip(icon('chart', compact ? 13 : 15), compact ? '' : 'Insights', `Insights — analyze just this ${kind}`, () => insights()),
    chip(lb ? h('span', { class: 'sb-dot', style: { background: lb.color } }) : icon('tag', compact ? 13 : 15), lb ? lb.name : compact ? '' : 'Label', lb ? `Label: ${lb.name}` : `Label this ${kind}`, (e) => labelMenu(e.currentTarget, target, onChange), lb ? 'on' : ''),
    chip(icon(STATUS_ICON[statusesOf(target)[0]] || 'status', compact ? 13 : 15), statusesOf(target).join(', ') || (compact ? '' : 'Status'), statusesOf(target).length ? `Status: ${statusesOf(target).join(', ')}` : `Set the ${kind}’s statuses`, (e) => statusMenu(e.currentTarget, target, onChange), statusesOf(target).length ? 'on' : ''),
    h('label', { class: 'ch-exclude', title: `Leave this ${kind} out of the preview and every export`, onclick: (e) => e.stopPropagation() }, sw, h('span', {}, compact ? 'Exclude' : 'Exclude from export')));
}

function openSceneInsights(chapter, sc) {
  flushSerialize();
  const i = chapter.scenes.indexOf(sc);
  const name = sceneLabel(sc, i);
  openInsights(app, app.goals, sheet, { tab: 'text', textOnly: true, title: `Insights — ${name}`, unitLabel: 'Scene', textUnits: () => [{ id: sc.id, title: name, type: 'chapter', text: proseText(app.contents[sc.id]) }], pages: () => 0 });
}

function openChapterInsights(chapter) {
  flushSerialize();
  const n = numberSections(app.book.sections, templateById(app.book.template), app.book).find((x) => x.id === chapter.id);
  const name = chapter.type === 'chapter' ? [n?.label, n?.displayTitle].filter(Boolean).join(': ') || 'Chapter' : n?.displayTitle || chapter.title || 'Section';
  const units = hasScenes(chapter)
    ? chapter.scenes.map((sc, i) => ({ id: sc.id, title: sceneLabel(sc, i), type: 'chapter', text: proseText(app.contents[sc.id]) }))
    : [{ id: chapter.id, title: name, type: chapter.type, text: proseText(app.contents[chapter.id]) }];
  openInsights(app, app.goals, sheet, { tab: 'text', textOnly: true, title: `Insights — ${name}`, unitLabel: hasScenes(chapter) ? 'Scene' : 'Chapter', textUnits: () => units, pages: () => 0 });
}

/* ============================================================== research */

function researchGroup() {
  const items = app.book.research || [];
  const addBtn = h('button', { class: 'sb-add', title: 'Add research', 'aria-label': 'Add research' }, icon('plus', 15));
  addBtn.addEventListener('click', () => popover(addBtn, [
    { label: 'Note', icon: 'doc', onClick: () => addResearch('note') },
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
  return h('section', { class: 'sb-group research' }, h('div', { class: 'sb-head' }, h('span', {}, 'Research'), addBtn), ul);
}

/** Tools › Snippets: the number saved. */
function snippetsRow() {
  const n = (app.book.snippets || []).length;
  return h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name', title: 'Snippets — passages saved to insert into a chapter or scene later', onclick: () => openSnippetsSheet() },
    icon('snippet', 15), h('span', { class: 'sb-label' }, 'Snippets'), n ? h('span', { class: 'sb-count' }, String(n)) : null));
}
/** Tools › To-Do: open count, and a red badge with the number overdue. */
function todoRow() {
  const list = Array.isArray(app.book.todos) ? app.book.todos : [];
  const open = list.filter((t) => !t.done).length;
  const late = overdueCount(app.book);
  return h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name sb-todo', title: `To-Do — things to do for this book${open ? ` · ${open} open` : ''}${late ? ` · ${late} overdue` : ''}`, onclick: () => openTodos(app, sheet, refreshSidebar) },
    icon('checklist', 15), h('span', { class: 'sb-label' }, 'To-Do'),
    late ? h('span', { class: 'sb-overdue', 'aria-label': `${late} overdue` }, String(late)) : null,
    open ? h('span', { class: 'sb-count' }, String(open)) : null));
}

/* ---- Recycle Bin */
function binRow() {
  const n = binCount(app.book);
  return h('section', { class: 'sb-group nav-group bin-group' }, h('ul', { class: 'sb-list' },
    h('li', { class: 'sb-row nav' }, h('button', { class: 'sb-name sb-bin', title: 'Recycle Bin — deleted chapters, scenes, notes, snippets, to-dos, characters and plot cards. Restore them from here.', onclick: () => openBin() },
      icon('trash', 15), h('span', { class: 'sb-label' }, 'Recycle Bin'), n ? h('span', { class: 'sb-count' }, String(n)) : null))));
}
function openBin() { openRecycleBin(app, sheet, { restore: restoreFromBin, onChange: () => { refreshSidebar(); app.refreshPreview(true); } }); }
/** Put a Recycle Bin entry back where it was. Returns true when restored. */
function restoreFromBin(e) {
  const b = app.book;
  const unique = (id) => !(b.sections.some((x) => x.id === id || x.scenes?.some((sc) => sc.id === id)) || (b.research || []).some((x) => x.id === id));
  const putText = (id, text, note = false) => {
    app.contents[id] = text ?? '';
    if (note) { app.removedNotes = app.removedNotes.filter((x) => x !== id); app.dirtyNotes.add(id); }
    else { app.removed = app.removed.filter((x) => x !== id); app.dirtyFiles.add(id); }
    app.htmlCache.delete?.(id);
  };
  const it = e.item;
  if (!it) return false;
  switch (e.kind) {
    case 'section': {
      if (!unique(it.id)) { toast('It’s already in the book', 'info'); return true; }
      const after = e.where?.after ? b.sections.findIndex((x) => x.id === e.where.after) : -1;
      const at = after >= 0 ? after + 1 : Math.min(e.where?.index ?? b.sections.length, b.sections.length);
      // Only one of each single section (title page, dedication…): if it was re-added, switch the existing one on instead.
      if (!SECTION_TYPES[it.type]?.multi && b.sections.some((x) => x.type === it.type && it.type !== 'chapter')) {
        const ex = b.sections.find((x) => x.type === it.type);
        ex.enabled = true;
        putText(ex.id, e.texts?.[it.id] ?? '');
      } else {
        b.sections.splice(at, 0, it);
        for (const [id, text] of Object.entries(e.texts || {})) putText(id, text);
      }
      app.markDirty(); app.htmlCache.clear();
      selectSection(it.id);
      return true;
    }
    case 'scene': {
      const ch = b.sections.find((x) => x.id === e.where?.chapter);
      const text = e.texts?.[it.id] ?? '';
      if (ch && hasScenes(ch)) {
        if (!unique(it.id)) return true;
        ch.scenes.splice(Math.min(e.where.index ?? ch.scenes.length, ch.scenes.length), 0, it);
        putText(it.id, text);
        rejoin(ch);
        app.markDirty(); app.htmlCache.clear();
        selectSection(it.id);
      } else if (ch) {
        // The chapter no longer has scenes: add the text at its end, after a scene break.
        flushSerialize();
        const prev = (app.contents[ch.id] || '').replace(/\s+$/, '');
        putText(ch.id, `${prev}${prev ? '\n\n* * *\n\n' : ''}${text.trim()}\n`);
        app.editor.forget?.(ch.id);
        app.markDirty(); app.htmlCache.clear();
        selectSection(ch.id);
        toast('Added at the end of its chapter', 'info', 2200);
      } else {
        // Its chapter was deleted too: it comes back as a chapter of its own, at the end of the body.
        const fresh = { id: it.id, type: 'chapter', title: it.title || '', enabled: true };
        const end = b.sections.findIndex((x) => x.type === 'epilogue' || SECTION_TYPES[x.type].group === 'back');
        b.sections.splice(end < 0 ? b.sections.length : end, 0, fresh);
        putText(it.id, text);
        app.markDirty(); app.htmlCache.clear();
        selectSection(it.id);
        toast('Its chapter is gone, so it came back as a chapter', 'info', 2600);
      }
      return true;
    }
    case 'research': {
      b.research = Array.isArray(b.research) ? b.research : [];
      if (!unique(it.id)) return true;
      b.research.splice(Math.min(e.where?.index ?? b.research.length, b.research.length), 0, it);
      if (isTextItem(it)) putText(it.id, e.texts?.[it.id] ?? '', true);
      app.markDirty();
      return true;
    }
    case 'snippet': b.snippets = Array.isArray(b.snippets) ? b.snippets : []; b.snippets.splice(Math.min(e.where?.index ?? 0, b.snippets.length), 0, it); app.markDirty(); return true;
    case 'todo': b.todos = Array.isArray(b.todos) ? b.todos : []; b.todos.push(it); app.markDirty(); return true;
    case 'character': {
      b.characters = Array.isArray(b.characters) ? b.characters : [];
      b.characters.splice(Math.min(e.where?.index ?? b.characters.length, b.characters.length), 0, it);
      for (const card of b.plot?.cards || []) if ((e.where?.cards || []).includes(card.id)) card.chars = [...new Set([...(card.chars || []), it.id])];
      app.markDirty();
      return true;
    }
    case 'card': {
      if (!b.plot) { toast('The plot board isn’t set up', 'warn'); return false; }
      const line = b.plot.lines?.some((l) => l.id === it.line) ? it.line : b.plot.lines?.[0]?.id;
      const col = b.plot.columns?.some((c) => c.id === it.col) ? it.col : b.plot.columns?.[0]?.id;
      b.plot.cards.push({ ...it, line, col });
      app.markDirty();
      return true;
    }
    default: return false;
  }
}

/* ---- snippets: insert into any chapter or scene */
function snippetTargets() {
  flushSerialize();
  const out = [];
  const cur = currentScene()?.id || (currentSection() && !SECTION_TYPES[currentSection().type]?.generated && !hasScenes(currentSection()) ? currentSection().id : null);
  for (const s of numberSections(app.book.sections, templateById(app.book.template), app.book)) {
    if (SECTION_TYPES[s.type]?.generated) continue;
    const label = s.type === 'chapter' ? (s.displayTitle ? `${s.label ? `${s.label}: ` : ''}${s.displayTitle}` : s.label || 'Chapter') : (s.tocTitle || s.displayTitle);
    if (hasScenes(s)) {
      out.push({ id: null, label, depth: 0, group: true });
      s.scenes.forEach((sc, i) => out.push({ id: sc.id, label: sceneLabel(sc, i), depth: 1, current: sc.id === cur }));
    } else out.push({ id: s.id, label, depth: 0, current: s.id === cur });
  }
  return out.filter((t) => t.id);
}
function insertSnippetInto(snip, id, atEnd = false) {
  if (!id) return false;
  if (id === app.currentId && !atEnd && !els.editorMount.hidden) return app.editor.insertMarkdown(snip.text);
  flushSerialize();
  const prev = (app.contents[id] || '').replace(/\s+$/, '');
  app.contents[id] = `${prev}${prev ? '\n\n' : ''}${snip.text.trim()}\n`;
  app.dirtyFiles.add(id);
  app.editor.forget?.(id);
  if (id === app.currentId) selectSection(id);
  app.markDirty();
  refreshSidebar();
  schedulePreview(false, true);
  return true;
}
function openSnippetsSheet() {
  openSnippets(app, sheet, { targets: snippetTargets, insert: insertSnippetInto }, refreshSidebar);
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
  if (!(await confirmDialog(`Delete “${r.title}”?`, isTextItem(r) ? 'It moves to the Recycle Bin, where you can restore it.' : 'It moves to the Recycle Bin, where you can restore it. The file itself stays in the book’s research folder.'))) return;
  flushSerialize();
  toBin(app.book, { kind: 'research', title: r.title, item: r, texts: isTextItem(r) ? { [r.id]: app.contents[r.id] || '' } : {}, where: { index: app.book.research.indexOf(r) } });
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
      if (!entries.length) list.append(h('p', { class: 'hint' }, 'Your bibliography is empty. Add sources first — paste a link in the Bibliography section.'));
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
  if (writingFocus && previewFocus) toggleFocus(false);
  els.shell.classList.toggle('writing-focus', writingFocus);
  els.edFocusBtn.replaceChildren(icon(writingFocus ? 'collapse' : 'expand', 15), h('span', {}, writingFocus ? 'Exit Focus' : 'Focus'));
  els.edFocusBtn.classList.toggle('on', writingFocus);
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
  if (where === 'toc') {
    const t = list.find((x) => x.type === 'toc') || list.find((x) => SECTION_TYPES[x.type]?.group === 'body');
    if (t) { app.previewId = t.id; pendingGoTo = 'start'; }
  }
  if (where === 'first') { app.previewId = list[0]?.id; pendingGoTo = 'start'; }
  if (list.some((x) => x.id === where)) { app.previewId = where; pendingGoTo = 'start'; }
  schedulePreview();
};
/** The preview's Contents button: every part of the book, front cover to back. */
app.previewContents = (anchor) => {
  const numbered = numberSections(app.book.sections, templateById(app.book.template), app.book).filter((s) => !s.exclude);
  const groups = { front: 'Front Matter', body: 'Body', back: 'Back Matter' };
  const items = [{ label: 'Front Cover', icon: 'cover', onClick: () => app.previewJump('cover') }];
  let g = null;
  for (const s of numbered) {
    const grp = SECTION_TYPES[s.type]?.group || 'body';
    if (grp !== g) { g = grp; items.push('-', { header: groups[grp] || 'Body' }); }
    const label = s.type === 'chapter' ? (s.displayTitle ? `${s.label ? `${s.label}: ` : ''}${s.displayTitle}` : s.label || s.tocTitle) : (s.tocTitle || s.displayTitle || SECTION_TYPES[s.type]?.label);
    items.push({ label: `${app.previewId === s.id && !app.previewSpecial ? '✓ ' : ''}${label}`, icon: s.type === 'toc' ? 'toc' : 'doc', onClick: () => app.previewJump(s.id) });
  }
  items.push('-', { label: app.book.backCover ? 'Back Cover' : 'End of Book', icon: 'book', onClick: () => app.previewJump('end') });
  popover(anchor, items, { width: 280, maxHeight: 460 });
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

const TEMPLATE_EXAMPLE = [
  'Morning came slowly to the valley, spilling over the ridge like honey from a tipped jar. Mara had been awake for an hour already, listening to the house settle and the kettle tick as it cooled.',
  'She packed the lantern anyway. Her grandmother had said it would be needed, and her grandmother had never once been wrong about weather, or roads, or people.',
  '“You’ll want the long coat,” the old woman said from her chair by the stove. “The pass keeps its own seasons.”',
  'Mara took the coat. She did not argue; there was no point arguing with someone who had already decided how a story ended.',
  '* * *',
  'By noon the road had narrowed to a path, and the path to a suggestion. The heather closed in on either side, and the wind came down off the high ground carrying the smell of rain that had not yet decided to fall.',
  'She walked until the light went copper, then gold, then grey, and when at last she stopped to rest she found that the valley had vanished behind her, as if it had never been there at all.',
].join('\n\n');

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
app.refreshAll = () => {
  app.htmlCache.clear(); refreshSidebar(); app.device.build(); fullPrint = true; schedulePreview(false, true);
  for (const el of document.querySelectorAll('.ts-strip')) el.draw?.();
};

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
  if (app.view === 'device' && app.tplExample) {
    // Browsing templates: the device shows example text in each design (unless Live is on).
    const ex = numberSections([{ id: '__example', type: 'chapter', title: 'The Lantern Road' }], tpl, app.book)[0];
    const html = renderSection(ex, { book: app.book, contents: { __example: TEMPLATE_EXAMPLE }, assetUrl, sections: [ex] }).html;
    app.device.render({ html, sectionTitle: ex.tocTitle, bookTitle: app.book.title || 'The Lantern Road', before: 0, chars: 1, total: 1, special: null, sectionIndex: 0, sectionCount: 1, goTo: 'start' }, null);
    return;
  }
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

/** Template browsing: example text by default; Live (a saved choice) shows your own book. */
app.templateLive = () => { try { return localStorage.getItem('lutefisk.tplLive') === '1'; } catch { return false; } };
app.setTemplateLive = (on) => {
  try { localStorage.setItem('lutefisk.tplLive', on ? '1' : '0'); } catch { /* ignore */ }
  if (app.tplBrowsing) app.setTemplateBrowsing(true);
};
app.setTemplateBrowsing = (on) => {
  app.tplBrowsing = on;
  const ex = on && !app.templateLive();
  if (ex === !!app.tplExample) return;
  app.tplExample = ex;
  schedulePreview(false, !ex);
};

function setView(v) {
  app.view = v;
  els.viewSeg.setValue(v);
  const row1 = v === 'print' ? app.print?.row1 : v === 'device' ? app.device?.row1 : null;
  els.pvRow1.replaceChildren(...(row1 ? [row1] : []));
  const zoom = v === 'print' ? app.print?.zoom : v === 'device' ? app.device?.zoom : null;
  els.pvZoom.replaceChildren(...(zoom ? [zoom] : []));
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
  drawBookBar();
  const r = currentResearch();
  if (r) {
    els.status.textContent = isTextItem(r) ? `${countWords(liveText()).toLocaleString()} words · research (not in book)` : `${RESEARCH_LABEL[r.kind]} · research (not in book)`;
    return;
  }
  const sc = findScene(app.currentId);
  if (sc) {
    const here = countWords(liveText());
    els.status.textContent = `${here.toLocaleString()} words in scene · ${countWords(app.contents[sc.chapter.id]).toLocaleString()} in chapter`;
    return;
  }
  const s = currentSection();
  const book = liveBookWords();
  if (!s || SECTION_TYPES[s.type].generated || hasScenes(s)) { els.status.textContent = `${book.toLocaleString()} words in book`; return; }
  const here = countWords(liveText());
  els.status.textContent = `${here.toLocaleString()} words · ${book.toLocaleString()} in book`;
}
// While you type, the counts update a few times a second (not only when you pause).
let statusTimer = 0, statusLast = 0;
const updateStatusSoon = () => {
  const wait = Math.max(0, 200 - (performance.now() - statusLast));
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusLast = performance.now(); updateStatus(); }, wait);
};

/* ========================================================== persistence */

const autosave = autosaver(() => save());
function setSaveState(text, cls) { els.save.textContent = text; els.save.className = `doc-sub ${cls}`; }
app.markDirty = () => {
  app.metaDirty = true;
  setSaveState(settings.autosave ? 'Edited' : 'Unsaved changes', 'pending');
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
  if (data.book?.kind && data.book.kind !== 'book') {
    toast('That project isn’t a book. This version of Lutefisk opens books only.', 'error', 6000);
    return;
  }
  mode = 'book';
  const book = data.book;
  // One chapter-heading setting replaces “show titles” and the “no number” style.
  if (book.chapterHeading === undefined) {
    if (book.chapterTitles === false) book.chapterHeading = 'number';
    else if (book.chapterNumbering === 'none') { book.chapterHeading = 'title'; book.chapterNumbering = ''; }
    delete book.chapterTitles;
  }
  // "References" is now "Bibliography".
  for (const s of book.sections || []) if (s.type === 'bibliography' && (!s.title || s.title === 'References')) s.title = 'Bibliography';
  const d = defaultBook();
  for (const k of Object.keys(d)) if (book[k] === undefined) book[k] = d[k];
  book.print = { ...d.print, ...(book.print || {}) };
  book.preview = { ...d.preview, ...(book.preview || {}) };
  book.uuid ||= crypto.randomUUID();
  ensureSections(book);
  book.research = Array.isArray(book.research) ? book.research : [];
  setCustomTemplates(book.customTemplates);
  syncAuthors(book);
  applyGoalReset(book);
  app.book = book;
  app.sessionStart = null;
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
  for (const el of document.querySelectorAll('.ts-strip')) el.draw?.();
  resumeTour(app);
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
      toast(`Preparing ${({ epub: 'EPUB', docx: 'Word document', md: 'Markdown', rtf: 'RTF', mobi: 'MOBI', txt: 'plain text' })[kind]}…`);
      out = await ({ epub: B.exportEpub, docx: B.exportDocx, md: B.exportMarkdown, rtf: B.exportRtf, mobi: B.exportMobi, txt: B.exportText })[kind]({ book: plainBook(), contents: { ...app.contents } });
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
  switch (cmd) {
    case 'new-book': await showLibrary(); return newBookSheet(await B.library());
    case 'open-book': return openBook();
    case 'library': return showLibrary();
    case 'help': return openHelp(app);
    case 'tour': return startTour(app);
    case 'save': if (app.book) { await save(); toast('Saved', 'ok', 1200); } return undefined;
    case 'new-chapter': return app.book && addSection('chapter');
    case 'new-scene': return app.book && newSceneHere();
    case 'split-scene': return app.book && splitAtCursor();
    case 'export-epub': return doExport('epub');
    case 'export-pdf': return doExport('pdf');
    case 'export-docx': return doExport('docx');
    case 'export-md': return doExport('md');
    case 'export-rtf': return doExport('rtf');
    case 'export-txt': return doExport('txt');
    case 'export-mobi': return doExport('mobi');
    case 'reveal': return app.book && B.revealBook();
    case 'view-device': if (app.book) { togglePreview(true); setView('device'); } return undefined;
    case 'view-print': if (app.book) { togglePreview(true); setView('print'); } return undefined;
    case 'view-stats': return app.book && app.openInsights('text');
    case 'zoom-in': return zoom(1);
    case 'zoom-out': return zoom(-1);
    case 'zoom-reset': return zoom(0);
    case 'toggle-sidebar': return app.book && toggleSidebar();
    case 'toggle-preview': return app.book && toggleFocus();
    case 'open-characters': return app.book && openCast();
    case 'open-plot': return app.book && openPlotBoard();
    case 'spell-check': checkSpellingNow(); return;
    case 'open-plot-board': return app.book && openPlotBoard('board');
    case 'open-timeline': return app.book && openPlotBoard('timeline');
    case 'open-history': return app.book && openInsights(app, app.goals, sheet);
    case 'content-search': return app.book && focusSearch();
    case 'find-replace': if (app.book) { focusSearch(); app.search.replace(); } return undefined;
    case 'toggle-comments': return app.book && setCommentsHidden(!commentsHidden_());
    case 'focus-mode': return app.book && toggleWritingFocus();
    case 'open-settings': return openSettings(sheet);
    case 'backup-book': return app.backupBook();
    case 'flush-and-close': await confirmLeave(); try { if (!discardChanges) await save(); if (app.book) { app.goals.measured(true); app.goals.archiveSession(); await app.goals.flush(); } } finally { B.closeReady(); } return undefined;
    default: return undefined;
  }
});

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 's') { e.preventDefault(); save(); }
  if (e.key === 'Escape' && writingFocus && !document.querySelector('.overlay, .popover')) { e.preventDefault(); toggleWritingFocus(false); }
  if (e.key === 'Escape' && previewFocus && !document.querySelector('.overlay, .popover')) { e.preventDefault(); toggleFocus(false); }
  if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F') && app.book) { e.preventDefault(); toggleWritingFocus(); }
  if (mod && !e.shiftKey && !e.altKey && e.key === 'f' && app.book) { e.preventDefault(); focusSearch(); }
  if (mod && e.shiftKey && (e.key === 'h' || e.key === 'H') && app.book) { e.preventDefault(); focusSearch(); app.search.replace(); }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1); }
  if (mod && e.key === '-') { e.preventDefault(); zoom(-1); }
  if (mod && e.key === '0') { e.preventDefault(); zoom(0); }
  if (mod && e.altKey && (e.key === 'f' || e.key === 'ƒ' || e.code === 'KeyF') && app.book) { e.preventDefault(); toggleFocus(); }
});

// Log progress when the window loses focus, so history survives crashes.
window.addEventListener('blur', () => { if (app.book) { app.goals.measured(); app.goals.flush(); } });

/* ================================================================= boot */

buildShell();
installTooltips();
document.addEventListener('keydown', (e) => { if (e.key === 'F1') { e.preventDefault(); openHelp(app); } });
loadSettings().finally(() => showLibrary());
