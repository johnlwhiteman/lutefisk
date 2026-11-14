// Live e-reader / phone / tablet preview with realistic device frames.
// The chapter is laid out in CSS columns sized to the device's reading area,
// so pages break exactly where they would on a reflowable reader.
import { coverOpts, coverAlt, coverImgCss } from '../shared/cover.js';
import { DEVICES, DEVICE_GROUPS, deviceById } from './devices.js';
import { FONTS, fontStack } from '../shared/fonts.js';
import { baseCss, templateCss, templateById, withCasePrefs } from '../shared/templates.js';
import { ebookDropCaps } from '../shared/sections.js';
import { h, icon, assetUrl, magnifier, rangeBubble } from './ui.js';

const THEMES = {
  light: { bg: '#ffffff', fg: '#151515', ui: '#7a7a7a' },
  sepia: { bg: '#f6efdf', fg: '#4b3a2a', ui: '#8c7a62' },
  dark: { bg: '#121212', fg: '#d9d6cf', ui: '#8a8780' },
};
const EINK = { bg: '#efeee9', fg: '#1d1d1d', ui: '#555' };

/**
 * The template strip under the device: ◀ [Template ▾] ▶ ⚙.
 * ↑ ↓ ← → step through every design and the device redraws at each step.
 * The list (click the name) works the same way: arrow keys move and apply live,
 * Enter keeps the design, Esc goes back to the one you had; type to filter.
 */
export function templateStrip(app) {
  const name = h('span', { class: 'ts-name' });
  const ordered = () => {
    const { mine, all } = app.templateList();
    return [...mine, ...all.filter((t) => !t.custom)];
  };
  const curIndex = (list) => Math.max(0, list.findIndex((t) => t.id === app.book?.template));
  const step = (d) => {
    const list = ordered();
    if (!list.length) return;
    const i = (curIndex(list) + d + list.length) % list.length;
    app.useTemplate(list[i].id);
    draw();
  };
  const draw = () => { if (app.book) name.textContent = app.templateList().all.find((t) => t.id === app.book.template)?.name || 'Template'; };
  const btn = h('button', { type: 'button', class: 'ts-btn', 'aria-haspopup': 'listbox',
    title: 'Template — the book’s design. Press ↑ ↓ (or ← →) to try each one; the device updates as you go. Click for the full list.',
    onclick: () => openList(), onkeydown: (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); step(d); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
    } }, icon('palette', 14), name, icon('chevron', 11));

  function openList() {
    document.querySelector('.ts-list')?.remove();
    const original = app.book.template;
    const list = ordered();
    const mineCount = list.filter((t) => t.custom).length;
    const q = h('input', { type: 'search', class: 'ts-search', placeholder: 'Type to find a template', 'aria-label': 'Find a template' });
    const box = h('div', { class: 'ts-items', role: 'listbox', 'aria-label': 'Templates' });
    let shown = list;
    let at = curIndex(list);
    const render = () => {
      const f = q.value.trim().toLowerCase();
      shown = f ? list.filter((t) => t.name.toLowerCase().includes(f)) : list;
      box.replaceChildren(...shown.map((t, i) => {
        const opt = h('div', { class: `ts-item${t.id === app.book.template ? ' on' : ''}`, role: 'option', 'aria-selected': String(t.id === app.book.template), onmousedown: (e) => e.preventDefault(), onclick: () => { pick(i); done(); } },
          h('span', {}, t.name), h('small', {}, t.custom ? (t.origin === 'changed' ? 'Modified' : 'Custom') : t.category));
        if (!f && i === mineCount && mineCount) opt.classList.add('first-builtin');
        return opt;
      }));
      at = Math.max(0, shown.findIndex((t) => t.id === app.book.template));
      box.children[at]?.scrollIntoView({ block: 'nearest' });
    };
    const pick = (i) => {
      if (!shown[i]) return;
      at = i;
      app.useTemplate(shown[i].id);
      draw();
      [...box.children].forEach((c, k) => { c.classList.toggle('on', k === i); c.setAttribute('aria-selected', String(k === i)); });
      box.children[i]?.scrollIntoView({ block: 'nearest' });
    };
    const live = h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: app.templateLive(), 'aria-label': 'Live — show the designs with your own text' });
    live.addEventListener('change', () => { app.setTemplateLive(live.checked); q.focus(); });
    const panel = h('div', { class: 'ts-list' }, q, box,
      h('label', { class: 'ts-live', title: 'Off: the device shows example text in each design. On: it shows your own book.', onmousedown: (e) => { if (e.target !== live) e.preventDefault(); } }, live, h('span', {}, 'Live — show my text')),
      h('div', { class: 'ts-foot' }, h('span', { class: 'hint' }, '↑ ↓ try · Enter keep · Esc undo'),
        h('button', { type: 'button', class: 'btn small plain', onmousedown: (e) => e.preventDefault(), onclick: () => { done(); app.openTemplates?.(); } }, 'Gallery…')));
    const done = () => { panel.remove(); document.removeEventListener('mousedown', outside, true); app.setTemplateBrowsing?.(false); btn.focus(); };
    const outside = (e) => { if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) done(); };
    q.addEventListener('input', render);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); pick(Math.max(0, Math.min(shown.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))); }
      else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); pick(Math.max(0, Math.min(shown.length - 1, at + (e.key === 'PageDown' ? 8 : -8)))); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[at] && shown[at].id !== app.book.template) pick(at); done(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (app.book.template !== original) { app.useTemplate(original); draw(); } done(); }
    });
    document.body.append(panel);
    // Beside the preview (over the editor), so the whole device stays in view as designs change.
    // Without room there, it opens above the strip.
    const r = btn.getBoundingClientRect();
    const pane = btn.closest('.preview-pane')?.getBoundingClientRect();
    const w = 280;
    if (pane && pane.left > w + 24) {
      const maxH = Math.min(520, window.innerHeight - 90);
      Object.assign(panel.style, { left: `${pane.left - w - 10}px`, width: `${w}px`, bottom: `${Math.max(8, window.innerHeight - r.bottom)}px`, maxHeight: `${maxH}px` });
      panel.classList.add('beside');
    } else {
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      Object.assign(panel.style, { left: `${left}px`, width: `${w}px`, bottom: `${window.innerHeight - r.top + 8}px`, maxHeight: `${Math.max(200, Math.min(420, r.top - 16))}px` });
    }
    render();
    document.addEventListener('mousedown', outside, true);
    app.setTemplateBrowsing?.(true);
    q.focus();
  }

  queueMicrotask(draw);
  const el = h('div', { class: 'ts-strip', role: 'group', 'aria-label': 'Template' },
    h('button', { type: 'button', class: 'ts-arrow', title: 'Previous template — the device updates as you go', 'aria-label': 'Previous template', onclick: () => step(-1) }, icon('arrowLeft', 14)),
    btn,
    h('button', { type: 'button', class: 'ts-arrow', title: 'Next template — the device updates as you go', 'aria-label': 'Next template', onclick: () => step(1) }, icon('arrowRight', 14)),
    h('button', { type: 'button', class: 'ts-arrow ts-cfg', title: 'Edit the current template — change its fonts, headings, ornament and spacing, then save', 'aria-label': 'Edit the current template', onclick: () => app.editTemplate?.() }, icon('gear', 15)));
  el.draw = draw;
  return el;
}

/** Kobo and Nook models read better with the brand: “Kobo Libra Color”, “Nook GlowLight 4”. */
const fullName = (d) => (d.group === 'Kobo' || d.group === 'Nook' ? `${d.group} ${d.name}` : d.name);

export function createDevicePreview(host, app) {
  const opts = () => app.book.preview;
  let page = 0, pages = 1, last = null, scale = 1;

  /* ---------------------------------------------------------- controls */
  const devSel = h('select', { 'aria-label': 'Device', class: 'pv-device' },
    DEVICE_GROUPS.map((g) => h('optgroup', { label: g }, DEVICES.filter((d) => d.group === g).map((d) => h('option', { value: d.id }, d.name)))));
  const fontSel = h('select', { 'aria-label': 'Reading font', class: 'pv-font' },
    h('option', { value: '' }, 'Template font'),
    h('optgroup', { label: 'Included fonts' }, FONTS.filter((f) => !f.system && f.kind !== 'display' && f.kind !== 'mono').map((f) => h('option', { value: f.id }, f.family + (f.note ? ` — ${f.note}` : '')))),
    h('optgroup', { label: 'Device fonts (if installed)' }, FONTS.filter((f) => f.system).map((f) => h('option', { value: f.id }, `${f.family} — ${f.note}`))));
  const size = h('input', { type: 'range', min: 25, max: 300, step: 5, 'aria-label': 'Font size', class: 'pv-size' });
  const themeSel = h('select', { 'aria-label': 'Theme', class: 'pv-theme' }, ['light', 'sepia', 'dark'].map((t) => h('option', { value: t }, t[0].toUpperCase() + t.slice(1))));
  const firstBtn = h('button', { class: 'pg-btn', title: 'Front cover (Home)', 'aria-label': 'Front cover', onclick: () => app.previewJump('cover') }, icon('cover', 15));
  const tocBtn = h('button', { class: 'pg-btn', title: 'Contents — every part of the book', 'aria-label': 'Contents — every part of the book', onclick: () => app.previewContents?.(tocBtn) }, icon('toc', 15));
  const prevBtn = h('button', { class: 'pg-btn', title: 'Previous page (← or ↓)', 'aria-label': 'Previous page', onclick: () => turn(-1) }, icon('prev', 16));
  const nextBtn = h('button', { class: 'pg-btn', title: 'Next page (→ or ↑)', 'aria-label': 'Next page', onclick: () => turn(1) }, icon('next', 16));
  const lastBtn = h('button', { class: 'pg-btn', title: 'Back cover (End)', 'aria-label': 'Back cover', onclick: () => app.previewJump('end') }, icon('book', 15));
  const pageLbl = h('div', { class: 'pg-label' });
  const progress = h('div', { class: 'pg-progress' }, h('i'));
  const pager = h('div', { class: 'pager' }, tocBtn, prevBtn, h('div', { class: 'pg-mid' }, pageLbl, progress), nextBtn); // cover and back cover are in Contents (and Home / End)

  const mag = magnifier('lutefisk.deviceZoom', () => fit());
  const dcBtn = h('button', { class: 'chip-toggle', title: 'Drop caps in e-books', 'aria-pressed': 'true', onclick: () => {
    app.book.dropCaps = !ebookDropCaps(app.book); app.markDirty(); syncDc(); restyle(); app.refreshPreview();
  } }, icon('dropcap', 15), h('span', {}, 'Drop caps'));
  const syncDc = () => { const on = ebookDropCaps(app.book); dcBtn.classList.toggle('on', on); dcBtn.setAttribute('aria-pressed', String(on)); };
  // Row 1 (shared header): text size and zoom. Row 2: device, theme and templates.
  // Row 1 (shared header): text size, just left of Focus. Zoom is at the right of row 2.
  // Device picker: a list you can arrow through — the device changes with each step.
  // (The select stays, hidden, as the single source of the value.)
  devSel.classList.add('visually-hidden');
  devSel.tabIndex = -1;
  const devName = h('span', { class: 'dp-name' });
  const devBtn = h('button', { type: 'button', class: 'dp-btn', 'aria-haspopup': 'listbox', title: 'Device — the phone, tablet or e-reader the page is shown on. Click, then ↑ ↓ to try each one; Enter keeps it, Esc goes back.' }, devName, icon('chevronUpDown', 13));
  const devPicker = h('div', { class: 'pv-ctl dp' }, devBtn, devSel);
  const setDevice = (id, keep) => {
    if (opts().device === id && !keep) return;
    opts().device = id; devSel.value = id; build(); app.refreshPreview(true);
    if (keep) app.markDirty();
  };
  const stepDevice = (dir) => {
    const i = DEVICES.findIndex((d) => d.id === dev?.id);
    const next = DEVICES[(i + dir + DEVICES.length) % DEVICES.length];
    setDevice(next.id, true);
  };
  devBtn.addEventListener('keydown', (e) => {
    if (document.querySelector('.dp-list')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); stepDevice(e.key === 'ArrowDown' ? 1 : -1); }
  });
  devBtn.addEventListener('click', () => {
    if (document.querySelector('.dp-list')) { document.querySelector('.dp-list').remove(); return; }
    const start = dev.id;
    let cur = start;
    const box = h('div', { class: 'ts-items', role: 'listbox', 'aria-label': 'Devices' });
    const items = [];
    for (const g of DEVICE_GROUPS) {
      box.append(h('div', { class: 'dp-group' }, g));
      for (const d of DEVICES.filter((x) => x.group === g)) {
        const it = h('div', { class: 'ts-item', role: 'option', 'data-id': d.id, onmousedown: (e) => e.preventDefault(), onclick: () => { setDevice(d.id, true); close(); } },
          h('span', {}, d.name), h('small', {}, d.eink ? `E Ink${d.color ? ' · color' : ''}` : d.kind === 'phone' ? 'Phone' : 'Tablet'));
        items.push(it); box.append(it);
      }
    }
    const mark = (id) => {
      cur = id;
      for (const it of items) { const on = it.dataset.id === id; it.classList.toggle('on', on); it.setAttribute('aria-selected', String(on)); if (on) it.scrollIntoView({ block: 'nearest' }); }
    };
    const panel = h('div', { class: 'ts-list dp-list', tabindex: -1 }, box,
      h('div', { class: 'ts-foot' }, h('span', { class: 'hint' }, '↑ ↓ try · Enter keep · Esc undo')));
    const close = () => { panel.remove(); document.removeEventListener('mousedown', outside, true); devBtn.focus(); };
    const outside = (e) => { if (!panel.contains(e.target) && e.target !== devBtn && !devBtn.contains(e.target)) { setDevice(cur, true); close(); } };
    panel.addEventListener('keydown', (e) => {
      const i = items.findIndex((x) => x.dataset.id === cur);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].dataset.id;
        mark(n); setDevice(n, false);
      } else if (e.key === 'Enter') { e.preventDefault(); setDevice(cur, true); close(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDevice(start, false); close(); }
    });
    document.body.append(panel);
    const r = devBtn.getBoundingClientRect();
    Object.assign(panel.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, width: '250px', maxHeight: `${Math.max(240, window.innerHeight - r.bottom - 20)}px` });
    mark(start);
    document.addEventListener('mousedown', outside, true);
    panel.focus();
  });

  const row1 = h('div', { class: 'pv-row1-items' },
    h('label', { class: 'pv-ctl size-ctl', title: 'Text size — how large a reader has set the type on this device (doesn’t change the book)' }, h('span', { class: 'small-a' }, 'A'), size, h('span', { class: 'big-a' }, 'A')));
  // Row 2: the device and its reading theme. The template strip sits under the device.
  const bar = h('div', { class: 'pv-bar' },
    devPicker,
    h('label', { class: 'pv-ctl theme-ctl', title: 'Reading theme — light, sepia or dark, as a reader would choose on a phone or tablet' }, themeSel));
  const tplStrip = templateStrip(app);

  const stage = h('div', { class: 'dv-stage', tabindex: 0, 'aria-label': 'Device preview' });
  const styleEl = h('style');
  const caption = h('div', { class: 'dv-caption' });
  // In preview Focus, the mouse turns pages like a reader: left button back, right button forward.
  const focused = () => !!document.querySelector('.shell.preview-focus');
  stage.addEventListener('mousedown', (e) => {
    if (!focused() || (e.button !== 0 && e.button !== 2) || e.target.closest('a, button, input, select')) return;
    e.preventDefault();
    turn(e.button === 2 ? 1 : -1);
  });
  stage.addEventListener('contextmenu', (e) => { if (focused()) e.preventDefault(); });
  // Page-turn arrows on either side of the device, halfway down.
  const sideL = h('button', { class: 'dv-side-arrow left', title: 'Previous page (←)', 'aria-label': 'Previous page', onclick: () => turn(-1) }, icon('arrowLeft', 22));
  const sideR = h('button', { class: 'dv-side-arrow right', title: 'Next page (→)', 'aria-label': 'Next page', onclick: () => turn(1) }, icon('arrowRight', 22));
  // Links inside the book (the Contents page, notes) jump to that part.
  stage.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || !stage.contains(a)) return;
    const href = a.getAttribute('href') || '';
    e.preventDefault();
    const m = /^#sec-(.+)$/.exec(href);
    if (m) app.previewJump(m[1]);
  });
  host.append(bar, h('div', { class: 'dv-wrap' }, h('div', { class: 'dv-stage-wrap' }, stage, sideL, sideR), tplStrip, pager, caption), styleEl);

  devSel.addEventListener('change', () => { opts().device = devSel.value; app.markDirty(); build(); app.refreshPreview(true); });
  fontSel.addEventListener('change', () => { opts().font = fontSel.value; app.markDirty(); restyle(); draw(); });
  size.addEventListener('input', () => { opts().fontSize = +size.value; restyle(); draw(); });
  size.addEventListener('dblclick', () => { size.value = 100; size.dispatchEvent(new Event('input')); app.markDirty(); });
  rangeBubble(size);
  size.addEventListener('change', () => app.markDirty());
  themeSel.addEventListener('change', () => { opts().theme = themeSel.value; app.markDirty(); build(); app.refreshPreview(true); });
  stage.addEventListener('keydown', (e) => {
    // → and ↑ advance; ← and ↓ go back.
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); turn(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
    if (e.key === 'Home') { e.preventDefault(); app.previewJump('cover'); }
    if (e.key === 'End') { e.preventDefault(); app.previewJump('end'); }
  });
  stage.addEventListener('mousedown', () => stage.focus());
  stage.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); mag.step(e.deltaY < 0 ? 1 : -1); return; }
    if (mag.get() > 1) return; // magnified: let the wheel pan
    if (Math.abs(e.deltaY) > 30) { e.preventDefault(); turn(e.deltaY > 0 ? 1 : -1); }
  }, { passive: false });
  new ResizeObserver(() => fit()).observe(stage);

  /* ----------------------------------------------------------- frame */
  let dev, els = {};
  function build() {
    dev = deviceById(opts().device);
    devSel.value = dev.id;
    devName.textContent = fullName(dev);
    fontSel.value = opts().font || '';
    size.value = opts().fontSize || 100;
    themeSel.value = opts().theme || 'light';
    themeSel.parentElement.style.display = dev.eink ? 'none' : '';
    syncDc();
    stage.replaceChildren(frame(dev));
    caption.textContent = `${fullName(dev)} · ${dev.res[0] * (dev.eink ? 2 : dev.kind === 'phone' ? 3 : 2)}×${dev.res[1] * (dev.eink ? 2 : dev.kind === 'phone' ? 3 : 2)} · ${dev.eink ? (dev.color ? 'Color E Ink' : 'E Ink') : 'LCD/OLED'}`;
    restyle();
    fit();
  }

  function frame(d) {
    const [bw, bh] = d.body;
    const [sw, sh] = d.screen;
    const off = d.screenOffset || [(bw - sw) / 2, (bh - sh) / 2];
    const mm = (v) => `calc(${v} * var(--mm))`;
    const theme = d.eink ? EINK : THEMES[opts().theme || 'light'];

    const scr = h('div', { class: `scr ui-${d.ui}${d.eink ? ' eink' : ''}${d.color ? ' color' : ''}`, style: { width: `${d.res[0]}px`, height: `${d.res[1]}px`, background: theme.bg, color: theme.fg, '--ui': theme.ui } });
    const status = statusBar(d);
    const head = h('div', { class: 'scr-head' });
    const content = h('div', { class: 'scr-content' });
    const flow = h('div', { class: 'scr-flow' });
    const cover = h('div', { class: 'scr-cover' });
    const foot = h('div', { class: 'scr-foot' }, h('span', { class: 'f-l' }), h('span', { class: 'f-c' }), h('span', { class: 'f-r' }));
    content.append(flow);
    if (status) scr.append(status);
    scr.append(head, content, foot, cover);
    if (d.ui === 'ios') scr.append(h('div', { class: 'home-ind' }));
    if (d.ui === 'android') scr.append(h('div', { class: 'nav-pill' }));

    const screen = h('div', { class: `dv-screen${d.recessed ? ' recessed' : ''}`, style: { left: mm(off[0]), top: mm(off[1]), width: mm(sw), height: mm(sh), borderRadius: mm(d.screenRadius) } }, scr,
      d.eink ? null : h('div', { class: 'dv-glare' }));
    const face = h('div', { class: `dv-face${d.light ? ' light' : ''}`, style: { background: d.bezel, borderRadius: mm(d.radius - 0.9) } });
    if (d.grip) {
      const g = h('div', { class: `dv-grip${d.grip.ridge ? ' ridge' : ''}`, style: { width: mm(d.grip.width), background: d.grip.color, [d.grip.side]: 0, borderRadius: d.grip.side === 'right' ? `0 ${mm(d.radius - 0.9)} ${mm(d.radius - 0.9)} 0` : `${mm(d.radius - 0.9)} 0 0 ${mm(d.radius - 0.9)}` } });
      for (let i = 0; i < d.grip.buttons; i++) g.append(h('span', { class: 'grip-btn', style: { top: `${32 + i * 18}%` } }));
      face.append(g);
    }
    face.append(screen);
    if (d.sideButtons) {
      for (const side of ['left', 'right']) {
        face.append(h('span', { class: 'nook-btn', style: { [side]: mm(off[0] * 0.38), top: '34%', height: '12%' } }));
        face.append(h('span', { class: 'nook-btn', style: { [side]: mm(off[0] * 0.38), top: '50%', height: '12%' } }));
      }
    }
    if (d.home) face.append(h('span', { class: 'nook-home', style: { bottom: mm((bh - off[1] - sh) * 0.32), width: mm(9), height: mm(5) } }));
    if (d.camera) {
      const c = d.camera;
      if (c.type === 'punch') screen.append(h('span', { class: 'cam punch', style: { width: mm(c.d), height: mm(c.d), left: `calc(${c.x * 100}% - ${mm(c.d / 2)})`, top: `${c.y * 100}%` } }));
      else if (c.type === 'island') screen.append(h('span', { class: 'cam island', style: { width: `${c.w * 100}%`, height: `${c.h * 100}%`, left: `${(c.x - c.w / 2) * 100}%`, top: `${c.y * 100}%` } }));
      else if (c.side === 'right') face.append(h('span', { class: 'cam dot', style: { width: mm(c.d), height: mm(c.d), right: mm((bw - off[0] - sw) / 2 - c.d / 2), top: `calc(${c.at * 100}% - ${mm(c.d / 2)})` } }));
      else face.append(h('span', { class: 'cam dot', style: { width: mm(c.d), height: mm(c.d), left: `calc(${c.x * 100}% - ${mm(c.d / 2)})`, top: mm(off[1] / 2 - c.d / 2) } }));
    }
    const body = h('div', { class: `dv dv-${d.kind}`, style: { width: mm(bw), height: mm(bh), borderRadius: mm(d.radius), background: d.rim || d.bezel } }, face);
    for (const b of d.buttons) {
      const st = b.side === 'top'
        ? { top: mm(-0.7), left: `${b.at * 100}%`, width: `${b.len * 100}%`, height: mm(1.1) }
        : { [b.side]: mm(-0.7), top: `${b.at * 100}%`, height: `${b.len * 100}%`, width: mm(1.1) };
      body.append(h('span', { class: `hw-btn ${b.side}`, style: st }));
    }
    els = { scr, head, content, flow, foot, cover, screen, body, theme };
    return body;
  }

  function statusBar(d) {
    if (d.eink) return null;
    const time = h('span', { class: 'sb-time' }, '9:41');
    const right = h('span', { class: 'sb-right' }, h('span', { class: 'sb-signal' }, h('i'), h('i'), h('i'), h('i')), h('span', { class: 'sb-wifi' }), h('span', { class: 'sb-batt' }, h('i')));
    return h('div', { class: `scr-status sb-${d.ui}` }, time, right);
  }

  function fit() {
    if (!dev) return;
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const z = mag.get();
    const s = Math.max(0.5, Math.min((r.width - 40) / dev.body[0], (r.height - 40) / dev.body[1]) * z);
    stage.classList.toggle('zoomed', z > 1);
    stage.style.setProperty('--mm', `${s}px`);
    const screenPx = dev.screen[0] * s;
    scale = screenPx / dev.res[0];
    els.scr.style.transform = `scale(${scale})`;
    placeArrows();
  }
  /** Keep the page-turn arrows just outside the device's left and right edges, halfway down. */
  function placeArrows() {
    const wrap = stage.parentElement;
    if (!wrap || !els.body) return;
    requestAnimationFrame(() => {
      const w = wrap.getBoundingClientRect(), b = els.body.getBoundingClientRect();
      if (!w.width || !b.width) return;
      const gap = 10, aw = 34;
      sideL.style.left = `${Math.max(2, b.left - w.left - aw - gap)}px`;
      sideR.style.right = `${Math.max(2, w.right - b.right - aw - gap)}px`;
      sideL.style.top = sideR.style.top = `${Math.min(w.height - 40, Math.max(40, b.top - w.top + b.height / 2))}px`;
    });
  }

  /* ---------------------------------------------------------- styling */
  function layoutMetrics() {
    const d = dev;
    const pxPerMm = d.res[0] / d.screen[0];
    const em = d.kind === 'tablet' ? 3.9 : d.kind === 'phone' ? 3.2 : 3.15; // default reading size in mm per em
    const base = pxPerMm * em * ((opts().fontSize || 100) / 100);
    const top = d.eink ? 40 : d.ui === 'ios' ? 64 : 54;
    const bottom = d.eink ? 40 : d.ui === 'ios' ? 46 : 40;
    const side = Math.round(d.res[0] * (d.kind === 'phone' ? 0.06 : 0.075));
    const W = d.res[0] - side * 2;
    const H = d.res[1] - top - bottom;
    return { base, top, bottom, side, W, H, G: side * 2 };
  }

  function restyle() {
    if (!dev) return;
    const book = app.book;
    const tpl = withCasePrefs(templateById(book.template), book);
    const m = layoutMetrics();
    const font = opts().font || null;
    const ff = font ? fontStack(font) : null;
    styleEl.textContent = `
${baseCss('.scr .bk', 'device')}
${templateCss(tpl, '.scr .bk', { ctx: 'device', bodyFont: font, dropCaps: ebookDropCaps(book), color: !dev.eink })}
.scr .scr-head{top:${dev.eink ? 0 : 24}px;height:${m.top - (dev.eink ? 0 : 24)}px;padding:0 ${m.side}px;}
.scr .scr-foot{height:${m.bottom}px;padding:0 ${m.side}px;}
.scr .scr-content{top:${m.top}px;left:${m.side}px;width:${m.W}px;height:${m.H}px;}
.scr .scr-flow{width:${m.W}px;height:${m.H}px;column-width:${m.W}px;column-gap:${m.G}px;font-size:${m.base.toFixed(2)}px;}
.scr .scr-flow img{max-height:${m.H - 30}px;object-fit:contain;}
.scr .scr-flow .bk-fig{max-height:${m.H - 10}px;}
${ff ? `.scr .scr-flow .bk, .scr .scr-flow .bk .bk-body p{font-family:${ff};}` : ''}
`;
    els.flow.className = `scr-flow bk tpl-${tpl.id}`;
  }

  /* ---------------------------------------------------------- content */
  function render(info, caret) {
    // info: { html, sectionTitle, bookTitle, before, chars, total }
    if (!dev) build();
    last = info;
    els.flow.innerHTML = info.html; // trusted: produced by our Markdown renderer with raw HTML disabled
    paginate();
    if (caret) follow(caret);
    else if (info.goTo === 'end') page = pages - 1;
    else if (info.goTo === 'start') page = 0;
    page = Math.min(page, pages - 1);
    draw();
  }

  function paginate() {
    const m = layoutMetrics();
    const sw = els.flow.scrollWidth;
    pages = Math.max(1, Math.round((sw + m.G) / (m.W + m.G)));
  }

  function follow({ index, frac }) {
    const body = els.flow.querySelector('.bk-body');
    if (!body) return;
    const blocks = [...body.children].filter((c) => !c.classList.contains('bk-author-photo'));
    const el = blocks[Math.min(index, blocks.length - 1)];
    if (!el) return;
    const m = layoutMetrics();
    const rects = el.getClientRects();
    if (!rects.length) return;
    const r = rects[Math.min(rects.length - 1, Math.floor(frac * rects.length))];
    const base = els.flow.getBoundingClientRect();
    const dx = (r.left - base.left) / scale; // both rects share the current translate
    page = Math.max(0, Math.min(pages - 1, Math.floor((dx + 2) / (m.W + m.G))));
  }

  function draw() {
    if (!last || !dev) return;
    const m = layoutMetrics();
    els.flow.style.transform = `translateX(${-page * (m.W + m.G)}px)`;
    const special = last.special;
    els.cover.style.display = special ? 'flex' : 'none';
    for (const el of [els.content, els.head, els.foot]) el.style.visibility = special ? 'hidden' : '';
    els.cover.className = `scr-cover ${special || ''}`;
    if (special) els.cover.replaceChildren(specialPage(special));
    const [l, c, r] = els.foot.children;
    const sec = last.sectionTitle || '';
    const pct = last.total ? Math.min(100, Math.round(((last.before + ((page + 1) / pages) * last.chars) / last.total) * 100)) : 0;
    l.textContent = ''; c.textContent = ''; r.textContent = '';
    els.head.textContent = '';
    switch (dev.ui) {
      case 'kindle':
      case 'fire': {
        const loc = Math.max(1, Math.round((last.before + ((page + 1) / pages) * last.chars) / 128));
        els.head.textContent = last.bookTitle;
        l.textContent = `Location ${loc.toLocaleString()}`;
        r.textContent = `${pct}%`;
        break;
      }
      case 'kobo':
        els.head.textContent = sec;
        c.textContent = `${page + 1} of ${pages}`;
        r.textContent = '';
        break;
      case 'nook':
        els.head.textContent = last.bookTitle;
        c.textContent = `Page ${page + 1} of ${pages}`;
        break;
      case 'ios':
        els.head.textContent = sec;
        c.textContent = String(page + 1);
        r.textContent = `${pages - page - 1} pages left`;
        break;
      default:
        els.head.textContent = sec;
        c.textContent = `${page + 1} of ${pages}`;
        r.textContent = `${pct}%`;
    }
    const sectionPart = `${last.sectionTitle || 'Section'} · ${page + 1} of ${pages}`;
    pageLbl.textContent = special === 'cover' ? 'Front cover' : special === 'end' ? (app.book.backCover ? 'Back cover' : 'End of book') : sectionPart;
    const frac = special === 'cover' ? 0 : special === 'end' ? 1 : last.total ? Math.min(1, (last.before + ((page + 1) / pages) * last.chars) / last.total) : 0;
    progress.firstChild.style.width = `${(frac * 100).toFixed(1)}%`;
    prevBtn.disabled = special === 'cover';
    nextBtn.disabled = special === 'end';
    sideL.disabled = prevBtn.disabled; sideR.disabled = nextBtn.disabled;
    firstBtn.classList.toggle('on', special === 'cover');
    lastBtn.classList.toggle('on', special === 'end');
  }

  function specialPage(kind) {
    const book = app.book;
    const src = kind === 'cover' ? book.cover : book.backCover;
    if (src) {
      const key = kind === 'cover' ? 'cover' : 'backCover';
      const o = coverOpts(book, key);
      const img = h('img', { src: assetUrl(src), alt: coverAlt(book, key) });
      img.style.cssText = coverImgCss(o, { x: 7, top: 6, bottom: 6 });
      return h('div', { class: `cover-box ext-${o.extent}` }, img);
    }
    if (kind === 'cover') {
      return h('div', { class: 'cover-gen' }, h('div', { class: 'cg-title' }, book.title || 'Untitled'), book.subtitle ? h('div', { class: 'cg-sub' }, book.subtitle) : null, h('div', { class: 'cg-author' }, book.author || ''),
        h('div', { class: 'cg-hint' }, 'No cover image yet — add one in Book › Cover'));
    }
    return h('div', { class: 'end-page' }, h('div', { class: 'ep-mark' }, '❦'), h('div', { class: 'ep-title' }, book.title || 'Untitled'), h('div', { class: 'ep-author' }, book.author ? `by ${book.author}` : ''),
      h('div', { class: 'ep-note' }, 'You’ve reached the end of the book.'));
  }

  function turn(dir) {
    if (last?.special) { app.previewStep(dir); return; }
    const np = page + dir;
    if (np < 0 || np >= pages) { app.previewStep(dir); return; }
    page = np;
    draw();
  }

  return {
    row1,
    zoom: mag,
    build, render, restyle: () => { restyle(); if (last) { paginate(); page = Math.min(page, pages - 1); draw(); } },
    get pages() { return pages; },
  };
}
