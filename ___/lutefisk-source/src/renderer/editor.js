// Rich-text editor (Quill-style toolbar) built on ProseMirror. The document
// is stored as Markdown; this module converts both ways.
import { Schema, Slice } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift, chainCommands, exitCode } from 'prosemirror-commands';
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, ellipsis, emDash, InputRule } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { tableNodes, tableEditing, goToNextCell, addRowAfter, addRowBefore, addColumnAfter, addColumnBefore, deleteRow, deleteColumn, deleteTable, isInTable, setCellAttr, selectedRect } from 'prosemirror-tables';
import { createMarkdown, extractFootnotes, safeAssetPath, cleanBullet } from '../shared/markdown.js';
import { h, icon, dialog, assetUrl, popover, setHtml, bumpAsset, toast, closePopovers } from './ui.js';
import { openDrawingEditor } from './drawing-editor.js';
import { texToMathml } from '../shared/math.js';
import { highlightRanges, CODE_LANGUAGES, normalizeLang, parseCodeInfo, codeInfo, CODE_CSS } from '../shared/code.js';
import { openMathDialog } from './math-dialog.js';
import { openSymbolPicker } from './symbol-picker.js';

/** Drag type for snippets dragged from the Snippets panel into the text. */
export const SNIPPET_MIME = 'application/x-lutefisk-snippet';

/* ------------------------------------------------------------------ schema */

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    blockquote: { content: 'block+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['div', { class: 'pm-scene', contenteditable: 'false' }, ['hr']] },
    page_break: { group: 'block', atom: true, selectable: true, parseDOM: [{ tag: 'div.pm-pagebreak' }], toDOM: () => ['div', { class: 'pm-pagebreak', contenteditable: 'false', title: 'Page break — the next text starts on a new page' }, ['span', 'Page break']] },
    heading: {
      attrs: { level: { default: 2 } }, content: 'inline*', group: 'block', defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((l) => ({ tag: `h${l}`, attrs: { level: l } })),
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    /* Left/center/right/justified text, saved as a Pandoc-style ::: fenced div. */
    align: {
      attrs: { align: { default: 'center' } }, content: 'block+', group: 'block', defining: true,
      parseDOM: [{ tag: 'div.pm-align', getAttrs: (d) => ({ align: d.dataset.align || 'center' }) }],
      toDOM: (n) => ['div', { class: `pm-align pm-align-${n.attrs.align}`, 'data-align': n.attrs.align }, 0],
    },
    ordered_list: {
      content: 'list_item+', group: 'block', attrs: { order: { default: 1 }, tight: { default: false } },
      parseDOM: [{ tag: 'ol' }], toDOM: (n) => ['ol', n.attrs.order === 1 ? {} : { start: n.attrs.order }, 0],
    },
    bullet_list: {
      content: 'list_item+', group: 'block', attrs: { tight: { default: false }, symbol: { default: '' } },
      parseDOM: [{ tag: 'ul', getAttrs: (d) => ({ symbol: cleanBullet(d.dataset.bullet) }) }],
      toDOM: (n) => (n.attrs.symbol ? ['ul', { class: 'pm-bullets', 'data-bullet': n.attrs.symbol, style: `--bullet:${JSON.stringify(`${n.attrs.symbol} `)}` }, 0] : ['ul', 0]),
    },
    list_item: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    text: { group: 'inline' },
    code_block: {
      content: 'text*', marks: '', group: 'block', code: true, defining: true,
      attrs: { params: { default: '' }, lineNumbers: { default: false } },
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (d) => ({ params: d.getAttribute('data-lang') || '', lineNumbers: d.hasAttribute('data-linenums') }) }],
      toDOM: (n) => ['pre', { class: 'pm-code', 'data-lang': n.attrs.params, ...(n.attrs.lineNumbers ? { 'data-linenums': '' } : {}) }, ['code', 0]],
    },
    image: {
      inline: true, group: 'inline', draggable: true,
      attrs: { src: {}, alt: { default: '' }, title: { default: '' }, width: { default: null }, align: { default: 'center' }, wrap: { default: 'topbottom' }, drawing: { default: null }, rev: { default: 0 } },
      parseDOM: [{ tag: 'img[data-src]', getAttrs: (d) => ({ src: d.getAttribute('data-src'), alt: d.getAttribute('alt') || '' }) }],
      toDOM: (n) => ['img', { 'data-src': n.attrs.src, src: assetUrl(n.attrs.src), alt: n.attrs.alt }],
    },
    footnote: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { text: { default: '' } },
      parseDOM: [{ tag: 'sup.pm-fn', getAttrs: (d) => ({ text: d.getAttribute('data-text') || '' }) }],
      toDOM: (n) => ['sup', { class: 'pm-fn', 'data-text': n.attrs.text }],
    },
    citation: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { ref: {}, locator: { default: '' } },
      parseDOM: [{ tag: 'span.pm-cite', getAttrs: (d) => ({ ref: d.getAttribute('data-ref'), locator: d.getAttribute('data-locator') || '' }) }],
      toDOM: (n) => ['span', { class: 'pm-cite', 'data-ref': n.attrs.ref, 'data-locator': n.attrs.locator }],
    },
    math: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { tex: { default: '' }, display: { default: false } },
      parseDOM: [{ tag: 'span.pm-math', getAttrs: (d) => ({ tex: d.getAttribute('data-tex') || '', display: d.hasAttribute('data-display') }) }],
      toDOM: (n) => ['span', { class: 'pm-math', 'data-tex': n.attrs.tex, ...(n.attrs.display ? { 'data-display': '' } : {}) }],
    },
    ...tableNodes({
      tableGroup: 'block', cellContent: 'inline*',
      cellAttributes: {
        align: {
          default: null,
          getFromDOM: (d) => d.style.textAlign || null,
          setDOMAttr: (v, attrs) => { if (v) attrs.style = `${attrs.style || ''}text-align:${v};`; },
        },
      },
    }),
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks: {
    comment: {
      attrs: { id: {} }, inclusive: false,
      parseDOM: [{ tag: 'span[data-comment]', getAttrs: (d) => ({ id: d.getAttribute('data-comment') }) }],
      toDOM: (m) => ['span', { class: 'pm-comment', 'data-comment': m.attrs.id }, 0],
    },
    em: { parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: (v) => /^(bold(er)?|[5-9]\d{2,})$/.test(v) && null }], toDOM: () => ['strong', 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }], toDOM: () => ['u', 0] },
    subscript: { excludes: 'superscript', parseDOM: [{ tag: 'sub' }], toDOM: () => ['sub', 0] },
    superscript: { excludes: 'subscript', parseDOM: [{ tag: 'sup:not(.pm-fn)' }], toDOM: () => ['sup', 0] },
    /* Writer's highlighter — shown while writing, left out of the book. */
    highlight: {
      attrs: { color: { default: 'yellow' }, size: { default: 'full' } }, inclusive: false, excludes: 'highlight',
      parseDOM: [{ tag: 'span.pm-hl', getAttrs: (d) => ({ color: d.dataset.color || 'yellow', size: d.dataset.size || 'full' }) }],
      toDOM: (m) => ['span', { class: `pm-hl hl-${m.attrs.color} hl-${m.attrs.size}`, 'data-color': m.attrs.color, 'data-size': m.attrs.size }, 0],
    },
    link: {
      attrs: { href: {}, title: { default: null } }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: (d) => ({ href: d.getAttribute('href'), title: d.getAttribute('title') }) }],
      toDOM: (n) => ['a', { href: n.attrs.href, title: n.attrs.title, rel: 'noopener noreferrer' }, 0],
    },
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  },
});

/* ------------------------------------------------------ markdown ↔ doc */

const tokenizer = createMarkdown({ typographer: false });
let parseDefs = new Map();
const parser = new MarkdownParser(schema, tokenizer, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: { block: 'bullet_list', getAttrs: (tok, tokens, i) => ({ tight: listIsTight(tokens, i), symbol: cleanBullet(tok.meta?.bullet) }) },
  ordered_list: { block: 'ordered_list', getAttrs: (tok, tokens, i) => ({ order: +tok.attrGet('start') || 1, tight: listIsTight(tokens, i) }) },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: Math.min(6, Math.max(1, +tok.tag.slice(1))) }) },
  align: { block: 'align', getAttrs: (tok) => ({ align: tok.meta?.align || 'center' }) },
  hl: { mark: 'highlight', getAttrs: (tok) => ({ color: tok.meta?.color || 'yellow', size: tok.meta?.size || 'full' }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (tok) => { const i = parseCodeInfo(tok.info); return { params: i.lang === 'auto' ? '' : i.lang, lineNumbers: i.lineNumbers }; }, noCloseToken: true },
  hr: { node: 'horizontal_rule' },
  pagebreak: { node: 'page_break' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: safeAssetPath(tok.attrGet('src')) || '', title: tok.attrGet('title') || '',
      alt: (tok.children && tok.children[0] && tok.children[0].content) || '',
      width: tok.meta?.width || null, align: tok.meta?.align || 'center', wrap: tok.meta?.wrap || 'topbottom', drawing: tok.meta?.drawing || null,
    }),
  },
  fnref: { node: 'footnote', getAttrs: (tok) => ({ text: parseDefs.get(tok.meta.label) || '' }) },
  cite: { node: 'citation', getAttrs: (tok) => ({ ref: tok.meta.ref, locator: tok.meta.locator || '' }) },
  math: { node: 'math', getAttrs: (tok) => ({ tex: tok.meta.tex, display: !!tok.meta.display }) },
  hardbreak: { node: 'hard_break' },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header', getAttrs: (tok) => ({ align: cellAlign(tok) }) },
  td: { block: 'table_cell', getAttrs: (tok) => ({ align: cellAlign(tok) }) },
  comment: { mark: 'comment', getAttrs: (tok) => ({ id: tok.meta.id }) },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strike' },
  u: { mark: 'underline' },
  sub: { mark: 'subscript' },
  sup: { mark: 'superscript' },
  link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }) },
  code_inline: { mark: 'code', noCloseToken: true },
});
function cellAlign(tok) {
  const m = /text-align:\s*(left|center|right)/.exec(tok.attrGet('style') || '');
  return m ? m[1] : null;
}
function listIsTight(tokens, i) {
  while (++i < tokens.length) if (tokens[i].type !== 'list_item_open') return tokens[i].hidden;
  return false;
}

export function parseMarkdownDoc(md) {
  const { body, defs } = extractFootnotes(md || '');
  parseDefs = defs;
  try {
    const doc = parser.parse(body);
    return doc.childCount ? doc : schema.node('doc', null, [schema.node('paragraph')]);
  } catch (err) {
    console.error('Markdown parse failed', err);
    return schema.node('doc', null, [schema.node('paragraph', null, md ? [schema.text(md)] : [])]);
  } finally { parseDefs = new Map(); }
}

let notesOut = [];
const serializer = new MarkdownSerializer({
  ...defaultMarkdownSerializer.nodes,
  code_block(state, node) {
    // ```lang linenums — a longer fence when the code itself contains ```.
    const ticks = node.textContent.match(/`{3,}/gm);
    const fence = ticks ? `${ticks.sort().slice(-1)[0]}\`` : '```';
    state.write(`${fence}${codeInfo(node.attrs.params, node.attrs.lineNumbers)}\n`);
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write(fence);
    state.closeBlock(node);
  },
  bullet_list(state, node, parent, index) {
    const b = cleanBullet(node.attrs.symbol);
    if (!b) { defaultMarkdownSerializer.nodes.bullet_list(state, node, parent, index); return; }
    state.write(`::: bullets ${b}\n`);
    defaultMarkdownSerializer.nodes.bullet_list(state, node, parent, index);
    state.ensureNewLine();
    state.write(':::');
    state.closeBlock(node);
  },
  horizontal_rule(state, node) { state.write('* * *'); state.closeBlock(node); },
  page_break(state, node) { state.write('\\newpage'); state.closeBlock(node); },
  image(state, node) {
    const a = node.attrs;
    const wrap = a.wrap && a.wrap !== 'topbottom' && a.wrap !== true ? a.wrap : a.wrap === true ? 'square' : '';
    const attrs = [a.width ? `width=${a.width}%` : '', a.align && a.align !== 'center' ? `align=${a.align}` : '', wrap ? `wrap=${wrap}` : '', a.drawing ? `drawing=${a.drawing}` : ''].filter(Boolean).join(' ');
    state.write(`![${state.esc(a.alt || '')}](${a.src}${a.title ? ` "${a.title.replace(/"/g, '\\"')}"` : ''})${attrs ? `{${attrs}}` : ''}`);
  },
  citation(state, node) {
    const loc = String(node.attrs.locator || '').replace(/[\]\n]/g, '').trim();
    state.write(`[@${node.attrs.ref}${loc ? `, ${loc}` : ''}]`);
  },
  table(state, node) {
    const rows = [];
    node.forEach((row) => { const cells = []; row.forEach((cell) => cells.push(cell)); rows.push(cells); });
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const text = (cell) => (cell ? serializer.serialize(schema.node('doc', null, [schema.node('paragraph', null, cell.content)])).trim().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|') : '');
    const line = (cells) => `| ${Array.from({ length: cols }, (_, i) => text(cells[i]) || ' ').join(' | ')} |`;
    const al = Array.from({ length: cols }, (_, i) => rows[0][i]?.attrs.align || rows[1]?.[i]?.attrs.align);
    const rule = `| ${al.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---')).join(' | ')} |`;
    const out = [line(rows[0]), rule, ...rows.slice(1).map(line)];
    out.forEach((l, i) => { state.write(l); if (i < out.length - 1) state.ensureNewLine(); });
    state.closeBlock(node);
  },
  table_row() {},
  table_header() {},
  table_cell() {},
  math(state, node) {
    const tex = String(node.attrs.tex || '').replace(/\$/g, '\\$').trim();
    state.write(node.attrs.display ? `$$${tex}$$` : `$${tex}$`);
  },
  align(state, node) {
    state.write(`::: ${node.attrs.align}\n`);
    state.renderContent(node);
    state.write(':::');
    state.closeBlock(node);
  },
  footnote(state, node) {
    notesOut.push(String(node.attrs.text || '').replace(/\s*\n\s*/g, ' ').trim());
    state.write(`[^${notesOut.length}]`);
  },
}, {
  ...defaultMarkdownSerializer.marks,
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  underline: { open: '++', close: '++', mixable: true, expelEnclosingWhitespace: true },
  subscript: { open: '~', close: '~', mixable: false, expelEnclosingWhitespace: true },
  superscript: { open: '^', close: '^', mixable: false, expelEnclosingWhitespace: true },
  highlight: { open: (_s, m) => (m.attrs.color === 'yellow' && m.attrs.size === 'full' ? '==' : `=={${m.attrs.color},${m.attrs.size}}`), close: '==', mixable: true, expelEnclosingWhitespace: true },
  comment: { open: '{==', close: (_state, mark) => `==}{>>#${mark.attrs.id}<<}`, mixable: false, expelEnclosingWhitespace: true },
}, { escapeExtraCharacters: /[$^~]|\+(?=\+)/g });

export function docToMarkdown(doc) {
  notesOut = [];
  let md = serializer.serialize(doc, { tightLists: true }).trimEnd();
  if (notesOut.length) md += '\n\n' + notesOut.map((t, i) => `[^${i + 1}]: ${t}`).join('\n');
  return md + '\n';
}

/* ---------------------------------------------------------------- commands */

const markActive = (state, type) => {
  const { from, $from, to, empty } = state.selection;
  return empty ? !!type.isInSet(state.storedMarks || $from.marks()) : state.doc.rangeHasMark(from, to, type);
};
const blockIs = (state, type, attrs = {}) => {
  const { $from } = state.selection;
  const n = $from.parent;
  return n.type === type && Object.entries(attrs).every(([k, v]) => n.attrs[k] === v);
};
const inAncestor = (state, type) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true;
  return false;
};

function insertNode(node) {
  return (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    return true;
  };
}
function insertPageBreak(state, dispatch) { return insertBlockBreak(schema.nodes.page_break, state, dispatch); }
function insertSceneBreak(state, dispatch) { return insertBlockBreak(schema.nodes.horizontal_rule, state, dispatch); }
function insertBlockBreak(type, state, dispatch) {
  const { $from } = state.selection;
  const hr = type.create();
  if (dispatch) {
    const pos = $from.after(1);
    const tr = state.tr.insert(pos, [hr, schema.nodes.paragraph.create()]);
    tr.setSelection(TextSelection.create(tr.doc, pos + 2));
    dispatch(tr.scrollIntoView());
  }
  return true;
}
/** In verse, Enter keeps the line in the stanza; Enter on an empty line starts the next stanza. */
function verseEnter(state, dispatch) {
  const { $from, empty } = state.selection;
  let inVerse = false;
  for (let d = $from.depth; d > 0; d--) { const n = $from.node(d); if (n.type === schema.nodes.align && n.attrs.align === 'verse') { inVerse = true; break; } }
  if (!inVerse || !empty || $from.parent.type !== schema.nodes.paragraph) return false;
  const before = $from.nodeBefore;
  if (before && before.type === schema.nodes.hard_break) {
    if (dispatch) {
      const tr = state.tr.delete($from.pos - before.nodeSize, $from.pos);
      dispatch(tr.split(tr.mapping.map($from.pos)).scrollIntoView());
    }
    return true;
  }
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
}

function clearFormatting(state, dispatch) {
  const { from, to } = state.selection;
  if (dispatch) {
    let tr = state.tr;
    for (const m of ['em', 'strong', 'strike', 'underline', 'subscript', 'superscript', 'highlight', 'link', 'code']) tr = tr.removeMark(from, to, schema.marks[m]);
    dispatch(tr);
  }
  return setBlockType(schema.nodes.paragraph)(state, dispatch) || true;
}

/* -------------------------------------------------------------- node views */

export const WRAP_OPTIONS = [
  { value: 'inline', label: 'In Line with Text', short: 'In line', icon: 'wrapInline', hint: 'Sits in the line like a word' },
  { value: 'square', label: 'Square', short: 'Square', icon: 'wrap', hint: 'Text wraps a box' },
  { value: 'tight', label: 'Tight', short: 'Tight', icon: 'wrapTight', hint: 'Follows the image outline*' },
  { value: 'through', label: 'Through', short: 'Through', icon: 'wrapTight', hint: 'Fills transparent areas*' },
  { value: 'topbottom', label: 'Top and Bottom', short: 'Top & bottom', icon: 'wrapTopBottom', hint: 'Own line, no wrapping' },
  { value: 'behind', label: 'Behind Text', short: 'Behind', icon: 'wrapBehind', hint: 'Under the text†' },
  { value: 'front', label: 'In Front of Text', short: 'In front', icon: 'wrapFront', hint: 'Over the text†' },
];

class ImageView {
  constructor(node, view, getPos, ctx) {
    this.node = node; this.view = view; this.getPos = getPos; this.ctx = ctx;
    this.img = h('img', { src: assetUrl(node.attrs.src), alt: node.attrs.alt, draggable: false });
    this.handle = h('span', { class: 'pm-img-handle', title: 'Drag to resize' });
    this.badge = h('span', { class: 'pm-img-badge' });
    this.bar = this.buildBar();
    this.dom = h('span', { class: 'pm-img', contenteditable: 'false' }, this.img, this.handle, this.badge, this.bar);
    this.apply(node);
    this.handle.addEventListener('mousedown', (e) => this.startResize(e));
    this.dom.addEventListener('dblclick', () => (this.node.attrs.drawing ? ctx.editDrawing : ctx.editImage)?.(this.getPos(), this.node));
  }
  set(attrs) {
    const pos = this.getPos();
    const next = { ...this.node.attrs, ...attrs };
    const tr = this.view.state.tr.setNodeMarkup(pos, null, next);
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }
  buildBar() {
    const b = (label, title, fn, cls = '') => {
      const el = h('button', { type: 'button', class: `pib ${cls}`, title, 'aria-label': title }, label);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
      return el;
    };
    this.sizeBtns = [25, 33, 50, 75, 100].map((p) => b(`${p}%`, `Width ${p}%`, () => this.set({ width: p === 100 ? null : p, align: this.node.attrs.align === 'full' ? 'center' : this.node.attrs.align }), 'size'));
    this.alignBtns = {
      left: b(icon('alignLeft', 16), 'Align left', () => this.set({ align: 'left' })),
      center: b(icon('alignCenter', 16), 'Center', () => this.set({ align: 'center' })),
      right: b(icon('alignRight', 16), 'Align right', () => this.set({ align: 'right' })),
      full: b(icon('alignFull', 16), 'Full width', () => this.set({ align: 'full', width: null })),
    };
    this.wrapLbl = h('span', {});
    this.wrapBtn = b(h('span', { class: 'pib-wrap' }, icon('wrap', 16), this.wrapLbl, icon('chevron', 12)), 'Text wrapping', () => {
      popover(this.wrapBtn, WRAP_OPTIONS.map((o) => ({
        label: o.label, icon: o.icon, hint: o.hint, onClick: () => {
          const a = this.node.attrs;
          const patch = { wrap: o.value };
          if (['square', 'tight', 'through'].includes(o.value) && !['left', 'right'].includes(a.align)) patch.align = 'left';
          if (o.value !== 'topbottom' && o.value !== 'inline' && (!a.width || a.width > 75) && a.align !== 'full') patch.width = 40;
          if (o.value === 'inline' && (!a.width || a.width > 50)) patch.width = 25;
          this.set(patch);
        },
      })), { width: 300 });
    }, 'wrap');
    const more = b(icon('gear', 15), 'Alt text & caption…', () => this.ctx.editImage?.(this.getPos(), this.node));
    this.drawBtn = b(h('span', { class: 'pib-wrap' }, icon('pen', 15), h('span', {}, 'Edit Drawing')), 'Edit drawing', () => this.ctx.editDrawing?.(this.getPos(), this.node), 'draw');
    const del = b(icon('trash', 15), 'Delete image', () => { const pos = this.getPos(); this.view.dispatch(this.view.state.tr.delete(pos, pos + 1)); this.view.focus(); }, 'danger');
    const sep = () => h('span', { class: 'pib-sep' });
    return h('span', { class: 'pm-img-bar', contenteditable: 'false' }, this.drawBtn, ...this.sizeBtns, sep(), ...Object.values(this.alignBtns), sep(), this.wrapBtn, sep(), more, del);
  }
  apply(node) {
    const a = node.attrs;
    if (this.img.dataset.rev !== String(a.rev)) { this.img.src = assetUrl(a.src); this.img.dataset.rev = String(a.rev); }
    this.drawBtn.hidden = !a.drawing;
    const wrap = a.wrap === true ? 'square' : a.wrap || 'topbottom';
    const w = a.align === 'full' ? 100 : a.width || (wrap === 'topbottom' ? 100 : wrap === 'inline' ? 25 : 40);
    this.dom.style.width = `${w}%`;
    this.dom.dataset.align = a.align || 'center';
    this.dom.dataset.wrap = wrap;
    this.img.style.shapeOutside = '';
    this.dom.style.shapeOutside = wrap === 'tight' || wrap === 'through' ? `url("${assetUrl(a.src)}")` : '';
    this.wrapLbl.textContent = WRAP_OPTIONS.find((o) => o.value === wrap)?.short || 'Wrap';
    this.badge.textContent = `${w}%`;
    for (const btn of this.sizeBtns) btn.classList.toggle('on', a.align !== 'full' && Number(btn.textContent.replace('%', '')) === w);
    for (const [k, btn] of Object.entries(this.alignBtns)) btn.classList.toggle('on', (a.align || 'center') === k);
  }
  startResize(e) {
    e.preventDefault(); e.stopPropagation();
    const content = this.view.dom.getBoundingClientRect().width - 64;
    const startX = e.clientX;
    const startW = this.dom.getBoundingClientRect().width;
    const a = this.node.attrs;
    const factor = a.align === 'center' || a.align === 'full' ? 2 : a.align === 'right' ? -1 : 1;
    let pct = a.width || 100;
    const move = (ev) => {
      pct = Math.round(Math.min(100, Math.max(10, ((startW + (ev.clientX - startX) * factor) / content) * 100)));
      this.dom.style.width = `${pct}%`;
      this.badge.textContent = `${pct}%`;
      this.dom.classList.add('resizing');
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.dom.classList.remove('resizing');
      this.set({ width: pct === 100 ? null : pct, align: a.align === 'full' ? 'center' : a.align });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  update(node) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.src !== this.node.attrs.src) this.img.src = assetUrl(node.attrs.src);
    this.node = node; this.apply(node);
    return true;
  }
  selectNode() { this.dom.classList.add('selected'); }
  deselectNode() { this.dom.classList.remove('selected'); }
  stopEvent(e) { return e.target === this.handle || this.bar.contains(e.target); }
  ignoreMutation() { return true; }
}

class CitationView {
  constructor(node, view, getPos, ctx) {
    this.node = node; this.ctx = ctx;
    this.dom = h('span', { class: 'pm-cite' });
    this.draw();
    this.dom.addEventListener('mousedown', (e) => { e.preventDefault(); ctx.editCitation?.(getPos(), this.node); });
  }
  draw() {
    const text = this.ctx.formatCitation ? this.ctx.formatCitation(this.node.attrs.ref, this.node.attrs.locator) : `(${this.node.attrs.ref})`;
    this.dom.textContent = text;
    this.dom.classList.toggle('missing', /missing source/.test(text));
    this.dom.title = 'Citation — click to edit';
  }
  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.draw(); return true; }
  ignoreMutation() { return true; }
}

class MathView {
  constructor(node, view, getPos, ctx) {
    this.node = node;
    this.dom = h('span', { class: 'pm-math', contenteditable: 'false' });
    this.draw();
    this.dom.addEventListener('mousedown', (e) => { e.preventDefault(); ctx.editMath?.(getPos(), this.node); });
  }
  draw() {
    const { tex, display } = this.node.attrs;
    setHtml(this.dom, texToMathml(tex, display).html);
    this.dom.classList.toggle('display', !!display);
    this.dom.title = `${tex}\n\nClick to edit`;
  }
  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.draw(); return true; }
  ignoreMutation() { return true; }
  stopEvent() { return false; }
}

class FootnoteView {
  constructor(node, view, getPos, ctx) {
    this.node = node;
    this.dom = h('sup', { class: 'pm-fn', title: node.attrs.text || '(empty note)' });
    this.dom.addEventListener('mousedown', (e) => { e.preventDefault(); ctx.editFootnote?.(getPos(), this.node); });
  }
  update(node) { if (node.type !== this.node.type) return false; this.node = node; this.dom.title = node.attrs.text || '(empty note)'; return true; }
  ignoreMutation() { return true; }
}

/* ------------------------------------------------------------------ editor */

function buildInputRules() {
  const rules = [...smartQuotes, ellipsis, emDash];
  rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));
  rules.push(wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (m) => ({ order: +m[1] }), (m, n) => n.childCount + n.attrs.order === +m[1]));
  rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list));
  rules.push(textblockTypeInputRule(/^(#{1,3})\s$/, schema.nodes.heading, (m) => ({ level: Math.max(2, m[1].length) })));
  rules.push(textblockTypeInputRule(/^```([\w+#.-]*)\s$/, schema.nodes.code_block, (m) => ({ params: normalizeLang(m[1]) || '' })));
  rules.push(new InputRule(/^(?:\*\s?\*\s?\*|---|___)$/, (state, _m, start, end) => {
    const $s = state.doc.resolve(start);
    if ($s.parent.type !== schema.nodes.paragraph || $s.parent.textContent.length > 3) return null;
    return state.tr.replaceRangeWith($s.before(), $s.after(), schema.nodes.horizontal_rule.create());
  }));
  return inputRules({ rules });
}

/** Syntax highlighting inside code blocks (the same highlighter the book uses). */
function codeDecorations(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.code_block) return true;
    const text = node.textContent;
    if (text && text.length < 50000) for (const r of highlightRanges(text, node.attrs.params)) decos.push(Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, { class: r.cls }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}
const codeHighlight = new Plugin({
  state: {
    init: (_c, state) => codeDecorations(state.doc),
    apply: (tr, old) => (tr.docChanged ? codeDecorations(tr.doc) : old),
  },
  props: { decorations(state) { return this.getState(state); } },
});

/** Code block with a language picker, a line-numbers switch and a number gutter. */
class CodeBlockView {
  constructor(node, view, getPos) {
    this.node = node;
    this.sel = h('select', { class: 'pm-code-lang', 'aria-label': 'Code language', contenteditable: 'false' });
    let group = null;
    for (const [id, label, g] of CODE_LANGUAGES) {
      if (g !== group?.label) { group = h('optgroup', { label: g }); this.sel.append(group); }
      group.append(h('option', { value: id }, label));
    }
    this.sel.value = normalizeLang(node.attrs.params);
    const set = (attrs) => { view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...this.node.attrs, ...attrs })); view.focus(); };
    this.sel.addEventListener('change', () => set({ params: this.sel.value }));
    this.ln = h('input', { type: 'checkbox', checked: !!node.attrs.lineNumbers, 'aria-label': 'Show line numbers' });
    this.ln.addEventListener('change', () => set({ lineNumbers: this.ln.checked }));
    const lnLabel = h('label', { class: 'pm-code-ln', title: 'Show line numbers in the book' }, this.ln, h('span', {}, 'Line numbers'));
    for (const el of [this.sel, lnLabel]) el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.bar = h('div', { class: 'pm-code-bar', contenteditable: 'false' }, icon('code', 13), this.sel, h('span', { class: 'spacer' }), lnLabel);
    this.gutter = h('div', { class: 'pm-code-gutter', contenteditable: 'false', 'aria-hidden': 'true' });
    this.code = h('code');
    this.pre = h('pre', { class: 'pm-code' }, this.code);
    this.dom = h('div', { class: 'pm-code-wrap' }, this.bar, h('div', { class: 'pm-code-body' }, this.gutter, this.pre));
    this.contentDOM = this.code;
    this.drawNumbers();
  }
  drawNumbers() {
    const on = !!this.node.attrs.lineNumbers;
    this.dom.classList.toggle('linenums', on);
    this.gutter.hidden = !on;
    if (!on) return;
    const n = this.node.textContent.split('\n').length;
    if (this.gutter.dataset.n !== String(n)) { this.gutter.dataset.n = String(n); this.gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  }
  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const v = normalizeLang(node.attrs.params);
    if (this.sel.value !== v) this.sel.value = v;
    this.ln.checked = !!node.attrs.lineNumbers;
    this.drawNumbers();
    return true;
  }
  stopEvent(e) { return this.bar.contains(e.target); }
  ignoreMutation(m) { return !this.contentDOM.contains(m.target); }
}

/** Marks the top-level block holding the cursor (used by Focus mode dimming). */
/* ---- content search: highlight every match of the current query */
export const searchKey = new PluginKey('lutefisk-search');
/** Text of each textblock with one character per position (leaf nodes become U+FFFC). */
export function textblocks(doc) {
  const out = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    out.push({ pos: pos + 1, text: node.textBetween(0, node.content.size, '', '\ufffc') });
    return false;
  });
  return out;
}
export function searchRegex(query, { caseSensitive = false, wholeWord = false } = {}) {
  const q = String(query || '').trim();
  if (!q) return null;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]").replace(/["“”]/g, '["“”]');
  return new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, `gu${caseSensitive ? '' : 'i'}`);
}
export function findMatches(doc, re) {
  const out = [];
  if (!re) return out;
  for (const b of textblocks(doc)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(b.text))) { if (!m[0].length) { re.lastIndex++; continue; } out.push({ from: b.pos + m.index, to: b.pos + m.index + m[0].length, text: b.text, at: m.index, len: m[0].length }); }
  }
  return out;
}
/** Replace matches in a transaction (back to front so positions stay valid). Keeps the formatting of each match. */
export function replaceMatches(tr, matches, replacement) {
  for (const m of [...matches].sort((a, b) => b.from - a.from)) {
    const marks = tr.doc.resolve(m.from + 1 <= m.to ? m.from + 1 : m.from).marks();
    if (replacement) tr.replaceWith(m.from, m.to, schema.text(replacement, marks));
    else tr.delete(m.from, m.to);
  }
  return tr;
}
/** Find-and-replace on Markdown outside the editor; returns { md, count }. */
export function replaceInMarkdown(md, re, replacement) {
  const doc = parseMarkdownDoc(md);
  const ms = findMatches(doc, re);
  if (!ms.length) return { md, count: 0 };
  const st = EditorState.create({ doc });
  const tr = replaceMatches(st.tr, ms, replacement);
  return { md: docToMarkdown(tr.doc), count: ms.length };
}

const searchPlugin = new Plugin({
  key: searchKey,
  state: {
    init: () => ({ re: null, active: -1, deco: DecorationSet.empty }),
    apply(tr, old, _o, state) {
      const meta = tr.getMeta(searchKey);
      if (!meta && !tr.docChanged) return old;
      const re = meta ? meta.re : old.re;
      const active = meta ? meta.active ?? -1 : -1;
      if (!re) return { re: null, active: -1, deco: DecorationSet.empty };
      const ms = findMatches(state.doc, re);
      return { re, active, deco: DecorationSet.create(state.doc, ms.map((m, i) => Decoration.inline(m.from, m.to, { class: i === active ? 'pm-hit active' : 'pm-hit' }))) };
    },
  },
  props: { decorations(state) { return searchKey.getState(state).deco; } },
});

const currentBlock = new Plugin({
  props: {
    decorations(state) {
      const { $head } = state.selection;
      if (!$head.depth) return null;
      const from = $head.before(1);
      const node = state.doc.nodeAt(from);
      if (!node) return null;
      return DecorationSet.create(state.doc, [Decoration.node(from, from + node.nodeSize, { class: 'pm-current' })]);
    },
  },
});

/** The same token colors as the book, inside the editor's code blocks. */
let codeStyled = false;
function styleCodeBlocks() {
  if (codeStyled) return;
  codeStyled = true;
  document.head.append(h('style', { id: 'lutefisk-code-colors' }, CODE_CSS('.pm-code')));
}

export function createEditor(mount, ctx) {
  styleCodeBlocks();
  const toolbar = h('div', { class: 'ql-toolbar', role: 'toolbar', 'aria-label': 'Formatting' });
  const area = h('div', { class: 'ql-container' });
  mount.append(toolbar, area);

  const keys = {
    'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em),
    'Mod-Shift-x': toggleMark(schema.marks.strike), 'Mod-k': () => { linkCmd(); return true; },
    'Mod-u': toggleMark(schema.marks.underline), 'Mod-,': toggleMark(schema.marks.subscript), 'Mod-.': toggleMark(schema.marks.superscript),
    'Mod-Alt-0': setBlockType(schema.nodes.paragraph), 'Mod-Alt-2': setBlockType(schema.nodes.heading, { level: 2 }), 'Mod-Alt-3': setBlockType(schema.nodes.heading, { level: 3 }),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
    Enter: chainCommands(verseEnter, splitListItem(schema.nodes.list_item)), 'Mod-[': liftListItem(schema.nodes.list_item), 'Mod-]': sinkListItem(schema.nodes.list_item),
    'Mod-Alt-f': () => { footnoteCmd(); return true; },
    'Mod-Alt-c': () => { citeCmd(); return true; },
    'Mod-Alt-e': () => { mathCmd(); return true; },
    'Mod-Alt-i': () => { symbolCmd(); return true; },
    'Mod-Alt-m': () => { commentCmd(); return true; },
    'Mod-Enter': insertPageBreak,
    'Mod-Shift-e': (st, d) => alignCmd('center')(st, d),
    'Mod-Shift-.': (st, d) => (inAncestor(st, schema.nodes.blockquote) ? lift(st, d) : wrapIn(schema.nodes.blockquote)(st, d)),
    'Mod->': (st, d) => (inAncestor(st, schema.nodes.blockquote) ? lift(st, d) : wrapIn(schema.nodes.blockquote)(st, d)),
  };
  const tableKeys = keymap({ Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) });
  const inCode = (state) => state.selection.$from.parent.type === schema.nodes.code_block;
  const codeKeys = keymap({
    Tab: (state, dispatch) => { if (!inCode(state)) return false; dispatch?.(state.tr.insertText('  ')); return true; },
    'Shift-Tab': (state) => inCode(state),
    'Mod-Enter': (state, dispatch) => (inCode(state) ? exitCode(state, dispatch) : false),
    'Shift-Enter': (state, dispatch) => (inCode(state) ? exitCode(state, dispatch) : false),
  });
  const plugins = [tableEditing(), tableKeys, codeKeys, codeHighlight, buildInputRules(), keymap(keys), keymap(baseKeymap), dropCursor(), gapCursor(), history(), currentBlock, searchPlugin];
  const mkState = (doc) => EditorState.create({ doc, plugins });

  const view = new EditorView(area, {
    state: mkState(parseMarkdownDoc('')),
    attributes: { class: 'ql-editor book-editor', spellcheck: 'true', 'aria-label': 'Chapter text' },
    nodeViews: {
      image: (n, v, p) => new ImageView(n, v, p, api),
      footnote: (n, v, p) => new FootnoteView(n, v, p, api),
      citation: (n, v, p) => new CitationView(n, v, p, ctx),
      math: (n, v, p) => new MathView(n, v, p, ctx),
      code_block: (n, v, p) => new CodeBlockView(n, v, p),
    },
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr);
      view.updateState(newState);
      refreshToolbar();
      ctx.onChange?.(tr, newState);
    },
    handleDOMEvents: {
      drop: (_v, e) => {
        // A snippet dragged from the Snippets panel lands where it's dropped.
        if (e.dataTransfer?.types?.includes(SNIPPET_MIME)) {
          e.preventDefault();
          const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
          ctx.dropSnippet?.(e.dataTransfer.getData(SNIPPET_MIME), at ? at.pos : view.state.selection.from);
          return true;
        }
        if (e.dataTransfer?.files?.length) { e.preventDefault(); return true; }
        return false;
      },
      paste: (_v, e) => { if ([...(e.clipboardData?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); return true; } return false; },
      contextmenu: (_v, e) => { e.preventDefault(); contextMenu(e); return true; },
    },
    transformPastedHTML: (html) => html.replace(/<img[^>]*>/gi, ''),
  });

  /* ---- toolbar */
  const run = (cmd) => () => { cmd(view.state, view.dispatch, view); view.focus(); };
  const btn = (name, title, cmd, isActive) => {
    const b = h('button', { type: 'button', class: `ql-${name}`, title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: run(cmd) }, icon(name));
    b._active = isActive;
    return b;
  };
  /* ---- block styles: paragraph, headings, blockquote, verse, hanging indent */
  const BLOCK_STYLES = [['p', 'Paragraph'], ...[1, 2, 3, 4, 5, 6].map((l) => [`h${l}`, `Heading ${l}`]), ['quote', 'Blockquote'], ['verse', 'Verse'], ['hanging', 'Hanging Indent']];
  const styleSel = h('select', { class: 'ql-header', title: 'Paragraph style', 'aria-label': 'Paragraph style' },
    BLOCK_STYLES.map(([v, l]) => h('option', { value: v }, l)));
  /** The wrapper that gives the cursor its style: a blockquote, or a verse/hanging block. */
  function styleWrapper(state) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d);
      if (n.type === schema.nodes.blockquote) return 'quote';
      if (n.type === schema.nodes.align && (n.attrs.align === 'verse' || n.attrs.align === 'hanging')) return n.attrs.align;
    }
    return null;
  }
  function currentBlockStyle(state) {
    const w = styleWrapper(state);
    if (w) return w;
    const p = state.selection.$from.parent;
    return p.type === schema.nodes.heading ? `h${p.attrs.level}` : 'p';
  }
  function setBlockStyle(v) {
    for (let guard = 0; guard < 6 && styleWrapper(view.state); guard++) if (!lift(view.state, view.dispatch)) break;
    if (/^h[1-6]$/.test(v)) setBlockType(schema.nodes.heading, { level: Number(v.slice(1)) })(view.state, view.dispatch);
    else setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
    if (v === 'quote') wrapIn(schema.nodes.blockquote)(view.state, view.dispatch);
    if (v === 'verse' || v === 'hanging') wrapIn(schema.nodes.align, { align: v })(view.state, view.dispatch);
    view.focus();
  }
  styleSel.addEventListener('change', () => setBlockStyle(styleSel.value));

  /** The extent of the link mark around the cursor, if any. */
  function linkRange(state) {
    const { $from, from, to } = state.selection;
    const type = schema.marks.link;
    const at = (pos) => { const $p = state.doc.resolve(pos); return type.isInSet($p.marks()) || ($p.nodeAfter && type.isInSet($p.nodeAfter.marks)); };
    const mark = at(from);
    if (!mark) return null;
    const parent = $from.parent, start = $from.start();
    let a = from, b = to;
    parent.forEach((child, offset) => {
      const cs = start + offset, ce = cs + child.nodeSize;
      if (mark.isInSet(child.marks) && ce >= a && cs <= b) { a = Math.min(a, cs); b = Math.max(b, ce); }
    });
    // Keep only the run that touches the cursor.
    return { from: a, to: b, href: mark.attrs.href };
  }
  async function linkCmd() {
    const { state } = view;
    const existing = linkRange(state);
    const { from, to } = existing || state.selection;
    const selText = state.doc.textBetween(from, to, ' ');
    const res = await dialog({
      title: existing ? 'Edit link' : 'Insert link',
      message: existing ? 'Clear the web address to remove the link.' : null,
      fields: [
        { name: 'text', label: 'Name (the words shown)', value: selText.trim(), placeholder: 'e.g. Project Gutenberg' },
        { name: 'href', label: 'Web address (URL)', placeholder: 'https://', value: existing?.href || 'https://' },
      ], ok: existing ? 'Save' : 'Insert',
    });
    if (!res) { view.focus(); return; }
    let href = res.href.trim();
    const text = res.text.replace(/\s+/g, ' ').trim();
    const tr = view.state.tr;
    if (!href || href === 'https://') {
      if (existing) view.dispatch(tr.removeMark(from, to, schema.marks.link));
      view.focus(); return;
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && /^[\w-]+(\.[\w-]+)+/.test(href)) href = `https://${href}`;
    if (!/^(https?:\/\/|mailto:)/i.test(href)) { toast('Links must start with https://, http:// or mailto:', 'error'); view.focus(); return; }
    const mark = schema.marks.link.create({ href });
    // Leave spaces at either end of the selection outside the link.
    const lead = selText.length - selText.trimStart().length, trail = selText.length - selText.trimEnd().length;
    let a = from, b = to;
    if (selText.trim() && from !== to && selText.length === to - from) { a = from + lead; b = to - trail; }
    const shown = view.state.doc.textBetween(a, b, ' ');
    const name = text || shown || href;
    if (name !== shown || a === b) {
      const marks = view.state.doc.resolve(a).marks().filter((m) => m.type !== schema.marks.link);
      tr.replaceWith(a, b, schema.text(name, [...marks, mark]));
      tr.setSelection(TextSelection.create(tr.doc, a + name.length));
    } else {
      tr.removeMark(a, b, schema.marks.link).addMark(a, b, mark);
    }
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }
  /** A list with a bullet of the author's choosing (★, ➤, ✓, ❧…). */
  async function customBulletCmd() {
    const presets = ['•', '◦', '▪', '–', '—', '★', '☆', '✓', '✗', '➤', '→', '◆', '❧', '❦', '♦', '♥', '✦', '❖', '○', '■'];
    const input = h('input', { type: 'text', maxlength: 6, class: 'bul-input', 'aria-label': 'Bullet character', placeholder: '★' });
    const cur = (() => { const { $from } = view.state.selection; for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.bullet_list) return $from.node(d).attrs.symbol; return ''; })();
    input.value = cur || '★';
    const grid = h('div', { class: 'bul-grid' }, presets.map((c) => h('button', { type: 'button', class: 'bul-chip', title: `Use ${c}`, onclick: () => { input.value = c; input.focus(); } }, c)),
      h('button', { type: 'button', class: 'bul-chip more', title: 'Choose from all symbols', onclick: () => openSymbolPicker({ onInsert: (ch) => { input.value = ch; }, onClose: () => input.focus() }) }, '…'));
    const body = h('div', { class: 'bul-body' }, grid, h('label', { class: 'fld' }, h('span', {}, 'Bullet (any 1–3 characters, or pick one above)'), input));
    const res = await dialog({ title: 'Custom bullet', body, ok: 'Use bullet', cancel: 'Cancel' });
    if (!res) { view.focus(); return; }
    const symbol = cleanBullet(input.value);
    if (!symbol) { toast('Use 1–3 characters — no spaces, quotes or < > & { } ; :', 'error'); view.focus(); return; }
    if (!inAncestor(view.state, schema.nodes.bullet_list)) {
      if (inAncestor(view.state, schema.nodes.ordered_list)) liftListItem(schema.nodes.list_item)(view.state, view.dispatch);
      wrapInList(schema.nodes.bullet_list)(view.state, view.dispatch);
    }
    const { $from } = view.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type === schema.nodes.bullet_list) { view.dispatch(view.state.tr.setNodeMarkup($from.before(d), null, { ...$from.node(d).attrs, symbol })); break; }
    }
    view.focus();
  }
  async function footnoteCmd() {
    const res = await dialog({ title: 'Add footnote', fields: [{ name: 'text', label: 'Note text (Markdown: *italic*, **bold**)', type: 'textarea', rows: 4 }], ok: 'Add footnote' });
    if (res && res.text.trim()) insertNode(schema.nodes.footnote.create({ text: res.text.trim() }))(view.state, view.dispatch);
    view.focus();
  }
  async function citeCmd(pos = null, node = null) {
    const res = await ctx.pickCitation?.(node ? node.attrs : null);
    if (res === undefined) { view.focus(); return; }
    if (res === null) { // removed
      if (node) view.dispatch(view.state.tr.delete(pos, pos + 1));
      view.focus(); return;
    }
    const n = schema.nodes.citation.create({ ref: res.ref, locator: res.locator || '' });
    if (node) view.dispatch(view.state.tr.setNodeMarkup(pos, null, n.attrs));
    else {
      const { $from } = view.state.selection;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, '', '\ufffc');
      const tr = view.state.tr;
      if (before && !/[\s(“"'‘—–-]/.test(before)) tr.insertText(' ');
      tr.replaceSelectionWith(n);
      view.dispatch(tr.scrollIntoView());
    }
    view.focus();
  }
  ctx.editCitation = (pos, node) => citeCmd(pos, node);

  async function mathCmd(pos = null, node = null) {
    const sel = view.state.selection;
    const selected = !node && !sel.empty ? view.state.doc.textBetween(sel.from, sel.to, ' ') : '';
    const res = await openMathDialog({ tex: node ? node.attrs.tex : selected, display: node ? node.attrs.display : false, isEdit: !!node });
    if (res) {
      let tr = view.state.tr;
      if (node && pos != null) {
        tr = res.remove ? tr.delete(pos, pos + node.nodeSize) : tr.setNodeMarkup(pos, null, { tex: res.tex, display: res.display });
      } else if (!res.remove) {
        tr = tr.replaceSelectionWith(schema.nodes.math.create({ tex: res.tex, display: res.display }), false);
      }
      view.dispatch(tr.scrollIntoView());
    }
    view.focus();
  }
  ctx.editMath = (pos, node) => mathCmd(pos, node);

  /* ---- drawings */
  async function drawCmd(pos = null, node = null) {
    try {
      const existing = node?.attrs.drawing ? { rel: node.attrs.drawing, pngRel: node.attrs.src, json: await window.lutefisk.readDrawing({ rel: node.attrs.drawing }) } : null;
      const res = await openDrawingEditor(existing);
      if (!res) { view.focus(); return; }
      bumpAsset(res.png);
      if (node && pos != null) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, src: res.png, drawing: res.json, rev: (node.attrs.rev || 0) + 1 }));
      } else {
        const img = schema.nodes.image.create({ src: res.png, alt: 'Drawing', drawing: res.json, width: 60 });
        const { $from } = view.state.selection;
        const para = schema.nodes.paragraph.create(null, img);
        const tr = $from.parent.content.size ? view.state.tr.insert($from.after(1), para) : view.state.tr.replaceSelectionWith(img);
        view.dispatch(tr.scrollIntoView());
      }
      ctx.onAssetChanged?.();
    } catch (err) { toast(`Drawing: ${err.message || err}`, 'error'); }
    view.focus();
  }
  ctx.editDrawing = (pos, node) => drawCmd(pos, node);

  /* ---- comments (Word-style) */
  const commentType = schema.marks.comment;
  function commentRanges(doc = view.state.doc) {
    const map = new Map();
    doc.descendants((n, pos) => {
      if (!n.isInline) return;
      for (const m of n.marks) if (m.type === commentType) {
        const r = map.get(m.attrs.id);
        if (r) { r.from = Math.min(r.from, pos); r.to = Math.max(r.to, pos + n.nodeSize); } else map.set(m.attrs.id, { id: m.attrs.id, from: pos, to: pos + n.nodeSize });
      }
    });
    return [...map.values()].sort((a, b) => a.from - b.from);
  }
  function commentAt(state = view.state) {
    const { $from, from, to } = state.selection;
    const marks = from === to ? $from.marks() : [];
    let m = marks.find((x) => x.type === commentType);
    if (!m && from !== to) state.doc.nodesBetween(from, to, (n) => { m ||= n.marks.find((x) => x.type === commentType); });
    return m?.attrs.id || null;
  }
  function commentCmd() {
    let { from, to, empty, $from } = view.state.selection;
    if (empty) {
      // Comment on the word at the cursor, like Word.
      const text = $from.parent.textContent;
      const off = $from.parentOffset;
      let a = off, b = off;
      while (a > 0 && /[\p{L}\p{N}'’-]/u.test(text[a - 1])) a--;
      while (b < text.length && /[\p{L}\p{N}'’-]/u.test(text[b])) b++;
      if (a === b) { toast('Select some text to comment on', 'info'); return; }
      from = $from.start() + a; to = $from.start() + b;
    }
    const id = `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    ctx.createComment?.(id, view.state.doc.textBetween(from, to, ' '));
    const tr = view.state.tr.addMark(from, to, commentType.create({ id }));
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, to)));
    ctx.commentsChanged?.(id);
  }
  function removeComment(id) {
    view.dispatch(view.state.tr.removeMark(0, view.state.doc.content.size, commentType.create({ id })));
  }
  function selectComment(id) {
    const r = commentRanges().find((x) => x.id === id);
    if (!r) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, r.from, r.to)).scrollIntoView());
    view.focus();
  }

  /** Insert Code…: pick a language (remembered), optionally paste the code, and choose line numbers (off by default). */
  async function insertCodeCmd() {
    const { $from } = view.state.selection;
    if ($from.parent.type === schema.nodes.code_block) { toast('You’re in a code block — change its language and line numbers in the bar above it', 'info', 2600); return; }
    let last = '';
    try { last = localStorage.getItem('lutefisk.codeLang') || ''; } catch { /* ignore */ }
    const lang = h('select', { class: 'code-lang-sel', 'aria-label': 'Language' });
    let group = null;
    for (const [id, label, g] of CODE_LANGUAGES) {
      if (g !== group?.label) { group = h('optgroup', { label: g }); lang.append(group); }
      group.append(h('option', { value: id }, label));
    }
    lang.value = normalizeLang(last) || '';
    const lines = h('input', { type: 'checkbox', 'aria-label': 'Show line numbers' });
    const code = h('textarea', { class: 'code-paste', rows: 10, spellcheck: 'false', placeholder: 'Paste or type code here (optional — you can also type in the block afterwards)', 'aria-label': 'Code' });
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const a = code.selectionStart; code.setRangeText('  ', a, code.selectionEnd, 'end'); }
    });
    const body = h('div', { class: 'code-dlg' },
      h('label', { class: 'fld' }, h('span', {}, 'Language'), lang),
      h('label', { class: 'code-ln-row' }, lines, h('span', {}, 'Show line numbers')),
      h('label', { class: 'fld' }, h('span', {}, 'Code'), code),
      h('small', { class: 'hint' }, 'Highlighted the same way in the editor, the preview and every export. Tip: type ``` and a language name, then a space, to start a code block from the keyboard.'));
    requestAnimationFrame(() => code.focus());
    const res = await dialog({ title: 'Insert code', body, ok: 'Insert', cancel: 'Cancel', wide: true });
    if (!res) { view.focus(); return; }
    try { localStorage.setItem('lutefisk.codeLang', lang.value); } catch { /* ignore */ }
    const text = code.value.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    const node = schema.nodes.code_block.create({ params: lang.value, lineNumbers: lines.checked }, text ? schema.text(text) : null);
    const { state } = view;
    const sel = state.selection;
    let tr;
    const para = sel.$from.parent;
    if (para.isTextblock && para.content.size === 0 && sel.empty) tr = state.tr.replaceWith(sel.$from.before(), sel.$from.after(), node);
    else {
      let at = sel.to;
      for (let d = sel.$to.depth; d > 0; d--) if (sel.$to.node(d).isTextblock) { at = sel.$to.after(d); break; }
      tr = state.tr.insert(at, node);
    }
    let pos = null;
    tr.doc.descendants((n, p2) => { if (pos == null && n === node) pos = p2; return pos == null; });
    if (pos != null) tr.setSelection(TextSelection.create(tr.doc, pos + 1 + (text ? 0 : node.content.size)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }

  function codeCmd(lang = '') {
    const { $from } = view.state.selection;
    if ($from.parent.type === schema.nodes.code_block) setBlockType(schema.nodes.paragraph)(view.state, view.dispatch);
    else setBlockType(schema.nodes.code_block, { params: lang })(view.state, view.dispatch);
    view.focus();
  }

  /* ---- right-click menu */
  function contextMenu(e) {
    const inTable = isInTable(view.state);
    const cid = commentAt();
    const hasSel = !view.state.selection.empty;
    const anchor = h('span', { class: 'ctx-anchor', style: { left: `${e.clientX}px`, top: `${e.clientY}px` } });
    document.body.append(anchor);
    const items = [
      { label: 'Cut', icon: 'clear', hint: '⌘X', disabled: !hasSel, onClick: () => { view.focus(); document.execCommand('cut'); } },
      { label: 'Copy', icon: 'doc', hint: '⌘C', disabled: !hasSel, onClick: () => { view.focus(); document.execCommand('copy'); } },
      { label: 'Paste', icon: 'export', hint: '⌘V', onClick: () => { view.focus(); window.lutefisk.paste?.(); } },
      '-',
      { label: 'New Comment', icon: 'comment', hint: '⌃⌥M', onClick: commentCmd },
      ...(cid ? [
        { label: 'Delete Comment', icon: 'trash', onClick: () => { removeComment(cid); ctx.deleteComment?.(cid); } },
      ] : []),
      '-',
      ...(ctx.snippets?.().length ? [{ label: 'Insert Snippet', icon: 'snippet', onClick: () => ctx.pickSnippet?.({ x: e.clientX, y: e.clientY }) }] : []),
      { label: 'Footnote', icon: 'footnote', onClick: () => footnoteCmd() },
      { label: 'Citation…', icon: 'cite', onClick: () => citeCmd() },
      { label: 'Equation (LaTeX)…', icon: 'sigma', onClick: () => mathCmd() },
      { label: 'Symbol…', icon: 'omega', onClick: () => symbolCmd() },
      { label: 'Drawing…', icon: 'pen', onClick: () => drawCmd() },
      { label: 'Link…', icon: 'link', onClick: () => linkCmd() },
      { label: 'Insert Code…', icon: 'code', onClick: () => insertCodeCmd() },
      { label: 'Code Block', icon: 'code', onClick: () => codeCmd() },
      ...(inTable ? ['-', { header: 'Table' }, ...tableItems()] : [{ label: 'Table…', icon: 'table', onClick: customTable }]),
    ];
    popover(anchor, items, { width: 230 });
    setTimeout(() => anchor.remove(), 0);
  }

  /* ---- tables */
  function insertTable(rows, cols) {
    const { table, table_row: tr, table_header: th, table_cell: td } = schema.nodes;
    const mk = (type) => type.createAndFill();
    const t = table.create(null, Array.from({ length: rows }, (_, r) => tr.create(null, Array.from({ length: cols }, () => mk(r === 0 ? th : td)))));
    const { $from } = view.state.selection;
    let tr2 = view.state.tr;
    if ($from.parent.type === schema.nodes.paragraph && !$from.parent.content.size) tr2 = tr2.replaceWith($from.before(), $from.after(), t);
    else tr2 = tr2.insert($from.after(1), t);
    const pos = tr2.mapping.map($from.pos);
    view.dispatch(tr2.setSelection(TextSelection.near(tr2.doc.resolve(Math.min(tr2.doc.content.size, pos + 3)))).scrollIntoView());
    view.focus();
  }
  async function customTable() {
    const res = await dialog({ title: 'Insert table', fields: [{ name: 'rows', label: 'Rows (including the header row)', type: 'number', value: '4' }, { name: 'cols', label: 'Columns', type: 'number', value: '3' }], ok: 'Insert' });
    if (res) insertTable(Math.min(60, Math.max(2, +res.rows || 4)), Math.min(12, Math.max(1, +res.cols || 3)));
    else view.focus();
  }
  const tcmd = (cmd) => () => { cmd(view.state, view.dispatch); view.focus(); };
  const alignCol = (a) => () => {
    const rect = selectedRect(view.state);
    const tr = view.state.tr;
    for (let r = 0; r < rect.map.height; r++) {
      const pos = rect.tableStart + rect.map.map[r * rect.map.width + rect.left];
      tr.setNodeMarkup(pos, null, { ...tr.doc.nodeAt(pos).attrs, align: a });
    }
    view.dispatch(tr); view.focus();
  };
  function tableItems() {
    if (!isInTable(view.state)) {
      return [{ header: 'Insert table' },
        ...[[3, 2], [3, 3], [4, 3], [5, 4]].map(([r, c]) => ({ label: `${c} columns × ${r - 1} rows`, icon: 'table', onClick: () => insertTable(r, c) })),
        { label: 'Custom Size…', icon: 'table', onClick: customTable }];
    }
    return [
      { label: 'Add Row Above', icon: 'up', onClick: tcmd(addRowBefore) }, { label: 'Add Row Below', icon: 'down', onClick: tcmd(addRowAfter) },
      { label: 'Add Column Left', icon: 'prev', onClick: tcmd(addColumnBefore) }, { label: 'Add Column Right', icon: 'next', onClick: tcmd(addColumnAfter) },
      '-',
      { label: 'Align Column Left', icon: 'alignLeft', onClick: alignCol('left') }, { label: 'Align Column Center', icon: 'alignCenter', onClick: alignCol('center') }, { label: 'Align Column Right', icon: 'alignRight', onClick: alignCol('right') },
      '-',
      { label: 'Delete Row', icon: 'minus', onClick: tcmd(deleteRow) }, { label: 'Delete Column', icon: 'minus', onClick: tcmd(deleteColumn) },
      { label: 'Delete Table', icon: 'trash', danger: true, onClick: tcmd(deleteTable) },
    ];
  }


  function symbolCmd() {
    const font = getComputedStyle(view.dom).fontFamily;
    openSymbolPicker({
      fontFamily: font,
      onInsert: (ch) => view.dispatch(view.state.tr.insertText(ch).scrollIntoView()),
      onClose: () => view.focus(),
    });
  }

  async function imageCmd() {
    const rel = await ctx.importImage?.();
    if (!rel) return;
    const res = await dialog({
      title: 'Image details',
      fields: [
        { name: 'alt', label: 'Alternative text (for accessibility)', value: '' },
        { name: 'title', label: 'Caption (optional)', value: '' },
        { name: 'width', label: 'Width', type: 'select', value: '60', options: [100, 80, 60, 50, 40, 30].map((v) => ({ value: String(v), label: `${v}% of text width` })) },
        { name: 'align', label: 'Position', type: 'select', value: 'center', options: ['center', 'left', 'right', 'full'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
        { name: 'wrap', label: 'Text wrapping', type: 'select', value: 'topbottom', options: WRAP_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
      ], ok: 'Insert',
    });
    const a = res || { alt: '', title: '', width: '60', align: 'center', wrap: 'topbottom' };
    let align = a.align;
    if (['square', 'tight', 'through'].includes(a.wrap) && !['left', 'right'].includes(align)) align = 'left';
    const node = schema.nodes.image.create({ src: rel, alt: a.alt, title: a.title, width: a.width === '100' ? null : +a.width, align, wrap: a.wrap });
    const { state } = view;
    const { $from } = state.selection;
    // Images go in their own paragraph.
    const tr = state.tr;
    if ($from.parent.content.size === 0) tr.replaceSelectionWith(node);
    else tr.insert($from.after(1), schema.nodes.paragraph.create(null, node));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }
  async function indexCmd() {
    const text = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, ' ').trim();
    const res = await dialog({ title: 'Add index term', message: 'Every occurrence of this term in the book will be listed in the Index.', fields: [{ name: 'term', label: 'Term', value: text }] , ok: 'Add' });
    if (res?.term?.trim()) ctx.addIndexTerm?.(res.term.trim());
    view.focus();
  }

  /* ---- alignment: wrap the selected blocks in an align node, change it, or unwrap for "left" */
  function alignNodeDepth(state) {
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.align) return d;
    return 0;
  }
  function currentAlign(state) { const d = alignNodeDepth(state); return d ? state.selection.$from.node(d).attrs.align : 'left'; }
  function alignCmd(align) {
    return (state, dispatch) => {
      const d = alignNodeDepth(state);
      if (d) {
        const pos = state.selection.$from.before(d);
        if (align === 'left') return lift(state, dispatch) || (dispatch && dispatch(state.tr.setNodeMarkup(pos, null, { align: 'left' })), true);
        if (dispatch) dispatch(state.tr.setNodeMarkup(pos, null, { align }));
        return true;
      }
      if (align === 'left') return true;
      return wrapIn(schema.nodes.align, { align })(state, dispatch);
    };
  }
  /* ---- the toolbar: two rows, with the less-used choices in small menus */
  const tb = (name, title, onclick, isActive, cls = '') => {
    const b = h('button', { type: 'button', class: `ql-${name} ${cls}`.trim(), title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick }, icon(name));
    b._active = isActive;
    return b;
  };
  /** A button that opens a small menu; it shows the icon of whatever is in use. */
  const menuBtn = (name, title, items, isActive) => {
    const b = tb(name, title, () => popover(b, items(), { width: 230 }), isActive, 'ql-menu');
    b.append(h('span', { class: 'ql-caret' }, icon('chevron', 9)));
    return b;
  };
  const check = (on) => (on ? '✓ ' : '');
  const toggleList = (type) => run((s, d) => (inAncestor(s, type) ? liftListItem(schema.nodes.list_item)(s, d) : wrapInList(type)(s, d)));
  const textMenu = menuBtn('textStyle', 'Subscript, superscript and strikethrough', () => [
    { label: `${check(markActive(view.state, schema.marks.subscript))}Subscript`, hint: '⌘,', icon: 'subscript', onClick: run(toggleMark(schema.marks.subscript)) },
    { label: `${check(markActive(view.state, schema.marks.superscript))}Superscript`, hint: '⌘.', icon: 'superscript', onClick: run(toggleMark(schema.marks.superscript)) },
    { label: `${check(markActive(view.state, schema.marks.strike))}Strikethrough`, hint: '⇧⌘X', icon: 'strike', onClick: run(toggleMark(schema.marks.strike)) },
  ], (s) => markActive(s, schema.marks.subscript) || markActive(s, schema.marks.superscript) || markActive(s, schema.marks.strike));
  const breakMenu = menuBtn('pagebreak', 'Page break or scene break', () => [
    { label: 'Page Break', hint: '⌘↵', icon: 'pagebreak', onClick: run(insertPageBreak) },
    { label: 'Scene Break', icon: 'scene', onClick: run(insertSceneBreak) },
  ]);
  const bulletIs = (st, sym) => { const { $from } = st.selection; for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === schema.nodes.bullet_list) return sym === undefined ? true : ($from.node(d).attrs.symbol || '') === sym; return false; };
  const plainBullets = run((st, d) => {
    if (bulletIs(st)) {
      if (!bulletIs(st, '')) { const { $from } = st.selection; for (let k = $from.depth; k > 0; k--) if ($from.node(k).type === schema.nodes.bullet_list) { d(st.tr.setNodeMarkup($from.before(k), null, { ...$from.node(k).attrs, symbol: '' })); return true; } }
      return liftListItem(schema.nodes.list_item)(st, d);
    }
    return wrapInList(schema.nodes.bullet_list)(st, d);
  });
  const listMenu = menuBtn('listMenu', 'Lists — bulleted, numbered or your own bullet', () => [
    { label: `${check(bulletIs(view.state, ''))}Bulleted List`, icon: 'ul', onClick: plainBullets },
    { label: `${check(inAncestor(view.state, schema.nodes.ordered_list))}Numbered List`, icon: 'ol', onClick: toggleList(schema.nodes.ordered_list) },
    { label: `${check(bulletIs(view.state) && !bulletIs(view.state, ''))}Custom Bullet…`, icon: 'star', onClick: () => customBulletCmd() },
  ], (s) => inAncestor(s, schema.nodes.bullet_list) || inAncestor(s, schema.nodes.ordered_list));
  const noteMenu = menuBtn('cite', 'Citation or footnote', () => [
    { label: 'Citation…', hint: '⌥⌘C', icon: 'cite', onClick: () => citeCmd() },
    { label: 'Footnote…', hint: '⌥⌘F', icon: 'footnote', onClick: () => footnoteCmd() },
    ...(ctx.citationStyles ? ['-', { header: 'Citation style — whole book' }, ...ctx.citationStyles().map((st) => ({ label: `${st.on ? '✓ ' : ''}${st.label}`, onClick: () => ctx.setCitationStyle(st.id) }))] : []),
  ]);
  const fxBtn = tb('sigma', 'Insert equation — LaTeX (⌥⌘E)', () => mathCmd(), null, 'ql-fx');
  fxBtn.replaceChildren(h('span', { class: 'fx-glyph', 'aria-hidden': 'true' }, h('i', {}, 'f'), '(', h('i', {}, 'x'), ')'));

  const rows = [
    [[styleSel],
    [tb('bold', 'Bold (⌘B)', run(toggleMark(schema.marks.strong)), (s) => markActive(s, schema.marks.strong)),
      tb('italic', 'Italic (⌘I)', run(toggleMark(schema.marks.em)), (s) => markActive(s, schema.marks.em)),
      tb('underline', 'Underline (⌘U)', run(toggleMark(schema.marks.underline)), (s) => markActive(s, schema.marks.underline)),
      textMenu],
    [listMenu, breakMenu],
    [tb('link', 'Link — name and web address (⌘K)', () => linkCmd(), (s) => markActive(s, schema.marks.link))]],
    [[tb('image', 'Insert image', () => imageCmd()),
      noteMenu,
      tb('table', 'Table', () => popover(toolbar.querySelector('.ql-table'), tableItems()), (s) => isInTable(s)),
      tb('code', 'Insert code — syntax highlighting for programming, scripting and shell languages, JSON, YAML, XML and more', () => insertCodeCmd(), (s) => s.selection.$from.parent.type === schema.nodes.code_block, 'ql-codeblock'),
      fxBtn,
      tb('omega', 'Insert symbol (⌥⌘I)', () => symbolCmd())],
    [tb('clear', 'Clear formatting', run(clearFormatting)), tb('undo', 'Undo (⌘Z)', run(undo)), tb('redo', 'Redo (⇧⌘Z)', run(redo))]],
  ];
  for (const r of rows) toolbar.append(h('div', { class: 'ql-row' }, r.map((g) => h('span', { class: 'ql-formats' }, g))));
  const counter = h('span', { class: 'ql-count', 'aria-live': 'off' });
  toolbar.append(counter);

  function refreshToolbar() {
    const s = view.state;
    for (const b of toolbar.querySelectorAll('button')) {
      if (b._active) b.classList.toggle('ql-active', !!b._active(s));
    }
    styleSel.value = currentBlockStyle(s);
    const sub = markActive(s, schema.marks.subscript), sup = markActive(s, schema.marks.superscript);
    const tIc = sub ? 'subscript' : sup ? 'superscript' : markActive(s, schema.marks.strike) ? 'strike' : 'textStyle';
    if (textMenu.dataset.ic !== tIc) { textMenu.dataset.ic = tIc; textMenu.firstChild.replaceWith(icon(tIc)); }
    const lIc = inAncestor(s, schema.nodes.ordered_list) ? 'ol' : bulletIs(s, '') ? 'ul' : bulletIs(s) ? 'star' : 'listMenu';
    if (listMenu.dataset.ic !== lIc) { listMenu.dataset.ic = lIc; listMenu.firstChild.replaceWith(icon(lIc)); }
  }

  const states = new Map(); // sectionId → EditorState (keeps undo history per section)
  let currentId = null;

  const api = {
    view,
    tableItems: () => tableItems(),
    counter,
    load(id, markdown) {
      if (currentId) states.set(currentId, view.state);
      currentId = id;
      let st = states.get(id);
      if (!st) { st = mkState(parseMarkdownDoc(markdown)); states.set(id, st); }
      view.updateState(st);
      refreshToolbar();
    },
    /** Re-draw node views (citations pick up a new citation style). */
    /** Insert Markdown at a document position (a dropped snippet): one paragraph goes inline; more go between paragraphs. */
    insertMarkdownAt(md, pos) {
      const doc = parseMarkdownDoc(String(md || ''));
      if (!doc.content.size) return false;
      const { state } = view;
      const $p = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
      let tr = state.tr;
      const single = doc.childCount === 1 && doc.firstChild.type === schema.nodes.paragraph;
      if (single && $p.parent.isTextblock && $p.parent.type.spec.code !== true) {
        // Inline: add a space on either side when dropped against a word.
        const before = $p.parent.textBetween(Math.max(0, $p.parentOffset - 1), $p.parentOffset);
        const after = $p.parent.textBetween($p.parentOffset, Math.min($p.parent.content.size, $p.parentOffset + 1));
        const nodes = [];
        if (before && /\S/.test(before)) nodes.push(schema.text(' '));
        doc.firstChild.content.forEach((n) => nodes.push(n));
        if (after && /\S/.test(after) && !/^[.,;:!?’”)]/.test(after)) nodes.push(schema.text(' '));
        tr = tr.insert($p.pos, nodes);
        tr.setSelection(TextSelection.create(tr.doc, $p.pos + nodes.reduce((n, x) => n + x.nodeSize, 0)));
      } else {
        let at = $p.pos;
        for (let d = $p.depth; d > 0; d--) {
          if ($p.node(d).isTextblock) { at = $p.parentOffset === 0 ? $p.before(d) : $p.after(d); break; }
        }
        tr = tr.insert(at, doc.content);
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, at + doc.content.size))));
      }
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    },
    /** Insert Markdown (e.g. a snippet) at the cursor, as blocks. */
    insertMarkdown(md) {
      const doc = parseMarkdownDoc(String(md || ''));
      if (!doc.content.size) return false;
      const { state } = view;
      const slice = new Slice(doc.content, 0, 0);
      const { $from } = state.selection;
      let tr = state.tr;
      // Between paragraphs rather than inside one, when the cursor is at a paragraph's end or in an empty one.
      if ($from.parent.isTextblock && $from.parent.content.size === 0) tr = tr.replaceRange($from.before(), $from.after(), slice);
      else tr = tr.replaceSelection(slice);
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    },
    redraw() { view.setProps({ nodeViews: { ...view.props.nodeViews } }); },
    /** Highlight all matches of `re`; select and scroll to match number `index` (if given). */
    search(re, index = -1) {
      const ms = findMatches(view.state.doc, re);
      const tr = view.state.tr.setMeta(searchKey, { re, active: index });
      if (index >= 0 && ms[index]) tr.setSelection(TextSelection.create(tr.doc, ms[index].from, ms[index].to)).scrollIntoView();
      view.dispatch(tr);
      if (index >= 0 && ms[index]) requestAnimationFrame(() => { try { const c = view.coordsAtPos(ms[index].from); const box = area.getBoundingClientRect(); area.scrollTop += c.top - (box.top + box.height * 0.35); } catch { /* not laid out */ } });
      return ms.length;
    },
    clearSearch() { view.dispatch(view.state.tr.setMeta(searchKey, { re: null })); },
    /** Replace in the open text: match `index`, all matches, or all inside the selection. Undoable. */
    replace(re, replacement, { index = -1, inSelection = false } = {}) {
      let ms = findMatches(view.state.doc, re);
      if (inSelection) { const { from, to } = view.state.selection; ms = ms.filter((m) => m.from >= from && m.to <= to); }
      else if (index >= 0) ms = ms[index] ? [ms[index]] : [];
      if (!ms.length) return 0;
      const tr = replaceMatches(view.state.tr, ms, replacement);
      tr.setMeta(searchKey, { re, active: -1 });
      view.dispatch(tr);
      return ms.length;
    },
    selectionText() { const { from, to } = view.state.selection; return view.state.doc.textBetween(from, to, ' '); },
    hasSelection() { return !view.state.selection.empty; },
    forget(id) { states.delete(id); },
    /** Redraw citation chips (style or sources changed). */
    refreshCitations() { view.setProps({ nodeViews: { ...view.props.nodeViews } }); },
    reset() { states.clear(); currentId = null; },
    markdown: () => docToMarkdown(view.state.doc),
    /** Markdown before and after the caret (for splitting a scene). */
    splitAtCaret() {
      const d = view.state.doc;
      const pos = view.state.selection.from;
      return { before: docToMarkdown(d.cut(0, pos)).trim(), after: docToMarkdown(d.cut(pos)).trim() };
    },
    focus: () => view.focus(),
    /** Typewriter scrolling: keep the cursor line in the middle of the editor. */
    centerCaret() {
      const box = area.getBoundingClientRect();
      let c;
      try { c = view.coordsAtPos(view.state.selection.head); } catch { return; }
      const target = box.top + box.height * 0.45;
      area.scrollTop += c.top - target;
    },
    setEditable(on) { view.setProps({ editable: () => on }); },
    /** Top-level block index of the cursor and fractional position inside it. */
    caret() {
      const { $head } = view.state.selection;
      const index = $head.depth ? $head.index(0) : Math.max(0, view.state.selection.$from.index(0));
      const block = view.state.doc.maybeChild(index);
      const start = $head.depth ? $head.before(1) + 1 : 0;
      const frac = block && block.content.size ? Math.min(1, Math.max(0, ($head.pos - start) / block.content.size)) : 0;
      return { index, frac };
    },
    async editFootnote(pos, node) {
      const res = await dialog({ title: 'Edit footnote', fields: [{ name: 'text', label: 'Note text', type: 'textarea', value: node.attrs.text, rows: 5 }], ok: 'Save', cancel: 'Cancel' });
      if (res == null) return view.focus();
      const tr = res.text.trim() ? view.state.tr.setNodeMarkup(pos, null, { text: res.text.trim() }) : view.state.tr.delete(pos, pos + 1);
      view.dispatch(tr); view.focus();
    },
    editDrawing: (pos, node) => drawCmd(pos, node),
    commentRanges: () => commentRanges(),
    commentAt: () => commentAt(),
    removeComment: (id) => removeComment(id),
    selectComment: (id) => selectComment(id),
    newComment: () => commentCmd(),
    container: area,
    async editImage(pos, node) {
      const a = node.attrs;
      const res = await dialog({
        title: 'Image',
        fields: [
          { name: 'alt', label: 'Alternative text', value: a.alt },
          { name: 'title', label: 'Caption', value: a.title },
          { name: 'width', label: 'Width (% of text width)', type: 'number', value: a.width || 100 },
          { name: 'align', label: 'Position', type: 'select', value: a.align || 'center', options: ['center', 'left', 'right', 'full'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
          { name: 'wrap', label: 'Text wrapping', type: 'select', value: a.wrap === true ? 'square' : a.wrap || 'topbottom', options: WRAP_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
        ], ok: 'Apply',
      });
      if (!res) return view.focus();
      const w = Math.min(100, Math.max(5, Math.round(+res.width || 100)));
      view.dispatch(view.state.tr.setNodeMarkup(pos, null, { ...a, alt: res.alt, title: res.title, width: w === 100 ? null : w, align: res.align, wrap: res.wrap }));
      view.focus();
    },
    selectNodeAt(pos) { view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))); },
  };
  return api;
}

/**
 * A small rich-text editor (snippets): the same text and list formatting as the
 * chapter editor, stored as Markdown. Returns { el, focus(), markdown(), view }.
 */
export function createMiniEditor(markdown, { placeholder = '', label = 'Text', onChange, onSubmit } = {}) {
  const toolbar = h('div', { class: 'mini-tb', role: 'toolbar', 'aria-label': 'Formatting' });
  const area = h('div', { class: 'mini-area' });
  const el = h('div', { class: 'mini-ed' }, toolbar, area);
  const keys = {
    'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em), 'Mod-u': toggleMark(schema.marks.underline),
    'Mod-Shift-x': toggleMark(schema.marks.strike), 'Mod-,': toggleMark(schema.marks.subscript), 'Mod-.': toggleMark(schema.marks.superscript),
    Enter: splitListItem(schema.nodes.list_item), 'Mod-[': liftListItem(schema.nodes.list_item), 'Mod-]': sinkListItem(schema.nodes.list_item),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
    'Mod-Enter': () => { onSubmit?.(); return true; },
  };
  const view = new EditorView(area, {
    state: EditorState.create({ doc: parseMarkdownDoc(String(markdown || '')), plugins: [buildInputRules(), keymap(keys), keymap(baseKeymap), history()] }),
    attributes: { class: 'ql-editor mini-editor', spellcheck: 'true', 'aria-label': label, 'data-placeholder': placeholder },
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
      refresh();
      if (tr.docChanged) onChange?.();
    },
    handleDOMEvents: {
      drop: (_v, e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); return true; } return false; },
      paste: (_v, e) => { if ([...(e.clipboardData?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); return true; } return false; },
    },
    transformPastedHTML: (html) => html.replace(/<img[^>]*>/gi, ''),
  });
  const run = (cmd) => () => { cmd(view.state, view.dispatch, view); view.focus(); };
  const list = (type) => (state, dispatch) => (inAncestor(state, type) ? liftListItem(schema.nodes.list_item)(state, dispatch) : wrapInList(type)(state, dispatch));
  const quote = (state, dispatch) => (inAncestor(state, schema.nodes.blockquote) ? lift(state, dispatch) : wrapIn(schema.nodes.blockquote)(state, dispatch));
  const B = [
    ['bold', 'Bold (⌘B)', toggleMark(schema.marks.strong), (s) => markActive(s, schema.marks.strong)],
    ['italic', 'Italic (⌘I)', toggleMark(schema.marks.em), (s) => markActive(s, schema.marks.em)],
    ['underline', 'Underline (⌘U)', toggleMark(schema.marks.underline), (s) => markActive(s, schema.marks.underline)],
    ['strike', 'Strikethrough', toggleMark(schema.marks.strike), (s) => markActive(s, schema.marks.strike)],
    ['superscript', 'Superscript', toggleMark(schema.marks.superscript), (s) => markActive(s, schema.marks.superscript)],
    ['subscript', 'Subscript', toggleMark(schema.marks.subscript), (s) => markActive(s, schema.marks.subscript)],
    '|',
    ['ul', 'Bulleted list', list(schema.nodes.bullet_list), (s) => inAncestor(s, schema.nodes.bullet_list)],
    ['ol', 'Numbered list', list(schema.nodes.ordered_list), (s) => inAncestor(s, schema.nodes.ordered_list)],
    ['quote', 'Block quote', quote, (s) => inAncestor(s, schema.nodes.blockquote)],
    '|',
    ['clear', 'Clear formatting', clearFormatting, null],
    ['undo', 'Undo (⌘Z)', undo, null],
    ['redo', 'Redo (⇧⌘Z)', redo, null],
  ];
  for (const b of B) {
    if (b === '|') { toolbar.append(h('span', { class: 'mini-sep' })); continue; }
    const [ic, title, cmd, active] = b;
    const btn = h('button', { type: 'button', class: 'mini-btn', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: run(cmd) }, icon(ic, 15));
    btn._active = active;
    toolbar.append(btn);
  }
  function refresh() {
    for (const b of toolbar.querySelectorAll('button')) if (b._active) b.classList.toggle('on', !!b._active(view.state));
    area.classList.toggle('empty', view.state.doc.textContent.length === 0 && view.state.doc.childCount <= 1);
  }
  refresh();
  return { el, view, focus: () => view.focus(), markdown: () => docToMarkdown(view.state.doc).trim(), destroy: () => view.destroy() };
}
