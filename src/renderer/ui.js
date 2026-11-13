// Small DOM helpers, dialogs and icons. No innerHTML with untrusted data:
// text is always set through textContent; HTML only from our own renderers
// after DOMPurify sanitisation.
import DOMPurify from 'dompurify';

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = sanitize(v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const PURIFY = {
  ADD_ATTR: ['epub:type', 'target'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|book|app|data):|#|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'object', 'embed', 'link', 'meta', 'base'],
};
export function sanitize(html) {
  return DOMPurify.sanitize(String(html), PURIFY);
}
export function setHtml(el, html) {
  el.innerHTML = sanitize(html);
}

const ICON_PATHS = {
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M10 5h8M6 19h8M14 5l-4 14',
  strike: 'M5 12h14M16 7.5C15.4 6 13.9 5 12 5c-2.5 0-4 1.3-4 3 0 3.5 8 2.5 8 7 0 1.9-1.8 4-4.5 4-2 0-3.6-1-4.3-2.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  quote: 'M7 7h4v4H8c0 2 1 3 3 3v2c-3 0-5-2-5-5V7zM14 7h4v4h-3c0 2 1 3 3 3v2c-3 0-5-2-5-5V7z',
  ul: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  ol: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 15.5c.3-.6 1-1 1.6-.9.8.1 1.2.8.9 1.5L3.5 19h3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5h.01',
  footnote: 'M5 18h9M5 13h14M5 8h6M17 4v5M15 6.5h4',
  index: 'M5 4h11l3 3v13H5zM9 10h6M9 14h6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  clear: 'M6 6l12 12M4 20h8M9 4h9M13 4l-3 9',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.4 4M6.5 7.5A17 17 0 0 0 2 12s4 6 10 6a9.7 9.7 0 0 0 4.5-1.1',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  export: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  device: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9zM7.5 11h.01M10.5 7.5h.01M15 7.5h.01',
  cite: 'M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  rotate: 'M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12.5 2M19 9A7 7 0 0 0 6.5 7',
  cover: 'M5 3h14v18H5zM8 7h8M8 10h5',
  sidebar: 'M4 5h16v14H4zM9.5 5v14',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  minus: 'M6 12h12',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  chevron: 'M6 9l6 6 6-6',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4',
  textSize: 'M4 18l5-12 5 12M5.8 14h6.4M15 18l3-7 3 7M15.8 16h4.4',
  dropcap: 'M4 5h9M8.5 5v10M16 6h4M16 10h4M4 15h0M4 19h16M14 15h6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  fitWidth: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  fitPage: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  focus: 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M8 10h8M8 14h5',
  scene: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5M5 4l3 3',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  pin: 'M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  pdfdoc: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 16v-4h1.2a1.2 1.2 0 0 1 0 2.4H9.5M14 12h-1.5v4M12.5 14H14',
  alignLeft: 'M4 5h16M4 19h16M4 9h8v6H4z',
  alignCenter: 'M4 5h16M4 19h16M8 9h8v6H8z',
  alignRight: 'M4 5h16M4 19h16M12 9h8v6h-8z',
  alignFull: 'M4 5h16M4 19h16M4 9h16v6H4z',
  wrap: 'M4 5h16M4 19h16M4 9h7v6H4zM14 9h6M14 12h6M14 15h6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  wrapInline: 'M4 6h16M4 18h16M4 12h4M16 12h4M9.5 9.5h5v5h-5z',
  wrapTight: 'M4 5h16M4 19h16M4 9h4M4 12h3M4 15h4M15 9h5M16 12h4M15 15h5M12 8.5l3 3.5-3 3.5-3-3.5z',
  wrapTopBottom: 'M4 4h16M4 20h16M7 8h10v8H7z',
  wrapBehind: 'M4 7h16M4 11h16M4 15h16M7 5h10v14H7z',
  wrapFront: 'M4 7h3M17 7h3M4 11h3M17 11h3M4 15h3M17 15h3M7 5h10v14H7z',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  subscript: 'M4 5l8 10M12 5l-8 10M15 19.5c0-1.2 1-1.8 2-2.3s2-1 2-2.1a1.6 1.6 0 0 0-3.1-.6M15 20h4',
  superscript: 'M4 9l8 10M12 9l-8 10M15 9.5c0-1.2 1-1.8 2-2.3s2-1 2-2.1a1.6 1.6 0 0 0-3.1-.6M15 10h4',
  textStyle: 'M5 7V5h14v2M12 5v14M9 19h6',
  listMenu: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  dual: 'M3 5h8M5 9h6M3 13h8M13 5h8M15 9h6M13 13h8M3 19h18',
  pagebreakIcon: 'M5 3v6h14V3M5 21v-6h14v6M3 12h3M9 12h2M14 12h2M19 12h2',
  script: 'M6 3h12v18H6zM9 7h6M8.5 11h4M10.5 14h5M9 17h6M4 7h2M4 17h2',
  cards: 'M3 5h8v6H3zM13 5h8v6h-8zM3 13h8v6H3zM13 13h8v6h-8z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01',
  sigma: 'M18 5H6l6 7-6 7h12',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  pen: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4zM14 7l3 3',
  comment: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  omega: 'M5 19h4v-2a6.5 6.5 0 1 1 6 0v2h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  stopwatch: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4.5M10 2.5h4M12 2.5V6M18.5 6.5l1.5-1.5',
  pause: 'M9 6v12M15 6v12',
  play: 'M8 5v14l11-7z',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2.1.6 3.5 2.3 3.5 5.2',
  plot: 'M3 6h18M3 12h18M3 18h18M5 4.5h5v3H5zM12 10.5h6v3h-6zM7 16.5h7v3H7z',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5M8 14h2M12 14h2M16 14h.01M8 17.5h2M12 17.5h2',
  stop: 'M7 7h10v10H7z',
  pagebreak: 'M5 3v5h14V3M5 21v-5h14v5M3 12h2M8 12h2M13 12h2M18 12h3',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  splitV: 'M4 4h16v16H4zM4 12h16',
  capTitle: 'M4 7V5h10v2M9 5v14M7 19h4M14 13v-1.5h6V13M17 11.5V19M15.5 19h3',
  ornament: 'M12 4c2 3 5 4 8 4-3 1-5 3-6 6-1-3-3-5-6-6 3 0 5-1 4-4zM12 14v6M8 20h8',
  arrowLeft: 'M15 5l-7 7 7 7',
  arrowRight: 'M9 5l7 7-7 7',
  split: 'M4 4h16v16H4zM12 4v16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7L4 8.6M4 4v4.6h4.6',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14',
  highlight: 'M14.5 4.5l5 5-8.5 8.5H6v-5zM12 7l5 5M4 21h8',
  filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
  status: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  replace: 'M4 7h11l-3-3M20 17H9l3 3M15 4l3 3-3 3M9 14l-3 3 3 3',
  heading: 'M6 4v16M18 4v16M6 12h12',
  binderHide: 'M3 4h18v16H3zM9 4v16M15 9l-3 3 3 3',
  panelHide: 'M3 4h18v16H3zM15 4v16M9 9l3 3-3 3',
  toc: 'M4 6h16M4 12h10M4 18h13',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  slides: 'M3 4h18v12H3zM12 16v4M8 20h8M7 8h6M7 11h10',
  present: 'M3 4h18v12H3zM12 16v4M8 20h8M10 7.5l5 2.5-5 2.5z',
  eraser: 'M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.5l-3-3a.4.4 0 0 1 0-.5zM9 11l5 5',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  textSizeUp: 'M3 18l5-12 5 12M4.8 14h6.4M17 8v8M13 12h8',
};
export function icon(name, size = 18) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ICON_PATHS[name] || '');
  svg.append(p);
  return svg;
}

/** Popover menu anchored to an element. items: [{label, icon, onClick, danger, hint, disabled} | '-' | {header}] */
export function popover(anchor, items, { align = 'left', width, onClose, maxHeight } = {}) {
  closePopovers();
  const menu = h('div', { class: 'popover', role: 'menu' });
  if (width) menu.style.minWidth = `${width}px`;
  if (maxHeight) { menu.style.maxHeight = `${Math.min(maxHeight, window.innerHeight - 16)}px`; menu.style.overflowY = 'auto'; }
  for (const it of items) {
    if (it === '-') { menu.append(h('div', { class: 'pop-sep' })); continue; }
    if (it.header) { menu.append(h('div', { class: 'pop-head' }, it.header)); continue; }
    if (it.node) { menu.append(it.node); continue; }
    menu.append(h('button', {
      class: `pop-item${it.danger ? ' danger' : ''}`, role: 'menuitem', disabled: it.disabled,
      onclick: (e) => { e.stopPropagation(); closePopovers(); it.onClick?.(); },
    }, it.icon ? icon(it.icon, 16) : h('span', { class: 'pop-noicon' }), it.swatch ? h('span', { class: 'pop-swatch', style: { background: it.swatch } }) : null, h('span', { class: 'pop-label' }, it.label), it.hint ? h('span', { class: 'pop-hint' }, it.hint) : null));
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  let left = align === 'right' ? r.right - m.width : r.left;
  left = Math.max(8, Math.min(window.innerWidth - m.width - 8, left));
  let top = r.bottom + 6;
  if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.querySelector('button:not([disabled])')?.focus();
  menu.addEventListener('keydown', (e) => {
    const btns = [...menu.querySelectorAll('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement);
    if (e.target.matches?.('input, textarea, select') && e.key !== 'Escape') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    if (e.key === 'Escape') { closePopovers(); anchor.focus?.(); }
  });
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  function outside(e) { if (!menu.contains(e.target)) { closePopovers(); } }
  menu._cleanup = () => { document.removeEventListener('mousedown', outside, true); onClose?.(); };
  return menu;
}
export function closePopovers() {
  for (const m of document.querySelectorAll('.popover')) { m._cleanup?.(); m.remove(); }
}

/** Segmented control. options: [{value,label,icon}] */
export function segmented(options, value, onChange, { label } = {}) {
  const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label || '' });
  const set = (v) => { for (const b of el.children) { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } };
  for (const o of options) {
    el.append(h('button', { type: 'button', role: 'radio', 'data-v': o.value, title: o.title || o.label || '', onclick: () => { set(o.value); onChange(o.value); } },
      o.icon ? icon(o.icon, 15) : null, o.label ? h('span', {}, o.label) : null));
  }
  set(value);
  el.setValue = set;
  return el;
}

/** Magnifier control: − 100% + Fit. Persists per key in localStorage. */
export function magnifier(key, onChange) {
  const steps = [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  let z = 1;
  try { z = Math.min(4, Math.max(1, Number(localStorage.getItem(key)) || 1)); } catch { /* ignore */ }
  const lbl = h('button', { class: 'mag-val', title: 'Zoom — click to fit the window' });
  const set = (v) => {
    z = Math.min(4, Math.max(1, v));
    lbl.textContent = z === 1 ? 'Zoom' : `${Math.round(z * 100)}%`;
    try { localStorage.setItem(key, String(z)); } catch { /* ignore */ }
    onChange(z);
  };
  const step = (d) => { const i = steps.findIndex((x) => x >= z - 0.001); set(steps[Math.max(0, Math.min(steps.length - 1, (steps[i] === z ? i : d > 0 ? i - 1 : i) + d))]); };
  lbl.addEventListener('click', () => set(1));
  const el = h('div', { class: 'mag', role: 'group', 'aria-label': 'Magnification' },
    h('button', { title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => step(-1) }, icon('minus', 14)), lbl,
    h('button', { title: 'Zoom in (⌘/Ctrl + scroll)', 'aria-label': 'Zoom in', onclick: () => step(1) }, icon('plus', 14)));
  lbl.textContent = z === 1 ? 'Zoom' : `${Math.round(z * 100)}%`;
  el.get = () => z;
  el.step = step;
  el.set = set;
  return el;
}

/** Deterministic generated cover (used when a book has no cover image). */
const COVER_TONES = [['#1f3a5f', '#f3e9d2'], ['#5b2333', '#f7e8d8'], ['#2f4f3e', '#efe6cf'], ['#3d3a4b', '#f2e7d5'], ['#7a4b22', '#fbf1df'], ['#22313f', '#e9d8b4'], ['#4a1f4f', '#f1e1ee'], ['#283d3b', '#edddd4']];
export function generatedCover(title, author, fontFamily = "'Literata', serif") {
  let hsh = 0;
  for (const c of String(title)) hsh = (hsh * 31 + c.codePointAt(0)) >>> 0;
  const [bg, fg] = COVER_TONES[hsh % COVER_TONES.length];
  return h('div', { class: 'gen-cover', style: { background: `linear-gradient(160deg, ${bg} 0%, color-mix(in srgb, ${bg} 70%, black) 100%)`, color: fg, fontFamily } },
    h('div', { class: 'gc-rule' }), h('div', { class: 'gc-title' }, title || 'Untitled'), h('div', { class: 'gc-rule' }), h('div', { class: 'gc-author' }, author || ''));
}

export function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  if (s < 86400 * 2) return 'yesterday';
  if (s < 86400 * 7) return `${Math.round(s / 86400)} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

let toastHost;
export function toast(msg, kind = 'info', ms = 3200) {
  toastHost ||= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${kind}` }, msg);
  toastHost.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** Modal dialog. fields: [{name,label,type,value,options,placeholder}] → resolves with values or null. */
export function dialog({ title, message, fields = [], ok = 'OK', cancel = 'Cancel', danger = false, body = null, wide = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const inputs = {};
    const form = h('form', { class: 'dlg-form', method: 'dialog' });
    if (message) form.append(h('p', { class: 'dlg-msg' }, message));
    if (body) form.append(body);
    for (const f of fields) {
      let input;
      if (f.type === 'select') {
        input = h('select', { name: f.name }, f.options.map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label)));
      } else if (f.type === 'textarea') {
        input = h('textarea', { name: f.name, rows: f.rows || 4, placeholder: f.placeholder || '' });
        input.value = f.value || '';
      } else {
        input = h('input', { name: f.name, type: f.type || 'text', placeholder: f.placeholder || '' });
        input.value = f.value ?? '';
      }
      inputs[f.name] = input;
      form.append(h('label', { class: 'fld' }, h('span', {}, f.label), input));
    }
    const done = (val) => { overlay.remove(); prev?.focus?.(); resolve(val); };
    const okBtn = h('button', { type: 'submit', class: `btn ${danger ? 'danger' : 'primary'}` }, ok);
    form.append(h('div', { class: 'dlg-actions' },
      cancel ? h('button', { type: 'button', class: 'btn', onclick: () => done(null) }, cancel) : null, okBtn));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      for (const [k, el] of Object.entries(inputs)) out[k] = el.value;
      done(fields.length ? out : true);
    });
    const box = h('div', { class: `dlg${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', {}, title), form);
    requestAnimationFrame(() => overlay.classList.add('in'));
    const overlay = h('div', { class: 'overlay', onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } } }, box);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
    document.body.append(overlay);
    (Object.values(inputs)[0] || okBtn).focus();
  });
}

export const confirmDialog = (title, message, ok = 'Delete') => dialog({ title, message, ok, danger: false });

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

const assetRevs = new Map();
/** Force views to reload an asset that was rewritten in place (e.g. an edited drawing). */
export const bumpAsset = (src) => assetRevs.set(String(src), Date.now());
export const assetUrl = (src) => `book://current/${String(src).split('/').map(encodeURIComponent).join('/')}${assetRevs.has(String(src)) ? `?v=${assetRevs.get(String(src))}` : ''}`;

/** The Lutefisk mark (app icon artwork). */
export const brandMark = (size = 20, cls = '') => h('img', { src: 'assets/icon.svg', alt: '', class: `brand-mark ${cls}`.trim(), width: size, height: size, draggable: 'false' });

/**
 * Hover help: every control's title shows as a quick, readable tip saying what
 * it does (instead of the slow native tooltip). Install once.
 */
export function installTooltips(root = document) {
  let tip = null, timer = 0, owner = null;
  const hide = () => {
    clearTimeout(timer);
    if (owner && owner.dataset.tip != null && !owner.hasAttribute('title')) owner.setAttribute('title', owner.dataset.tip);
    if (owner) delete owner.dataset.tip;
    owner = null;
    tip?.remove(); tip = null;
  };
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[title]');
    if (!el || el === owner || el.closest('.ProseMirror, .scr, .pp-desk, .tpl-page, .popover')) return;
    hide();
    const text = el.getAttribute('title');
    if (!text) return;
    owner = el;
    el.dataset.tip = text;
    el.removeAttribute('title'); // no native tooltip on top of ours
    timer = setTimeout(() => {
      if (owner !== el || !el.isConnected) return;
      const [head, ...rest] = text.split(/ — (.+)/s).filter(Boolean);
      const more = rest.join('');
      tip = h('div', { class: 'hover-tip', role: 'tooltip' }, more ? [h('b', {}, head), h('span', {}, more[0].toUpperCase() + more.slice(1))] : h('span', {}, head));
      document.body.append(tip);
      const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let top = r.bottom + 8;
      if (top + t.height > window.innerHeight - 6) top = r.top - t.height - 8;
      const left = Math.max(6, Math.min(window.innerWidth - t.width - 6, r.left + r.width / 2 - t.width / 2));
      tip.style.left = `${left}px`; tip.style.top = `${top}px`;
      tip.classList.add('in');
    }, 450);
  }, true);
  root.addEventListener('mouseout', (e) => { if (owner && !owner.contains(e.relatedTarget)) hide(); }, true);
  root.addEventListener('mousedown', hide, true);
  root.addEventListener('keydown', hide, true);
  window.addEventListener('blur', hide);
}
