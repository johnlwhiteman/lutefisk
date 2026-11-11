// Rich Text Format exporter. Renders the book to HTML (the same as the EPUB)
// and converts that to RTF 1.9: page size and mirrored margins from the print
// settings, chapter openings, real footnotes, images, tables and equations.
import { renderBook } from '../shared/bookhtml.js';
import { templateById, withCasePrefs, setCustomTemplates } from '../shared/templates.js';
import { fontById } from '../shared/fonts.js';
import { collectBookMath } from '../shared/markdown.js';
import { mathKey } from '../shared/math.js';
import { TRIMS } from '../shared/print.js';
import { readAsset } from './bookstore.js';
import { imageSize } from './export-docx.js';
import { parseHtml, hasClass, textOf } from './html-walk.js';
import { tokenStyle } from '../shared/code.js';

const TW = 1440; // twips per inch

/** Escape text for RTF: control characters, and every non-ASCII character as \uN?. */
export function rtfText(s) {
  let out = '';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\t') out += '\\tab ';
    else if (ch === '\u00a0') out += '\\~';
    else if (ch === '\u00ad') out += '\\-';
    else if (cp < 0x20) continue;
    else if (cp < 0x80) out += ch;
    else if (cp <= 0xffff) out += `\\u${cp > 32767 ? cp - 65536 : cp}?`;
    else { const hi = 0xd800 + ((cp - 0x10000) >> 10), lo = 0xdc00 + ((cp - 0x10000) & 0x3ff); out += `\\u${hi - 65536}?\\u${lo - 65536}?`; }
  }
  return out;
}

export async function buildRtf({ dir, book, contents, rasterize, toPng }) {
  setCustomTemplates(book.customTemplates);
  const tpl = withCasePrefs(templateById(book.template), book);
  const trim = TRIMS[book.print?.trim] || TRIMS['6x9'];
  const pt = Number(book.print?.fontSize) || 11;
  const fs = pt * 2;
  const fam = (id) => fontById(id)?.family || 'Georgia';
  const contentW = (trim.w - trim.inside - trim.outside) * TW;
  const colors = [];
  const colorIndex = (hex) => { let i = colors.indexOf(hex); if (i < 0) { colors.push(hex); i = colors.length - 1; } return i + 2; };

  const equations = collectBookMath(Object.values(contents));
  const mathPngs = rasterize && equations.size ? await rasterize(equations) : new Map();
  const rendered = renderBook({
    book, contents, xhtml: false,
    assetUrl: (src) => `asset:${src}`,
    mathImage: (tex, display) => { const k = mathKey(tex, display); const r = mathPngs.get(k); return r ? { src: `math:${k}`, h: r.h, depth: r.depth, scale: r.scale } : null; },
  });
  const notes = new Map();
  for (const r of rendered) for (const n of r.notes || []) notes.set(n.id, n.html);

  async function picture(src, widthPct, mathPx) {
    let data, size;
    if (src.startsWith('math:')) {
      const r = mathPngs.get(src.slice(5));
      if (!r) return '';
      data = r.png; size = { w: r.w, h: r.h, type: 'png' };
      const k = (pt / 72 * TW) / r.scale; // twips per image pixel at text size
      return `{\\pict\\pngblip\\picw${size.w}\\pich${size.h}\\picwgoal${Math.round(size.w * k)}\\pichgoal${Math.round(size.h * k)} ${Buffer.from(data).toString('hex')}}`;
    }
    try { data = await readAsset(dir, src); } catch { return ''; }
    size = imageSize(data);
    if (!size || size.type === 'gif') { if (!toPng) return ''; data = toPng(data); size = data && imageSize(data); if (!size) return ''; }
    const blip = size.type === 'jpg' ? '\\jpegblip' : '\\pngblip';
    const w = Math.round(contentW * Math.min(1, (widthPct || 100) / 100));
    const h = Math.round(w * (size.h / size.w));
    void mathPx;
    return `{\\pict${blip}\\picw${size.w}\\pich${size.h}\\picwgoal${w}\\pichgoal${h} ${Buffer.from(data).toString('hex')}}`;
  }

  // ---- inline content → RTF
  async function inline(nodes, st = {}) {
    let out = '';
    for (const n of nodes) {
      if (n.text != null) { out += rtfText(st.upper ? n.text.toUpperCase() : n.text); continue; }
      const t = n.tag;
      if (t === 'br') { out += '\\line '; continue; }
      if (t === 'img') {
        const src = n.attrs.src || '';
        const pct = /width:(\d+)%/.exec(n.attrs.style || '')?.[1];
        out += src.startsWith('asset:') ? await picture(src.slice(6), pct ? +pct : 100) : src.startsWith('math:') ? await picture(src) : '';
        continue;
      }
      if (t === 'sup' && hasClass(n, 'fnref')) {
        const id = /#fn-(.+)$/.exec(n.children.find((c) => c.tag === 'a')?.attrs.href || '')?.[1];
        const body = notes.get(id);
        if (body != null) { out += `{\\super\\chftn}{\\footnote\\pard\\plain\\s1\\fs${Math.round(fs * 0.85)} {\\super\\chftn} ${await inline(parseHtml(body).children)}}`; continue; }
      }
      if (t === 'span' && hasClass(n, 'bk-cap')) { out += `\\line {\\i\\fs${Math.round(fs * 0.85)} ${await inline(n.children, st)}}`; continue; }
      if (t === 'a' && /^(https?:|mailto:)/.test(n.attrs.href || '')) {
        out += `{\\field{\\*\\fldinst HYPERLINK "${rtfText(n.attrs.href).replace(/"/g, '')}"}{\\fldrslt{\\ul ${await inline(n.children, st)}}}}`;
        continue;
      }
      const wrap = { em: '\\i', i: '\\i', strong: '\\b', b: '\\b', s: '\\strike', del: '\\strike', u: '\\ul', code: '\\f3', sup: '\\super', sub: '\\sub' }[t];
      const inner = await inline(n.children, st);
      out += wrap ? `{${wrap} ${inner}}` : inner;
    }
    return out;
  }

  const para = (body, { align = 'j', indent = true, before = 0, after = 0, extra = '' } = {}) =>
    `\\pard\\plain\\s0\\q${align}\\sl${Math.round(tpl.lh * 240)}\\slmult1\\fi${indent ? Math.round(tpl.indent * pt * 20) : 0}\\sb${before}\\sa${after}\\f0\\fs${fs}${extra} ${body}\\par\n`;
  const centered = (body, size, extra = '', before = 0, after = 0) => `\\pard\\plain\\qc\\sb${before}\\sa${after}\\keepn\\f1\\fs${Math.round(size * 2)}${extra} ${body}\\par\n`;

  // ---- block content → RTF
  async function blocks(nodes, ctx) {
    let out = '';
    for (const n of nodes) {
      if (n.text != null) { if (n.text.trim()) out += para(rtfText(n.text), { indent: !ctx.first }); continue; }
      const t = n.tag;
      if (t === 'aside' || t === 'nav' && hasClass(n, 'bk-landmarks')) continue;
      if (t === 'header' && hasClass(n, 'bk-head')) {
        const sink = Math.round(tpl.sink * pt * 20 * 0.8);
        let first = true;
        for (const c of n.children) {
          if (c.tag === 'p' && hasClass(c, 'bk-num')) { out += centered(await inline(c.children), pt * Math.min(tpl.numSize, 2.4), tpl.numCase === 'smallcaps' ? '\\scaps' : tpl.numCase === 'upper' ? '\\caps' : '', first ? sink : 0, 120); first = false; }
          else if (c.tag === 'h1') { out += centered(await inline(c.children), pt * Math.min(tpl.titleSize, 2.4) * 1.1, `${tpl.titleItalic ? '\\i' : ''}${tpl.titleWeight >= 600 ? '\\b' : ''}${tpl.titleCase === 'upper' ? '\\caps' : ''}\\outlinelevel0`, first ? sink : 0, 240); first = false; }
          else if (c.tag === 'p' && hasClass(c, 'bk-subtitle')) out += centered(await inline(c.children), pt * 1.15, '\\i', 0, 240);
        }
        if (tpl.ornament) out += centered(rtfText(tpl.ornament), pt * 1.2, '', 0, 360);
        ctx.first = true;
        continue;
      }
      if (t === 'div' && hasClass(n, 'bk-scene')) { out += centered(rtfText(tpl.scene), pt, '', 240, 240); ctx.first = true; continue; }
      if (t === 'p') {
        if (hasClass(n, 'bk-tp-title')) { out += centered(await inline(n.children), pt * 2.6, tpl.titleItalic ? '\\i' : '', 3600, 240); continue; }
        if (hasClass(n, 'bk-tp-sub')) { out += centered(await inline(n.children), pt * 1.3, '\\i', 0, 720); continue; }
        if (hasClass(n, 'bk-tp-author')) { out += centered(await inline(n.children), pt * 1.4, '\\scaps', 720, 0); continue; }
        if (hasClass(n, 'bk-tp-pub')) { out += centered(await inline(n.children), pt * 0.9, '\\caps', 3600, 0); continue; }
        const onlyImg = n.children.length && n.children.every((c) => c.tag === 'img' || (c.text != null && !c.text.trim()) || (c.tag === 'span' && hasClass(c, 'bk-fig')));
        const align = ctx.center ? 'c' : onlyImg ? 'c' : tpl.justify ? 'j' : 'l';
        out += para(await inline(n.children), { align, indent: !ctx.first && !ctx.center && !onlyImg, extra: ctx.quote ? '\\li720\\ri720\\i' : '' });
        ctx.first = false;
        continue;
      }
      if (t === 'h1' && hasClass(n, 'bk-tp-title')) { out += centered(await inline(n.children), pt * 2.6, tpl.titleItalic ? '\\i' : '', 3600, 240); continue; }
      if (t === 'h1' && hasClass(n, 'bk-gen-title')) { out += centered(await inline(n.children), pt * 1.6, '', Math.round(tpl.sink * pt * 20 * 0.8), 360); ctx.first = true; continue; }
      if (t === 'h1' || t === 'h2' || t === 'h3' || t === 'h4') {
        const size = { h1: 1.6, h2: 1.3, h3: 1.15, h4: 1 }[t];
        out += `\\pard\\plain\\ql\\sb240\\sa120\\keepn\\f1\\fs${Math.round(pt * size * 2)}\\b\\outlinelevel${Math.min(3, +t[1] - 1)} ${await inline(n.children)}\\par\n`;
        ctx.first = true;
        continue;
      }
      if (t === 'blockquote') { out += await blocks(n.children, { ...ctx, quote: true, first: true }); ctx.first = true; continue; }
      if (t === 'ul' || t === 'ol') {
        let i = Number(n.attrs.start) || 1;
        for (const li of n.children.filter((c) => c.tag === 'li')) {
          const bullet = t === 'ul' ? '\\u8226?' : `${i++}.`;
          const inner = li.children.some((c) => c.tag === 'p') ? li.children.filter((c) => c.tag === 'p').map((p) => p.children).flat() : li.children;
          out += `\\pard\\plain\\ql\\fi-360\\li720\\sa60\\f0\\fs${fs} ${bullet}\\tab ${await inline(inner)}\\par\n`;
        }
        ctx.first = false;
        continue;
      }
      if (t === 'table' || (t === 'div' && hasClass(n, 'bk-table'))) {
        const table = t === 'table' ? n : n.children.find((c) => c.tag === 'table');
        if (!table) continue;
        const rows = [];
        const walk = (x) => { for (const c of x.children || []) { if (c.tag === 'tr') rows.push(c); else walk(c); } };
        walk(table);
        const cols = Math.max(1, ...rows.map((r) => r.children.filter((c) => c.tag === 'td' || c.tag === 'th').length));
        const cw = Math.floor(contentW / cols);
        const brd = '\\clbrdrt\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10';
        for (const r of rows) {
          const cells = r.children.filter((c) => c.tag === 'td' || c.tag === 'th');
          out += `\\trowd\\trgaph80\\trleft0${r === rows[0] ? '\\trhdr' : ''}`;
          for (let i = 1; i <= cols; i++) out += `${brd}\\cellx${cw * i}`;
          out += '\n';
          for (let i = 0; i < cols; i++) {
            const c = cells[i];
            const al = /text-align:(\w+)/.exec(c?.attrs.style || '')?.[1];
            out += `\\pard\\intbl\\q${al === 'center' ? 'c' : al === 'right' ? 'r' : 'l'}\\f0\\fs${Math.round(fs * 0.9)}${c?.tag === 'th' ? '\\b' : ''} ${c ? await inline(c.children) : ''}\\cell\n`;
          }
          out += '\\row\n';
        }
        out += `\\pard\\sa120\\par\n`;
        ctx.first = true;
        continue;
      }
      if (t === 'pre') {
        let body = '';
        const walkCode = (nodes, cls) => {
          for (const c of nodes) {
            if (c.text != null) {
              const st = tokenStyle(cls);
              const txt = rtfText(c.text).replace(/\\line /g, '\\line\n');
              body += st.color || st.bold || st.italic ? `{${st.color ? `\\cf${colorIndex(st.color)}` : ''}${st.bold ? '\\b' : ''}${st.italic ? '\\i' : ''} ${txt}}` : txt;
            } else walkCode(c.children || [], `${cls} ${c.attrs?.class || ''}`);
          }
        };
        walkCode(n.children, '');
        out += `\\pard\\plain\\ql\\li240\\ri240\\sb160\\sa160\\keep\\cbpat${colorIndex('F6F8FA')}\\brdrl\\brdrs\\brdrw30\\brdrcf${colorIndex('8C959F')}\\f3\\fs${Math.round(fs * 0.82)} ${body}\\par\n`;
        ctx.first = true;
        continue;
      }
      if (t === 'span' && hasClass(n, 'bk-math-d')) { out += para(await inline(n.children), { align: 'c', indent: false, before: 120, after: 120 }); continue; }
      if (t === 'img') { out += para(await inline([n]), { align: 'c', indent: false }); continue; }
      if (t === 'li' || t === 'a' || t === 'span') { out += para(await inline(n.children), { indent: false }); continue; }
      // containers: section, div, header, nav, ol in TOC…
      out += await blocks(n.children, { ...ctx, center: ctx.center || hasClass(n, 'bk-dedication') });
    }
    return out;
  }

  let body = '';
  let firstSec = true;
  for (const r of rendered) {
    if (r.sec.type === 'endnotes') continue; // RTF uses real footnotes instead
    const tree = parseHtml(r.html);
    const center = ['dedication', 'epigraph'].includes(r.sec.type);
    let sec = await blocks(tree.children, { first: true, center });
    if (r.sec.type === 'dedication' || r.sec.type === 'epigraph') sec = `\\pard\\sb3600\\par\n${sec}`;
    body += `${firstSec ? '' : '\\sect\\sbkpage\n'}${sec}`;
    firstSec = false;
  }

  const info = [['title', book.title], ['author', book.author], ['subject', book.subtitle], ['doccomm', book.description], ['keywords', (book.keywords || []).join(', ')]]
    .filter(([, v]) => v).map(([k, v]) => `{\\${k} ${rtfText(v)}}`).join('');
  const header = `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 ${rtfText(fam(tpl.body))};}{\\f1\\froman\\fcharset0 ${rtfText(fam(tpl.head))};}{\\f2\\froman\\fcharset0 Cambria Math;}{\\f3\\fmodern\\fcharset0 Consolas;}}
{\\colortbl;\\red0\\green0\\blue0;${colors.map((c) => `\\red${parseInt(c.slice(0, 2), 16)}\\green${parseInt(c.slice(2, 4), 16)}\\blue${parseInt(c.slice(4, 6), 16)};`).join('')}}
{\\stylesheet{\\s0\\f0\\fs${fs} Normal;}{\\s1\\f0\\fs${Math.round(fs * 0.85)} Footnote Text;}}
{\\info${info}}
\\paperw${Math.round(trim.w * TW)}\\paperh${Math.round(trim.h * TW)}\\margl${Math.round(trim.inside * TW)}\\margr${Math.round(trim.outside * TW)}\\margt${Math.round(trim.top * TW)}\\margb${Math.round(trim.bottom * TW)}\\facingp\\margmirror\\gutter0
\\fet0\\ftnbj\\ftnrstpg\\widowctrl\\hyphauto1
\\sectd\\pgndec{\\footerr\\pard\\qc\\f0\\fs${Math.round(fs * 0.85)} \\chpgn\\par}{\\footerl\\pard\\qc\\f0\\fs${Math.round(fs * 0.85)} \\chpgn\\par}
`;
  void textOf;
  return Buffer.from(`${header}${body}}`, 'latin1');
}
