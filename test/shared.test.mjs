import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, extractFootnotes, markdownToPlain, safeAssetPath } from '../src/shared/markdown.js';
import { formatEntry, parseName, fromCsl } from '../src/shared/citations.js';
import { analyze, bookReport, countSyllables } from '../src/shared/stats.js';
import { TEMPLATES, templateCss } from '../src/shared/templates.js';
import { defaultBook, ensureSections, chapterLabel, numberSections } from '../src/shared/sections.js';
import { renderBook } from '../src/shared/bookhtml.js';

test('raw HTML and unsafe links are neutralised', () => {
  const { html } = renderMarkdown('<script>x</script> [a](javascript:alert(1)) <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(!html.includes('<img'));
});

test('images are restricted to the assets folder and keep attributes', () => {
  assert.equal(safeAssetPath('assets/a.png'), 'assets/a.png');
  assert.equal(safeAssetPath('../a.png'), null);
  assert.equal(safeAssetPath('https://x.y/a.png'), null);
  const { html } = renderMarkdown('![Alt](assets/pic.png){width=40% align=left}');
  assert.match(html, /style="width:40%;" class="bk-img a-left w-topbottom"/);
  assert.match(renderMarkdown("![A](assets/p.png){width=30% align=right wrap=tight}").html, /w-tight.*|shape-outside/);
});

test('footnotes are numbered and collected', () => {
  const md = 'One.[^a] Two.[^b]\n\n[^a]: First note.\n[^b]: Second *note*.';
  const { notes, html } = renderMarkdown(md, { prefix: 'c1' });
  assert.equal(notes.length, 2);
  assert.match(html, /fnref-c1-2/);
  assert.match(notes[1].html, /<em>note<\/em>/);
  assert.equal(extractFootnotes(md).defs.size, 2);
  assert.equal(markdownToPlain(md), 'One. Two.');
});

test('APA, MLA and Chicago formatting', () => {
  const e = { kind: 'article', authors: [parseName('Jane Q. Doe'), parseName('John Smith')], title: 'A study of lamps', container: 'Light Times', date: '2024-05-02', url: 'https://example.org/lamps', accessed: '2026-01-01' };
  assert.equal(formatEntry(e, 'apa'), 'Doe, J. Q., &amp; Smith, J. (2024, May 2). <i>A study of lamps</i>. Light Times. <span class="url">https://example.org/lamps</span>');
  assert.match(formatEntry(e, 'mla'), /^Doe, Jane Q\., and John Smith\. “A study of lamps\.” <i>Light Times<\/i>, 2 May 2024/);
  assert.match(formatEntry(e, 'chicago'), /^Doe, Jane Q\., and John Smith\. “A study of lamps\.” <i>Light Times<\/i>, May 2, 2024/);
  const j = fromCsl({ type: 'article-journal', title: 'X', author: [{ family: 'Lee', given: 'Ann' }], 'container-title': 'J', issued: { 'date-parts': [[2020, 3]] }, volume: 4, issue: 2, page: '1-9', DOI: '10.1/abc' }, 'https://doi.org/10.1/abc');
  assert.equal(formatEntry(j, 'apa'), 'Lee, A. (2020). X. <i>J</i>, <i>4</i>(2), 1–9. <span class="url">https://doi.org/10.1/abc</span>');
});

test('statistics', () => {
  assert.equal(countSyllables('banana'), 3);
  const a = analyze('The cat sat. The dog ran quickly away!\n\n“Hello,” she said.');
  assert.equal(a.sentences, 3);
  assert.equal(a.paragraphs, 2);
  const r = bookReport([{ id: '1', title: 'One', type: 'chapter', text: 'The cat sat on the mat. It was happily asleep.' }]);
  assert.equal(r.totals.words, 10);
  assert.equal(r.totals.adverbCount, 1);
});

test('100 templates generate CSS', () => {
  assert.equal(TEMPLATES.length, 100);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 100);
  for (const t of TEMPLATES) assert.ok(templateCss(t, '.bk', { dropCaps: true }).includes('.bk .bk-title'));
});

test('book renders every section type', () => {
  const book = ensureSections(defaultBook({ title: 'T', author: 'A' }));
  for (const s of book.sections) s.enabled = true;
  book.index.terms = ['lamp'];
  const contents = Object.fromEntries(book.sections.map((s) => [s.id, 'A lamp.[^1]\n\n[^1]: note']));
  book.notesPlacement = 'book';
  const out = renderBook({ book, contents, hrefFor: (id) => `${id}.xhtml` });
  assert.equal(out.length, book.sections.length);
  const endnotes = out.find((r) => r.sec.type === 'endnotes');
  assert.match(endnotes.html, /<li id="fn-/);
  const index = out.find((r) => r.sec.type === 'index');
  assert.match(index.html, /lamp/);
  assert.equal(chapterLabel(21, 'words'), 'Chapter Twenty-One');
  assert.equal(numberSections(book.sections, {}, book).filter((s) => s.type === 'chapter')[0].label, 'Chapter One');
});

import { joinScenes, splitAtBreaks, countBlocks } from '../src/shared/scenes.js';
import { formatInText } from '../src/shared/citations.js';

test('scenes split at breaks and join back with unique footnotes', () => {
  const md = 'One.[^1]\n\n* * *\n\nTwo.[^1]\n\n[^1]: Note A';
  const parts = splitAtBreaks(md);
  assert.equal(parts.length, 2);
  assert.match(parts[0], /\[\^1\]: Note A/);
  const contents = { a: parts[0], b: 'Two.[^x]\n\n[^x]: Note B\n' };
  const joined = joinScenes([{ id: 'a' }, { id: 'b' }], contents);
  assert.match(joined, /\[\^s1-1\]/);
  assert.match(joined, /\[\^s2-x\]: Note B/);
  assert.match(joined, /\n\* \* \*\n/);
  const { notes } = renderMarkdown(joined, { prefix: 'c' });
  assert.equal(notes.length, 2);
  assert.equal(countBlocks('Para one.\n\nPara two.\n\n* * *\n\n- a\n- b'), 4);
});

test('in-text citations follow the chosen style', () => {
  const e = { kind: 'article', authors: [{ family: 'Doe', given: 'Jane' }, { family: 'Smith', given: 'John' }], title: 'Lamps', date: '2024-05-02' };
  assert.equal(formatInText(e, 'apa', '12'), '(Doe & Smith, 2024, p. 12)');
  assert.equal(formatInText(e, 'apa', '12-14'), '(Doe & Smith, 2024, pp. 12-14)');
  assert.equal(formatInText(e, 'mla', 'p. 12'), '(Doe and Smith 12)');
  assert.equal(formatInText(e, 'chicago', '12'), '(Doe and Smith 2024, 12)');
  assert.equal(formatInText({ ...e, authors: [{ family: 'A' }, { family: 'B' }, { family: 'C' }] }, 'apa'), '(A et al., 2024)');
  const { html } = renderMarkdown('As shown [@r1, 5].', { cite: (ref, loc) => formatInText(ref === 'r1' ? e : null, 'apa', loc) });
  assert.match(html, /<span class="bk-cite">\(Doe &amp; Smith, 2024, p\. 5\)<\/span>/);
});

import { parseFountain, writeFountain } from '../src/shared/fountain.js';
import { layoutScript, scriptText, analyzeScript } from '../src/shared/screenplay.js';
import { buildFdx } from '../src/main/export-screenplay.js';

test('Fountain parses, round-trips and paginates like a screenplay', () => {
  const src = 'Title: T\nAuthor: A\n\nFADE IN:\n\nINT. ROOM - DAY\n\nA man waits.\n\nBOB\n(softly)\nHello.\n\nALICE ^\nHi.\n\nCLOSE ON A CLOCK [[shot]]\n\n> ACT ONE <\n\nCUT TO:\n';
  const { titlePage, elements } = parseFountain(src);
  assert.equal(titlePage.Title, 'T');
  assert.deepEqual(elements.map((e) => e.type), ['transition', 'scene', 'action', 'character', 'paren', 'dialogue', 'character', 'dialogue', 'shot', 'act', 'transition']);
  assert.equal(elements[6].dual, true);
  assert.deepEqual(parseFountain(writeFountain(titlePage, elements)).elements, elements);
  const long = [{ type: 'scene', text: 'INT. A - DAY' }];
  for (let i = 0; i < 6; i++) long.push({ type: 'action', text: 'Things happen. '.repeat(20) });
  long.push({ type: 'character', text: 'BOB' }, { type: 'dialogue', text: 'Words go on and on. '.repeat(60) });
  const lay = layoutScript(long, {});
  const txt = scriptText(lay, {});
  assert.match(txt, /\(MORE\)/);
  assert.match(txt, /BOB \(CONT'D\)/);
  assert.ok(lay.pages.every((p) => p.lines.length <= 54));
  assert.equal(analyzeScript(long, lay).scenes.length, 1);
  const fdx = buildFdx(src, { sceneNumbers: true });
  assert.match(fdx, /<Paragraph Type="Scene Heading" Number="1">/);
  assert.match(fdx, /<DualDialogue>/);
});

test('every LaTeX palette symbol and reference example renders', async () => {
  const { LATEX_SYMBOLS, LATEX_REFERENCE } = await import('../src/shared/latex-reference.js');
  const { texToMathml } = await import('../src/shared/math.js');
  const bad = [];
  let n = 0;
  for (const c of LATEX_SYMBOLS) for (const s of c.items) { n++; if (!s.tex || texToMathml(s.tex).error) bad.push(s.tex); }
  for (const r of LATEX_REFERENCE) { n++; if (texToMathml(r.code, r.display).error) bad.push(r.code); }
  assert.deepEqual(bad, []);
  assert.ok(n > 350, `only ${n} entries`);
});
