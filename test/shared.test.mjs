import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, extractFootnotes, markdownToPlain, safeAssetPath } from '../src/shared/markdown.js';
import { formatEntry, parseName, fromCsl } from '../src/shared/citations.js';
import { analyze, bookReport, countSyllables } from '../src/shared/stats.js';
import { TEMPLATES, templateCss, sanitizeTemplate, setCustomTemplates } from '../src/shared/templates.js';
import { toStyle, analyzeTitle } from '../src/shared/titlecase.js';
import { cleanBullet } from '../src/shared/markdown.js';
import { buildText } from '../src/main/export-txt.js';
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

test('95 templates generate CSS', () => {
  assert.equal(TEMPLATES.length, 95);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 95);
  assert.ok(!TEMPLATES.some((t) => /sanskrit|devanagari|vedic|lotus|mantra/.test(t.id)));
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

test('characters: names, mentions and appearances', async () => {
  const { characterNames, countMentions, appearances, newCharacter } = await import('../src/shared/characters.js');
  const mara = { ...newCharacter('c1', 'Mara Lamplighter'), aliases: ['the lamplighter’s daughter'] };
  assert.deepEqual(characterNames(mara).sort(), ['Mara', 'Mara Lamplighter', 'the lamplighter’s daughter'].sort());
  assert.equal(countMentions('Mara walked. Mara’s lantern. Tamara left. MARA (V.O.)', mara), 2);
  assert.equal(countMentions('MARA (V.O.)\nHello.', mara, { screenplay: true }), 1);
  const will = newCharacter('c2', 'Will');
  assert.equal(countMentions('Will said he will go.', will), 1);
  const a = appearances([mara, will], [{ id: 'a', title: 'One', text: 'Mara and Will' }, { id: 'b', title: 'Two', text: 'nobody' }, { id: 'c', title: 'Three', text: 'Mara Lamplighter, Mara.' }]);
  assert.deepEqual(a.get('c1').map((x) => [x.id, x.count]), [['a', 1], ['c', 2]]);
  assert.deepEqual(a.get('c2').map((x) => x.id), ['a']);
});

test('markdown: \\newpage is a page break', async () => {
  const { renderMarkdown } = await import('../src/shared/markdown.js');
  const r = renderMarkdown('One.\n\n\\newpage\n\nTwo.', {});
  const html = typeof r === 'string' ? r : r.html;
  assert.match(html, /<div class="bk-pagebreak"/);
  assert.match(html, /<p>One\.<\/p>/);
  assert.doesNotMatch(html, /newpage/);
});

test('scenes: excluded scenes are left out of the chapter unless asked', async () => {
  const { joinScenes } = await import('../src/shared/scenes.js');
  const scenes = [{ id: 'a' }, { id: 'b', exclude: true }, { id: 'c' }];
  const contents = { a: 'Alpha.', b: 'Beta.', c: 'Gamma.' };
  assert.doesNotMatch(joinScenes(scenes, contents), /Beta/);
  assert.match(joinScenes(scenes, contents, { all: true }), /Beta/);
});

/* ---- formatting added for the book editor */
test('markdown: underline, subscript and superscript', () => {
  const { html } = renderMarkdown('H~2~O, E=mc^2^, ++under++ and ~~gone~~; 3 ~ 4 stays; note^[x] stays');
  assert.match(html, /H<sub>2<\/sub>O/);
  assert.match(html, /mc<sup>2<\/sup>/);
  assert.match(html, /<u>under<\/u>/);
  assert.match(html, /<s>gone<\/s>/);
  assert.match(html, /3 ~ 4 stays/);
  assert.doesNotMatch(html, /<sup>\[x/);
});

test('markdown: verse keeps its lines, hanging indent wraps its paragraphs', () => {
  const v = renderMarkdown('::: verse\nRoses are red,\\\nviolets are blue.\n\nSecond stanza\n:::').html;
  assert.match(v, /<div class="bk-align bk-align-verse">/);
  assert.match(v, /red,<br \/>/);
  assert.equal((v.match(/<p>/g) || []).length, 2);
  assert.match(renderMarkdown('::: hanging\nSmith, J. (2020). A book.\n:::').html, /bk-align-hanging/);
});

test('chapter heading: number and title, title only, number only', () => {
  const book = ensureSections(defaultBook({ title: 'T' }));
  const ch = book.sections.find((s) => s.type === 'chapter');
  ch.title = 'The Mill';
  const tpl = TEMPLATES[0];
  const pick = (mode) => numberSections(book.sections, tpl, { ...book, chapterHeading: mode }).find((s) => s.id === ch.id);
  assert.ok(pick('both').label && pick('both').displayTitle === 'The Mill');
  assert.equal(pick('title').label, '');
  assert.equal(pick('number').displayTitle, '');
});

test('custom bullets: ::: bullets ★ marks the list and each item; unsafe bullets are refused', () => {
  const { html } = renderMarkdown('::: bullets ★\n- One\n- Two\n:::\n');
  assert.ok(html.includes('<ul class="bk-bullets">'));
  assert.equal((html.match(/data-bullet="★"/g) || []).length, 2);
  assert.equal(cleanBullet('<b'), '');
  assert.equal(cleanBullet('"'), '');
  assert.equal(cleanBullet('a;b'), '');
  assert.equal(cleanBullet('➤'), '➤');
  const bad = renderMarkdown('::: bullets <x>\n- One\n:::\n').html;
  assert.ok(!bad.includes('data-bullet'));
});

test('Capitalize My Title: Chicago, APA, MLA, AP and sentence case', () => {
  assert.equal(toStyle('the lord of the rings: the return of the king', 'chicago'), 'The Lord of the Rings: The Return of the King');
  assert.equal(toStyle('gone with the wind', 'chicago'), 'Gone with the Wind');
  assert.equal(toStyle('gone with the wind', 'apa'), 'Gone With the Wind');
  assert.equal(toStyle('gone with the wind', 'mla'), 'Gone with the Wind');
  assert.equal(toStyle('gone with the wind', 'ap'), 'Gone With the Wind');
  assert.equal(toStyle('an iPhone guide for NASA engineers', 'apa'), 'An iPhone Guide for NASA Engineers');
  assert.equal(toStyle('self-made man in the 21st century', 'chicago'), 'Self-Made Man in the 21st Century');
  assert.equal(toStyle('a tale of two cities', 'sentence'), 'A tale of two cities');
  const r = analyzeTitle('The Road To Hollow Mill');
  assert.equal(r.find((x) => x.id === 'chicago').text, 'The Road to Hollow Mill');
  assert.ok(!r.find((x) => x.id === 'chicago').matches);
});

test('picture ornaments are sanitized and rendered under chapter headings', () => {
  const t = sanitizeTemplate({ id: 'custom-orn', name: 'Orn', ornamentImg: 'assets/orn.png', ornamentImgW: 8 });
  assert.equal(t.ornamentImg, 'assets/orn.png');
  assert.equal(sanitizeTemplate({ ornamentImg: '../../etc/passwd.png' }).ornamentImg, '');
  assert.equal(sanitizeTemplate({ ornamentImg: 'assets/x.svg' }).ornamentImg, '');
  assert.equal(sanitizeTemplate({ ornamentData: 'data:image/svg+xml;base64,AAAA' }).ornamentData, undefined);
  setCustomTemplates([t]);
  const book = ensureSections(defaultBook({ title: 'T', author: 'A' }));
  book.template = t.id;
  const ch = book.sections.find((s) => s.type === 'chapter');
  const out = renderBook({ book, contents: { [ch.id]: 'Hello.' }, assetUrl: (src) => `asset:${src}` });
  const html = out.find((x) => x.sec.id === ch.id).html;
  assert.ok(html.includes('class="bk-orn bk-orn-pic"') && html.includes('src="asset:assets/orn.png"'));
  assert.ok(templateCss(t, '.bk').includes('.bk .bk-orn-pic img{width:8em'));
  setCustomTemplates([]);
});

test('plain-text export: headings, scene breaks, lists and footnotes', () => {
  const book = ensureSections(defaultBook({ title: 'The Book', author: 'A. Writer' }));
  const ch = book.sections.find((s) => s.type === 'chapter');
  ch.title = 'Beginnings';
  const txt = buildText({ book, contents: { [ch.id]: 'First *line* here.[^1]\n\n***\n\n::: bullets ★\n- One\n- Two\n:::\n\n[^1]: A note.' } });
  assert.ok(txt.includes('BEGINNINGS'));
  assert.ok(txt.includes('* * *'));
  assert.ok(txt.includes('★ One\n★ Two'));
  assert.ok(txt.includes('First line here.[1]'));
  assert.ok(/\[1\] A note\./.test(txt));
  assert.ok(!/<[a-z]/i.test(txt));
});

test('custom templates remember whether they are your own or a changed built-in', () => {
  assert.equal(sanitizeTemplate({ name: 'Classic (Custom)' }).origin, 'changed');
  assert.equal(sanitizeTemplate({ name: 'Classic (Custom)' }).baseName, 'Classic');
  assert.equal(sanitizeTemplate({ name: 'Mine', origin: 'new', baseId: 'classic' }).origin, 'new');
  assert.equal(sanitizeTemplate({ name: 'Renamed', baseId: 'classic' }).origin, 'changed');
  assert.equal(sanitizeTemplate({ name: 'Mine' }).origin, 'new');
});
