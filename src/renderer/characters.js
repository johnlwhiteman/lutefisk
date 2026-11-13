// Character developer: define the people in your story, their attributes and notes,
// and see every chapter (or scene) where the manuscript mentions them.
// Works through a small context object:
//   ctx = { book, kind, markDirty(), units(), jump(id), unitWord, suggest() }
import { h, icon, confirmDialog, popover, closePopovers, assetUrl, toast } from './ui.js';
import { AVATARS, avatarSvg, squareAvatar, AVATAR_PX } from './avatars.js';
import { ROLES, DEFAULT_ATTRIBUTES, CHARACTER_COLORS, newCharacter, appearances, characterNames } from '../shared/characters.js';
import { newId } from '../shared/sections.js';

const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

const picOk = (v) => typeof v === 'string' && /^assets\/[A-Za-z0-9_\-./]{1,120}\.(png|jpe?g)$/.test(v) && !v.includes('..');
/** A character's avatar: their picture, an icon portrait, or their initials — on their colour. */
export function avatar(c, size = 32) {
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px`, background: c.color || CHARACTER_COLORS[0] };
  if (picOk(c.avatar)) return h('span', { class: 'ch-avatar pic', style }, h('img', { src: assetUrl(c.avatar), alt: '' }));
  const ic = typeof c.avatar === 'string' && c.avatar.startsWith('icon:') ? avatarSvg(c.avatar.slice(5)) : null;
  if (ic) return h('span', { class: 'ch-avatar ic', style }, ic);
  return h('span', { class: 'ch-avatar', style }, initials(c.name));
}

/** Avatar picker: colour, an icon portrait, your own picture, or initials. */
function avatarPopover(anchor, c, onChange) {
  const pick = (v) => { if (v) c.avatar = v; else delete c.avatar; onChange(); closePopovers(); };
  const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0];
    fileIn.value = '';
    if (!f) return;
    try {
      const { bytes, small } = await squareAvatar(f);
      const rel = await window.lutefisk.writeImage({ name: `avatar-${(c.name || 'character').toLowerCase()}`, data: bytes });
      pick(rel);
      if (small) toast(`That picture is smaller than ${AVATAR_PX} × ${AVATAR_PX} px, so it may look soft`, 'info', 3500);
    } catch (err) { toast(String(err.message || err), 'error'); }
  });
  const swatch = (col) => h('button', { class: `ch-color${col === c.color ? ' on' : ''}`, style: { background: col }, title: 'Colour', 'aria-label': `Colour ${col}`, onclick: () => { c.color = col; onChange(); closePopovers(); } });
  const iconBtn = (a) => h('button', { class: `ch-av-pick${c.avatar === `icon:${a.id}` ? ' on' : ''}`, title: a.label, 'aria-label': a.label, onclick: () => pick(`icon:${a.id}`) },
    h('span', { class: 'ch-avatar ic', style: { width: '36px', height: '36px', background: c.color || CHARACTER_COLORS[0] } }, avatarSvg(a.id)));
  const node = h('div', { class: 'ch-av-panel' },
    h('div', { class: 'pop-head' }, 'Colour'),
    h('div', { class: 'ch-colors' }, CHARACTER_COLORS.map(swatch)),
    h('div', { class: 'pop-head' }, 'Icon'),
    h('div', { class: 'ch-av-grid' }, AVATARS.map(iconBtn)),
    h('div', { class: 'ch-av-acts' },
      h('button', { class: 'btn small', onclick: () => fileIn.click() }, icon('image', 14), 'Upload Picture…'),
      h('button', { class: 'btn small plain', onclick: () => pick(null) }, 'Use Initials'), fileIn),
    h('p', { class: 'hint ch-av-hint' }, `Pictures: a square image, ${AVATAR_PX} × ${AVATAR_PX} px or larger (PNG or JPEG). Others are cropped to the centre square and saved in the book's assets.`));
  popover(anchor, [{ node }], { width: 330 });
}

function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(320, ta.scrollHeight + 2)}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

export function openCharacters(ctx, sheet, { select } = {}) {
  const book = ctx.book;
  book.characters = Array.isArray(book.characters) ? book.characters : [];
  const list = book.characters;
  const unitWord = ctx.unitWord || 'chapter';
  let units = ctx.units();
  let apps = appearances(list, units);
  let current = select && list.find((c) => c.id === select) ? select : list[0]?.id || null;
  let filter = '';

  const recount = () => { units = ctx.units(); apps = appearances(list, units); };
  const save = () => ctx.markDirty();

  const listEl = h('div', { class: 'ch-list', role: 'listbox', 'aria-label': 'Characters' });
  const search = h('input', { class: 'ch-search', type: 'search', placeholder: 'Search characters', 'aria-label': 'Search characters' });
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); drawList(); });
  const addBtn = h('button', { class: 'btn small primary ch-add', onclick: () => add() }, icon('plus', 14), 'New Character');
  const side = h('aside', { class: 'ch-side' }, h('div', { class: 'ch-side-head' }, search, addBtn), listEl);
  const detail = h('section', { class: 'ch-detail' });
  const body = h('div', { class: 'characters' }, side, detail);

  function add(name = '') {
    const c = newCharacter(newId('ch'), name, list.length);
    list.push(c);
    current = c.id;
    save(); recount(); drawList(); drawDetail();
    if (!name) requestAnimationFrame(() => detail.querySelector('.ch-name')?.focus());
  }

  function drawList() {
    const shown = list.filter((c) => !filter || [c.name, c.role, ...(c.aliases || [])].join(' ').toLowerCase().includes(filter));
    listEl.replaceChildren(...shown.map((c) => {
      const a = apps.get(c.id) || [];
      const mentions = a.reduce((n, x) => n + x.count, 0);
      const row = h('button', { class: `ch-row${c.id === current ? ' active' : ''}`, role: 'option', 'aria-selected': String(c.id === current), onclick: () => { current = c.id; drawList(); drawDetail(); } },
        avatar(c, 34),
        h('span', { class: 'ch-row-text' }, h('b', {}, c.name || 'Unnamed'), h('small', {}, [c.role, a.length ? `${a.length} ${unitWord}${a.length === 1 ? '' : 's'}` : `not in the ${'book'} yet`].filter(Boolean).join(' · '))),
        mentions ? h('span', { class: 'ch-row-n', title: `${mentions} mentions` }, String(mentions)) : null);
      return row;
    }), ...(list.length ? [] : [h('p', { class: 'hint ch-empty-side' }, 'No characters yet.')]));
  }

  function suggestions() {
    const have = new Set(list.flatMap((c) => characterNames(c).map((n) => n.toLowerCase())));
    return (ctx.suggest?.() || []).filter((n) => !have.has(n.toLowerCase())).slice(0, 14);
  }

  function drawEmpty() {
    const sugg = suggestions();
    detail.replaceChildren(h('div', { class: 'ch-empty' },
      h('div', { class: 'ch-empty-ic' }, icon('people', 34)),
      h('h3', {}, 'Build your cast'),
      h('p', {}, `Give each character a name, a role and whatever details you need — age, goals, flaws, backstory. Lutefisk finds them in your ${'manuscript'} and shows every ${unitWord} they appear in.`),
      h('button', { class: 'btn primary', onclick: () => add() }, icon('plus', 14), 'New Character'),
      sugg.length ? h('div', { class: 'ch-sugg' }, h('small', { class: 'hint' }, 'Names that come up often in your manuscript:'),
        h('div', { class: 'ch-chips' }, sugg.map((n, i) => h('button', { class: 'ch-chip add', title: `Add ${n} to your cast`, onclick: () => add(n) }, avatar({ name: n, color: CHARACTER_COLORS[(list.length + i) % CHARACTER_COLORS.length] }, 20), n, icon('plus', 12))))) : null));
  }

  function drawDetail() {
    const c = list.find((x) => x.id === current);
    if (!c) { drawEmpty(); return; }
    c.attrs ||= [];
    const a = apps.get(c.id) || [];
    const mentions = a.reduce((n, x) => n + x.count, 0);

    const av = h('button', { class: 'ch-av-btn', title: 'Avatar — choose a colour and an icon, or upload a picture', onclick: () => avatarPopover(av, c, () => { save(); drawList(); drawDetail(); }) }, avatar(c, 64), h('span', { class: 'ch-av-edit' }, icon('pen', 12)));
    const name = h('input', { class: 'ch-name', value: c.name || '', placeholder: 'Character name', 'aria-label': 'Name', spellcheck: 'false' });
    name.addEventListener('input', () => { c.name = name.value; save(); drawList(); av.replaceChildren(avatar(c, 64)); });
    name.addEventListener('change', () => { recount(); drawList(); drawApp(); });
    const role = h('input', { class: 'ch-role', value: c.role || '', placeholder: 'Role — e.g. Protagonist', list: 'ch-roles', 'aria-label': 'Role' });
    role.addEventListener('input', () => { c.role = role.value; save(); drawList(); });
    const aliases = h('input', { type: 'text', value: (c.aliases || []).join(', '), placeholder: 'Nicknames, titles… separated by commas', 'aria-label': 'Also known as' });
    aliases.addEventListener('change', () => { c.aliases = aliases.value.split(',').map((x) => x.trim()).filter(Boolean); save(); recount(); drawList(); drawApp(); });
    const first = h('input', { type: 'checkbox', checked: c.matchFirst !== false });
    first.addEventListener('change', () => { c.matchFirst = first.checked; save(); recount(); drawList(); drawApp(); });
    const del = h('button', { class: 'btn small plain danger', onclick: async () => {
      if (!(await confirmDialog(`Delete ${c.name || 'this character'}?`, 'Their attributes and notes will be removed. Your manuscript isn’t changed.'))) return;
      list.splice(list.indexOf(c), 1);
      for (const card of book.plot?.cards || []) card.chars = (card.chars || []).filter((x) => x !== c.id);
      current = list[0]?.id || null; save(); recount(); drawList(); drawDetail();
    } }, icon('trash', 14), 'Delete');

    const head = h('div', { class: 'ch-head' }, av,
      h('div', { class: 'ch-head-main' }, name, h('div', { class: 'ch-head-sub' }, role, h('datalist', { id: 'ch-roles' }, ROLES.map((r) => h('option', { value: r }))))),
      h('div', { class: 'ch-head-stats' },
        h('div', {}, h('b', {}, String(a.length)), h('span', {}, `${unitWord}${a.length === 1 ? '' : 's'}`)),
        h('div', {}, h('b', {}, mentions.toLocaleString()), h('span', {}, mentions === 1 ? 'mention' : 'mentions'))));

    // Attributes
    const attrsEl = h('div', { class: 'ch-attrs' });
    const drawAttrs = () => {
      attrsEl.replaceChildren(...c.attrs.map((at, i) => {
        const k = h('input', { class: 'ch-k', value: at.k, 'aria-label': 'Attribute name', placeholder: 'Attribute' });
        k.addEventListener('input', () => { at.k = k.value; save(); });
        const v = autosize(h('textarea', { class: 'ch-v', rows: 1, 'aria-label': at.k || 'Value', placeholder: '—' }));
        v.value = at.v || '';
        v.addEventListener('input', () => { at.v = v.value; save(); });
        const rm = h('button', { class: 'ch-x', title: 'Remove', 'aria-label': `Remove ${at.k}`, onclick: () => { c.attrs.splice(i, 1); save(); drawAttrs(); } }, icon('close', 12));
        return h('div', { class: 'ch-attr' }, k, v, rm);
      }));
    };
    drawAttrs();
    const addAttr = h('button', { class: 'btn small plain', onclick: () => {
      const unused = DEFAULT_ATTRIBUTES.filter((k) => !c.attrs.some((x) => x.k === k));
      popover(addAttr, [{ header: 'Add attribute' }, ...unused.map((k) => ({ label: k, onClick: () => { c.attrs.push({ k, v: '' }); save(); drawAttrs(); attrsEl.lastChild?.querySelector('textarea')?.focus(); } })), unused.length ? '-' : null,
        { label: 'Custom…', icon: 'plus', onClick: () => { c.attrs.push({ k: '', v: '' }); save(); drawAttrs(); attrsEl.lastChild?.querySelector('input')?.focus(); } }].filter(Boolean), { width: 220 });
    } }, icon('plus', 13), 'Add Attribute');

    const notes = autosize(h('textarea', { class: 'ch-notes', rows: 4, placeholder: 'Anything else — voice, relationships, scenes you want to write…', 'aria-label': 'Notes' }));
    notes.value = c.notes || '';
    notes.addEventListener('input', () => { c.notes = notes.value; save(); });

    const appEl = h('div', { class: 'ch-app' });
    function drawApp() {
      const a2 = apps.get(c.id) || [];
      const max = Math.max(1, ...a2.map((x) => x.count));
      const byId = new Map(a2.map((x) => [x.id, x]));
      const total = a2.reduce((n, x) => n + x.count, 0);
      const first2 = a2[0];
      appEl.replaceChildren(
        h('p', { class: 'ch-app-sum' }, a2.length
          ? `In ${a2.length} of ${units.length} ${unitWord}s · ${total.toLocaleString()} mention${total === 1 ? '' : 's'} · first in ${first2.title}`
          : `${c.name ? `“${characterNames(c).join('”, “')}” doesn’t appear` : 'Add a name to find this character'} in the ${'manuscript'} yet.`),
        units.length ? h('div', { class: 'ch-strip', role: 'img', 'aria-label': `Mentions by ${unitWord}` }, units.map((u) => {
          const x = byId.get(u.id);
          return h('button', { class: `ch-cell${x ? ' on' : ''}`, title: `${u.title}: ${x ? `${x.count} mention${x.count === 1 ? '' : 's'}` : 'not mentioned'}`, style: x ? { '--a': String(0.25 + 0.75 * (x.count / max)), '--c': c.color } : {}, onclick: () => ctx.jump(u.id) }, h('span', {}, u.short || ''));
        })) : null,
        a2.length ? h('div', { class: 'ch-app-list' }, a2.map((x) => h('button', { class: 'ch-app-row', onclick: () => ctx.jump(x.id), title: `Go to ${x.title}` },
          h('span', { class: 'ch-app-t' }, x.title),
          h('span', { class: 'ch-app-bar' }, h('i', { style: { width: `${(x.count / max) * 100}%`, background: c.color } })),
          h('span', { class: 'ch-app-n' }, `${x.count}×`),
          (units[x.index]?.parts || []).length ? h('span', { class: 'ch-app-parts' }, units[x.index].parts.filter((p) => p.count(c)).map((p) => h('span', { class: 'ch-part' }, p.title))) : null,
          icon('next', 13)))) : null);
    }
    drawApp();

    detail.replaceChildren(
      head,
      h('div', { class: 'ch-grid' },
        h('div', { class: 'ch-col' },
          h('section', { class: 'ch-sec' }, h('div', { class: 'ch-sec-head' }, h('h3', {}, 'Attributes'), addAttr), attrsEl),
          h('section', { class: 'ch-sec' }, h('h3', {}, 'Notes'), notes)),
        h('div', { class: 'ch-col' },
          h('section', { class: 'ch-sec' }, h('h3', {}, 'Appears in'), appEl),
          h('section', { class: 'ch-sec' }, h('h3', {}, 'Found by'),
            h('label', { class: 'fld' }, h('span', {}, 'Also known as'), aliases),
            h('label', { class: 'ch-check' }, first, h('span', {}, `Match the first name on its own${(c.name || '').trim().includes(' ') ? ` (“${c.name.trim().split(/\s+/)[0]}”)` : ''}`)),
            h('small', { class: 'hint' }, 'Names match as whole words with the same capitals, so “Will” isn’t found in “will”.')),
          h('div', { class: 'ch-foot' }, del))));
  }

  drawList();
  drawDetail();
  const close = sheet('Characters', body, { full: true, onClose: () => ctx.onClose?.() });
  ctx.close = close;
  return { refresh() { recount(); drawList(); drawDetail(); } };
}

/**
 * Likely character names in book prose: capitalised words that come up several
 * times and never appear in lower case, skipping words at the start of a sentence.
 */
export function suggestNames(text, limit = 14) {
  const STOP = new Set('The A An And But Or So Then When While If It Its He She They We You I His Her Their Our My Your This That These Those There Here What Who Why How Where Yes No Not Mr Mrs Ms Dr Sir Lady Lord Miss Chapter One Two Three Four Five Six Seven Eight Nine Ten Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December God Oh Ah Well Now Still Even Just Only After Before Above Below'.split(' '));
  const counts = new Map();
  const lower = new Set((text.match(/\b[a-z][a-z’']+\b/g) || []).map((w) => w.toLowerCase()));
  // Only words in mid-sentence: after a letter, digit or comma — not after . ! ? or a closing quote.
  const re = /([\p{Ll}\p{N},;]\s+|[—–]\s*)([A-Z][a-z’']{2,}(?:\s+[A-Z][a-z’']{2,})?)/gu;
  let m;
  while ((m = re.exec(text))) {
    for (const w of [m[2], ...m[2].split(/\s+/)]) {
      const base = w.replace(/[’']s$/, '');
      if (STOP.has(base) || STOP.has(base.split(/\s+/)[0])) continue;
      if (!base.includes(' ') && lower.has(base.toLowerCase())) continue;
      counts.set(base, (counts.get(base) || 0) + 1);
    }
  }
  const out = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  // Prefer "First Last" over its parts when both are frequent.
  const multi = out.filter((w) => w.includes(' '));
  return out.filter((w) => w.includes(' ') || !multi.some((x) => x.split(' ').includes(w)) || counts.get(w) > 2 * Math.max(...multi.filter((x) => x.split(' ').includes(w)).map((x) => counts.get(x)))).slice(0, limit);
}
