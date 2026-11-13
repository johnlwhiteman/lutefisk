// MOBI (Mobipocket 6 / Kindle "KF7") exporter for older Kindles and apps that
// read .mobi. The book HTML is converted to Mobipocket-flavoured HTML, every
// non-ASCII character becomes a numeric entity (so text records split cleanly),
// images become JPEG records, and the table of contents uses filepos links.
//
// Note: Amazon's KDP no longer accepts MOBI uploads — use EPUB for publishing.
// MOBI is for sideloading onto older Kindles and legacy reading apps.
import { renderBook } from '../shared/bookhtml.js';
import { templateById, withCasePrefs, setCustomTemplates } from '../shared/templates.js';
import { collectBookMath } from '../shared/markdown.js';
import { mathKey } from '../shared/math.js';
import { coverAlt } from '../shared/cover.js';
import { readAsset } from './bookstore.js';
import { imageSize } from './export-docx.js';
import { parseHtml, hasClass } from './html-walk.js';
import { tokenStyle } from '../shared/code.js';

const RECORD = 4096;

const ent = (s) => {
  let out = '';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (cp < 0x20 && ch !== '\n') continue;
    else if (cp < 0x80) out += ch;
    else out += `&#${cp};`;
  }
  return out;
};

/** Build the .mobi file. toJpeg(buffer) converts any image to a reader-safe JPEG. */
export async function buildMobi({ dir, book, contents, rasterize, toJpeg }) {
  setCustomTemplates(book.customTemplates);
  const tpl = withCasePrefs(templateById(book.template), book);
  const equations = collectBookMath(Object.values(contents));
  const mathPngs = rasterize && equations.size ? await rasterize(equations) : new Map();

  // ---- images → records (1-based recindex)
  const images = [];
  const imageIndex = new Map();
  async function addImage(key, loader) {
    if (imageIndex.has(key)) return imageIndex.get(key);
    let buf = null;
    try { buf = await loader(); } catch { buf = null; }
    if (!buf) return null;
    const jpg = toJpeg ? toJpeg(buf) : buf;
    if (!jpg || !imageSize(jpg)) return null;
    images.push(jpg);
    imageIndex.set(key, images.length);
    return images.length;
  }
  let coverIdx = null;
  if (book.cover) coverIdx = await addImage(`asset:${book.cover}`, () => readAsset(dir, book.cover));

  const rendered = renderBook({
    book, contents, xhtml: false,
    assetUrl: (src) => `asset:${src}`,
    mathImage: (tex, display) => { const k = mathKey(tex, display); return mathPngs.has(k) ? { src: `math:${k}`, h: mathPngs.get(k).h, depth: 0, scale: mathPngs.get(k).scale } : null; },
  });
  const notesById = new Map();
  for (const r of rendered) for (const n of r.notes || []) notesById.set(n.id, n);

  // ---- HTML → Mobipocket HTML
  const anchors = new Map(); // name → byte position (filled while writing)
  const links = []; // { at, target } positions of 10-digit filepos placeholders
  let out = '';
  const mark = (name) => { anchors.set(name, Buffer.byteLength(out, 'latin1')); };
  const link = (target, inner) => {
    out += '<a filepos=';
    links.push({ at: Buffer.byteLength(out, 'latin1'), target });
    out += `0000000000>${inner}</a>`;
  };

  async function inline(nodes) {
    for (const n of nodes) {
      if (n.text != null) { out += ent(n.text); continue; }
      const t = n.tag;
      if (t === 'br') { out += '<br/>'; continue; }
      if (t === 'img') {
        const src = n.attrs.src || '';
        let idx = null;
        if (src.startsWith('asset:')) idx = await addImage(src, () => readAsset(dir, src.slice(6)));
        else if (src.startsWith('math:')) idx = await addImage(src, async () => mathPngs.get(src.slice(5))?.png);
        if (idx) out += `<img recindex="${String(idx).padStart(5, '0')}" alt="${ent(n.attrs.alt || '')}"/>`;
        continue;
      }
      if (t === 'sup' && hasClass(n, 'fnref')) {
        const a = n.children.find((c) => c.tag === 'a');
        const id = /#fn-(.+)$/.exec(a?.attrs.href || '')?.[1];
        if (id) { mark(`ref-${id}`); out += '<sup>'; link(`fn-${id}`, ent(notesById.get(id)?.num ?? '*')); out += '</sup>'; continue; }
      }
      if (t === 'a') {
        const href = n.attrs.href || '';
        if (/^(https?:|mailto:)/.test(href)) { out += `<a href="${ent(href)}">`; await inline(n.children); out += '</a>'; continue; }
        const sec = /^#?sec-(.+)$/.exec(href.replace(/^.*#/, '#'))?.[1];
        if (sec) { out += '<a filepos='; links.push({ at: Buffer.byteLength(out, 'latin1'), target: `sec-${sec}` }); out += '0000000000>'; await inline(n.children); out += '</a>'; continue; }
        await inline(n.children); continue;
      }
      const tag = { em: 'i', i: 'i', strong: 'b', b: 'b', s: 'strike', del: 'strike', u: 'u', code: 'tt', sup: 'sup', sub: 'sub', small: 'small' }[t];
      if (tag) { out += `<${tag}>`; await inline(n.children); out += `</${tag}>`; continue; }
      if (t === 'span' && hasClass(n, 'bk-cap')) { out += '<br/><i>'; await inline(n.children); out += '</i>'; continue; }
      await inline(n.children);
    }
  }
  const P = (align, indent) => `<p${align ? ` align="${align}"` : ''}${indent ? ' width="1.5em"' : ' width="0"'}>`;

  async function blocks(nodes, ctx) {
    for (const n of nodes) {
      if (n.text != null) { if (n.text.trim()) { out += P('', false); out += ent(n.text); out += '</p>'; } continue; }
      const t = n.tag;
      if (t === 'aside') continue;
      if (t === 'header' && hasClass(n, 'bk-head')) {
        for (const c of n.children) {
          if (c.tag === 'p' && hasClass(c, 'bk-num')) { out += '<p align="center" width="0"><font size="+1">'; if (tpl.numCase === 'upper') out += ent(textOfNode(c).toUpperCase()); else await inline(c.children); out += '</font></p>'; }
          else if (c.tag === 'h1') { out += '<h1 align="center">'; await inline(c.children); out += '</h1>'; }
          else if (c.tag === 'p' && hasClass(c, 'bk-subtitle')) { out += '<p align="center" width="0"><i>'; await inline(c.children); out += '</i></p>'; }
        }
        const pic = n.children.find((c) => hasClass(c, 'bk-orn-pic'));
        if (pic) { out += '<p align="center" width="0">'; await inline(pic.children); out += '</p>'; }
        else if (tpl.ornament) out += `<p align="center" width="0">${ent(tpl.ornament)}</p>`;
        out += '<p width="0"> </p>';
        ctx.first = true;
        continue;
      }
      if (t === 'div' && hasClass(n, 'bk-scene')) { out += `<p align="center" width="0">${ent(tpl.scene)}</p>`; ctx.first = true; continue; }
      if (t === 'p') {
        if (hasClass(n, 'bk-tp-title')) { out += '<p width="0"> </p><p width="0"> </p><h1 align="center">'; await inline(n.children); out += '</h1>'; continue; }
        if (hasClass(n, 'bk-tp-sub')) { out += '<p align="center" width="0"><i>'; await inline(n.children); out += '</i></p>'; continue; }
        if (hasClass(n, 'bk-tp-author') || hasClass(n, 'bk-tp-pub')) { out += '<p align="center" width="0">'; await inline(n.children); out += '</p>'; continue; }
        const onlyImg = n.children.length && n.children.every((c) => c.tag === 'img' || (c.text != null && !c.text.trim()) || hasClass(c, 'bk-fig'));
        out += ctx.quote ? '<blockquote>' : '';
        out += P(ctx.center || onlyImg ? 'center' : tpl.justify ? 'justify' : 'left', !ctx.first && !ctx.center && !onlyImg);
        await inline(n.children);
        out += '</p>';
        out += ctx.quote ? '</blockquote>' : '';
        ctx.first = false;
        continue;
      }
      if (t === 'h1') { out += '<h1 align="center">'; await inline(n.children); out += '</h1>'; ctx.first = true; continue; }
      if (/^h[2-6]$/.test(t)) { out += `<${t === 'h2' ? 'h2' : 'h3'}>`; await inline(n.children); out += `</${t === 'h2' ? 'h2' : 'h3'}>`; ctx.first = true; continue; }
      if (t === 'blockquote') { await blocks(n.children, { ...ctx, quote: true, first: true }); ctx.first = true; continue; }
      if (t === 'ul' || t === 'ol') {
        out += `<${t}>`;
        for (const li of n.children.filter((c) => c.tag === 'li')) {
          out += '<li>';
          if (hasClass(li, 'g-front') || li.children.some((c) => c.tag === 'a')) await inline(li.children.filter((c) => !(c.tag === 'span' && (hasClass(c, 'lead') || hasClass(c, 'pg')))));
          else await inline(li.children.flatMap((c) => (c.tag === 'p' ? c.children : [c])));
          out += '</li>';
        }
        out += `</${t}>`;
        continue;
      }
      if (t === 'div' && hasClass(n, 'bk-table')) {
        out += '<table border="1" cellpadding="4" width="100%">';
        const walk = async (x) => {
          for (const c of x.children || []) {
            if (c.tag === 'tr') {
              out += '<tr>';
              for (const cell of c.children.filter((y) => y.tag === 'td' || y.tag === 'th')) {
                const al = /text-align:(\w+)/.exec(cell.attrs.style || '')?.[1];
                out += `<${cell.tag}${al ? ` align="${al}"` : ''}>`; await inline(cell.children); out += `</${cell.tag}>`;
              }
              out += '</tr>';
            } else await walk(c);
          }
        };
        await walk(n);
        out += '</table>';
        ctx.first = true;
        continue;
      }
      if (t === 'pre') {
        // Older Kindles have no colour: keywords bold, comments italic.
        out += '<pre>';
        const walkCode = (nodes, cls) => {
          for (const c of nodes) {
            if (c.text != null) {
              const st = tokenStyle(cls);
              out += `${st.bold ? '<b>' : ''}${st.italic ? '<i>' : ''}${ent(c.text)}${st.italic ? '</i>' : ''}${st.bold ? '</b>' : ''}`;
            } else walkCode(c.children || [], `${cls} ${c.attrs?.class || ''}`);
          }
        };
        walkCode(n.children, '');
        out += '</pre>';
        ctx.first = true;
        continue;
      }
      if (t === 'span' && hasClass(n, 'bk-math-d')) { out += '<p align="center" width="0">'; await inline(n.children); out += '</p>'; continue; }
      if (t === 'img') { out += '<p align="center" width="0">'; await inline([n]); out += '</p>'; continue; }
      await blocks(n.children, { ...ctx, center: ctx.center || hasClass(n, 't-dedication') || hasClass(n, 't-epigraph') });
    }
  }
  const textOfNode = (n) => (n.text != null ? n.text : (n.children || []).map(textOfNode).join(''));

  // Contents page (the Kindle "Go to › Table of Contents" target).
  const tocEntries = rendered.filter((r) => !['title-page', 'copyright', 'toc', 'dedication', 'epigraph'].includes(r.sec.type));
  out = '<html><head><guide><reference type="toc" title="Table of Contents" filepos=';
  links.push({ at: Buffer.byteLength(out, 'latin1'), target: 'toc' });
  out += '0000000000 /><reference type="text" title="Beginning" filepos=';
  const firstBody = rendered.find((r) => ['chapter', 'prologue', 'part'].includes(r.sec.type)) || rendered[0];
  links.push({ at: Buffer.byteLength(out, 'latin1'), target: `sec-${firstBody?.sec.id}` });
  out += '0000000000 /></guide></head><body>';

  let tocDone = false;
  const writeToc = () => {
    mark('toc');
    out += '<h2 align="center">Contents</h2>';
    for (const r of tocEntries) { out += '<p width="0">'; link(`sec-${r.sec.id}`, ent(r.sec.tocTitle || r.sec.title || '')); out += '</p>'; }
    out += '<mbp:pagebreak/>';
    tocDone = true;
  };
  for (const r of rendered) {
    if (r.sec.type === 'toc') { writeToc(); continue; }
    if (r.sec.type === 'endnotes') continue;
    if (!tocDone && ['chapter', 'prologue', 'part'].includes(r.sec.type)) writeToc();
    mark(`sec-${r.sec.id}`);
    await blocks(parseHtml(r.html).children, { first: true, center: ['dedication', 'epigraph'].includes(r.sec.type) });
    // Notes at the end of each chapter, linked both ways.
    if (r.notes?.length) {
      out += '<p width="0"> </p><h3>Notes</h3>';
      for (const n of r.notes) {
        mark(`fn-${n.id}`);
        out += '<p width="0">';
        link(`ref-${n.id}`, String(n.num));
        out += '. ';
        await inline(parseHtml(n.html).children);
        out += '</p>';
      }
    }
    out += '<mbp:pagebreak/>';
  }
  if (!tocDone) writeToc();
  out += '</body></html>';

  // Patch filepos placeholders (10 digits, zero-padded).
  const text = Buffer.from(out, 'latin1');
  for (const l of links) {
    const pos = anchors.get(l.target) ?? 0;
    text.write(String(pos).padStart(10, '0'), l.at, 'latin1');
  }

  // ---- records
  const textRecords = [];
  for (let i = 0; i < text.length; i += RECORD) textRecords.push(text.subarray(i, Math.min(text.length, i + RECORD)));
  const firstImage = images.length ? 1 + textRecords.length + 1 : 0xffffffff; // after a zero-padding record
  const title = Buffer.from(ent(book.title || 'Untitled'), 'latin1');

  const exthItems = [];
  const exth = (type, val) => exthItems.push({ type, data: typeof val === 'number' ? u32(val) : Buffer.from(ent(String(val)), 'latin1') });
  if (book.author) exth(100, book.author);
  if (book.publisher) exth(101, book.publisher);
  if (book.description) exth(103, book.description);
  if (book.isbn) exth(104, String(book.isbn).replace(/[^0-9Xx]/g, ''));
  for (const k of book.keywords || []) exth(105, k);
  exth(106, book.year ? String(book.year) : new Date().toISOString().slice(0, 10));
  exth(503, book.title || 'Untitled');
  exth(524, book.language || 'en');
  if (coverIdx) { exth(201, coverIdx - 1); exth(203, 0); }
  void coverAlt;
  const exthBody = Buffer.concat(exthItems.map((e) => Buffer.concat([u32(e.type), u32(e.data.length + 8), e.data])));
  const exthPad = (4 - (exthBody.length % 4)) % 4;
  const exthBlock = Buffer.concat([Buffer.from('EXTH'), u32(12 + exthBody.length + exthPad), u32(exthItems.length), exthBody, Buffer.alloc(exthPad)]);

  const MOBI_LEN = 232;
  const lastContent = textRecords.length + (images.length ? images.length + 1 : 0);
  const mobi = Buffer.alloc(MOBI_LEN, 0);
  mobi.write('MOBI', 0, 'latin1');
  mobi.writeUInt32BE(MOBI_LEN, 4);
  mobi.writeUInt32BE(2, 8); // Mobipocket book
  mobi.writeUInt32BE(1252, 12); // text encoding: CP-1252 (all non-ASCII is entities)
  mobi.writeUInt32BE((Math.random() * 0xffffffff) >>> 0, 16); // unique id
  mobi.writeUInt32BE(6, 20); // file version
  for (let o = 24; o < 64; o += 4) mobi.writeUInt32BE(0xffffffff, o); // index records (none)
  mobi.writeUInt32BE(textRecords.length + 1, 64); // first non-book record
  const fullNameOffset = 16 + MOBI_LEN + exthBlock.length;
  mobi.writeUInt32BE(fullNameOffset, 68);
  mobi.writeUInt32BE(title.length, 72);
  mobi.writeUInt32BE(LOCALE[(book.language || 'en').slice(0, 2)] ?? 9, 76);
  mobi.writeUInt32BE(0, 80); mobi.writeUInt32BE(0, 84);
  mobi.writeUInt32BE(6, 88); // minimum reader version
  mobi.writeUInt32BE(firstImage, 92);
  mobi.writeUInt32BE(0, 96); mobi.writeUInt32BE(0, 100); mobi.writeUInt32BE(0, 104); mobi.writeUInt32BE(0, 108); // huffman
  mobi.writeUInt32BE(0x50, 112); // EXTH present (0x40) + 0x10
  mobi.writeUInt32BE(0xffffffff, 148); // DRM offset
  mobi.writeUInt32BE(0xffffffff, 152);
  mobi.writeUInt16BE(1, 176); // first content record
  mobi.writeUInt16BE(lastContent, 178); // last content record
  mobi.writeUInt32BE(1, 180);
  const flisIndex = lastContent + 1;
  mobi.writeUInt32BE(flisIndex + 1, 184); mobi.writeUInt32BE(1, 188); // FCIS
  mobi.writeUInt32BE(flisIndex, 192); mobi.writeUInt32BE(1, 196); // FLIS
  mobi.writeUInt32BE(0xffffffff, 200); mobi.writeUInt32BE(0xffffffff, 204);
  mobi.writeUInt32BE(0, 224); // extra record data flags: none
  mobi.writeUInt32BE(0xffffffff, 228); // INDX

  const palmdoc = Buffer.alloc(16, 0);
  palmdoc.writeUInt16BE(1, 0); // no compression
  palmdoc.writeUInt32BE(text.length, 4);
  palmdoc.writeUInt16BE(textRecords.length, 8);
  palmdoc.writeUInt16BE(RECORD, 10);
  const namePad = Buffer.alloc(((4 - ((title.length + 2) % 4)) % 4) + 2 + 1024); // Kindle readers like padding after the title
  const record0 = Buffer.concat([palmdoc, mobi, exthBlock, title, namePad]);

  const flis = Buffer.from('464c4953000000080041000000000000ffffffff000100030000000300000001ffffffff', 'hex');
  const fcis = Buffer.concat([Buffer.from('FCIS'), u32(0x14), u32(0x10), u32(1), u32(0), u32(text.length), u32(0), u32(0x20), u32(8), Buffer.from([0, 1, 0, 1]), u32(0)]);
  const eof = Buffer.from([0xe9, 0x8e, 0x0d, 0x0a]);
  const records = [record0, ...textRecords, ...(images.length ? [Buffer.alloc(2), ...images] : []), flis, fcis, eof];

  // ---- PalmDB container
  const n = records.length;
  const headerLen = 78 + n * 8 + 2;
  const db = Buffer.alloc(78, 0);
  const name = (book.title || 'Untitled').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, '_').slice(0, 31) || 'Book';
  db.write(name, 0, 'latin1');
  const now = Math.floor(Date.now() / 1000);
  db.writeUInt32BE(now, 36); db.writeUInt32BE(now, 40);
  db.write('BOOK', 60, 'latin1'); db.write('MOBI', 64, 'latin1');
  db.writeUInt32BE((n * 2) - 1, 68); // unique id seed
  db.writeUInt16BE(n, 76);
  const list = Buffer.alloc(n * 8 + 2, 0);
  let off = headerLen;
  records.forEach((r, i) => { list.writeUInt32BE(off, i * 8); list.writeUInt32BE(i * 2, i * 8 + 4); off += r.length; });
  return Buffer.concat([db, list, ...records]);
}

function u32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0, 0); return b; }
const LOCALE = { en: 9, fr: 12, de: 7, es: 10, it: 16, pt: 22, nl: 19, sv: 29, pl: 21, ja: 17, zh: 4, ko: 18, hi: 57, sa: 79 };
