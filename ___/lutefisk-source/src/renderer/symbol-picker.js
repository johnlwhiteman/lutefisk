// Insert Symbol: a searchable, categorized character palette for the text
// editor, with recently used symbols and lookup by Unicode code point.
import { h, icon } from './ui.js';
import { UNICODE_SYMBOLS, ALL_UNICODE_SYMBOLS, codeOf } from '../shared/unicode-symbols.js';

const RECENT_KEY = 'lutefisk.recentSymbols';
const recents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const remember = (ch) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([ch, ...recents().filter((c) => c !== ch)].slice(0, 32))); } catch { /* ignore */ } };
const nameOf = new Map(ALL_UNICODE_SYMBOLS.map((s) => [s.ch, s.name]));
const visible = (ch) => (/^[  -‏ ­⁠]$/.test(ch) ? '⎵' : ch);

/** Opens the picker. onInsert(ch) is called for each symbol chosen; the panel stays open. */
export function openSymbolPicker({ onInsert, onClose, fontFamily = '' } = {}) {
  let cat = recents().length ? 'recent' : UNICODE_SYMBOLS[0].id;
  let focusCh = null;
  const search = h('input', { type: 'search', class: 'sym-search', placeholder: 'Search: em dash, arrow, é, degree, U+2014…', 'aria-label': 'Search symbols' });
  const nav = h('nav', { class: 'sym-nav' });
  const grid = h('div', { class: 'sym-grid', role: 'listbox', 'aria-label': 'Symbols' });
  const big = h('div', { class: 'sym-big' });
  const info = h('div', { class: 'sym-info' });
  const status = h('span', { class: 'sym-status', role: 'status' });
  if (fontFamily) { grid.style.fontFamily = fontFamily; big.style.fontFamily = fontFamily; }

  const insert = (ch) => {
    onInsert?.(ch);
    remember(ch);
    status.textContent = `Inserted ${nameOf.get(ch) || codeOf(ch)}`;
    if (cat === 'recent' && !search.value) drawGrid();
  };
  const showInfo = (ch) => {
    focusCh = ch;
    big.textContent = visible(ch);
    info.replaceChildren(h('b', {}, nameOf.get(ch) || 'Character'), h('span', {}, codeOf(ch)),
      h('button', { class: 'btn small primary', onclick: () => insert(ch) }, 'Insert'));
  };
  const cell = (ch, name) => {
    const b = h('button', { class: 'sym-cell', role: 'option', title: `${name || ''} · ${codeOf(ch)}`, 'aria-label': name || codeOf(ch), onclick: () => insert(ch), onmouseenter: () => showInfo(ch), onfocus: () => showInfo(ch) }, visible(ch));
    if (visible(ch) !== ch) b.classList.add('invisible-char');
    return b;
  };

  function results() {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      if (cat === 'recent') return recents().map((ch) => ({ ch, name: nameOf.get(ch) }));
      return UNICODE_SYMBOLS.find((c) => c.id === cat).items.map(([ch, name]) => ({ ch, name }));
    }
    const out = [];
    const code = /^(?:u\+|0x|&#x)?([0-9a-f]{2,6});?$/i.exec(q);
    if (code) {
      const cp = parseInt(code[1], 16);
      if (cp >= 0x20 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) out.push({ ch: String.fromCodePoint(cp), name: nameOf.get(String.fromCodePoint(cp)) || `Character ${codeOf(String.fromCodePoint(cp))}` });
    }
    const words = q.split(/\s+/);
    for (const s of ALL_UNICODE_SYMBOLS) {
      if (s.ch === q || words.every((w) => s.name.toLowerCase().includes(w) || s.cat.toLowerCase().includes(w))) out.push(s);
    }
    return [...new Map(out.map((s) => [s.ch, s])).values()].slice(0, 400);
  }
  function drawGrid() {
    const list = results();
    grid.replaceChildren(...list.map((s) => cell(s.ch, s.name)));
    if (!list.length) grid.append(h('p', { class: 'hint sym-empty' }, search.value ? 'No symbols match. Try another word, or type a code like U+2192.' : 'Symbols you insert will appear here.'));
    if (list[0]) showInfo(list[0].ch); else { big.textContent = ''; info.replaceChildren(); }
  }
  function drawNav() {
    nav.replaceChildren(
      h('button', { class: cat === 'recent' && !search.value ? 'on' : '', onclick: () => { cat = 'recent'; search.value = ''; drawNav(); drawGrid(); } }, icon('clock', 15), 'Recently Used'),
      ...UNICODE_SYMBOLS.map((c) => h('button', { class: cat === c.id && !search.value ? 'on' : '', onclick: () => { cat = c.id; search.value = ''; drawNav(); drawGrid(); } }, c.label)));
  }
  search.addEventListener('input', () => { drawNav(); drawGrid(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (focusCh) insert(focusCh); }
    if (e.key === 'ArrowDown') { e.preventDefault(); grid.querySelector('.sym-cell')?.focus(); }
  });
  grid.addEventListener('keydown', (e) => {
    const cells = [...grid.querySelectorAll('.sym-cell')];
    const i = cells.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = Math.max(1, Math.round(grid.clientWidth / (cells[0]?.offsetWidth || 44)));
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (move) { e.preventDefault(); cells[Math.max(0, Math.min(cells.length - 1, i + move))]?.focus(); }
  });

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const dlg = h('div', { class: 'dlg sym-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Insert symbol' },
    h('div', { class: 'sym-head' }, h('h2', {}, icon('omega', 18), 'Insert Symbol'), search, h('button', { class: 'btn primary', onclick: close }, 'Done')),
    h('div', { class: 'sym-body' }, nav, grid),
    h('div', { class: 'sym-foot' }, big, info, h('span', { class: 'spacer' }), status),
    h('p', { class: 'hint sym-note' }, 'Shown in your book’s font. E-readers substitute a fallback font for characters a font doesn’t include.'));
  const overlay = h('div', { class: 'overlay' }, dlg);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => overlay.classList.add('in'));
  drawNav();
  drawGrid();
  requestAnimationFrame(() => search.focus());
  return { close };
}
