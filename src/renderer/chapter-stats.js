// Statistics for one chapter (or scene): dates, time spent writing, daily
// activity, and language analysis — readability, sentence rhythm, dialogue,
// vocabulary, adverbs, passive voice, filter words, names and repetition.
// Everything is computed on this computer.
import { h, icon } from './ui.js';
import { bookReport, analyze, words as wordsOf, splitSentences, readability } from '../shared/stats.js';
import { markdownToPlain } from '../shared/markdown.js';

const n = (v) => Number(v || 0).toLocaleString();
const pct = (v) => `${Math.round(v)}%`;
const dur = (secs) => {
  const m = Math.round((secs || 0) / 60);
  if (!m) return secs ? '< 1 min' : '—';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
const ago = (iso) => {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1 / 24) return 'just now';
  if (d < 1) return `${Math.round(d * 24)} h ago`;
  if (d < 45) return `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'} ago`;
  return `${Math.round(d / 30)} months ago`;
};

const FILTER = ['saw', 'see', 'seen', 'heard', 'hear', 'felt', 'feel', 'feels', 'noticed', 'notice', 'realized', 'realised', 'wondered', 'thought', 'knew', 'watched', 'looked', 'seemed', 'decided', 'could see', 'could hear', 'could feel'];
const WEAK = ['very', 'really', 'just', 'quite', 'rather', 'somewhat', 'actually', 'basically', 'literally', 'suddenly', 'totally', 'completely', 'simply'];
const SENT_START_SKIP = new Set(['The', 'A', 'An', 'It', 'He', 'She', 'They', 'We', 'I', 'You', 'But', 'And', 'Then', 'When', 'In', 'On', 'At', 'If', 'So', 'There', 'This', 'That', 'Her', 'His', 'Their', 'What', 'Why', 'How', 'Where', 'Who', 'No', 'Yes', 'Not', 'One', 'As', 'For', 'With', 'By', 'All', 'Now', 'Even', 'Still', 'Mr', 'Mrs', 'Ms', 'Dr', 'Chapter', 'Oh', 'Of', 'To', 'Or', 'From', 'After', 'Before', 'Once', 'Some', 'My', 'Our', 'Your', 'Its']);

/** Extra language measures beyond the book report. */
function deepAnalysis(text) {
  const a = analyze(text);
  const lens = a.sentenceLengths;
  const mean = lens.reduce((x, y) => x + y, 0) / Math.max(1, lens.length);
  const sd = Math.sqrt(lens.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, lens.length));
  const sentences = a.sentencesText;
  const questions = sentences.filter((s) => /\?["”’)]*$/.test(s)).length;
  const exclamations = sentences.filter((s) => /!["”’)]*$/.test(s)).length;
  const lower = text.toLowerCase();
  const countPhrase = (p) => (lower.match(new RegExp(`\\b${p.replace(/ /g, '\\s+')}\\b`, 'g')) || []).length;
  const filters = FILTER.map((f) => [f, countPhrase(f)]).filter(([, c]) => c).sort((x, y) => y[1] - x[1]);
  const weak = WEAK.map((f) => [f, countPhrase(f)]).filter(([, c]) => c).sort((x, y) => y[1] - x[1]);
  // Names and proper nouns: capitalised words that aren't the first word of a sentence.
  const names = new Map();
  for (const s of sentences) {
    const ws = wordsOf(s);
    ws.forEach((w, i) => {
      if (i === 0 || !/^\p{Lu}[\p{Ll}’']+$/u.test(w) || SENT_START_SKIP.has(w) || w.length < 3) return;
      names.set(w, (names.get(w) || 0) + 1);
    });
  }
  const topNames = [...names].filter(([, c]) => c > 1).sort((x, y) => y[1] - x[1]).slice(0, 12);
  // Paragraph and sentence openings that repeat back to back.
  const openers = new Map();
  for (const s of sentences) { const w = wordsOf(s)[0]; if (w) openers.set(w, (openers.get(w) || 0) + 1); }
  const topOpeners = [...openers].sort((x, y) => y[1] - x[1]).slice(0, 6);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const dialogueParas = paragraphs.filter((p) => /[“"]/.test(p)).length;
  const paraLens = paragraphs.map((p) => wordsOf(p).length);
  return {
    a, sd: Math.round(sd * 10) / 10, mean: Math.round(mean * 10) / 10, questions, exclamations, filters, weak, topNames, topOpeners,
    dialogueParas, longestPara: Math.max(0, ...paraLens), shortSentences: lens.filter((x) => x <= 5).length,
  };
}

/** Merge stats of a chapter and its scenes. */
function gather(app, sec) {
  const nodes = [sec, ...(sec.scenes || [])];
  const ids = nodes.map((x) => x.id);
  let created = null, updated = null, seconds = 0, edits = 0;
  const days = {};
  for (const node of nodes) {
    const st = node.stats || {};
    const c = st.created || app.fileTimes?.[node.id]?.created;
    const u = st.updated || app.fileTimes?.[node.id]?.modified;
    if (c && (!created || c < created)) created = c;
    if (u && (!updated || u > updated)) updated = u;
    seconds += st.seconds || 0;
    edits += st.edits || 0;
    for (const [d, v] of Object.entries(st.days || {})) { days[d] ||= { w: 0, s: 0 }; days[d].w += v.w || 0; days[d].s += v.s || 0; }
  }
  return { ids, created, updated, seconds, edits, days };
}

export function openChapterStats(app, sheet, sec, { title, sceneTitles = [] } = {}) {
  const md = sec.scenes?.length ? sec.scenes.map((sc) => app.contents[sc.id] || '').join('\n\n') : app.contents[sec.id] || '';
  const text = markdownToPlain(md);
  const rep = bookReport([{ id: sec.id, title, type: sec.type, text }]);
  const t = rep.totals;
  const x = deepAnalysis(text);
  const r = rep.readability;
  const g = gather(app, sec);

  // Compare with the rest of the book.
  const others = app.sections().filter((s) => ['chapter', 'prologue', 'epilogue', 'appendix'].includes(s.type) && s.id !== sec.id);
  const otherWords = others.map((s) => (s.scenes?.length ? s.scenes.reduce((m, sc) => m + wordsOf(markdownToPlain(app.contents[sc.id] || '')).length, 0) : wordsOf(markdownToPlain(app.contents[s.id] || '')).length));
  const avgChapter = otherWords.length ? Math.round(otherWords.reduce((p, q) => p + q, 0) / otherWords.length) : 0;
  const bookText = markdownToPlain(others.map((s) => (s.scenes?.length ? s.scenes.map((sc) => app.contents[sc.id] || '').join('\n\n') : app.contents[s.id] || '')).join('\n\n'));
  const bookEase = bookText.trim() ? readability(analyze(bookText)).fleschReadingEase : null;

  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, value), h('div', { class: 'tile-l' }, label), sub ? h('div', { class: 'tile-s' }, sub) : null);
  const kv = (rows) => h('table', { class: 'kv' }, rows.filter(Boolean).map(([k, v, hint]) => h('tr', { title: hint || '' }, h('td', {}, k), h('td', { class: 'num' }, v))));
  const list = (rows, empty = 'None found') => (rows.length ? h('ol', { class: 'wordlist' }, rows.map(([w, c]) => h('li', {}, h('span', {}, w), h('b', {}, n(c))))) : h('p', { class: 'hint' }, empty));
  const sectionBox = (heading, ...kids) => h('section', { class: 'cs-box' }, h('h3', {}, heading), ...kids);

  // Activity: words per day for the last 30 days.
  const dayKeys = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); dayKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); }
  const series = dayKeys.map((k) => ({ k, w: Math.max(0, g.days[k]?.w || 0), s: g.days[k]?.s || 0 }));
  const maxW = Math.max(1, ...series.map((d) => d.w));
  const daysWorked = Object.values(g.days).filter((d) => d.w || d.s).length;
  const activity = h('div', { class: 'cs-activity', role: 'img', 'aria-label': 'Words written per day, last 30 days' },
    series.map((d) => h('div', { class: `cs-day${d.w ? '' : ' zero'}`, title: `${new Date(d.k + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${n(d.w)} words${d.s ? ` · ${dur(d.s)}` : ''}` },
      h('i', { style: { height: `${d.w ? Math.max(6, (d.w / maxW) * 100) : 2}%` } }))));

  const wph = g.seconds > 300 ? Math.round(t.words / (g.seconds / 3600)) : null;
  const sceneRows = (sec.scenes || []).map((sc, i) => {
    const st = analyze(markdownToPlain(app.contents[sc.id] || ''));
    const upd = sc.stats?.updated || app.fileTimes?.[sc.id]?.modified;
    return h('tr', {}, h('td', { class: 'name' }, sceneTitles[i] || sc.title || `Scene ${i + 1}`), h('td', { class: 'num' }, n(st.words)),
      h('td', { class: 'num' }, st.words ? readability(st).fleschReadingEase : '—'), h('td', { class: 'num' }, st.words ? pct(st.dialogueWords / st.words * 100) : '—'),
      h('td', { class: 'num' }, dur(sc.stats?.seconds)), h('td', { class: 'num' }, upd ? fmtDate(upd) : '—'));
  });
  const maxB = Math.max(1, ...rep.sentenceBuckets.map((b) => b.count));
  const hist = h('div', { class: 'hist cs-hist', role: 'img', 'aria-label': 'Sentence length distribution' },
    rep.sentenceBuckets.map((b) => h('div', { class: 'hcol', title: `${b.label} words: ${n(b.count)} sentences` },
      h('div', { class: 'hval' }, n(b.count)), h('div', { class: 'hbar', style: { height: `${(b.count / maxB) * 100}%` } }), h('div', { class: 'hlbl' }, b.label))));

  const body = h('div', { class: 'stats chapter-stats' },
    h('div', { class: 'tiles' },
      tile('Words', n(t.words), avgChapter ? `${t.words >= avgChapter ? '+' : '−'}${n(Math.abs(t.words - avgChapter))} vs. average chapter` : `${n(t.uniqueWords)} unique`),
      tile('Reading time', `${Math.max(t.words ? 1 : 0, Math.round(t.words / 238))} min`, `${Math.max(t.words ? 1 : 0, Math.round(t.words / 150))} min read aloud`),
      tile('Time writing', dur(g.seconds), wph ? `≈ ${n(wph)} words per hour` : 'active typing time'),
      tile('Sentences', n(t.sentences), `${t.avgWordsPerSentence} words on average`),
      tile('Paragraphs', n(t.paragraphs), `${n(x.dialogueParas)} with dialogue`),
      tile('Pages', n(Math.max(t.words ? 1 : 0, Math.round(t.words / 275))), 'estimated, print')),

    h('div', { class: 'stat-cols' },
      sectionBox('Dates & effort', kv([
        ['Created', `${fmtDate(g.created)}`, g.created ? `${fmtDate(g.created)} ${fmtTime(g.created)}` : ''],
        ['Last updated', g.updated ? `${fmtDate(g.updated)} · ${ago(g.updated)}` : '—'],
        ['Age', g.created ? `${Math.max(0, Math.round((Date.now() - new Date(g.created)) / 86400000))} days` : '—'],
        ['Days worked on', n(daysWorked)],
        ['Time spent writing', dur(g.seconds), 'Counted while you type; pauses longer than 90 seconds are not included.'],
        ['Edits', n(g.edits)],
        sec.scenes?.length ? ['Scenes', n(sec.scenes.length)] : null,
      ]), h('p', { class: 'hint' }, 'Words per day, last 30 days'), activity),
      sectionBox('Readability', kv([
        ['Flesch reading ease', `${r.fleschReadingEase}`, 'Higher is easier (0–100).'],
        ['', rep.easeLabel],
        bookEase != null ? ['Rest of the book', `${bookEase}`] : null,
        ['Flesch–Kincaid grade', `${r.fleschKincaidGrade}`],
        ['Gunning fog', `${r.gunningFog}`],
        ['SMOG', `${r.smog}`],
        ['Coleman–Liau', `${r.colemanLiau}`],
        ['Automated readability', `${r.automatedReadability}`],
      ])),
      sectionBox('Rhythm & style', kv([
        ['Average sentence', `${x.mean} words`],
        ['Sentence variety', `±${x.sd} words`, 'Standard deviation of sentence length. Higher means more varied rhythm.'],
        ['Short sentences (≤ 5 words)', n(x.shortSentences)],
        ['Long sentences (> 30 words)', n(t.longSentences)],
        ['Longest paragraph', `${n(x.longestPara)} words`],
        ['Dialogue', pct(t.dialoguePercent)],
        ['Questions / exclamations', `${n(x.questions)} / ${n(x.exclamations)}`],
        ['Adverbs (-ly)', `${n(t.adverbCount)} · ${t.adverbPerThousand} per 1,000`],
        ['Passive voice (estimate)', n(t.passiveCount)],
        ['Complex words (3+ syllables)', pct(t.complexWordPercent)],
        ['Vocabulary richness', pct(t.lexicalDiversity), 'Unique words as a share of all words.'],
        ['Average word length', `${t.avgWordLength} letters`],
      ]))),

    h('div', { class: 'stat-cols' },
      sectionBox('Most used words', list(rep.topWords.slice(0, 16))),
      sectionBox('Names & proper nouns', list(x.topNames, 'No repeated names.')),
      sectionBox('Repeated phrases', list(rep.repeatedPhrases.slice(0, 12), 'No phrase repeats more than twice.'))),

    h('div', { class: 'stat-cols' },
      sectionBox('Adverbs', list(rep.topAdverbs.slice(0, 12))),
      sectionBox('Filter words', h('p', { class: 'hint' }, 'Words like saw, felt and realized can distance readers from the scene.'), list(x.filters.slice(0, 10))),
      sectionBox('Weak intensifiers', list(x.weak.slice(0, 10)), h('p', { class: 'hint' }, 'Sentence openers'), list(x.topOpeners))),

    h('section', { class: 'cs-box' }, h('h3', {}, 'Sentence lengths'), hist),
    rep.longestSentences.length ? h('section', { class: 'cs-box' }, h('h3', {}, 'Longest sentences'), h('ol', { class: 'cs-long' }, rep.longestSentences.slice(0, 3).map((s) => h('li', {}, h('span', {}, s.s), h('b', {}, `${s.n} words`))))) : null,
    sceneRows.length ? h('section', { class: 'cs-box' }, h('h3', {}, 'Scenes'),
      h('table', { class: 'stat-table' }, h('thead', {}, h('tr', {}, ['Scene', 'Words', 'Ease', 'Dialogue', 'Writing time', 'Updated'].map((c) => h('th', {}, c)))), h('tbody', {}, sceneRows))) : null,
    h('p', { class: 'hint cs-foot' }, icon('eye', 13), 'Analysed on this computer. Readability scores are designed for English prose.'));
  sheet(`Statistics — ${title}`, body, { wide: true });
}
