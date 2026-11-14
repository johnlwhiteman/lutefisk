// Help: a short guide to Lutefisk, and a guided tour that walks you through
// making a new book, pointing at each control in turn.
import { h, icon } from './ui.js';

const KEY = (k) => h('kbd', {}, k);

/* ------------------------------------------------------------- topics */
const TOPICS = [
  {
    id: 'start', icon: 'book', title: 'Make your first book',
    body: () => [
      h('p', {}, 'Ten minutes from an empty Library to a finished e-book:'),
      h('ol', { class: 'help-steps' },
        h('li', {}, h('b', {}, 'New Book. '), 'In the Library, click ', h('b', {}, 'New Book'), '. Type a title and your name, pick a starting design, and choose ', h('b', {}, 'Create'), '.'),
        h('li', {}, h('b', {}, 'Write. '), 'Your book opens at ', h('b', {}, 'Chapter One'), '. Click the title to name it, then start typing below the toolbar. Lutefisk saves as you go.'),
        h('li', {}, h('b', {}, 'Add chapters. '), 'Click ', h('b', {}, '+'), ' beside ', h('b', {}, 'Body'), ' in the binder (or ', KEY('⇧⌘N'), '). Drag chapters to reorder them. Right-click one for labels, status and more.'),
        h('li', {}, h('b', {}, 'See it. '), 'The preview on the right shows the page on a real device. Choose the device under ', h('b', {}, 'E-book'), ', or switch to ', h('b', {}, 'Print'), ' for the printed book. Turn pages with the arrows.'),
        h('li', {}, h('b', {}, 'Design it. '), 'Under the device is the template list. Click it and press ↑ ↓ to flip through designs — the device shows each one with example text (turn on Live to see your own). Enter keeps one.'),
        h('li', {}, h('b', {}, 'Add the extras. '), 'Click ', h('b', {}, 'Book'), ' in the binder for the cover, authors and details. Turn on front and back matter (dedication, contents, about the author) with the ', h('b', {}, '+'), ' beside each group.'),
        h('li', {}, h('b', {}, 'Export. '), 'Click ', h('b', {}, 'Export'), ' at the top right: EPUB for e-book stores, PDF for print, Word for an editor.')),
      h('p', { class: 'hint' }, 'Want to be shown where everything is? Start the guided tour.'),
    ],
    tour: true,
  },
  {
    id: 'window', icon: 'panelHide', title: 'The window',
    body: () => [
      h('p', {}, 'A book window has three panes. Hide any of them with the button at its top right; a slim rail brings it back.'),
      h('dl', { class: 'help-dl' },
        h('dt', {}, 'Binder (left)'), h('dd', {}, 'The cover with Book settings and Goals; search; the Logline; your sections; Planning (Characters and Plot); Research, with Snippets and your To-Do list; and the Recycle Bin.'),
        h('dt', {}, 'Editor (middle)'), h('dd', {}, 'Chapters and Scenes menus, the comments switch, the Snippets panel, text size and Focus. The bottom bar shows your word counts — click it for Insights — and the stopwatch.'),
        h('dt', {}, 'Preview (right)'), h('dd', {}, 'E-book or Print, Zoom, text size and Focus on top; the device and its reading theme below; under the device, the template list and its gear.')),
      h('p', {}, 'Hover any button to see what it does.'),
    ],
  },
  {
    id: 'writing', icon: 'pen', title: 'Writing',
    body: () => [
      h('ul', {},
        h('li', {}, 'The toolbar has paragraph styles, bold, italic, underline, lists (including your own bullets), breaks, links, images, citations and footnotes, tables, equations and symbols.'),
        h('li', {}, 'Comments: select text and press ', KEY('⌃⌥M'), '. The comment icon at the top of the editor shows or hides them.'),
        h('li', {}, 'Scenes: split a chapter with the Scenes menu. Each scene has its own label, status and Insights.'),
        h('li', {}, 'Focus (', KEY('⇧⌘F'), ') hides everything but your page.'),
        h('li', {}, 'The ', h('b', {}, 'Tᴛ'), ' button beside a title checks its capitalization in APA, Chicago, MLA and AP style.'),
        h('li', {}, h('b', {}, 'Logline'), ' (top of the binder): your story in a sentence, with a builder for who, when, wants, but and or else.'),
        h('li', {}, h('b', {}, 'Snippets'), ' (Research): passages saved for later, with bold, italic, lists and more. Open the Snippets panel beside the editor and drag one into your text — or right-click in the editor › Insert Snippet. Once inserted, it leaves the list.'),
        h('li', {}, h('b', {}, 'To-Do'), ' (Research): things to do for this book, each with an optional deadline. A red badge shows how many are overdue; the list shows what’s open, done and due this week.'),
        h('li', {}, 'The title bar shows the whole book’s words and approximate pages, updating as you type.'),
        h('li', {}, 'Insights › Reset… clears the writing history for this book or for all books.'),
        h('li', {}, h('b', {}, 'Code'), ': the </> button inserts a code block — choose from dozens of programming, scripting and shell languages, plus JSON, YAML, XML and other data formats. Highlighting matches in the preview and every export. Line numbers are off unless you switch them on for a block.'),
        h('li', {}, h('b', {}, 'Recycle Bin'), ' (bottom of the binder): deleted chapters, scenes, notes, snippets, to-dos, characters and plot cards go here first. Restore puts one back where it was; Delete Forever or Empty Recycle Bin removes them for good.')),
    ],
  },
  {
    id: 'design', icon: 'palette', title: 'Templates and devices',
    body: () => [
      h('ul', {},
        h('li', {}, 'Templates set fonts, chapter openings, ornaments and drop caps for every format at once.'),
        h('li', {}, 'In the template list under the device, ↑ ↓ (or ← →) try each design live. ', KEY('Enter'), ' keeps it; ', KEY('Esc'), ' goes back to the one you had. Type to find one by name.'),
        h('li', {}, 'The gallery (Gallery… in the list) shows every design side by side with example text — or your own, with Live.'),
        h('li', {}, 'The gear beside the list edits the current design. Built-in designs are never overwritten — you get your own copy.'),
        h('li', {}, 'Devices: iPad, iPhone, Galaxy S26, Galaxy Tab S11 and three Kindles, drawn to scale; Print shows the open book.')),
    ],
  },
  {
    id: 'export', icon: 'export', title: 'Exporting',
    body: () => [
      h('dl', { class: 'help-dl' },
        h('dt', {}, 'EPUB'), h('dd', {}, 'For Apple Books, Kobo, Google Play and Kindle (through KDP).'),
        h('dt', {}, 'PDF'), h('dd', {}, 'Print-ready, exactly as the Print preview shows.'),
        h('dt', {}, 'Word, Rich Text'), h('dd', {}, 'For editors and agents.'),
        h('dt', {}, 'Markdown, Text'), h('dd', {}, 'Plain files to keep or share anywhere.'),
        h('dt', {}, 'MOBI'), h('dd', {}, 'For older Kindles only.')),
    ],
  },
  {
    id: 'keys', icon: 'keyboard', title: 'Shortcuts',
    body: () => [
      h('table', { class: 'help-keys' }, ...[
        ['New book / Open / Save', '⌘N / ⌘O / ⌘S'], ['New chapter / New scene', '⇧⌘N / ⌥⌘N'], ['Search / Find and replace', '⌘F / ⇧⌘H'],
        ['Focus on writing / on preview', '⇧⌘F / ⌥⌘P'], ['E-book / Print / Insights', '⌥⌘1 / ⌥⌘2 / ⌥⌘3'],
        ['Show or hide comments', '⌥⌘C'], ['Editor text size', '⌘+ / ⌘− / ⌘0'], ['Back up book', '⇧⌘S'], ['Help', 'F1'],
      ].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, KEY(b))))),
      h('p', { class: 'hint' }, 'On Windows and Linux, use Ctrl for ⌘.'),
    ],
  },
  {
    id: 'privacy', icon: 'lock', title: 'Privacy',
    body: () => [
      h('p', {}, 'Your books never leave your computer. Lutefisk has no accounts, cloud or tracking, and the app window can’t reach the internet. The one exception: when you paste a link into the Bibliography and press Analyze, Lutefisk reads that one page.'),
      h('p', {}, 'A book is an ordinary folder of Markdown files and pictures, so you can back it up or put it under version control.'),
    ],
  },
];

/* --------------------------------------------------------- help sheet */
export function openHelp(app, { topic = 'start' } = {}) {
  document.querySelector('.help-overlay')?.remove();
  const nav = h('nav', { class: 'help-nav' });
  const main = h('div', { class: 'help-main' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const show = (id) => {
    const t = TOPICS.find((x) => x.id === id) || TOPICS[0];
    for (const b of nav.children) b.classList.toggle('on', b.dataset.id === t.id);
    main.replaceChildren(h('h2', {}, icon(t.icon, 20), t.title), ...t.body(),
      t.tour ? h('div', { class: 'help-tour-row' },
        h('button', { class: 'btn primary', onclick: () => { close(); startTour(app); } }, icon('play', 14), 'Start the Guided Tour'),
        h('small', { class: 'hint' }, app.book ? 'Points at each control in this window, one step at a time.' : 'Starts in the Library, then continues when your book opens.')) : '');
    main.scrollTop = 0;
  };
  nav.append(...TOPICS.map((t) => h('button', { class: 'help-tab', 'data-id': t.id, onclick: () => show(t.id) }, icon(t.icon, 15), t.title)));
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const overlay = h('div', { class: 'overlay help-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet wide help-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lutefisk Help' },
      h('header', { class: 'sheet-head' }, h('h2', {}, icon('help', 18), 'Lutefisk Help'), h('div', { class: 'sheet-actions' }, h('button', { class: 'btn primary small', onclick: close }, 'Done'))),
      h('div', { class: 'help-body' }, nav, main)));
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  show(topic);
}

/* ------------------------------------------------------- guided tour */
// Each step points at an element. Steps whose element isn't on screen are skipped.
const LIBRARY_STEPS = [
  { sel: '.lib-new', title: 'Start a new book', text: 'Click New Book, give it a title and your name, and choose Create. The tour carries on when your book opens.', wait: 'book' },
];
const BOOK_STEPS = [
  { sel: '.sb-book', title: 'Your book', text: 'The cover, with Book (details, cover, authors, chapters and print settings) and Goals beside it.' },
  { sel: '.sidebar .sb-scroll', title: 'The binder', text: 'Every part of your book. Click to open one, drag to reorder, right-click for labels, status and more. The + beside each group adds a section.' },
  { sel: '.sec-head .sec-title', title: 'Name your chapter', text: 'A new book starts at Chapter One. Type a title here, or leave it blank to show just “Chapter One”.' },
  { sel: '.ql-toolbar', title: 'Format your text', text: 'Paragraph styles, bold and italic, lists, breaks, links, images, notes, tables, equations and symbols.' },
  { sel: '.ql-container', title: 'Write', text: 'Type here. Lutefisk saves as you go, and the preview follows your cursor.' },
  { sel: '.ed-top .sec-opts', title: 'Chapters, scenes and comments', text: 'Jump to any chapter, split a chapter into scenes, show or hide comments, and open the Snippets panel to drag snippets into your text.' },
  { sel: '.editor-pane .book-bar', title: 'Your progress', text: 'Words and pages, this session, today against your goal, and the stopwatch. Click a number for Insights.' },
  { sel: '.pv-switch .segmented', title: 'E-book or Print', text: 'See the book on a device, or as a printed book with facing pages.' },
  { sel: '.pv-bar .pv-ctl', title: 'Choose a device', text: 'iPad, iPhone, Galaxy and Kindle models, drawn to scale.' },
  { sel: '.pv-host:not([hidden]) .ts-strip', title: 'Design', text: 'The template sets the whole look. Open the list and press ↑ ↓ — the device shows each design with example text, or your own with Live. The gear edits the current one.' },
  { sel: '.pager', title: 'Turn the pages', text: 'Contents jumps to any part of the book; the arrows (or ← →) turn pages.' },
  { sel: '.tb-backup', title: 'Back up', text: 'Save a copy of the whole book — a .zip or a folder — beside it or anywhere you choose (⇧⌘S).' },
  { sel: '.export-btn', title: 'Export', text: 'EPUB, PDF, Word, RTF, MOBI, Markdown or Text — when you’re ready.' },
  { sel: '.tb-help', title: 'Help any time', text: 'Click ? (or press F1) to open Help or take this tour again.' },
];

let tourState = null;
export function startTour(app) {
  endTour();
  tourState = { app, steps: app.book ? BOOK_STEPS : LIBRARY_STEPS, i: 0 };
  try { localStorage.setItem('lutefisk.tourSeen', '1'); } catch { /* ignore */ }
  if (!app.book) tourState.continueInBook = true;
  drawStep();
}
/** Called when a book opens: a tour begun in the Library carries on. */
export function resumeTour(app) {
  if (!tourState?.continueInBook) return;
  tourState = { app, steps: BOOK_STEPS, i: 0 };
  setTimeout(drawStep, 600);
}
export function endTour() {
  document.querySelectorAll('.tour-ring, .tour-tip').forEach((e) => e.remove());
  window.removeEventListener('resize', drawStep);
  document.removeEventListener('keydown', tourKey, true);
}
function tourKey(e) {
  if (!tourState) return;
  if (e.key === 'Escape') { e.preventDefault(); tourState = null; endTour(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
}
function go(d) {
  if (!tourState) return;
  const { steps } = tourState;
  let i = tourState.i + d;
  while (i >= 0 && i < steps.length && !visible(steps[i].sel)) i += d;
  if (i < 0) i = tourState.i;
  if (i >= steps.length) { tourState = null; endTour(); return; }
  tourState.i = i;
  drawStep();
}
const visible = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
function drawStep() {
  document.querySelectorAll('.tour-ring, .tour-tip').forEach((e) => e.remove());
  if (!tourState) return;
  const { steps } = tourState;
  while (tourState.i < steps.length && !visible(steps[tourState.i].sel)) tourState.i++;
  const step = steps[tourState.i];
  if (!step) { tourState = null; endTour(); return; }
  const el = document.querySelector(step.sel);
  const r = el.getBoundingClientRect();
  const pad = 6;
  const ring = h('div', { class: 'tour-ring' });
  Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const n = steps.length;
  const last = tourState.i >= n - 1;
  const tip = h('div', { class: 'tour-tip', role: 'dialog', 'aria-label': step.title },
    h('div', { class: 'tour-count' }, n > 1 ? `${tourState.i + 1} of ${n}` : 'Guided tour'),
    h('b', {}, step.title), h('p', {}, step.text),
    h('div', { class: 'tour-acts' },
      h('button', { class: 'btn small plain', onclick: () => { tourState = null; endTour(); } }, step.wait ? 'Close' : 'End Tour'),
      h('span', { class: 'spacer' }),
      tourState.i > 0 ? h('button', { class: 'btn small', onclick: () => go(-1) }, 'Back') : null,
      step.wait ? null : h('button', { class: 'btn small primary', onclick: () => go(1) }, last ? 'Finish' : 'Next')));
  document.body.append(ring, tip);
  // Place the tip beside the element, inside the window.
  const t = tip.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  let left = r.right + 14, top = r.top;
  if (left + t.width > W - 8) left = r.left - t.width - 14;
  if (left < 8) { left = Math.min(W - t.width - 8, Math.max(8, r.left)); top = r.bottom + 14; if (top + t.height > H - 8) top = r.top - t.height - 14; }
  top = Math.min(H - t.height - 8, Math.max(8, top));
  Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  window.removeEventListener('resize', drawStep);
  window.addEventListener('resize', drawStep);
  document.removeEventListener('keydown', tourKey, true);
  document.addEventListener('keydown', tourKey, true);
  tip.querySelector('.btn.primary, .btn')?.focus();
}
