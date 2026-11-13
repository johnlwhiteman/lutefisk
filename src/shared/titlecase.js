// Capitalize My Title: headline-style capitalization in the major style guides.
// Runs entirely on this computer.
//
//   APA     — capitalize words of four or more letters; lowercase short (≤3)
//             articles, conjunctions and prepositions.
//   Chicago — lowercase articles, the conjunctions and/but/for/or/nor, every
//             preposition whatever its length, and "to" and "as".
//   AP      — capitalize words of four or more letters; lowercase articles,
//             conjunctions and prepositions of three letters or fewer.
//   MLA     — lowercase articles, every preposition, the coordinating
//             conjunctions, and "to".
//   Sentence — only the first word, the first word after a colon, and proper
//             nouns or acronyms you've already capitalized.
//
// In every style the first and last words, and the first word after a colon,
// em dash or question mark, are capitalized. Words that already carry capitals
// inside them (iPhone, McAdams, NASA) are left as written.

const ARTICLES = ['a', 'an', 'the'];
const COORD = ['and', 'but', 'for', 'nor', 'or', 'so', 'yet'];
const SHORT_CONJ = ['and', 'as', 'but', 'for', 'if', 'nor', 'or', 'so', 'yet'];
const PREPS = ['aboard', 'about', 'above', 'across', 'after', 'against', 'along', 'amid', 'among', 'amongst', 'around', 'as', 'at', 'atop', 'before', 'behind',
  'below', 'beneath', 'beside', 'besides', 'between', 'beyond', 'by', 'concerning', 'despite', 'down', 'during', 'except', 'for', 'from', 'in', 'inside',
  'into', 'like', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past', 'per', 'regarding', 'round', 'since', 'than', 'through', 'throughout',
  'till', 'to', 'toward', 'towards', 'under', 'underneath', 'unlike', 'until', 'unto', 'up', 'upon', 'versus', 'via', 'vs', 'with', 'within', 'without', 'o\'er', 'thru'];

const set = (...lists) => new Set(lists.flat());
const MINOR = {
  apa: set(ARTICLES, SHORT_CONJ, PREPS.filter((p) => p.length <= 3)),
  chicago: set(ARTICLES, ['and', 'but', 'for', 'or', 'nor'], PREPS, ['to', 'as']),
  ap: set(ARTICLES, COORD.filter((c) => c.length <= 3), ['as', 'if'], PREPS.filter((p) => p.length <= 3)),
  mla: set(ARTICLES, COORD, PREPS, ['to']),
};

export const TITLE_STYLES = [
  { id: 'chicago', label: 'Chicago', long: 'Chicago Manual of Style' },
  { id: 'apa', label: 'APA', long: 'APA (7th edition)' },
  { id: 'mla', label: 'MLA', long: 'MLA Handbook' },
  { id: 'ap', label: 'AP', long: 'AP Stylebook' },
  { id: 'sentence', label: 'Sentence case', long: 'Sentence case' },
];

const LETTER = /\p{L}/u;
const hasInnerCaps = (w) => /\p{Ll}/u.test(w) && /.\p{Lu}/u.test(w.replace(/^[^\p{L}]+/u, '')) || (/^\p{Lu}{2,}$/u.test(w.replace(/[^\p{L}]/gu, '')) && w.replace(/[^\p{L}]/gu, '').length >= 2);
/** Capitalize the first letter — unless the word starts with a digit (21st, 1990s). */
const cap = (w) => (/^[^\p{L}\p{N}]*\p{N}/u.test(w) ? w : w.replace(/\p{L}/u, (c) => c.toUpperCase()));
/** Split into words and the separators between them, keeping both. */
function tokenize(s) {
  return String(s).split(/(\s+)/).filter((t) => t !== '');
}
/** Bare lower-case form of a word for the minor-word lists (quotes and punctuation stripped). */
const bare = (w) => w.toLowerCase().replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '').replace(/[’]/g, "'");

/** Is this a URL, file name, e-mail, or a word with digits — leave alone. */
const literal = (w) => /^(https?:|www\.)|@|\.\w{2,4}$|\d/.test(w) && !/^\d+(st|nd|rd|th)?[,.:;!?]*$/i.test(w);

/**
 * Convert a title to a style. Returns the new title.
 * style: 'chicago' | 'apa' | 'mla' | 'ap' | 'sentence'
 */
export function capitalizeTitle(title, style = 'chicago') {
  const toks = tokenize(String(title || ''));
  const wordIdx = toks.map((t, i) => (/\S/.test(t) && LETTER.test(t) ? i : -1)).filter((i) => i >= 0);
  if (!wordIdx.length) return String(title || '');
  const first = wordIdx[0], last = wordIdx[wordIdx.length - 1];
  const minor = MINOR[style] || MINOR.chicago;
  let startOfPart = true; // after a colon, em dash, ? or !
  const out = toks.map((t, i) => {
    if (!/\S/.test(t)) return t;
    if (!LETTER.test(t)) { if (/[:—–?!]$/.test(t)) startOfPart = true; return t; }
    const forceCap = i === first || i === last || startOfPart;
    startOfPart = /[:—?!]$/.test(t) || /—$/.test(t);
    if (literal(t) || hasInnerCaps(t)) return t;
    // Hyphenated compounds: each part on its own, the first always capitalized in headline styles.
    const parts = t.split(/([-‐–—/])/);
    return parts.map((p, k) => {
      if (k % 2 === 1 || !LETTER.test(p)) return p;
      if (hasInnerCaps(p)) return p;
      const low = p.toLowerCase();
      if (style === 'sentence') {
        if (forceCap && k === 0 && (i === first || startOfPartAt(toks, i))) return cap(low);
        if (bare(p) === 'i' || /^i'/.test(bare(p))) return cap(low);
        // Keep a capital the author typed (a proper noun) unless the whole title was in headline style.
        if (/^\P{L}*\p{Lu}/u.test(p) && !titleCaseInput) return p;
        return low;
      }
      const b = bare(p);
      const isFirstPart = k === 0;
      if ((forceCap && isFirstPart) || (forceCap && i === last && k === parts.length - 1)) return cap(low);
      if (minor.has(b)) return low;
      // APA and AP capitalize four-letter-plus words; short words not on the lists (is, it, be, his…) are major too.
      return cap(low);
    }).join('');
  });
  return out.join('');
}

// In sentence case we can't know which words are proper nouns. We keep a capital
// the author typed unless the whole title looks like Title Case already (then
// almost every word is capitalized and those capitals carry no information).
let titleCaseInput = false;
function startOfPartAt(toks, i) {
  for (let j = i - 1; j >= 0; j--) { if (/\S/.test(toks[j])) return /[:—?!]$/.test(toks[j]); }
  return true;
}

/** Sentence case needs to know whether the input was already headline style. */
function looksTitleCased(title) {
  const words = String(title).split(/\s+/).filter((w) => /^\p{L}/u.test(w) && w.length > 3);
  if (words.length < 2) return false;
  return words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length > 0.6;
}

export function toStyle(title, style) {
  if (style === 'sentence') {
    titleCaseInput = looksTitleCased(title);
    try { return capitalizeTitle(title, 'sentence'); } finally { titleCaseInput = false; }
  }
  return capitalizeTitle(title, style);
}

/**
 * Analyse a title: which styles it already follows, and what each would change.
 * → [{ id, label, long, text, matches, changes: [{ from, to }] }]
 */
export function analyzeTitle(title) {
  const src = String(title || '').trim();
  return TITLE_STYLES.map((st) => {
    const text = toStyle(src, st.id);
    const a = src.split(/\s+/), b = text.split(/\s+/);
    const changes = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) changes.push({ from: a[i] || '', to: b[i] || '' });
    return { ...st, text, matches: text === src, changes };
  });
}
