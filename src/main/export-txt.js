// Plain-text export: the book as readable UTF-8 text. Headings are set off by
// blank lines, scene breaks become "* * *", footnotes follow each section, and
// equations are written as their LaTeX source.
import { renderBook } from '../shared/bookhtml.js';
import { setCustomTemplates } from '../shared/templates.js';
import { parseHtml, hasClass } from './html-walk.js';

const BLOCK = new Set(['p', 'div', 'section', 'aside', 'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'pre', 'figure', 'figcaption', 'header', 'footer', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr']);
const WIDTH = 72;

/** Wrap a paragraph to WIDTH columns, with an optional prefix on the first line and indent on the rest. */
function wrap(text, first = '', rest = first.replace(/./gu, ' ')) {
  const words = text.replace(/[ \t]+/g, ' ').trim().split(' ');
  const lines = [];
  let line = first;
  let empty = true;
  for (const w of words) {
    if (!w) continue;
    if (!empty && [...line].length + 1 + [...w].length > WIDTH) { lines.push(line); line = rest + w; }
    else line += (empty ? '' : ' ') + w;
    empty = false;
  }
  if (!empty || first) lines.push(line);
  return lines.join('\n');
}

function inlineText(nodes) {
  let out = '';
  for (const n of nodes || []) {
    if (n.text != null) { out += n.text; continue; }
    const t = n.tag;
    if (t === 'br') { out += '\n'; continue; }
    if (t === 'img') {
      const src = n.attrs.src || '';
      if (src.startsWith('tex:')) { const tex = decodeURIComponent(src.slice(4)); out += hasClass(n, 'bk-math-img') && /^d:/.test(tex) ? `\n\n    ${tex.slice(2)}\n\n` : `$${tex.replace(/^[di]:/, '')}$`; continue; }
      out += n.attrs.alt ? `[Image: ${n.attrs.alt}]` : '[Image]';
      continue;
    }
    if (t === 'sup' && hasClass(n, 'fnref')) { out += `[${inlineText(n.children).trim()}]`; continue; }
    if (t === 'a' && n.attrs.href && /^(https?:|mailto:)/i.test(n.attrs.href)) {
      const label = inlineText(n.children);
      out += label.trim() && label.trim() !== n.attrs.href ? `${label} <${n.attrs.href}>` : n.attrs.href;
      continue;
    }
    if (t === 'u' || t === 'em' || t === 'i') { out += inlineText(n.children); continue; }
    out += inlineText(n.children);
  }
  return out;
}

function blocks(nodes, out, ctx = { quote: 0, list: [] }) {
  const push = (s) => { if (s.trim()) out.push(s.replace(/\s+$/g, '')); };
  const pre = () => '    '.repeat(ctx.quote);
  for (const n of nodes || []) {
    if (n.text != null) { if (n.text.trim()) push(wrap(n.text, pre())); continue; }
    const t = n.tag;
    if (hasClass(n, 'bk-scene')) { out.push(`${' '.repeat(Math.floor((WIDTH - 5) / 2))}* * *`); continue; }
    if (hasClass(n, 'bk-pagebreak')) { out.push(''); continue; }
    if (t === 'aside' && hasClass(n, 'bk-notes')) {
      const items = n.children.flatMap((c) => (c.tag === 'ol' ? c.children.filter((li) => li.tag === 'li') : []));
      if (items.length) {
        out.push('-'.repeat(12));
        items.forEach((li, i) => push(wrap(inlineText(li.children).replace(/\s*↩\s*$/, ''), `[${li.attrs.value || i + 1}] `)));
      }
      continue;
    }
    if (/^h[1-6]$/.test(t)) {
      const text = inlineText(n.children).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      out.push('');
      out.push(t === 'h1' || t === 'h2' ? `${text.toUpperCase()}\n${'='.repeat(Math.min(WIDTH, [...text].length))}` : text);
      continue;
    }
    if (t === 'header') {
      const get = (cls) => { const c = (n.children || []).find((x) => hasClass(x, cls)); return c ? inlineText(c.children).replace(/\s+/g, ' ').trim() : ''; };
      const lines = [get('bk-num'), get('bk-title')].filter(Boolean).map((l) => l.toUpperCase());
      const sub = get('bk-subtitle');
      if (lines.length || sub) {
        out.push('', `${[...lines, ...(sub ? [sub] : [])].join('\n')}\n${'='.repeat(Math.min(WIDTH, Math.max(3, ...[...lines, sub].map((l) => [...l].length))))}`);
      }
      continue;
    }
    if (t === 'blockquote') { blocks(n.children, out, { ...ctx, quote: ctx.quote + 1 }); continue; }
    if (t === 'pre') { out.push(inlineText(n.children).split('\n').map((l) => `${pre()}    ${l}`).join('\n')); continue; }
    if (t === 'ul' || t === 'ol') {
      let i = Number(n.attrs.start) || 1;
      const items = [];
      for (const li of n.children.filter((c) => c.tag === 'li')) {
        const mark = t === 'ul' ? `${li.attrs['data-bullet'] || '•'} ` : `${i++}. `;
        const inner = [];
        const inlineKids = li.children.filter((c) => c.text != null || !BLOCK.has(c.tag) || c.tag === 'p');
        const text = inlineKids.map((c) => (c.tag === 'p' ? inlineText(c.children) : inlineText([c]))).join(' ');
        items.push(wrap(text, `${pre()}${'  '.repeat(ctx.list.length)}${mark}`));
        const nested = li.children.filter((c) => c.tag === 'ul' || c.tag === 'ol');
        if (nested.length) blocks(nested, inner, { ...ctx, list: [...ctx.list, t] });
        items.push(...inner);
      }
      if (items.length) out.push(items.join('\n'));
      continue;
    }
    if (t === 'table') {
      const rows = [];
      const walk = (x) => { for (const c of x.children || []) { if (c.tag === 'tr') rows.push(c.children.filter((d) => d.tag === 'td' || d.tag === 'th').map((d) => inlineText(d.children).replace(/\s+/g, ' ').trim())); else walk(c); } };
      walk(n);
      if (!rows.length) continue;
      const cols = Math.max(...rows.map((r) => r.length));
      const w = Array.from({ length: cols }, (_, i) => Math.max(3, ...rows.map((r) => [...(r[i] || '')].length)));
      const line = (r) => `${pre()}| ${w.map((wi, i) => (r[i] || '').padEnd(wi)).join(' | ')} |`;
      out.push([line(rows[0]), `${pre()}|${w.map((wi) => '-'.repeat(wi + 2)).join('|')}|`, ...rows.slice(1).map(line)].join('\n'));
      continue;
    }
    if (t === 'p' || t === 'figcaption') {
      const text = inlineText(n.children);
      if (!text.trim()) continue;
      const verse = text.includes('\n');
      if (verse) push(text.split('\n').map((l) => `${pre()}${l.trim()}`).join('\n'));
      else push(wrap(text, pre()));
      continue;
    }
    if (n.children?.length) {
      // A container (section, div, figure…): if it only holds inline content, it's a paragraph.
      const hasBlock = n.children.some((c) => c.tag && BLOCK.has(c.tag));
      if (hasBlock) blocks(n.children, out, ctx);
      else { const text = inlineText(n.children); if (text.trim()) push(wrap(text, pre())); }
    }
  }
}

export function buildText({ book, contents }) {
  setCustomTemplates(book.customTemplates);
  const rendered = renderBook({
    book, contents, xhtml: false,
    assetUrl: (src) => `asset:${src}`,
    mathImage: (tex, display) => ({ src: `tex:${encodeURIComponent(`${display ? 'd' : 'i'}:${tex}`)}`, h: 1, depth: 0, scale: 1 }),
  });
  const parts = [];
  for (const r of rendered) {
    if (r.sec.type === 'toc' || r.sec.type === 'index') continue;
    const out = [];
    blocks(parseHtml(r.html).children, out);
    const text = out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text) parts.push(text);
  }
  return `${parts.join('\n\n\n')}\n`;
}
