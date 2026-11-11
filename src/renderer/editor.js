// Rich-text editor (Quill-style toolbar) built on ProseMirror. The document
// is stored as Markdown; this module converts both ways.
import { Schema } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection, Plugin } from 'prosemirror-state';
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
import { createMarkdown, extractFootnotes, safeAssetPath } from '../shared/markdown.js';
import { h, icon, dialog, assetUrl, popover, setHtml, bumpAsset, toast } from './ui.js';
import { openDrawingEditor } from './drawing-editor.js';
import { texToMathml } from '../shared/math.js';
import { highlightRanges, CODE_LANGUAGES, normalizeLang } from '../shared/code.js';
import { openMathDialog } from './math-dialog.js';
import { openSymbolPicker } from './symbol-picker.js';

/* ------------------------------------------------------------------ schema */

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    blockquote: { content: 'block+', group: 'block', defining: true, parseDOM: [{ tag: 'blockquote' }], toDOM: () => ['blockquote', 0] },
    horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['div', { class: 'pm-scene', contenteditable: 'false' }, ['hr']] },
    heading: {
      attrs: { level: { default: 2 } }, content: 'inline*', group: 'block', defining: true,
      parseDOM: [{ tag: 'h2', attrs: { level: 2 } }, { tag: 'h3', attrs: { level: 3 } }],
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    ordered_list: {
      content: 'list_item+', group: 'block', attrs: { order: { default: 1 }, tight: { default: false } },
      parseDOM: [{ tag: 'ol' }], toDOM: (n) => ['ol', n.attrs.order === 1 ? {} : { start: n.attrs.order }, 0],
    },
    bullet_list: { content: 'list_item+', group: 'block', attrs: { tight: { default: false } }, parseDOM: [{ tag: 'ul' }], toDOM: () => ['ul', 0] },
    list_item: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    text: { group: 'inline' },
    code_block: {
      content: 'text*', marks: '', group: 'block', code: true, defining: true,
      attrs: { params: { default: '' } },
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (d) => ({ params: d.getAttribute('data-lang') || '' }) }],
      toDOM: (n) => ['pre', { class: 'pm-code', 'data-lang': n.attrs.params }, ['code', 0]],
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
  bullet_list: { block: 'bullet_list', getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }) },
  ordered_list: { block: 'ordered_list', getAttrs: (tok, tokens, i) => ({ order: +tok.attrGet('start') || 1, tight: listIsTight(tokens, i) }) },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: Math.min(3, Math.max(2, +tok.tag.slice(1) + (tok.tag === 'h1' ? 1 : 0))) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (tok) => ({ params: (tok.info || '').trim().split(/\s+/)[0] || '' }), noCloseToken: true },
  hr: { node: 'horizontal_rule' },
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
  horizontal_rule(state, node) { state.write('* * *'); state.closeBlock(node); },
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
  footnote(state, node) {
    notesOut.push(String(node.attrs.text || '').replace(/\s*\n\s*/g, ' ').trim());
    state.write(`[^${notesOut.length}]`);
  },
}, {
  ...defaultMarkdownSerializer.marks,
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  comment: { open: '{==', close: (_state, mark) => `==}{>>#${mark.attrs.id}<<}`, mixable: false, expelEnclosingWhitespace: true },
}, { escapeExtraCharacters: /\$/g });

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
function insertSceneBreak(state, dispatch) {
  const { $from } = state.selection;
  const hr = schema.nodes.horizontal_rule.create();
  if (dispatch) {
    const pos = $from.after(1);
    const tr = state.tr.insert(pos, [hr, schema.nodes.paragraph.create()]);
    tr.setSelection(TextSelection.create(tr.doc, pos + 2));
    dispatch(tr.scrollIntoView());
  }
  return true;
}
function clearFormatting(state, dispatch) {
  const { from, to } = state.selection;
  if (dispatch) {
    let tr = state.tr;
    for (const m of ['em', 'strong', 'strike', 'link', 'code']) tr = tr.removeMark(from, to, schema.marks[m]);
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

/** Code block with a language picker. */
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
    this.sel.addEventListener('change', () => {
      const pos = getPos();
      view.dispatch(view.state.tr.setNodeMarkup(pos, null, { params: this.sel.value }));
      view.focus();
    });
    this.sel.addEventListener('mousedown', (e) => e.stopPropagation());
    this.code = h('code');
    this.dom = h('div', { class: 'pm-code-wrap' }, h('div', { class: 'pm-code-bar', contenteditable: 'false' }, icon('code', 13), this.sel), h('pre', { class: 'pm-code' }, this.code));
    this.contentDOM = this.code;
  }
  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const v = normalizeLang(node.attrs.params);
    if (this.sel.value !== v) this.sel.value = v;
    return true;
  }
  stopEvent(e) { return e.target === this.sel || this.sel.contains(e.target); }
  ignoreMutation(m) { return !this.contentDOM.contains(m.target); }
}

/** Marks the top-level block holding the cursor (used by Focus mode dimming). */
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

export function createEditor(mount, ctx) {
  const toolbar = h('div', { class: 'ql-toolbar', role: 'toolbar', 'aria-label': 'Formatting' });
  const area = h('div', { class: 'ql-container' });
  mount.append(toolbar, area);

  const keys = {
    'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em),
    'Mod-Shift-x': toggleMark(schema.marks.strike), 'Mod-k': () => { linkCmd(); return true; },
    'Mod-Alt-0': setBlockType(schema.nodes.paragraph), 'Mod-Alt-2': setBlockType(schema.nodes.heading, { level: 2 }), 'Mod-Alt-3': setBlockType(schema.nodes.heading, { level: 3 }),
    'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
    Enter: splitListItem(schema.nodes.list_item), 'Mod-[': liftListItem(schema.nodes.list_item), 'Mod-]': sinkListItem(schema.nodes.list_item),
    'Mod-Alt-f': () => { footnoteCmd(); return true; },
    'Mod-Alt-c': () => { citeCmd(); return true; },
    'Mod-Alt-e': () => { mathCmd(); return true; },
    'Mod-Alt-i': () => { symbolCmd(); return true; },
    'Mod-Alt-m': () => { commentCmd(); return true; },
  };
  const tableKeys = keymap({ Tab: goToNextCell(1), 'Shift-Tab': goToNextCell(-1) });
  const inCode = (state) => state.selection.$from.parent.type === schema.nodes.code_block;
  const codeKeys = keymap({
    Tab: (state, dispatch) => { if (!inCode(state)) return false; dispatch?.(state.tr.insertText('  ')); return true; },
    'Shift-Tab': (state) => inCode(state),
    'Mod-Enter': (state, dispatch) => (inCode(state) ? exitCode(state, dispatch) : false),
    'Shift-Enter': (state, dispatch) => (inCode(state) ? exitCode(state, dispatch) : false),
  });
  const plugins = [tableEditing(), tableKeys, codeKeys, codeHighlight, buildInputRules(), keymap(keys), keymap(baseKeymap), dropCursor(), gapCursor(), history(), currentBlock];
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
      drop: (_v, e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); return true; } return false; },
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
  const styleSel = h('select', { class: 'ql-header', title: 'Paragraph style', 'aria-label': 'Paragraph style' },
    h('option', { value: 'p' }, 'Normal'), h('option', { value: 'h2' }, 'Heading'), h('option', { value: 'h3' }, 'Subheading'));
  styleSel.addEventListener('change', () => {
    const v = styleSel.value;
    (v === 'p' ? setBlockType(schema.nodes.paragraph) : setBlockType(schema.nodes.heading, { level: v === 'h2' ? 2 : 3 }))(view.state, view.dispatch);
    view.focus();
  });

  async function linkCmd() {
    const { state } = view;
    if (markActive(state, schema.marks.link)) { toggleMark(schema.marks.link)(state, view.dispatch); return; }
    if (state.selection.empty) return;
    const res = await dialog({ title: 'Insert link', fields: [{ name: 'href', label: 'Web address', placeholder: 'https://', value: 'https://' }] });
    if (!res || !/^(https?:\/\/|mailto:)/.test(res.href.trim())) { view.focus(); return; }
    toggleMark(schema.marks.link, { href: res.href.trim() })(view.state, view.dispatch);
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
      { label: 'Footnote', icon: 'footnote', onClick: () => footnoteCmd() },
      { label: 'Citation…', icon: 'cite', onClick: () => citeCmd() },
      { label: 'Equation (LaTeX)…', icon: 'sigma', onClick: () => mathCmd() },
      { label: 'Symbol…', icon: 'omega', onClick: () => symbolCmd() },
      { label: 'Drawing…', icon: 'pen', onClick: () => drawCmd() },
      { label: 'Link…', icon: 'link', onClick: () => linkCmd() },
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

  const groups = [
    [styleSel],
    [btn('bold', 'Bold (⌘/Ctrl+B)', toggleMark(schema.marks.strong), (s) => markActive(s, schema.marks.strong)),
      btn('italic', 'Italic (⌘/Ctrl+I)', toggleMark(schema.marks.em), (s) => markActive(s, schema.marks.em)),
      btn('strike', 'Strikethrough', toggleMark(schema.marks.strike), (s) => markActive(s, schema.marks.strike)),
      btn('link', 'Link (⌘/Ctrl+K)', () => { linkCmd(); return true; }, (s) => markActive(s, schema.marks.link))],
    [btn('quote', 'Block quote', (s, d) => (inAncestor(s, schema.nodes.blockquote) ? lift(s, d) : wrapIn(schema.nodes.blockquote)(s, d)), (s) => inAncestor(s, schema.nodes.blockquote)),
      btn('ul', 'Bulleted list', (s, d) => (inAncestor(s, schema.nodes.bullet_list) ? liftListItem(schema.nodes.list_item)(s, d) : wrapInList(schema.nodes.bullet_list)(s, d)), (s) => inAncestor(s, schema.nodes.bullet_list)),
      btn('ol', 'Numbered list', (s, d) => (inAncestor(s, schema.nodes.ordered_list) ? liftListItem(schema.nodes.list_item)(s, d) : wrapInList(schema.nodes.ordered_list)(s, d)), (s) => inAncestor(s, schema.nodes.ordered_list))],
    [btn('scene', 'Scene break', insertSceneBreak),
      btn('image', 'Insert image', () => { imageCmd(); return true; }),
      btn('footnote', 'Footnote (⌘/Ctrl+Alt+F)', () => { footnoteCmd(); return true; }),
      btn('cite', 'Insert citation (⌘/Ctrl+Alt+C)', () => { citeCmd(); return true; }),
      btn('table', 'Table', () => { popover(toolbar.querySelector('.ql-table'), tableItems()); return true; }, (s) => isInTable(s)),
      btn('code', 'Code block — scripts, shells, YAML/JSON/XML, source code (type ``` then Space)', () => { codeCmd(); return true; }, (s) => s.selection.$from.parent.type === schema.nodes.code_block),
      btn('comment', 'New comment (⌃⌥M) — or right-click', () => { commentCmd(); return true; }),
      btn('pen', 'Draw — freehand pen, shapes and colours', () => { drawCmd(); return true; }),
      btn('omega', 'Insert symbol (⌘/Ctrl+Alt+I)', () => { symbolCmd(); return true; }),
      btn('sigma', 'Insert equation — LaTeX (⌘/Ctrl+Alt+E)', () => { mathCmd(); return true; }),
      btn('index', 'Add selection to index', () => { indexCmd(); return true; })],
    [btn('clear', 'Clear formatting', clearFormatting), btn('undo', 'Undo (⌘Z)', undo), btn('redo', 'Redo (⇧⌘Z)', redo)],
  ];
  for (const g of groups) toolbar.append(h('span', { class: 'ql-formats' }, g));
  const counter = h('span', { class: 'ql-count', 'aria-live': 'off' });
  toolbar.append(counter);

  function refreshToolbar() {
    const s = view.state;
    for (const b of toolbar.querySelectorAll('button')) {
      if (b._active) b.classList.toggle('ql-active', !!b._active(s));
    }
    const p = s.selection.$from.parent;
    styleSel.value = p.type === schema.nodes.heading ? `h${p.attrs.level}` : 'p';
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
