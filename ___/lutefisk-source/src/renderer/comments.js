// Word-style comments: balloons in the right margin beside the text they refer
// to, with replies, resolve and delete. Comment bodies live in book.yaml under
// `comments`; the manuscript marks the commented range with CriticMarkup.
import { h, icon, timeAgo, confirmDialog } from './ui.js';

const NAME_KEY = 'lutefisk.commentAuthor';
export const commentAuthor = (book) => { try { return localStorage.getItem(NAME_KEY) || book?.author || 'Author'; } catch { return book?.author || 'Author'; } };
const setAuthor = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } };
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const hue = (n) => { let x = 0; for (const c of String(n)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };

export function createCommentRail(app, editor) {
  const rail = h('div', { class: 'cm-rail', 'aria-label': 'Comments' });
  const head = h('div', { class: 'cm-rail-head' });
  rail.append(head);
  editor.container.append(rail);
  let showResolved = false;
  let openEmpty = false; // the Comments button opened the margin even though there are none yet
  let hidden = (() => { try { return localStorage.getItem('lutefisk.commentsHidden') === '1'; } catch { return false; } })();
  let editing = null; // id of a comment whose text is being written
  let activeId = null;
  const cards = new Map();
  const store = () => (app.book.comments ||= {});

  function create(id, quote) {
    if (hidden) setHidden(false);
    store()[id] = { author: commentAuthor(app.book), at: new Date().toISOString(), text: '', quote: String(quote || '').slice(0, 200), replies: [], resolved: false };
    editing = id;
    app.markDirty();
  }
  function remove(id) { delete store()[id]; app.markDirty(); }

  function avatar(name) { return h('span', { class: 'cm-avatar', style: { background: `hsl(${hue(name)} 55% 45%)` } }, initials(name)); }

  function card(id) {
    const c = store()[id];
    if (!c) return null;
    const el = h('div', { class: `cm-card${c.resolved ? ' resolved' : ''}${id === activeId ? ' active' : ''}`, 'data-id': id });
    el.addEventListener('mousedown', (e) => { if (!e.target.closest('textarea, input, button')) { e.preventDefault(); editor.selectComment(id); } });
    const actions = h('span', { class: 'cm-actions' },
      h('button', { class: 'tb-btn', title: c.resolved ? 'Reopen' : 'Resolve', onclick: () => { c.resolved = !c.resolved; app.markDirty(); update(); } }, icon(c.resolved ? 'rotate' : 'check', 14)),
      h('button', { class: 'tb-btn', title: 'Delete comment', onclick: async () => {
        if (c.text && !(await confirmDialog('Delete this comment?', c.replies.length ? `Its ${c.replies.length} repl${c.replies.length === 1 ? 'y' : 'ies'} will be deleted too.` : 'This can’t be undone.'))) return;
        editor.removeComment(id); remove(id); update();
      } }, icon('trash', 14)));
    el.append(h('div', { class: 'cm-head' }, avatar(c.author), h('div', { class: 'cm-who' }, h('b', {}, c.author), h('small', {}, timeAgo(c.at))), actions));
    if (editing === id) {
      const ta = h('textarea', { rows: 3, placeholder: 'Add a comment…', 'aria-label': 'Comment' });
      ta.value = c.text;
      const save = () => {
        const v = ta.value.trim();
        if (!v) { editor.removeComment(id); remove(id); } else { c.text = v; c.at = c.at || new Date().toISOString(); app.markDirty(); }
        editing = null; update();
      };
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); if (!c.text) { editor.removeComment(id); remove(id); } editing = null; update(); }
      });
      const nameIn = h('input', { class: 'cm-name', value: c.author, 'aria-label': 'Your name', title: 'Your name on comments' });
      nameIn.addEventListener('change', () => { const n = nameIn.value.trim() || 'Author'; c.author = n; setAuthor(n); app.markDirty(); });
      el.append(ta, h('div', { class: 'cm-edit-row' }, h('span', { class: 'hint' }, 'as'), nameIn, h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => { if (!c.text) { editor.removeComment(id); remove(id); } editing = null; update(); } }, 'Cancel'),
        h('button', { class: 'btn small primary', onclick: save }, 'Comment')));
      requestAnimationFrame(() => ta.focus());
    } else {
      const text = h('div', { class: 'cm-text', title: 'Double-click to edit' }, c.text);
      text.addEventListener('dblclick', () => { editing = id; update(); });
      el.append(text);
      for (const r of c.replies || []) {
        el.append(h('div', { class: 'cm-reply' }, h('div', { class: 'cm-head small' }, avatar(r.author), h('div', { class: 'cm-who' }, h('b', {}, r.author), h('small', {}, timeAgo(r.at)))), h('div', { class: 'cm-text' }, r.text)));
      }
      if (!c.resolved) {
        const rep = h('input', { class: 'cm-reply-in', placeholder: 'Reply…', 'aria-label': 'Reply' });
        rep.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && rep.value.trim()) {
            e.preventDefault();
            (c.replies ||= []).push({ author: commentAuthor(app.book), at: new Date().toISOString(), text: rep.value.trim() });
            app.markDirty(); update();
          }
        });
        el.append(rep);
      }
    }
    return el;
  }

  function update() {
    if (!app.book) return;
    const ranges = editor.commentRanges();
    const all = ranges.filter((r) => store()[r.id]);
    // Marks whose comment was deleted elsewhere (e.g. undo) are left alone; unknown ids get a placeholder.
    for (const r of ranges) if (!store()[r.id]) store()[r.id] = { author: commentAuthor(app.book), at: new Date().toISOString(), text: '(comment)', replies: [], resolved: false };
    const shown = all.filter((r) => showResolved || !store()[r.id].resolved || r.id === activeId);
    const resolvedCount = all.filter((r) => store()[r.id].resolved).length;
    editor.container.classList.toggle('comments-off', hidden);
    editor.container.classList.toggle('has-comments', !hidden && (shown.length > 0 || resolvedCount > 0 || openEmpty));
    onCount?.(all.length - resolvedCount, all.length);
    editor.view.dom.querySelectorAll('.pm-comment').forEach((s) => {
      const c = store()[s.dataset.comment];
      s.classList.toggle('resolved', !!c?.resolved);
      s.classList.toggle('active', s.dataset.comment === activeId);
    });
    head.replaceChildren(...[
      h('span', {}, icon('comment', 14), `${all.length - resolvedCount} comment${all.length - resolvedCount === 1 ? '' : 's'}`),
      h('button', { class: 'cm-hide', title: 'Hide comments', onclick: () => setHidden(true) }, icon('eyeOff', 13), 'Hide'),
      resolvedCount ? h('label', { class: 'cm-toggle' }, h('input', { type: 'checkbox', checked: showResolved, onchange: (e) => { showResolved = e.target.checked; update(); } }), `${resolvedCount} resolved`) : null].filter(Boolean));
    for (const [id, el] of cards) if (!shown.some((r) => r.id === id)) { el.remove(); cards.delete(id); }
    rail.querySelector('.cm-empty')?.remove();
    if (!shown.length && openEmpty && !hidden) rail.append(h('div', { class: 'cm-empty' }, icon('comment', 18), h('b', {}, 'No comments here'), h('span', {}, 'Select some text and press ⌃⌥M, or right-click › New Comment.')));
    const cRect = editor.container.getBoundingClientRect();
    let y = 34;
    for (const r of shown) {
      const old = cards.get(r.id);
      const el = card(r.id);
      if (!el) continue;
      if (old) old.replaceWith(el); else rail.append(el);
      cards.set(r.id, el);
      let top = 0;
      try { top = editor.view.coordsAtPos(r.from).top - cRect.top + editor.container.scrollTop - 6; } catch { /* position gone */ }
      top = Math.max(top, y);
      el.style.top = `${top}px`;
      y = top + el.offsetHeight + 8;
    }
    // Keep the active card next to its text by nudging the cards above it up if there is room.
    rail.style.height = `${Math.max(y, editor.view.dom.offsetHeight)}px`;
  }

  function setHidden(v) {
    hidden = !!v;
    openEmpty = !hidden;
    try { localStorage.setItem('lutefisk.commentsHidden', hidden ? '1' : '0'); } catch { /* ignore */ }
    update();
  }
  let onCount = null;

  function selectionChanged() {
    const id = editor.commentAt();
    if (id !== activeId) { activeId = id; update(); }
  }

  return {
    create, remove, update, selectionChanged,
    edit(id) { editing = id; update(); },
    count: () => editor.commentRanges().length,
    setHidden, get hidden() { return hidden; },
    set onCount(fn) { onCount = fn; },
  };
}
