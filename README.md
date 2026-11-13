# Lutefisk

**Write, design and publish books — privately, on your own computer.**

Lutefisk is a desktop book studio for macOS, Windows and Linux. You write in a clean editor; beside it, a live preview shows your book exactly as it will appear on a Kindle, an iPhone, a Galaxy tablet or as a printed, bound book. When you're ready, it exports a store-ready EPUB, a print-ready PDF, Word, RTF, MOBI, Markdown or plain text — all from one manuscript.

Everything stays on your machine. There are no accounts, no cloud and no telemetry, and your books are plain Markdown files in an ordinary folder.

> Lutefisk is an experimental personal project. It is provided as is, without support or warranty.

---

## Contents

- [Highlights](#highlights)
- [A tour of the window](#a-tour-of-the-window)
- [Writing](#writing)
- [Organizing a book](#organizing-a-book)
- [Previewing](#previewing)
- [Designing: templates](#designing-templates)
- [Research, citations and characters](#research-citations-and-characters)
- [Goals, history and Insights](#goals-history-and-insights)
- [Exporting](#exporting)
- [Settings](#settings)
- [Your book on disk](#your-book-on-disk)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Security and privacy](#security-and-privacy)
- [Building from source](#building-from-source)
- [SBOM](#sbom)
- [Project layout](#project-layout)

---

## Highlights

- **See it as readers will.** Seven devices drawn to scale — iPad, iPhone, Galaxy S26, Galaxy Tab S11, Kindle Basic, Kindle Paperwhite and Kindle Scribe — and a print preview that shows facing pages as an open book, with a crease down the middle. The preview updates as you type, in a few milliseconds.
- **95 book designs** plus your own. A template sets fonts, chapter openings, ornaments, drop caps and scene breaks for every format at once.
- **One manuscript, seven formats.** EPUB 3 (passes EPUBCheck with no errors or warnings), PDF, Word, RTF, MOBI, Markdown and plain text.
- **Built for long work.** Chapters and scenes, labels and statuses, notes, comments, research, a character tracker, a plot board, writing goals and a history of every writing day.
- **Private by design.** The app window can't reach the network at all. The only request Lutefisk ever makes is when you ask it to read a citation from a web page.

---

## A tour of the window

The **Library** opens first: your books as covers. Open one, start a **New Book**, or drag a book folder onto the window.

A book window has three panes. Each pane has a hide button at its top right; a slim rail brings it back.

| Area | What's there |
|---|---|
| **Title bar** | The Lutefisk icon (back to the Library), the **Settings** gear and the **day/night** switch on the left; **Export** on the right. |
| **Binder** (left) | The cover, with **Book** (settings) and **Goals** stacked beside it; a search box; Front Matter, Body and Back Matter; **Characters**, **Plot** and **Research**. |
| **Editor** (middle) | **Top row:** **Chapters** (jump anywhere), **Scenes**, **Comments** (shows or hides the comment margin on the right), and two split buttons — side by side, and one above the other — then the editor text size, **Focus** and hide. **Below the title:** the formatting toolbar. **Bottom bar:** Insights, the book's word and page counts, this session's change, today's words against your goal, this chapter's words, and the **stopwatch** (the stopwatch icon) at the far right. Click any number to open Insights. |
| **Preview** (right) | **Top row:** E-book / Print, the reading **text size**, **Focus** and hide. **Second row:** the device (or trim size), its reading theme (light, sepia, dark), **Templates** and the **gear** that edits the current template, with **Zoom** at the right. Arrows on each side of the device turn the page; the pager underneath has the cover, the contents and the end. |

Hover any button to see what it does — each control shows a short explanation after a moment.

---

## Writing

### The editor

The toolbar has two rows:

| Row 1 | Row 2 |
|---|---|
| **Style:** Paragraph, Heading 1–6, Blockquote, Verse, Hanging Indent | **Image** |
| **Bold** ⌘B · **Italic** ⌘I · **Underline** ⌘U | **Citation / Footnote** menu, with the book's citation style |
| **Text:** Subscript ⌘, · Superscript ⌘. · Strikethrough ⇧⌘X | **Table** |
| **Lists:** Bulleted, Numbered, **Custom Bullet…** | **f(x)** — an equation in LaTeX ⌥⌘E |
| **Breaks:** Page Break ⌘↵, Scene Break | **Symbol** ⌥⌘I |
| **Link** ⌘K | **Clear Formatting**, **Undo** ⌘Z, **Redo** ⇧⌘Z |

- **Links** have a name and a web address. Selected text becomes the name; inside a link, the same button edits it, and clearing the address removes it.
- **Custom bullets:** any one to three characters — ★ ✓ ➤ ❧ ◆, or anything from the symbol picker.
- **Verse** keeps every line where you put it. Enter starts a new line in the stanza; Enter on an empty line starts the next stanza.
- **Hanging indent** suits reference lists and glossaries.
- **Tables:** Tab moves between cells; the Table menu adds and removes rows and columns and aligns them.
- **Code blocks:** type ``` and a language name. Highlighting works in every format and stays readable on black-and-white e-ink.
- **Equations:** type LaTeX and watch it typeset. Inline or on its own line; click an equation to edit it.
- **Symbols:** more than 700 characters in 12 categories, searchable by name or code point.
- **Images:** drag to resize; choose alignment, caption, alt text and Word-style text wrapping.
- **Right-click** for cut, copy, paste, New Comment, and inserting notes, citations, equations, symbols, links and tables.
- **Find and Replace** (⇧⌘H) works on the whole book, a chapter, a scene or the selection, and can be undone.

### Comments

Comments work like Word's: select text and press ⌃⌥M (or right-click › New Comment). They appear as balloons in a margin on the right, where you can reply, resolve, reopen and delete them. The **Comments** button at the top of the editor shows or hides that margin (⌥⌘C). They never appear in the book, but the Word export can include them as real Word comments.

### Split editor

Two views of the same chapter, each scrolled separately — **side by side** or **one above the other**. Click the lit button again to close the split. You can type in either view.

### Focus mode

**Focus** at the top of the editor (⇧⌘F) hides everything but your page, dims all but the current paragraph and keeps your line centred. Esc exits.

### Capitalize My Title

The **Tᴛ** button beside any chapter, scene or book title shows it in **Chicago**, **APA**, **MLA**, **AP** and **sentence case**, highlights the words each style would change, and tells you which styles it already follows. **Use** applies one; **Make default** remembers your book's style. **Book › Chapters › Title capitalization** recapitalizes every title at once.

---

## Organizing a book

- **Sections.** Front matter (title page, copyright, dedication, epigraph, contents, foreword, preface, introduction), the body (prologue, chapters, epilogue) and back matter (acknowledgments, appendices, endnotes, bibliography, index, about the author). Generated pages — title page, contents, bibliography, index — fill themselves in.
- **Chapters menu.** Jump to any chapter or part of the book from the top of the editor.
- **Scenes.** Write any chapter in scenes: split at scene breaks or at the cursor, add scenes, drag them to reorder or onto another chapter. In the book they're joined with your template's scene break.
- **Chapter overview.** Click a chapter that has scenes to see its scene cards. The chapter and **every scene card** have **Insights** (just that text), a **Label**, a **Status** and an **Exclude from export** switch — change them right there. An open scene has the same row under its title.
- **Labels and statuses.** Coloured labels and statuses such as First Draft or Needs Review, plus your own. The binder's **filter** shows only what you choose.
- **Exclude from export.** Keep a chapter or scene in the manuscript but out of the preview and every export.
- **Chapter headings.** Number and title, title only, or number only — "Chapter One", "Chapter 1", "Chapter I", "One", "1" or "I" — set for the whole book in **Book › Chapters**.
- **Subtitles** appear under chapter titles in every format.

---

## Previewing

- **E-book.** The page is laid out in the device's real reading area, so pages break where they would on the device. Choose the reading text size, a reading font (21 bundled open-licence fonts, or device fonts such as Bookerly or Georgia when installed) and, on phones and tablets, light, sepia or dark. Kindles show E Ink paper and grayscale images.
- **Print.** Eight trim sizes, shown as facing pages of an open book. Mirrored margins, chapters starting on right-hand pages, Roman-numbered front matter, running heads and folios. Fit the whole page or the width. The PDF is exactly what you see.
- **Move around the whole book**, from the front cover to the back: the side arrows, the arrow keys, Home and End, or the pager. The **contents** button lists every part of the book; links on the book's own Contents page work too. Typing snaps the preview back to your cursor.
- **Zoom** up to 400% (⌘ + scroll to zoom, then drag to pan).
- **Focus** (⌥⌘P) shows only the preview. In Focus, the left mouse button turns back a page and the right turns forward.

---

## Designing: templates

**Templates** opens a gallery of 95 designs, each previewed with your own words. Find one by **name** with the search box at the top, or filter by category: General, Literary, Fiction, Nonfiction, Accessibility and World & Heritage (Chinese and Japanese Mincho, Old English blackletter, Gutenberg, Illuminated, Elizabethan).

A template controls body and heading fonts, size, spacing and indents, justification, chapter heading style and size, rules, the ornament under the title, scene breaks, drop caps and the opening line. It applies everywhere: preview, PDF, EPUB, Word, RTF and MOBI.

**Make it yours.** The **gear** beside Templates, or **Edit** in **Book** settings, opens the designer on the design you're using, with your own chapter as the sample; **All Templates…** in the designer goes back to the gallery. Built-in designs stay as they are; your changes are saved as your own copy. **New Template** starts a design of your own. The ornament can be a character (❦, ⁂…) or **a picture**, at any width. Your templates travel with the book and appear under **My Templates** in your other books. The **Custom** and **Changed from original** filters show your own designs and the built-ins you've customized, and each card says which design it came from.

**Drop caps** can be switched on or off for e-books and print separately, and per chapter. The **opening line** after a drop cap can be left as typed, set in small capitals, or in all capitals.

---

## Research, citations and characters

- **Research.** Notes, images, PDFs and other files, kept with the book and never exported. Open any of them beside the editor.
- **Bibliography.** Paste a link to an article, page or DOI and Lutefisk reads its citation details. References are formatted in **APA 7**, **MLA 9** or **Chicago 17**; one switch changes every in-text citation and every reference in the book.
- **Citations.** Insert one from the Citation/Footnote menu (⌥⌘C) with an optional page number. They format themselves.
- **Footnotes** go at the end of each chapter (pop-up notes in e-books) or in an Endnotes section.
- **Characters.** A cast with roles, colours, nicknames and any attributes you like. Each character has an **avatar**: initials, one of 18 icon portraits (person, long hair, bearded, child, elder, knight, wizard, royalty, detective, villain, cat, dog, bird, robot, ghost, romance, hero, unknown) on their colour, or a picture you upload — square, **256 × 256 px or larger**, PNG or JPEG; others are cropped to the centre. Names that come up often in your manuscript are offered as potential characters, each with an avatar. Lutefisk finds each character in the manuscript and shows where they appear, chapter by chapter and scene by scene.
- **Plot board.** A swimlane board: plotlines as rows, chapters as columns, cards you drag between them.
- **Index.** Mark terms, and the Index lists every page they appear on.

---

## Goals, history and Insights

- **Goals:** manuscript length in words or pages, a deadline (Lutefisk works out the words a day you need), and daily goals for this book and across all books. **Reset goals** offers **This Book** or **All Books**, each after asking; your writing history is kept.
- **Stopwatch:** the stopwatch icon at the bottom right of the editor. Click to start and stop; it never starts by itself, and its time is added to the day's log.
- **Insights** — click any number in the editor's bottom bar:
  - **Writing History:** words per day against your goal, manuscript size over time, writing time, streaks, a year-long calendar and a daily log.
  - **Your Text:** words, reading time, six readability scores, dialogue, adverbs, passive voice, sentence lengths, most-used words and phrases, and a chapter-by-chapter table — for this book, all your books, or a single chapter or scene.

Every figure has a **?** that explains it. History is kept only on your computer.

---

## Exporting

**Export** in the title bar:

| Format | Details |
|---|---|
| **EPUB** | EPUB 3 with an EPUB 2 table of contents. Passes EPUBCheck 5.3 with no errors or warnings. Equations as images (every reader) or MathML. |
| **Markdown** | One `.md` file with YAML front matter, plus its images. |
| **MOBI** | For sideloading onto older Kindles. (Amazon KDP takes EPUB.) |
| **PDF** | Print-ready, exactly as the print preview shows, with page numbers in the contents and index. |
| **Rich Text** | RTF with your trim size, mirrored margins, footnotes, images, tables and equations. |
| **Text** | Plain UTF-8 text at 72 columns: headings in capitals, `* * *` scene breaks, footnotes as `[1]`, equations as LaTeX. |
| **Word** | .docx with real styles, native footnotes, a contents field, mirrored margins, odd/even headers and, optionally, your comments. |

---

## Book settings

**Book** in the binder opens the book's settings: General (title, author, publisher, ISBN, description…), Covers, Chapters and Print. At the top is the book's **template**, with **Change…** (the gallery) and **Edit**. At the bottom, **Delete Book…** moves the whole book folder to the Trash after you confirm by typing its title.

---

## Settings

The gear next to the Lutefisk icon (⌘,):

- **Appearance:** day, night, or follow the system. The sun/moon button switches quickly.
- **Books folder:** where new books go and what the Library lists. By default it's `local/books` inside the folder you start Lutefisk from — ignored by git, so your writing is never committed — or `Documents/Lutefisk` when that folder can't be used. With **Remember the last folder** on, New Book starts where you last saved a book.
- **Saving:** automatically a few seconds after each change, or by hand with ⌘S.
- **Backups:** a folder for the `.zip` backups each book can make from the Library.

---

## Your book on disk

A book is an ordinary folder you can back up, sync or put under version control:

```
The Lantern Road/
  book.yaml            details, settings, section order, bibliography, templates
  chapters/<id>.md     one Markdown file per section or scene
  assets/              cover, author photo, images, ornaments
  stats/               your writing history
```

The Markdown adds a few book features:

| Feature | Syntax |
|---|---|
| Scene break | `* * *` |
| Page break | `\newpage` |
| Underline | `++text++` |
| Subscript / superscript | `H~2~O`, `E = mc^2^` |
| Verse | `::: verse` … `:::` |
| Hanging indent | `::: hanging` … `:::` |
| Centred or right-aligned | `::: center` … `:::`, `::: right` … `:::` |
| Custom bullets | `::: bullets ★` … `:::` around a list |
| Footnote | `text[^1]` and `[^1]: note text` |
| Citation | `[@id, p. 12]` |
| Equation | `$E = mc^2$`, `$$…$$` |
| Sized image | `![alt](assets/map.png "Caption"){width=60% align=center}` |
| Comment | `{==text==}{>>#id<<}` |
| Placeholders | `{{author}}`, `{{year}}`, `{{title}}`, `{{isbn}}` |

---

## Keyboard shortcuts

| | |
|---|---|
| New book / Open / Save | ⌘N / ⌘O / ⌘S |
| Library | ⇧⌘L |
| New chapter / New scene / Split scene at cursor | ⇧⌘N / ⌥⌘N / ⌥⌘K |
| Search the book / Find and replace | ⌘F / ⇧⌘H |
| Focus on writing / Focus on preview | ⇧⌘F / ⌥⌘P |
| E-book / Print / Insights | ⌥⌘1 / ⌥⌘2 / ⌥⌘3 |
| Split editor | ⌥⌘\ |
| Show or hide comments | ⌥⌘C |
| Editor text size | ⌘+ / ⌘− / ⌘0 |
| Interface size | ⇧⌘+ / ⇧⌘− / ⇧⌘0 |
| Export PDF | ⌘P |

On Windows and Linux, use Ctrl for ⌘.

---

## Security and privacy

- **Your book never leaves your computer.** No accounts, telemetry, crash reports, auto-updates or web fonts. Every http(s) and WebSocket request from the app window is cancelled.
- **One exception, on request:** reading a citation. When you paste a link and press *Analyze*, Lutefisk fetches that one address, with no cookies and none of your book. Local-network addresses are refused, and the page is parsed without running its scripts.
- **Locked-down app.** The interface runs sandboxed and context-isolated with a strict Content-Security-Policy and no Node.js. It reaches the rest of the app only through a small, fixed set of calls, and every file path is checked so nothing outside the open book can be read or written.
- **Safe Markdown.** Raw HTML is disabled; links are limited to http(s) and mailto, images to the book's `assets/` folder.
- **Hardened packages.** Packaged apps refuse debugging switches and turn on Electron's security fuses (no RunAsNode, no NODE_OPTIONS or `--inspect`, ASAR integrity, cookie encryption).
- **Dependencies.** `npm audit` reports no vulnerabilities and `npm run check:deprecated` finds no deprecated packages.

---

## Building from source

Requires Node.js 22 or later.

```bash
npm ci
npm start                                  # build and launch
npm test                                   # unit tests
node scripts/make-sample.mjs "./local/The Lantern Road"   # a sample book to open
```

Installable apps:

```bash
npm run package:mac       # on macOS   → release/Lutefisk-darwin-<arch>/Lutefisk.app
npm run package:win       # on Windows → release/Lutefisk-win32-x64/Lutefisk.exe
npm run package:linux     # on Linux   → release/Lutefisk-linux-x64/lutefisk
```

To distribute publicly, sign the app with an Apple Developer ID (and notarize it) or a Windows Authenticode certificate.

**Keep your writing out of the repository.** Books live in your books folder (`local/books` when run from source), and settings in Lutefisk's own data folder. Nothing in the source refers to a path on your computer. `local/`, backups and `.env` files are ignored by git.

---

## SBOM

`npm run sbom` regenerates `sbom/`: CycloneDX 1.5 and SPDX 2.3 for the shipped app (`lutefisk-runtime.*`) and for the full toolchain (`lutefisk-full.*`), plus `SBOM.md`, a readable summary with licences and the audit result.

---

## Project layout

```
src/main/       main process: windows, protocols, file access, EPUB / Word / RTF / MOBI / text export, PDF printing
src/preload/    the narrow bridge between the interface and the main process
src/renderer/   the interface: editor (ProseMirror), device and print previews, panels, template designer
src/shared/     Markdown dialect, templates, fonts, citations, title case, statistics, book → HTML
scripts/        build, package, SBOM, deprecation check, sample book
test/           unit tests and an end-to-end test that drives the real app
assets/, build/ the Lutefisk icon (a pale fish with a fish-hook L and a pen-nib tail) and its platform versions
```
