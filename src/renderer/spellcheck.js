// Spelling and grammar, checked on this computer by Harper (harper.js,
// Apache-2.0) — a fast, private checker compiled to WebAssembly. No text is
// ever sent anywhere: the checker and its dictionary ship with Lutefisk.
//
// The editor plugin underlines problems (red for spelling, blue for grammar
// and style); click or right-click one for suggestions.
import { LocalLinter, createBinaryModuleFromUrl, Dialect } from 'harper.js';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const spellKey = new PluginKey('harper');
const DIALECTS = { american: Dialect.American, british: Dialect.British, canadian: Dialect.Canadian, australian: Dialect.Australian, indian: Dialect.Indian };

let linter = null;
let linterDialect = '';
let loading = null;
let words = [];
const ignored = new Set(); // "problem text|message" ignored for this session

/** The checker, created on first use (building the dictionary takes a moment). */
async function getLinter(dialect = 'american') {
  if (linter && linterDialect === dialect) return linter;
  if (loading && linterDialect === dialect) return loading;
  linterDialect = dialect;
  loading = (async () => {
    try { await linter?.dispose(); } catch { /* ignore */ }
    const binary = createBinaryModuleFromUrl(new URL('harper/harper.wasm', location.href).href, 'full');
    const l = new LocalLinter({ binary, dialect: DIALECTS[dialect] ?? Dialect.American });
    await l.setup();
    if (words.length) await l.importWords(words);
    linter = l;
    return l;
  })();
  try { return await loading; } finally { loading = null; }
}

/** Words you've added to your dictionary (kept in Settings, on this computer). */
export async function setDictionary(list) {
  words = [...new Set((list || []).filter((w) => typeof w === 'string' && w.trim()))];
  if (linter && words.length) await linter.importWords(words);
}

/**
 * The text of every textblock, with a map from each character (code point)
 * back to its document position. Inline atoms (footnotes, equations) count as
 * one object-replacement character so sentences stay intact.
 */
function collect(doc) {
  let text = '';
  const pos = []; // code point index → doc position
  doc.descendants((node, start) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false; // never check code blocks
    if (text) { text += '\n\n'; pos.push(-1, -1); }
    node.forEach((child, off) => {
      const p = start + 1 + off;
      if (child.isText) {
        // Skip inline code.
        if (child.marks.some((m) => m.type.name === 'code')) { for (let i = 0; i < [...child.text].length; i++) { text += ' '; pos.push(-1); } return; }
        let k = 0;
        for (const ch of child.text) { text += ch; pos.push(p + k); k += ch.length; }
      } else { text += '￼'; pos.push(p); }
    });
    return false;
  });
  return { text, pos };
}

const KIND_CLASS = (kind) => (kind === 'Spelling' || kind === 'Typo' ? 'spell' : kind === 'Style' || kind === 'Readability' || kind === 'Enhancement' || kind === 'Repetition' || kind === 'Redundancy' ? 'style' : 'grammar');

/**
 * The editor plugin. opts: { enabled(), dialect(), kinds(), auto(), onResult(lints) }
 * — kinds is a Set of 'spell' | 'grammar' | 'style' to show; auto() false means
 * check only on demand (recheck), not as you type; onResult hears each check.
 */
export function harperPlugin(opts) {
  let timer = 0;
  let version = 0;
  const run = async (view) => {
    const done = (decos, lints) => { view.dispatch(view.state.tr.setMeta(spellKey, { decos, lints, checked: true })); opts.onResult?.(lints); };
    if (!opts.enabled()) { done(DecorationSet.empty, []); return; }
    const my = ++version;
    const doc = view.state.doc;
    const { text, pos } = collect(doc);
    if (!text.trim()) { done(DecorationSet.empty, []); return; }
    opts.onBusy?.(true);
    let lints;
    try {
      const l = await getLinter(opts.dialect());
      lints = await l.lint(text, { language: 'plaintext' });
    } catch (err) { console.warn('[harper]', err); opts.onBusy?.(false); return; }
    if (my !== version || view.isDestroyed || view.state.doc !== doc) { if (!view.isDestroyed && my === version) schedule(view, 200); return; } // stale: the text changed meanwhile
    const kinds = opts.kinds();
    const chars = [...text];
    const found = [];
    for (const lint of lints) {
      const sp = lint.span();
      const a = sp.start, b = sp.end;
      sp.free?.();
      const problem = chars.slice(a, b).join('');
      const message = lint.message().replace(/`([^`]+)`/g, '“$1”');
      const kind = lint.lint_kind();
      const cls = KIND_CLASS(kind);
      if (!kinds.has(cls)) continue;
      if (ignored.has(`${problem}|${message}`)) continue;
      if (cls === 'spell' && words.some((w) => w.toLowerCase() === problem.toLowerCase())) continue;
      // Map back to document positions (both ends must land in text).
      let from = -1, to = -1;
      for (let i = a; i < b && from < 0; i++) if (pos[i] >= 0) from = pos[i];
      for (let i = b - 1; i >= a && to < 0; i--) if (pos[i] >= 0) to = pos[i] + chars[i].length;
      if (from < 0 || to <= from) continue;
      const suggestions = lint.suggestions().slice(0, 6).map((s) => ({ kind: s.kind(), text: s.get_replacement_text() }));
      found.push({ from, to, problem, message, kind, pretty: lint.lint_kind_pretty(), cls, suggestions });
    }
    const decos = DecorationSet.create(doc, found.map((f) => Decoration.inline(f.from, f.to, { class: `hp-lint hp-${f.cls}`, nodeName: 'span', title: `${f.pretty}: ${f.message}` }, { lint: f })));
    opts.onBusy?.(false);
    done(decos, found);
  };
  const auto = () => (opts.auto ? opts.auto() : true);
  const schedule = (view, delay = 700) => { clearTimeout(timer); timer = setTimeout(() => run(view), delay); };
  return new Plugin({
    key: spellKey,
    state: {
      init: () => ({ decos: DecorationSet.empty, lints: [], checked: false }),
      apply(tr, value) {
        const meta = tr.getMeta(spellKey);
        if (meta) return meta;
        if (!tr.docChanged) return value;
        // Keep underlines in place while you type; drop any the edit touched.
        let decos = value.decos.map(tr.mapping, tr.doc);
        const touched = [];
        tr.mapping.maps.forEach((m) => m.forEach((_os, _oe, ns, ne) => touched.push([ns, ne])));
        for (const [a, b] of touched) decos = decos.remove(decos.find(Math.max(0, a - 1), b + 1));
        return { decos, lints: value.lints, checked: value.checked };
      },
    },
    props: { decorations: (state) => spellKey.getState(state)?.decos },
    view(view) {
      view.harperRecheck = () => schedule(view, 0);
      if (auto()) schedule(view, 300);
      return {
        update(v, prev) {
          if (v.state.doc === prev.doc) return;
          if (auto()) schedule(v);
        },
        destroy() { clearTimeout(timer); },
      };
    },
  });
}

/** Re-check now (after a setting change). */
export function recheck(view) {
  if (!view || view.isDestroyed) return;
  view.harperRecheck?.();
}

/** The lint under a document position, if any. */
export function lintAt(state, pos) {
  const st = spellKey.getState(state);
  if (!st) return null;
  const hit = st.decos.find(pos, pos).find((d) => d.from <= pos && pos <= d.to);
  return hit ? { ...hit.spec.lint, from: hit.from, to: hit.to } : null;
}

/** Whether this document has been checked since it was loaded. */
export function wasChecked(state) { return !!spellKey.getState(state)?.checked; }

/** Every problem currently underlined, in document order: [{from, to, ...lint}]. */
export function lintsIn(state) {
  const st = spellKey.getState(state);
  if (!st) return [];
  return st.decos.find().map((d) => ({ ...d.spec.lint, from: d.from, to: d.to })).sort((a, b) => a.from - b.from);
}

export function ignoreLint(lint) { ignored.add(`${lint.problem}|${lint.message}`); }
export function warmUp(dialect) { getLinter(dialect).catch(() => {}); }
