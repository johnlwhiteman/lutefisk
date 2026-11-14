// The Recycle Bin: chapters, scenes, front and back matter, research notes,
// snippets, to-dos, characters and plot cards you delete go here first. Each
// entry keeps what's needed to put it back; it lives in lutefisk.yaml, on this
// computer, and is never exported.
import { h, icon, toast, confirmDialog, timeAgo, popover } from './ui.js';
import { newId } from '../shared/sections.js';

const MAX = 300;
const countWords = (t) => (String(t || '').match(/[\p{L}\p{N}’']+/gu) || []).length;
export const BIN_KINDS = {
  section: { label: 'Section', icon: 'doc' },
  scene: { label: 'Scene', icon: 'scene' },
  research: { label: 'Research', icon: 'doc' },
  snippet: { label: 'Snippet', icon: 'snippet' },
  todo: { label: 'To-do', icon: 'checklist' },
  character: { label: 'Character', icon: 'people' },
  card: { label: 'Plot card', icon: 'plot' },
};

/** Put a deleted thing in the book's Recycle Bin. texts: { id: markdown } for anything with a file. */
export function toBin(book, { kind, title, item, texts = {}, where = {} }) {
  book.bin = Array.isArray(book.bin) ? book.bin : [];
  book.bin.unshift({ id: newId('bin'), kind, title: String(title || '').slice(0, 200), deleted: Date.now(), item: JSON.parse(JSON.stringify(item ?? null)), texts, where });
  if (book.bin.length > MAX) book.bin.length = MAX;
}
export const binCount = (book) => (Array.isArray(book?.bin) ? book.bin.length : 0);

/**
 * The Recycle Bin window. restore(entry) puts one back and returns true when it did.
 */
export function openRecycleBin(app, sheet, { restore, onChange }) {
  const b = app.book;
  b.bin = Array.isArray(b.bin) ? b.bin : [];
  let kind = 'all';
  const changed = () => { app.markDirty(); draw(); onChange?.(); };
  const list = h('div', { class: 'bin-list' });
  const filters = h('div', { class: 'bin-filters' });
  const head = h('div', { class: 'bin-head' });

  const doRestore = (e) => {
    if (!restore(e)) return;
    b.bin = b.bin.filter((x) => x !== e);
    changed();
    toast(`Restored “${e.title || BIN_KINDS[e.kind]?.label || 'item'}”`, 'ok', 1800);
  };
  const doDelete = async (e) => {
    if (!(await confirmDialog(`Delete “${e.title || 'this item'}” forever?`, 'It’s removed from the Recycle Bin and can’t be restored.', 'Delete Forever'))) return;
    b.bin = b.bin.filter((x) => x !== e);
    changed();
  };
  const row = (e) => {
    const k = BIN_KINDS[e.kind] || { label: 'Item', icon: 'doc' };
    const words = Object.values(e.texts || {}).reduce((n, t) => n + countWords(t), 0) || (e.kind === 'snippet' ? countWords(e.item?.text) : 0);
    const more = h('button', { class: 'sb-tool', title: 'More', 'aria-label': 'More', onclick: () => popover(more, [
      { label: 'Restore', icon: 'reset', onClick: () => doRestore(e) },
      { label: 'Delete Forever…', icon: 'trash', danger: true, onClick: () => doDelete(e) },
    ], { align: 'right', width: 200 }) }, icon('more', 15));
    return h('div', { class: 'bin-row' },
      h('span', { class: 'bin-ic' }, icon(k.icon, 16)),
      h('div', { class: 'bin-main' },
        h('div', { class: 'bin-title' }, e.title || 'Untitled'),
        h('div', { class: 'bin-meta' }, h('span', {}, k.label), words ? h('span', {}, `${words.toLocaleString()} words`) : null, e.where?.from ? h('span', {}, `from ${e.where.from}`) : null,
          h('span', { title: new Date(e.deleted).toLocaleString() }, `deleted ${timeAgo(new Date(e.deleted).toISOString())}`))),
      h('button', { class: 'btn small', onclick: () => doRestore(e) }, icon('reset', 13), 'Restore'),
      more);
  };
  function draw() {
    const counts = {};
    for (const e of b.bin) counts[e.kind] = (counts[e.kind] || 0) + 1;
    const kinds = Object.keys(BIN_KINDS).filter((k) => counts[k]);
    if (kind !== 'all' && !counts[kind]) kind = 'all';
    filters.replaceChildren(...(b.bin.length ? [['all', 'All', b.bin.length], ...kinds.map((k) => [k, `${BIN_KINDS[k].label}s`, counts[k]])] : []).map(([v, l, n]) =>
      h('button', { type: 'button', class: `todo-tab${kind === v ? ' on' : ''}`, onclick: () => { kind = v; draw(); } }, l, h('span', { class: 'todo-tab-n' }, String(n)))));
    const empty = h('button', { class: 'btn small plain danger', hidden: !b.bin.length, onclick: async () => {
      if (!(await confirmDialog(`Empty the Recycle Bin?`, `${b.bin.length} item${b.bin.length === 1 ? '' : 's'} will be deleted forever. This can’t be undone.`, 'Empty Recycle Bin'))) return;
      b.bin = []; changed();
    } }, icon('trash', 13), 'Empty Recycle Bin');
    head.replaceChildren(h('p', { class: 'hint' }, b.bin.length ? 'Deleted parts of this book. Restore puts an item back where it was.' : ''), h('span', { class: 'spacer' }), empty);
    const shown = b.bin.filter((e) => kind === 'all' || e.kind === kind);
    list.replaceChildren(...shown.map(row));
    if (!b.bin.length) list.append(h('div', { class: 'bin-empty' }, icon('trash', 30), h('p', {}, 'The Recycle Bin is empty.')));
  }
  draw();
  sheet('Recycle Bin', h('div', { class: 'bin-body' }, head, filters, list), { wide: true, onClose: onChange });
}
