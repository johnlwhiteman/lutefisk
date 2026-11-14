// Bibliography: metadata extraction from web pages and APA 7 / MLA 9 /
// Chicago 17 (notes-bibliography) reference formatting.
//
// Entry shape:
// { id, kind: 'webpage'|'article'|'journal'|'book', authors: [{family, given} | {literal}],
//   title, container, publisher, date: 'YYYY[-MM[-DD]]', accessed: 'YYYY-MM-DD',
//   url, doi, volume, issue, pages, edition }

export const STYLES = [
  { id: 'apa', label: 'APA (7th ed.)' },
  { id: 'mla', label: 'MLA (9th ed.)' },
  { id: 'chicago', label: 'Chicago (17th ed.)' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const endPunct = (s) => (/[.?!]$/.test(s) ? s : s + '.');

function parseDate(d) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(String(d || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: m[2] ? Number(m[2]) : null, d: m[3] ? Number(m[3]) : null };
}

/** Split "Jane Q. Doe" → {given:'Jane Q.', family:'Doe'}; keeps organizations literal. */
export function parseName(raw) {
  const s = clean(raw).replace(/^by\s+/i, '');
  if (!s) return null;
  if (/,/.test(s) && s.split(',').length === 2) {
    const [family, given] = s.split(',').map(clean);
    return { family, given };
  }
  const parts = s.split(' ');
  if (parts.length === 1 || /\b(inc|llc|ltd|university|association|institute|agency|department|news|staff|team|editors?)\b/i.test(s)) return { literal: s };
  const particles = new Set(['van', 'von', 'de', 'da', 'del', 'der', 'di', 'la', 'le', 'du', 'st.']);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return { given: parts.slice(0, i).join(' '), family: parts.slice(i).join(' ') };
}

const initials = (given) => clean(given).split(/[\s]+/).filter(Boolean)
  .map((g) => g.split('-').map((p) => (p[0] ? p[0].toUpperCase() + '.' : '')).join('-')).join(' ');

function apaAuthors(list) {
  const names = list.map((a) => (a.literal ? a.literal : `${a.family}, ${initials(a.given || '')}`.replace(/, $/, '')));
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= 20) return names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
  return names.slice(0, 19).join(', ') + ', . . . ' + names[names.length - 1];
}
function mlaAuthors(list) {
  const full = (a, inverted) => (a.literal ? a.literal : inverted ? `${a.family}, ${a.given}` : `${a.given} ${a.family}`);
  if (!list.length) return '';
  if (list.length === 1) return full(list[0], true);
  if (list.length === 2) return `${full(list[0], true)}, and ${full(list[1], false)}`;
  return `${full(list[0], true)}, et al`;
}
function chicagoAuthors(list) {
  const full = (a, inverted) => (a.literal ? a.literal : inverted ? `${a.family}, ${a.given}` : `${a.given} ${a.family}`);
  if (!list.length) return '';
  if (list.length === 1) return full(list[0], true);
  if (list.length === 2) return `${full(list[0], true)}, and ${full(list[1])}`;
  if (list.length <= 10) return [full(list[0], true), ...list.slice(1, -1).map((a) => full(a))].join(', ') + ', and ' + full(list[list.length - 1]);
  return list.slice(0, 7).map((a, i) => full(a, i === 0)).join(', ') + ', et al';
}

const sentenceCase = (s) => s; // titles are kept as written; authors can edit.
const doiUrl = (doi) => (doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : '');
const link = (u) => (u ? `<span class="url">${esc(u)}</span>` : '');

export function formatEntry(e, style = 'apa') {
  const authors = (e.authors || []).filter((a) => a && (a.literal || a.family));
  const d = parseDate(e.date);
  const acc = parseDate(e.accessed);
  const title = clean(e.title) || 'Untitled';
  const cont = clean(e.container);
  const pub = clean(e.publisher);
  const url = e.doi ? doiUrl(e.doi) : clean(e.url);
  const isPart = e.kind === 'webpage' || e.kind === 'article' || e.kind === 'journal';

  if (style === 'mla') {
    const date = d ? [d.d, d.m ? MLA_MONTHS[d.m - 1] : '', d.y].filter(Boolean).join(' ') : '';
    const accessed = acc && e.kind !== 'book' && !e.doi ? ` Accessed ${[acc.d, acc.m ? MLA_MONTHS[acc.m - 1] : '', acc.y].filter(Boolean).join(' ')}.` : '';
    const a = authors.length ? esc(endPunct(mlaAuthors(authors))) + ' ' : '';
    if (!isPart) {
      return `${a}<i>${esc(title)}</i>. ${[pub, d?.y].filter(Boolean).map(esc).join(', ')}${pub || d ? '.' : ''}`.trim();
    }
    const vol = [e.volume ? `vol. ${e.volume}` : '', e.issue ? `no. ${e.issue}` : ''].filter(Boolean).join(', ');
    const parts = [cont ? `<i>${esc(cont)}</i>` : '', vol && esc(vol), pub && pub !== cont ? esc(pub) : '', esc(date), e.pages ? `pp. ${esc(e.pages)}` : '', link(url.replace(/^https?:\/\//, ''))].filter(Boolean);
    return `${a}“${esc(endPunct(title))}” ${parts.join(', ')}.${accessed}`;
  }

  if (style === 'chicago') {
    const a = authors.length ? esc(endPunct(chicagoAuthors(authors))) + ' ' : '';
    const date = d ? (d.m ? `${MONTHS[d.m - 1]} ${d.d ? d.d + ', ' : ''}${d.y}` : String(d.y)) : '';
    if (!isPart) return `${a}<i>${esc(title)}</i>. ${[pub, d?.y].filter(Boolean).map(esc).join(', ')}${pub || d ? '.' : ''}${url ? ' ' + link(url) + '.' : ''}`;
    if (e.kind === 'journal') {
      const vol = [e.volume, e.issue ? `no. ${e.issue}` : ''].filter(Boolean).join(', ');
      return `${a}“${esc(endPunct(title))}” <i>${esc(cont)}</i> ${esc(vol)}${d ? ` (${d.y})` : ''}${e.pages ? `: ${esc(e.pages)}` : ''}.${url ? ' ' + link(url) + '.' : ''}`;
    }
    const accessed = !d && acc ? `Accessed ${MONTHS[acc.m - 1]} ${acc.d}, ${acc.y}. ` : '';
    return `${a}“${esc(endPunct(title))}” ${[cont && `<i>${esc(cont)}</i>`, pub && pub !== cont ? esc(pub) : '', esc(date)].filter(Boolean).join(', ')}${cont || date ? '. ' : ''}${accessed}${link(url)}${url ? '.' : ''}`;
  }

  // APA 7
  let date = 'n.d.';
  if (d) date = e.kind === 'journal' || e.kind === 'book' || !d.m ? String(d.y) : `${d.y}, ${MONTHS[d.m - 1]}${d.d ? ' ' + d.d : ''}`;
  const who = authors.length ? esc(endPunct(apaAuthors(authors))) : '';
  if (e.kind === 'book') {
    return `${who ? who + ' ' : ''}(${esc(date)}). <i>${esc(endPunct(sentenceCase(title)))}</i>${e.edition ? ` (${esc(e.edition)} ed.)` : ''} ${pub ? esc(endPunct(pub)) : ''}${url ? ' ' + link(url) : ''}`.trim();
  }
  if (e.kind === 'journal') {
    const vol = e.volume ? `, <i>${esc(e.volume)}</i>${e.issue ? `(${esc(e.issue)})` : ''}` : '';
    return `${who ? who + ' ' : ''}(${esc(date)}). ${esc(endPunct(title))} <i>${esc(cont)}</i>${vol}${e.pages ? `, ${esc(e.pages)}` : ''}.${url ? ' ' + link(url) : ''}`;
  }
  // webpage / article: if no author, title moves to author position.
  const site = cont && !authors.some((a) => a.literal === cont) ? ` ${esc(endPunct(cont))}` : '';
  const retrieved = !d && acc ? ` Retrieved ${MONTHS[acc.m - 1]} ${acc.d}, ${acc.y}, from` : '';
  if (!who) return `<i>${esc(title)}</i>. (${esc(date)}).${site}${retrieved}${url ? ' ' + link(url) : ''}`;
  return `${who} (${esc(date)}). <i>${esc(title)}</i>.${site}${retrieved}${url ? ' ' + link(url) : ''}`;
}

/** Short author part for in-text citations. */
function citeAuthors(list, style) {
  const n = (a) => a.literal || a.family;
  const and = style === 'apa' ? '&' : 'and';
  if (!list.length) return '';
  if (list.length === 1) return n(list[0]);
  if (list.length === 2) return `${n(list[0])} ${and} ${n(list[1])}`;
  if (style === 'chicago' && list.length === 3) return `${n(list[0])}, ${n(list[1])}, and ${n(list[2])}`;
  return `${n(list[0])} et al.`;
}

/**
 * In-text (parenthetical) citation, e.g. APA "(Doe & Smith, 2024, p. 12)",
 * MLA "(Doe and Smith 12)", Chicago author-date "(Doe and Smith 2024, 12)".
 * Returns plain text (no HTML).
 */
export function formatInText(e, style = 'apa', locator = '') {
  if (!e) return '(missing source)';
  const authors = (e.authors || []).filter((a) => a && (a.literal || a.family));
  const d = parseDate(e.date);
  const year = d ? String(d.y) : 'n.d.';
  const shortTitle = (clean(e.title) || 'Untitled').split(/[:.?!]/)[0].split(' ').slice(0, 4).join(' ');
  const quoted = e.kind === 'book' ? shortTitle : `“${shortTitle}”`;
  const who = citeAuthors(authors, style) || quoted;
  let loc = clean(locator);
  const bare = loc.replace(/^(pp?\.|pages?|page)\s*/i, '');
  if (style === 'mla') return `(${[who, bare].filter(Boolean).join(' ')})`;
  if (style === 'chicago') return `(${who} ${year}${bare ? `, ${bare}` : ''})`;
  if (loc && /^\d/.test(loc)) loc = `${/[-–,]/.test(loc) ? 'pp.' : 'p.'} ${loc}`;
  return `(${who}, ${year}${loc ? `, ${loc}` : ''})`;
}

export function sortKey(e) {
  const a = (e.authors || [])[0];
  return ((a ? a.family || a.literal : '') || e.title || '').toLowerCase().replace(/^(the|a|an)\s+/, '');
}

export function formatBibliography(entries, style = 'apa') {
  return [...(entries || [])].sort((x, y) => sortKey(x).localeCompare(sortKey(y))).map((e) => formatEntry(e, style));
}

/* ----------------------------- Metadata extraction ----------------------------- */

/** Extract a bibliography entry from a parsed HTML Document (inert DOMParser doc). */
export function extractFromDocument(doc, url, today = new Date().toISOString().slice(0, 10)) {
  const metas = {};
  for (const m of doc.querySelectorAll('meta[content]')) {
    const k = (m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('itemprop') || '').toLowerCase();
    if (!k) continue;
    (metas[k] ||= []).push(clean(m.getAttribute('content')));
  }
  const first = (...keys) => { for (const k of keys) if (metas[k]?.[0]) return metas[k][0]; return ''; };
  const all = (...keys) => keys.flatMap((k) => metas[k] || []);

  // JSON-LD (schema.org Article / ScholarlyArticle / Book / WebPage)
  let ld = {};
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const items = [].concat(data['@graph'] || data).flat();
      const hit = items.find((x) => x && /Article|Posting|Book|Report|WebPage|Blog/.test([].concat(x['@type']).join(' ')));
      if (hit) { ld = hit; break; }
    } catch { /* ignore malformed JSON-LD */ }
  }
  const ldNames = (v) => [].concat(v || []).map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean);

  let authorNames = all('citation_author', 'dc.creator', 'dcterms.creator');
  if (!authorNames.length) authorNames = ldNames(ld.author);
  if (!authorNames.length) authorNames = all('author', 'article:author', 'parsely-author', 'sailthru.author').filter((a) => !/^https?:/.test(a));
  if (!authorNames.length) {
    const byline = doc.querySelector('[rel="author"], .byline [itemprop="name"], .author-name, .byline');
    if (byline) authorNames = [clean(byline.textContent)].filter((t) => t && t.length < 80);
  }
  const authors = [...new Set(authorNames.flatMap((n) => (n.includes(';') ? n.split(';') : /\band\b/.test(n) && !n.includes(',') ? n.split(/\s+and\s+/) : [n])))]
    .map(parseName).filter(Boolean).slice(0, 25);

  const title = first('citation_title', 'dc.title', 'og:title', 'twitter:title') || clean(ld.headline || ld.name) || clean(doc.querySelector('title')?.textContent);
  const journal = first('citation_journal_title', 'prism.publicationname');
  const site = first('og:site_name', 'application-name') || clean(ld.publisher?.name) || hostLabel(url);
  const date = normDate(first('citation_publication_date', 'citation_date', 'citation_online_date', 'dc.date', 'article:published_time', 'date', 'pubdate', 'parsely-pub-date', 'sailthru.date')
    || ld.datePublished || doc.querySelector('time[datetime]')?.getAttribute('datetime') || '');
  const doi = first('citation_doi', 'dc.identifier', 'prism.doi').replace(/^doi:/i, '');
  const isBook = /Book/.test([].concat(ld['@type']).join(' ')) || !!first('books:isbn', 'citation_isbn');

  const entry = {
    kind: journal ? 'journal' : isBook ? 'book' : authors.length || first('article:published_time') ? 'article' : 'webpage',
    authors,
    title: stripSiteSuffix(title, site),
    container: journal || site,
    publisher: first('citation_publisher', 'dc.publisher') || clean(ld.publisher?.name) || '',
    date,
    accessed: today,
    url,
    doi: /^10\.\d{4,}\//.test(doi) ? doi : '',
    volume: first('citation_volume', 'prism.volume'),
    issue: first('citation_issue', 'prism.number'),
    pages: [first('citation_firstpage'), first('citation_lastpage')].filter(Boolean).join('–'),
  };
  if (entry.publisher === entry.container) entry.publisher = '';
  return entry;
}

/** Map a CSL-JSON record (DOI content negotiation) to an entry. */
export function fromCsl(csl, url, today = new Date().toISOString().slice(0, 10)) {
  const parts = csl.issued?.['date-parts']?.[0] || csl.published?.['date-parts']?.[0] || [];
  const type = String(csl.type || '');
  return {
    kind: /journal|article-journal/.test(type) ? 'journal' : /book/.test(type) && !/chapter/.test(type) ? 'book' : 'article',
    authors: (csl.author || []).map((a) => (a.literal ? { literal: a.literal } : { family: a.family || '', given: a.given || '' })),
    title: clean([].concat(csl.title || '')[0]),
    container: clean([].concat(csl['container-title'] || '')[0]),
    publisher: clean(csl.publisher),
    date: parts.map((p, i) => (i ? String(p).padStart(2, '0') : String(p))).join('-'),
    accessed: today,
    url: csl.URL || url,
    doi: csl.DOI || '',
    volume: csl.volume ? String(csl.volume) : '',
    issue: csl.issue ? String(csl.issue) : '',
    pages: csl.page ? String(csl.page).replace('-', '–') : '',
  };
}

function normDate(s) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(s) || /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const y = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(s);
  if (!y) return '';
  const t = Date.parse(s);
  return Number.isNaN(t) ? y[1] : new Date(t).toISOString().slice(0, 10);
}
function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
function stripSiteSuffix(title, site) {
  if (!site) return title;
  const re = new RegExp(`\\s*[|\\-–—:]\\s*${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  return title.replace(re, '');
}

/** Detect a DOI in a URL or string. */
export function doiFrom(s) {
  const m = /(10\.\d{4,9}\/[^\s"<>]+)/.exec(decodeURIComponent(String(s || '')));
  return m ? m[1].replace(/[.,;]$/, '') : '';
}
