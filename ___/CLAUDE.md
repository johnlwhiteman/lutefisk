LUTEFISK — PROJECT SPECIFICATION
================================

The full specification for this application: a consolidated version of the
requests that produced it. Read it before changing the app; it is detailed
enough for a developer (or a coding assistant) to rebuild it from scratch.


1. WHAT TO BUILD
----------------
A local-first desktop app for writing, designing and publishing BOOKS, named
"Lutefisk", for macOS, Windows and Linux (Electron). It combines a writing
editor with a live, accurate preview of the finished book on real devices and
in print, and exports to every common publishing format.

Books only — no screenplays, notebooks, slides or LaTeX papers.

The author of the app is the person running this project. The README must not
mention any AI assistant. State that the app is experimental and unsupported.


2. NON-NEGOTIABLE CONSTRAINTS
-----------------------------
Privacy and security
  - No data from a book may go to any third party. Everything stays local:
    no accounts, telemetry, crash reporting, auto-update or web fonts.
  - The app window must not be able to make network requests. The only
    outbound request is the bibliography tool fetching a URL the user pastes,
    from a cookie-less session, sending none of the book, refusing local
    network addresses, and parsing the result without running scripts.
  - Sandboxed, context-isolated renderer; strict Content-Security-Policy; a
    narrow preload API; every file path validated in the main process.
  - Markdown rendered with raw HTML disabled; links limited to http(s)/mailto;
    images limited to the book's assets folder.
  - Packaged builds: Electron security fuses on, debugging switches refused.

Dependencies
  - Free of known vulnerabilities (npm audit = 0) and of deprecated packages
    (provide a check script). Prefer maintained libraries (ProseMirror over
    Quill; @electron/packager over electron-builder).
  - Generate an SBOM (CycloneDX 1.5 and SPDX 2.3, runtime and full toolchain,
    plus a readable summary).

Repository hygiene
  - The source will be checked into GitHub. Never put the user's writing, or
    anything specific to their computer (absolute paths, user names), in the
    source tree.
  - Local data goes in local/, which .gitignore excludes. When run from the
    source folder, the default books folder is ./local/books under the current
    working directory; otherwise Documents/Lutefisk. Remember the last folder
    the user saved to.

Performance
  - The preview must update on the next frame after each keystroke (target:
    ~20 ms on device previews, <60 ms on print spreads). Prune dead CSS; keep
    the bundle lean.

Deliverable
  - A source zip excluding node_modules, dist, release, local and test output.
  - Unit tests and an end-to-end test that drives the real app.


3. LAYOUT
---------
Library: books shown as covers; Open…, New Book, drag a folder in; per-book
Back Up… (.zip) and Delete… (to the Trash, after asking). Settings, the
day/night switch and Help sit on the right, after New Book.

Book window, three panes, each with a hide button at its top right that leaves
a rail to bring it back:

Title bar
  - Left: Lutefisk icon (back to Library).
  - Right: Export (formats alphabetical), then Settings gear, day/night
    switch and Help (?), in that order, to the right of Export.

Binder (left)
  - Cover thumbnail with "Book" (settings) and "Goals" stacked vertically to
    its right.
  - Search box; a Logline row above Front Matter (shows the logline once
    written; opens a logline editor with a 25–50-word meter and a builder:
    Who / When / Wants / But / Or else → a draft sentence); Front Matter /
    Body / Back Matter; Planning (a header over Characters and Plot);
    Research, which starts with
    Snippets and To-Do. No Thoughts, and no "notes and files… never
    exported" hint text. Research's + menu: Note, Snippet, To-Do, Import
    Files… (Characters and Plot are not in it).
  - Snippets: create, edit, delete, with the same formatting controls as
    the editor (bold, italic, underline, strike, super/subscript, lists,
    block quote, clear formatting, undo/redo), stored as Markdown. Insert at
    the cursor or at the end of any chapter/scene, from the editor's
    right-click menu, or by dragging from the Snippets panel (see Editor).
    An inserted snippet leaves the list.
  - To-Do: add, edit, tick off, delete; each item records its created (and
    finished, edited) date and has an optional deadline. Tabs: Open,
    Overdue, Done, All; Clear Done. Statistics: open, overdue, due this
    week, done, % complete, average days to finish, % done on time. The
    binder row shows a red badge with the number of overdue to-dos.
  - The To-Do box: the text field's placeholder is just "What?" (no other
    help text), a date field, and a "Today" option (remembered) that gives
    new to-dos today's date by default.
  - Recycle Bin at the bottom of the binder (with a count): deleted
    chapters, scenes, front/back matter, research items, snippets, to-dos,
    characters and plot cards go there with what's needed to restore them
    (stored in book.yaml). Restore puts an item back where it was (a scene
    whose chapter is gone comes back as a chapter; one whose chapter no
    longer has scenes is added at its end); Delete Forever; Empty Recycle
    Bin. Filters by kind.
  - None of these are exported.
  - The title bar shows the book's words and approximate pages, updating a
    few times a second while typing (not only after a pause).
  - Right-click a chapter or scene: New Chapter Before/After, Label, Status,
    Exclude from Export. Filter by label/status.

Editor (middle)
  - Top row, left: Chapters dropdown (jump to any part of the book), Scenes
    dropdown, Comments (icon only: the comment icon when shown, crossed out
    when hidden; it toggles the comment margin on the right), and next to
    it a Snippets button (with a count) that opens a Snippets panel on the
    right of the text: every snippet as a card, dragged and dropped at an
    exact spot in the chapter/scene; once dropped the text appears there
    and the snippet leaves the list. The Snippets icon is crossed out
    when the panel is hidden (like Comments). No split editor (no vertical /
    horizontal / single layout options).
  - No Notes feature in the editor.
  - Top row, right: editor text-size scaler, 25%–300% (no percentage shown; while it
    changes, a small bubble shows the value, then fades), then Focus (same chip look as the
    preview's Focus), then show/hide in the far top-right corner.
  - Title and subtitle fields, each with a Capitalize My Title button.
  - Formatting toolbar (two rows, see 4).
  - Bottom bar: Insights, book words | pages, this session's change, today's
    words vs goal, this chapter's words, and the stopwatch at the bottom
    right, shown with a stopwatch icon. Clicking any stat opens Insights.
  - Focus uses the same icon and chip in the editor and the preview.

Preview (right)
  - Row 1: E-book / Print, Zoom right after Print, then (right side) the
    text-size scaler (25%–300%), Focus, hide. Neither Zoom nor the scaler shows a
    percentage at rest; a small bubble shows it only while it changes.
  - Row 2: device dropdown (or trim size) and the reading-theme dropdown
    (light/sepia/dark). No Templates button here.
  - Under the device: the template strip — ◀ [template list ▾] ▶ ⚙. With
    the list focused, ↑ ↓ (or ← →) move to the next/previous design and the
    device redraws at every step. Clicking opens a searchable list beside
    the preview (never covering the device): ↑ ↓ apply live, Enter keeps,
    Esc reverts, "Gallery…" opens the gallery. ⚙ edits the current template.
    While the list or gallery is open, the device shows example text in
    each design by default; a "Live — show my text" switch (in the list and
    in the gallery, one shared setting, off by default) shows the book.
  - Left and right page-turn arrows beside the device, vertically centered.
  - Pager: Contents (a menu of EVERY part of the book — cover, front
    matter, chapters, back matter, end — click to go there), previous,
    position/progress, next. No separate cover/back-cover buttons.
  - Links on the book's Contents page jump to that part.

Every control has a hover tip explaining what it means. Tips and menus are
always placed fully inside the window (e.g. the (?) explanations in
Insights).

Help: a Help window (title bar ?, Library, Help menu, F1) with short topics
— make your first book, the window, writing, templates and devices,
exporting, shortcuts, privacy — and a guided tour that highlights each
control in turn (starting from New Book in the Library and continuing when
the book opens).

Skins: 14 looks for the app itself, each with day and night versions,
chosen in Settings › Appearance: Classic, Paper (paper grain), Typewriter
(grain + typewriter type for the interface), Linen (woven texture),
Leather (stitched leather binder), Study (walnut desk behind the preview),
Blueprint (drafting grid), Midnight (starfield at night), Fjord, Forest,
Rose, Lavender, Graphite and High Contrast. Textures are inline SVG.

Language: American English everywhere (color, center, analyze, canceled…).


4. EDITOR TOOLBAR (exact order)
-------------------------------
Row 1: Paragraph-style dropdown [Paragraph, Heading 1–6, Blockquote, Verse,
       Hanging Indent] · Bold · Italic · Underline · dropdown [Subscript,
       Superscript, Strikethrough] · Lists dropdown [Bulleted, Numbered,
       Custom Bullet…] · Breaks dropdown [Page break, Scene break] · Link
Row 2: Insert Image · dropdown [Citation, Footnote] (plus the book-wide
       citation style) · Table · f(x) equation (LaTeX) · Insert Symbol ·
       Clear Formatting · Undo · Redo
       (New comments: ⌃⌥M or right-click › New Comment.)

Behavior
  - Link: dialog with Name and URL; selected text pre-fills the name (outer
    spaces stay outside the link); inside a link it edits; empty URL removes.
  - Custom bullet: any 1–3 characters or a symbol, saved as
    "::: bullets ★" around the list, carried into every output.
  - Verse: Enter = new line in the stanza; Enter on an empty line = new
    stanza. Hanging indent for reference lists.
  - Keys: ⌘B/I/U, ⌘, subscript, ⌘. superscript, ⇧⌘X strike, ⌘K link,
    ⌘↵ page break, ⌥⌘E equation, ⌥⌘I symbol, ⌃⌥M comment.
  - Word-style comments in the margin (reply/resolve/delete), stored as
    CriticMarkup; optional in Word export.
  - Insert Code (toolbar </> and right-click): a dialog with the language
    (remembered; dozens of programming, scripting and shell languages plus
    JSON, YAML, XML, INI/TOML, SQL, GraphQL, Dockerfile, Nginx…), an
    optional paste box, and "Show line numbers" (off by default). Each
    block has a language picker and a Line numbers switch; numbers show in
    the editor gutter, the preview and every export (```lang linenums in
    the Markdown). Highlight colors match in the editor and the book.
  - Tables, code blocks with syntax highlighting (e-ink-safe), images with
    size/alignment/caption/alt text and Word-style wrapping, find & replace,
    focus mode, right-click menu.


5. BOOK STRUCTURE
-----------------
  - Front matter, body, back matter with generated title page, contents,
    bibliography, index and endnotes.
  - Chapters and scenes. Chapter heading mode set book-wide: number and
    title / title only / number only, with several number styles.
  - Chapter overview (a chapter with scenes): no explanatory text; a row with
    Insights (this chapter only), Label, Status and an Exclude-from-export
    switch.
  - Each scene card shows and lets the user change its own Insights, Label,
    Status and Exclude state; excluded scenes are visibly struck through.
  - An open scene shows the same Insights/Label/Status/Exclude row.
  - Chapter subtitles.
  - A new book starts with one chapter shown as "Chapter One" (untitled),
    not "The Beginning".
  - Authors: zero, one or many, set in Book settings (not only on About the
    Author); joined as "A, B and C" on the title page, separate creators in
    the EPUB. With more than one author, About the Author is titled
    "About the Authors". No author photo in About the Author.
  - Picture choosers (images, research) start in the working
    folder, then remember the last folder used.

Book settings (the "Book" button)
  - General, Covers, Chapters, Print.
  - No template selection here (templates live under the device).
  - Back Up Book… (also a "Back Up" link under the book title in the title
    bar, and ⇧⌘S): a .zip or a full folder copy, saved in the same folder
    as the book, the backup folder, or another folder you choose; named
    with the title, date and time.
  - Delete Book…, which asks for confirmation (type the title) and moves the
    folder to the Trash.


6. PREVIEW DEVICES
------------------
Only these, drawn to scale from published dimensions:
  - Print (an open printed book with a crease down the middle)
  - Apple: iPad, iPhone
  - Android: Galaxy S26, Galaxy Tab S11
  - Kindle: Basic, Paperwhite, Scribe (E Ink tone, grayscale, locations/%)


7. TEMPLATES
------------
  - ~95 built-in designs (no Sanskrit/Devanagari designs), listed
    alphabetically, searchable by name, filterable by category, and by
    "Custom" (made with New Template) and/or "Modified" (a built-in
    template that was changed). No other origin tags.
  - A designer for new templates and for editing the current one (opened
    from the gear), previewing the book's own text when available, with a
    "Show All Templates" button in its top-left corner.
  - The template gallery docks beside the preview (the preview stays
    visible). Cards show example text; the shared "Live — show my text"
    switch shows your own. Clicking a design applies it live; arrow keys move
    through the designs; Enter keeps, Esc reverts.
    Built-ins are never overwritten; changes become the user's own copy that
    remembers which design it came from.
  - Controls fonts, sizes, spacing, heading style, rules, ornament (a
    character OR an uploaded picture at a chosen width), scene break, drop
    cap and opening-line style. Applies identically to every output.
  - Drop caps: the first line after a drop cap must stay in the same
    typeface as the rest of the text (no fake small caps).
  - In the designer, Chapter heading, then Drop cap and Opening line come
    first, above Body font. The "Justify text" checkbox sits on one line
    with its label (no overlap).
  - Scene breaks: * * * for the large majority of designs (all but the
    World & Heritage ones, which keep their own ornaments).


8. TITLES
---------
Capitalize My Title (checked against the book's citation style — APA, MLA or
Chicago — unless another style is chosen; APA by default): next to every title field, analyze the title and show
it in Chicago, APA, MLA, AP and sentence case, marking changed words and
saying which styles it already satisfies; apply one; remember a book
default; apply a style to all chapter/scene titles at once.


9. RESEARCH, CITATIONS, CHARACTERS, PLOT
----------------------------------------
  - Research folder (notes, images, PDFs, files), never exported.
  - Bibliography from pasted URLs/DOIs; APA 7, MLA 9, Chicago 17; one global
    switch reformats every citation and reference.
  - Inline citations with page locators; footnotes per chapter or endnotes.
  - Character tracker (appearances per chapter/scene) and a plot board.
  - Character avatars: initials, a set of icon portraits on the character's
    color, or an uploaded picture (recommended square, 256×256 px or
    larger; cropped and scaled automatically). Suggested ("potential")
    characters from the manuscript show avatars too.


10. GOALS AND INSIGHTS
----------------------
Manuscript and daily goals, deadline pacing, "Reset goals" with buttons for
This Book and All Books (each confirmed; history kept), a stopwatch that never starts by
itself, writing history (charts, heat map, daily log) and text analysis
(readability, style, word frequency, per chapter) for the book, all books,
one chapter or one scene. All stored locally. Insights › Reset… clears the
writing history (and session log and stopwatch) for This Book or All Books,
each confirmed; text, goals and text analysis are unaffected.


11. EXPORT
----------
EPUB 3 (EPUBCheck-clean), PDF (identical to the print preview), Word (.docx),
RTF, MOBI, Markdown and plain Text (.txt). Every feature — underline,
sub/superscript, verse, hanging indent, custom bullets, picture ornaments,
equations, tables, footnotes — carries through to every format it can.


12. SETTINGS
------------
Appearance (day/night/system), books folder, remember last folder, autosave
interval or manual save, backup folder.


13. README
----------
Polished but concise: what the app is, screenshots, a feature list, getting
started, where books are stored, privacy/security, the project layout, and
a clear disclaimer: a warning near the top and a Disclaimer section saying
the app is experimental and unsupported, with no warranty.
Details live in the in-app Help and in this file.

Screenshots live in docs/screenshots and are taken from the generated sample
book (scripts/make-sample.mjs) and made-up demo titles, never the user's
writing. They must show no paths, user names or anything else specific to a
computer. Keep them small: 1280 px wide at most, palette-reduced PNGs.
