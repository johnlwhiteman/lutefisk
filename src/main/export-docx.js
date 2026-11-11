// Microsoft Word (.docx) exporter. Maps the Markdown token stream to Word
// paragraphs with real styles, footnotes, mirrored print margins, odd/even
// running heads, a Word table of contents field and drop caps.
import {
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, CommentRangeStart, CommentRangeEnd, CommentReference,
  Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink, FootnoteReferenceRun, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, SectionType, TableOfContents, LevelFormat, DropCapType, FrameAnchorType,
  HorizontalPositionAlign, VerticalPositionAlign, FrameWrap, NumberFormat, TextWrappingType, TextWrappingSide, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
} from 'docx';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { prepare } from '../shared/bookhtml.js';
import { parseMarkdown, safeAssetPath, renderInline, collectBookMath, COMMENT_RE } from '../shared/markdown.js';
import { mathKey } from '../shared/math.js';
import { highlightCode, tokenStyle } from '../shared/code.js';
import { parseHtml } from './html-walk.js';
import { fillPlaceholders, SECTION_TYPES, DISPLAY_TYPES } from '../shared/sections.js';
import { templateById, withCasePrefs, setCustomTemplates } from '../shared/templates.js';
import { fontById } from '../shared/fonts.js';
import { formatBibliography } from '../shared/citations.js';
import { indexLocations, citer } from '../shared/bookhtml.js';
import { readAsset } from './bookstore.js';
import { TRIMS } from '../shared/print.js';

const TW = 1440; // twips per inch
const fam = (id) => fontById(id)?.family || 'Georgia';

/** Read pixel dimensions from PNG / JPEG / GIF headers. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'png' };
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), type: 'gif' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), type: 'jpg' };
      i += 2 + len;
    }
  }
  return null;
}

/** Convert the small HTML produced by citation/inline renderers into runs. */
function htmlRuns(html, base = {}) {
  const runs = [];
  const re = /<(\/?)(i|em|b|strong|s|del|span|a|sup|code)[^>]*>|([^<]+)/g;
  const st = { italics: false, bold: false, strike: false };
  let m;
  const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  while ((m = re.exec(html))) {
    if (m[3]) { runs.push(new TextRun({ ...base, text: dec(m[3]), italics: st.italics || base.italics, bold: st.bold || base.bold, strike: st.strike })); continue; }
    const on = !m[1];
    if (m[2] === 'i' || m[2] === 'em') st.italics = on;
    else if (m[2] === 'b' || m[2] === 'strong') st.bold = on;
    else if (m[2] === 's' || m[2] === 'del') st.strike = on;
  }
  return runs;
}

export async function buildDocx({ dir, book, contents, rasterize }) {
  setCustomTemplates(book.customTemplates);
  const tpl = withCasePrefs(templateById(book.template), book);
  const trim = TRIMS[book.print?.trim] || TRIMS['6x9'];
  const pt = Number(book.print?.fontSize) || 11;
  const bodyFont = fam(tpl.body);
  const headFont = fam(tpl.head);
  const sections = prepare(book);
  const footnotes = {};
  let fnId = 1;
  const endnoteGroups = [];
  const notesInBook = book.notesPlacement === 'book';
  const imgCache = new Map();
  const cite = citer(book);
  // Equations go into Word as images with the LaTeX as alt text.
  const equations = collectBookMath(Object.values(contents));
  const mathPngs = rasterize && equations.size ? await rasterize(equations) : new Map();
  // Comments become real Word comments (threaded, with replies and resolved state).
  const commentStore = book.wordComments === false ? {} : (book.comments || {});
  const closesLeft = new Map();
  for (const src of Object.values(contents)) for (const m of String(src || '').matchAll(COMMENT_RE)) closesLeft.set(m[2], (closesLeft.get(m[2]) || 0) + 1);
  const wordIds = new Map(); // comment id → [parent n, ...reply n]
  let nextWordId = 0;
  const wordComments = [];
  const initialsOf = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  const wordIdsFor = (id) => {
    if (wordIds.has(id)) return wordIds.get(id);
    const c = commentStore[id];
    const parent = nextWordId++;
    const ids = [parent];
    const para = (t) => [new Paragraph({ children: [new TextRun(String(t || ''))] })];
    wordComments.push({ id: parent, author: c.author || 'Author', initials: initialsOf(c.author), date: c.at ? new Date(c.at) : new Date(), resolved: !!c.resolved, children: para(c.text) });
    for (const r of c.replies || []) {
      const n = nextWordId++;
      ids.push(n);
      wordComments.push({ id: n, parentId: parent, author: r.author || 'Author', initials: initialsOf(r.author), date: r.at ? new Date(r.at) : new Date(), resolved: !!c.resolved, children: para(r.text) });
    }
    wordIds.set(id, ids);
    return ids;
  };
  const commentsOpen = new Set();

  async function loadImage(rel) {
    if (imgCache.has(rel)) return imgCache.get(rel);
    let v = null;
    try {
      const data = await readAsset(dir, rel);
      const size = imageSize(data);
      if (size) v = { data, ...size };
    } catch { /* missing image */ }
    imgCache.set(rel, v);
    return v;
  }
  const contentWidthIn = trim.w - (trim.inside + trim.outside);

  // ---- inline tokens → runs
  async function inlineRuns(children, defs, ctx, style = {}) {
    const out = [];
    const st = { italics: false, bold: false, strike: false, link: null, ...style };
    let linkRuns = null;
    for (let i = 0; i < (children || []).length; i++) {
      const t = children[i];
      const run = (text) => new TextRun({ text, italics: st.italics, bold: st.bold, strike: st.strike, ...(st.link ? { style: 'Hyperlink' } : {}) });
      const push = (r) => (linkRuns ? linkRuns.push(r) : out.push(r));
      switch (t.type) {
        case 'text': push(run(t.content)); break;
        case 'code_inline': push(new TextRun({ text: t.content, font: 'Courier New' })); break;
        case 'cite': push(run(cite(t.meta.ref, t.meta.locator))); break;
        case 'comment_open': {
          const id = t.meta.id;
          if (!commentStore[id] || commentsOpen.has(id) || wordIds.has(id)) break;
          commentsOpen.add(id);
          for (const n of wordIdsFor(id)) push(new CommentRangeStart(n));
          break;
        }
        case 'comment_close': {
          const id = t.meta.id;
          const left = (closesLeft.get(id) || 1) - 1;
          closesLeft.set(id, left);
          if (left > 0 || !commentsOpen.has(id)) break;
          commentsOpen.delete(id);
          for (const n of wordIds.get(id)) { push(new CommentRangeEnd(n)); push(new TextRun({ children: [new CommentReference(n)] })); }
          break;
        }
        case 'math': {
          const r = mathPngs.get(mathKey(t.meta.tex, t.meta.display));
          if (!r) { push(new TextRun({ text: t.meta.tex, font: 'Cambria Math' })); break; }
          const k = (pt * (96 / 72)) / r.scale;
          if (t.meta.display) push(new TextRun({ break: 1 }));
          push(new ImageRun({ type: 'png', data: r.png, transformation: { width: Math.max(1, Math.round(r.w * k)), height: Math.max(1, Math.round(r.h * k)) }, altText: { name: 'equation', title: 'Equation', description: t.meta.tex } }));
          if (t.meta.display) push(new TextRun({ break: 1 }));
          break;
        }
        case 'softbreak': push(run(' ')); break;
        case 'hardbreak': push(new TextRun({ break: 1 })); break;
        case 'em_open': st.italics = !style.italics; break;
        case 'em_close': st.italics = !!style.italics; break;
        case 'strong_open': st.bold = true; break;
        case 'strong_close': st.bold = !!style.bold; break;
        case 's_open': st.strike = true; break;
        case 's_close': st.strike = false; break;
        case 'link_open': st.link = t.attrGet('href'); linkRuns = []; break;
        case 'link_close':
          if (/^https?:|^mailto:/.test(st.link || '')) out.push(new ExternalHyperlink({ link: st.link, children: linkRuns }));
          else out.push(...linkRuns);
          linkRuns = null; st.link = null; break;
        case 'fnref': {
          const text = defs.get(t.meta.label) || '';
          const paras = [new Paragraph({ children: htmlRuns(renderInline(text, { cite })) })];
          if (notesInBook) {
            ctx.notes.push(text);
            push(new TextRun({ text: String(ctx.notes.length), superScript: true }));
          } else {
            footnotes[fnId] = { children: paras };
            push(new FootnoteReferenceRun(fnId++));
          }
          break;
        }
        case 'image': {
          const rel = safeAssetPath(t.attrGet('src'));
          const img = rel && await loadImage(rel);
          if (!img) break;
          const wrapMode = t.meta?.wrap && t.meta.wrap !== 'topbottom' && t.meta.wrap !== 'inline' ? t.meta.wrap : null;
          const wrapSide = wrapMode ? (t.meta.align === 'right' ? 'right' : t.meta.align === 'center' ? 'center' : 'left') : null;
          const pct = (t.meta?.width || (t.meta?.wrap === 'inline' ? 25 : wrapSide ? 40 : 100)) / 100;
          const wPx = Math.round(contentWidthIn * pct * 96);
          const hPx = Math.round(wPx * (img.h / img.w));
          push(new ImageRun({
            type: img.type, data: img.data, transformation: { width: wPx, height: hPx },
            altText: { name: 'image', description: t.content || '', title: t.content || '' },
            ...(wrapSide ? {
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.COLUMN, align: wrapSide === 'right' ? HorizontalPositionAlign.RIGHT : wrapSide === 'center' ? HorizontalPositionAlign.CENTER : HorizontalPositionAlign.LEFT },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
                behindDocument: wrapMode === 'behind',
                allowOverlap: wrapMode === 'behind' || wrapMode === 'front',
                wrap: { type: wrapMode === 'behind' || wrapMode === 'front' ? TextWrappingType.NONE : wrapMode === 'tight' || wrapMode === 'through' ? TextWrappingType.TIGHT : TextWrappingType.SQUARE, side: TextWrappingSide.BOTH_SIDES },
                margins: { left: wrapSide === 'right' ? 160000 : 0, right: wrapSide === 'left' ? 160000 : 0, top: 40000, bottom: 80000 },
              },
            } : {}),
          }));
          break;
        }
        default: break;
      }
    }
    return out;
  }

  const indentFirst = Math.round(tpl.indent * pt * 20);
  const body = (runs, opts = {}) => new Paragraph({ style: 'BookBody', children: runs, ...opts });

  // ---- markdown → paragraphs
  async function mdParagraphs(md, ctx, isChapter, dropOn = false) {
    const { tokens, defs } = parseMarkdown(fillPlaceholders(md, book));
    const paras = [];
    let firstPara = isChapter;
    let afterBreak = true;
    const stack = []; // list/blockquote context
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'bullet_list_open') stack.push({ kind: 'ul' });
      else if (t.type === 'ordered_list_open') stack.push({ kind: 'ol', ref: `ol-${ctx.olCount++}` });
      else if (t.type === 'blockquote_open') stack.push({ kind: 'bq' });
      else if (/_(list|blockquote)_close$|^blockquote_close$/.test(t.type)) stack.pop();
      else if (t.type === 'fence' || t.type === 'code_block') {
        const html = highlightCode(t.content.replace(/\n$/, ''), t.type === 'fence' ? t.info : 'plaintext', { enabled: book.codeHighlight !== false });
        const runs = [];
        const walkCode = (nodes, cls) => {
          for (const n of nodes) {
            if (n.text != null) {
              const st = tokenStyle(cls);
              n.text.split('\n').forEach((line, li) => runs.push(new TextRun({ text: line, break: li ? 1 : 0, font: 'Consolas', size: Math.round(pt * 2 * 0.82), color: st.color, bold: st.bold, italics: st.italic })));
            } else walkCode(n.children || [], `${cls} ${n.attrs?.class || ''}`);
          }
        };
        walkCode(parseHtml(html).children, '');
        paras.push(new Paragraph({
          children: runs, alignment: AlignmentType.LEFT, indent: { firstLine: 0, left: 120, right: 120 },
          spacing: { before: 160, after: 160, line: 252 }, keepLines: true,
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F6F8FA' },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: '8C959F', space: 6 }, top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 }, right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 } },
        }));
        afterBreak = true;
      } else if (t.type === 'table_open') {
        const rows = [];
        let row = null;
        for (i++; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
          const u = tokens[i];
          if (u.type === 'tr_open') row = [];
          else if (u.type === 'tr_close') { rows.push(row); row = null; }
          else if ((u.type === 'th_open' || u.type === 'td_open') && row) {
            const a = /text-align:(\w+)/.exec(u.attrGet('style') || '')?.[1];
            const runs = await inlineRuns(tokens[i + 1]?.children || [], defs, ctx, u.type === 'th_open' ? { bold: true } : {});
            row.push({ runs, align: a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT, head: u.type === 'th_open' });
          }
        }
        const cols = Math.max(1, ...rows.map((r) => r.length));
        const border = { style: BorderStyle.SINGLE, size: 4, color: '444444' };
        paras.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows: rows.map((r, ri) => new TableRow({
            tableHeader: ri === 0,
            children: Array.from({ length: cols }, (_, ci) => new TableCell({
              width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              children: [new Paragraph({ alignment: r[ci]?.align || AlignmentType.LEFT, spacing: { before: 0, after: 0 }, children: r[ci]?.runs || [] })],
            })),
          })),
        }));
        paras.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
        afterBreak = true;
      } else if (t.type === 'hr') {
        paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun({ text: tpl.scene, font: headFont })] }));
        afterBreak = true;
      } else if (t.type === 'heading_open') {
        const inline = tokens[i + 1];
        const lvl = Number(t.tag.slice(1));
        paras.push(new Paragraph({ heading: lvl <= 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: await inlineRuns(inline.children, defs, ctx) }));
        i += 2; afterBreak = true;
      } else if (t.type === 'paragraph_open') {
        const inline = tokens[i + 1];
        i += 2;
        const list = [...stack].reverse().find((s) => s.kind === 'ul' || s.kind === 'ol');
        const inQuote = stack.some((s) => s.kind === 'bq');
        const meaningful = (inline.children || []).filter((c) => !(c.type === 'text' && !c.content.trim()));
        const onlyImage = meaningful.length === 1 && meaningful[0].type === 'image';
        const runs = await inlineRuns(inline.children, defs, ctx, inQuote ? { italics: true } : {});
        if (onlyImage) {
          const al = meaningful[0].meta?.align;
          paras.push(new Paragraph({ alignment: al === 'left' ? AlignmentType.LEFT : al === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER, spacing: { before: 120, after: 120, line: 240, lineRule: 'auto' }, keepNext: !!meaningful[0].attrGet('title'), children: runs }));
          const cap = meaningful[0].attrGet('title');
          if (cap) paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: cap, italics: true, size: Math.round(pt * 1.7) })] }));
          continue;
        }
        if (list) {
          paras.push(new Paragraph({ style: 'BookBody', children: runs, ...(list.kind === 'ul' ? { bullet: { level: 0 } } : { numbering: { reference: 'book-ol', level: 0, instance: Number(list.ref.slice(3)) } }) }));
          continue;
        }
        if (inQuote) {
          paras.push(new Paragraph({ style: 'BookBody', indent: { left: 720, right: 720, firstLine: 0 }, spacing: { before: 120, after: 120 }, children: runs }));
          continue;
        }
        if (firstPara && dropOn && tpl.dropcap !== 'none') {
          firstPara = false; afterBreak = false;
          const first = runs[0];
          const text = inline.children?.[0]?.type === 'text' ? inline.children[0].content : '';
          const m = /^(["“‘']?\p{L})/u.exec(text);
          if (first && m) {
            const rest = text.slice(m[1].length);
            paras.push(new Paragraph({
              frame: {
                type: 'alignment', alignment: { x: HorizontalPositionAlign.LEFT, y: VerticalPositionAlign.TOP },
                anchor: { horizontal: FrameAnchorType.TEXT, vertical: FrameAnchorType.TEXT },
                dropCap: DropCapType.DROP, lines: 3, wrap: FrameWrap.AROUND,
              },
              spacing: { line: Math.round(pt * 20 * tpl.lh * 3 / 1) , lineRule: 'exact' },
              children: [new TextRun({ text: m[1], font: headFont, size: Math.round(pt * 2 * tpl.lh * 2.6) })],
            }));
            const lead = /^(\S*(?:\s+\S+){0,4})(.*)$/su.exec(rest) || [rest, rest, ''];
            const leadRuns = tpl.firstLine === 'none'
              ? [new TextRun({ text: rest })]
              : [new TextRun({ text: lead[1], smallCaps: tpl.firstLine === 'smallcaps', allCaps: tpl.firstLine === 'uppercase' }), new TextRun({ text: lead[2] })];
            paras.push(body([...leadRuns, ...runs.slice(1)], { indent: { firstLine: 0 } }));
            continue;
          }
        }
        firstPara = false;
        paras.push(body(runs, afterBreak ? { indent: { firstLine: 0 } } : {}));
        afterBreak = false;
      }
    }
    return paras;
  }

  const docSections = [];
  const isFront = (s) => SECTION_TYPES[s.type]?.group === 'front';
  const roman = book.print?.romanFrontMatter !== false;
  let firstBodySeen = false;
  const ctx = { olCount: 0, notes: [] };

  const header = (text) => new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: headFont, size: Math.round(pt * 1.6), smallCaps: !tpl.normalHeadings })] })] });
  const footer = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: Math.round(pt * 1.8) })] })] });
  const empty = () => new Header({ children: [new Paragraph({})] });

  for (const s of sections) {
    const children = [];
    const sink = { before: Math.round(tpl.sink * pt * 20 * 0.8) };
    const isChapterLike = ['chapter', 'prologue', 'epilogue'].includes(s.type);
    ctx.notes = [];
    switch (s.type) {
      case 'title-page':
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 3600, after: 240 }, children: [new TextRun({ text: book.title || 'Untitled', font: headFont, size: pt * 5, italics: tpl.titleItalic, allCaps: tpl.titleCase === 'upper' })] }));
        if (book.subtitle) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 720 }, children: [new TextRun({ text: book.subtitle, italics: true, size: pt * 2.6 })] }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720 }, children: [new TextRun({ text: book.author || '', smallCaps: !tpl.normalHeadings, size: pt * 2.8 })] }));
        if (book.publisher) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 4000 }, children: [new TextRun({ text: tpl.normalHeadings ? book.publisher : book.publisher.toUpperCase(), size: pt * 1.7 })] }));
        break;
      case 'toc':
        children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: sink, children: [new TextRun(s.title || 'Contents')] }));
        children.push(new TableOfContents(s.title || 'Contents', { hyperlink: true, headingStyleRange: '1-1' }));
        children.push(new Paragraph({ children: [new TextRun({ text: 'Tip: if page numbers are missing, right-click the table and choose Update Field.', italics: true, size: pt * 1.5, color: '888888' })] }));
        break;
      case 'bibliography': {
        const style = book.citationStyle || 'apa';
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: sink, children: [new TextRun(s.title || (style === 'mla' ? 'Works Cited' : style === 'chicago' ? 'Bibliography' : 'References'))] }));
        for (const h of formatBibliography(book.bibliography, style)) {
          children.push(new Paragraph({ style: 'BookBody', indent: { left: 720, hanging: 720 }, spacing: { after: 160 }, alignment: AlignmentType.LEFT, children: htmlRuns(h) }));
        }
        break;
      }
      case 'index': {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: sink, children: [new TextRun(s.title || 'Index')] }));
        const locs = indexLocations(book, contents, sections);
        for (const term of Object.keys(locs).sort((a, b) => a.localeCompare(b))) {
          children.push(new Paragraph({ style: 'BookBody', indent: { firstLine: 0, left: 360, hanging: 360 }, children: [new TextRun(`${term}, ${locs[term].map((x) => x.label || x.tocTitle).join(', ')}`)] }));
        }
        break;
      }
      case 'endnotes':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: sink, children: [new TextRun(s.title || 'Notes')] }));
        children.push({ __endnotes: true });
        break;
      default: {
        if (isChapterLike || !DISPLAY_TYPES.has(s.type)) {
          const align = tpl.align === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER;
          const title = s.type === 'chapter' ? s.displayTitle : s.displayTitle;
          const hasLabel = s.type === 'chapter' && s.label;
          if (hasLabel && title) {
            children.push(new Paragraph({ alignment: align, spacing: { ...sink, after: 120 }, keepNext: true, children: [new TextRun({ text: s.label, font: headFont, size: Math.round(pt * 2 * Math.min(tpl.numSize, 2.2)), smallCaps: tpl.numCase === 'smallcaps', allCaps: tpl.numCase === 'upper' })] }));
            children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: align, spacing: { after: 480 }, children: [new TextRun(title)] }));
          } else if (title || hasLabel || s.type !== 'chapter') {
            children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: align, spacing: { ...sink, after: 480 }, children: [new TextRun(title || s.label || s.tocTitle)] }));
          } else {
            children.push(new Paragraph({ spacing: { before: sink.before }, children: [] })); // no heading chosen
          }
          if (s.subtitle) children.push(new Paragraph({ alignment: align, spacing: { before: -240, after: 360 }, keepNext: true, children: [new TextRun({ text: s.subtitle, font: headFont, italics: true, size: Math.round(pt * 2 * 1.15) })] }));
          if (tpl.ornament) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: tpl.ornament, font: headFont })] }));
        } else if (s.type === 'dedication' || s.type === 'epigraph') {
          children.push(new Paragraph({ spacing: { before: 3600 }, children: [] }));
        }
        if (s.type === 'about-author' && book.authorPhoto) {
          const img = await loadImage(book.authorPhoto);
          if (img) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240, line: 240, lineRule: 'auto' }, children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: 180, height: Math.round(180 * img.h / img.w) } })] }));
        }
        let paras = await mdParagraphs(contents[s.id] || '', ctx, isChapterLike, isChapterLike && s.dropCap !== false && (book.print?.dropCaps ?? book.dropCaps) !== false);
        if (DISPLAY_TYPES.has(s.type)) {
          const center = s.type === 'dedication' || s.type === 'epigraph';
          if (center) {
            const { tokens, defs } = parseMarkdown(fillPlaceholders(contents[s.id] || '', book));
            paras = [];
            for (let i = 0; i < tokens.length; i++) if (tokens[i].type === 'inline') paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: await inlineRuns(tokens[i].children, defs, ctx) }));
          }
          if (s.type === 'copyright') {
            const { tokens, defs } = parseMarkdown(fillPlaceholders(contents[s.id] || '', book));
            paras = [new Paragraph({ spacing: { before: 4200 }, children: [] })];
            for (let i = 0; i < tokens.length; i++) if (tokens[i].type === 'inline') paras.push(new Paragraph({ spacing: { after: 160 }, children: await inlineRuns(tokens[i].children, defs, ctx), style: 'Small' }));
          }
        }
        children.push(...paras);
        if (notesInBook && ctx.notes.length) endnoteGroups.push({ title: s.tocTitle, notes: [...ctx.notes] });
      }
    }

    const startsBody = !isFront(s) && !firstBodySeen;
    if (startsBody) firstBodySeen = true;
    const display = DISPLAY_TYPES.has(s.type) || s.type === 'title-page';
    const recto = book.print?.startRecto !== false && (isChapterLike || s.type === 'title-page' || startsBody);
    docSections.push({
      _children: children,
      properties: {
        type: docSections.length === 0 ? SectionType.NEXT_PAGE : recto ? SectionType.ODD_PAGE : SectionType.NEXT_PAGE,
        titlePage: true,
        page: {
          size: { width: Math.round(trim.w * TW), height: Math.round(trim.h * TW) },
          margin: { top: Math.round(trim.top * TW), bottom: Math.round(trim.bottom * TW), left: Math.round(trim.inside * TW), right: Math.round(trim.outside * TW), header: Math.round(trim.top * TW * 0.5), footer: Math.round(trim.bottom * TW * 0.45) },
          pageNumbers: startsBody ? { start: 1, formatType: NumberFormat.DECIMAL } : isFront(s) && roman ? { formatType: NumberFormat.LOWER_ROMAN, ...(docSections.length === 0 ? { start: 1 } : {}) } : {},
        },
      },
      headers: display ? { default: empty(), first: empty(), even: empty() } : book.print?.runningHeads === false ? undefined : { default: header(book.title || ''), even: header(book.author || ''), first: empty() },
      footers: display ? { default: new Footer({ children: [new Paragraph({})] }), first: new Footer({ children: [new Paragraph({})] }) } : { default: footer(), even: footer(), first: footer() },
    });
  }

  // Resolve the endnotes placeholder (needs every chapter processed first).
  for (const d of docSections) {
    const out = [];
    for (const c of d._children) {
      if (c && c.__endnotes) {
        for (const g of endnoteGroups) {
          out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(g.title)] }));
          g.notes.forEach((n, i) => out.push(new Paragraph({ style: 'BookBody', indent: { firstLine: 0, left: 360, hanging: 360 }, children: [new TextRun(`${i + 1}. `), ...htmlRuns(renderInline(n, { cite }))] })));
        }
      } else out.push(c);
    }
    d.children = out;
    delete d._children;
  }

  const doc = new Document({
    ...(wordComments.length ? { comments: { children: wordComments } } : {}),
    creator: book.author || 'Lutefisk',
    title: book.title || 'Untitled',
    description: book.description || '',
    keywords: (book.keywords || []).join(', '),
    evenAndOddHeaderAndFooters: true,
    features: { updateFields: true },
    footnotes,
    styles: {
      default: {
        document: { run: { font: bodyFont, size: Math.round(pt * 2) }, paragraph: { spacing: { line: Math.round(240 * tpl.lh * 0.92), lineRule: 'auto' } } },
        heading1: { run: { font: headFont, size: Math.round(pt * 2 * Math.min(tpl.titleSize, 2.2)), italics: tpl.titleItalic, bold: tpl.titleWeight >= 600, allCaps: tpl.titleCase === 'upper', color: '000000' }, paragraph: { alignment: tpl.align === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER, keepNext: true } },
        heading2: { run: { font: headFont, size: Math.round(pt * 2.5), bold: true, color: '000000' }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
        heading3: { run: { font: headFont, size: Math.round(pt * 2.2), bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } },
        title: { run: { font: headFont, size: Math.round(pt * 3.2), color: '000000' } },
      },
      paragraphStyles: [
        { id: 'BookBody', name: 'Book Body', basedOn: 'Normal', quickFormat: true, run: { font: bodyFont, size: Math.round(pt * 2) }, paragraph: { alignment: tpl.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT, indent: { firstLine: indentFirst }, spacing: { after: Math.round(tpl.gap * pt * 20), line: Math.round(240 * tpl.lh * 0.92), lineRule: 'auto' }, widowControl: true } },
        { id: 'Small', name: 'Small Print', basedOn: 'Normal', run: { size: Math.round(pt * 1.6) } },
      ],
    },
    numbering: {
      config: [{ reference: 'book-ol', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }],
    },
    hyphenation: { autoHyphenation: true },
    sections: docSections,
  });
  const buf = await Packer.toBuffer(doc);
  return mirrorMargins(buf);
}

/** Add <w:mirrorMargins/> so inside/outside margins alternate like a printed book. */
function mirrorMargins(buf) {
  try {
    const files = unzipSync(new Uint8Array(buf));
    const key = 'word/settings.xml';
    if (files[key]) {
      let xml = strFromU8(files[key]);
      // Schema order: mirrorMargins follows displayBackgroundShape and precedes defaultTabStop.
      if (!xml.includes('w:mirrorMargins')) {
        if (xml.includes('<w:defaultTabStop')) xml = xml.replace('<w:defaultTabStop', '<w:mirrorMargins/><w:defaultTabStop');
        else xml = xml.replace(/<w:settings([^>]*)>/, '<w:settings$1><w:mirrorMargins/>');
      }
      files[key] = strToU8(xml);
    }
    return Buffer.from(zipSync(files, { level: 6 }));
  } catch { return buf; }
}

