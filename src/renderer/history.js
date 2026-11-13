// Writing history: what you wrote each day, as charts. Everything is read from the
// local history log (per book in <book>/stats, across books in the app's data folder).
import { h, icon, segmented } from './ui.js';
import { textInsights, bookTextUnits, helpTip } from './panels.js';
import { markdownToPlain } from '../shared/markdown.js';
import { dayKey } from './goals.js';

const DAY = 86400000;
const SVG = 'http://www.w3.org/2000/svg';
const n0 = (n) => Math.round(n).toLocaleString();
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString()}`;
const mins = (secs) => (secs >= 3600 ? `${Math.floor(secs / 3600)} h ${String(Math.round((secs % 3600) / 60)).padStart(2, '0')} min` : `${Math.round(secs / 60)} min`);
const dateOf = (k) => new Date(`${k}T12:00`);
const fmtDay = (k, o = { weekday: 'short', month: 'short', day: 'numeric' }) => dateOf(k).toLocaleDateString(undefined, o);

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}

/** "Nice" axis maximum and 3–4 ticks. */
function niceTicks(max, steps) {
  if (max <= 0) return { top: steps?.[0] || 1, ticks: [0, steps?.[0] || 1] };
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = steps?.find((m) => m >= raw) || [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) || 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

function tooltip(host) {
  const tip = h('div', { class: 'hx-tip', hidden: true });
  host.append(tip);
  return {
    show(x, y, lines) {
      tip.replaceChildren(...lines.map((l, i) => (i === 0 ? h('b', {}, l) : typeof l === 'string' ? h('div', {}, l) : l)));
      tip.hidden = false;
      const hw = host.clientWidth;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(4, Math.min(hw - tw - 4, x - tw / 2))}px`;
      tip.style.top = `${Math.max(0, y - tip.offsetHeight - 10)}px`;
    },
    hide() { tip.hidden = true; },
  };
}

const swatch = (cls) => h('i', { class: `hx-sw ${cls}` });

/**
 * Column chart. rows: [{key, label, values:[n...], tip:[lines]}]; series: [{name, cls}].
 * Grouped when there are several series. Values below zero hang under the baseline.
 */
function columnChart(host, rows, series, { height = 200, goal = 0, unit = '', fmtTick = n0, xLabels, steps } = {}) {
  host.replaceChildren();
  host.classList.add('hx-chart');
  const W = Math.max(320, host.clientWidth || 800);
  const padL = 44, padR = 8, padT = 12, padB = 24;
  const vals = rows.flatMap((r) => r.values);
  const maxV = Math.max(goal || 0, ...vals, 0);
  const minV = Math.min(0, ...vals);
  const { top, ticks } = niceTicks(maxV, steps);
  const step = ticks[1] || 1;
  // Negative days share the positive scale's step so the zero line stays put.
  const bottom = minV < 0 ? -step * Math.ceil(-minV / step) : 0;
  const H = height;
  const y = (v) => padT + ((top - v) / (top - bottom)) * (H - padT - padB);
  const plotW = W - padL - padR;
  const bw = plotW / Math.max(1, rows.length);
  const gap = Math.min(4, bw * 0.25);
  const inner = Math.max(1, bw - gap);
  const each = inner / series.length;
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': series.map((x) => x.name).join(' and ') + ' per period' });
  for (const t of ticks) svg.append(s('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), class: t === 0 ? 'hx-base' : 'hx-grid' }), s('text', { x: padL - 6, y: y(t) + 4, class: 'hx-tick', 'text-anchor': 'end' }, document.createTextNode(fmtTick(t))));
  if (bottom < 0) svg.append(s('text', { x: padL - 6, y: y(bottom) + 4, class: 'hx-tick', 'text-anchor': 'end' }, document.createTextNode(fmtTick(bottom))));
  const r = Math.min(3, each / 2);
  rows.forEach((row, i) => {
    row.values.forEach((v, j) => {
      if (!v) return;
      const x = padL + i * bw + gap / 2 + j * each;
      const y0 = y(0), y1 = y(v);
      const hgt = Math.max(1.5, Math.abs(y1 - y0));
      const top = v > 0 ? y0 - hgt : y0;
      // Rounded on the data end only, anchored square at the baseline.
      const w = Math.max(1, each - (series.length > 1 ? 1 : 0));
      const rr = Math.min(r, hgt);
      const d = v > 0
        ? `M${x},${y0} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${y0} Z`
        : `M${x},${y0} V${top + hgt - rr} Q${x},${top + hgt} ${x + rr},${top + hgt} H${x + w - rr} Q${x + w},${top + hgt} ${x + w},${top + hgt - rr} V${y0} Z`;
      svg.append(s('path', { d, class: `hx-bar ${v < 0 ? 'neg' : series[j].cls}` }));
    });
  });
  if (goal > 0) {
    svg.append(s('line', { x1: padL, x2: W - padR, y1: y(goal), y2: y(goal), class: 'hx-goal' }),
      s('text', { x: padL + 6, y: y(goal) - 5, class: 'hx-goal-l' }, document.createTextNode(`Goal ${n0(goal)}${unit}`)));
  }
  // x labels: a handful, evenly spaced
  const labels = xLabels || rows.map((x) => x.label);
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(plotW / 80))));
  rows.forEach((row, i) => {
    if (i % every && i !== rows.length - 1) return;
    if (i !== rows.length - 1 && rows.length - 1 - i < every * 0.7) return;
    svg.append(s('text', { x: padL + i * bw + bw / 2, y: H - 6, class: 'hx-tick', 'text-anchor': 'middle' }, document.createTextNode(labels[i])));
  });
  const hover = s('rect', { class: 'hx-hover', x: 0, y: padT, width: bw, height: H - padT - padB, hidden: '' });
  svg.prepend(hover);
  const tt = tooltip(host);
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - padL) / bw);
    if (i < 0 || i >= rows.length) { hover.setAttribute('hidden', ''); tt.hide(); return; }
    hover.removeAttribute('hidden');
    hover.setAttribute('x', padL + i * bw);
    tt.show(padL + i * bw + bw / 2, padT + 4, rows[i].tip);
  });
  svg.addEventListener('mouseleave', () => { hover.setAttribute('hidden', ''); tt.hide(); });
  host.append(svg);
}

/** Line + soft area for a running total. points: [{label, value|null, tip}] */
function lineChart(host, points, { height = 200, cls = 's1' } = {}) {
  host.replaceChildren();
  host.classList.add('hx-chart');
  const W = Math.max(320, host.clientWidth || 800);
  const padL = 52, padR = 12, padT = 12, padB = 24, H = height;
  const vals = points.map((p) => p.value).filter((v) => v != null);
  if (!vals.length) { host.append(h('p', { class: 'hint hx-empty' }, 'Your manuscript’s size will be charted here as you write.')); return; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.05, 10);
  const { ticks } = niceTicks(hi - lo + 2 * pad);
  const stepL = ticks[1] || 1;
  const t0 = Math.max(0, Math.floor((lo - pad) / stepL) * stepL);
  const yTop = Math.ceil((hi + pad) / stepL) * stepL;
  const y = (v) => padT + ((yTop - v) / (yTop - t0)) * (H - padT - padB);
  const plotW = W - padL - padR;
  const x = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Manuscript size over time' });
  for (let v = t0; v <= yTop + 1e-9; v += stepL) svg.append(s('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: v === t0 ? 'hx-base' : 'hx-grid' }), s('text', { x: padL - 6, y: y(v) + 4, class: 'hx-tick', 'text-anchor': 'end' }, document.createTextNode(n0(v))));
  const pts = points.map((p, i) => (p.value == null ? null : [x(i), y(p.value)])).filter(Boolean);
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  svg.append(s('path', { d: `${line} L${pts.at(-1)[0]},${y(t0)} L${pts[0][0]},${y(t0)} Z`, class: `hx-area ${cls}` }), s('path', { d: line, class: `hx-line ${cls}` }));
  const last = pts.at(-1);
  svg.append(s('circle', { cx: last[0], cy: last[1], r: 4, class: `hx-dot ${cls}` }));
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 90))));
  points.forEach((p, i) => { if (i % every === 0 || i === points.length - 1) { if (i !== points.length - 1 && points.length - 1 - i < every * 0.7) return; svg.append(s('text', { x: x(i), y: H - 6, class: 'hx-tick', 'text-anchor': i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle' }, document.createTextNode(p.label))); } });
  const cross = s('line', { class: 'hx-cross', y1: padT, y2: H - padB, hidden: '' });
  const mark = s('circle', { r: 4.5, class: `hx-dot ring ${cls}`, hidden: '' });
  svg.append(cross, mark);
  const tt = tooltip(host);
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - padL) / plotW) * (points.length - 1));
    const p = points[Math.max(0, Math.min(points.length - 1, i))];
    const k = points.indexOf(p);
    cross.removeAttribute('hidden'); cross.setAttribute('x1', x(k)); cross.setAttribute('x2', x(k));
    if (p.value != null) { mark.removeAttribute('hidden'); mark.setAttribute('cx', x(k)); mark.setAttribute('cy', y(p.value)); } else mark.setAttribute('hidden', '');
    tt.show(x(k), Math.min(y(p.value ?? t0), H - padB) - 6, p.tip);
  });
  svg.addEventListener('mouseleave', () => { cross.setAttribute('hidden', ''); mark.setAttribute('hidden', ''); tt.hide(); });
  host.append(svg);
}

/** A year of days as a calendar heatmap (one hue, light → dark). */
function heatmap(host, days, { weeks = 53 } = {}) {
  host.replaceChildren();
  host.classList.add('hx-chart', 'hx-heat-host');
  const cell = 12, gapC = 3, padL = 28, padT = 18;
  const end = new Date(); end.setHours(12, 0, 0, 0);
  const start = new Date(end.getTime() - ((weeks - 1) * 7 + end.getDay()) * DAY);
  const W = padL + weeks * (cell + gapC), H = padT + 7 * (cell + gapC);
  const vals = [...days.values()].map((v) => Math.max(0, v.words)).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0;
  const cuts = [q(0.25), q(0.5), q(0.75), q(0.92)];
  const level = (v) => (v <= 0 ? 0 : 1 + cuts.filter((c) => v > c).length);
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Words written each day over the last year' });
  ['Mon', 'Wed', 'Fri'].forEach((d, i) => svg.append(s('text', { x: 0, y: padT + (1 + i * 2) * (cell + gapC) + cell - 2, class: 'hx-tick' }, document.createTextNode(d))));
  const tt = tooltip(host);
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const t = new Date(start.getTime() + (w * 7 + d) * DAY);
      if (t > end) break;
      const k = dayKey(t);
      const v = days.get(k);
      const words = v?.words || 0;
      const x = padL + w * (cell + gapC), y = padT + d * (cell + gapC);
      if (d === 0 && t.getMonth() !== lastMonth) { lastMonth = t.getMonth(); if (w < weeks - 2) svg.append(s('text', { x, y: 11, class: 'hx-tick' }, document.createTextNode(t.toLocaleDateString(undefined, { month: 'short' })))); }
      const r = s('rect', { x, y, width: cell, height: cell, rx: 2.5, class: `hx-heat l${level(words)}${k === dayKey(Date.now()) ? ' today' : ''}` });
      r.addEventListener('mouseenter', () => tt.show(x + cell / 2, y, [fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), words ? `${signed(words)} words` : 'No writing', v?.sw ? `Stopwatch ${mins(v.sw)}` : '', v?.secs ? `Typing ${mins(v.secs)}` : ''].filter(Boolean)));
      r.addEventListener('mouseleave', () => tt.hide());
      svg.append(r);
    }
  }
  host.append(svg, h('div', { class: 'hx-heat-legend' }, h('span', {}, 'Less'), ...[0, 1, 2, 3, 4, 5].map((l) => h('i', { class: `hx-heat-k l${l}` })), h('span', {}, 'More')));
}

/**
 * Insights: your writing history (days, time, streaks) and an analysis of the
 * text, for this project or all of them. opts.textUnits() overrides the units
 * analysed.
 */
export function openInsights(app, goals, sheet, opts = {}) {
  let scope = 'book';
  let range = 30;
  let tab = opts.tab === 'text' ? 'text' : 'history';
  const body = h('div', { class: 'history insights' });
  const rangeSeg = segmented([{ value: 30, label: '30 Days' }, { value: 90, label: '90 Days' }, { value: 365, label: 'Year' }], range, (v) => { range = Number(v); draw(); }, { label: 'Range' });
  const controls = h('div', { class: 'hx-controls' },
    segmented([{ value: 'history', label: 'Writing History', icon: 'calendar' }, { value: 'text', label: 'Your Text', icon: 'doc' }], tab, (v) => { tab = v; show(); }, { label: 'Insights' }),
    h('span', { class: 'spacer' }),
    rangeSeg,
    segmented([{ value: 'book', label: 'This Book' }, { value: 'all', label: 'All Books' }], scope, (v) => { scope = v; show(); }, { label: 'Scope' }));
  const content = h('div', {});
  const textHost = h('div', { class: 'ins-text' });
  body.append(...(opts.textOnly ? [] : [controls]), content, textHost);
  let allTexts = null;
  async function drawText() {
    textHost.replaceChildren(h('p', { class: 'hint ins-empty' }, 'Analysing…'));
    if (scope === 'book') {
      const units = opts.textUnits ? opts.textUnits() : bookTextUnits(app);
      const pages = opts.pages ? opts.pages() : app.printPageCount?.() || 0;
      textHost.replaceChildren(textInsights(units, { pages, trimLabel: opts.trimLabel?.() || '', unitLabel: opts.unitLabel || 'Section', note: 'Excludes the title page, copyright page and generated sections. All analysis runs on this computer.' }));
    } else {
      try { allTexts ||= await window.lutefisk.allTexts(); } catch { allTexts = []; }
      const units = allTexts.map((p, i) => ({ id: `p${i}`, title: `${p.title}`, type: 'chapter', text: p.kind === 'screenplay' ? p.text.replace(/^\s*(INT|EXT|EST|INT\.\/EXT)[. ].*$/gim, '') : markdownToPlain(p.text) }));
      textHost.replaceChildren(textInsights(units, { unitLabel: 'Project', note: `${units.length} project${units.length === 1 ? '' : 's'} in your Library. All analysis runs on this computer.` }));
    }
  }
  function show() {
    rangeSeg.hidden = tab !== 'history';
    content.hidden = tab !== 'history';
    textHost.hidden = tab !== 'text';
    if (tab === 'history') draw(); else drawText();
  }

  function draw() {
    const days = goals.byDay(scope);
    const target = goals.dailyTarget(scope);
    const keys = [];
    for (let i = range - 1; i >= 0; i--) keys.push(dayKey(Date.now() - i * DAY));
    const list = keys.map((k) => ({ k, ...(days.get(k) || { words: 0, secs: 0, sw: 0, total: null, added: 0, removed: 0 }) }));
    const written = list.reduce((n, d) => n + d.words, 0);
    const writingDays = list.filter((d) => d.words > 0 || d.sw > 60);
    const best = list.reduce((b, d) => (d.words > (b?.words || 0) ? d : b), null);
    const swTotal = list.reduce((n, d) => n + d.sw, 0);
    const typing = list.reduce((n, d) => n + d.secs, 0);
    const avg = writingDays.length ? written / writingDays.length : 0;
    const perHour = swTotal > 600 ? written / (swTotal / 3600) : typing > 600 ? written / (typing / 3600) : 0;

    const TIPS = {
      'Words written': 'Net words added in this period: words you wrote minus words you deleted.',
      'Writing days': 'Days with any writing or at least a minute on the stopwatch. The streak counts consecutive days up to today.',
      Average: 'Net words on an average writing day — days off aren’t counted.',
      'Best day': 'The day with the most net words in this period.',
      Stopwatch: 'Time you clocked with the stopwatch in the book bar. Words per hour divides words written by this time.',
      'Typing time': 'Minutes with keystrokes, counted automatically. Gaps over 90 seconds count as breaks.',
    };
    const tile = (label, value, sub, cls = '') => h('div', { class: `hx-tile ${cls}` }, h('div', { class: 'hx-tile-l' }, label, TIPS[label] ? helpTip(TIPS[label]) : null), h('div', { class: 'hx-tile-v' }, value), h('div', { class: 'hx-tile-s' }, sub || '\u00a0'));
    const tiles = h('div', { class: 'hx-tiles' },
      tile('Words written', signed(written), `in the last ${range === 365 ? 'year' : `${range} days`}`),
      tile('Writing days', n0(writingDays.length), `of ${range} · streak ${goals.streak(scope)}`),
      tile('Average', n0(avg), 'words on a writing day'),
      tile('Best day', best ? n0(best.words) : '—', best ? fmtDay(best.k) : 'no writing yet'),
      tile('Stopwatch', mins(swTotal), perHour ? `${n0(perHour)} words / hour` : 'start it from the book bar'),
      tile('Typing time', mins(typing), 'minutes with keystrokes'));

    // Group by week for the year view so bars stay readable.
    const buckets = range === 365 ? [] : list.map((d) => ({ ...d, label: fmtDay(d.k, { month: 'short', day: 'numeric' }), keys: [d.k] }));
    if (range === 365) {
      for (let i = 0; i < list.length; i += 7) {
        const chunk = list.slice(i, i + 7);
        buckets.push({ k: chunk[0].k, keys: chunk.map((c) => c.k), label: fmtDay(chunk[0].k, { month: 'short', day: 'numeric' }), words: chunk.reduce((n, c) => n + c.words, 0), sw: chunk.reduce((n, c) => n + c.sw, 0), secs: chunk.reduce((n, c) => n + c.secs, 0), added: chunk.reduce((n, c) => n + c.added, 0), removed: chunk.reduce((n, c) => n + c.removed, 0), total: [...chunk].reverse().find((c) => c.total != null)?.total ?? null });
      }
    }
    const period = (b) => (b.keys.length > 1 ? `Week of ${fmtDay(b.k, { month: 'short', day: 'numeric' })}` : fmtDay(b.k, { weekday: 'long', month: 'short', day: 'numeric' }));

    const wordsHost = h('div');
    const totalHost = h('div');
    const timeHost = h('div');
    const heatHost = h('div');

    const rows = [...days.entries()].filter(([, v]) => v.words || v.sw > 30 || v.secs > 30).sort((a, b) => b[0].localeCompare(a[0]));
    const table = h('div', { class: 'hx-table-wrap' }, h('table', { class: 'hx-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', { class: 'num' }, 'Net words'), h('th', { class: 'num' }, 'Added'), h('th', { class: 'num' }, 'Removed'), scope === 'book' ? h('th', { class: 'num' }, 'Book total') : null, h('th', { class: 'num' }, 'Stopwatch'), h('th', { class: 'num' }, 'Typing'), h('th', {}, 'Goal'))),
      h('tbody', {}, rows.length ? rows.slice(0, 120).map(([k, v]) => h('tr', {},
        h('td', {}, fmtDay(k, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })),
        h('td', { class: `num ${v.words > 0 ? 'up' : v.words < 0 ? 'down' : ''}` }, signed(v.words)),
        h('td', { class: 'num' }, n0(v.added)), h('td', { class: 'num' }, n0(v.removed)),
        scope === 'book' ? h('td', { class: 'num' }, v.total != null ? n0(v.total) : '—') : null,
        h('td', { class: 'num' }, v.sw ? mins(v.sw) : '—'), h('td', { class: 'num' }, v.secs ? mins(v.secs) : '—'),
        h('td', {}, target ? (v.words >= target ? h('span', { class: 'hx-met' }, icon('check', 12), 'Met') : `${Math.floor((Math.max(0, v.words) / target) * 100)}%`) : '—')))
        : [h('tr', {}, h('td', { colspan: 8, class: 'hint' }, 'Your writing days will appear here as you write.'))])));

    const legend = (items) => h('div', { class: 'hx-legend' }, items.map(([cls, name]) => h('span', {}, swatch(cls), name)));
    content.replaceChildren(tiles,
      h('section', { class: 'hx-card' }, h('div', { class: 'hx-card-head' }, h('h3', {}, range === 365 ? 'Words per week' : 'Words per day'), legend([['s1', 'Net words'], ['neg', 'More removed than added'], ...(target && range !== 365 ? [['goal', 'Daily goal']] : [])])), wordsHost),
      scope === 'book' ? h('section', { class: 'hx-card' }, h('div', { class: 'hx-card-head' }, h('h3', {}, 'Manuscript size'), h('span', { class: 'hint' }, 'Words in the book at the end of each day')), totalHost) : null,
      h('section', { class: 'hx-card' }, h('div', { class: 'hx-card-head' }, h('h3', {}, range === 365 ? 'Time per week' : 'Time per day'), legend([['s1', 'Stopwatch'], ['s2', 'Typing']])), timeHost),
      h('section', { class: 'hx-card' }, h('div', { class: 'hx-card-head' }, h('h3', {}, 'The last year'), h('span', { class: 'hint' }, 'Each square is a day; darker means more words')), heatHost),
      h('section', { class: 'hx-card' }, h('div', { class: 'hx-card-head' }, h('h3', {}, 'Daily log')), table),
      h('p', { class: 'hint' }, 'Words are net — deleting counts against the day. Stopwatch time is what you clock with the stopwatch; typing time counts minutes with keystrokes (pauses over 90 seconds are breaks). History stays on this computer.'));

    requestAnimationFrame(() => {
      columnChart(wordsHost, buckets.map((b) => ({ label: b.label, values: [b.words], tip: [period(b), `${signed(b.words)} words`, b.added || b.removed ? `+${n0(b.added)} added · −${n0(b.removed)} removed` : '', b.sw ? `Stopwatch ${mins(b.sw)}` : ''].filter(Boolean) })), [{ name: 'Words', cls: 's1' }], { goal: range === 365 ? 0 : target, height: 210 });
      if (scope === 'book') {
        let carry = null;
        // Carry the last known total forward over days without saves.
        const before = [...days.entries()].filter(([k, v]) => k < buckets[0].k && v.total != null).sort((a, b) => a[0].localeCompare(b[0])).at(-1);
        carry = before ? before[1].total : null;
        const pts = buckets.map((b) => { if (b.total != null) carry = b.total; return { label: b.label, value: carry, tip: [period(b), carry != null ? `${n0(carry)} words in the book` : 'No data yet', b.words ? `${signed(b.words)} that ${b.keys.length > 1 ? 'week' : 'day'}` : ''].filter(Boolean) }; });
        if (pts.at(-1)) { pts.at(-1).value = goals.bookWords(); pts.at(-1).tip[1] = `${n0(pts.at(-1).value)} words in the book`; }
        lineChart(totalHost, pts, { height: 190 });
      }
      columnChart(timeHost, buckets.map((b) => ({ label: b.label, values: [Math.round(b.sw / 60), Math.round(b.secs / 60)], tip: [period(b), h('div', {}, swatch('s1'), `Stopwatch ${mins(b.sw)}`), h('div', {}, swatch('s2'), `Typing ${mins(b.secs)}`)] })), [{ name: 'Stopwatch minutes', cls: 's1' }, { name: 'Typing minutes', cls: 's2' }], { height: 180, steps: [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 600, 900, 1200, 1800], fmtTick: (v) => (v >= 60 ? `${Math.round((v / 60) * 10) / 10} h` : `${v} min`) });
      heatmap(heatHost, days);
    });
  }
  if (opts.textOnly) tab = 'text';
  goals.flush().then(() => { if (tab === 'history') draw(); });
  show();
  let t;
  const onResize = () => { clearTimeout(t); t = setTimeout(() => { if (tab === 'history') draw(); }, 150); };
  window.addEventListener('resize', onResize);
  sheet(opts.title || 'Insights', body, { wide: true, onClose: () => window.removeEventListener('resize', onResize) });
}

export const openHistory = (app, goals, sheet, opts) => openInsights(app, goals, sheet, opts);
