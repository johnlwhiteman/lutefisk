// The writer's notebook: the logline, snippets and the to-do list.
// All of it stays in lutefisk.yaml and never appears in the book or its exports.
import { h, icon, toast, confirmDialog, popover, closePopovers, setHtml } from './ui.js';
import { createMiniEditor, SNIPPET_MIME } from './editor.js';
import { renderMarkdown, markdownToPlain } from '../shared/markdown.js';
import { newId } from '../shared/sections.js';
import { toBin } from './bin.js';
const countWords = (t) => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;

const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 420)}px`; };
const area = (value, attrs = {}) => {
  const ta = h('textarea', { rows: 2, ...attrs });
  ta.value = value || '';
  ta.addEventListener('input', () => autosize(ta));
  requestAnimationFrame(() => autosize(ta));
  return ta;
};

/* ================================================================ logline */
export function openLogline(app, sheet, onChange) {
  const b = app.book;
  const main = area(b.logline, { class: 'll-main', rows: 4, placeholder: 'Write your logline here.', 'aria-label': 'Logline' });
  const meter = h('div', { class: 'll-meter' });
  const drawMeter = () => {
    const n = countWords(main.value);
    const tone = !n ? '' : n < 25 ? 'short' : n <= 50 ? 'good' : 'long';
    meter.className = `ll-meter ${tone}`;
    meter.textContent = !n ? 'Aim for 25–50 words.' : `${n} word${n === 1 ? '' : 's'} — ${tone === 'short' ? 'a little short; aim for 25–50' : tone === 'good' ? 'a good length' : 'a little long; aim for 25–50'}`;
  };
  main.addEventListener('input', () => { b.logline = main.value; app.markDirty(); drawMeter(); onChange?.(); });
  drawMeter();
  const tips = h('ul', { class: 'll-tips' },
    h('li', {}, 'Say who the story is about, and what they want.'),
    h('li', {}, 'Name what stands in the way, and what happens if they fail.'),
    h('li', {}, 'One or two sentences, 25–50 words. Skip names unless they matter.'));
  sheet('Logline', h('div', { class: 'll-body' }, main, meter, tips), { wide: true, onClose: onChange });
  requestAnimationFrame(() => main.focus());
}

/**
 * ctx: {
 *   targets() → [{ id, label, depth, current }]  chapters and scenes you can insert into
 *   insert(snippet, targetId) → true when inserted
 * }
 */
export function openSnippets(app, sheet, ctx, onChange, { edit = null, fresh = false } = {}) {
  const b = app.book;
  let editAt = edit;
  b.snippets = Array.isArray(b.snippets) ? b.snippets : [];
  const list = h('div', { class: 'sn-list' });
  const changed = () => { app.markDirty(); onChange?.(); };
  let editing = fresh ? 'new' : null;
  const editor = (s) => {
    const title = h('input', { type: 'text', class: 'sn-title-in', value: s?.title || '', placeholder: 'Name (optional)', 'aria-label': 'Snippet name' });
    const text = createMiniEditor(s?.text || '', { label: 'Snippet text', placeholder: 'The passage — a line of dialogue, a description, a paragraph you’re saving for later.', onSubmit: () => save() });
    text.el.classList.add('sn-text-in');
    const save = () => {
      const body = text.markdown();
      if (!markdownToPlain(body).trim()) { toast('Write the snippet first', 'info', 1400); text.focus(); return; }
      if (s) { s.title = title.value.trim(); s.text = body; s.edited = Date.now(); }
      else b.snippets.unshift({ id: newId('snip'), title: title.value.trim(), text: body, created: Date.now() });
      editing = null; changed(); draw();
    };
    requestAnimationFrame(() => (s ? text.focus() : title.focus()));
    return h('div', { class: 'sn-card editing' }, title, text.el,
      h('div', { class: 'sn-acts' },
        h('span', { class: 'hint' }, '⌘↩ to save'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small plain', onclick: () => { editing = null; draw(); } }, 'Cancel'),
        h('button', { class: 'btn small primary', onclick: save }, s ? 'Save' : 'Add Snippet')));
  };
  const insertMenu = (anchor, s) => {
    const targets = ctx.targets();
    if (!targets.length) { toast('Add a chapter first', 'info'); return; }
    const cur = targets.find((t) => t.current);
    popover(anchor, [
      ...(cur ? [{ header: 'At the cursor' }, { label: cur.label, icon: 'pen', onClick: () => doInsert(s, cur.id) }, '-'] : []),
      { header: 'At the end of' },
      ...targets.map((t) => ({ label: `${t.depth ? '    ' : ''}${t.label}`, icon: t.depth ? 'scene' : 'doc', onClick: () => doInsert(s, t.id, true) })),
    ], { width: 300, maxHeight: 460 });
  };
  const doInsert = (s, id, atEnd = false) => {
    closePopovers();
    if (!ctx.insert(s, id, atEnd)) return;
    // Once used, a snippet leaves the list.
    b.snippets = b.snippets.filter((x) => x !== s);
    changed(); draw();
    toast(`Inserted “${s.title || 'snippet'}”`, 'ok', 2000);
  };
  const draw = () => {
    list.replaceChildren(
      editing === 'new' ? editor(null) : h('button', { class: 'btn small primary sn-new', onclick: () => { editing = 'new'; draw(); } }, icon('plus', 13), 'New Snippet'),
      ...b.snippets.map((s) => {
        if (editing === s) return editor(s);
        if (editAt === s.id) { editAt = null; editing = s; return editor(s); }
        const ins = h('button', { class: 'btn small', title: 'Insert into a chapter or scene — then it leaves Snippets', onclick: () => insertMenu(ins, s) }, icon('arrowRight', 13), 'Insert…');
        return h('div', { class: 'sn-card' },
          h('div', { class: 'sn-head' }, icon('snippet', 15), h('b', {}, s.title || 'Untitled snippet'), h('span', { class: 'hint' }, `${countWords(markdownToPlain(s.text))} words`)),
          snippetBody(s, 'sn-text'),
          h('div', { class: 'sn-acts' },
            h('button', { class: 'btn small plain', onclick: () => { editing = s; draw(); } }, icon('pen', 13), 'Edit'),
            h('button', { class: 'btn small plain', onclick: async () => {
              toBin(b, { kind: 'snippet', title: s.title || markdownToPlain(s.text).slice(0, 60), item: s, where: { index: b.snippets.indexOf(s) } });
              b.snippets = b.snippets.filter((x) => x !== s); changed(); draw();
              toast('Moved to the Recycle Bin', 'info', 1600);
            } }, icon('trash', 13), 'Delete'),
            h('span', { class: 'spacer' }), ins));
      }));
    if (!b.snippets.length && editing !== 'new') list.append(h('p', { class: 'th-empty' }, 'Save passages here and use them later: drag one from the Snippets panel beside the editor into the text, or right-click in the editor › Insert Snippet. A snippet leaves this list once it’s inserted.'));
  };
  draw();
  sheet('Snippets', h('div', { class: 'sn-body' }, list), { wide: true, onClose: onChange });
}

/** The editor’s right-click › Insert Snippet: pick one, insert at the cursor, remove it from the list. */
export function pickSnippet(app, at, insertHere, onChange) {
  const b = app.book;
  const list = Array.isArray(b?.snippets) ? b.snippets : [];
  if (!list.length) return;
  const anchor = h('span', { class: 'ctx-anchor', style: { left: `${at.x}px`, top: `${at.y}px` } });
  document.body.append(anchor);
  popover(anchor, [{ header: 'Insert snippet' }, ...list.map((s) => ({ label: s.title || markdownToPlain(s.text).slice(0, 40), hint: `${countWords(markdownToPlain(s.text))} w`, icon: 'snippet', onClick: () => {
    if (insertHere(s.text)) { b.snippets = b.snippets.filter((x) => x !== s); app.markDirty(); onChange?.(); toast('Snippet inserted', 'ok', 1500); }
  } }))], { width: 280, maxHeight: 420 });
  setTimeout(() => anchor.remove(), 0);
}

/** A snippet's text, formatted (bold, lists…) and clipped for a card. */
function snippetBody(s, cls, max = 600) {
  const md = s.text.length > max ? `${s.text.slice(0, max).replace(/\s+\S*$/, '')}…` : s.text;
  const el = h('div', { class: cls });
  setHtml(el, renderMarkdown(md, {}).html);
  return el;
}

/**
 * The Snippets panel beside the editor: every snippet as a card you drag into
 * the text. Dropped, it's inserted there and leaves the list.
 */
export function snippetRail(app, { onNew, onEdit, onClose }) {
  const el = h('aside', { class: 'snip-rail', 'aria-label': 'Snippets' });
  el.draw = () => {
    const list = Array.isArray(app.book?.snippets) ? app.book.snippets : [];
    el.replaceChildren(...[
      h('div', { class: 'snip-head' }, icon('snippet', 15), h('b', {}, 'Snippets'), list.length ? h('span', { class: 'snip-n' }, String(list.length)) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'sb-tool', title: 'New snippet', 'aria-label': 'New snippet', onclick: onNew }, icon('plus', 15)),
        h('button', { class: 'sb-tool', title: 'Hide snippets', 'aria-label': 'Hide snippets', onclick: onClose }, icon('close', 14))),
      list.length ? h('p', { class: 'snip-tip' }, 'Drag a snippet into your text. Once dropped, it leaves this list.') : null,
      ...list.map((s) => {
        const card = h('div', { class: 'snip-card', draggable: 'true', title: 'Drag into the text · double-click to edit', tabindex: 0,
          ondblclick: () => onEdit(s) },
        h('div', { class: 'snip-card-head' }, icon('grip', 13), h('b', {}, s.title || 'Untitled snippet'), h('span', { class: 'hint' }, `${countWords(markdownToPlain(s.text))} w`),
          h('button', { class: 'snip-edit', title: 'Edit', 'aria-label': `Edit ${s.title || 'snippet'}`, onclick: (e) => { e.stopPropagation(); onEdit(s); } }, icon('pen', 12))),
        snippetBody(s, 'snip-text', 260));
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData(SNIPPET_MIME, s.id);
          e.dataTransfer.setData('text/plain', markdownToPlain(s.text));
          e.dataTransfer.effectAllowed = 'copy';
          card.classList.add('dragging');
          document.body.classList.add('snippet-dragging');
        });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); document.body.classList.remove('snippet-dragging'); });
        return card;
      }),
      list.length ? null : h('div', { class: 'snip-empty' }, h('p', {}, 'No snippets yet.'), h('button', { class: 'btn small', onclick: onNew }, icon('plus', 13), 'New Snippet')),
    ].filter(Boolean));
  };
  return el;
}

/* ================================================================== to-do */
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = 86400000;
const parseDay = (k) => { const [y, m, d] = String(k || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const fmtDay = (k) => { const d = parseDay(k); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : ''; };
const fmtTime = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
/** A to-do is overdue when it's open and its deadline was before today. */
export const isOverdue = (t, today = dayKey()) => !t.done && !!t.due && t.due < today;
export const overdueCount = (book) => (Array.isArray(book?.todos) ? book.todos.filter((t) => isOverdue(t)).length : 0);
const dueLabel = (t, today = dayKey()) => {
  if (!t.due) return '';
  const days = Math.round((parseDay(t.due) - parseDay(today)) / DAY);
  if (t.done) return `Due ${fmtDay(t.due)}`;
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return `Due ${fmtDay(t.due)}`;
};

/** Statistics for the to-do list. */
export function todoStats(list, today = dayKey()) {
  const done = list.filter((t) => t.done);
  const open = list.filter((t) => !t.done);
  const week = dayKey(new Date(parseDay(today).getTime() + 7 * DAY));
  const took = done.filter((t) => t.doneAt && t.created).map((t) => (t.doneAt - t.created) / DAY);
  const late = done.filter((t) => t.due && t.doneAt && dayKey(new Date(t.doneAt)) > t.due).length;
  return {
    total: list.length, open: open.length, done: done.length,
    overdue: open.filter((t) => isOverdue(t, today)).length,
    dueToday: open.filter((t) => t.due === today).length,
    dueWeek: open.filter((t) => t.due && t.due >= today && t.due <= week).length,
    noDate: open.filter((t) => !t.due).length,
    pct: list.length ? Math.round((done.length / list.length) * 100) : 0,
    avgDays: took.length ? took.reduce((a, b) => a + b, 0) / took.length : null,
    onTime: done.filter((t) => t.due).length ? Math.round(((done.filter((t) => t.due).length - late) / done.filter((t) => t.due).length) * 100) : null,
    doneWeek: done.filter((t) => t.doneAt && Date.now() - t.doneAt < 7 * DAY).length,
  };
}

/** The book's to-do list: add, edit, tick off and delete, with optional deadlines and statistics. */
export function openTodos(app, sheet, onChange) {
  const b = app.book;
  b.todos = Array.isArray(b.todos) ? b.todos : [];
  let filter = 'open';
  let editing = null;
  const changed = () => { app.markDirty(); draw(); onChange?.(); };
  const text = h('input', { type: 'text', class: 'todo-new', placeholder: 'What?', 'aria-label': 'New to-do — what?', maxlength: 500 });
  const due = h('input', { type: 'date', class: 'todo-date', 'aria-label': 'Deadline (optional)', title: 'Deadline (optional)' });
  // Option: new to-dos are due today unless you change the date.
  let todayDefault = false;
  try { todayDefault = localStorage.getItem('lutefisk.todoToday') === '1'; } catch { /* ignore */ }
  const fillDue = () => { due.value = todayDefault ? dayKey() : ''; };
  const todayBox = h('input', { type: 'checkbox', checked: todayDefault, 'aria-label': 'Due today by default' });
  todayBox.addEventListener('change', () => {
    todayDefault = todayBox.checked;
    try { localStorage.setItem('lutefisk.todoToday', todayDefault ? '1' : '0'); } catch { /* ignore */ }
    fillDue(); text.focus();
  });
  fillDue();
  const add = () => {
    const v = text.value.trim();
    if (!v) { text.focus(); return; }
    b.todos.unshift({ id: newId('todo'), text: v, done: false, created: Date.now(), due: due.value || '' });
    text.value = ''; fillDue();
    if (filter === 'done') filter = 'open';
    changed();
    text.focus();
  };
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  due.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const capture = h('div', { class: 'todo-capture' }, icon('plus', 15), text, due,
    h('label', { class: 'todo-today', title: 'New to-dos get today’s date as their deadline (you can still change it)' }, todayBox, h('span', {}, 'Today')),
    h('button', { class: 'btn small primary', onclick: add }, 'Add'));

  const statsEl = h('div', { class: 'todo-stats' });
  const tabs = h('div', { class: 'todo-tabs', role: 'tablist' });
  const list = h('div', { class: 'todo-list' });

  const row = (t, today) => {
    if (editing === t) {
      const ti = h('input', { type: 'text', class: 'todo-edit-text', value: t.text, maxlength: 500, 'aria-label': 'To-do' });
      const di = h('input', { type: 'date', class: 'todo-date', value: t.due || '', 'aria-label': 'Deadline' });
      const save = () => { const v = ti.value.trim(); if (!v) { ti.focus(); return; } t.text = v; t.due = di.value || ''; t.edited = Date.now(); editing = null; changed(); };
      const key = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editing = null; draw(); } };
      ti.addEventListener('keydown', key); di.addEventListener('keydown', key);
      requestAnimationFrame(() => { ti.focus(); ti.select(); });
      return h('div', { class: 'todo-row editing' }, ti, di,
        di.value ? h('button', { class: 'btn small plain', title: 'Remove the deadline', onclick: () => { di.value = ''; } }, 'No date') : null,
        h('button', { class: 'btn small plain', onclick: () => { editing = null; draw(); } }, 'Cancel'),
        h('button', { class: 'btn small primary', onclick: save }, 'Save'));
    }
    const late = isOverdue(t, today);
    const box = h('input', { type: 'checkbox', class: 'todo-check', checked: !!t.done, 'aria-label': `Done: ${t.text}` });
    box.addEventListener('change', () => { t.done = box.checked; if (t.done) t.doneAt = Date.now(); else delete t.doneAt; changed(); });
    const meta = [h('span', { title: new Date(t.created).toLocaleString() }, `Added ${fmtTime(t.created)}`)];
    if (t.done && t.doneAt) meta.push(h('span', { title: new Date(t.doneAt).toLocaleString() }, `Done ${fmtTime(t.doneAt)}`));
    if (t.edited) meta.push(h('span', { title: new Date(t.edited).toLocaleString() }, `Edited ${fmtTime(t.edited)}`));
    return h('div', { class: `todo-row${t.done ? ' done' : ''}${late ? ' late' : ''}` },
      box,
      h('div', { class: 'todo-main', ondblclick: () => { editing = t; draw(); } },
        h('div', { class: 'todo-text' }, t.text),
        h('div', { class: 'todo-meta' }, ...meta)),
      t.due ? h('span', { class: `todo-due${late ? ' late' : t.due === today && !t.done ? ' today' : ''}`, title: `Deadline: ${fmtDay(t.due)}` }, icon('calendar', 12), dueLabel(t, today)) : null,
      h('button', { class: 'sb-tool', title: 'Edit', 'aria-label': `Edit ${t.text}`, onclick: () => { editing = t; draw(); } }, icon('pen', 13)),
      h('button', { class: 'sb-tool', title: 'Delete', 'aria-label': `Delete ${t.text}`, onclick: async () => {
        toBin(b, { kind: 'todo', title: t.text, item: t });
        b.todos = b.todos.filter((x) => x !== t); changed();
        toast('Moved to the Recycle Bin', 'info', 1600);
      } }, icon('trash', 13)));
  };

  function draw() {
    const today = dayKey();
    const st = todoStats(b.todos, today);
    const stat = (n, label, cls = '') => h('div', { class: `todo-stat ${cls}` }, h('b', {}, n), h('span', {}, label));
    statsEl.replaceChildren(
      h('div', { class: 'todo-meter', title: `${st.pct}% done` }, h('i', { style: { width: `${st.pct}%` } })),
      h('div', { class: 'todo-stat-row' },
        stat(String(st.open), 'open'),
        stat(String(st.overdue), 'overdue', st.overdue ? 'late' : ''),
        stat(String(st.dueWeek), 'due this week'),
        stat(String(st.done), 'done'),
        stat(`${st.pct}%`, 'complete'),
        stat(st.avgDays == null ? '—' : st.avgDays < 1 ? '<1' : String(Math.round(st.avgDays)), 'avg. days to finish'),
        stat(st.onTime == null ? '—' : `${st.onTime}%`, 'done on time')),
      h('p', { class: 'todo-sum hint' }, st.total ? `${st.total} to-do${st.total === 1 ? '' : 's'} in all · ${st.doneWeek} finished in the last 7 days · ${st.noDate} open with no deadline` : ''));
    const counts = { open: st.open, overdue: st.overdue, done: st.done, all: st.total };
    tabs.replaceChildren(...[['open', 'Open'], ['overdue', 'Overdue'], ['done', 'Done'], ['all', 'All']].map(([v, l]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(filter === v), class: `todo-tab${filter === v ? ' on' : ''}${v === 'overdue' && st.overdue ? ' late' : ''}`, onclick: () => { filter = v; draw(); } }, l, h('span', { class: 'todo-tab-n' }, String(counts[v])))));
    const shown = b.todos.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : filter === 'overdue' ? isOverdue(t, today) : !t.done));
    // Open: overdue first, then by deadline, then newest. Done: most recently finished first.
    shown.sort((x, y) => {
      if (x.done !== y.done) return x.done ? 1 : -1;
      if (x.done) return (y.doneAt || 0) - (x.doneAt || 0);
      if (!!x.due !== !!y.due) return x.due ? -1 : 1;
      if (x.due && y.due && x.due !== y.due) return x.due < y.due ? -1 : 1;
      return y.created - x.created;
    });
    list.replaceChildren(...shown.map((t) => row(t, today)));
    if (!shown.length && b.todos.length) list.append(h('p', { class: 'todo-empty' }, filter === 'overdue' ? 'Nothing overdue.' : filter === 'done' ? 'Nothing done yet.' : 'All done!'));
    const clear = h('button', { class: 'btn small plain', hidden: !st.done, onclick: async () => {
      if (!(await confirmDialog(`Delete ${st.done} finished to-do${st.done === 1 ? '' : 's'}?`, 'They move to the Recycle Bin, where you can restore them.', 'Delete'))) return;
      for (const t of b.todos.filter((x) => x.done)) toBin(b, { kind: 'todo', title: t.text, item: t });
      b.todos = b.todos.filter((t) => !t.done); changed();
    } }, 'Clear Done');
    tabs.append(h('span', { class: 'spacer' }), clear);
  }
  draw();
  sheet('To-Do', h('div', { class: 'todo-body' }, capture, statsEl, tabs, list), { wide: true, onClose: onChange });
  requestAnimationFrame(() => text.focus());
}
