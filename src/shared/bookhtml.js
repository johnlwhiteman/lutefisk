// Turns the book model into HTML fragments used by the live preview, the
// print/PDF paginator and the EPUB exporter.
import { renderMarkdown, renderInline, escapeHtml as esc, markdownToPlain, safeAssetPath } from './markdown.js';
import { numberSections, fillPlaceholders, SECTION_TYPES } from './sections.js';
import { formatBibliography, formatInText } from './citations.js';
import { templateById } from './templates.js';

const DC_TYPES = new Set(['chapter', 'prologue', 'epilogue']);
const NO_HEAD = new Set(['dedication', 'epigraph', 'copyright']);

/**
 * ctx: {
 *   book, contents: {id: markdown}, assetUrl(src) → url,
 *   hrefFor(secId) → link target for TOC, notesHref(secId) (epub),
 *   tocPages: {secId: label}, indexPages: {term: [labels]},
 *   xhtml: boolean
 * }
 */
export function prepare(book) {
  const tpl = templateById(book.template);
  return numberSections(book.sections || [], tpl, book);
}

export function renderSection(sec, ctx) {
  const { book } = ctx;
  const type = sec.type;
  const cls = `bk-sec t-${type}${DC_TYPES.has(type) ? ' dc-ok' : ''}${DC_TYPES.has(type) && sec.dropCap !== false ? ' dc' : ''}${type === 'about-author' ? ' bk-about' : ''}`;
  const open = `<section class="${cls}" id="sec-${esc(sec.id)}" data-sec="${esc(sec.id)}"${ctx.xhtml ? ` epub:type="${epubType(type)}"` : ''}>`;
  let inner = '';
  let notes = [];

  switch (type) {
    case 'title-page': inner = titlePage(book, ctx); break;
    case 'toc': inner = toc(sec, ctx); break;
    case 'bibliography': inner = bibliography(sec, ctx); break;
    case 'index': inner = indexSection(sec, ctx); break;
    case 'endnotes': inner = endnotes(sec, ctx); break;
    default: {
      const src = fillPlaceholders(ctx.contents[sec.id] ?? '', book);
      const r = renderMarkdown(src, {
        assetUrl: ctx.assetUrl, prefix: sec.id, cite: citer(book), mathImage: ctx.mathImage, codeHighlight: book.codeHighlight !== false,
        href: book.notesPlacement === 'book' && ctx.endnotesHref ? ctx.endnotesHref : '',
      });
      notes = r.notes;
      const head = NO_HEAD.has(type) ? '' : header(sec);
      let photo = '';
      if (type === 'about-author' && book.authorPhoto && safeAssetPath(book.authorPhoto)) {
        photo = `<img class="bk-author-photo" src="${esc(ctx.assetUrl ? ctx.assetUrl(book.authorPhoto) : book.authorPhoto)}" alt="${esc(book.author || 'Author photo')}"${ctx.xhtml ? ' /' : ''}>`;
      }
      inner = `${head}<div class="bk-body">${photo}${r.html}</div>`;
      if (notes.length && book.notesPlacement !== 'book') inner += notesBlock(notes, ctx);
    }
  }
  return { html: `${open}${inner}</section>`, notes };
}

/** Formatter for [@ref] citations using the book's bibliography and style. */
export function citer(book) {
  const byId = new Map((book.bibliography || []).map((e) => [e.id, e]));
  return (ref, locator) => formatInText(byId.get(ref), book.citationStyle || 'apa', locator);
}

function epubType(type) {
  return ({
    'title-page': 'titlepage', copyright: 'copyright-page', dedication: 'dedication', epigraph: 'epigraph', toc: 'toc',
    foreword: 'foreword', preface: 'preface', introduction: 'introduction', prologue: 'prologue', chapter: 'chapter',
    epilogue: 'epilogue', acknowledgments: 'acknowledgments', appendix: 'appendix', endnotes: 'endnotes',
    bibliography: 'bibliography', index: 'index', 'about-author': 'backmatter',
  })[type] || 'bodymatter';
}

function header(sec) {
  if (sec.type === 'chapter') {
    return `<header class="bk-head">${sec.label ? `<p class="bk-num">${esc(sec.label)}</p>` : ''}${sec.displayTitle ? `<h1 class="bk-title">${esc(sec.displayTitle)}</h1>` : ''}${sec.subtitle ? `<p class="bk-subtitle">${esc(sec.subtitle)}</p>` : ''}<div class="bk-orn" aria-hidden="true"></div></header>`;
  }
  return `<header class="bk-head"><h1 class="bk-title">${esc(sec.displayTitle)}</h1>${sec.subtitle ? `<p class="bk-subtitle">${esc(sec.subtitle)}</p>` : ''}<div class="bk-orn" aria-hidden="true"></div></header>`;
}

function notesBlock(notes, ctx) {
  const br = ctx.xhtml ? ' epub:type="footnote"' : '';
  return `<aside class="bk-notes"${ctx.xhtml ? ' epub:type="footnotes"' : ''}><h2>Notes</h2><ol>${notes.map((n) =>
    `<li id="fn-${esc(n.id)}" value="${n.num}"${br}><p>${n.html} <a href="#fnref-${esc(n.id)}" class="fnback" role="doc-backlink">↩</a></p></li>`).join('')}</ol></aside>`;
}

function titlePage(book) {
  return `<div class="bk-body bk-tp">
<h1 class="bk-tp-title">${esc(book.title || 'Untitled')}</h1>
${book.subtitle ? `<p class="bk-tp-sub">${esc(book.subtitle)}</p>` : ''}
<div class="bk-tp-orn" aria-hidden="true"></div>
<p class="bk-tp-author">${esc(book.author || '')}</p>
${book.publisher ? `<p class="bk-tp-pub">${esc(book.publisher)}</p>` : ''}
</div>`;
}

function toc(sec, ctx) {
  const all = ctx.sections || prepare(ctx.book);
  const items = all.filter((s) => !['title-page', 'copyright', 'toc', 'dedication', 'epigraph'].includes(s.type)).map((s) => {
    const g = SECTION_TYPES[s.type]?.group || 'body';
    const href = ctx.hrefFor ? ctx.hrefFor(s.id) : `#sec-${s.id}`;
    const pg = ctx.tocPages ? `<span class="lead"></span><span class="pg">${esc(ctx.tocPages[s.id] ?? '')}</span>` : '';
    return `<li class="g-${g}"><a href="${esc(href)}">${esc(s.tocTitle)}</a>${pg}</li>`;
  }).join('');
  return `<h1 class="bk-gen-title">${esc(sec.title || 'Contents')}</h1><div class="bk-body"><ol class="bk-toc">${items}</ol></div>`;
}

function bibliography(sec, ctx) {
  const style = ctx.book.citationStyle || 'apa';
  const heading = sec.title || (style === 'mla' ? 'Works Cited' : style === 'chicago' ? 'Bibliography' : 'References');
  const list = formatBibliography(ctx.book.bibliography, style);
  const body = list.length ? list.map((h) => `<p>${h}</p>`).join('') : '<p><i>No sources yet.</i></p>';
  return `<h1 class="bk-gen-title">${esc(heading)}</h1><div class="bk-body bk-bib">${body}</div>`;
}

function endnotes(sec, ctx) {
  const groups = ctx.allNotes || [];
  const body = groups.filter((g) => g.notes.length).map((g) =>
    `<h3>${esc(g.title)}</h3><ol>${g.notes.map((n) => `<li id="fn-${esc(n.id)}" value="${n.num}"${ctx.xhtml ? ' epub:type="endnote" role="doc-endnote"' : ''}><p>${n.html} <a href="${esc(ctx.hrefFor ? ctx.hrefFor(g.id) : '')}#fnref-${esc(n.id)}" role="doc-backlink">↩</a></p></li>`).join('')}</ol>`).join('');
  return `<h1 class="bk-gen-title">${esc(sec.title || 'Notes')}</h1><div class="bk-body bk-endnotes">${body || '<p><i>Footnotes from your chapters will be collected here.</i></p>'}</div>`;
}

/** Find which sections each index term appears in. */
export function indexLocations(book, contents, sections) {
  const terms = (book.index?.terms || []).map((t) => String(t).trim()).filter(Boolean);
  const out = {};
  const texts = sections.filter((s) => !SECTION_TYPES[s.type]?.generated).map((s) => ({ s, text: markdownToPlain(contents[s.id] || '') }));
  for (const term of terms) {
    const re = termRegex(term);
    out[term] = texts.filter(({ text }) => re.test(text)).map(({ s }) => s);
  }
  return out;
}
export function termRegex(term) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

function indexSection(sec, ctx) {
  const terms = [...(ctx.book.index?.terms || [])].map(String).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  let letter = '';
  let html = '';
  const locs = ctx.indexPages ? null : indexLocations(ctx.book, ctx.contents, ctx.sections || prepare(ctx.book));
  for (const t of terms) {
    const L = t[0].toUpperCase();
    if (L !== letter) { letter = L; html += `<p class="ix-letter">${esc(L)}</p>`; }
    let refs;
    if (ctx.indexPages) refs = esc((ctx.indexPages[t] || []).join(', '));
    else refs = (locs[t] || []).map((s) => `<a href="${esc(ctx.hrefFor ? ctx.hrefFor(s.id) : '#sec-' + s.id)}">${esc(s.type === 'chapter' ? (s.label || s.tocTitle) : s.tocTitle)}</a>`).join(', ');
    html += `<p>${esc(t)}${refs ? ', ' + refs : ''}</p>`;
  }
  return `<h1 class="bk-gen-title">${esc(sec.title || 'Index')}</h1><div class="bk-body bk-index">${html || '<p><i>Add index terms in the Index section settings.</i></p>'}</div>`;
}

/** Render every enabled section; collects notes for an Endnotes section. */
export function renderBook(ctx) {
  const sections = prepare(ctx.book);
  const c = { ...ctx, sections };
  const notesBySec = [];
  const pass1 = sections.map((s) => {
    if (s.type === 'endnotes') return null;
    const r = renderSection(s, c);
    if (r.notes.length) notesBySec.push({ id: s.id, title: s.tocTitle, notes: r.notes });
    return r;
  });
  c.allNotes = ctx.book.notesPlacement === 'book' ? notesBySec : [];
  return sections.map((s, i) => ({ sec: s, ...(pass1[i] || renderSection(s, c)) }));
}

export { renderInline };
