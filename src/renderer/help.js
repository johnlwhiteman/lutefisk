// Help: a short guide to Lutefisk, and a guided tour that walks you through
// making a new book, pointing at each control in turn.
import { h, icon } from './ui.js';

const KEY = (k) => h('kbd', {}, k);

/* ------------------------------------------------------------- topics */
// Small building blocks so every topic reads the same way.
const lede = (text) => h('p', { class: 'help-lede' }, text);
const tip = (...kids) => h('div', { class: 'help-callout' }, icon('lightbulb', 15), h('div', {}, ...kids));
const card = (ic, title, ...kids) => h('div', { class: 'help-card' }, h('div', { class: 'help-card-head' }, h('span', { class: 'help-ic' }, icon(ic, 16)), h('b', {}, title)), h('div', { class: 'help-card-body' }, ...kids));
const cards = (...kids) => h('div', { class: 'help-cards' }, ...kids);
const steps = (...items) => h('ol', { class: 'help-steps' }, ...items.map(([t, ...rest]) => h('li', {}, h('b', {}, t), ' ', ...rest)));
const B = (t) => h('b', {}, t);

const TOPICS = [
  {
    id: 'start', icon: 'book', title: 'Get started', blurb: 'From an empty Library to a finished e-book.',
    body: () => [
      lede('Lutefisk is a quiet place to write a book and see it as readers will — on an e-reader, a phone or a printed page — then export it ready to publish.'),
      steps(
        ['Create a book.', 'In the Library, click ', B('New Book'), ', type a title and your name, pick a starting design and choose ', B('Create'), '.'],
        ['Write.', 'Your book opens at ', B('Chapter One'), '. Name it if you like, then type below the toolbar. Lutefisk saves as you go.'],
        ['Add chapters.', 'Click ', B('+'), ' beside ', B('Body'), ' in the binder, or press ', KEY('⇧⌘N'), '. Drag to reorder; right-click for more.'],
        ['Watch the preview.', 'The right side shows the page on a real device. Switch to ', B('Print'), ' to see the printed book.'],
        ['Choose a design.', 'Open the template list under the device and press ↑ ↓ — each design appears as you go. ', KEY('Enter'), ' keeps one.'],
        ['Finish the book.', 'Click the cover in the binder for the title, authors and cover image. Add a dedication, contents or acknowledgments with the ', B('+'), ' beside each group.'],
        ['Export.', B('Export'), ' at the top right makes an EPUB for e-book stores, a PDF for print, or a Word file for an editor.']),
      tip('New here? The guided tour points at each control in turn.'),
    ],
    tour: true,
  },
  {
    id: 'window', icon: 'panelHide', title: 'The window', blurb: 'Binder, editor and preview.',
    body: () => [
      lede('A book window has three panes. Hide any of them with the button at its top right; a slim rail brings it back.'),
      cards(
        card('binder', 'Binder — left', 'Your book’s cover (click it for Book settings), Goals and Insights, search, the Logline, every section, Tools (Characters, Plot, Timeline, Snippets, To-Do), Research and the Recycle Bin.'),
        card('pen', 'Editor — middle', 'Chapter and scene menus, Comments and Snippets (one at a time, on the right), text size and Focus. The bar at the bottom counts words and pages and runs the stopwatch.'),
        card('device', 'Preview — right', 'E-book or Print, Zoom and text size on top; the device and reading theme below; the template list under the device.')),
      h('p', {}, 'The title bar shows the whole book’s words and pages as you type, a Back Up link, and — at the right — Export, Settings, day or night, and Help.'),
    ],
  },
  {
    id: 'writing', icon: 'pen', title: 'Writing and formatting', blurb: 'Styles, highlighter, spelling, code, equations.',
    body: () => [
      lede('The toolbar has everything a book needs, with the less-used choices tucked into small menus.'),
      cards(
        card('textStyle', 'Text', 'Bold, italic, underline, strikethrough, superscript and subscript. Paragraph styles include headings, block quotes, verse, hanging indents and ', B('Attribution'), ' — the source line under a quote or epigraph, set to the right.'),
        card('spell', 'Spelling & Grammar', 'Settings › Spelling & Grammar turns checking on or off and chooses ', B('Automatic'), ' (as you type) or ', B('On Demand'), '. The ', B('ABC'), ' button above the text (or ', KEY('F7'), ') checks now and goes to the first problem; ', KEY('⌥F7'), ' steps to the next. Right-click an underlined word for suggestions or to add it to your dictionary. The checker (Harper) is built in and runs on this computer; nothing is sent anywhere.'),
        card('highlighter', 'Highlighter', 'Mark passages in seven colors (yellow, bright yellow, green, blue, pink, orange, purple), as a full, half or underline stroke. Highlights are for you — they don’t print. ', KEY('⇧⌘H'), ' uses the last pen.'),
        card('code', 'Code', 'The ', B('</>'), ' button inserts code as a ', B('Block'), ' (its own lines, with highlighting for dozens of languages — Python, JavaScript, Bash, PowerShell, SQL, JSON, YAML, XML and more) or ', B('Inline'), ' (in the sentence). Each block has ', B('Colors'), ' and ', B('Line numbers'), ' switches beside its language; code has no background and no border (add a thin, medium or thick one from the block’s bar if you like), so it suits any page.'),
        card('sigma', 'Equations', 'Write LaTeX and see it typeset live. Choose ', B('Inline'), ' (in the sentence) or ', B('Block'), ' (on its own line). The Reference tab explains how to write fractions, matrices and more; Symbols has a palette.'),
        card('comment', 'Comments', 'Select text and press ', KEY('⌃⌥M'), '. The comment button shows or hides the margin; opening Comments closes Snippets.'),
        card('scene', 'Scenes', 'Split a chapter into scenes at its scene breaks, or add scenes one by one. Each scene has its own label, statuses and Insights.')),
      tip('Focus (', KEY('⇧⌘F'), ') hides everything but your page. The ', B('Tᴛ'), ' button beside a title checks its capitalization.'),
    ],
  },
  {
    id: 'organize', icon: 'filter', title: 'Organizing', blurb: 'Labels, statuses, filters and the Recycle Bin.',
    body: () => [
      cards(
        card('tag', 'Labels', 'Color-code chapters and scenes — by point of view, timeline or anything else. Right-click › Label.'),
        card('status', 'Statuses', 'Tick as many as apply: To Do, In Progress, First Draft, Needs Review, Reviewed, Revised, Finished — or add your own.'),
        card('filter', 'Filter', 'The funnel at the top of the binder shows only chapters and scenes with chosen labels or statuses, or only those excluded from export and print.'),
        card('eyeOff', 'Exclude from Export', 'Keep a chapter in your manuscript but leave it out of the preview, exports and print.'),
        card('trash', 'Recycle Bin', 'Deleted chapters, scenes, notes, snippets, to-dos, characters and plot cards go here first. Restore puts one back where it was.')),
    ],
  },
  {
    id: 'plan', icon: 'plot', title: 'Tools and research', blurb: 'Logline, characters, plot, timeline, snippets, to-dos.',
    body: () => [
      cards(
        card('logline', 'Logline', 'Your story in one or two sentences — aim for 25 to 50 words. It sits at the top of the binder to keep you on course.'),
        card('people', 'Characters', 'A card for everyone in the story: portrait, role, traits and notes.'),
        card('plot', 'Plot', 'A board of cards in plotlines and columns. Link a column to a chapter, and tag cards with characters.'),
        card('clock', 'Timeline', 'The same cards in the order things ', B('happen'), ' rather than the order you tell them. Give each a ', B('When'), ' — “Spring 1922”, “Day 3, dawn”, “Year 300” — and drag, or press ', B('Sort by When'), '. Add ', B('Events'), ' for backstory that isn’t a scene. A scene told after something that happens later is marked ', B('Flashback'), '. Open it from Timeline in the binder or the Board/Timeline switch on the Plot sheet.'),
        card('snippet', 'Snippets', 'Passages saved for later, with full formatting. Open the Snippets panel beside the editor and drag one into place — it leaves the list once it’s in.'),
        card('checklist', 'To-Do', 'Things to do for this book, with optional deadlines (tick ', B('Today'), ' to date them today), statistics, and a red badge for anything overdue.'),
        card('doc', 'Research', 'Notes, pictures, PDFs and links that belong to the book but never print.')),
    ],
  },
  {
    id: 'characters', icon: 'people', title: 'Walkthrough: Characters', blurb: 'Build your cast and see where everyone appears.',
    body: () => [
      lede('Characters keeps a card for everyone in your story and finds them in your manuscript as you write, so you can see which chapters each person is in.'),
      steps(
        ['Open Characters.', 'Click ', B('Characters'), ' under Tools in the binder (or View › Characters).'],
        ['Add someone.', 'Click ', B('New Character'), '. If your manuscript already has text, names that come up often are offered as chips — click one to add that person straight away.'],
        ['Name them and give a role.', 'Type the name at the top, and a role underneath, like Protagonist, Mentor or Antagonist (pick from the list or type your own).'],
        ['Choose an avatar.', 'Click the round portrait: pick a color and one of the icon portraits, upload a picture (square, 256 × 256 px or larger works best), or use their initials.'],
        ['Fill in attributes.', 'Age, goal, flaw, backstory and the rest are ready to fill in. ', B('Add Attribute'), ' adds your own; the × removes one you don’t need.'],
        ['Write notes.', 'Notes is for anything else — voice, relationships, scenes you want to write.'],
        ['Tell Lutefisk how they’re named.', 'Under ', B('Found by'), ', list nicknames and titles in ', B('Also known as'), ', separated by commas. Leave “Match the first name on its own” on to count “Mara” as well as “Mara Quill”. Names match as whole words with the same capitals, so “Will” isn’t found in “will”.'],
        ['See where they appear.', B('Appears in'), ' shows a strip with a square for every chapter (darker means more mentions) and a list of the chapters and scenes they’re in. Click one to jump to it.']),
      tip('Characters also tag cards on the Plot board and the Timeline, and the ', B('All Characters'), ' filter there lights up one person’s cards. A deleted character goes to the Recycle Bin.'),
    ],
  },
  {
    id: 'plotwalk', icon: 'plot', title: 'Walkthrough: Plot', blurb: 'Plotlines, columns and cards on a board.',
    body: () => [
      lede('The Plot board is a grid of cards. Each row is a plotline — the main plot, a subplot, a romance, a mystery — and each column is a chapter, in the order you tell the story.'),
      steps(
        ['Open the board.', 'Click ', B('Plot'), ' under Tools in the binder (or View › Plot Board, ⌥⌘L). Make sure ', B('Board'), ' is selected at the top left.'],
        ['Name your plotlines.', 'The board starts with Main Plot and Subplot. Click a name to rename it. ', B('+ Plotline'), ' adds a row; the ⋯ beside a row changes its color, moves it, or deletes it.'],
        ['Use your chapters as columns.', 'Every chapter in the book is already a column, in book order, and new chapters appear on their own. Click a chapter’s name to open it. ', B('+ Column'), ' adds a free column for acts or beats; the ⋯ on a column inserts, moves or hides it.'],
        ['Add a card.', 'Hover over a cell and click ', B('+'), ' (or double-click the cell). Write what happens, add details, and tag the characters involved.'],
        ['Bring in what you’ve written.', B('Add from Chapters'), ' turns existing chapters and scenes into cards (in their chapter’s column) or into columns of their own.'],
        ['Re-plan by dragging.', 'Drag a card to another cell to move it to a different chapter or plotline, or up and down to reorder. Select a card and press Delete to remove it.'],
        ['Follow one character.', 'Choose a name from ', B('All Characters'), ' at the top right: their cards light up and the rest fade, so you can see whether someone disappears for too long.']),
      tip('Give a card a ', B('When'), ' in its editor to place it on the Timeline. A card set to “Timeline only (not on the board)” becomes a backstory event.'),
    ],
  },
  {
    id: 'timeline', icon: 'clock', title: 'Walkthrough: Timeline', blurb: 'The order things happen, and your flashbacks.',
    body: () => [
      lede('The Timeline shows your plot cards in the order things happen in the story, which can be different from the order you tell them. It’s where you check that the chronology holds up and see your flashbacks.'),
      steps(
        ['Open the Timeline.', 'Click ', B('Timeline'), ' under Tools in the binder (or View › Story Timeline), or switch the Plot sheet from Board to ', B('Timeline'), '. Every card from the board is already here.'],
        ['Say when each thing happens.', 'Click ', B('When?'), ' to the left of a card (or click the card) and type a time in any form you like: “Spring 1922”, “March 3, 1922”, “Day 3, dawn”, “Year 300”, “12 BC”.'],
        ['Put events in order.', 'Press ', B('Sort by When'), ' to order everything by the dates and numbers in those labels, or drag cards into place yourself (⌥↑ and ⌥↓ move the selected card). Your order is kept.'],
        ['Add backstory.', B('+ Event'), ' (or the small + between two cards) adds something that happens off the page — a birth, a war, a secret kept for years. Events have a dashed outline and the label ', B('Backstory'), '.'],
        ['Read the tags.', 'Each card shows its plotline and where it’s told, such as ', B('Ch 3'), ' — click that to open the chapter. A card marked ', B('Flashback'), ' is told after something that happens later in the story.'],
        ['Edit and connect.', 'Click a card to change its title, details, When, plotline, characters, or the chapter it’s told in. Choosing a chapter puts an event on the board; choosing “Timeline only” takes a card off it.'],
        ['Follow one character.', B('All Characters'), ' lights up one person’s path through the story’s time.']),
      tip('The count at the top right shows how many events and flashbacks the story has. Board and Timeline are two views of the same cards, so a change in one shows in the other.'),
    ],
  },
  {
    id: 'design', icon: 'palette', title: 'Templates', blurb: '95 designs, one key press apart.',
    body: () => [
      lede('A template sets the whole look of the book — fonts, chapter openings, drop caps, ornaments and scene breaks — for every format at once.'),
      h('ul', { class: 'help-list' },
        h('li', {}, 'Open the list under the device and press ↑ ↓ (or ← →). The device shows each design with example text; turn on ', B('Live'), ' to see your own book. ', KEY('Enter'), ' keeps it, ', KEY('Esc'), ' goes back.'),
        h('li', {}, B('Gallery…'), ' shows every design side by side.'),
        h('li', {}, 'The gear edits the current design. Built-in designs are never overwritten: your changes are saved as ', B('Modified'), ', and designs you build yourself as ', B('Custom'), '.')),
    ],
  },
  {
    id: 'devices', icon: 'device', title: 'Devices and print', blurb: 'Phones, tablets, e-readers and paper.',
    body: () => [
      lede('Every device is drawn to scale with its real screen resolution, so line lengths and page breaks look the way readers will see them.'),
      h('table', { class: 'help-keys help-devices' },
        ...[['Apple', 'iPad, iPhone'], ['Android', 'Galaxy S26, Galaxy Tab S11'], ['Kindle', 'Basic, Paperwhite, Scribe'], ['Kobo', 'Libra Color (color E Ink)'], ['Nook', 'GlowLight 3, GlowLight 4, GlowLight 4 Plus']]
          .map(([a, b]) => h('tr', {}, h('td', {}, B(a)), h('td', {}, b)))),
      h('p', {}, 'Click the device name and press ↑ ↓ to switch devices as you go. Phones and tablets have light, sepia and dark reading themes; the text-size slider shows how a reader who enlarges the type will see your book.'),
      h('p', {}, B('Print'), ' shows the open book with facing pages at your trim size. Choose a ', B('Paper'), ' — cream, bright white, ivory, natural, recycled, laid, linen, parchment, antique or newsprint — to see the pages on different stock. (Paper changes only the preview, not the PDF.) The book always fits the view. The ', B('A–A'), ' slider sets the printed body type from 9 to 14 pt; hover over it or drag it to see the size.'),
    ],
  },
  {
    id: 'goals', icon: 'target', title: 'Goals and Insights', blurb: 'Targets, history and text analysis.',
    body: () => [
      cards(
        card('target', 'Goals', 'Set a word target and a deadline; Lutefisk works out a daily goal and tracks it. A daily goal can be words, hours, pages or any mix — or choose ', B('Write like…'), ' to use the habit of Stephen King, Maya Angelou, Ernest Hemingway, Virginia Woolf, Haruki Murakami, Margaret Atwood, Anthony Trollope, Joyce Carol Oates, Nicholas Sparks or Nora Roberts.'),
        card('chart', 'Insights', 'Writing history by day, streaks and writing time, plus an analysis of the text: readability, sentence length, dialogue, adverbs and passive voice, chapter by chapter. Open it under Goals in the binder.'),
        card('reset', 'Reset', 'Insights › Reset… clears the writing history for this book or for all books.')),
    ],
  },
  {
    id: 'export', icon: 'export', title: 'Export and back up', blurb: 'EPUB, PDF, Word and more.',
    body: () => [
      h('dl', { class: 'help-dl' },
        h('dt', {}, 'EPUB'), h('dd', {}, 'For Apple Books, Kobo, Nook, Google Play and Kindle (through KDP).'),
        h('dt', {}, 'PDF'), h('dd', {}, 'Print-ready, exactly as the Print preview shows.'),
        h('dt', {}, 'Word, Rich Text'), h('dd', {}, 'For editors and agents.'),
        h('dt', {}, 'Markdown, Text'), h('dd', {}, 'Plain files to keep or share anywhere.'),
        h('dt', {}, 'MOBI'), h('dd', {}, 'For older Kindles only.')),
      tip(B('Back Up'), ' in the title bar (', KEY('⇧⌘S'), ') saves a .zip or a folder copy of the whole book, beside it or anywhere you choose.'),
    ],
  },
  {
    id: 'access', icon: 'eye', title: 'Vision and comfort', blurb: 'Larger, clearer, calmer.',
    body: () => [
      lede('Settings › Vision & Comfort makes Lutefisk easier to see and use.'),
      cards(
        card('textSize', 'Bigger everything', 'Interface size from 90% to 200% (', KEY('⇧⌘+'), ' / ', KEY('⇧⌘−'), '). The editor text goes from 25% to 300% (', KEY('⌘+'), ' / ', KEY('⌘−'), ').'),
        card('textStyle', 'Easier-to-read font', 'Atkinson Hyperlegible, designed for low vision, for the interface and editor. Your book keeps its own fonts.'),
        card('sun', 'Contrast', 'Stronger contrast darkens secondary text and borders and underlines links. The High Contrast skin goes further, day or night.'),
        card('pen', 'Line spacing', 'Normal, Relaxed or Loose spacing in the editor.'),
        card('keyboard', 'Keyboard focus', 'A bold focus ring always shows where you are; every control has a tooltip and most have a shortcut.'),
        card('pause', 'Reduce motion', 'Turns off animations and sliding panels. Lutefisk also follows your computer’s reduce-motion setting.')),
      tip('Settings › Language shows menus and buttons in English (US or UK), German, French, Italian, Spanish, Polish, Russian, Ukrainian, Indonesian, Malay, Vietnamese, Japanese, Chinese or Korean, with Lakota under way. Your book’s language is separate.'),
      tip('Equations keep their LaTeX as alt text, and images keep their descriptions, so screen readers can read them in your exported books.'),
    ],
  },
  {
    id: 'keys', icon: 'keyboard', title: 'Shortcuts', blurb: 'The keys worth knowing.',
    body: () => [
      h('table', { class: 'help-keys' }, ...[
        ['New book / Open / Save', '⌘N / ⌘O / ⌘S'], ['New chapter / New scene', '⇧⌘N / ⌥⌘N'], ['Search / Find and replace', '⌘F / ⇧⌘H'],
        ['Bold / Italic / Underline', '⌘B / ⌘I / ⌘U'], ['Highlight with the last pen', '⇧⌘H'], ['Link / Footnote / Equation', '⌘K / ⌥⌘F / ⌥⌘E'],
        ['Comment on the selection', '⌃⌥M'], ['Show or hide comments', '⌥⌘C'], ['Check spelling / next problem', 'F7 / ⌥F7'],
        ['Focus on writing / on preview', '⇧⌘F / ⌥⌘P'], ['E-book / Print / Insights', '⌥⌘1 / ⌥⌘2 / ⌥⌘3'],
        ['Editor text size', '⌘+ / ⌘− / ⌘0'], ['Interface size', '⇧⌘+ / ⇧⌘− / ⇧⌘0'], ['Back up book', '⇧⌘S'], ['Help', 'F1'],
      ].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, KEY(b))))),
      h('p', { class: 'hint' }, 'On Windows and Linux, use Ctrl for ⌘ and Alt for ⌥.'),
    ],
  },
  {
    id: 'privacy', icon: 'lock', title: 'Privacy', blurb: 'Your words stay on your computer.',
    body: () => [
      lede('Your books never leave your computer.'),
      h('ul', { class: 'help-list' },
        h('li', {}, 'No accounts, no cloud, no tracking, no automatic updates. The app window can’t reach the internet.'),
        h('li', {}, 'The one exception: when you paste a link into the Bibliography and press Analyze, Lutefisk reads that one page — and sends nothing from your book.'),
        h('li', {}, 'A book is an ordinary folder of Markdown files and pictures, so you can back it up or put it under version control.')),
    ],
  },
];

/* --------------------------------------------------------- help sheet */
export function openHelp(app, { topic = 'home' } = {}) {
  document.querySelector('.help-overlay')?.remove();
  const nav = h('nav', { class: 'help-nav', 'aria-label': 'Help topics' });
  const main = h('div', { class: 'help-main', tabindex: -1 });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const tourBtn = (big) => h('button', { class: `btn ${big ? 'primary' : ''}`, onclick: () => { close(); startTour(app); } }, icon('play', 14), 'Take the Guided Tour');
  const home = () => [
    h('div', { class: 'help-hero' },
      h('div', {}, h('h2', {}, 'Welcome to Lutefisk'), h('p', {}, 'Write your book, see it on real devices and in print, and export it ready to publish — all on your own computer.')),
      tourBtn(true)),
    h('div', { class: 'help-grid' }, ...TOPICS.map((t) => h('button', { class: 'help-tile', onclick: () => show(t.id) },
      h('span', { class: 'help-ic' }, icon(t.icon, 18)), h('b', {}, t.title), h('small', {}, t.blurb)))),
  ];
  const show = (id) => {
    for (const b of nav.querySelectorAll('.help-tab')) b.classList.toggle('on', b.dataset.id === id);
    if (id === 'home') { main.replaceChildren(...home()); main.scrollTop = 0; return; }
    const i = TOPICS.findIndex((x) => x.id === id);
    const t = TOPICS[i] || TOPICS[0];
    const prev = TOPICS[i - 1], next = TOPICS[i + 1];
    main.replaceChildren(
      h('div', { class: 'help-title' }, h('span', { class: 'help-ic big' }, icon(t.icon, 20)), h('div', {}, h('h2', {}, t.title), h('small', {}, t.blurb))),
      ...t.body(),
      t.tour ? h('div', { class: 'help-tour-row' }, tourBtn(true), h('small', { class: 'hint' }, app.book ? 'Points at each control in this window, one step at a time.' : 'Starts in the Library, then continues when your book opens.')) : '',
      h('div', { class: 'help-pager' },
        prev ? h('button', { class: 'btn plain', onclick: () => show(prev.id) }, icon('arrowLeft', 14), prev.title) : h('span'),
        next ? h('button', { class: 'btn plain', onclick: () => show(next.id) }, next.title, icon('arrowRight', 14)) : h('span')));
    main.scrollTop = 0;
  };
  // Search: filters the topics by their words.
  const q = h('input', { type: 'search', class: 'help-search', placeholder: 'Search help', 'aria-label': 'Search help' });
  const words = new Map(TOPICS.map((t) => [t.id, `${t.title} ${t.blurb} ${h('div', {}, ...t.body()).textContent}`.toLowerCase()]));
  const tabs = [h('button', { class: 'help-tab', 'data-id': 'home', onclick: () => show('home') }, icon('home', 15), 'Overview'),
    ...TOPICS.map((t) => h('button', { class: 'help-tab', 'data-id': t.id, onclick: () => show(t.id) }, icon(t.icon, 15), t.title))];
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    for (const b of tabs) b.hidden = !!v && b.dataset.id !== 'home' && !v.split(/\s+/).every((w) => words.get(b.dataset.id)?.includes(w));
    const first = tabs.find((b) => !b.hidden && b.dataset.id !== 'home');
    if (v && first) show(first.dataset.id);
  });
  nav.append(q, ...tabs);
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const overlay = h('div', { class: 'overlay help-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet wide help-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lutefisk Help' },
      h('header', { class: 'sheet-head' }, h('h2', {}, icon('help', 18), 'Help'), h('div', { class: 'sheet-actions' }, tourBtn(false), h('button', { class: 'btn primary small', onclick: close }, 'Done'))),
      h('div', { class: 'help-body' }, nav, main)));
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  show(TOPICS.some((t) => t.id === topic) ? topic : 'home');
}

/* ------------------------------------------------------- guided tour */
// Each step points at an element. Steps whose element isn't on screen are skipped.
const LIBRARY_STEPS = [
  { sel: '.lib-new', title: 'Start a new book', text: 'Click New Book, give it a title and your name, and choose Create. The tour carries on when your book opens.', wait: 'book' },
];
const BOOK_STEPS = [
  { sel: '.sb-book', title: 'Your book', text: 'Click the cover for Book settings — details, cover, authors, chapters and print. Goals and Insights sit beside it.' },
  { sel: '.sidebar .sb-scroll', title: 'The binder', text: 'Every part of your book. Click to open one, drag to reorder, right-click for labels, status and more. The + beside each group adds a section.' },
  { sel: '.sec-head .sec-title', title: 'Name your chapter', text: 'A new book starts at Chapter One. Type a title here, or leave it blank to show just “Chapter One”.' },
  { sel: '.ql-toolbar', title: 'Format your text', text: 'Paragraph styles, bold and italic, lists, breaks, links, images, notes, tables, equations and symbols.' },
  { sel: '.ql-container', title: 'Write', text: 'Type here. Lutefisk saves as you go, and the preview follows your cursor.' },
  { sel: '.ed-top .sec-opts', title: 'Chapters, scenes and comments', text: 'Jump to any chapter, split a chapter into scenes, show or hide comments, and open the Snippets panel to drag snippets into your text.' },
  { sel: '.editor-pane .book-bar', title: 'Your progress', text: 'Words and pages, this session, today against your goal, and the stopwatch. Click a number for Insights.' },
  { sel: '.pv-switch .segmented', title: 'E-book or Print', text: 'See the book on a device, or as a printed book with facing pages.' },
  { sel: '.dp-btn', title: 'Choose a device', text: 'iPad, iPhone, Galaxy, Kindle, Kobo and Nook, drawn to scale. Click, then ↑ ↓ to try each one.' },
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
