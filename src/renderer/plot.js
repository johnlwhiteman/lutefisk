// Plot board: plotlines as swimlanes (rows) across the timeline of the story
// (columns — your chapters, or acts and beats you add). Drop cards where a
// plotline moves forward; drag them to re-plan. Data lives in book.plot.
//   ctx = { book, kind, markDirty(), timeline(): [{id, title, short}], jump(id) }
import { h, icon, popover, closePopovers, confirmDialog, toast, dialog } from './ui.js';
import { newId } from '../shared/sections.js';
import { avatar } from './characters.js';

export const LANE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SCRIPT_ACTS = ['Act One', 'Act Two — A', 'Midpoint', 'Act Two — B', 'Act Three'];

/** Create or repair the plot model. Book chapters become linked columns, in book order. */
export function ensurePlot(book, timeline, kind) {
  const p = (book.plot ||= {});
  p.lines = Array.isArray(p.lines) ? p.lines : [];
  p.columns = Array.isArray(p.columns) ? p.columns : [];
  p.cards = Array.isArray(p.cards) ? p.cards : [];
  p.skip = Array.isArray(p.skip) ? p.skip : [];
  if (!p.lines.length) p.lines.push({ id: newId('pl'), title: 'Main Plot', color: LANE_COLORS[0] }, { id: newId('pl'), title: 'Subplot', color: LANE_COLORS[1] });
  if (kind === 'book') {
    const ids = new Set(timeline.map((t) => t.id));
    // Columns whose chapter was deleted become free columns, keeping their cards.
    for (const c of p.columns) if (c.link && !ids.has(c.link)) { c.title = c.title || 'Removed chapter'; delete c.link; }
    // Add new chapters after the column of the chapter before them.
    let prevIdx = -1;
    for (const t of timeline) {
      const at = p.columns.findIndex((c) => c.link === t.id);
      if (at >= 0) { prevIdx = at; continue; }
      if (p.skip.includes(t.id)) continue;
      p.columns.splice(prevIdx + 1, 0, { id: newId('pc'), link: t.id, title: t.title });
      prevIdx += 1;
    }
  } else if (!p.columns.length) {
    for (const t of SCRIPT_ACTS) p.columns.push({ id: newId('pc'), title: t });
  }
  return p;
}

export function openPlot(ctx, sheet) {
  const book = ctx.book;
  const timeline = () => ctx.timeline();
  const plot = ensurePlot(book, timeline(), ctx.kind);
  const chars = () => (Array.isArray(book.characters) ? book.characters : []);
  const save = () => ctx.markDirty();
  let focusChar = null;
  let dragging = null;

  const board = h('div', { class: 'pb-board' });
  const scroller = h('div', { class: 'pb-scroll' }, board, h('button', { class: 'pb-add-lane', onclick: () => addLane() }, icon('plus', 14), 'Add Plotline'));
  const charFilter = h('button', { class: 'btn small pb-filter', onclick: () => {
    popover(charFilter, [{ header: 'Highlight a character' },
      { label: 'Everyone', icon: focusChar ? null : 'check', onClick: () => { focusChar = null; draw(); } },
      ...chars().map((c) => ({ label: c.name || 'Unnamed', icon: focusChar === c.id ? 'check' : null, onClick: () => { focusChar = c.id; draw(); } })),
      chars().length ? null : { label: 'No characters yet', disabled: true }].filter(Boolean), { width: 230 });
  } });
  const toolbar = h('div', { class: 'pb-toolbar' },
    h('button', { class: 'btn small', onclick: () => addLane() }, icon('plus', 13), 'Plotline'),
    h('button', { class: 'btn small', onclick: () => addColumn(plot.columns.length) }, icon('plus', 13), 'Column'),
    h('button', { class: 'btn small pb-from', title: 'Add chapters and scenes from the book as cards or columns', onclick: () => addFromManuscript() }, icon('scene', 13), 'Add from Chapters'),
    h('span', { class: 'spacer' }), charFilter,
    h('span', { class: 'pb-count' }));
  const body = h('div', { class: 'plot' }, toolbar, scroller);

  function addLane() {
    plot.lines.push({ id: newId('pl'), title: `Plotline ${plot.lines.length + 1}`, color: LANE_COLORS[plot.lines.length % LANE_COLORS.length] });
    save(); draw();
    requestAnimationFrame(() => [...board.querySelectorAll('.pb-lane-title')].at(-1)?.select());
  }
  function addColumn(at) {
    plot.columns.splice(at, 0, { id: newId('pc'), title: 'New column' });
    save(); draw();
    requestAnimationFrame(() => board.querySelectorAll('.pb-col-title')[at]?.select?.());
  }
  /** Bring existing chapters and scenes onto the board, as cards in a plotline or as columns. */
  async function addFromManuscript() {
    const src = ctx.sources ? ctx.sources() : timeline().map((t) => ({ id: t.id, title: t.title, col: t.id, depth: 0, text: '' }));
    if (!src.length) { toast('The book has no chapters yet', 'info', 1800); return; }
    const onBoard = new Set(plot.cards.map((c) => c.link).filter(Boolean));
    const checks = new Map();
    let mode = 'cards';
    const list = h('div', { class: 'pb-src-list' }, src.map((x) => {
      const cb = h('input', { type: 'checkbox', checked: !onBoard.has(x.id) && (x.depth > 0 || !src.some((y) => y.depth > 0 && y.col === x.id)) });
      checks.set(x, cb);
      return h('label', { class: `pb-src${x.depth ? ' sub' : ''}` }, cb, h('span', { class: 'pb-src-t' }, x.title), onBoard.has(x.id) ? h('small', { class: 'hint' }, 'on the board') : x.words ? h('small', { class: 'hint' }, `${x.words.toLocaleString()} words`) : null);
    }));
    const laneSel = h('select', { 'aria-label': 'Plotline' }, plot.lines.map((l) => h('option', { value: l.id }, l.title)));
    const asCards = h('input', { type: 'radio', name: 'pb-mode', checked: true });
    const asCols = h('input', { type: 'radio', name: 'pb-mode' });
    asCards.addEventListener('change', () => { mode = 'cards'; opts.hidden = false; });
    asCols.addEventListener('change', () => { mode = 'columns'; opts.hidden = true; });
    const opts = h('div', { class: 'pb-src-opts' }, h('label', {}, h('span', {}, 'Plotline'), laneSel), h('small', { class: 'hint' }, 'Each card goes in its chapter’s column.'));
    const all = h('button', { type: 'button', class: 'btn small plain', onclick: () => { const on = [...checks.values()].some((c) => !c.checked); for (const c of checks.values()) c.checked = on; } }, 'Select All / None');
    const body = h('div', { class: 'pb-src-dlg' },
      h('div', { class: 'pb-src-mode' }, h('label', {}, asCards, h('span', {}, 'As cards')), h('label', {}, asCols, h('span', {}, 'As columns'))),
      opts, h('div', { class: 'pb-src-head' }, h('b', {}, 'Chapters and scenes'), all), list);
    const ok = await dialog({ title: 'Add from Chapters', body, ok: 'Add', wide: true });
    if (!ok) return;
    const picked = src.filter((x) => checks.get(x).checked);
    if (!picked.length) return;
    let n = 0;
    if (mode === 'columns') {
      for (const x of picked) {
        if (x.depth === 0) {
          // A chapter is already a column unless it was hidden.
          if (plot.skip.includes(x.id)) { plot.skip = plot.skip.filter((y) => y !== x.id); n++; }
          continue;
        }
        if (plot.columns.some((c) => c.title === x.title && !c.link)) continue;
        const after = plot.columns.findIndex((c) => c.link === x.col);
        const col = { id: newId('pc'), title: x.title };
        // Scene columns go right after their chapter's column, in order.
        let at = plot.columns.length;
        if (after >= 0) { at = after + 1; while (at < plot.columns.length && plot.columns[at].from === x.col) at++; col.from = x.col; }
        plot.columns.splice(at, 0, col);
        n++;
      }
      ensurePlot(book, timeline(), ctx.kind);
    } else {
      for (const x of picked) {
        let col = plot.columns.find((c) => c.link === x.col)?.id;
        if (!col) { // chapter hidden from the board: show it again
          plot.skip = plot.skip.filter((y) => y !== x.col);
          ensurePlot(book, timeline(), ctx.kind);
          col = plot.columns.find((c) => c.link === x.col)?.id;
        }
        if (!col) continue;
        plot.cards.push({ id: newId('pk'), line: laneSel.value, col, title: x.title, text: x.text || '', chars: [], link: x.id });
        n++;
      }
    }
    save(); draw();
    toast(n ? `Added ${n} ${mode === 'columns' ? 'column' : 'card'}${n === 1 ? '' : 's'}` : 'Nothing new to add', 'info', 1600);
  }
  const colTitle = (c) => {
    if (!c.link) return c.title;
    const t = timeline().find((x) => x.id === c.link);
    return t ? t.title : c.title;
  };
  const colShort = (c) => (c.link ? timeline().find((x) => x.id === c.link)?.short : '') || '';

  function cardEl(card, line) {
    const cs = (card.chars || []).map((id) => chars().find((c) => c.id === id)).filter(Boolean);
    const dim = focusChar && !(card.chars || []).includes(focusChar);
    const el = h('div', { class: `pb-card${dim ? ' dim' : ''}${focusChar && !dim ? ' lit' : ''}`, draggable: 'true', tabindex: 0, style: { '--lane': line.color }, 'data-id': card.id, title: 'Click to edit · drag to move' },
      h('div', { class: 'pb-card-t' }, card.link ? h('span', { class: 'pb-card-link', title: 'From your manuscript' }, icon('doc', 11)) : null, card.title || 'Untitled'),
      card.text ? h('div', { class: 'pb-card-x' }, card.text) : null,
      cs.length ? h('div', { class: 'pb-card-chars' }, cs.map((c) => h('span', { class: 'pb-mini', title: c.name }, avatar(c, 18)))) : null);
    el.addEventListener('click', () => editCard(card, el));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editCard(card, el); } if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeCard(card); } });
    el.addEventListener('dragstart', (e) => { dragging = card.id; e.dataTransfer.setData('text/x-plot-card', card.id); e.dataTransfer.effectAllowed = 'move'; requestAnimationFrame(() => el.classList.add('dragging')); });
    el.addEventListener('dragend', () => { dragging = null; el.classList.remove('dragging'); board.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop')); });
    return el;
  }

  async function removeCard(card) {
    if ((card.title || card.text) && !(await confirmDialog('Delete this card?', card.title || ''))) return;
    plot.cards.splice(plot.cards.indexOf(card), 1); save(); draw();
  }

  function editCard(card, anchor) {
    const title = h('input', { type: 'text', class: 'pb-ed-title', value: card.title || '', placeholder: 'What happens', 'aria-label': 'Card title' });
    const text = h('textarea', { class: 'pb-ed-text', rows: 4, placeholder: 'Details, beats, questions…', 'aria-label': 'Card description' });
    text.value = card.text || '';
    const lineSel = h('select', { 'aria-label': 'Plotline' }, plot.lines.map((l) => h('option', { value: l.id, selected: l.id === card.line }, l.title)));
    const colSel = h('select', { 'aria-label': 'Column' }, plot.columns.map((c, i) => h('option', { value: c.id, selected: c.id === card.col }, `${colShort(c) || i + 1} · ${colTitle(c)}`)));
    const chipsEl = h('div', { class: 'pb-ed-chars' });
    const drawChips = () => chipsEl.replaceChildren(...chars().map((c) => {
      const on = (card.chars || []).includes(c.id);
      return h('button', { class: `pb-chip${on ? ' on' : ''}`, style: { '--c': c.color }, onclick: () => { card.chars = on ? card.chars.filter((x) => x !== c.id) : [...(card.chars || []), c.id]; save(); drawChips(); } }, avatar(c, 16), c.name || 'Unnamed');
    }), ...(chars().length ? [] : [h('small', { class: 'hint' }, 'Add characters with the Characters button to tag them here.')]));
    drawChips();
    const commit = () => { card.title = title.value.trim(); card.text = text.value.trim(); card.line = lineSel.value; card.col = colSel.value; save(); draw(); };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); closePopovers(); } });
    const form = h('div', { class: 'pb-ed' }, title, text,
      h('div', { class: 'pb-ed-row' }, h('label', {}, h('span', {}, 'Plotline'), lineSel), h('label', {}, h('span', {}, 'Column'), colSel)),
      h('div', { class: 'pb-ed-lbl' }, 'Characters'), chipsEl,
      h('div', { class: 'pb-ed-actions' },
        h('button', { class: 'btn small plain danger', onclick: () => { closePopovers(); removeCard(card); } }, icon('trash', 13), 'Delete'),
        card.link ? h('button', { class: 'btn small plain', onclick: () => { closePopovers(); ctx.jump(card.link); } }, icon('next', 13), 'Open') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small primary', onclick: () => { commit(); closePopovers(); } }, 'Done')));
    for (const el of [text, lineSel, colSel]) el.addEventListener('change', commit);
    title.addEventListener('change', commit);
    popover(anchor, [{ node: form }], { width: 340, onClose: () => {
      commit();
      // A card left completely empty is discarded.
      if (!card.title && !card.text && plot.cards.includes(card)) { plot.cards.splice(plot.cards.indexOf(card), 1); save(); draw(); }
    } });
    requestAnimationFrame(() => { title.focus(); title.select(); });
  }

  function laneMenu(line, btn) {
    const i = plot.lines.indexOf(line);
    popover(btn, [
      { node: h('div', { class: 'ch-colors' }, LANE_COLORS.map((col) => h('button', { class: `ch-color${col === line.color ? ' on' : ''}`, style: { background: col }, 'aria-label': col, onclick: () => { line.color = col; save(); draw(); closePopovers(); } }))) },
      '-',
      { label: 'Move Up', icon: 'up', disabled: i === 0, onClick: () => { plot.lines.splice(i - 1, 0, plot.lines.splice(i, 1)[0]); save(); draw(); } },
      { label: 'Move Down', icon: 'down', disabled: i === plot.lines.length - 1, onClick: () => { plot.lines.splice(i + 1, 0, plot.lines.splice(i, 1)[0]); save(); draw(); } },
      '-',
      { label: 'Delete Plotline', icon: 'trash', danger: true, disabled: plot.lines.length < 2, onClick: async () => {
        const n = plot.cards.filter((c) => c.line === line.id).length;
        if (n && !(await confirmDialog(`Delete “${line.title}”?`, `Its ${n} card${n === 1 ? '' : 's'} will be deleted too.`))) return;
        plot.lines.splice(i, 1); plot.cards = plot.cards.filter((c) => c.line !== line.id); save(); draw();
      } },
    ], { width: 220 });
  }

  function colMenu(col, btn) {
    const i = plot.columns.indexOf(col);
    popover(btn, [
      col.link ? { label: 'Go to Chapter', icon: 'next', onClick: () => ctx.jump(col.link) } : null,
      { label: 'Insert Column Before', icon: 'plus', onClick: () => addColumn(i) },
      { label: 'Insert Column After', icon: 'plus', onClick: () => addColumn(i + 1) },
      col.link ? null : { label: 'Move Left', icon: 'prev', disabled: i === 0, onClick: () => { plot.columns.splice(i - 1, 0, plot.columns.splice(i, 1)[0]); save(); draw(); } },
      col.link ? null : { label: 'Move Right', icon: 'next', disabled: i === plot.columns.length - 1, onClick: () => { plot.columns.splice(i + 1, 0, plot.columns.splice(i, 1)[0]); save(); draw(); } },
      '-',
      { label: col.link ? 'Hide Chapter from Board' : 'Delete Column', icon: 'trash', danger: true, onClick: async () => {
        const n = plot.cards.filter((c) => c.col === col.id).length;
        if (n && !(await confirmDialog(`Remove “${colTitle(col)}” from the board?`, `Its ${n} card${n === 1 ? '' : 's'} will be deleted.`))) return;
        if (col.link) plot.skip.push(col.link);
        plot.columns.splice(i, 1); plot.cards = plot.cards.filter((c) => c.col !== col.id); save(); draw();
      } },
      plot.skip.length && col.link ? { label: `Show ${plot.skip.length} Hidden Chapter${plot.skip.length === 1 ? '' : 's'}`, icon: 'eye', onClick: () => { plot.skip = []; ensurePlot(book, timeline(), ctx.kind); save(); draw(); } } : null,
    ].filter(Boolean), { width: 230 });
  }

  function cell(line, col) {
    const td = h('div', { class: 'pb-cell', 'data-line': line.id, 'data-col': col.id });
    const cards = plot.cards.filter((c) => c.line === line.id && c.col === col.id);
    for (const c of cards) td.append(cardEl(c, line));
    td.append(h('button', { class: 'pb-new', title: 'Add a card here', 'aria-label': `Add card to ${line.title}, ${colTitle(col)}`, onclick: () => {
      const card = { id: newId('pk'), line: line.id, col: col.id, title: '', text: '', chars: focusChar ? [focusChar] : [] };
      plot.cards.push(card); save(); draw();
      const el = board.querySelector(`.pb-card[data-id="${card.id}"]`);
      if (el) editCard(card, el);
    } }, icon('plus', 14)));
    td.addEventListener('dblclick', (e) => { if (e.target === td) td.querySelector('.pb-new').click(); });
    td.addEventListener('dragover', (e) => {
      if (!dragging) return;
      e.preventDefault();
      td.classList.add('drop');
      const before = [...td.querySelectorAll('.pb-card:not(.dragging)')].find((x) => e.clientY < x.getBoundingClientRect().top + x.offsetHeight / 2);
      td.querySelectorAll('.pb-card').forEach((x) => x.classList.toggle('ins-before', x === before));
      td.classList.toggle('ins-end', !before);
    });
    td.addEventListener('dragleave', (e) => { if (!td.contains(e.relatedTarget)) { td.classList.remove('drop', 'ins-end'); td.querySelectorAll('.ins-before').forEach((x) => x.classList.remove('ins-before')); } });
    td.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/x-plot-card') || dragging;
      const card = plot.cards.find((c) => c.id === id);
      if (!card) return;
      const beforeEl = td.querySelector('.pb-card.ins-before');
      card.line = line.id; card.col = col.id;
      plot.cards.splice(plot.cards.indexOf(card), 1);
      const beforeCard = beforeEl && plot.cards.find((c) => c.id === beforeEl.dataset.id);
      plot.cards.splice(beforeCard ? plot.cards.indexOf(beforeCard) : plot.cards.length, 0, card);
      dragging = null; save(); draw();
    });
    return td;
  }

  function draw() {
    ensurePlot(book, timeline(), ctx.kind);
    const cols = plot.columns;
    board.style.setProperty('--cols', String(cols.length));
    const corner = h('div', { class: 'pb-corner' }, h('span', {}, 'Plotlines'), h('span', { class: 'pb-corner-r' }, 'Chapters →'));
    const heads = cols.map((c, i) => {
      const more = h('button', { class: 'pb-col-more', 'aria-label': 'Column options', onclick: () => colMenu(c, more) }, icon('more', 14));
      const short = colShort(c);
      if (c.link) {
        return h('div', { class: 'pb-col linked' }, h('button', { class: 'pb-col-link', title: `Go to ${colTitle(c)}`, onclick: () => ctx.jump(c.link) }, short ? h('span', { class: 'pb-col-n' }, short) : null, h('span', { class: 'pb-col-t' }, colTitle(c))), more);
      }
      const t = h('input', { class: 'pb-col-title', value: c.title, 'aria-label': `Column ${i + 1} title` });
      t.addEventListener('change', () => { c.title = t.value.trim() || 'Untitled'; save(); });
      return h('div', { class: 'pb-col' }, h('span', { class: 'pb-col-n free' }, String(i + 1)), t, more);
    });
    const rows = plot.lines.flatMap((line) => {
      const t = h('input', { class: 'pb-lane-title', value: line.title, 'aria-label': 'Plotline name' });
      t.addEventListener('change', () => { line.title = t.value.trim() || 'Untitled plotline'; save(); });
      const more = h('button', { class: 'pb-lane-more', 'aria-label': `${line.title} options`, onclick: () => laneMenu(line, more) }, icon('more', 14));
      const n = plot.cards.filter((c) => c.line === line.id).length;
      const head = h('div', { class: 'pb-lane', style: { '--lane': line.color } }, h('span', { class: 'pb-lane-dot' }), h('div', { class: 'pb-lane-main' }, t, h('small', {}, `${n} card${n === 1 ? '' : 's'}`)), more);
      return [head, ...cols.map((c) => { const x = cell(line, c); x.style.setProperty('--lane', line.color); return x; })];
    });
    board.replaceChildren(corner, ...heads, ...rows);
    const fc = chars().find((c) => c.id === focusChar);
    charFilter.replaceChildren(fc ? avatar(fc, 16) : icon('people', 14), fc ? fc.name : 'All Characters', icon('chevron', 12));
    toolbar.querySelector('.pb-count').textContent = `${plot.cards.length} card${plot.cards.length === 1 ? '' : 's'} · ${plot.lines.length} plotline${plot.lines.length === 1 ? '' : 's'}`;
    if (!cols.length) board.append(h('p', { class: 'hint pb-nocols' }, 'Add a chapter or a column to start plotting.'));
  }

  draw();
  const close = sheet('Plot', body, { full: true });
  ctx.close = close;
  return { draw };
}
