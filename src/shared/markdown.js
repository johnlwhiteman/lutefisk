// Markdown dialect used by Lutefisk chapters.
//
//  * CommonMark + typographic quotes/dashes (raw HTML is disabled for safety)
//  * ~~strikethrough~~
//  * Footnotes: text[^1] … and a definition line `[^1]: note text`
//  * Image attributes: ![alt](assets/pic.jpg){width=60% align=center}
//  * Scene breaks: a thematic break (***) renders as the template's ornament
import { mathRule, renderMathToken, collectMath } from './math.js';
import { highlightCode, normalizeLang, parseCodeInfo, numberLines } from './code.js';
import MarkdownIt from 'markdown-it';

const FN_DEF = /^\[\^([^\]\s]+)\]:[ \t]?(.*)$/;

/** Split footnote definitions out of a markdown string. */
export function extractFootnotes(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const body = [];
  const defs = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = FN_DEF.exec(lines[i]);
    if (!m) { body.push(lines[i]); continue; }
    let text = m[2];
    while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
    defs.set(m[1], text.trim());
  }
  return { body: body.join('\n'), defs };
}

function citeRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x40 /* @ */) return false;
  const m = /^\[@([A-Za-z0-9_-]{1,64})(?:,\s*([^\]\n]{1,60}))?\]/.exec(src.slice(start));
  if (!m) return false;
  if (!silent) {
    const tok = state.push('cite', '', 0);
    tok.meta = { ref: m[1], locator: (m[2] || '').trim() };
  }
  state.pos = start + m[0].length;
  return true;
}

/**
 * Comments use CriticMarkup: {==commented text==}{>>#c-id<<}. The comment body
 * lives in lutefisk.yaml under comments[id]; the manuscript only marks the range.
 */
export const COMMENT_RE = /\{==([\s\S]*?)==\}\{>>#(c-[A-Za-z0-9_-]{1,40})<<\}/g;
export const stripComments = (src) => String(src || '').replace(COMMENT_RE, '$1');
function commentRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x7b /* { */ || src.slice(start, start + 3) !== '{==') return false;
  const m = /==\}\{>>#(c-[A-Za-z0-9_-]{1,40})<<\}/.exec(src.slice(start + 3, state.posMax));
  if (!m) return false;
  const innerEnd = start + 3 + m.index;
  if (!silent) {
    const oldMax = state.posMax;
    state.push('comment_open', 'span', 1).meta = { id: m[1] };
    state.pos = start + 3;
    state.posMax = innerEnd;
    state.md.inline.tokenize(state);
    state.posMax = oldMax;
    state.push('comment_close', 'span', -1).meta = { id: m[1] };
  }
  state.pos = innerEnd + m[0].length;
  return true;
}

function footnoteRefRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b /* [ */ || src.charCodeAt(start + 1) !== 0x5e /* ^ */) return false;
  const end = src.indexOf(']', start + 2);
  if (end < 0) return false;
  const label = src.slice(start + 2, end);
  if (!label || /\s/.test(label)) return false;
  if (!silent) {
    const tok = state.push('fnref', '', 0);
    tok.meta = { label };
  }
  state.pos = end + 1;
  return true;
}

const ATTR_RE = /^\{([^}\n]*)\}/;
export function parseAttrString(s) {
  const out = {};
  for (const part of s.trim().split(/\s+/)) {
    const m = /^([a-z]+)=("?)([^"]*)\2$/i.exec(part);
    if (m) out[m[1].toLowerCase()] = m[3];
    else if (/^[a-z]+$/i.test(part)) out[part.toLowerCase()] = 'true';
  }
  return out;
}
/** Text-wrapping styles (as in Word/Pages). */
export const WRAPS = ['inline', 'square', 'tight', 'through', 'topbottom', 'behind', 'front'];

export function sanitizeImageAttrs(a) {
  const out = {};
  const w = /^(\d{1,3})%$/.exec(a.width || '');
  if (w) out.width = Math.min(100, Math.max(5, Number(w[1])));
  if (['left', 'center', 'right', 'full'].includes(a.align)) out.align = a.align;
  if (a.wrap === 'true') out.wrap = 'square'; // legacy flag
  else if (WRAPS.includes(a.wrap)) out.wrap = a.wrap;
  if (/^assets\/[A-Za-z0-9._-]+\.json$/.test(a.drawing || '')) out.drawing = a.drawing;
  return out;
}

/** Core rule that attaches `{width=… align=…}` blocks to the preceding image. */
function imageAttrsRule(state) {
  for (const blk of state.tokens) {
    if (blk.type !== 'inline' || !blk.children) continue;
    const ch = blk.children;
    for (let i = 0; i < ch.length - 1; i++) {
      if (ch[i].type !== 'image' || ch[i + 1].type !== 'text') continue;
      const m = ATTR_RE.exec(ch[i + 1].content);
      if (!m) continue;
      ch[i].meta = { ...(ch[i].meta || {}), ...sanitizeImageAttrs(parseAttrString(m[1])) };
      ch[i + 1].content = ch[i + 1].content.slice(m[0].length);
    }
  }
}

/** A line holding only `\newpage` (as in Pandoc and LaTeX) is a page break. */
export const PAGE_BREAK = '\\newpage';
function pageBreakRule(state, startLine, _endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.slice(pos, max).trim() !== '\\newpage') return false;
  if (silent) return true;
  state.line = startLine + 1;
  const t = state.push('pagebreak', '', 0);
  t.map = [startLine, state.line];
  t.block = true;
  return true;
}

/**
 * Aligned blocks, written as Pandoc-style fenced divs:
 *   ::: center
 *   Text to center.
 *   :::
 */
export const ALIGNS = ['left', 'center', 'right', 'justify'];
/** Block styles written the same way: ::: verse (poetry: every line kept), ::: hanging (hanging indent) and ::: attribution (the source under a quote or epigraph, set right). */
export const BLOCK_STYLES = ['verse', 'hanging', 'attribution'];
function alignRule(state, startLine, endLine, silent) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const first = state.src.slice(start, state.eMarks[startLine]).trim();
  const m = /^:::\s*\{?\.?(left|center|centre|right|justify|verse|hanging|attribution)\}?$/.exec(first);
  if (!m || state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (silent) return true;
  let line = startLine + 1;
  let depth = 1;
  for (; line < endLine; line++) {
    const t = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim();
    if (/^:::\s*\S/.test(t)) depth++;
    else if (t === ':::' && --depth === 0) break;
  }
  const align = m[1] === 'centre' ? 'center' : m[1];
  const open = state.push('align_open', 'div', 1);
  open.attrSet('class', `bk-align bk-align-${align}`);
  open.meta = { align };
  open.map = [startLine, line];
  open.block = true;
  const oldParent = state.parentType, oldLineMax = state.lineMax;
  state.parentType = 'align';
  state.lineMax = line;
  state.md.block.tokenize(state, startLine + 1, line);
  state.parentType = oldParent;
  state.lineMax = oldLineMax;
  const close = state.push('align_close', 'div', -1);
  close.block = true;
  state.line = Math.min(line + 1, endLine);
  return true;
}

/**
 * Lists with a bullet of the author's choosing:
 *   ::: bullets ★
 *   - First
 *   - Second
 *   :::
 */
const BULLET_RE = /^:::\s*bullets\s+(\S{1,3})\s*$/u;
/** A bullet must be 1–3 visible characters, and nothing that could break out of HTML or CSS. */
export function cleanBullet(v) {
  const b = String(v ?? '').trim();
  return /^[^\s<>&"'`\\{}:;]{1,3}$/u.test(b) && [...b].length <= 3 ? b : '';
}
function bulletsRule(state, startLine, endLine, silent) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const m = BULLET_RE.exec(state.src.slice(start, state.eMarks[startLine]).trim());
  if (!m || state.sCount[startLine] - state.blkIndent >= 4) return false;
  const bullet = cleanBullet(m[1]);
  if (!bullet) return false;
  if (silent) return true;
  let line = startLine + 1;
  let depth = 1;
  for (; line < endLine; line++) {
    const t = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim();
    if (/^:::\s*\S/.test(t)) depth++;
    else if (t === ':::' && --depth === 0) break;
  }
  const from = state.tokens.length;
  const oldLineMax = state.lineMax;
  state.lineMax = line;
  state.md.block.tokenize(state, startLine + 1, line);
  state.lineMax = oldLineMax;
  // Mark the list(s) directly inside and their items.
  const toks = state.tokens;
  for (let i = from; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'bullet_list_open' && t.level === toks[from].level) {
      t.attrJoin('class', 'bk-bullets');
      t.meta = { ...(t.meta || {}), bullet };
      for (let j = i + 1; j < toks.length && !(toks[j].type === 'bullet_list_close' && toks[j].level === t.level); j++) {
        if (toks[j].type === 'list_item_open' && toks[j].level === t.level + 1) toks[j].attrSet('data-bullet', bullet);
      }
    }
  }
  state.line = Math.min(line + 1, endLine);
  return true;
}

/**
 * Writer's highlights: ==text== (yellow) or =={green,thin}text==. They're for
 * you while writing, so the published book shows the text without them.
 */
export const HL_COLORS = ['yellow', 'bright', 'green', 'pink', 'blue', 'orange', 'purple'];
export const HL_SIZES = ['thin', 'medium', 'full'];
function highlightRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x3d || src.charCodeAt(start + 1) !== 0x3d) return false;
  let pos = start + 2;
  let color = 'yellow', size = 'full';
  const opt = /^\{([a-z]+)(?:,([a-z]+))?\}/.exec(src.slice(pos, pos + 24));
  if (opt && HL_COLORS.includes(opt[1])) { color = opt[1]; if (HL_SIZES.includes(opt[2])) size = opt[2]; pos += opt[0].length; }
  const end = src.indexOf('==', pos);
  if (end < 0 || end === pos || end > state.posMax) return false;
  if (!silent) {
    const o = state.push('hl_open', 'span', 1);
    o.meta = { color, size };
    const oldMax = state.posMax;
    state.pos = pos; state.posMax = end;
    state.md.inline.tokenize(state);
    state.posMax = oldMax;
    state.push('hl_close', 'span', -1);
  }
  state.pos = end + 2;
  return true;
}

/**
 * Underline ++text++, subscript ~x~ and superscript ^x^ (Pandoc's forms).
 * A single ~ never starts a subscript when it's part of ~~strikethrough~~,
 * and ^[ is left alone.
 */
function delimRule(ch, open, close, { double = false } = {}) {
  const code = ch.charCodeAt(0);
  return (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== code) return false;
    let pos;
    if (double) {
      if (src.charCodeAt(start + 1) !== code) return false;
      pos = start + 2;
    } else {
      if (src.charCodeAt(start + 1) === code || src[start + 1] === '[' || /\s/.test(src[start + 1] || ' ')) return false;
      if (start > 0 && src.charCodeAt(start - 1) === code) return false;
      pos = start + 1;
    }
    const marker = double ? ch + ch : ch;
    let end = pos;
    for (;;) {
      end = src.indexOf(marker, end);
      if (end < 0 || end > state.posMax) return false;
      if (src[end - 1] === '\\') { end += 1; continue; }
      if (!double && src.charCodeAt(end + 1) === code) { end += 2; continue; }
      break;
    }
    if (end === pos || src.slice(pos, end).includes('\n')) return false;
    if (!double && /\s$/.test(src.slice(pos, end))) return false;
    if (!silent) {
      state.push(open, double ? 'u' : open.split('_')[0], 1);
      const oldMax = state.posMax;
      state.pos = pos; state.posMax = end;
      state.md.inline.tokenize(state);
      state.posMax = oldMax;
      state.push(close, double ? 'u' : open.split('_')[0], -1);
    }
    state.pos = end + marker.length;
    return true;
  };
}

/** Only images stored inside the book's own assets folder are allowed. */
export function safeAssetPath(src) {
  const s = String(src || '').replace(/\\/g, '/');
  if (!/^assets\/[A-Za-z0-9._ -]+$/.test(s)) return null;
  if (s.includes('..')) return null;
  return s;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const escapeHtml = esc;

/**
 * Create the markdown-it instance used for preview and export.
 * opts.typographer: smart quotes (true for rendering).
 */
export function createMarkdown({ typographer = true } = {}) {
  const md = new MarkdownIt('commonmark', { html: false, typographer, xhtmlOut: true, breaks: false });
  md.enable(['strikethrough', 'replacements', 'smartquotes', 'table']);
  md.renderer.rules.table_open = () => '<div class="bk-table"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';
  const codeBlock = (code, info, env) => {
    const { lang: raw, lineNumbers, colors, border } = parseCodeInfo(info);
    const lang = normalizeLang(raw);
    const html = highlightCode(code.replace(/\n$/, ''), raw, { enabled: colors && env?.codeHighlight !== false });
    return `<pre class="bk-code${lang ? ` lang-${lang}` : ''}${lineNumbers ? ' linenums' : ''}${border ? ` border-${border}` : ''}"><code>${lineNumbers ? numberLines(html) : html}</code></pre>\n`;
  };
  md.renderer.rules.fence = (tokens, idx, _o, env) => codeBlock(tokens[idx].content, tokens[idx].info, env);
  md.renderer.rules.code_block = (tokens, idx, _o, env) => codeBlock(tokens[idx].content, 'plaintext', env);
  md.block.ruler.before('fence', 'align', alignRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.block.ruler.before('fence', 'bullets', bulletsRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.align_open = (tokens, idx) => `<div class="${tokens[idx].attrGet('class')}">\n`;
  md.renderer.rules.align_close = () => '</div>\n';
  md.inline.ruler.before('emphasis', 'highlight', highlightRule);
  md.inline.ruler.before('emphasis', 'underline', delimRule('+', 'u_open', 'u_close', { double: true }));
  md.inline.ruler.after('strikethrough', 'sub', delimRule('~', 'sub_open', 'sub_close'));
  md.inline.ruler.before('emphasis', 'sup', delimRule('^', 'sup_open', 'sup_close'));
  md.renderer.rules.u_open = () => '<u>';
  md.renderer.rules.u_close = () => '</u>';
  md.renderer.rules.sub_open = () => '<sub>';
  md.renderer.rules.sub_close = () => '</sub>';
  md.renderer.rules.sup_open = () => '<sup>';
  md.renderer.rules.sup_close = () => '</sup>';
  md.renderer.rules.hl_open = () => '';
  md.renderer.rules.hl_close = () => '';
  md.inline.ruler.before('link', 'fnref', footnoteRefRule);
  md.inline.ruler.before('link', 'cite', citeRule);
  md.inline.ruler.before('link', 'comment', commentRule);
  md.inline.ruler.after('escape', 'math', mathRule);
  md.core.ruler.after('inline', 'image_attrs', imageAttrsRule);

  md.renderer.rules.fnref = (tokens, idx, _o, env) => {
    const label = tokens[idx].meta.label;
    const fn = env.footnotes;
    if (!fn) return '';
    let n = fn.order.indexOf(label);
    if (n < 0) { fn.order.push(label); n = fn.order.length - 1; }
    const num = fn.offset + n + 1;
    const id = `${fn.prefix}-${num}`;
    return `<sup class="fnref"><a epub:type="noteref" role="doc-noteref" href="${fn.href}#fn-${id}" id="fnref-${id}">${num}</a></sup>`;
  };
  md.renderer.rules.math = (tokens, idx, _o, env) => renderMathToken(tokens[idx].meta, env);
  md.renderer.rules.comment_open = () => '';
  md.renderer.rules.comment_close = () => '';
  md.renderer.rules.cite = (tokens, idx, _o, env) => {
    const { ref, locator } = tokens[idx].meta;
    const text = env.cite ? env.cite(ref, locator) : `(${ref})`;
    return `<span class="bk-cite">${esc(text)}</span>`;
  };
  md.renderer.rules.image = (tokens, idx, _o, env) => {
    const t = tokens[idx];
    const src = safeAssetPath(t.attrGet('src'));
    if (!src) return '';
    const meta = t.meta || {};
    const alt = esc(t.children ? md.renderer.renderInlineAsText(t.children, {}, env) : t.content);
    const url = env.assetUrl ? env.assetUrl(src) : src;
    const wrap = meta.wrap || 'topbottom';
    const cls = `bk-img a-${meta.align || 'center'} w-${wrap}`;
    const defW = wrap === 'inline' ? 30 : wrap === 'topbottom' ? 0 : 40;
    const w = meta.align === 'full' ? 0 : meta.width || defW;
    const shape = wrap === 'tight' || wrap === 'through' ? `shape-outside:url(&quot;${esc(url)}&quot;);` : '';
    const style = w || shape ? ` style="${w ? `width:${w}%;` : ''}${shape}"` : '';
    const title = t.attrGet('title');
    if (!title) return `<img src="${esc(url)}" alt="${alt}"${style} class="${cls}" />`;
    return `<span class="bk-fig ${cls}"${style}><img src="${esc(url)}" alt="${alt}" /><span class="bk-cap">${esc(title)}</span></span>`;
  };
  md.renderer.rules.hr = () => '<div class="bk-scene" role="separator"><span></span></div>\n';
  md.block.ruler.before('paragraph', 'pagebreak', pageBreakRule, { alt: ['paragraph'] });
  md.renderer.rules.pagebreak = () => '<div class="bk-pagebreak" role="separator" aria-label="Page break"></div>\n';
  // Chapter titles live in the section header, so body headings start at h2.
  md.renderer.rules.heading_open = (tokens, idx) => {
    const lvl = Math.min(6, Math.max(2, Number(tokens[idx].tag.slice(1)) + (tokens[idx].tag === 'h1' ? 1 : 0)));
    tokens[idx].tag = `h${lvl}`;
    const close = tokens.slice(idx).find((t) => t.type === 'heading_close');
    if (close) close.tag = `h${lvl}`;
    // The chapter title is the page's h1, so a level-1 heading in the text is an h2 styled a step larger.
    return tokens[idx].markup === '#' ? `<h${lvl} class="bk-h1">` : `<h${lvl}>`;
  };
  // Never allow unsafe link protocols; mark external links.
  md.validateLink = (url) => /^(https?:|mailto:|#|assets\/)/i.test(url.trim());
  return md;
}

let shared;
function mdi() { return (shared ||= createMarkdown()); }

/**
 * Render a section body. Returns { html, notes } where notes is an array of
 * { num, id, html } in reference order.
 * opts: { assetUrl(src), prefix, href (file holding the notes, '' = same doc), offset }
 */
export function renderMarkdown(src, opts = {}) {
  const { body, defs } = extractFootnotes(src);
  const env = {
    assetUrl: opts.assetUrl,
    cite: opts.cite,
    mathImage: opts.mathImage,
    codeHighlight: opts.codeHighlight,
    footnotes: { order: [], prefix: opts.prefix || 'n', href: opts.href || '', offset: opts.offset || 0 },
  };
  const md = mdi();
  const html = md.render(body, env);
  const notes = env.footnotes.order.map((label, i) => {
    const num = env.footnotes.offset + i + 1;
    return { num, id: `${env.footnotes.prefix}-${num}`, html: md.renderInline(defs.get(label) || '', env) };
  });
  return { html, notes };
}

/** Every distinct equation in the given Markdown sources → Map(key → { tex, display }). */
export function collectBookMath(sources) {
  return collectMath(mdi(), sources.map((s) => extractFootnotes(String(s || '')).body));
}

export function renderInline(src, env = {}) {
  return mdi().renderInline(String(src || ''), env);
}

/** Parse markdown to markdown-it tokens (used by the Word exporter). */
export function parseMarkdown(src) {
  const { body, defs } = extractFootnotes(src);
  const env = {};
  return { tokens: mdi().parse(body, env), defs };
}

/** Plain text for statistics; paragraphs separated by blank lines. */
export function markdownToPlain(src) {
  const { body } = extractFootnotes(src);
  const out = [];
  for (const tok of mdi().parse(body, {})) {
    if (tok.type !== 'inline') continue;
    const text = (tok.children || [])
      .map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : c.type === 'softbreak' ? ' ' : c.type === 'cite' || c.type === 'math' ? '' : ''))
      .join('').trim();
    if (text) out.push(text);
  }
  return out.join('\n\n');
}
