// Live e-reader / phone / tablet preview with realistic device frames.
// The chapter is laid out in CSS columns sized to the device's reading area,
// so pages break exactly where they would on a reflowable reader.
import { coverOpts, coverAlt, coverImgCss } from '../shared/cover.js';
import { DEVICES, DEVICE_GROUPS, deviceById } from './devices.js';
import { FONTS, fontStack } from '../shared/fonts.js';
import { baseCss, templateCss, templateById, withCasePrefs } from '../shared/templates.js';
import { ebookDropCaps } from '../shared/sections.js';
import { SCRIPT_CSS } from '../shared/screenplay.js';
import { h, icon, assetUrl, magnifier } from './ui.js';

const THEMES = {
  light: { bg: '#ffffff', fg: '#151515', ui: '#7a7a7a' },
  sepia: { bg: '#f6efdf', fg: '#4b3a2a', ui: '#8c7a62' },
  dark: { bg: '#121212', fg: '#d9d6cf', ui: '#8a8780' },
};
const EINK = { bg: '#efeee9', fg: '#1d1d1d', ui: '#555' };

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
  const size = h('input', { type: 'range', min: 70, max: 200, step: 5, 'aria-label': 'Font size', class: 'pv-size' });
  const sizeLbl = h('span', { class: 'pv-size-lbl' });
  const themeSel = h('select', { 'aria-label': 'Theme', class: 'pv-theme' }, ['light', 'sepia', 'dark'].map((t) => h('option', { value: t }, t[0].toUpperCase() + t.slice(1))));
  const firstBtn = h('button', { class: 'pg-btn', title: 'Front cover (Home)', 'aria-label': 'Front cover', onclick: () => (fixed ? (page = 0, drawFixed()) : app.previewJump('cover')) }, icon('cover', 15));
  const prevBtn = h('button', { class: 'pg-btn', title: 'Previous page (← or ↓)', 'aria-label': 'Previous page', onclick: () => turn(-1) }, icon('prev', 16));
  const nextBtn = h('button', { class: 'pg-btn', title: 'Next page (→ or ↑)', 'aria-label': 'Next page', onclick: () => turn(1) }, icon('next', 16));
  const lastBtn = h('button', { class: 'pg-btn', title: 'Back cover (End)', 'aria-label': 'Back cover', onclick: () => (fixed ? (page = pages - 1, drawFixed()) : app.previewJump('end')) }, icon('book', 15));
  const pageLbl = h('div', { class: 'pg-label' });
  const progress = h('div', { class: 'pg-progress' }, h('i'));
  const pager = h('div', { class: 'pager' }, firstBtn, prevBtn, h('div', { class: 'pg-mid' }, pageLbl, progress), nextBtn, lastBtn);

  const mag = magnifier('lutefisk.deviceZoom', () => fit());
  const dcBtn = h('button', { class: 'chip-toggle', title: 'Drop caps in e-books', 'aria-pressed': 'true', onclick: () => {
    app.book.dropCaps = !ebookDropCaps(app.book); app.markDirty(); syncDc(); restyle(); app.refreshPreview();
  } }, icon('dropcap', 15), h('span', {}, 'Drop caps'));
  const syncDc = () => { const on = ebookDropCaps(app.book); dcBtn.classList.toggle('on', on); dcBtn.setAttribute('aria-pressed', String(on)); };
  const bar = h('div', { class: 'pv-bar' },
    h('label', { class: 'pv-ctl' }, devSel),
    h('label', { class: 'pv-ctl' }, fontSel),
    h('label', { class: 'pv-ctl size-ctl', title: 'Text size' }, h('span', { class: 'small-a' }, 'A'), size, h('span', { class: 'big-a' }, 'A'), sizeLbl),
    h('label', { class: 'pv-ctl theme-ctl' }, themeSel),
    dcBtn,
    h('span', { class: 'spacer' }),
    mag);

  const stage = h('div', { class: 'dv-stage', tabindex: 0, 'aria-label': 'Device preview' });
  const styleEl = h('style');
  const caption = h('div', { class: 'dv-caption' });
  host.append(bar, h('div', { class: 'dv-wrap' }, stage, pager, caption), styleEl);

  devSel.addEventListener('change', () => { opts().device = devSel.value; app.markDirty(); build(); app.refreshPreview(true); });
  fontSel.addEventListener('change', () => { opts().font = fontSel.value; app.markDirty(); restyle(); draw(); });
  size.addEventListener('input', () => { opts().fontSize = +size.value; sizeLbl.textContent = `${size.value}%`; restyle(); draw(); });
  size.addEventListener('change', () => app.markDirty());
  themeSel.addEventListener('change', () => { opts().theme = themeSel.value; app.markDirty(); build(); app.refreshPreview(true); });
  stage.addEventListener('keydown', (e) => {
    // → and ↑ advance; ← and ↓ go back.
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); turn(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
    if (e.key === 'Home') { e.preventDefault(); if (fixed) { page = 0; drawFixed(); } else app.previewJump('cover'); }
    if (e.key === 'End') { e.preventDefault(); if (fixed) { page = pages - 1; drawFixed(); } else app.previewJump('end'); }
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
    fontSel.value = opts().font || '';
    size.value = opts().fontSize || 100;
    sizeLbl.textContent = `${size.value}%`;
    themeSel.value = opts().theme || 'light';
    themeSel.parentElement.style.display = dev.eink ? 'none' : '';
    syncDc();
    stage.replaceChildren(frame(dev));
    caption.textContent = `${dev.name} · ${dev.res[0] * (dev.eink ? 2 : dev.kind === 'phone' ? 3 : 2)}×${dev.res[1] * (dev.eink ? 2 : dev.kind === 'phone' ? 3 : 2)} · ${dev.eink ? 'E Ink' : 'LCD/OLED'}`;
    restyle();
    fit();
    if (fixed) { els.flow.style.display = 'none'; els.fixedBox.style.display = 'flex'; }
  }

  function frame(d) {
    const [bw, bh] = d.body;
    const [sw, sh] = d.screen;
    const off = d.screenOffset || [(bw - sw) / 2, (bh - sh) / 2];
    const mm = (v) => `calc(${v} * var(--mm))`;
    const theme = d.eink ? EINK : THEMES[opts().theme || 'light'];

    const scr = h('div', { class: `scr ui-${d.ui}${d.eink ? ' eink' : ''}`, style: { width: `${d.res[0]}px`, height: `${d.res[1]}px`, background: theme.bg, color: theme.fg, '--ui': theme.ui } });
    const status = statusBar(d);
    const head = h('div', { class: 'scr-head' });
    const content = h('div', { class: 'scr-content' });
    const flow = h('div', { class: 'scr-flow' });
    const fixedBox = h('div', { class: 'scr-fixed' });
    const cover = h('div', { class: 'scr-cover' });
    const foot = h('div', { class: 'scr-foot' }, h('span', { class: 'f-l' }), h('span', { class: 'f-c' }), h('span', { class: 'f-r' }));
    content.append(flow, fixedBox);
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
    els = { scr, head, content, flow, fixedBox, foot, cover, screen, body, theme };
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
    if (fixed) requestAnimationFrame(() => drawFixed());
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const z = mag.get();
    const s = Math.max(0.5, Math.min((r.width - 40) / dev.body[0], (r.height - 40) / dev.body[1]) * z);
    stage.classList.toggle('zoomed', z > 1);
    stage.style.setProperty('--mm', `${s}px`);
    const screenPx = dev.screen[0] * s;
    scale = screenPx / dev.res[0];
    els.scr.style.transform = `scale(${scale})`;
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
${SCRIPT_CSS}
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
  /* Fixed-layout mode (screenplays): show real pages like a PDF reader would. */
  let fixed = null;
  function renderFixed(info) {
    if (!dev) build();
    last = info;
    fixed = info.fixed;
    bar.classList.add('fixed-mode');
    els.flow.style.display = 'none';
    els.fixedBox.style.display = 'flex';
    pages = fixed.pages.length;
    if (info.goTo === 'start') page = 0;
    else if (info.goTo === 'end') page = pages - 1;
    else if (info.page != null) page = info.page;
    page = Math.max(0, Math.min(pages - 1, page));
    drawFixed();
  }
  function drawFixed() {
    if (!fixed || !app.book) return;
    const m = layoutMetrics();
    const pw = fixed.w * 96, ph = fixed.h * 96;
    const W = m.W + m.side * 2 - 16, H = m.H;
    const s = Math.min(W / pw, H / ph);
    els.content.style.left = '8px';
    els.content.style.width = `${W}px`;
    els.fixedBox.innerHTML = fixed.pages[page]; // trusted: generated by our screenplay renderer
    const pg = els.fixedBox.firstElementChild;
    if (pg) { pg.style.transform = `scale(${s})`; pg.style.transformOrigin = 'top center'; els.fixedBox.style.height = `${ph * s}px`; }
    els.head.textContent = last.bookTitle || '';
    const [l, c, r] = els.foot.children;
    l.textContent = ''; r.textContent = '';
    c.textContent = page === 0 && fixed.hasTitle ? 'Title page' : `Page ${page + (fixed.hasTitle ? 0 : 1)} of ${pages - (fixed.hasTitle ? 1 : 0)}`;
    els.cover.style.display = 'none';
    for (const el of [els.content, els.head, els.foot]) el.style.visibility = '';
    pageLbl.textContent = c.textContent;
    progress.firstChild.style.width = `${((page + 1) / pages) * 100}%`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
    firstBtn.classList.remove('on'); lastBtn.classList.remove('on');
  }

  function render(info, caret) {
    if (info.fixed) return renderFixed(info);
    if (fixed) { fixed = null; bar.classList.remove('fixed-mode'); els.flow.style.display = ''; els.fixedBox.style.display = 'none'; els.content.style.left = ''; els.content.style.width = ''; }
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
    if (fixed) { page = Math.max(0, Math.min(pages - 1, page + dir)); drawFixed(); return; }
    if (last?.special) { app.previewStep(dir); return; }
    const np = page + dir;
    if (np < 0 || np >= pages) { app.previewStep(dir); return; }
    page = np;
    draw();
  }

  return {
    build, render, restyle: () => { restyle(); if (last) { paginate(); page = Math.min(page, pages - 1); draw(); } },
    get pages() { return pages; },
  };
}
