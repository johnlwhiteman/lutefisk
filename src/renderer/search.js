// Search the whole book: every chapter, scene and research note. Results are
// grouped by section with the matching line; click one to open it with the
// match selected. Matches stay highlighted in the editor while you search.
import { h, icon, debounce, dialog, toast } from './ui.js';
import { parseMarkdownDoc, searchRegex, findMatches } from './editor.js';

const docCache = new Map(); // id → { md, doc }
function docFor(id, md) {
  const hit = docCache.get(id);
  if (hit && hit.md === md) return hit.doc;
  let doc;
  try { doc = parseMarkdownDoc(md || ''); } catch { doc = null; }
  docCache.set(id, { md, doc });
  return doc;
}

function snippet(m) {
  const text = m.text.replace(/￼/g, ' ');
  const a = Math.max(0, m.at - 48);
  const b = Math.min(text.length, m.at + m.len + 72);
  return h('span', { class: 'sr-snip' },
    a > 0 ? '…' : '', text.slice(a, m.at).replace(/^\S*\s/, a > 0 ? '' : '$&'),
    h('mark', {}, text.slice(m.at, m.at + m.len)),
    text.slice(m.at + m.len, b), b < text.length ? '…' : '');
}

/**
 * ctx: { units(): [{id, title, sub?, md}] in book order, open(id, re, index), current(): id, flush() }
 */
export function createSearch(ctx) {
  let caseSensitive = false;
  let wholeWord = false;
  let query = '';
  const input = h('input', { type: 'search', class: 'sr-input', placeholder: 'Search the book', 'aria-label': 'Search the book', spellcheck: 'false' });
  const caseBtn = h('button', { class: 'sr-opt', title: 'Match case', 'aria-pressed': 'false', onclick: () => { caseSensitive = !caseSensitive; caseBtn.classList.toggle('on', caseSensitive); caseBtn.setAttribute('aria-pressed', String(caseSensitive)); run(); } }, 'Aa');
  const wordBtn = h('button', { class: 'sr-opt', title: 'Whole words', 'aria-pressed': 'false', onclick: () => { wholeWord = !wholeWord; wordBtn.classList.toggle('on', wholeWord); wordBtn.setAttribute('aria-pressed', String(wholeWord)); run(); } }, h('u', {}, 'ab'));
  // Find & replace: in the whole book, this chapter, this scene or the selected text.
  let replacing = false;
  let scope = 'book';
  const replIn = h('input', { type: 'text', class: 'sr-input', placeholder: 'Replace with', 'aria-label': 'Replace with', spellcheck: 'false' });
  const scopeSel = h('select', { class: 'sr-scope', 'aria-label': 'Where to search' },
    [['book', 'Whole book'], ['chapter', 'This chapter'], ['scene', 'This scene'], ['selection', 'Selected text']].map(([v, l]) => h('option', { value: v }, l)));
  scopeSel.addEventListener('change', () => { scope = scopeSel.value; run(); });
  const replOne = h('button', { class: 'btn small', title: 'Replace the selected match and go to the next', onclick: () => replaceOne() }, 'Replace');
  const replAll = h('button', { class: 'btn small', onclick: () => replaceAll() }, 'Replace All');
  const replRow = h('div', { class: 'sr-repl', hidden: true },
    h('div', { class: 'sr-bar sub' }, h('span', { class: 'sr-ic' }, icon('replace', 14)), replIn),
    h('div', { class: 'sr-repl-acts' }, scopeSel, h('span', { class: 'spacer' }), replOne, replAll));
  const replToggle = h('button', { class: 'sr-opt', title: 'Find and replace (⇧⌘H)', 'aria-pressed': 'false', onclick: () => setReplacing(!replacing) }, icon('replace', 13));
  function setReplacing(on) {
    replacing = on;
    replRow.hidden = !on;
    replToggle.classList.toggle('on', on);
    replToggle.setAttribute('aria-pressed', String(on));
    if (on) { if (ctx.hasSelection?.() && !input.value) { const t = ctx.selectionText?.() || ''; if (t.length < 80 && !t.includes('\n')) input.value = t; } bar.classList.add('active'); run(); (input.value ? replIn : input).focus(); }
  }
  const bar0 = h('div', { class: 'sr-bar' }, h('span', { class: 'sr-ic' }, icon('search', 14)), input, caseBtn, wordBtn, replToggle);
  const bar = h('div', { class: 'sr-wrap' }, bar0, replRow);
  const panel = h('div', { class: 'sr-panel', hidden: true, role: 'region', 'aria-label': 'Search results' });
  let flat = [];
  let sel = -1;

  function run() {
    query = input.value;
    bar0.classList.toggle('active', !!query.trim() || replacing);
    const re = searchRegex(query, { caseSensitive, wholeWord });
    lastRe = re;
    ctx.onActive?.(!!re);
    if (!re) { panel.hidden = true; panel.replaceChildren(); ctx.clear?.(); flat = []; return; }
    ctx.flush?.();
    const groups = [];
    let total = 0;
    const scoped = scope === 'selection' ? ctx.units('scene') : ctx.units(scope);
    for (const u of scoped) {
      const doc = docFor(u.id, u.md);
      if (!doc) continue;
      let ms = findMatches(doc, re).map((m, k) => ({ ...m, k }));
      if (scope === 'selection') ms = ctx.inSelection ? ms.filter((m) => ctx.inSelection(m)) : [];
      if (ms.length) { groups.push({ u, ms }); total += ms.length; }
    }
    flat = [];
    panel.hidden = false;
    panel.replaceChildren(
      h('div', { class: 'sr-sum' }, total ? `${total.toLocaleString()} match${total === 1 ? '' : 'es'} in ${groups.length} section${groups.length === 1 ? '' : 's'}` : 'No matches', total ? h('span', { class: 'hint' }, '↑↓ Enter') : null),
      ...groups.map(({ u, ms }) => h('section', { class: 'sr-group' },
        h('div', { class: 'sr-head' }, h('b', {}, u.title), u.sub ? h('small', {}, u.sub) : null, h('span', { class: 'sr-n' }, String(ms.length))),
        ...ms.slice(0, 50).map((m) => {
          const i = m.k;
          const btn = h('button', { class: 'sr-hit', onclick: () => pick(flat.indexOf(btn)) }, snippet(m));
          btn._go = () => ctx.open(u.id, re, i);
          btn._replaceHere = (to) => ctx.replaceAt(u.id, re, i, to);
          flat.push(btn);
          return btn;
        }),
        ms.length > 50 ? h('div', { class: 'hint sr-more' }, `and ${ms.length - 50} more in this section`) : null)));
    sel = -1;
    // Keep the open section's highlights in sync while typing.
    ctx.highlight?.(re);
  }
  const runSoon = debounce(run, 180);
  let lastRe = null;
  function replaceOne() {
    if (!lastRe) return;
    const i = Math.max(0, sel);
    const btn = flat[i];
    if (!btn) return;
    if (!btn._replaceHere) { btn._go(); return; }
    btn._replaceHere(replIn.value);
    run();
    pick(Math.min(i, flat.length - 1));
  }
  async function replaceAll() {
    if (!lastRe) return;
    const n = flat.length;
    if (!n) { toast('No matches to replace', 'info', 1400); return; }
    const where = { book: 'the whole book', chapter: 'this chapter', scene: 'this scene', selection: 'the selected text' }[scope];
    if (scope === 'book' || scope === 'chapter') {
      const ok = await dialog({ title: `Replace ${n.toLocaleString()} match${n === 1 ? '' : 'es'}?`, message: `Every “${input.value}” in ${where} becomes “${replIn.value}”. Changes in the open text can be undone with ⌘Z; to be safe, you can back up the project first (File › Back Up This Project).`, ok: 'Replace All' });
      if (!ok) return;
    }
    const count = ctx.replaceAll(scope, lastRe, replIn.value);
    toast(`Replaced ${count.toLocaleString()} match${count === 1 ? '' : 'es'}`, 'ok', 1800);
    run();
  }
  function pick(i) {
    if (i < 0 || i >= flat.length) return;
    flat[sel]?.classList.remove('sel');
    sel = i;
    flat[i].classList.add('sel');
    flat[i].scrollIntoView({ block: 'nearest' });
    flat[i]._go();
  }
  input.addEventListener('input', runSoon);
  replIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.metaKey || e.ctrlKey) replaceAll(); else replaceOne(); } if (e.key === 'Escape') { e.preventDefault(); setReplacing(false); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); input.value = ''; run(); input.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); pick(Math.min(flat.length - 1, sel + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pick(Math.max(0, sel - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(e.shiftKey ? Math.max(0, sel - 1) : (sel + 1) % Math.max(1, flat.length)); }
  });
  return {
    bar, panel,
    focus() { input.focus(); input.select(); },
    replace() { setReplacing(true); },
    unitsFor: (scope) => ctx.units(scope),
    refresh() { if (query.trim()) run(); },
    get active() { return !!query.trim(); },
    clear() { input.value = ''; run(); },
  };
}
