// Text statistics for the whole book and per section. Pure functions; runs
// entirely on this computer.

const STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by ' +
  'can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in ' +
  'into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so ' +
  'some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when ' +
  'where which while who whom why will with would you your yours yourself yourselves said says one ll re ve don didn doesn isn wasn couldn wouldn ' +
  'won t s d m like back know got get go went into upon also even still much well way'). split(' '));

const BE = /\b(am|is|are|was|were|be|been|being)\s+(\w+ly\s+)?(\w+ed|\w+en|made|done|seen|known|given|taken|built|found|held|kept|left|lost|paid|said|sent|told|thought|brought|bought|caught|taught|felt|heard|meant|met|put|read|run|set|shut|sold|spent|stood|struck|understood|won|written|hidden|broken|chosen|driven|eaten|fallen|forgotten|frozen|gotten|ridden|risen|shaken|spoken|stolen|sworn|thrown|woken|worn)\b/gi;
const NOT_ADVERB = new Set(['only', 'family', 'early', 'reply', 'supply', 'apply', 'fly', 'july', 'holy', 'ugly', 'lonely', 'lovely', 'friendly', 'silly', 'belly', 'jelly', 'hilly', 'bully', 'rally', 'ally', 'italy', 'lily', 'emily', 'sally', 'molly', 'kelly', 'billy', 'daily', 'likely', 'elderly', 'curly', 'chilly', 'costly', 'deadly', 'oily', 'rely', 'imply', 'comply', 'multiply', 'butterfly', 'assembly', 'anomaly', 'monopoly', 'jolly', 'wily', 'surly', 'burly', 'sly', 'smelly', 'woolly', 'bubbly', 'cuddly', 'wobbly', 'prickly', 'orderly', 'homely', 'manly', 'kindly', 'timely']);

export function countSyllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
export const words = (t) => t.match(WORD_RE) || [];

export function splitSentences(text) {
  return text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|Mt|No)\./gi, '$1∯')
    .split(/(?<=[.!?…]["”’)\]]*)\s+(?=["“‘(\[]?[\p{Lu}\p{N}])/u)
    .map((s) => s.replace(/∯/g, '.').trim())
    .filter((s) => words(s).length > 0);
}

/** Analyze one plain-text body (paragraphs separated by blank lines). */
export function analyze(text) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sentences = paragraphs.flatMap(splitSentences);
  const ws = words(text);
  let syll = 0, poly = 0, complex = 0, letters = 0;
  for (const w of ws) {
    const s = countSyllables(w);
    syll += s;
    if (s >= 3) { poly++; if (!/^[A-Z]/.test(w) && !/(es|ed|ing)$/.test(w)) complex++; }
    letters += w.replace(/[^\p{L}\p{N}]/gu, '').length;
  }
  const dialogueWords = (text.match(/[“"][^”"]*[”"]/g) || []).reduce((n, q) => n + words(q).length, 0);
  return {
    words: ws.length,
    characters: text.replace(/\n/g, '').length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    letters,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    syllables: syll,
    polysyllables: poly,
    complexWords: complex,
    dialogueWords,
    sentenceLengths: sentences.map((s) => words(s).length),
    sentencesText: sentences,
    wordList: ws,
  };
}

const round = (n, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);

/** Readability indices from raw counts. */
export function readability(a) {
  const W = Math.max(1, a.words), S = Math.max(1, a.sentences);
  return {
    fleschReadingEase: round(206.835 - 1.015 * (W / S) - 84.6 * (a.syllables / W)),
    fleschKincaidGrade: round(0.39 * (W / S) + 11.8 * (a.syllables / W) - 15.59),
    gunningFog: round(0.4 * (W / S + 100 * (a.complexWords / W))),
    smog: round(1.043 * Math.sqrt(a.polysyllables * (30 / S)) + 3.1291),
    colemanLiau: round(0.0588 * (a.letters / W * 100) - 0.296 * (S / W * 100) - 15.8),
    automatedReadability: round(4.71 * (a.letters / W) + 0.5 * (W / S) - 21.43),
  };
}

export function easeLabel(score) {
  if (score >= 90) return 'Very easy (5th grade)';
  if (score >= 80) return 'Easy (6th grade)';
  if (score >= 70) return 'Fairly easy (7th grade)';
  if (score >= 60) return 'Plain English (8th–9th grade)';
  if (score >= 50) return 'Fairly difficult (high school)';
  if (score >= 30) return 'Difficult (college)';
  return 'Very difficult (graduate)';
}

/**
 * Full book report. sections: [{ id, title, type, text }]
 */
export function bookReport(sections, opts = {}) {
  const per = sections.map((s) => ({ ...s, a: analyze(s.text || '') }));
  const total = analyze(per.map((s) => s.text || '').join('\n\n'));
  const r = readability(total);
  const freq = new Map();
  const lower = total.wordList.map((w) => w.toLowerCase().replace(/’/g, "'"));
  for (const w of lower) if (!STOP.has(w) && w.length > 2 && !/^\d+$/.test(w) && !/'(s|t|d|ll|re|ve|m)$/.test(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const topWords = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 30);

  const tri = new Map();
  for (let i = 0; i + 2 < lower.length; i++) {
    const g = lower.slice(i, i + 3);
    if (g.every((w) => STOP.has(w))) continue;
    const k = g.join(' ');
    tri.set(k, (tri.get(k) || 0) + 1);
  }
  const repeatedPhrases = [...tri].filter(([, n]) => n > 2).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const adverbs = lower.filter((w) => w.length > 4 && w.endsWith('ly') && !NOT_ADVERB.has(w));
  const advFreq = new Map();
  for (const w of adverbs) advFreq.set(w, (advFreq.get(w) || 0) + 1);
  const fullText = per.map((s) => s.text || '').join('\n\n');
  const passive = (fullText.match(BE) || []).length;
  const lens = total.sentenceLengths;
  const buckets = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 30], [31, 40], [41, Infinity]].map(([lo, hi]) => ({
    label: hi === Infinity ? `${lo}+` : `${lo}–${hi}`, count: lens.filter((n) => n >= lo && n <= hi).length,
  }));
  const longest = total.sentencesText.map((s, i) => ({ s, n: lens[i] })).sort((a, b) => b.n - a.n).slice(0, 5);
  const unique = new Set(lower).size;
  const wpp = opts.wordsPerPage || 275;

  return {
    totals: {
      words: total.words, characters: total.characters, charactersNoSpaces: total.charactersNoSpaces,
      sentences: total.sentences, paragraphs: total.paragraphs, syllables: total.syllables,
      uniqueWords: unique,
      lexicalDiversity: round(unique / Math.max(1, total.words) * 100),
      avgWordsPerSentence: round(total.words / Math.max(1, total.sentences)),
      avgSentencesPerParagraph: round(total.sentences / Math.max(1, total.paragraphs)),
      avgSyllablesPerWord: round(total.syllables / Math.max(1, total.words), 2),
      avgWordLength: round(total.letters / Math.max(1, total.words), 2),
      readingMinutes: Math.ceil(total.words / 238),
      speakingMinutes: Math.ceil(total.words / 150),
      estimatedPages: opts.pages || Math.ceil(total.words / wpp),
      dialoguePercent: round(total.dialogueWords / Math.max(1, total.words) * 100),
      adverbCount: adverbs.length,
      adverbPerThousand: round(adverbs.length / Math.max(1, total.words) * 1000),
      passiveCount: passive,
      complexWordPercent: round(total.complexWords / Math.max(1, total.words) * 100),
      longSentences: lens.filter((n) => n > 30).length,
    },
    readability: r,
    easeLabel: easeLabel(r.fleschReadingEase),
    topWords,
    topAdverbs: [...advFreq].sort((a, b) => b[1] - a[1]).slice(0, 12),
    repeatedPhrases,
    sentenceBuckets: buckets,
    longestSentences: longest,
    sections: per.map((s) => ({
      id: s.id, title: s.title, type: s.type, words: s.a.words, sentences: s.a.sentences, paragraphs: s.a.paragraphs,
      avgSentence: round(s.a.words / Math.max(1, s.a.sentences)),
      ease: readability(s.a).fleschReadingEase,
      dialoguePercent: round(s.a.dialogueWords / Math.max(1, s.a.words) * 100),
    })),
  };
}
