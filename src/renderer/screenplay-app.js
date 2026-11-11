// Screenplay workspace: Final Draft–style script editor, scene navigator,
// index cards, title page, device & page previews, insights, goals,
// research and all screenplay export formats.
import { h, icon, toast, debounce, popover, segmented, magnifier, confirmDialog, brandMark } from './ui.js';
import { createScriptEditor } from './screenplay-editor.js';
import { createEditor } from './editor.js';
import { parseFountain, writeFountain, plain } from '../shared/fountain.js';
import { layoutScript, pageHtml, titlePageHtml, SCRIPT_CSS, FORMATS, formatById, analyzeScript, ELEMENT_LABELS } from '../shared/screenplay.js';
import { researchPanel, researchReference, newResearchItem, isTextItem, RESEARCH_ICON, RESEARCH_LABEL, promptLink } from './research.js';
import { createGoals, goalMeter, openGoals, sessionClock } from './goals.js';
import { sheet } from './panels.js';
import { newId } from '../shared/sections.js';
import { openScreenplayGuide, ELEMENT_HELP } from './screenplay-guide.js';

const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const n0 = (n) => Math.round(n).toLocaleString();
const eighths = (p) => { const whole = Math.floor(p); const e = Math.round((p - whole) * 8); return `${whole ? whole : ''}${e ? `${whole ? ' ' : ''}${e}/8` : whole ? '' : '1/8'}`; };

export function createScreenplayApp({ root, B, onLibrary, onToggleFocus }) {
  const sp = {
    book: null, contents: {}, titlePage: {}, elements: [], layout: null,
    view: 'script', preview: 'pages', selected: null, pinnedId: null,
    dirty: false, dirtyNotes: new Set(), removedNotes: [],
  };
  const els = {};
  let built = false;

  /* -------------------------------------------------------------- adapter */
  // Small interface shared with the device preview, goals and research.
  const adapter = {
    get book() { return sp.book; },
    get contents() { return sp.contents; },
    markDirty: () => markDirty(),
    refreshPreview: () => schedule(),
    refreshSidebar: () => drawSidebar(),
    refreshAll: () => { drawSidebar(); schedule(); },
    enableSection: () => {},
    previewStep: () => {}, previewJump: () => {}, hasPrevSection: () => false, hasNextSection: () => false,
    printPageCount: () => sp.layout?.pages.length || 0,
  };

  /* ---------------------------------------------------------------- shell */
  function build() {
    built = true;
    els.title = h('div', { class: 'doc-title' });
    els.save = h('div', { class: 'doc-sub' });
    const tbBtn = (ic, label, onClick) => h('button', { class: 'tb-item', title: label, onclick: onClick }, icon(ic, 18), h('span', {}, label));
    const exportBtn = h('button', { class: 'btn primary export-btn', onclick: () => popover(exportBtn, [
      { header: 'Export screenplay as' },
      { label: 'PDF', hint: 'Industry standard', icon: 'print', onClick: () => doExport('pdf') },
      { label: 'Final Draft', hint: '.fdx', icon: 'script', onClick: () => doExport('fdx') },
      { label: 'Fade In', hint: '.fadein', icon: 'script', onClick: () => doExport('fadein') },
      { label: 'Fountain', hint: '.fountain', icon: 'textSize', onClick: () => doExport('fountain') },
      { label: 'Word', hint: '.docx', icon: 'doc', onClick: () => doExport('docx') },
      { label: 'Plain Text', hint: '.txt', icon: 'doc', onClick: () => doExport('txt') },
    ], { align: 'right', width: 240 }) }, icon('share', 15), 'Export');
    const titlebar = h('header', { class: 'titlebar drag' },
      h('div', { class: 'tb-left' },
        h('button', { class: 'tb-icon tb-brand', title: 'Lutefisk Library', 'aria-label': 'Library', onclick: () => onLibrary() }, brandMark(22)),
        h('button', { class: 'tb-icon', title: 'Toggle sidebar', 'aria-label': 'Toggle sidebar', onclick: () => els.workspace.classList.toggle('no-sidebar') }, icon('sidebar', 18))),
      h('div', { class: 'tb-doc' }, els.title, els.save),
      h('div', { class: 'tb-right' },
        els.previewBtn = tbBtn('device', 'Preview', () => togglePreview()),
        tbBtn('focus', 'Focus', () => toggleFocus()),
        tbBtn('gear', 'Script', () => openSettings()),
        tbBtn('target', 'Goals', () => openGoals(adapter, goals, sheet)),
        tbBtn('chart', 'Insights', () => openInsights()),
        tbBtn('help', 'Guide', () => openGuide()),
        h('span', { class: 'tb-sep' }), exportBtn));

    els.sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Screenplay' });
    els.kind = h('div', { class: 'sec-kind' });
    els.secTitle = h('input', { class: 'sec-title', 'aria-label': 'Title', placeholder: 'Untitled Screenplay' });
    els.secTitle.addEventListener('input', () => {
      if (sp.selected && sp.selected !== 'script') { const r = findResearch(sp.selected); if (r) { r.title = els.secTitle.value; markDirty(); drawSidebar(); return; } }
      sp.titlePage.Title = els.secTitle.value; sp.book.title = els.secTitle.value; markDirty(); drawTitle(); schedule();
    });
    els.viewSeg = segmented([{ value: 'script', label: 'Script', icon: 'script' }, { value: 'cards', label: 'Index Cards', icon: 'cards' }, { value: 'title', label: 'Title Page', icon: 'doc' }], 'script', (v) => setView(v), { label: 'View' });
    els.editorMount = h('div', { class: 'editor-mount' });
    els.cardsMount = h('div', { class: 'gen-mount', hidden: true });
    els.titleMount = h('div', { class: 'gen-mount', hidden: true });
    els.notesMount = h('div', { class: 'editor-mount', hidden: true });
    els.resMount = h('div', { class: 'gen-mount', hidden: true });
    els.status = h('span', { class: 'st-words' });
    els.goal = goalMeter(adapter, goals, () => openGoals(adapter, goals, sheet));
    els.clock = sessionClock(adapter, goals);
    goals.onUpdate = () => { els.goal.draw(); els.clock.draw(); };
    els.zoomLbl = h('button', { class: 'zoom-val' });
    const editorPane = h('section', { class: 'editor-pane sp-pane' },
      h('div', { class: 'sec-head' }, h('div', { class: 'sec-kind-row' }, els.kind, els.viewSeg), els.secTitle),
      els.editorMount, els.cardsMount, els.titleMount, els.notesMount, els.resMount,
      h('footer', { class: 'statusbar' }, els.status, els.goal.el, els.clock.el, els.hint = h('span', { class: 'st-hint-text' }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small plain focus-exit', onclick: () => toggleFocus(false) }, 'Exit Focus (Esc)')));

    els.pvSeg = segmented([{ value: 'pages', label: 'Pages', icon: 'print' }, { value: 'research', label: 'Research', icon: 'pin' }], 'pages', (v) => setPreview(v), { label: 'Preview' });
    els.pagesHost = h('div', { class: 'pv-host' });
    els.researchHost = h('div', { class: 'pv-host research-host', hidden: true });
    const previewPane = h('section', { class: 'preview-pane' }, h('div', { class: 'pv-switch' }, h('span'), els.pvSeg, h('span')), els.pagesHost, els.researchHost);
    const splitter = h('div', { class: 'splitter' });
    els.workspace = h('main', { class: 'workspace' }, els.sidebar, editorPane, splitter, previewPane);
    els.shell = h('div', { class: 'shell screenplay' }, titlebar, els.workspace);
    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const start = e.clientX;
      const startW = previewPane.getBoundingClientRect().width;
      const move = (ev) => els.workspace.style.setProperty('--preview-w', `${Math.max(360, Math.min(window.innerWidth - 700, startW - (ev.clientX - start)))}px`);
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });

    sp.editor = createScriptEditor(els.editorMount, {
      onChange(tr) {
        if (tr.docChanged) { pendingSerialize = true; goals.activity(); markDirty(); }
        if (writingFocus) requestAnimationFrame(() => sp.editor.centerCaret());
        schedule(true);
      },
    });
    sp.notes = createEditor(els.notesMount, {
      onChange(tr) { if (tr.docChanged && sp.selected) { sp.contents[sp.selected] = sp.notes.markdown(); sp.dirtyNotes.add(sp.selected); markDirty(); } },
      importImage: () => null,
    });
    buildPages();
  }

  const goals = createGoals(adapter);

  /* --------------------------------------------------------------- open */
  function open(data) {
    if (!built) build();
    const book = data.book;
    book.kind = 'screenplay';
    book.screenplay = { format: 'feature', sceneNumbers: false, contd: true, moreContd: true, doubleSpaceScenes: false, ...(book.screenplay || {}) };
    book.preview = { device: 'ipad', fontSize: 100, font: '', theme: 'light', ...(book.preview || {}) };
    book.research = Array.isArray(book.research) ? book.research : [];
    book.goals ||= {};
    book.uuid ||= crypto.randomUUID();
    sp.book = book;
    sp.contents = data.contents || {};
    const parsed = parseFountain(sp.contents.__script || '');
    sp.titlePage = Object.keys(parsed.titlePage).length ? parsed.titlePage : { Title: book.title || 'Untitled', Credit: 'Written by', Author: book.author || '' };
    sp.elements = parsed.elements.length ? parsed.elements : [{ type: 'transition', text: 'FADE IN:' }, { type: 'scene', text: '' }];
    sp.selected = 'script';
    sp.dirtyNotes = new Set(); sp.removedNotes = [];
    sp.pinnedId = null;
    root.replaceChildren(els.shell);
    sp.editor.load(sp.elements);
    setView('script');
    setPreview('pages');
    applyPreviewHidden();
    drawTitle();
    setSave('Saved', 'ok');
    relayout();
    drawSidebar();
    render();
    goals.load();
    maybeWelcome();
    requestAnimationFrame(() => sp.editor.focus());
  }

  /* -------------------------------------------------------------- layout */
  let pendingSerialize = false;
  let frame = 0;
  let followCaret = false;
  const opts = () => ({ format: sp.book.screenplay.format, sceneNumbers: sp.book.screenplay.sceneNumbers, contd: sp.book.screenplay.contd, moreContd: sp.book.screenplay.moreContd, doubleSpaceScenes: sp.book.screenplay.doubleSpaceScenes });
  function relayout() {
    els.shell.classList.toggle('scene-numbers', !!sp.book.screenplay.sceneNumbers);
    if (pendingSerialize) { sp.elements = sp.editor.elements(); pendingSerialize = false; }
    sp.layout = layoutScript(sp.elements, opts());
    sp.editor.setPageBreaks(sp.layout.elementPage);
  }
  const updateBreaks = debounce(() => { relayout(); drawSidebar(); }, 350);
  function schedule(fromEditor = false) {
    if (fromEditor) followCaret = true;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  }
  function render() {
    if (!sp.book) return;
    if (pendingSerialize) { sp.elements = sp.editor.elements(); pendingSerialize = false; }
    sp.layout = layoutScript(sp.elements, opts());
    updateBreaks();
    updateStatus();
    const fmt = sp.layout.fmt;
    const caretPage = followCaret && sp.selected === 'script' ? (sp.layout.elementPage[sp.editor.caretIndex()] || 1) : null;
    followCaret = false;
    if (previewHidden) return;
    if (sp.preview === 'pages') {
      if (caretPage != null) pageView.target = caretPage; // 0 = title page
      drawPagesSoon();
    } else drawResearch();
  }

  /* ---------------------------------------------------------- page viewer */
  // A simple, continuous stack of real script pages with zoom.
  const pageView = { target: null, lastTarget: null };
  function buildPages() {
    const mag = magnifier('lutefisk.scriptZoom', () => drawPages());
    const lbl = h('span', { class: 'pv-page' });
    const scroll = h('div', { class: 'sp-scroll', tabindex: 0 });
    const stack = h('div', { class: 'sp-stack' });
    scroll.append(stack);
    els.pagesHost.append(h('div', { class: 'pv-bar' }, lbl, h('span', { class: 'spacer' }), mag), scroll, h('style', {}, SCRIPT_CSS));
    scroll.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); mag.step(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
    new ResizeObserver(() => drawPages()).observe(scroll);
    els.drawPages = () => {
      if (!sp.layout || els.pagesHost.hidden || previewHidden) return;
      const fmt = sp.layout.fmt;
      const hasTitle = Object.values(sp.titlePage).some((v) => String(v || '').trim());
      const pages = [...(hasTitle ? [titlePageHtml(sp.titlePage, fmt)] : []), ...sp.layout.pages.map((p) => pageHtml(p, fmt))];
      const w = scroll.clientWidth - 40;
      const s = Math.max(0.2, (w / (fmt.w * 96)) * mag.get());
      stack.style.zoom = String(s);
      stack.innerHTML = pages.join(''); // trusted: generated by the screenplay renderer
      const total = sp.layout.pages.length;
      lbl.textContent = `${total} ${total === 1 ? 'page' : 'pages'} · about ${total} min`;
      if (pageView.target != null && pageView.target !== pageView.lastTarget) {
        const el = stack.children[pageView.target - 1 + (hasTitle ? 1 : 0)];
        if (el) { const top = el.offsetTop * s - 12; if (top < scroll.scrollTop || top > scroll.scrollTop + scroll.clientHeight - 200 * s) scroll.scrollTop = top; }
        pageView.lastTarget = pageView.target;
      }
    };
  }
  const drawPages = () => els.drawPages?.();
  const drawPagesSoon = debounce(drawPages, 200);

  /* --------------------------------------------------------- show / hide */
  let previewHidden = (() => { try { return localStorage.getItem('lutefisk.previewHidden.script') !== '0'; } catch { return true; } })();
  function applyPreviewHidden() {
    els.workspace.classList.toggle('no-preview', previewHidden);
    els.previewBtn.classList.toggle('on', !previewHidden);
    els.previewBtn.title = previewHidden ? 'Show preview (⌥⌘P)' : 'Hide preview (⌥⌘P)';
  }
  function togglePreview(force) {
    previewHidden = force != null ? !force : !previewHidden;
    try { localStorage.setItem('lutefisk.previewHidden.script', previewHidden ? '1' : '0'); } catch { /* ignore */ }
    applyPreviewHidden();
    if (!previewHidden) { pageView.lastTarget = null; followCaret = true; schedule(); }
  }

  function setPreview(v) {
    sp.preview = v;
    els.pvSeg.setValue(v);
    els.pagesHost.hidden = v !== 'pages';
    els.researchHost.hidden = v !== 'research';
    followCaret = true;
    schedule();
  }

  /* ------------------------------------------------------------- views */
  function setView(v) {
    if (sp.selected !== 'script' && v !== 'research') { sp.selected = 'script'; }
    sp.view = v;
    els.viewSeg.setValue(v);
    els.viewSeg.hidden = false;
    els.editorMount.hidden = v !== 'script';
    els.cardsMount.hidden = v !== 'cards';
    els.titleMount.hidden = v !== 'title';
    els.notesMount.hidden = true;
    els.resMount.hidden = true;
    els.kind.textContent = `Screenplay · ${formatById(sp.book.screenplay.format).label.replace(/ \(.*\)/, '')}`;
    els.secTitle.value = sp.titlePage.Title || '';
    els.secTitle.placeholder = 'Untitled Screenplay';
    if (v === 'cards') drawCards();
    if (v === 'title') drawTitleForm();
    drawSidebar();
    if (v === 'script') requestAnimationFrame(() => sp.editor.focus());
  }

  function sceneRanges() {
    if (pendingSerialize) { sp.elements = sp.editor.elements(); pendingSerialize = false; }
    const out = [];
    sp.elements.forEach((e, i) => { if (e.type === 'scene') out.push({ start: i }); });
    out.forEach((s, k) => { s.end = k + 1 < out.length ? out[k + 1].start : sp.elements.length; });
    return out;
  }

  function drawCards() {
    const ranges = sceneRanges();
    const info = analyzeScript(sp.elements, sp.layout);
    const grid = h('div', { class: 'ic-grid' });
    ranges.forEach((r, k) => {
      const sc = info.scenes[k];
      const synIdx = sp.elements.findIndex((e, i) => i > r.start && i < r.end && e.type === 'synopsis');
      const syn = h('textarea', { class: 'ic-syn', placeholder: 'What happens in this scene?', rows: 4 });
      syn.value = synIdx >= 0 ? plain(sp.elements[synIdx].text) : '';
      syn.addEventListener('change', () => {
        const els2 = [...sp.elements];
        if (synIdx >= 0) { if (syn.value.trim()) els2[synIdx] = { type: 'synopsis', text: syn.value.trim() }; else els2.splice(synIdx, 1); } else if (syn.value.trim()) els2.splice(r.start + 1, 0, { type: 'synopsis', text: syn.value.trim() });
        replaceElements(els2);
      });
      const head = h('input', { class: 'ic-head', value: plain(sp.elements[r.start].text).toUpperCase(), 'aria-label': 'Scene heading' });
      head.value = plain(sp.elements[r.start].text).toUpperCase();
      head.addEventListener('change', () => { const els2 = [...sp.elements]; els2[r.start] = { ...els2[r.start], text: head.value.toUpperCase() }; replaceElements(els2); });
      const card = h('div', { class: 'ic-card', draggable: 'true' },
        h('div', { class: 'ic-top' }, h('span', { class: 'ic-num' }, String(k + 1)), h('span', { class: 'ic-meta' }, `p. ${sc?.page || 1} · ${eighths(sc?.length || 0)} pg`)),
        head, syn,
        h('div', { class: 'ic-chars' }, [...(sc?.chars || [])].slice(0, 6).join(' · ')),
        h('button', { class: 'btn small plain', onclick: () => { setView('script'); sp.editor.scrollToIndex(r.start); } }, 'Go to Scene'));
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-card', String(k)); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-card')) { e.preventDefault(); card.classList.add('drop'); } });
      card.addEventListener('dragleave', () => card.classList.remove('drop'));
      card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drop'); moveScene(Number(e.dataTransfer.getData('text/x-card')), k); });
      grid.append(card);
    });
    grid.append(h('button', { class: 'ic-card add', onclick: () => { const els2 = [...sp.elements, { type: 'scene', text: 'INT. NEW LOCATION - DAY' }, { type: 'action', text: '' }]; replaceElements(els2); drawCards(); } }, icon('plus', 22), h('span', {}, 'New Scene')));
    els.cardsMount.replaceChildren(h('div', { class: 'gen-panel wide' }, h('p', { class: 'hint' }, 'Each card is a scene. Drag cards to restructure your script; edit headings and synopses here. Synopses never print.'), grid));
  }

  function moveScene(from, to) {
    const ranges = sceneRanges();
    if (from === to || !ranges[from] || !ranges[to]) return;
    const els2 = [...sp.elements];
    const chunk = els2.slice(ranges[from].start, ranges[from].end);
    els2.splice(ranges[from].start, chunk.length);
    const target = from < to ? ranges[to].end - chunk.length : ranges[to].start;
    els2.splice(target, 0, ...chunk);
    replaceElements(els2);
    drawCards();
    toast('Scene moved');
  }

  function replaceElements(els2) {
    sp.elements = els2;
    const view = sp.editor.view;
    const doc = (sp.editor.loadDoc || null);
    void doc;
    sp.editor.load(els2);
    void view;
    markDirty();
    relayout();
    drawSidebar();
    schedule();
  }

  function drawTitleForm() {
    const tp = sp.titlePage;
    const f = (key, label, multi = false, ph = '') => {
      const el = multi ? h('textarea', { rows: 3, placeholder: ph }) : h('input', { type: 'text', placeholder: ph });
      el.value = tp[key] || '';
      el.addEventListener('input', () => { tp[key] = el.value; if (key === 'Title') { sp.book.title = el.value; els.secTitle.value = el.value; drawTitle(); } if (key === 'Author') sp.book.author = el.value; markDirty(); schedule(); });
      return h('label', { class: 'fld' }, h('span', {}, label), el);
    };
    els.titleMount.replaceChildren(h('div', { class: 'gen-panel' },
      h('p', { class: 'hint' }, 'Laid out in the standard format: title and credits centered, contact details bottom left, draft date bottom right.'),
      f('Title', 'Title'), f('Credit', 'Credit', false, 'Written by'), f('Author', 'Writer(s)', true, 'One name per line'),
      f('Source', 'Based on (optional)', true, 'Based on the novel by…'), f('Draft date', 'Draft / revision', false, 'First Draft — November 10, 2026'),
      f('Contact', 'Contact', true, 'Name\nPhone\nEmail'), f('Copyright', 'Copyright / WGA registration (optional)'), f('Notes', 'Notes (not printed)', true)));
  }

  /* -------------------------------------------------------------- sidebar */
  function drawSidebar() {
    if (!sp.book) return;
    const info = analyzeScript(sp.elements, sp.layout);
    const sb = els.sidebar;
    sb.replaceChildren();
    sb.append(h('button', { class: 'sb-book', onclick: () => setView('title') },
      h('div', { class: 'sb-cover script-cover-mini' }, scriptCover(sp.titlePage)),
      h('div', { class: 'sb-book-meta' }, h('b', {}, plain(sp.titlePage.Title || 'Untitled')), h('span', {}, `${info.pages} ${info.pages === 1 ? 'page' : 'pages'} · ${info.scenes.length} scenes`))));
    const scroller = h('div', { class: 'sb-scroll' });
    const row = (label, onClick, extra = {}) => {
      const li = h('li', { class: `sb-row${extra.active ? ' active' : ''}` });
      li.append(h('button', { class: 'sb-name', onclick: onClick, title: extra.title || label }, extra.num ? h('span', { class: 'sb-scnum' }, extra.num) : icon(extra.icon || 'doc', 14), h('span', { class: 'sb-label' }, label), extra.count != null ? h('span', { class: 'sb-count' }, extra.count) : null));
      if (extra.more) li.append(h('button', { class: 'sb-more', title: 'More', onclick: (e) => { e.stopPropagation(); extra.more(e.currentTarget); } }, icon('more', 16)));
      return li;
    };
    const caretIdx = sp.selected === 'script' ? sp.editor.caretIndex() : -1;
    let curScene = -1;
    info.scenes.forEach((s, k) => { if (s.idx <= caretIdx) curScene = k; });
    const scenesUl = h('ul', { class: 'sb-list' }, info.scenes.length ? info.scenes.map((s, k) => row(s.heading.replace(/^(INT\.?\/EXT\.?|INT\.|EXT\.|I\/E|EST\.)\s*/i, (m) => m.trim() + ' ') || 'Untitled scene', () => { setView('script'); sp.editor.scrollToIndex(s.idx); }, { num: String(k + 1), count: `p${s.page}`, active: k === curScene && sp.view === 'script' && sp.selected === 'script', title: s.synopsis || s.heading })) : [h('li', { class: 'sb-empty' }, 'Type INT. or EXT. to start a scene.')]);
    scroller.append(h('section', { class: 'sb-group' }, h('div', { class: 'sb-head' }, h('span', {}, 'Scenes'),
      h('button', { class: 'sb-add', title: 'Index cards', onclick: () => setView('cards') }, icon('cards', 14))), scenesUl));
    const charUl = h('ul', { class: 'sb-list' }, info.characters.length ? info.characters.slice(0, 40).map((c) => row(c.name, () => jumpToCharacter(c.name), { icon: 'person', count: c.speeches })) : [h('li', { class: 'sb-empty' }, 'Characters appear as they speak.')]);
    scroller.append(h('section', { class: 'sb-group' }, h('div', { class: 'sb-head' }, h('span', {}, 'Characters')), charUl));
    scroller.append(researchGroup());
    sb.append(scroller, h('div', { class: 'sb-foot' }, `${n0(info.words)} words · ~${info.pages} min`));
  }

  let charCursor = {};
  function jumpToCharacter(name) {
    const idxs = sp.elements.map((e, i) => (e.type === 'character' && plain(e.text).toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').trim() === name ? i : -1)).filter((i) => i >= 0);
    if (!idxs.length) return;
    charCursor[name] = ((charCursor[name] ?? -1) + 1) % idxs.length;
    setView('script');
    sp.editor.scrollToIndex(idxs[charCursor[name]]);
    toast(`${name}: speech ${charCursor[name] + 1} of ${idxs.length}`, 'info', 1200);
  }

  /* ------------------------------------------------------------- research */
  const findResearch = (id) => sp.book.research.find((r) => r.id === id);
  function researchGroup() {
    const add = h('button', { class: 'sb-add', title: 'Add research' }, icon('plus', 15));
    add.addEventListener('click', () => popover(add, [
      { label: 'New Note', icon: 'doc', onClick: () => addResearch('note') },
      { label: 'New Character', icon: 'person', onClick: () => addResearch('character') },
      { label: 'New Place', icon: 'pin', onClick: () => addResearch('place') },
      { label: 'Web Link…', icon: 'link', onClick: async () => { const l = await promptLink(); if (l) addResearch('link', l); } },
      '-', { label: 'Import Files…', icon: 'folder', onClick: () => importResearch() },
    ], { width: 220 }));
    const ul = h('ul', { class: 'sb-list' });
    for (const r of sp.book.research) {
      const li = h('li', { class: `sb-row${sp.selected === r.id ? ' active' : ''}` },
        h('button', { class: 'sb-name', onclick: () => selectResearch(r.id) }, icon(RESEARCH_ICON[r.kind] || 'doc', 15), h('span', { class: 'sb-label' }, r.title), r.id === sp.pinnedId ? h('span', { class: 'sb-badge' }, 'Beside') : null),
        h('button', { class: 'sb-more', title: 'More', onclick: (e) => { e.stopPropagation(); popover(e.currentTarget, [
          { label: 'Open Beside Editor', icon: 'pin', onClick: () => { sp.pinnedId = r.id; setPreview('research'); drawSidebar(); } },
          '-', { label: 'Delete…', icon: 'trash', danger: true, onClick: () => deleteResearch(r) },
        ], { width: 220 }); } }, icon('more', 16)));
      ul.append(li);
    }
    if (!sp.book.research.length) ul.append(h('li', { class: 'sb-empty' }, 'Character bios, locations, references and files. Never exported.'));
    return h('section', { class: 'sb-group research' }, h('div', { class: 'sb-head' }, h('span', {}, 'Research'), add), ul);
  }
  function addResearch(kind, extra = {}) {
    const { item, text } = newResearchItem(kind, extra);
    sp.book.research.push(item);
    if (isTextItem(item)) { sp.contents[item.id] = text; sp.dirtyNotes.add(item.id); }
    markDirty();
    selectResearch(item.id);
  }
  async function importResearch() {
    try {
      const res = await B.importResearch();
      for (const r of res || []) {
        if (r.kind === 'note') { const { item } = newResearchItem('note', { title: r.title }); sp.book.research.push(item); sp.contents[item.id] = r.text; sp.dirtyNotes.add(item.id); } else sp.book.research.push({ id: newId('res'), kind: r.kind, title: r.title, file: r.file, size: r.size });
      }
      if (res?.length) { markDirty(); drawSidebar(); toast(`Added ${res.length} to Research`, 'ok'); }
    } catch (err) { toast(clean(err), 'error'); }
  }
  async function deleteResearch(r) {
    if (!(await confirmDialog(`Delete “${r.title}”?`, 'It will be removed from Research.'))) return;
    sp.book.research = sp.book.research.filter((x) => x !== r);
    if (isTextItem(r)) { sp.removedNotes.push(r.id); sp.dirtyNotes.delete(r.id); delete sp.contents[r.id]; }
    if (sp.pinnedId === r.id) sp.pinnedId = null;
    if (sp.selected === r.id) setView('script');
    markDirty(); drawSidebar();
  }
  function selectResearch(id) {
    const r = findResearch(id);
    sp.selected = id;
    els.kind.textContent = `Research · ${RESEARCH_LABEL[r.kind]}`;
    els.secTitle.value = r.title;
    els.viewSeg.hidden = true;
    for (const m of [els.editorMount, els.cardsMount, els.titleMount]) m.hidden = true;
    if (isTextItem(r)) { els.resMount.hidden = true; els.notesMount.hidden = false; sp.notes.load(id, sp.contents[id] || ''); } else { els.notesMount.hidden = true; els.resMount.hidden = false; els.resMount.replaceChildren(researchPanel(adapter, r)); }
    drawSidebar();
  }
  function drawResearch() {
    const pinned = findResearch(sp.pinnedId) || null;
    const sel = h('select', {}, h('option', { value: '' }, sp.book.research.length ? 'Choose research…' : 'No research yet'), sp.book.research.map((r) => h('option', { value: r.id }, `${RESEARCH_LABEL[r.kind]}: ${r.title}`)));
    sel.value = pinned?.id || '';
    sel.addEventListener('change', () => { sp.pinnedId = sel.value || null; drawSidebar(); drawResearch(); });
    els.researchHost.replaceChildren(h('div', { class: 'pv-bar' }, h('label', { class: 'pv-ctl' }, icon('pin', 15), sel)), h('div', { class: 'ref-scroll' }, researchReference(adapter, pinned)));
  }

  /* ------------------------------------------------------------- status */
  function updateStatus() {
    const total = sp.layout?.pages.length || 0;
    const caret = sp.selected === 'script' ? sp.layout?.elementPage[sp.editor.caretIndex()] || 1 : 0;
    const scenes = sp.elements.filter((e) => e.type === 'scene').length;
    const el = sp.selected === 'script' ? sp.editor.view.state.selection.$from.parent.attrs.t : '';
    els.status.textContent = sp.selected === 'script' ? `${ELEMENT_LABELS[el] || 'Page Break'} · Page ${caret} of ${total} · ${scenes} scenes · ~${total} min` : `${total} pages`;
    els.status.title = ELEMENT_HELP[el] || '';
    els.hint.textContent = sp.selected === 'script' ? ELEMENT_HELP[el] || '' : '';
    els.goal.draw();
  }
  function drawTitle() {
    els.title.textContent = plain(sp.titlePage.Title || sp.book.title || 'Untitled');
    document.title = `${els.title.textContent} — Lutefisk`;
  }

  /* --------------------------------------------------------------- save */
  const autosave = debounce(() => save(), 900);
  function setSave(t, cls) { els.save.textContent = t; els.save.className = `doc-sub ${cls}`; }
  function markDirty() { sp.dirty = true; setSave('Edited', 'pending'); autosave(); }
  let saving = null;
  async function save() {
    if (!sp.book) return;
    if (pendingSerialize) { sp.elements = sp.editor.elements(); pendingSerialize = false; }
    if (saving) await saving;
    if (!sp.dirty && !sp.dirtyNotes.size && !sp.removedNotes.length) return;
    sp.book.title = plain(sp.titlePage.Title || sp.book.title || 'Untitled');
    sp.book.author = String(sp.titlePage.Author || '').split('\n')[0];
    const script = writeFountain(sp.titlePage, sp.elements);
    sp.contents.__script = script;
    const notes = {};
    for (const id of sp.dirtyNotes) notes[id] = sp.contents[id] ?? '';
    const removedNotes = [...sp.removedNotes];
    sp.dirty = false; sp.dirtyNotes.clear(); sp.removedNotes = [];
    saving = B.saveBook({ book: JSON.parse(JSON.stringify(sp.book)), files: { __script: script }, removed: [], notes, removedNotes })
      .then(() => { setSave('Saved', 'ok'); goals.measured(); })
      .catch((err) => { sp.dirty = true; for (const id of Object.keys(notes)) sp.dirtyNotes.add(id); sp.removedNotes.push(...removedNotes); setSave('Not saved', 'err'); toast(`Couldn’t save: ${clean(err)}`, 'error'); })
      .finally(() => { saving = null; });
    return saving;
  }

  /* ------------------------------------------------------------- export */
  async function doExport(kind) {
    await save();
    const script = writeFountain(sp.titlePage, sp.elements);
    const title = plain(sp.titlePage.Title || 'Screenplay');
    try {
      let out;
      if (kind === 'pdf') {
        const fmt = sp.layout.fmt;
        const hasTitle = Object.values(sp.titlePage).some((v) => String(v || '').trim());
        const pages = [...(hasTitle ? [titlePageHtml(sp.titlePage, fmt)] : []), ...sp.layout.pages.map((p) => pageHtml(p, fmt))];
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><link rel="stylesheet" href="app://lutefisk/styles/fonts.css"><style>@page{size:${fmt.w}in ${fmt.h}in;margin:0}html,body{margin:0}${SCRIPT_CSS}.sp-page{break-after:page;page-break-after:always}.sp-page:last-child{break-after:auto}</style></head><body>${pages.join('\n')}</body></html>`;
        toast('Rendering PDF…');
        out = await B.exportPdf({ html, widthIn: fmt.w, heightIn: fmt.h, title });
      } else {
        const fn = { fdx: B.exportFdx, fadein: B.exportFadeIn, fountain: B.exportFountain, docx: B.exportScriptDocx, txt: B.exportScriptText }[kind];
        out = await fn({ title, script, opts: opts() });
      }
      if (out) toast(`Exported ${out.split(/[\\/]/).pop()}`, 'ok', 4000);
    } catch (err) { toast(`Export failed: ${clean(err)}`, 'error', 7000); }
  }

  /* ------------------------------------------------------------ settings */
  function openSettings() {
    const s = sp.book.screenplay;
    const ch = () => { markDirty(); relayout(); drawSidebar(); schedule(); };
    const sel = h('select', {}, Object.values(FORMATS).map((f) => h('option', { value: f.id }, f.label)));
    sel.value = s.format;
    sel.addEventListener('change', () => { s.format = sel.value; ch(); setView(sp.view); });
    const toggle = (key, label, hint) => {
      const el = h('input', { type: 'checkbox', class: 'switch', role: 'switch' });
      el.checked = !!s[key];
      el.addEventListener('change', () => { s[key] = el.checked; ch(); });
      return h('label', { class: 'toggle-row' }, h('span', { class: 'tr-text' }, h('b', {}, label), h('small', {}, hint)), el);
    };
    sheet('Script Settings', h('div', { class: 'form-grid' },
      h('label', { class: 'fld' }, h('span', {}, 'Format'), sel),
      toggle('sceneNumbers', 'Scene numbers', 'Print scene numbers in both margins (shooting scripts).'),
      toggle('contd', "Automatic (CONT'D)", 'When a character speaks again after action in the same scene.'),
      toggle('moreContd', "(MORE) and (CONT'D) at page breaks", 'Split long speeches across pages the standard way.'),
      toggle('doubleSpaceScenes', 'Double-space before scene headings', 'An extra blank line before every scene heading.'),
      h('div', { class: 'kbd-help' }, h('b', {}, 'Keyboard'), h('p', {}, 'Enter → next element  ·  Tab / ⇧Tab → change element  ·  ⌘1 Scene Heading  ·  ⌘2 Action  ·  ⌘3 Character  ·  ⌘4 Parenthetical  ·  ⌘5 Dialogue  ·  ⌘6 Transition  ·  ⌘7 Shot  ·  ⌘8 Centered  ·  ⌘9 Act Break  ·  ⌘D Dual dialogue  ·  ⇧Enter line break'))), {});
  }

  /* ------------------------------------------------------------ insights */
  function openInsights() {
    if (pendingSerialize) { sp.elements = sp.editor.elements(); pendingSerialize = false; }
    const lay = layoutScript(sp.elements, opts());
    const a = analyzeScript(sp.elements, lay);
    const count = (f) => a.scenes.filter(f).length;
    const ints = count((s) => /^INT/.test(s.ie) && !/EXT/.test(s.ie)), exts = count((s) => /^EXT/.test(s.ie) && !/INT/.test(s.ie)), both = count((s) => /\//.test(s.ie));
    const day = count((s) => /DAY|MORNING|AFTERNOON|DAWN/.test(s.time)), night = count((s) => /NIGHT|EVENING|DUSK/.test(s.time));
    const locs = new Map();
    for (const s of a.scenes) locs.set(s.location, (locs.get(s.location) || 0) + 1);
    const tile = (l, v, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, v), h('div', { class: 'tile-l' }, l), sub ? h('div', { class: 'tile-s' }, sub) : null);
    const maxW = Math.max(1, ...a.characters.map((c) => c.words));
    const split = (l, x, y, lx, ly) => h('div', { class: 'gprog' }, h('div', { class: 'gprog-top' }, h('b', {}, l), h('span', {}, `${lx} ${x} · ${ly} ${y}`)), h('div', { class: 'gbar' }, h('i', { style: { width: `${(x / Math.max(1, x + y)) * 100}%` } })));
    sheet('Script Insights', h('div', { class: 'stats' },
      h('div', { class: 'tiles' },
        tile('Pages', n0(a.pages), `≈ ${a.pages} min screen time`), tile('Scenes', n0(a.scenes.length), `${n0(a.pages / Math.max(1, a.scenes.length) * 8)}/8 pg average`),
        tile('Speaking parts', n0(a.characters.length), a.characters[0] ? `Lead: ${a.characters[0].name}` : ''),
        tile('Words', n0(a.words), `${Math.round((a.dialogueWords / Math.max(1, a.words)) * 100)}% dialogue`),
        tile('Locations', n0(locs.size), ''), tile('Dialogue / action', `${Math.round((a.dialogueWords / Math.max(1, a.words)) * 100)} / ${100 - Math.round((a.dialogueWords / Math.max(1, a.words)) * 100)}`, 'by words')),
      h('section', { class: 'gprogs' }, split('Interior / exterior', ints, exts, 'INT', 'EXT'), split('Day / night', day, night, 'Day', 'Night'), both ? h('p', { class: 'hint' }, `${both} INT./EXT. scenes`) : null),
      h('section', {}, h('h3', {}, 'Characters'), h('table', { class: 'chapters' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Character'), h('th', { class: 'num' }, 'Speeches'), h('th', { class: 'num' }, 'Words'), h('th', {}, ''), h('th', { class: 'num' }, 'Scenes'), h('th', { class: 'num' }, 'First page'))),
        h('tbody', {}, a.characters.map((c) => h('tr', {}, h('td', { class: 'name' }, c.name), h('td', { class: 'num' }, n0(c.speeches)), h('td', { class: 'num' }, n0(c.words)),
          h('td', { class: 'barcell' }, h('div', { class: 'bar', style: { width: `${(c.words / maxW) * 100}%` } })), h('td', { class: 'num' }, n0(c.scenes.size)), h('td', { class: 'num' }, String(c.first))))))),
      h('section', {}, h('h3', {}, 'Scenes'), h('table', { class: 'chapters' },
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Heading'), h('th', { class: 'num' }, 'Page'), h('th', { class: 'num' }, 'Length'), h('th', {}, 'Characters'))),
        h('tbody', {}, a.scenes.map((s, k) => h('tr', {}, h('td', {}, String(k + 1)), h('td', { class: 'name' }, s.heading), h('td', { class: 'num' }, String(s.page)), h('td', { class: 'num' }, `${eighths(s.length)} pg`), h('td', {}, [...s.chars].join(', '))))))),
      h('section', {}, h('h3', {}, 'Locations'), h('ol', { class: 'wordlist' }, [...locs].sort((x, y) => y[1] - x[1]).map(([l, n]) => h('li', {}, h('span', {}, l), h('b', {}, `${n} ${n === 1 ? 'scene' : 'scenes'}`)))))), { wide: true });
  }

  /* ----------------------------------------------------------------- guide */
  function openGuide() {
    openScreenplayGuide(sheet, {
      insertExample: (example) => {
        if (pendingSerialize) { sp.elements = sp.editor.elements(); pendingSerialize = false; }
        replaceElements([...sp.elements.filter((e, i, a) => !(i === a.length - 1 && e.type === 'scene' && !e.text.trim())), ...example]);
        document.querySelector('.overlay')?.remove();
        setView('script');
        sp.editor.scrollToIndex(sp.elements.length - example.length);
        toast('Example scene added at the end', 'ok');
      },
    });
  }
  function maybeWelcome() {
    let seen = false;
    try { seen = localStorage.getItem('lutefisk.guideSeen') === '1'; } catch { /* ignore */ }
    const fresh = sp.elements.filter((e) => e.type !== 'transition' && e.text.trim()).length === 0;
    if (seen || !fresh) return;
    const bar = h('div', { class: 'guide-banner' }, icon('help', 18),
      h('span', {}, h('b', {}, 'New to screenplays? '), 'See what each part of a script means and write your first scene step by step.'),
      h('button', { class: 'btn small primary', onclick: () => { bar.remove(); openGuide(); } }, 'Open Guide'),
      h('button', { class: 'tb-btn', title: 'Dismiss', onclick: () => bar.remove() }, icon('close', 14)));
    try { localStorage.setItem('lutefisk.guideSeen', '1'); } catch { /* ignore */ }
    els.editorMount.prepend(bar);
  }

  /* ----------------------------------------------------------------- focus */
  let writingFocus = false;
  function toggleFocus(force) {
    writingFocus = force ?? !writingFocus;
    els.shell.classList.toggle('writing-focus', writingFocus);
    if (writingFocus) { setView('script'); sp.editor.focus(); requestAnimationFrame(() => sp.editor.centerCaret()); toast('Focus mode — press Esc to exit', 'info', 1800); }
    onToggleFocus?.(writingFocus);
  }

  return {
    open, save,
    get active() { return root.contains(els.shell || document.createElement('i')) && !!sp.book; },
    get focus() { return writingFocus; },
    toggleFocus,
    async close() { await save(); goals.measured(true); goals.archiveSession(); await goals.flush(); sp.book = null; },
    menu(cmd) {
      switch (cmd) {
        case 'save': return save().then(() => toast('Saved', 'ok', 1200));
        case 'export-pdf': return doExport('pdf');
        case 'export-docx': return doExport('docx');
        case 'export-fdx': return doExport('fdx');
        case 'export-fadein': return doExport('fadein');
        case 'export-fountain': return doExport('fountain');
        case 'export-epub': case 'export-md': return toast('For screenplays, export PDF, Final Draft, Fountain, Word or plain text.', 'warn');
        case 'view-device': return togglePreview(true);
        case 'toggle-preview': return togglePreview();
        case 'help-screenplay': return openGuide();
        case 'view-print': togglePreview(true); return setPreview('pages');
        case 'view-stats': return openInsights();
        case 'focus-mode': return toggleFocus();
        case 'reveal': return B.revealBook();
        default: return undefined;
      }
    },
  };
}

/** Script-style cover (white card stock with brads), for the library. */
export function scriptCover(tp = {}) {
  return h('div', { class: 'script-cover' },
    h('div', { class: 'brad b1' }), h('div', { class: 'brad b2' }),
    h('div', { class: 'sc-title' }, plain(tp.Title || 'UNTITLED').toUpperCase()),
    h('div', { class: 'sc-by' }, tp.Credit || 'Written by'),
    h('div', { class: 'sc-author' }, String(tp.Author || '').split('\n')[0]));
}

/** Convert a Final Draft .fdx document to Fountain text. */
export function fdxToFountain(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This Final Draft file could not be read.');
  const MAP = { 'Scene Heading': 'scene', Action: 'action', Character: 'character', Parenthetical: 'paren', Dialogue: 'dialogue', Transition: 'transition', Shot: 'shot', General: 'action', 'New Act': 'act', 'End of Act': 'act', Lyrics: 'lyric' };
  const textOf = (p) => [...p.children].filter((c) => c.tagName === 'Text').map((t) => {
    let s = (t.textContent || '').replace(/([*_\\])/g, '\\$1');
    const st = t.getAttribute('Style') || '';
    if (/Underline/.test(st)) s = `_${s}_`;
    if (/Bold/.test(st) && /Italic/.test(st)) s = `***${s}***`; else if (/Bold/.test(st)) s = `**${s}**`; else if (/Italic/.test(st)) s = `*${s}*`;
    return s;
  }).join('');
  const elements = [];
  const content = doc.querySelector('FinalDraft > Content');
  for (const p of content ? [...content.children] : []) {
    if (p.tagName !== 'Paragraph') continue;
    const dual = p.querySelector(':scope > DualDialogue');
    if (dual) {
      let seenChar = 0;
      for (const q of dual.querySelectorAll(':scope > Paragraph')) {
        const t = MAP[q.getAttribute('Type')] || 'dialogue';
        if (t === 'character') seenChar++;
        elements.push({ type: t, text: textOf(q), ...(t === 'character' && seenChar === 2 ? { dual: true } : {}) });
      }
      continue;
    }
    if (p.getAttribute('StartsNewPage') === 'Yes' && elements.length) elements.push({ type: 'pagebreak', text: '' });
    const type = p.getAttribute('Alignment') === 'Center' && (p.getAttribute('Type') === 'Action' || p.getAttribute('Type') === 'General') ? 'centered' : MAP[p.getAttribute('Type')] || 'action';
    elements.push({ type, text: textOf(p) });
    const sum = p.querySelector(':scope > SceneProperties Summary Paragraph');
    if (type === 'scene' && sum) elements.push({ type: 'synopsis', text: textOf(sum) });
  }
  // Title page: centered lines → title, credit, author; left → contact; right → draft.
  const tp = {};
  const tps = [...doc.querySelectorAll('TitlePage Content Paragraph')].map((p) => ({ a: p.getAttribute('Alignment') || 'Left', t: [...p.querySelectorAll('Text')].map((x) => x.textContent).join('').trim() })).filter((x) => x.t);
  const centered = tps.filter((x) => x.a === 'Center').map((x) => x.t);
  if (centered.length) {
    tp.Title = centered[0];
    const ci = centered.findIndex((t, i) => i > 0 && /^(written|screenplay|teleplay|story)?\s*by\b/i.test(t));
    if (ci > 0) { tp.Credit = centered[ci]; tp.Author = centered.slice(ci + 1).filter((t) => !/^based on/i.test(t)).join('\n'); const src = centered.find((t) => /^based on/i.test(t)); if (src) tp.Source = src; } else if (centered[1]) tp.Author = centered[1];
  }
  const left = tps.filter((x) => x.a === 'Left').map((x) => x.t);
  const right = tps.filter((x) => x.a === 'Right').map((x) => x.t);
  if (left.length) tp.Contact = left.join('\n');
  if (right.length) tp['Draft date'] = right.join('\n');
  return writeFountain(tp, elements);
}

/** Open Screenplay Format (Fade In's document.xml), any version 1.2–4.0. */
export function osfToFountain(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || !root || root.tagName.toLowerCase() !== 'document') throw new Error('This Fade In file could not be read.');
  const kids = (el, name) => [...(el?.children || [])].filter((c) => c.tagName.toLowerCase() === name);
  const kid = (el, name) => kids(el, name)[0];
  const attr = (el, ...names) => {
    if (!el) return '';
    for (const a of el.attributes) if (names.includes(a.name.toLowerCase())) return a.value;
    return '';
  };
  const BASE = ['basestyle', 'basestylename'];
  // Custom styles resolve through their base style to a built-in one.
  const styleBase = new Map();
  for (const s of kids(kid(root, 'styles'), 'style')) styleBase.set(attr(s, 'name'), attr(s, ...BASE));
  const resolve = (name) => {
    for (let i = 0, n = name; i < 8 && n; i++) {
      if (MAP[n.toLowerCase()]) return MAP[n.toLowerCase()];
      n = styleBase.get(n);
    }
    return /lyric/i.test(name) ? 'lyric' : 'action';
  };
  const MAP = {
    'scene heading': 'scene', action: 'action', character: 'character', parenthetical: 'paren', dialogue: 'dialogue',
    transition: 'transition', shot: 'shot', 'normal text': 'action', general: 'action', lyrics: 'lyric', 'new act': 'act', 'end of act': 'act',
  };
  const runs = (p) => kids(p, 'text').map((t) => {
    let s = (t.textContent || '').replace(/([*_\\])/g, '\\$1');
    if (!s) return '';
    const on = (n) => attr(t, n) === '1' || attr(t, n) === 'true';
    if (on('underline')) s = `_${s}_`;
    if (on('bold') && on('italic')) s = `***${s}***`; else if (on('bold')) s = `**${s}**`; else if (on('italic')) s = `*${s}*`;
    return s;
  }).join('');

  const elements = [];
  let pendingDual = false;
  for (const p of kids(kid(root, 'paragraphs'), 'para')) {
    const st = kid(p, 'style');
    const base = attr(st, ...BASE) || 'Action';
    let type = resolve(base);
    const align = attr(st, 'align').toLowerCase();
    if (type === 'action' && align === 'center') type = 'centered';
    const e = { type, text: runs(p) };
    if (type === 'lyric') e.text = e.text.replace(/^\*(.*)\*$/s, '$1');
    if (type === 'character') {
      const dual = attr(st, 'dualdialogue') === '1';
      if (dual && pendingDual) { e.dual = true; pendingDual = false; } else pendingDual = dual;
    }
    if (attr(p, 'pagebreak', 'pagebreakbefore') === '1' && elements.length) elements.push({ type: 'pagebreak', text: '' });
    elements.push(e);
    const syn = attr(p, 'synopsis');
    if (type === 'scene' && syn.trim()) elements.push({ type: 'synopsis', text: syn.trim() });
  }

  // Title page: bookmarked lines first, then centered lines as a fallback.
  const tp = {};
  const tpParas = kids(kid(root, 'titlepage'), 'para').map((p) => ({ b: attr(p, 'bookmark').toLowerCase(), a: attr(kid(p, 'style'), 'align').toLowerCase(), t: kids(p, 'text').map((t) => t.textContent).join('').trim() })).filter((x) => x.t);
  const after = (b) => {
    const i = tpParas.findIndex((x) => x.b === b);
    if (i < 0) return [];
    const out = [tpParas[i].t];
    for (let j = i + 1; j < tpParas.length && !tpParas[j].b && tpParas[j].a === tpParas[i].a && !/^based on\b/i.test(tpParas[j].t); j++) out.push(tpParas[j].t);
    return out;
  };
  const title = after('title');
  if (title.length) tp.Title = title[0];
  const author = after('author');
  if (author.length) tp.Author = author.join('\n');
  const credit = tpParas.find((x) => /^(written|screenplay|teleplay|story)?\s*by\b/i.test(x.t));
  if (credit) tp.Credit = credit.t;
  const src = tpParas.findIndex((x) => /^based on\b/i.test(x.t));
  if (src >= 0) { const s = [tpParas[src].t]; for (let j = src + 1; j < tpParas.length && !tpParas[j].b && tpParas[j].a === tpParas[src].a; j++) s.push(tpParas[j].t); tp.Source = s.join('\n'); }
  const draft = after('draft'); if (draft.length) tp['Draft date'] = draft.join('\n');
  const contact = after('contact'); if (contact.length) tp.Contact = contact.join('\n');
  const copy = after('copyright'); if (copy.length) tp.Copyright = copy.join('\n');
  if (!tp.Title) {
    const info = kid(root, 'info');
    const c = tpParas.filter((x) => x.a === 'center');
    const t = attr(info, 'title') || c[0]?.t;
    if (t && t !== 'Untitled') tp.Title = t;
    if (!tp.Author && attr(info, 'written_by')) tp.Author = attr(info, 'written_by');
  }
  return writeFountain(tp, elements);
}
