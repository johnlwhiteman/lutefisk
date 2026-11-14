// Writing goals and history. Tracks net words written and active writing time,
// logs them (per book and across all books) on this computer only, and shows
// progress toward daily, manuscript and deadline goals.
import { h, icon, toast, segmented, popover, confirmDialog } from './ui.js';
import { proseText } from '../shared/scenes.js';

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const n0 = (n) => Math.round(n).toLocaleString();
const B = () => window.lutefisk;

function globalGoal() { try { return Number(localStorage.getItem('lutefisk.dailyGoal')) || 0; } catch { return 0; } }
function setGlobalGoal(v) { try { localStorage.setItem('lutefisk.dailyGoal', String(Math.max(0, Math.round(v) || 0))); } catch { /* ignore */ } }

export function createGoals(app) {
  let history = { book: [], all: [] };
  let lastTotal = null;
  let pending = { d: 0, s: 0, sw: 0 };
  let lastActivity = 0;
  let lastFlush = Date.now();
  let onUpdate = () => {};

  /* ---- writing session: a clock of active writing time and net words.
     The clock runs while you write and stops after 90 s without an edit. */
  const IDLE = 90000;
  let sess = null;
  const sessKey = () => `lutefisk.sessions.${app.book?.uuid || 'none'}`;
  function sessionLog() { try { return JSON.parse(localStorage.getItem(sessKey()) || '[]'); } catch { return []; } }
  function archiveSession() {
    if (!sess || !app.book) return;
    const s = session();
    if (s.activeMs < 30000 && !s.words) return;
    const log = [{ start: new Date(s.start).toISOString(), end: new Date().toISOString(), ms: Math.round(s.activeMs), words: s.words }, ...sessionLog()].slice(0, 30);
    try { localStorage.setItem(sessKey(), JSON.stringify(log)); } catch { /* ignore */ }
  }
  function startSession() { sess = { start: Date.now(), active: 0, last: 0, paused: false, startWords: lastTotal ?? bookWords() }; }
  function session() {
    if (!sess) startSession();
    const now = Date.now();
    const live = sess.last && !sess.paused ? Math.min(now - sess.last, IDLE) : 0;
    return { start: sess.start, activeMs: sess.active + live, elapsedMs: now - sess.start, words: (lastTotal ?? sess.startWords) - sess.startWords, paused: sess.paused, writing: !!live && now - sess.last < IDLE };
  }
  function pauseSession(on) {
    if (!sess) return;
    if (on && !sess.paused) { sess.active = session().activeMs; sess.last = 0; sess.paused = true; } else if (!on) sess.paused = false;
    onUpdate();
  }
  function newSession() { archiveSession(); startSession(); onUpdate(); }

  /* ---- stopwatch: started and stopped by hand. Its time is logged per day.
     State is kept per book on this computer so it survives a restart (stopped). */
  const swKey = () => `lutefisk.stopwatch.${app.book?.uuid || 'none'}`;
  let sw = { acc: 0, since: 0 };
  function swLoad() {
    try { const v = JSON.parse(localStorage.getItem(swKey()) || 'null'); sw = { acc: Number(v?.acc) || 0, since: 0 }; } catch { sw = { acc: 0, since: 0 }; }
  }
  const swSave = () => { try { localStorage.setItem(swKey(), JSON.stringify({ acc: Math.round(stopwatch().ms) })); } catch { /* ignore */ } };
  function swTick() {
    // Move running time into the day's log so a long run is split across midnight correctly.
    if (!sw.since) return;
    const now = Date.now();
    const add = (now - sw.since) / 1000;
    sw.acc += now - sw.since; sw.since = now;
    pending.sw += add;
  }
  function stopwatch() { return { ms: sw.acc + (sw.since ? Date.now() - sw.since : 0), running: !!sw.since }; }
  function stopwatchStart() { if (!sw.since) { sw.since = Date.now(); onUpdate(); } }
  function stopwatchStop() { if (sw.since) { swTick(); sw.since = 0; swSave(); flush(); onUpdate(); } }
  function stopwatchReset() { if (sw.since) swTick(); sw = { acc: 0, since: sw.since ? Date.now() : 0 }; swSave(); flush(); onUpdate(); }
  setInterval(() => { if (sw.since) { swTick(); swSave(); if (Date.now() - lastFlush > 60000) flush(); } }, 15000);

  // Prose words only (no markup, code, maths or tables), cached per section text —
  // the same measure as the book bar, so "today" and "this session" agree.
  const proseCache = new Map();
  function proseWords(id, md) {
    const src = String(md || '');
    const hit = proseCache.get(id);
    if (hit?.src === src) return hit.n;
    const n = (proseText(src).match(/[\p{L}\p{N}’']+/gu) || []).length;
    proseCache.set(id, { src, n });
    return n;
  }

  /** Words in the manuscript (enabled, non-generated sections; research excluded). */
  function bookWords() {
    let n = 0;
    for (const s of app.book.sections) {
      if (s.enabled === false || ['title-page', 'toc', 'endnotes', 'bibliography', 'index'].includes(s.type)) continue;
      n += proseWords(s.id, app.contents[s.id]);
    }
    return n;
  }

  async function load() {
    try { history = await B().getHistory({ days: 400 }); } catch { history = { book: [], all: [] }; }
    if (sw.since) stopwatchStop();
    swLoad();
    lastTotal = bookWords();
    pending = { d: 0, s: 0, sw: 0 };
    lastFlush = Date.now();
    startSession();
    onUpdate();
  }

  /** Called on every edit: counts active writing time (gaps over 90 s are breaks). */
  function activity() {
    const now = Date.now();
    if (lastActivity && now - lastActivity < 90000) pending.s += (now - lastActivity) / 1000;
    lastActivity = now;
    if (sess && !sess.paused) {
      if (sess.last) sess.active += Math.min(now - sess.last, IDLE);
      sess.last = now;
    }
  }

  /** Called after each save: accumulates the net word change. */
  function measured(force = false) {
    if (!app.book || lastTotal == null) return;
    const total = bookWords();
    pending.d += total - lastTotal;
    lastTotal = total;
    onUpdate();
    if (force || Date.now() - lastFlush > 60000) flush();
  }

  async function flush() {
    if (sw.since) swTick();
    if (!app.book || (!pending.d && pending.s < 1 && pending.sw < 1)) return;
    const ev = { t: new Date().toISOString(), d: pending.d, w: lastTotal, s: Math.round(pending.s), sw: Math.round(pending.sw) };
    pending = { d: 0, s: 0, sw: 0 };
    lastFlush = Date.now();
    history.book.push(ev);
    history.all.push({ ...ev, b: app.book.uuid, n: app.book.title });
    try { await B().logHistory({ bookId: app.book.uuid, title: app.book.title, events: [ev] }); } catch { /* best effort */ }
  }

  function events(scope) {
    const base = scope === 'all' ? history.all : history.book;
    if (sw.since) swTick();
    return pending.d || pending.s || pending.sw ? [...base, { t: new Date().toISOString(), d: pending.d, w: lastTotal, s: pending.s, sw: pending.sw, b: app.book?.uuid }] : base;
  }

  /** Aggregate by day → Map(dayKey → {words, secs, sw, total, added, removed}).
      Deletions count against the day; `total` is the manuscript size at the day's last save. */
  function byDay(scope) {
    const m = new Map();
    for (const e of events(scope)) {
      const k = dayKey(e.t);
      const v = m.get(k) || { words: 0, secs: 0, sw: 0, total: null, added: 0, removed: 0 };
      v.words += e.d || 0; v.secs += e.s || 0; v.sw += e.sw || 0;
      if (e.d > 0) v.added += e.d; else if (e.d < 0) v.removed -= e.d;
      if (scope !== 'all' && e.w != null) v.total = e.w;
      m.set(k, v);
    }
    return m;
  }

  function today(scope) { return Math.max(0, byDay(scope).get(dayKey(Date.now()))?.words || 0); }

  function dailyTarget(scope) {
    if (scope === 'all') return globalGoal();
    return Number(app.book.goals?.dailyWords) || deadlinePace() || globalGoal();
  }

  /** Words per day needed to hit the manuscript goal by the deadline. */
  function deadlinePace() {
    const g = app.book.goals || {};
    if (!g.deadline || !(g.targetWords > 0)) return 0;
    const days = Math.ceil((Date.parse(`${g.deadline}T23:59:59`) - Date.now()) / DAY);
    const left = g.targetWords - (lastTotal ?? bookWords());
    if (left <= 0) return 0;
    return days > 0 ? Math.ceil(left / days) : left;
  }

  function streak(scope) {
    const m = byDay(scope);
    const target = dailyTarget(scope);
    const hit = (k) => (m.get(k)?.words || 0) >= Math.max(1, target);
    let s = 0;
    let d = Date.now();
    if (!hit(dayKey(d))) d -= DAY; // today still in progress
    while (hit(dayKey(d))) { s++; d -= DAY; }
    return s;
  }

  /** Reset Insights: clear the writing history (and session log and stopwatch) of this book, or of all books. */
  async function resetHistory(scope) {
    pending = { d: 0, s: 0, sw: 0 };
    await B().resetHistory({ scope, bookId: app.book?.uuid });
    try {
      for (const k of Object.keys(localStorage)) {
        if (scope === 'all' ? /^lutefisk\.(sessions|stopwatch)\./.test(k) : k === sessKey() || k === swKey()) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
    sw = { acc: 0, since: 0 };
    startSession();
    try { history = await B().getHistory({ days: 400 }); } catch { history = { book: [], all: [] }; }
    lastTotal = bookWords();
    onUpdate();
  }

  return {
    resetHistory,
    session, pauseSession, newSession, sessionLog, archiveSession,
    stopwatch, stopwatchStart, stopwatchStop, stopwatchReset,
    load, activity, measured, flush, today, dailyTarget, streak, byDay, events, bookWords, deadlinePace,
    set onUpdate(fn) { onUpdate = fn; },
  };
}

/* ------------------------------------------------------------- status bar */

export function goalMeter(app, goals, open) {
  const ring = h('span', { class: 'gm-ring' });
  const txt = h('span', { class: 'gm-text' });
  const el = h('button', { class: 'goal-meter', title: 'Writing goals', onclick: open }, ring, txt);
  const draw = () => {
    if (!app.book) return;
    const t = goals.today('book');
    const target = goals.dailyTarget('book');
    const pct = target ? Math.min(1, t / target) : 0;
    ring.style.setProperty('--p', String(pct));
    ring.classList.toggle('done', target > 0 && t >= target);
    txt.textContent = target ? `${n0(t)} / ${n0(target)} today` : `${n0(t)} today`;
  };
  return { el, draw };
}

/* ------------------------------------------------------------------ panel */

/** "Reset goals for all books" reaches each book the next time it's opened. Returns true if it changed the book. */
export function applyGoalReset(book) {
  let at = 0;
  try { at = Number(localStorage.getItem('lutefisk.goalsResetAt')) || 0; } catch { /* ignore */ }
  const g = book.goals || {};
  if (!at || (g.resetSeen || 0) >= at) return false;
  for (const k of ['targetWords', 'targetPages', 'deadline', 'dailyWords']) delete g[k];
  g.resetSeen = at;
  book.goals = g;
  return true;
}

export function openGoals(app, goals, sheet) {
  app.book.goals ||= {};
  const g = app.book.goals;
  let scope = 'book';
  const body = h('div', { class: 'goals' });
  const save = () => { g.resetSeen = Date.now(); app.markDirty(); draw(); goals.measured(); };

  const num = (val, onInput, attrs = {}) => {
    const el = h('input', { type: 'number', min: 0, step: attrs.step || 100, placeholder: attrs.placeholder || '' });
    el.value = val || '';
    el.addEventListener('input', () => onInput(el.value === '' ? 0 : Number(el.value)));
    return el;
  };
  const date = h('input', { type: 'date' });
  date.value = g.deadline || '';
  date.addEventListener('input', () => { g.deadline = date.value; save(); });

  const fWords = num(g.targetWords, (v) => { g.targetWords = v; save(); }, { step: 1000, placeholder: 'e.g. 80000' });
  const fPages = num(g.targetPages, (v) => { g.targetPages = v; save(); }, { step: 10, placeholder: 'e.g. 300' });
  const fDaily = num(g.dailyWords, (v) => { g.dailyWords = v; save(); }, { step: 50, placeholder: 'Auto from deadline' });
  const fGlobal = num(globalGoal(), (v) => { setGlobalGoal(v); draw(); }, { step: 50, placeholder: 'e.g. 1000' });
  const clearBook = () => {
    for (const k of ['targetWords', 'targetPages', 'deadline', 'dailyWords']) delete g[k];
    fWords.value = ''; fPages.value = ''; fDaily.value = ''; date.value = '';
  };
  const resetBook = async () => {
    if (!(await confirmDialog('Reset this book’s goals?', 'Clears the manuscript length, print length, deadline and daily goal for this book. Your writing history is kept.', 'Reset Goals'))) return;
    clearBook(); save(); toast('Goals for this book reset', 'ok', 1800);
  };
  const resetAll = async () => {
    if (!(await confirmDialog('Reset goals for all books?', 'Clears the daily goal across all books and this book’s goals. Each other book’s goals are cleared the next time you open it. Your writing history is kept.', 'Reset All Goals'))) return;
    setGlobalGoal(0); fGlobal.value = '';
    try { localStorage.setItem('lutefisk.goalsResetAt', String(Date.now())); } catch { /* ignore */ }
    g.resetSeen = Date.now();
    clearBook(); save(); toast('Goals reset for all books', 'ok', 1800);
  };
  const settings = h('section', { class: 'goal-settings' },
    h('h3', {}, 'Goals'),
    h('div', { class: 'goal-fields' },
      h('label', { class: 'fld' }, h('span', {}, 'Manuscript length (words)'), fWords),
      h('label', { class: 'fld' }, h('span', {}, 'Print length (pages)'), fPages),
      h('label', { class: 'fld' }, h('span', {}, 'Deadline'), date),
      h('label', { class: 'fld' }, h('span', {}, 'Daily goal for this book'), fDaily),
      h('label', { class: 'fld' }, h('span', {}, 'Daily goal, all books'), fGlobal)),
    h('div', { class: 'goal-reset' }, icon('reset', 14), h('span', {}, 'Reset goals'),
      h('button', { type: 'button', class: 'btn small', title: 'Reset goals for this book — clears its length goals, deadline and daily goal', onclick: resetBook }, 'This Book'),
      h('button', { type: 'button', class: 'btn small', title: 'Reset goals for all books — clears the all-books daily goal and every book’s goals', onclick: resetAll }, 'All Books')));

  const scopeSeg = segmented([{ value: 'book', label: 'This Book' }, { value: 'all', label: 'All Books' }], scope, (v) => { scope = v; draw(); }, { label: 'History scope' });
  const content = h('div', {});
  body.append(settings, h('div', { class: 'goal-scope' }, scopeSeg), content);

  function draw() {
    const total = goals.bookWords();
    const pages = app.printPageCount() || 0;
    const days = goals.byDay(scope);
    const todayW = goals.today(scope);
    const target = goals.dailyTarget(scope);
    const ev = goals.events(scope);

    // Last 30 days
    const last30 = [];
    for (let i = 29; i >= 0; i--) { const k = dayKey(Date.now() - i * DAY); last30.push({ k, ...(days.get(k) || { words: 0, secs: 0 }) }); }
    const week = last30.slice(-7).reduce((n, d) => n + Math.max(0, d.words), 0);
    const month = last30.reduce((n, d) => n + Math.max(0, d.words), 0);
    const active = last30.filter((d) => d.words > 0);
    const avg = active.length ? month / active.length : 0;
    const secs = last30.reduce((n, d) => n + d.secs, 0);
    const wph = secs > 600 ? (month / (secs / 3600)) : 0;

    // Time of day / day of week (net words added)
    const hours = Array(24).fill(0);
    const dows = Array(7).fill(0);
    for (const e of ev) { if (!(e.d > 0)) continue; const d = new Date(e.t); hours[d.getHours()] += e.d; dows[d.getDay()] += e.d; }
    const bestHour = hours.indexOf(Math.max(...hours));
    const hourLabel = (hh) => new Date(2000, 0, 1, hh).toLocaleTimeString([], { hour: 'numeric' });

    const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'tile-v' }, value), h('div', { class: 'tile-l' }, label), sub ? h('div', { class: 'tile-s' }, sub) : null);
    const progress = (label, cur, goal, unit, note) => {
      const pct = goal ? Math.min(100, (cur / goal) * 100) : 0;
      return h('div', { class: 'gprog' }, h('div', { class: 'gprog-top' }, h('b', {}, label), h('span', {}, goal ? `${n0(cur)} of ${n0(goal)} ${unit} · ${Math.floor(pct)}%` : `${n0(cur)} ${unit} — set a goal above`)),
        h('div', { class: 'gbar' }, h('i', { style: { width: `${pct}%` } })), note ? h('small', { class: 'hint' }, note) : null);
    };

    const pace = goals.deadlinePace();
    let finish = '';
    if (g.targetWords > total && avg > 0) {
      const d = new Date(Date.now() + Math.ceil((g.targetWords - total) / avg) * DAY);
      finish = `At your recent pace (${n0(avg)} words on writing days) you’ll reach ${n0(g.targetWords)} words around ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`;
    }

    const maxDay = Math.max(target || 0, ...last30.map((d) => d.words), 1);
    const chart = h('div', { class: 'gchart', role: 'img', 'aria-label': 'Words written per day, last 30 days' },
      target ? h('div', { class: 'gline', style: { bottom: `${(target / maxDay) * 100}%` }, title: `Daily goal: ${n0(target)}` }, h('span', {}, `Goal ${n0(target)}`)) : null,
      last30.map((d) => h('div', { class: 'gcol', title: `${new Date(`${d.k}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n0(d.words)} words${d.secs ? `, ${Math.round(d.secs / 60)} min` : ''}` },
        h('div', { class: `gbarv${d.words < 0 ? ' neg' : ''}${target && d.words >= target ? ' hit' : ''}`, style: { height: `${(Math.max(0, d.words) / maxDay) * 100}%` } }))));
    const axis = h('div', { class: 'gaxis' }, h('span', {}, new Date(`${last30[0].k}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })), h('span', {}, 'Today'));

    const maxH = Math.max(1, ...hours);
    const hourChart = h('div', { class: 'hchart', role: 'img', 'aria-label': 'Words by time of day' },
      hours.map((v, i) => h('div', { class: 'hcol2', title: `${hourLabel(i)}: ${n0(v)} words` }, h('div', { class: 'hbar2', style: { height: `${(v / maxH) * 100}%` } }))));
    const hourAxis = h('div', { class: 'gaxis' }, ['12 AM', '6 AM', '12 PM', '6 PM', '11 PM'].map((x) => h('span', {}, x)));
    const dowNames = [...Array(7)].map((_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
    const maxD = Math.max(1, ...dows);
    const dowList = h('div', { class: 'dows' }, dows.map((v, i) => h('div', { class: 'dow' }, h('span', {}, dowNames[i]), h('div', { class: 'gbar small' }, h('i', { style: { width: `${(v / maxD) * 100}%` } })), h('b', {}, n0(v)))));

    // Recent days table
    const rows = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
    const table = h('table', { class: 'chapters' }, h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', { class: 'num' }, 'Words'), h('th', { class: 'num' }, 'Writing time'), h('th', { class: 'num' }, 'Words / hour'), h('th', {}, 'Goal'))),
      h('tbody', {}, rows.length ? rows.map(([k, v]) => h('tr', {},
        h('td', {}, new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })),
        h('td', { class: 'num' }, n0(v.words)), h('td', { class: 'num' }, v.secs ? `${Math.max(1, Math.round(v.secs / 60))} min` : '—'),
        h('td', { class: 'num' }, v.secs > 300 ? n0(v.words / (v.secs / 3600)) : '—'),
        h('td', {}, target ? (v.words >= target ? '✓ Met' : `${Math.floor((Math.max(0, v.words) / target) * 100)}%`) : '—'))) : [h('tr', {}, h('td', { colspan: 5, class: 'hint' }, 'Your writing days will appear here as you write.'))]));

    // Per-book breakdown (all books scope)
    let books = null;
    if (scope === 'all') {
      const per = new Map();
      for (const e of goals.events('all')) {
        if (Date.now() - Date.parse(e.t) > 30 * DAY) continue;
        const k = e.b || '?';
        const v = per.get(k) || { name: e.n || 'Untitled', words: 0 };
        v.words += e.d || 0; if (e.n) v.name = e.n;
        per.set(k, v);
      }
      const list = [...per.values()].sort((a, b) => b.words - a.words);
      const maxB = Math.max(1, ...list.map((x) => x.words));
      books = h('section', {}, h('h3', {}, 'Books, last 30 days'), list.length ? h('div', { class: 'dows' }, list.map((x) => h('div', { class: 'dow wide' }, h('span', {}, x.name), h('div', { class: 'gbar small' }, h('i', { style: { width: `${(Math.max(0, x.words) / maxB) * 100}%` } })), h('b', {}, n0(x.words))))) : h('p', { class: 'hint' }, 'No writing logged yet.'));
    }

    content.replaceChildren(
      h('div', { class: 'tiles' },
        tile('Today', n0(todayW), target ? `${Math.floor(Math.min(1, todayW / target) * 100)}% of ${n0(target)}` : 'no daily goal'),
        tile('This week', n0(week), 'last 7 days'),
        tile('Last 30 days', n0(month), `${active.length} writing ${active.length === 1 ? 'day' : 'days'}`),
        tile('Streak', `${goals.streak(scope)} ${goals.streak(scope) === 1 ? 'day' : 'days'}`, target ? 'daily goal met' : 'days with writing'),
        tile('Writing time', secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.round(secs / 3600 * 10) / 10} h`, wph ? `${n0(wph)} words / hour` : 'last 30 days'),
        tile('Best time', ev.some((e) => e.d > 0) ? hourLabel(bestHour) : '—', 'most words written')),
      scope === 'book' ? h('section', { class: 'gprogs' },
        progress('Manuscript', total, g.targetWords, 'words', pace ? `To meet your deadline: ${n0(pace)} words a day.` : finish),
        progress('Print length', pages || Math.ceil(total / 275), g.targetPages, 'pages', pages ? (app.book.kind === 'screenplay' ? `About ${pages} minutes of screen time.` : '') : 'Estimated — open the Print preview for an exact count.'),
        g.deadline ? h('p', { class: 'hint' }, `Deadline ${new Date(`${g.deadline}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} — ${Math.max(0, Math.ceil((Date.parse(`${g.deadline}T23:59:59`) - Date.now()) / DAY))} days left. ${finish}`) : null) : null,
      h('section', {}, h('h3', {}, 'Words per day — last 30 days'), chart, axis),
      h('div', { class: 'stat-cols two' },
        h('section', {}, h('h3', {}, 'Time of day'), hourChart, hourAxis),
        h('section', {}, h('h3', {}, 'Day of week'), dowList)),
      books,
      h('section', {}, h('h3', {}, 'Recent days'), table),
      h('p', { class: 'hint' }, 'Words are net: deleting counts against the day. Writing time counts minutes with typing (pauses over 90 seconds are breaks). History is stored only on this computer — per book in the book’s stats folder, and across books in Lutefisk’s data folder.'));
  }
  goals.flush().then(draw);
  draw();
  sheet('Writing Goals', body, { wide: true });
  void toast; void icon;
}

/* ---------------------------------------------------------- session clock */

const clockText = (ms) => {
  const t = Math.floor(ms / 1000);
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
};
const dur = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

/** Status-bar clock: active writing time and words this session. */
export function sessionClock(app, goals, { running = false } = {}) {
  const time = h('span', { class: 'sc-time' });
  const words = h('span', { class: 'sc-words' });
  const el = h('button', { class: `session-clock${running ? ' running' : ''}`, title: 'Writing session — click for details', onclick: () => openPanel() }, icon('clock', 14), time, running ? null : words);
  const draw = () => {
    if (!app.book) return;
    const s = goals.session();
    time.textContent = clockText(running ? s.elapsedMs : s.activeMs);
    if (running) el.title = `Session running for ${clockText(s.elapsedMs)} · ${clockText(s.activeMs)} of active writing — click for details`;
    words.textContent = `${signed(s.words)} words`;
    el.classList.toggle('live', s.writing);
    el.classList.toggle('paused', s.paused);
  };
  const timer = setInterval(draw, 1000);

  function openPanel() {
    const s = goals.session();
    const perHour = s.activeMs > 60000 ? Math.round(s.words / (s.activeMs / 3600000)) : 0;
    const row = (k, v) => h('div', { class: 'sc-row' }, h('span', {}, k), h('b', {}, v));
    const recent = goals.sessionLog().slice(0, 5);
    const body = h('div', { class: 'sc-panel' },
      h('div', { class: 'sc-big' }, clockText(s.activeMs)),
      h('div', { class: 'sc-sub' }, s.paused ? 'Paused' : s.writing ? 'Writing' : 'Idle — the clock resumes when you type'),
      row('Words this session', signed(s.words)),
      row('Pace', perHour ? `${perHour.toLocaleString()} words / hour` : '—'),
      row('Started', new Date(s.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
      row('Elapsed, including breaks', dur(s.elapsedMs)),
      recent.length ? h('div', { class: 'sc-hist' }, h('div', { class: 'pop-head' }, 'Recent sessions'),
        ...recent.map((r) => h('div', { class: 'sc-row small' }, h('span', {}, new Date(r.start).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), h('b', {}, `${dur(r.ms)} · ${signed(r.words)}`)))) : null);
    popover(el, [
      { node: body },
      '-',
      s.paused ? { label: 'Resume Clock', icon: 'play', onClick: () => { goals.pauseSession(false); draw(); } } : { label: 'Pause Clock', icon: 'pause', onClick: () => { goals.pauseSession(true); draw(); } },
      { label: 'Start New Session', icon: 'rotate', onClick: () => { goals.newSession(); el.dispatchEvent(new Event('lutefisk-new-session')); draw(); toast('New writing session started'); } },
    ], { align: 'left', width: 280 });
  }
  draw();
  return { el, draw, stop: () => clearInterval(timer) };
}

/* -------------------------------------------------------------- stopwatch */

/** A start/stop stopwatch. It never starts by itself; its time is logged per day. */
export function stopwatchControl(app, goals, { onHistory } = {}) {
  const time = h('span', { class: 'sw-time' });
  const playIcon = h('span', { class: 'sw-ic' });
  const toggle = h('button', { class: 'sw-toggle', onclick: () => { const s = goals.stopwatch(); if (s.running) goals.stopwatchStop(); else goals.stopwatchStart(); draw(); } }, playIcon, time);
  const reset = h('button', { class: 'sw-reset', title: 'Reset stopwatch', 'aria-label': 'Reset stopwatch', onclick: () => { goals.stopwatchReset(); draw(); } }, icon('reset', 13));
  const el = h('div', { class: 'stopwatch', role: 'group', 'aria-label': 'Stopwatch' }, toggle, reset);
  let wasRunning = null;
  const draw = () => {
    if (!app.book) return;
    const s = goals.stopwatch();
    time.textContent = clockText(s.ms);
    el.classList.toggle('running', s.running);
    el.classList.toggle('zero', s.ms < 1000);
    if (wasRunning !== s.running) {
      playIcon.replaceChildren(icon('stopwatch', 17));
      toggle.title = s.running ? 'Stopwatch — running. Click to stop it.' : 'Stopwatch — click to start timing your writing. Its time is added to today’s writing log.';
      toggle.setAttribute('aria-label', s.running ? 'Stop stopwatch' : 'Start stopwatch');
      wasRunning = s.running;
    }
  };
  setInterval(draw, 1000);
  draw();
  void onHistory;
  return { el, draw };
}

/** Popover with this session's details, recent sessions and Start New Session. */
export function sessionPopover(anchor, goals, { onNew } = {}) {
  const s = goals.session();
  const row = (k, v) => h('div', { class: 'sc-row' }, h('span', {}, k), h('b', {}, v));
  const recent = goals.sessionLog().slice(0, 5);
  const body = h('div', { class: 'sc-panel' },
    row('Words this session', signed(s.words)),
    row('Started', new Date(s.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    row('Typing time', dur(s.activeMs)),
    recent.length ? h('div', { class: 'sc-hist' }, h('div', { class: 'pop-head' }, 'Earlier sessions'),
      ...recent.map((r) => h('div', { class: 'sc-row small' }, h('span', {}, new Date(r.start).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), h('b', {}, `${dur(r.ms)} · ${signed(r.words)}`)))) : null);
  popover(anchor, [
    { node: body }, '-',
    { label: 'Start New Session', icon: 'rotate', onClick: () => { goals.newSession(); onNew?.(); toast('New writing session started'); } },
  ], { align: 'left', width: 280 });
}
