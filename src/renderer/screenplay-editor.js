// Screenplay editor modelled on Final Draft: every paragraph is a script
// element (Scene Heading, Action, Character, Parenthetical, Dialogue,
// Transition, Shot…). Enter/Tab move between elements the way screenwriters
// expect, ⌘1–9 switch elements, and SmartType suggests names, locations,
// times of day and transitions as you type.
import { Schema, Slice, Fragment } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap, toggleMark, chainCommands } from 'prosemirror-commands';
import { InputRule, inputRules, smartQuotes, ellipsis, emDash } from 'prosemirror-inputrules';
import { parseInline } from '../shared/fountain.js';
import { ELEMENT_LABELS } from '../shared/screenplay.js';
import { h, icon } from './ui.js';

export const TYPES = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'centered', 'act', 'lyric', 'synopsis', 'section', 'pagebreak'];
const SHORTCUT = { scene: '⌘1', action: '⌘2', character: '⌘3', paren: '⌘4', dialogue: '⌘5', transition: '⌘6', shot: '⌘7', centered: '⌘8', act: '⌘9' };
const ENTER_NEXT = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'scene', shot: 'action', centered: 'action', act: 'scene', lyric: 'lyric', synopsis: 'action', section: 'scene', pagebreak: 'action' };
const TAB_NEXT = { action: 'character', character: 'transition', transition: 'scene', scene: 'action', dialogue: 'paren', paren: 'dialogue', shot: 'action', centered: 'action', act: 'action', lyric: 'dialogue', synopsis: 'action', section: 'action', pagebreak: 'action' };
const TAB_PREV = { action: 'scene', character: 'action', transition: 'character', scene: 'transition', dialogue: 'character', paren: 'dialogue', shot: 'action', centered: 'action', act: 'action', lyric: 'dialogue', synopsis: 'action', section: 'action', pagebreak: 'action' };

export const schema = new Schema({
  nodes: {
    doc: { content: 'el+' },
    el: {
      content: 'inline*', defining: true,
      attrs: { t: { default: 'action' }, dual: { default: false } },
      parseDOM: [{ tag: 'p[data-t]', getAttrs: (d) => ({ t: d.getAttribute('data-t'), dual: d.hasAttribute('data-dual') }) }],
      toDOM: (n) => ['p', { class: `sp-el sp-${n.attrs.t}${n.attrs.dual ? ' dual' : ''}`, 'data-t': n.attrs.t, ...(n.attrs.dual ? { 'data-dual': '' } : {}) }, 0],
    },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
  },
  marks: {
    strong: { parseDOM: [{ tag: 'b' }, { tag: 'strong' }], toDOM: () => ['strong', 0] },
    em: { parseDOM: [{ tag: 'i' }, { tag: 'em' }], toDOM: () => ['em', 0] },
    underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
  },
});

/* ------------------------------------------------------- doc ↔ elements */

const escMarkup = (t) => t.replace(/([\\*_])/g, '\\$1');
function inlineToMarkup(node) {
  let out = '';
  node.forEach((child) => {
    if (child.type.name === 'hard_break') { out += '\n'; return; }
    let t = escMarkup(child.text || '');
    const m = (name) => child.marks.some((x) => x.type.name === name);
    if (m('underline')) t = `_${t}_`;
    if (m('em') && m('strong')) t = `***${t}***`;
    else if (m('strong')) t = `**${t}**`;
    else if (m('em')) t = `*${t}*`;
    out += t;
  });
  return out;
}

export function docToElements(doc) {
  const out = [];
  doc.forEach((n) => out.push({ type: n.attrs.t, text: inlineToMarkup(n), ...(n.attrs.dual ? { dual: true } : {}) }));
  return out;
}

export function elementsToDoc(elements) {
  const nodes = (elements.length ? elements : [{ type: 'scene', text: '' }]).map((e) => {
    const content = [];
    for (const r of parseInline(e.text || '')) {
      r.text.split('\n').forEach((piece, k) => {
        if (k) content.push(schema.nodes.hard_break.create());
        if (piece) content.push(schema.text(piece, [r.b && schema.marks.strong.create(), r.i && schema.marks.em.create(), r.u && schema.marks.underline.create()].filter(Boolean)));
      });
    }
    return schema.nodes.el.create({ t: TYPES.includes(e.type) ? e.type : 'action', dual: !!e.dual }, content);
  });
  return schema.nodes.doc.create(null, nodes);
}

/* --------------------------------------------------------------- commands */

const curEl = (state) => state.selection.$from.parent;
function setType(t) {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    if (dispatch) {
      let tr = state.tr;
      state.doc.nodesBetween($from.before(1), $to.after(1), (node, pos) => {
        if (node.type.name === 'el') tr = tr.setNodeMarkup(pos, null, { ...node.attrs, t, dual: t === 'character' ? node.attrs.dual : false });
        return false;
      });
      dispatch(tr);
    }
    return true;
  };
}

function enter(state, dispatch) {
  const { $from, empty } = state.selection;
  const el = $from.parent;
  const t = el.attrs.t;
  if (empty && el.content.size === 0 && ['character', 'dialogue', 'paren', 'transition', 'lyric'].includes(t)) return setType('action')(state, dispatch);
  if (!dispatch) return true;
  let tr = state.tr;
  if (!empty) tr = tr.deleteSelection();
  // "(…)" typed as dialogue is really a parenthetical.
  if (t === 'dialogue' && /^\(.*\)$/.test(el.textContent.trim())) {
    tr = tr.setNodeMarkup($from.before(1), null, { t: 'paren', dual: false });
    const pos2 = tr.selection.from;
    dispatch(tr.split(pos2, 1, [{ type: schema.nodes.el, attrs: { t: 'dialogue', dual: false } }]).scrollIntoView());
    return true;
  }
  // Close an open parenthetical.
  if (t === 'paren' && $from.parentOffset === el.content.size && !/\)\s*$/.test(el.textContent)) tr = tr.insertText(')');
  const pos = tr.selection.from;
  const atStart = tr.selection.$from.parentOffset === 0 && el.content.size > 0;
  const next = atStart ? t : ENTER_NEXT[t] || 'action';
  tr = tr.split(pos, 1, [{ type: schema.nodes.el, attrs: { t: next, dual: false } }]);
  if (next === 'paren') tr = tr.insertText('()').setSelection(TextSelection.create(tr.doc, tr.selection.from - 1));
  dispatch(tr.scrollIntoView());
  return true;
}

function tab(dir) {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const el = $from.parent;
    const t = el.attrs.t;
    if (dir > 0 && t === 'dialogue' && el.content.size > 0 && $from.parentOffset === el.content.size) {
      // Tab at the end of dialogue starts a parenthetical, like Final Draft.
      if (dispatch) {
        let tr = state.tr.split($from.pos, 1, [{ type: schema.nodes.el, attrs: { t: 'paren' } }]);
        tr = tr.insertText('()').setSelection(TextSelection.create(tr.doc, tr.selection.from + 1));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    const next = (dir > 0 ? TAB_NEXT : TAB_PREV)[t] || 'action';
    if (next === 'paren' && dispatch) {
      let tr = state.tr.setNodeMarkup($from.before(1), null, { t: 'paren', dual: false });
      if (!el.textContent.trim()) tr = tr.insertText('()').setSelection(TextSelection.create(tr.doc, $from.pos + 1));
      dispatch(tr);
      return true;
    }
    return setType(next)(state, dispatch);
  };
}

function toggleDual(state, dispatch) {
  const { $from } = state.selection;
  if ($from.parent.attrs.t !== 'character') return false;
  if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(1), null, { ...$from.parent.attrs, dual: !$from.parent.attrs.dual }));
  return true;
}

/* -------------------------------------------------------------- SmartType */

const INTROS = ['INT. ', 'EXT. ', 'INT./EXT. ', 'I/E '];
const TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME'];
const EXTENSIONS = ['(V.O.)', '(O.S.)', '(O.C.)', "(CONT'D)"];
const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'MATCH CUT TO:', 'SMASH CUT TO:', 'JUMP CUT TO:', 'FADE OUT.', 'FADE TO BLACK.', 'FADE IN:', 'INTERCUT WITH:', 'BACK TO:'];

function collect(doc) {
  const chars = new Map();
  const locs = new Map();
  doc.forEach((n) => {
    const t = n.textContent.toUpperCase().trim();
    if (n.attrs.t === 'character' && t) { const name = t.replace(/\s*\(.*?\)\s*/g, ' ').trim(); chars.set(name, (chars.get(name) || 0) + 1); }
    if (n.attrs.t === 'scene') {
      const m = /^(?:INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E|INT\.?|EXT\.?|EST\.?)\s+(.+?)(?:\s+-+\s+.*)?$/.exec(t);
      if (m) locs.set(m[1], (locs.get(m[1]) || 0) + 1);
    }
  });
  const byFreq = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { chars: byFreq(chars), locs: byFreq(locs) };
}

/** Suggestions for the element at the cursor → { items, from, to } or null. */
function suggest(state) {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const el = $from.parent;
  const t = el.attrs.t;
  if ($from.parentOffset !== el.content.size) return null;
  const text = el.textContent;
  const up = text.toUpperCase();
  const start = $from.start();
  const known = collect(state.doc);
  let items = [];
  let from = start;
  if (t === 'character') {
    const paren = up.lastIndexOf('(');
    if (paren >= 0) {
      const part = up.slice(paren);
      items = EXTENSIONS.filter((x) => x.startsWith(part) && x !== part);
      from = start + paren;
    } else if (up.trim()) {
      items = known.chars.filter((c) => c.startsWith(up.trim()) && c !== up.trim());
    }
  } else if (t === 'scene') {
    const intro = /^(INT\.\/EXT\.|INT\.?|EXT\.?|EST\.?|I\/E)\s+/.exec(up);
    if (!intro) { items = up ? INTROS.filter((x) => x.startsWith(up) && x.trim() !== up.trim()) : INTROS; }
    else {
      const rest = up.slice(intro[0].length);
      const dash = rest.lastIndexOf(' - ');
      if (dash >= 0) {
        const part = rest.slice(dash + 3);
        items = TIMES.filter((x) => x.startsWith(part) && x !== part);
        from = start + intro[0].length + dash + 3;
      } else {
        items = known.locs.filter((l) => l.startsWith(rest) && l !== rest).map((l) => `${l} - `);
        from = start + intro[0].length;
      }
    }
  } else if (t === 'transition') {
    items = TRANSITIONS.filter((x) => x.startsWith(up) && x !== up);
  }
  items = items.slice(0, 8);
  return items.length ? { items, from, to: $from.pos } : null;
}

const acKey = new PluginKey('smarttype');
function smartTypePlugin(onRender) {
  return new Plugin({
    key: acKey,
    state: {
      init: () => ({ s: null, index: 0, dismissed: false }),
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(acKey);
        if (meta?.dismiss) return { s: null, index: 0, dismissed: true };
        if (meta?.index != null) return { ...prev, index: meta.index };
        if (!tr.docChanged && !tr.selectionSet) return prev;
        if (!tr.docChanged && prev.dismissed) return prev;
        const s = suggest(state);
        return { s, index: 0, dismissed: false };
      },
    },
    view: () => ({ update: (view) => onRender(view, acKey.getState(view.state)) }),
    props: {
      handleKeyDown(view, e) {
        const st = acKey.getState(view.state);
        if (!st?.s) return false;
        const n = st.s.items.length;
        if (e.key === 'ArrowDown') { view.dispatch(view.state.tr.setMeta(acKey, { index: (st.index + 1) % n })); return true; }
        if (e.key === 'ArrowUp') { view.dispatch(view.state.tr.setMeta(acKey, { index: (st.index - 1 + n) % n })); return true; }
        if (e.key === 'Escape') { view.dispatch(view.state.tr.setMeta(acKey, { dismiss: true })); return true; }
        if (e.key === 'Enter' || e.key === 'Tab') { accept(view, st.s.items[st.index]); return true; }
        return false;
      },
    },
  });
}
function accept(view, item) {
  const st = acKey.getState(view.state);
  if (!st?.s) return;
  view.dispatch(view.state.tr.insertText(item, st.s.from, st.s.to).scrollIntoView());
}

/* ----------------------------------------------------- page-break markers */

const pbKey = new PluginKey('pagebreaks');
const pageBreaks = new Plugin({
  key: pbKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const meta = tr.getMeta(pbKey);
      if (meta) return meta;
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: { decorations: (state) => pbKey.getState(state) },
});

/* ----------------------------------------------------------------- editor */

export function createScriptEditor(mount, ctx) {
  const toolbar = h('div', { class: 'ql-toolbar sp-toolbar', role: 'toolbar', 'aria-label': 'Script formatting' });
  const area = h('div', { class: 'ql-container sp-container' });
  const ac = h('div', { class: 'smarttype', hidden: true, role: 'listbox' });
  mount.append(toolbar, area);
  area.append(ac);

  const keys = {
    Enter: enter, Tab: tab(1), 'Shift-Tab': tab(-1),
    'Shift-Enter': (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; },
    'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
    'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em), 'Mod-u': toggleMark(schema.marks.underline),
    'Mod-1': setType('scene'), 'Mod-2': setType('action'), 'Mod-3': setType('character'), 'Mod-4': setType('paren'),
    'Mod-5': setType('dialogue'), 'Mod-6': setType('transition'), 'Mod-7': setType('shot'), 'Mod-8': setType('centered'), 'Mod-9': setType('act'),
    'Mod-d': toggleDual,
  };
  const rules = inputRules({
    rules: [
      ...smartQuotes, ellipsis, emDash,
      // Typing a scene intro in Action turns it into a Scene Heading.
      new InputRule(/^(int|ext|est|int\.?\/ext|i\/e)\.?\s$/i, (state, m, start, end) => {
        const el = state.doc.resolve(start).parent;
        if (!['action', 'scene'].includes(el.attrs.t)) return null;
        const intro = m[1].toUpperCase().replace(/\.?$/, '');
        const word = intro === 'I/E' ? 'I/E ' : `${intro}. `;
        const $s = state.doc.resolve(start);
        return state.tr.setNodeMarkup($s.before(), null, { t: 'scene', dual: false }).insertText(word, start, end);
      }),
      // "(" at the start of dialogue makes a parenthetical.
      new InputRule(/^\($/, (state, _m, start, end) => {
        const $s = state.doc.resolve(start);
        if (!['dialogue', 'character'].includes($s.parent.attrs.t) || $s.parent.content.size > 0) return null;
        const tr = state.tr.setNodeMarkup($s.before(), null, { t: 'paren', dual: false }).insertText('()', start, end);
        return tr.setSelection(TextSelection.create(tr.doc, start + 1));
      }),
    ],
  });
  const plugins = [smartTypePlugin(renderAc), rules, keymap(keys), keymap(baseKeymap), history(), pageBreaks,
    new Plugin({ props: { decorations: currentDeco } })];
  function currentDeco(state) {
    const { $head } = state.selection;
    if (!$head.depth) return null;
    const from = $head.before(1);
    return DecorationSet.create(state.doc, [Decoration.node(from, from + $head.parent.nodeSize, { class: 'pm-current' })]);
  }

  const view = new EditorView(area, {
    state: EditorState.create({ doc: elementsToDoc([]), plugins }),
    attributes: { class: 'ql-editor sp-editor', spellcheck: 'true', 'aria-label': 'Screenplay' },
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr));
      refresh();
      if (tr.docChanged || tr.selectionSet) ctx.onChange?.(tr);
    },
    transformPastedHTML: (html) => html.replace(/<img[^>]*>/gi, ''),
    clipboardTextParser(text, $context) {
      // Pasted plain text becomes Action paragraphs.
      const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
      const t = $context.parent.attrs?.t || 'action';
      const nodes = paras.map((p, i) => schema.nodes.el.create({ t: i === 0 ? t : 'action' }, p ? p.split('\n').flatMap((l, k) => [...(k ? [schema.nodes.hard_break.create()] : []), ...(l ? [schema.text(l)] : [])]) : []));
      return new Slice(Fragment.from(nodes), 0, 0);
    },
  });

  function renderAc(v, st) {
    if (!st?.s || !v.hasFocus()) { ac.hidden = true; return; }
    ac.replaceChildren(...st.s.items.map((it, i) => {
      const b = h('div', { class: `st-item${i === st.index ? ' on' : ''}`, role: 'option' }, it.trim());
      b.addEventListener('mousedown', (e) => { e.preventDefault(); accept(v, it); });
      return b;
    }), h('div', { class: 'st-hint' }, '↵ or Tab to accept · Esc'));
    let c;
    try { c = v.coordsAtPos(st.s.to); } catch { ac.hidden = true; return; }
    const box = area.getBoundingClientRect();
    ac.style.left = `${c.left - box.left}px`;
    ac.style.top = `${c.bottom - box.top + area.scrollTop + 4}px`;
    ac.hidden = false;
  }

  /* ---- toolbar */
  const elSel = h('select', { class: 'sp-elsel', 'aria-label': 'Element', title: 'Element (Tab / Enter to move between elements)' },
    ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'centered', 'act', 'lyric', 'synopsis', 'section', 'pagebreak'].map((t) =>
      h('option', { value: t }, `${t === 'pagebreak' ? 'Page Break' : ELEMENT_LABELS[t]}${SHORTCUT[t] ? `   ${SHORTCUT[t]}` : ''}`)));
  elSel.addEventListener('change', () => { setType(elSel.value)(view.state, view.dispatch); view.focus(); });
  const btn = (name, title, cmd, active) => {
    const b = h('button', { type: 'button', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: () => { cmd(view.state, view.dispatch); view.focus(); } }, icon(name));
    b._active = active;
    return b;
  };
  const markOn = (m) => (s) => { const { from, $from, to, empty } = s.selection; return empty ? !!m.isInSet(s.storedMarks || $from.marks()) : s.doc.rangeHasMark(from, to, m); };
  const dualBtn = btn('dual', 'Dual dialogue (⌘D) — on the second character', toggleDual, (s) => curEl(s).attrs.dual);
  toolbar.append(
    h('span', { class: 'ql-formats' }, elSel),
    h('span', { class: 'ql-formats' },
      btn('bold', 'Bold (⌘B)', toggleMark(schema.marks.strong), markOn(schema.marks.strong)),
      btn('italic', 'Italic (⌘I)', toggleMark(schema.marks.em), markOn(schema.marks.em)),
      btn('underline', 'Underline (⌘U)', toggleMark(schema.marks.underline), markOn(schema.marks.underline))),
    h('span', { class: 'ql-formats' }, dualBtn, btn('pagebreakIcon', 'Insert page break', (s, d) => { setType('pagebreak')(s, d); return true; })),
    h('span', { class: 'ql-formats' }, btn('undo', 'Undo', undo), btn('redo', 'Redo', redo)));

  function refresh() {
    const el = curEl(view.state);
    elSel.value = el.attrs.t;
    dualBtn.disabled = el.attrs.t !== 'character';
    for (const b of toolbar.querySelectorAll('button')) if (b._active) b.classList.toggle('ql-active', !!b._active(view.state));
  }

  return {
    view,
    load(elements) {
      view.updateState(EditorState.create({ doc: elementsToDoc(elements), plugins }));
      refresh();
    },
    elements: () => docToElements(view.state.doc),
    focus: () => view.focus(),
    /** Index of the element holding the cursor. */
    caretIndex: () => view.state.selection.$head.index(0),
    scrollToIndex(i) {
      let pos = 0;
      view.state.doc.forEach((n, off, idx) => { if (idx === i) pos = off + 1; });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, Math.min(pos, view.state.doc.content.size))).scrollIntoView());
      const dom = view.domAtPos(pos)?.node;
      const elDom = dom?.nodeType === 1 ? dom.closest?.('.sp-el') || dom : dom?.parentElement?.closest('.sp-el');
      elDom?.scrollIntoView({ block: 'center' });
      view.focus();
    },
    /** Show page breaks before the elements that start each page. */
    setPageBreaks(elementPage) {
      const decos = [];
      let prev = 1;
      view.state.doc.forEach((n, off, idx) => {
        const p = elementPage[idx] || prev;
        if (p > prev) {
          const dom = h('div', { class: 'sp-break', contenteditable: 'false' }, h('span', {}, `${p}.`));
          decos.push(Decoration.widget(off, dom, { side: -1, key: `pb${p}` }));
        }
        prev = Math.max(prev, p);
      });
      view.dispatch(view.state.tr.setMeta(pbKey, DecorationSet.create(view.state.doc, decos)).setMeta('addToHistory', false));
    },
    centerCaret() {
      const box = area.getBoundingClientRect();
      let c;
      try { c = view.coordsAtPos(view.state.selection.head); } catch { return; }
      area.scrollTop += c.top - (box.top + box.height * 0.45);
    },
    setType: (t) => setType(t)(view.state, view.dispatch),
  };
}
