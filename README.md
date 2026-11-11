# Lutefisk

A pungent, AI-built app to help you write stories.

> **⚠️ Experimental and unsupported.** Lutefisk is an experimental project and may change at any time, including in ways that break existing features. It comes as-is, with no support, updates or warranty. Use it at your own risk and keep backups of your work.

## Installation

### Requirements
- [Node.js](https://nodejs.org) 22 or newer (includes npm)
- macOS, Windows or Linux

Everything else (Electron, the editor, fonts and export libraries) is installed automatically by npm.

### Run from source
```bash
git clone https://github.com/<you>/lutefisk.git
cd lutefisk
npm install
npm start
```

### Build a standalone app (optional)
```bash
npm run package
```
The app is saved in the `release/` folder. To build for a specific system, run that system's command on that system: `npm run package:mac`, `npm run package:win` or `npm run package:linux`.

## Disclaimer

Lutefisk is an experimental, AI-built project by Your Name, provided "as is", without warranty of any kind. Features, file formats and behavior may change or be removed at any time, and there is no guaranteed support, bug fixing or future updates. You use it at your own risk, and the author is not liable for lost work, data or any other damages. Please keep regular backups of your books.

## Details

A local-first desktop studio for writing, designing and publishing books and screenplays. It runs on **macOS, Windows and Linux**.

* **Editor + live preview.** A Quill-style rich-text editor sits next to a live preview. The preview re-renders on the next animation frame after each keystroke; measured latency is about 6–20 ms on device previews and under 55 ms on print spreads.
* **13 realistic devices.** Galaxy S21, Galaxy Tab S7, iPad, iPhone, Kindle Fire, Kindle Oasis, Kindle Paperwhite, Kobo Clara, Kobo Forma, Kobo Libra H2O, Kobo Nia, Nook GlowLight 3 and Nook GlowLight Plus. Frames are drawn to scale from the manufacturers' published dimensions, with E Ink paper tone and grayscale images, grips and page-turn buttons, cameras and Dynamic Island, and each reader's own header and footer (Kindle locations and %, Kobo "x of y", Nook "Page x of y").
* **Print.** Choose from 8 trim sizes and view pages one at a time or as a two-page spread with gutter shading and a spine. The layout uses mirrored margins, starts chapters on right-hand pages, numbers front matter in Roman numerals and adds running heads and folios. The PDF export is exactly what the preview shows, including page numbers in the table of contents and index.
* **Presentation controls.** You can change the font size and choose from 21 bundled open-licence fonts. You can also pick device fonts (Bookerly, Georgia, Palatino, Charter, Iowan, Baskerville…), which are used when installed on your computer. Phones and tablets also offer light, sepia and dark themes.
* **100 templates**, filterable by category: General, Literary, Fiction, Nonfiction, Accessibility and World & Heritage.
  * World & Heritage includes Sanskrit/Devanagari designs with Devanagari chapter numerals, Chinese/Japanese Mincho designs with 第三章-style numbering, and Old English blackletter, Gutenberg, Illuminated and Elizabethan designs.
  * **Your own templates:** hover any design and choose **Customize**, or use **New Template**. You can change fonts, sizes, spacing, chapter headings, ornaments, scene breaks, drop caps and the accent colour, with a live preview. Custom templates are saved in the book (so exports work anywhere) and in **My Templates** for your other books. Each template sets fonts, chapter headings, ornaments, scene breaks, drop caps and the first-line style. The same template applies to the preview, PDF, EPUB and Word.
* **Book structure.** A book has a cover and chapters you can add, delete and drag to reorder. Optional sections:
  * Front matter: title page, copyright, dedication, epigraph, table of contents, foreword, preface, introduction
  * Body: prologue, chapters, epilogue
  * Back matter: acknowledgments, appendices, endnotes, bibliography, index, and an about-the-author page with an optional photo
* **Images.** You can insert images, resize them by dragging, and set their alignment and captions. Drop caps are optional.
* **Footnotes.** Footnotes appear at the end of each chapter (as pop-up notes in EPUB), or they can be collected in an Endnotes section.
* **Bibliography.** Paste one or more URLs and Lutefisk reads the page's citation metadata (Highwire/Dublin Core/OpenGraph/JSON-LD). DOI links are resolved through doi.org. References are formatted in **APA 7 (default)**, MLA 9 or Chicago 17.
* **Statistics.** Lutefisk reports words, characters, sentences, paragraphs and unique words. It also shows:
  * reading and speaking time, and page count
  * six readability indices
  * dialogue %, adverbs, possible passive voice, complex words and lexical diversity
  * a sentence-length histogram and a per-chapter table
  * most-used words, repeated phrases and the longest sentences
* **Library home.** Your books appear as covers on the home screen. New books go to `Documents/Lutefisk` automatically, and you can change that location in the New Book sheet. You can also drag a book folder onto the window to open it.
* **Whole-book preview navigation.** Page from the front cover through every page to the back cover. Use the arrow keys, Home/End or the pager under the preview. Typing snaps the preview back to your cursor.
* **Print readability.**
  * The print preview can fit the whole page, or fit the width and scroll.
  * Focus mode (⌥⌘F, or the expand button) gives the preview most of the window.
  * Arrow keys turn pages: → and ↑ go forward, ← and ↓ go back.
* **Scenes.** Any chapter, prologue, epilogue or appendix can be written in scenes. Use the **Scenes** button above the editor (or the sidebar menu):
  * **Split at Scene Breaks**, **Split at Cursor** (⌥⌘K), or **Add a New Scene** (⌥⌘N).
  * Each scene has its own title. You can drag scenes to reorder them, either in the sidebar or on the cards in the chapter overview.
* **Chapter statistics:** use the Stats button above the editor, or right-click a chapter or scene in the sidebar and choose Statistics. You get:
  * created and last-updated dates, the chapter's age, the days you worked on it, the time spent writing (active typing time) and a chart of words per day for the last 30 days
  * words, reading and read-aloud time, sentences, paragraphs and estimated pages, compared with your average chapter
  * readability: Flesch, Flesch–Kincaid, Gunning fog, SMOG, Coleman–Liau and ARI
  * rhythm: sentence variety, short and long sentences, the longest sentences and paragraph, and a sentence-length chart
  * dialogue share, questions and exclamations, adverbs, passive voice, complex words and vocabulary richness
  * most-used words, names and proper nouns, repeated phrases, filter words, weak intensifiers and sentence openers
  * a per-scene breakdown

  Activity is recorded in book.yaml, so it travels with the book.
  * Chapters and scenes have private **Notes** (the Notes button above the editor). Notes are never printed or exported.
* **Chapter subtitles** appear under the chapter title in every format.
  * Each scene is edited on its own, and you can drag scenes to reorder them or move them to another chapter.
  * Scenes are joined with your template's scene break in the book.
  * Selecting the chapter shows a card overview of its scenes.
* **Research.** Like Scrivener's Research folder:
  * notes, character and place sheets, and web links
  * imported images, PDFs (shown in the app) and other files
  * any item can be shown beside the editor with "Open Beside Editor"
  * a link can be turned into a bibliography entry
  * research is never exported
* **Inline citations.** The quote-mark button, or ⌘⌥C, inserts a citation from your bibliography with an optional page. It is formatted automatically in APA, MLA or Chicago author-date style, and the Markdown is `[@id, 12]`.
* **Images.** Click an image to get a toolbar:
  * sizes 25–100%
  * left, center, right or full width
  * Wrap text, so text flows around the image
  * alt text, caption and delete
  * text wrapping like Word and Pages: In Line with Text, Square, Tight, Through, Top and Bottom, Behind Text, In Front of Text
    * Tight and Through follow the image's transparent outline in Apple Books, the previews and PDF; other readers treat them as Square
    * Behind and In Front work in PDF, Word and Apple Books; Kindle shows the image on its own line
  * the drag handle still works too
* **Focus mode.** The Focus button in the toolbar, or ⇧⌘F, hides everything except your page. It dims all but the current paragraph and keeps the cursor line centered. Press Esc to exit.
* **Chapter headings.** Use the Heading menu next to the chapter title to choose "Chapter One", "Chapter 1", "Chapter I", "One", "1", "I" or no number. You can also hide chapter titles.
* **Writing goals and history.** Click Goals in the toolbar, or the ring in the status bar.
  * Goals: manuscript length (words), print length (pages), a deadline that works out the words a day you need, a daily goal for the book, and a daily goal across all books.
  * History is kept day by day for this book and for all books.
  * It shows words per day against your goal, writing time, words per hour, streaks, time of day and day of week, plus a per-book breakdown.
  * History is stored locally: `<book>/stats/history.jsonl` and Lutefisk's data folder.
* **Drop caps you control.** Switch them on or off separately for e-books and for print, from the preview toolbars or Book settings.
* **Accessibility zoom.**
  * Editor text zoom from 80% to 200% (⌘/Ctrl +, −, 0).
  * Preview magnification up to 400% (⌘/Ctrl + scroll, then pan).
  * Interface size for the whole window (⌘/Ctrl ⇧ +/−).
  * Full light and dark mode.
* **Export.** Markdown (one `.md` file with YAML front matter, plus an assets folder) and EPUB 3 (with an EPUB 2 NCX; passes EPUBCheck 5.3 with 0 errors and 0 warnings), print-ready PDF, and Word (.docx with real styles, native footnotes, a TOC field, mirrored margins and odd/even headers).

## Branding

The Lutefisk icon shows a pale fish bearing a capital L drawn as a fishing hook, with a pen-nib tail, on a fjord-blue tile. The source is `assets/icon.svg`. `build/` holds the generated `icon.png`, `icon.icns` (macOS) and `icon.ico` (Windows), which `npm run package` uses. The mark also appears in the library header, as the Library button in each window's title bar, in the About panel, and as the window and taskbar icon.

## Show or hide the preview

Click **Preview** in the toolbar or press ⌥⌘P to hide or show the preview pane. The choice is remembered separately for books and screenplays.

## Screenplays

Choose **New Project → Screenplay**, or **Import Screenplay…** to bring in a Fountain, Final Draft (.fdx) or Fade In (.fadein) file.

* **Editor that works like professional editorsf.**
  * Elements: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, Centered, Act Break, Lyrics, plus non-printing Synopsis and Section.
  * **Enter** moves to the next logical element (Character → Dialogue → Action …). **Tab** and **⇧Tab** change the element (Action → Character → Transition → Scene Heading …).
  * Tab at the end of a speech adds a parenthetical.
  * Typing `int.` or `ext.` starts a scene, and typing `(` in dialogue starts a parenthetical.
  * **⌘1–⌘9** set the element type, **⌘D** marks dual dialogue, and **⇧Enter** inserts a line break.
* **SmartType.** Suggests character names (by frequency), extensions such as (V.O.) and (O.S.), INT./EXT., locations already used, times of day and transitions. Enter or Tab accepts a suggestion; Esc dismisses it.
* **Standard page layout.**
  * Courier Prime 12 pt with standard indents and 54–58 lines per page.
  * Live page-break markers in the editor.
  * Automatic **(MORE)/(CONT'D)** when dialogue breaks across pages, and (CONT'D) for consecutive speeches.
  * Scene headings are kept with what follows them.
  * Optional scene numbers in both margins.
  * Formats: Feature (US Letter), Feature (A4) and TV one-hour, where acts start on new pages.
* **Views.**
  * **Script**.
  * **Index Cards**: drag to restructure, and edit headings and synopses.
  * **Title Page**: the standard layout.
  * A sidebar with the scene navigator (number, heading, page), the character list (click to step through a character's speeches) and Research.
* **Simple preview.** It is hidden by default. Click **Preview** in the toolbar (⌥⌘P) to show your script as a scrolling stack of real pages, with zoom, that follows your cursor.
* **Exports.**
  * **PDF**, industry standard, with fonts embedded.
  * **Final Draft (.fdx)**, with dual dialogue, scene numbers, synopses, the title page and SmartType lists.
  * **Fade In (.fadein)**, the Open Screenplay Format in a ZIP, with styles, page settings, dual dialogue, scene numbers, synopses, the title page and character/location lists.
  * **Fountain**.
  * **Word (.docx)**, with Final Draft–style paragraph styles.
  * **Plain text**, fixed width.
* **Insights.** Page count and estimated runtime, scenes and their lengths in eighths of a page, speaking parts (speeches, words, scenes, first appearance), INT/EXT and day/night splits, locations, and the dialogue-to-action ratio.
* **Shared with books.** Goals (in pages), research, focus mode and text zoom also work for screenplays.

A screenplay project is a folder containing `book.yaml` (`kind: screenplay`) and `script.fountain`, a plain-text file that any Fountain app can open.



### Equations (LaTeX)

Click **Σ** in the editor toolbar (or press ⌥⌘E) and type LaTeX. You'll see it typeset live, and you can choose **Inline** (in the sentence) or **Display** (on its own line). Click an equation to edit or remove it. In the Markdown files, equations are saved as `$…$` and `$$…$$`.

* **Preview, print and PDF:** typeset with STIX Two Math.
* **EPUB:** Book › General › *Equations in e-books*.
  * **Images** (the default) work on every reader, including Kindle and Nook.
  * **MathML** is searchable and scalable, for Apple Books, Kobo, Google Play Books and Kindle Enhanced Typesetting.
* **Word:** equations are inserted as images.
* Your LaTeX is always kept as alt text.

### Writing session clock

The status bar shows how long you've been writing in this session and how many words you've added. The clock pauses after 90 seconds without typing. Click it to see your pace, when the session started, total elapsed time and recent sessions. You can also pause the clock or start a new session from there.

### Covers

Book › Covers lets you upload a front and back cover. Each cover has:

* **Alt text**
* **Print extent:** full bleed or within margins
* **Vertical alignment:** top, center or bottom

These settings are used in the print preview, the PDF and the EPUB. The cover is separate from the title page, which is generated inside the book.


### Editor tools

* **Right-click menu:** cut, copy, paste, New Comment, and insert a footnote, citation, equation, symbol, drawing, link or table. Inside a table it also shows the table commands.
* **Comments**, like Word's (⌃⌥M, or right-click › New Comment):
  * Comments appear as balloons in the margin beside the text. You can reply, resolve, reopen and delete them.
  * They're stored as CriticMarkup in the Markdown (`{==text==}{>>#id<<}`), with the comment text in book.yaml.
  * They never appear in the book. The Word export includes them as real threaded Word comments; you can switch this off in Book › General.
* **Tables:** standard Markdown tables. Use the Table button to insert one, Tab to move between cells, and the Table menu to add or delete rows and columns and align columns. Tables are exported to EPUB, PDF, Word, RTF and MOBI.
* **Code blocks** with syntax highlighting. Use the </> button, or type ``` followed by the language name and a space. A language picker in each block covers:
  * scripts and shells (Bash, shell sessions, PowerShell, Windows batch, Python, Ruby, Perl, Lua, R)
  * data and config files (YAML, JSON, XML/HTML, INI/TOML, Dockerfile, Makefile, SQL, Markdown, LaTeX, diff)
  * source code (JavaScript, TypeScript, CSS, Java, Kotlin, C, C++, C#, Go, Rust, Swift, PHP, Scala, Dart, Haskell)
  * Auto-detect

  Highlighting is made to work on every device. Colours are paired with bold keywords and italic comments, so code still reads on black-and-white e-ink. Long lines wrap on small screens, and the EPUB embeds JetBrains Mono.
  * **Word and RTF** get coloured Consolas runs in a shaded box.
  * **Older Kindles (MOBI)** get bold and italic only.
  * **Markdown** keeps the fences.
  * You can switch highlighting off in Book › General.
* **Drawing:** a freehand canvas with these tools:
  * pen, pencil, brush, highlighter, line, arrow, rectangle, ellipse and eraser
  * colours, width and opacity
  * transparent, white or paper background
  * undo and redo
  
  Drawings are saved as PNG images, which every e-reader, printer and Word can show. Your strokes are also kept as JSON, so you can double-click a drawing to edit it later.
* **Insert Symbol** (⌘⌥I): more than 700 special characters in 12 categories, with search by name or Unicode code point (U+2014) and recently used symbols.
* **Equation editor:** a full LaTeX symbol palette and a searchable reference. It covers new lines, alignment, matrices, brackets, sums and integrals, accents, fonts, spacing and common formulas, and each example can be inserted.

### Covers

* Click **Adjust…** to move, zoom, rotate and crop a cover to the e-book (1600 × 2560), print-trim, square or original shape.
* The original upload is kept, so you can re-adjust or restore it later.

### More export formats

* **RTF** (Rich Text Format) uses your trim size and mirrored margins, and includes chapter openings, real footnotes, images, tables and equations.
* **MOBI** is for sideloading onto older Kindles and legacy apps.
  * It includes the book's metadata, cover and images, plus a linked table of contents and notes.
  * Amazon KDP no longer accepts MOBI uploads, so use EPUB for publishing.

### Screenplay Guide

New to screenwriting? Click **Guide** in the screenplay toolbar (or **Help → Screenplay Guide**). It covers:

- **Anatomy of a page** – a sample page with every line tagged by element.
- **The elements** – scene heading, action, character, parenthetical, dialogue, transition, shot, dual dialogue, centered text, act breaks, lyrics, synopses and sections: what each means, when to use it, and how to make it in Lutefisk.
- **Write your first scene** – ten steps, plus **Insert an Example Scene**.
- **Format & length** – margins, indents, page counts for features and TV, and conventions such as MONTAGE and INTERCUT.
- **Keyboard** – every shortcut.

New scripts show a one-time welcome banner. While you write, the status bar explains the element under the cursor.

## Your book format

A book is a plain folder you can put under version control or back up anywhere:

```
The Lantern Road/
  book.yaml            metadata, settings, section order, bibliography, index terms
  chapters/<id>.md     one Markdown file per section
  assets/              cover, author photo, illustrations
```

The chapters use Markdown with a few book-specific additions:

| Feature | Syntax |
|---|---|
| Scene break | `* * *` |
| Footnote | `text[^1]` and `[^1]: note text` |
| Sized image | `![alt](assets/map.png "Caption"){width=60% align=center}` |
| Placeholders (copyright page) | `{{author}}`, `{{year}}`, `{{title}}`, `{{isbn}}` |

## Run it

Requires Node.js 22 or later.

```bash
npm ci
npm start                 # build and launch
npm test                  # unit tests
node scripts/make-sample.mjs "./The Lantern Road"   # sample book to open
node scripts/make-sample-screenplay.mjs "./The Lantern Road (Screenplay)"   # sample screenplay
```

## Package installable apps

```bash
npm run package:mac       # run on macOS   → release/Lutefisk-darwin-<arch>/Lutefisk.app
npm run package:win       # run on Windows → release/Lutefisk-win32-x64/Lutefisk.exe
npm run package:linux     # run on Linux   → release/Lutefisk-linux-x64/lutefisk
```

Packaging also sets Electron's security fuses:

* RunAsNode is off.
* NODE_OPTIONS and `--inspect` are ignored.
* ASAR integrity validation is on, and the app loads only from the ASAR archive.
* Cookie encryption is on.

To distribute publicly, sign the output with your Apple Developer ID (and notarize it) or with a Windows Authenticode certificate.

## Security & privacy

* **No book data leaves your computer.** There are no accounts, no telemetry, no crash reporting, no auto-updates and no web fonts. The app window cannot make network requests at all, because every http(s) and WebSocket request from it is cancelled.
* **One deliberate exception: the bibliography tool.** When you paste a URL and press *Analyze*, Lutefisk requests *that URL only*. The request comes from an in-memory session with no cookies, and none of your book is sent. Local-network addresses are refused. The HTML that comes back is parsed in an inert `DOMParser`, so its scripts never run.
* **Isolated renderer.** The renderer is sandboxed and context-isolated, has no Node.js, and runs under a strict Content-Security-Policy. It talks to the main process through a fixed API of 15 functions. The main process checks that each call comes from the app's own page and re-validates every path, so nothing can read or write outside the open book folder.
* **Safe Markdown.** Markdown is rendered with raw HTML disabled. Links are limited to http(s)/mailto, and images to the book's `assets/` folder.
* **No debugger attachment.** Packaged builds refuse remote-debugging switches.
* **Dependencies.** `npm audit` reports 0 vulnerabilities, and `npm run check:deprecated` confirms no installed package is deprecated. Quill 2.0.3 has an open XSS advisory and is unmaintained, so the editor is built on ProseMirror instead. electron-builder pulls in deprecated packages, so packaging uses `@electron/packager`, with overrides for patched `glob` and `minimatch`.

## SBOM

`npm run sbom` regenerates `sbom/`:

* CycloneDX 1.5 and SPDX 2.3 JSON for the shipped app (`lutefisk-runtime.*`)
* the same two formats for the full toolchain (`lutefisk-full.*`)
* `SBOM.md`, a readable summary with licences and the audit result

## Project layout

```
src/main/       Electron main process: windows, protocols, IPC, EPUB/Word export, PDF printing
src/preload/    the narrow bridge exposed to the UI
src/renderer/   UI: editor (ProseMirror), device & print previews, panels
src/shared/     Markdown dialect, templates, fonts, citations, statistics, book → HTML
scripts/        build, package, SBOM, deprecation check, sample book
test/           unit tests and an end-to-end test driving the real app
```

© 2026 John L. Whiteman