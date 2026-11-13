// Section types and book model helpers shared by the app and exporters.

export const GROUPS = [
  { id: 'front', label: 'Front Matter' },
  { id: 'body', label: 'Body' },
  { id: 'back', label: 'Back Matter' },
];

// generated: content is produced from book data rather than typed.
// multi: more than one may exist.
export const SECTION_TYPES = {
  'title-page': { group: 'front', label: 'Title Page', generated: true },
  copyright: { group: 'front', label: 'Copyright Page' },
  dedication: { group: 'front', label: 'Dedication' },
  epigraph: { group: 'front', label: 'Epigraph' },
  toc: { group: 'front', label: 'Table of Contents', generated: true },
  foreword: { group: 'front', label: 'Foreword' },
  preface: { group: 'front', label: 'Preface' },
  introduction: { group: 'front', label: 'Introduction' },
  prologue: { group: 'body', label: 'Prologue' },
  chapter: { group: 'body', label: 'Chapter', multi: true },
  epilogue: { group: 'body', label: 'Epilogue' },
  acknowledgments: { group: 'back', label: 'Acknowledgments' },
  appendix: { group: 'back', label: 'Appendix', multi: true },
  endnotes: { group: 'back', label: 'Endnotes', generated: true },
  bibliography: { group: 'back', label: 'Bibliography', generated: true },
  index: { group: 'back', label: 'Index', generated: true },
  'about-author': { group: 'back', label: 'About the Author' },
};

export const TYPE_ORDER = Object.keys(SECTION_TYPES);

/** Sections whose pages are "display" pages in print (no running heads). */
export const DISPLAY_TYPES = new Set(['title-page', 'copyright', 'dedication', 'epigraph']);

export const DEFAULT_CONTENT = {
  copyright:
    'Copyright © {{year}} by {{author}}\n\nAll rights reserved. No part of this book may be reproduced in any form or by any electronic or mechanical means, including information storage and retrieval systems, without written permission from the author, except for the use of brief quotations in a book review.\n\nThis is a work of fiction. Names, characters, places, and incidents are products of the author’s imagination or are used fictitiously.\n\n{{isbn}}\n\nFirst edition {{year}}',
  dedication: '*For the readers who stay up too late.*',
  epigraph: '*Every story begins with a single sentence.*\n\n— Anonymous',
  'about-author': '{{author}} writes from a small desk by a large window.',
};

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '');
  return String(n);
}
export function toRoman(n) {
  const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
const title = (s) => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** Chapter heading choices shown in the UI. */
export const CHAPTER_HEADINGS = [
  ['words', 'Chapter One'],
  ['numeral', 'Chapter 1'],
  ['roman', 'Chapter I'],
  ['word-only', 'One'],
  ['number-only', '1'],
  ['roman-only', 'I'],
  ['cjk', '第三章 (Chinese/Japanese)'],
  ['cjk-only', '三 (Chinese/Japanese numeral)'],
  ['none', 'No chapter number'],
];

/** Chinese/Japanese numerals: 1 → 一, 12 → 十二, 20 → 二十, 105 → 百五. */
export function toCjk(n) {
  const D = '〇一二三四五六七八九';
  if (n <= 0 || n >= 10000) return String(n);
  let out = '';
  for (const [v, ch] of [[1000, '千'], [100, '百'], [10, '十']]) {
    const q = Math.floor(n / v);
    if (q) out += (q > 1 ? D[q] : '') + ch;
    n %= v;
  }
  return out + (n ? D[n] : '');
}

 /** What a chapter opening shows: the number and the title, only the title, or only the number. */
export const HEADING_MODES = [['both', 'Chapter number and title'], ['title', 'Title only — no chapter number'], ['number', 'Chapter number only — no title']];
export function chapterHeadingMode(meta = {}, tpl = {}) {
  if (['both', 'title', 'number'].includes(meta.chapterHeading)) return meta.chapterHeading;
  // Books saved before this setting existed.
  if (meta.chapterTitles === false) return 'number';
  if (meta.chapterNumbering === 'none') return 'title';
  if (['both', 'title', 'number'].includes(tpl.heading)) return tpl.heading;
  return tpl.numbering === 'none' ? 'title' : 'both';
}

/** Label like "Chapter Seven" / "Chapter 7" / "VII" depending on style. */
export function chapterLabel(n, style, word = 'Chapter') {
  switch (style) {
    case 'numeral': return `${word} ${n}`;
    case 'number-only': return String(n);
    case 'word-only': return title(numberToWords(n));
    case 'roman': return `${word} ${toRoman(n).toUpperCase()}`;
    case 'roman-only': return toRoman(n).toUpperCase();
    case 'cjk': return `第${toCjk(n)}章`;
    case 'cjk-only': return toCjk(n);
    case 'none': return '';
    default: return `${word} ${title(numberToWords(n))}`;
  }
}

/** Drop caps are configured separately for e-books and print. */
export const ebookDropCaps = (book) => book.dropCaps !== false;
export const printDropCaps = (book) => (book.print?.dropCaps ?? book.dropCaps) !== false;

export function newId(prefix = 's') {
  const rnd = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '');
  return `${prefix}-${rnd.slice(0, 8)}`;
}

/** Fill {{placeholders}} from book metadata. */
export function fillPlaceholders(text, meta) {
  const year = meta.year || new Date().getFullYear();
  const isbn = meta.isbn ? `ISBN: ${meta.isbn}` : '';
  const map = { year, author: meta.author || 'The Author', title: meta.title || 'Untitled', isbn, publisher: meta.publisher || '' };
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? String(map[k]) : m));
}

/** Annotate sections with chapter numbers and display titles. */
export function numberSections(sections, tpl = {}, meta = {}) {
  let ch = 0;
  return sections.filter((s) => s.enabled !== false).map((s) => {
    const def = SECTION_TYPES[s.type] || {};
    const out = { ...s, def };
    if (s.type === 'chapter' && s.exclude) {
      out.number = null;
      out.label = 'Excluded';
      out.displayTitle = s.title || '';
      out.tocTitle = s.title || meta.chapterWord || 'Chapter';
    } else if (s.type === 'chapter') {
      ch += 1;
      out.number = ch;
      const mode = chapterHeadingMode(meta, tpl);
      let numStyle = meta.chapterNumbering || tpl.numbering || 'words';
      if (numStyle === 'none') numStyle = 'words';
      const ownTitle = s.title && !/^chapter\s+\w+$/i.test(s.title) ? s.title : '';
      out.label = mode === 'title' && ownTitle ? '' : chapterLabel(ch, numStyle, meta.chapterWord || 'Chapter');
      out.displayTitle = mode === 'number' ? '' : ownTitle;
      out.tocTitle = [out.label, out.displayTitle].filter(Boolean).join(': ') || s.title || `${meta.chapterWord || 'Chapter'} ${ch}`;
    } else {
      out.displayTitle = s.title || def.label || s.type;
      out.tocTitle = out.displayTitle;
    }
    return out;
  });
}

export function defaultBook(meta = {}) {
  const year = new Date().getFullYear();
  const mk = (type, extra = {}) => ({ id: newId(type.slice(0, 3)), type, enabled: true, ...extra });
  const chapter = mk('chapter', { title: 'The Beginning' });
  return {
    format: 'lutefisk/1',
    title: meta.title || 'Untitled Book',
    subtitle: meta.subtitle || '',
    author: meta.author || '',
    publisher: '',
    language: 'en',
    year,
    isbn: '',
    description: '',
    keywords: [],
    template: 'classic',
    dropCaps: true,
    firstLine: 'normal',
    chapterHeading: '',
    goals: {},
    headingCase: 'template',
    chapterWord: 'Chapter',
    notesPlacement: 'chapter',
    citationStyle: 'apa',
    cover: '',
    backCover: '',
    authorPhoto: '',
    print: { trim: '6x9', dropCaps: true, startRecto: true, romanFrontMatter: true, runningHeads: true, fontSize: 11, includeCover: false },
    preview: { device: 'kindle-paperwhite', fontSize: 100, font: '', theme: 'light' },
    index: { terms: [] },
    bibliography: [],
    sections: [
      mk('title-page'),
      mk('copyright'),
      mk('toc', { title: 'Contents' }),
      chapter,
    ],
  };
}

/**
 * Make sure every optional single section exists (disabled if newly added)
 * and that sections are grouped front → body → back.
 */
export function ensureSections(book) {
  const list = [...(book.sections || [])];
  for (const type of TYPE_ORDER) {
    if (SECTION_TYPES[type].multi || list.some((s) => s.type === type)) continue;
    const def = SECTION_TYPES[type];
    list.push({ id: newId(type.slice(0, 3)), type, enabled: false, ...(def.generated ? { title: defaultTitle(type) } : {}) });
  }
  const rank = (s) => {
    const g = GROUPS.findIndex((x) => x.id === SECTION_TYPES[s.type]?.group);
    if (s.type === 'chapter' || s.type === 'appendix') return g * 1000 + TYPE_ORDER.indexOf(s.type) * 10;
    return g * 1000 + TYPE_ORDER.indexOf(s.type) * 10;
  };
  // stable sort keeps chapter order
  book.sections = list.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  return book;
}
function defaultTitle(type) {
  return { toc: 'Contents', endnotes: 'Notes', bibliography: 'Bibliography', index: 'Index' }[type] || '';
}

/** Relative path of a section's markdown file. */
export function sectionFile(s) {
  return `chapters/${s.id}.md`;
}
