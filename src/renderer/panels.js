// Side panels and dialogs: book settings, templates gallery, bibliography
// manager, statistics dashboard and generated-section settings.
import { h, icon, dialog, toast, setHtml, assetUrl, confirmDialog, segmented, generatedCover } from './ui.js';
import { templateById as tplById } from '../shared/templates.js';
import { fontStack } from '../shared/fonts.js';
import { TEMPLATES, templateCss, baseCss, withCasePrefs, sanitizeTemplate, setCustomTemplates } from '../shared/templates.js';
import { openTemplateEditor, myTemplates } from './template-editor.js';
import { STYLES, formatEntry, extractFromDocument, fromCsl, parseName, sortKey } from '../shared/citations.js';
import { bookReport } from '../shared/stats.js';
import { markdownToPlain } from '../shared/markdown.js';
import { SECTION_TYPES, CHAPTER_HEADINGS } from '../shared/sections.js';
import { TRIMS } from '../shared/print.js';
import { openCoverEditor } from './cover-editor.js';
import { coverOpts, coverAlt, coverImgCss, COVER_EXTENTS, COVER_VALIGNS } from '../shared/cover.js';

/* ------------------------------------------------------------ helpers */
function field(label, input, hint) {
  return h('label', { class: 'fld' }, h('span', {}, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
}
function textInput(obj, key, onChange, attrs = {}) {
  const el = h('input', { type: 'text', ...attrs });
  el.value = obj[key] ?? '';
  el.addEventListener('input', () => { obj[key] = attrs.type === 'number' ? Number(el.value) || '' : el.value; onChange(); });
  return el;
}
function checkbox(obj, key, label, onChange) {
  const el = h('input', { type: 'checkbox' });
  el.checked = obj[key] !== false && !!obj[key];
  el.addEventListener('change', () => { obj[key] = el.checked; onChange(); });
  return h('label', { class: 'chk' }, el, h('span', {}, label));
}
function select(obj, key, options, onChange) {
  const el = h('select', {}, options.map(([v, l]) => h('option', { value: v }, l)));
  el.value = obj[key] ?? options[0][0];
  el.addEventListener('change', () => { obj[key] = el.value; onChange(); });
  return el;
}
export function sheet(title, body, { wide = false, onClose } = {}) {
  const close = () => { overlay.remove(); onClose?.(); };
  const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') close(); } },
    h('div', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'btn primary small', onclick: close }, 'Done')),
      h('div', { class: 'sheet-body' }, body)));
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  overlay.querySelector('.sheet-body input, .sheet-body select, .sheet-body button')?.focus();
  return close;
}

/* ------------------------------------------------------- book settings */
export function openBookSettings(app, initialTab = 'general') {
  const b = app.book;
  const ch = () => { app.markDirty(); app.refreshAll(); };
  b.print ||= {};
  b.wordComments ??= true;
  b.codeHighlight ??= true;
  const pane = h('div', { class: 'tab-pane' });

  function coverPicker(key, label, hint) {
    const box = h('div', { class: 'cover-slot' });
    const opts = () => { b.coverLayout ||= {}; return (b.coverLayout[key] ||= {}); };
    const frame = h('div', { class: 'cover-frame' });
    const drawFrame = () => {
      let inner;
      if (b[key]) {
        const o = coverOpts(b, key);
        const img = h('img', { src: assetUrl(b[key]), alt: coverAlt(b, key) });
        img.style.cssText = coverImgCss(o, { x: 9, top: 8, bottom: 8 });
        frame.classList.toggle('ext-margins', o.extent === 'margins');
        inner = img;
      } else inner = key === 'cover' ? generatedCover(b.title, b.author, fontStack(tplById(b.template).head)) : h('div', { class: 'cover-empty' }, icon('image', 22), 'None');
      frame.replaceChildren(inner, h('div', { class: 'lib-spine' }));
    };
    const draw = () => {
      drawFrame();
      const o = coverOpts(b, key);
      const alt = h('textarea', { rows: 2, placeholder: coverAlt({ ...b, coverLayout: {} }, key), 'aria-label': `${label} alt text` });
      alt.value = o.alt;
      alt.addEventListener('input', () => { opts().alt = alt.value; app.markDirty(); });
      alt.addEventListener('change', ch);
      const layout = b[key] ? h('div', { class: 'cover-opts' },
        h('label', { class: 'fld' }, h('span', {}, 'Alt text'), alt, h('small', { class: 'hint' }, 'Describes the cover for screen readers and e-reader accessibility. Leave blank to use the title and author.')),
        h('div', { class: 'fld' }, h('span', {}, 'Print extent'),
          segmented(COVER_EXTENTS.map(([value, l]) => ({ value, label: l })), o.extent, (v) => { opts().extent = v; ch(); drawFrame(); }, { label: 'Print extent' }),
          h('small', { class: 'hint' }, 'Full bleed runs the image to the trimmed edge (it may be cropped). Within margins shows the whole image inside the page margins on a white page.')),
        h('div', { class: 'fld' }, h('span', {}, 'Vertical alignment'),
          segmented(COVER_VALIGNS.map(([value, l]) => ({ value, label: l })), o.valign, (v) => { opts().valign = v; ch(); drawFrame(); }, { label: 'Vertical alignment' }),
          h('small', { class: 'hint' }, 'Where the image sits when it doesn’t fill the page, or which part is kept when full bleed crops it.'))) : null;
      box.replaceChildren(frame,
        h('div', { class: 'cover-info' }, h('b', {}, label), h('small', { class: 'hint' }, hint),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn small', onclick: async () => { const rel = await app.importImage(); if (rel) { b[key] = rel; if (b.coverLayout?.[key]) { delete b.coverLayout[key].source; delete b.coverLayout[key].crop; } ch(); draw(); } } }, b[key] ? 'Replace…' : 'Upload Image…'),
            b[key] ? h('button', { class: 'btn small', onclick: () => openCoverEditor(app, key, draw) }, 'Adjust…') : null,
            b[key] ? h('button', { class: 'btn small plain', onclick: () => { b[key] = ''; if (b.coverLayout?.[key]) { delete b.coverLayout[key].source; delete b.coverLayout[key].crop; } ch(); draw(); } }, 'Remove') : null),
          layout));
    };
    draw();
    return box;
  }
  const desc = h('textarea', { rows: 4 });
  desc.value = b.description || '';
  desc.addEventListener('input', () => { b.description = desc.value; app.markDirty(); });
  const kw = h('input', { type: 'text', placeholder: 'fantasy, adventure, coming of age' });
  kw.value = (b.keywords || []).join(', ');
  kw.addEventListener('input', () => { b.keywords = kw.value.split(',').map((x) => x.trim()).filter(Boolean); app.markDirty(); });

  const tabs = {
    general: () => h('div', { class: 'form-grid' },
      field('Title', textInput(b, 'title', ch)),
      field('Subtitle', textInput(b, 'subtitle', ch)),
      field('Author', textInput(b, 'author', ch)),
      field('Publisher', textInput(b, 'publisher', ch, { placeholder: 'Imprint name (optional)' })),
      h('div', { class: 'row2' }, field('Year', textInput(b, 'year', ch, { type: 'number' })),
        field('Language', select(b, 'language', [['en', 'English'], ['en-GB', 'English (UK)'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['sv', 'Swedish'], ['pl', 'Polish']], ch))),
      field('ISBN', textInput(b, 'isbn', ch, { placeholder: '978-…' }), 'Optional. Used as the EPUB identifier and on the copyright page.'),
      field('Description', desc, 'Appears in e-book metadata and on the generated back cover.'),
      field('Keywords', kw),
      toggle(b, 'codeHighlight', 'Syntax highlighting in code blocks', 'Colours plus bold and italic, so code still reads on black-and-white e-ink screens. Long lines wrap to fit small screens.', ch),
      toggle(b, 'wordComments', 'Include comments in Word export', 'Your comments and replies appear as real Word comments. They never appear in the e-book, PDF or print.', ch),
      field('Equations in e-books', select(b, 'mathOutput', [['image', 'Images — every reader, including Kindle and Nook'], ['mathml', 'MathML — searchable and scalable (Apple Books, Kobo, Google Play, newer Kindles)']], ch), 'How LaTeX equations are written into the EPUB. The preview, print and PDF always typeset them directly. Word always uses images.')),
    cover: () => h('div', { class: 'covers' },
      h('p', { class: 'hint covers-note' }, 'The cover is the image on the outside of the book. The title page is a separate page inside the book, generated from the title, subtitle, author and publisher on the General tab.'),
      coverPicker('cover', 'Front Cover', 'Recommended 1600 × 2560 px, JPEG or PNG. Shown on e-readers, in your library and as the first preview page.'),
      coverPicker('backCover', 'Back Cover', 'Optional. Shown as the last preview page. Without one, the description is used.')),
    chapters: () => h('div', { class: 'form-grid' },
      h('div', { class: 'row2' },
        field('Chapter word', textInput(b, 'chapterWord', ch)),
        field('Chapter heading', select(b, 'chapterNumbering', [['', 'Template default'], ...CHAPTER_HEADINGS], ch))),
      toggle(b, 'chapterTitles', 'Show chapter titles', 'Turn off to show only the chapter number, e.g. “Chapter One”.', ch),
      toggle(b, 'dropCaps', 'Drop caps in e-books', 'Large initial letter at chapter openings in EPUB and the device preview.', ch),
      toggle(b.print, 'dropCaps', 'Drop caps in print', 'Same, for the PDF, Word export and print preview. Individual chapters can be switched off in the editor.', ch),
      field('Opening line of each chapter', select(b, 'firstLine', [['normal', 'Normal — exactly as typed'], ['smallcaps', 'Small capitals'], ['uppercase', 'All capitals'], ['template', 'As the template designs it']], ch)),
      field('Headings', select(b, 'headingCase', [['template', 'As the template designs them'], ['normal', 'Normal case — no capitals styling']], ch), 'Some templates set chapter numbers and titles in capitals or small capitals.'),
      field('Footnotes', select(b, 'notesPlacement', [['chapter', 'End of each chapter (pop-ups in e-books)'], ['book', 'Collected in an Endnotes section']], () => { if (b.notesPlacement === 'book') app.enableSection('endnotes'); ch(); }))),
    print: () => h('div', { class: 'form-grid' },
      field('Trim size', select(b.print, 'trim', Object.entries(TRIMS).map(([k, t]) => [k, t.label]), ch)),
      toggle(b.print, 'startRecto', 'Chapters start on right-hand pages', 'Inserts blank pages where needed, like a traditionally printed book.', ch),
      toggle(b.print, 'romanFrontMatter', 'Roman numerals for front matter', 'i, ii, iii… before the first chapter.', ch),
      toggle(b.print, 'runningHeads', 'Running heads', 'Author on left pages, title on right pages.', ch),
      field('Right-hand running head', select(b.print, 'rectoHead', [['title', 'Book title'], ['chapter', 'Chapter title']], ch)),
      toggle(b.print, 'includeCover', 'Include front cover in PDF', 'Leave off for printer-ready interiors.', ch)),
  };
  const seg = segmented([{ value: 'general', label: 'General' }, { value: 'cover', label: 'Covers' }, { value: 'chapters', label: 'Chapters' }, { value: 'print', label: 'Print' }], initialTab,
    (v) => pane.replaceChildren(tabs[v]()), { label: 'Settings section' });
  pane.replaceChildren(tabs[initialTab]());
  sheet('Book', h('div', {}, h('div', { class: 'tab-bar' }, seg), pane), {});
}

function toggle(obj, key, label, hint, onChange) {
  const el = h('input', { type: 'checkbox', role: 'switch', class: 'switch' });
  el.checked = obj[key] !== false && !!obj[key];
  el.addEventListener('change', () => { obj[key] = el.checked; onChange(); });
  return h('label', { class: 'toggle-row' }, h('span', { class: 'tr-text' }, h('b', {}, label), hint ? h('small', {}, hint) : null), el);
}

/* ---------------------------------------------------------- templates */
export function openTemplates(app) {
  // My Templates: this book's custom designs plus any saved in the user's library.
  const mine = [...(app.book.customTemplates || []).map((t) => sanitizeTemplate(t)), ...myTemplates()].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
  const all = [...mine, ...TEMPLATES];
  const css = all.map((t) => templateCss(withCasePrefs(t, app.book), `.tpl-card .bk.tpl-${t.id}`, { ctx: 'device', dropCaps: true, color: true })).join('\n');
  const style = h('style', {}, `${baseCss('.tpl-card .bk', 'device')}\n${css}`);
  const grid = h('div', { class: 'tpl-grid' });
  let close;
  const reopen = () => { close(); openTemplates(app); };
  const cats = ['All', ...(mine.length ? ['My Templates'] : []), ...new Set(TEMPLATES.map((t) => t.category))];
  const filter = segmented(cats.map((c) => ({ value: c, label: c })), 'All', (c) => { for (const card of grid.children) card.hidden = c !== 'All' && card.dataset.cat !== c && !card.classList.contains('new'); }, { label: 'Template category' });
  const choose = (t) => {
    if (t.custom && !(app.book.customTemplates || []).some((x) => x.id === t.id)) {
      app.book.customTemplates = [...(app.book.customTemplates || []), t]; // copy into the book so it travels with it
      setCustomTemplates(app.book.customTemplates);
    }
    app.book.template = t.id; app.markDirty(); app.refreshAll(); close(); toast(`Template: ${t.name}`);
  };
  grid.append(h('button', { class: 'tpl-card new', 'data-cat': 'My Templates', onclick: () => { close(); openTemplateEditor(app, tplById(app.book.template), { onSaved: () => openTemplates(app) }); } },
    h('div', { class: 'tpl-page tpl-new' }, icon('plus', 28), h('b', {}, 'New Template'), h('small', {}, `Start from ${tplById(app.book.template).name}`)), h('div', { class: 'tpl-name' }, 'Design your own', h('small', {}, 'Custom'))));
  for (const t of all) {
    const sample = h('div', { class: `bk tpl-${t.id} dropcaps` });
    setHtml(sample, `<section class="bk-sec t-chapter dc-ok dc"><header class="bk-head"><p class="bk-num">${t.numbering === 'none' ? '' : t.numbering.includes('roman') ? 'Chapter III' : t.numbering === 'number-only' ? '3' : 'Chapter Three'}</p><h1 class="bk-title">The Lantern Road</h1><div class="bk-orn"></div></header><div class="bk-body"><p>Morning came slowly to the valley, spilling over the ridge like honey from a tipped jar.</p><p>She packed the lantern anyway.</p><div class="bk-scene"><span></span></div></div></section>`);
    const edit = h('span', { class: 'tpl-edit', role: 'button', title: t.custom ? 'Edit this template' : 'Customize — make your own version', onclick: (e) => { e.stopPropagation(); close(); openTemplateEditor(app, t, { onSaved: () => openTemplates(app) }); } }, icon(t.custom ? 'pen' : 'palette', 14), t.custom ? 'Edit' : 'Customize');
    const card = h('button', { 'data-cat': t.category, class: `tpl-card${app.book.template === t.id ? ' on' : ''}`, onclick: () => choose(t) },
      h('div', { class: 'tpl-page' }, sample, edit), h('div', { class: 'tpl-name' }, t.name, h('small', {}, t.category)));
    grid.append(card);
  }
  close = sheet('Design', h('div', {}, style, h('div', { class: 'tpl-filter' }, filter, h('span', { class: 'hint' }, `${TEMPLATES.length} designs${mine.length ? ` + ${mine.length} of yours` : ''}. Each sets fonts, chapter headings, ornaments, scene breaks and drop caps for every format — preview, PDF, EPUB and Word. Hover a design and choose Customize to make your own.`)), grid), { wide: true });
  void reopen;
}

/* ------------------------------------------------------- bibliography */
export function bibliographyPanel(app, sec) {
  const b = app.book;
  b.bibliography ||= [];
  const list = h('div', { class: 'bib-list' });
  const ch = () => { app.markDirty(); app.refreshPreview(); drawList(); };
  const urlIn = h('input', { type: 'url', placeholder: 'Paste a link to an article, web page, or DOI (https://doi.org/…)', 'aria-label': 'URL to cite' });
  const status = h('div', { class: 'bib-status', role: 'status' });
  const go = h('button', { class: 'btn primary' }, 'Analyze');

  async function analyze() {
    const urls = urlIn.value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    go.disabled = true;
    for (const url of urls) {
      status.textContent = `Fetching ${url} …`;
      try {
        const res = await window.lutefisk.fetchCitation(url);
        let entry;
        if (res.kind === 'csl') entry = fromCsl(res.csl, res.url);
        else if (res.kind === 'html') {
          const doc = new DOMParser().parseFromString(res.html, 'text/html'); // inert: scripts never run
          entry = extractFromDocument(doc, res.url);
        } else entry = { kind: 'webpage', authors: [], title: decodeURIComponent(new URL(res.url).pathname.split('/').pop() || res.url), container: new URL(res.url).hostname, url: res.url, accessed: new Date().toISOString().slice(0, 10) };
        entry.id = `ref-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        b.bibliography.push(entry);
        status.textContent = `Added “${entry.title}”. Check the details below — websites don’t always publish complete metadata.`;
        ch();
      } catch (err) {
        status.textContent = `Couldn’t analyze ${url}: ${cleanErr(err)}`;
      }
    }
    urlIn.value = '';
    go.disabled = false;
  }
  go.addEventListener('click', analyze);
  urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze(); });

  function drawList() {
    const style = b.citationStyle || 'apa';
    const sorted = [...b.bibliography].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
    list.replaceChildren(...(sorted.length ? sorted.map((e) => {
      const item = h('div', { class: 'bib-item' });
      setHtml(item, `<div class="bib-text">${formatEntry(e, style)}</div>`);
      item.append(h('div', { class: 'bib-actions' },
        h('button', { class: 'tb-btn', title: 'Edit', onclick: () => editEntry(app, e, ch) }, icon('gear', 15)),
        h('button', { class: 'tb-btn', title: 'Delete', onclick: async () => { if (await confirmDialog('Delete source?', e.title || 'Untitled')) { b.bibliography = b.bibliography.filter((x) => x !== e); ch(); } } }, icon('trash', 15))));
      return item;
    }) : [h('p', { class: 'hint' }, 'No sources yet. Paste one or more links above, or add a source manually.')]));
  }
  drawList();

  const styleSel = select(b, 'citationStyle', STYLES.map((s) => [s.id, s.label]), () => { ch(); });
  const titleIn = textInput(sec, 'title', () => { app.markDirty(); app.refreshPreview(); app.refreshSidebar(); }, { placeholder: 'References' });
  return h('div', { class: 'gen-panel' },
    h('div', { class: 'row2' }, field('Heading', titleIn), field('Citation style', styleSel)),
    h('div', { class: 'bib-add' }, urlIn, go),
    h('p', { class: 'privacy-note' }, icon('eye', 14), ' Only the link you paste is requested — from that website directly, with no cookies. None of your book is sent.'),
    status,
    h('div', { class: 'bib-tools' }, h('button', { class: 'btn', onclick: () => { const e = { id: `ref-${Date.now().toString(36)}`, kind: 'book', authors: [], title: '', accessed: new Date().toISOString().slice(0, 10) }; editEntry(app, e, () => { if (e.title) { b.bibliography.push(e); ch(); } }); } }, icon('plus', 14), ' Add source manually')),
    list);
}

function cleanErr(err) {
  return String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

async function editEntry(app, e, done) {
  const authors = (e.authors || []).map((a) => (a.literal ? a.literal : `${a.family}, ${a.given}`)).join('; ');
  const res = await dialog({
    title: 'Source details', wide: true,
    fields: [
      { name: 'kind', label: 'Type', type: 'select', value: e.kind || 'webpage', options: [{ value: 'webpage', label: 'Web page' }, { value: 'article', label: 'News / magazine article' }, { value: 'journal', label: 'Journal article' }, { value: 'book', label: 'Book' }] },
      { name: 'authors', label: 'Authors (Last, First; Last, First — or an organization)', value: authors },
      { name: 'title', label: 'Title', value: e.title || '' },
      { name: 'container', label: 'Website / journal / periodical', value: e.container || '' },
      { name: 'publisher', label: 'Publisher', value: e.publisher || '' },
      { name: 'date', label: 'Published (YYYY-MM-DD, YYYY-MM or YYYY)', value: e.date || '' },
      { name: 'volume', label: 'Volume', value: e.volume || '' },
      { name: 'issue', label: 'Issue', value: e.issue || '' },
      { name: 'pages', label: 'Pages', value: e.pages || '' },
      { name: 'url', label: 'URL', value: e.url || '' },
      { name: 'doi', label: 'DOI', value: e.doi || '' },
      { name: 'accessed', label: 'Accessed (YYYY-MM-DD)', value: e.accessed || '' },
    ],
    ok: 'Save',
  });
  if (!res) return;
  Object.assign(e, res);
  e.authors = res.authors.split(';').map((s) => s.trim()).filter(Boolean).map((s) => (s.includes(',') ? parseName(s) : s.split(' ').length > 1 && !/\b(inc|university|association|institute)\b/i.test(s) ? parseName(s) : { literal: s }));
  done();
}

/* ------------------------------------------------- generated sections */
export function generatedPanel(app, sec) {
  const b = app.book;
  const ch = () => { app.markDirty(); app.refreshPreview(); app.refreshSidebar(); };
  switch (sec.type) {
    case 'title-page':
      return h('div', { class: 'gen-panel' },
        h('p', { class: 'hint' }, 'The title page is generated from your book details.'),
        field('Title', textInput(b, 'title', ch)), field('Subtitle', textInput(b, 'subtitle', ch)),
        field('Author', textInput(b, 'author', ch)), field('Publisher / imprint', textInput(b, 'publisher', ch)));
    case 'toc':
      return h('div', { class: 'gen-panel' }, field('Heading', textInput(sec, 'title', ch, { placeholder: 'Contents' })),
        h('p', { class: 'hint' }, 'Built automatically from your sections. Print and PDF show page numbers; e-books get tappable links and a navigation menu.'));
    case 'endnotes':
      return h('div', { class: 'gen-panel' }, field('Heading', textInput(sec, 'title', ch, { placeholder: 'Notes' })),
        field('Where footnotes appear', select(b, 'notesPlacement', [['chapter', 'End of each chapter'], ['book', 'Collected here']], ch)),
        h('p', { class: 'hint' }, 'Add notes in the editor with the footnote button (⌘/Ctrl+Alt+F).'));
    case 'index': {
      b.index ||= { terms: [] };
      const ta = h('textarea', { rows: 14, placeholder: 'One term per line' });
      ta.value = (b.index.terms || []).join('\n');
      ta.addEventListener('input', () => { b.index.terms = ta.value.split('\n').map((s) => s.trim()).filter(Boolean); app.markDirty(); app.refreshPreviewSoon(); });
      return h('div', { class: 'gen-panel' }, field('Heading', textInput(sec, 'title', ch, { placeholder: 'Index' })),
        field('Index terms', ta, 'Every occurrence is located automatically. PDF lists page numbers; EPUB and Word list chapters. Tip: select a word in the editor and use the index button.'));
    }
    case 'bibliography': return bibliographyPanel(app, sec);
    default: return h('div');
  }
}

/* --------------------------------------------------------- statistics */
export function openStats(app) {
  const secs = app.sections().filter((s) => !SECTION_TYPES[s.type]?.generated && !['copyright', 'title-page'].includes(s.type));
  const rep = bookReport(secs.map((s) => ({ id: s.id, title: s.tocTitle, type: s.type, text: markdownToPlain(app.contents[s.id] || '') })), { pages: app.printPageCount() || 0 });
  const t = rep.totals;
  const n = (v) => Number(v).toLocaleString();
  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, value), h('div', { class: 'tile-l' }, label), sub ? h('div', { class: 'tile-s' }, sub) : null);
  const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

  const maxW = Math.max(1, ...rep.sections.map((s) => s.words));
  const chapterRows = rep.sections.map((s) => h('tr', {},
    h('td', { class: 'name' }, s.title),
    h('td', { class: 'num' }, n(s.words)),
    h('td', { class: 'barcell' }, h('div', { class: 'bar', style: { width: `${(s.words / maxW) * 100}%` }, title: `${s.title}: ${n(s.words)} words` })),
    h('td', { class: 'num' }, n(s.sentences)), h('td', { class: 'num' }, s.avgSentence), h('td', { class: 'num' }, s.ease), h('td', { class: 'num' }, `${s.dialoguePercent}%`)));

  const maxB = Math.max(1, ...rep.sentenceBuckets.map((b) => b.count));
  const hist = h('div', { class: 'hist', role: 'img', 'aria-label': 'Sentence length distribution' },
    rep.sentenceBuckets.map((b) => h('div', { class: 'hcol', title: `${b.label} words: ${n(b.count)} sentences` },
      h('div', { class: 'hval' }, n(b.count)), h('div', { class: 'hbar', style: { height: `${(b.count / maxB) * 100}%` } }), h('div', { class: 'hlbl' }, b.label))));
  const r = rep.readability;
  const list = (rows, fmt) => h('ol', { class: 'wordlist' }, rows.map(([w, c]) => h('li', {}, h('span', {}, w), h('b', {}, fmt ? fmt(c) : n(c)))));

  const body = h('div', { class: 'stats' },
    h('div', { class: 'tiles' },
      tile('Words', n(t.words), `${n(t.uniqueWords)} unique`),
      tile('Characters', n(t.characters), `${n(t.charactersNoSpaces)} without spaces`),
      tile('Sentences', n(t.sentences), `${t.avgWordsPerSentence} words avg`),
      tile('Paragraphs', n(t.paragraphs), `${t.avgSentencesPerParagraph} sentences avg`),
      tile('Reading time', mins(t.readingMinutes), `${mins(t.speakingMinutes)} read aloud`),
      tile('Print pages', n(t.estimatedPages), app.printPageCount() ? `at ${TRIMS[app.book.print?.trim || '6x9'].label.split(' (')[0]}` : 'estimated')),
    h('div', { class: 'stat-cols' },
      h('section', {}, h('h3', {}, 'Readability'),
        h('div', { class: 'ease' }, h('div', { class: 'ease-v' }, String(r.fleschReadingEase)), h('div', {}, h('b', {}, 'Flesch Reading Ease'), h('div', { class: 'hint' }, rep.easeLabel))),
        h('table', { class: 'kv' },
          [['Flesch–Kincaid grade', r.fleschKincaidGrade], ['Gunning fog', r.gunningFog], ['SMOG', r.smog], ['Coleman–Liau', r.colemanLiau], ['Automated Readability', r.automatedReadability]].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, String(v)))))),
      h('section', {}, h('h3', {}, 'Style'),
        h('table', { class: 'kv' },
          [['Lexical diversity', `${t.lexicalDiversity}%`], ['Dialogue', `${t.dialoguePercent}% of words`], ['Adverbs (‑ly)', `${n(t.adverbCount)} (${t.adverbPerThousand} per 1,000 words)`], ['Possible passive voice', n(t.passiveCount)], ['Complex words (3+ syllables)', `${t.complexWordPercent}%`], ['Sentences over 30 words', n(t.longSentences)], ['Avg. word length', `${t.avgWordLength} letters`], ['Avg. syllables per word', t.avgSyllablesPerWord]].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: 'num' }, String(v)))))),
      h('section', {}, h('h3', {}, 'Sentence length (words)'), hist)),
    h('section', {}, h('h3', {}, 'By section'),
      h('table', { class: 'chapters' }, h('thead', {}, h('tr', {}, h('th', {}, 'Section'), h('th', { class: 'num' }, 'Words'), h('th', {}, ''), h('th', { class: 'num' }, 'Sentences'), h('th', { class: 'num' }, 'Avg. sentence'), h('th', { class: 'num' }, 'Reading ease'), h('th', { class: 'num' }, 'Dialogue'))), h('tbody', {}, chapterRows))),
    h('div', { class: 'stat-cols' },
      h('section', {}, h('h3', {}, 'Most used words'), list(rep.topWords.slice(0, 20))),
      h('section', {}, h('h3', {}, 'Most used adverbs'), rep.topAdverbs.length ? list(rep.topAdverbs) : h('p', { class: 'hint' }, 'None found.')),
      h('section', {}, h('h3', {}, 'Repeated phrases'), rep.repeatedPhrases.length ? list(rep.repeatedPhrases, (c) => `×${c}`) : h('p', { class: 'hint' }, 'No three-word phrase appears more than twice.'))),
    h('section', {}, h('h3', {}, 'Longest sentences'), h('ol', { class: 'longest' }, rep.longestSentences.map((x) => h('li', {}, h('b', {}, `${x.n} words: `), x.s)))),
    h('p', { class: 'hint' }, 'Excludes the title page, copyright page and generated sections. All analysis runs on this computer.'));
  sheet('Insights', body, { wide: true });
}
