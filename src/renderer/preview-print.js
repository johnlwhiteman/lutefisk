// Print layout: real book pagination with trim sizes, mirrored margins,
// recto chapter openings, running heads, folios (roman front matter), single
// page or two-page spread view, and PDF export of exactly what you see.
import { coverOpts, coverAlt, coverImgCss, trimCoverMargins } from '../shared/cover.js';
import { TRIMS, PX_PER_IN } from '../shared/print.js';
import { baseCss, templateCss, templateById, withCasePrefs } from '../shared/templates.js';
import { FONTS, fontStack } from '../shared/fonts.js';
import { toRoman, SECTION_TYPES, DISPLAY_TYPES, printDropCaps } from '../shared/sections.js';
import { termRegex } from '../shared/bookhtml.js';
import { h, icon, toast, magnifier, segmented } from './ui.js';

const RECTO_TYPES = new Set(['title-page', 'dedication', 'epigraph', 'toc', 'foreword', 'preface', 'introduction', 'prologue', 'chapter', 'epilogue', 'acknowledgments', 'appendix', 'endnotes', 'bibliography', 'index', 'about-author']);
const G = 96; // gap between columns in the measuring flow

export function createPrintPreview(host, app) {
  const P = () => app.book.print;
  let cache = new Map(); // secId → { html, count, settingsKey }
  let layout = { pages: [], bySec: new Map() };
  let current = 0; // index into layout.pages
  let settingsKey = '';
  let tocKey = '';

  /* --------------------------------------------------------- controls */
  const trimSel = h('select', { 'aria-label': 'Trim size' }, Object.entries(TRIMS).map(([k, t]) => h('option', { value: k }, t.label)));
  const viewSel = segmented([{ value: 'single', label: 'Page', title: 'Single page' }, { value: 'spread', label: 'Spread', title: 'Two-page spread' }], 'spread',
    (v) => { P().view = v; app.markDirty(); draw(); }, { label: 'Page view' });
  const fontSel = h('select', { 'aria-label': 'Print font' }, h('option', { value: '' }, 'Template font'),
    FONTS.filter((f) => !f.system && f.kind !== 'display' && f.kind !== 'mono').map((f) => h('option', { value: f.id }, f.family)));
  const sizeSel = h('select', { 'aria-label': 'Font size' }, [9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14].map((v) => h('option', { value: v }, `${v} pt`)));
  const mag = magnifier('lutefisk.printZoom', () => fit());
  let fitMode = (() => { try { return localStorage.getItem('lutefisk.printFit') || 'page'; } catch { return 'page'; } })();
  const fitSeg = segmented([{ value: 'page', icon: 'fitPage', title: 'Fit whole page' }, { value: 'width', icon: 'fitWidth', title: 'Fit width — larger, scroll down to read' }], fitMode,
    (v) => { fitMode = v; try { localStorage.setItem('lutefisk.printFit', v); } catch { /* ignore */ } fit(); }, { label: 'Fit' });
  const dcBtn = h('button', { class: 'chip-toggle', title: 'Drop caps in print', onclick: () => {
    P().dropCaps = !printDropCaps(app.book); changed(); syncDc();
  } }, icon('dropcap', 15), h('span', {}, 'Drop caps'));
  const syncDc = () => { const on = printDropCaps(app.book); dcBtn.classList.toggle('on', on); dcBtn.setAttribute('aria-pressed', String(on)); };
  const firstBtn = h('button', { class: 'pg-btn', title: 'Front cover (Home)', 'aria-label': 'Front cover', onclick: () => go(-1) }, icon('cover', 15));
  const prevBtn = h('button', { class: 'pg-btn', title: 'Previous (← or ↓)', 'aria-label': 'Previous page', onclick: () => step(-1) }, icon('prev', 16));
  const nextBtn = h('button', { class: 'pg-btn', title: 'Next (→ or ↑)', 'aria-label': 'Next page', onclick: () => step(1) }, icon('next', 16));
  const lastBtn = h('button', { class: 'pg-btn', title: 'Back cover (End)', 'aria-label': 'Back cover', onclick: () => go(layout.pages.length) }, icon('book', 15));
  const pageLbl = h('div', { class: 'pg-label' });
  const progress = h('div', { class: 'pg-progress' }, h('i'));
  const pager = h('div', { class: 'pager' }, firstBtn, prevBtn, h('div', { class: 'pg-mid' }, pageLbl, progress), nextBtn, lastBtn);
  const bar = h('div', { class: 'pv-bar' },
    h('label', { class: 'pv-ctl' }, trimSel), viewSel,
    h('label', { class: 'pv-ctl' }, fontSel), h('label', { class: 'pv-ctl' }, sizeSel), dcBtn,
    h('span', { class: 'spacer' }), fitSeg, mag);
  const stage = h('div', { class: 'pp-stage', tabindex: 0, 'aria-label': 'Print preview' });
  const desk = h('div', { class: 'pp-desk' });
  const styleEl = h('style');
  const measure = h('div', { class: 'pp-measure', 'aria-hidden': 'true' });
  const mflow = h('div', { class: 'pp-flow' });
  measure.append(mflow);
  stage.append(desk);
  host.append(bar, stage, pager, styleEl, measure);

  trimSel.addEventListener('change', () => { P().trim = trimSel.value; changed(); });
  fontSel.addEventListener('change', () => { P().font = fontSel.value; changed(); });
  sizeSel.addEventListener('change', () => { P().fontSize = +sizeSel.value; changed(); });
  stage.addEventListener('keydown', (e) => {
    // → and ↑ advance; ← and ↓ go back.
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    if (e.key === 'Home') { e.preventDefault(); go(-1); }
    if (e.key === 'End') { e.preventDefault(); go(layout.pages.length); }
  });
  stage.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); mag.step(e.deltaY < 0 ? 1 : -1); return; }
    if (mag.get() > 1) return;
    if (Math.abs(e.deltaY) > 30) { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }
  }, { passive: false });
  stage.addEventListener('mousedown', () => stage.focus());
  new ResizeObserver(() => fit()).observe(stage);

  function changed() { app.markDirty(); restyle(); invalidate(); app.refreshPreview(true); }
  function syncControls() {
    const p = P();
    trimSel.value = p.trim || '6x9';
    fontSel.value = p.font || '';
    sizeSel.value = String(p.fontSize || 11);
    viewSel.setValue(p.view || 'spread');
    syncDc();
  }

  /* --------------------------------------------------------- metrics */
  function metrics() {
    const t = TRIMS[P().trim] || TRIMS['6x9'];
    const pw = Math.round(t.w * PX_PER_IN), ph = Math.round(t.h * PX_PER_IN);
    const inside = Math.round(t.inside * PX_PER_IN), outside = Math.round(t.outside * PX_PER_IN);
    const top = Math.round(t.top * PX_PER_IN), bottom = Math.round(t.bottom * PX_PER_IN);
    return { t, pw, ph, inside, outside, top, bottom, W: pw - inside - outside, H: ph - top - bottom, fontPx: (P().fontSize || 11) * (96 / 72) };
  }

  function bookCss(scope = '.pp-flow.bk') {
    const book = app.book;
    const tpl = withCasePrefs(templateById(book.template), book);
    const m = metrics();
    const ff = P().font ? fontStack(P().font) : null;
    return `
${baseCss(scope, 'print')}
${templateCss(tpl, scope, { ctx: 'print', bodyFont: P().font || null, dropCaps: printDropCaps(book), color: false })}
.pp-flow{width:${m.W}px;height:${m.H}px;column-width:${m.W}px;column-gap:${G}px;column-fill:auto;font-size:${m.fontPx.toFixed(3)}px;color:#111;}
.pp-flow img{max-height:${m.H - 20}px;object-fit:contain;filter:grayscale(1);}
${ff ? `${scope}, ${scope} .bk-body p{font-family:${ff};}` : ''}
`;
  }

  function restyle() {
    const m = metrics();
    const tpl = withCasePrefs(templateById(app.book.template), app.book);
    styleEl.textContent = `${bookCss()}
.pp-page{width:${m.pw}px;height:${m.ph}px;}
.pp-body{top:${m.top}px;width:${m.W}px;height:${m.H}px;}
.pp-page.recto .pp-body{left:${m.inside}px;} .pp-page.verso .pp-body{left:${m.outside}px;}
.pp-head{top:${Math.round(m.top * 0.42)}px;font-size:${(m.fontPx * 0.78).toFixed(2)}px;font-family:${fontStack(tpl.head)};}
.pp-page.recto .pp-head{left:${m.inside}px;right:${m.outside}px;} .pp-page.verso .pp-head{left:${m.outside}px;right:${m.inside}px;}
.pp-head{${tpl.normalHeadings ? 'font-variant:normal;letter-spacing:normal;' : ''}}
.pp-folio{bottom:${Math.round(m.bottom * 0.45)}px;font-size:${(m.fontPx * 0.85).toFixed(2)}px;font-family:${fontStack(P().font || tpl.body)};}
.pp-page.recto .pp-folio{left:${m.inside}px;right:${m.outside}px;} .pp-page.verso .pp-folio{left:${m.outside}px;right:${m.inside}px;}
`;
    const cls = `pp-flow bk tpl-${tpl.id}`;
    mflow.className = cls;
    settingsKey = JSON.stringify([P().trim, P().font, P().fontSize, app.book.template, printDropCaps(app.book), app.book.firstLine, app.book.headingCase]);
  }

  function invalidate() { cache = new Map(); }

  /* ---------------------------------------------------------- layout */
  function countPages(html) {
    mflow.innerHTML = html; // trusted renderer output (raw HTML disabled)
    const m = metrics();
    return Math.max(1, Math.round((mflow.scrollWidth + G) / (m.W + G)));
  }

  function sectionPages(sec, html) {
    const c = cache.get(sec.id);
    if (c && c.html === html && c.key === settingsKey) return c.count;
    const count = countPages(html);
    cache.set(sec.id, { html, count, key: settingsKey });
    return count;
  }

  function buildLayout(tocPages, indexPages) {
    const sections = app.sections();
    const pages = [];
    const bySec = new Map();
    const roman = P().romanFrontMatter !== false;
    const startRecto = P().startRecto !== false;
    let bodyStart = -1;
    for (const sec of sections) {
      const html = app.renderSectionHtml(sec, { tocPages, indexPages });
      const n = sectionPages(sec, html);
      const group = SECTION_TYPES[sec.type]?.group;
      const wantsRecto = sec.type === 'title-page' || (startRecto && RECTO_TYPES.has(sec.type) && sec.type !== 'copyright') || (group !== 'front' && bodyStart < 0);
      if (wantsRecto && pages.length % 2 === 1) pages.push({ blank: true });
      if (group !== 'front' && bodyStart < 0) bodyStart = pages.length;
      bySec.set(sec.id, { start: pages.length, count: n, html });
      for (let i = 0; i < n; i++) pages.push({ sec, i, html });
    }
    pages.forEach((p, idx) => {
      const phys = idx + 1;
      p.recto = phys % 2 === 1;
      const inBody = bodyStart >= 0 && idx >= bodyStart;
      p.folio = inBody ? String(idx - bodyStart + 1) : roman ? toRoman(phys) : String(phys);
      if (p.blank) return;
      const display = DISPLAY_TYPES.has(p.sec.type) || p.sec.type === 'title-page';
      p.showFolio = !display;
      p.showHead = !display && p.i > 0 && P().runningHeads !== false;
      p.head = p.recto ? (P().rectoHead === 'chapter' ? p.sec.tocTitle : app.book.title) : app.book.author;
    });
    return { pages, bySec };
  }

  function computeLayout(indexPages) {
    let tocPages = null;
    let l = buildLayout(tocPages, indexPages);
    for (let pass = 0; pass < 3; pass++) {
      const next = {};
      for (const [id, info] of l.bySec) next[id] = l.pages[info.start]?.folio ?? '';
      const key = JSON.stringify(next);
      if (key === JSON.stringify(tocPages)) break;
      tocPages = next;
      l = buildLayout(tocPages, indexPages);
    }
    layout = l;
    tocKey = JSON.stringify(tocPages);
    return l;
  }

  /* --------------------------------------------------------- drawing */
  function pageEl(p, forExport = false) {
    if (!p) return h('div', { class: 'pp-page empty' });
    const m = metrics();
    const el = h('div', { class: `pp-page ${p.recto ? 'recto' : 'verso'}${p.blank ? ' blank' : ''}` });
    if (!p.blank) {
      if (p.showHead) el.append(h('div', { class: 'pp-head' }, p.head || ''));
      const flow = h('div', { class: mflow.className, style: { transform: `translateX(${-p.i * (m.W + G)}px)` } });
      flow.innerHTML = p.html; // trusted renderer output
      el.append(h('div', { class: 'pp-body' }, flow));
      if (p.showFolio) el.append(h('div', { class: 'pp-folio' }, p.folio));
    }
    if (!forExport) el.append(h('div', { class: 'pp-shade' }));
    return el;
  }

  // current: -1 = front cover, 0..n-1 = interior pages, n = back cover.
  function coverEl(kind) {
    const book = app.book;
    const src = kind === 'front' ? book.cover : book.backCover;
    const el = h('div', { class: `pp-page pp-cover ${kind === 'front' ? 'recto' : 'verso'}` });
    const key = kind === 'front' ? 'cover' : 'backCover';
    if (src) { const img = h('img', { src: 'book://current/' + src.split('/').map(encodeURIComponent).join('/'), alt: coverAlt(book, key) }); img.style.cssText = coverImgCss(coverOpts(book, key), trimCoverMargins(metrics().t)); el.classList.add(`ext-${coverOpts(book, key).extent}`); el.append(img); }
    else if (kind === 'front') el.append(h('div', { class: 'cover-gen' }, h('div', { class: 'cg-title' }, book.title || 'Untitled'), book.subtitle ? h('div', { class: 'cg-sub' }, book.subtitle) : null, h('div', { class: 'cg-author' }, book.author || ''), h('div', { class: 'cg-hint' }, 'Add a cover image in Book › Cover')));
    else el.append(h('div', { class: 'back-gen' }, h('p', {}, book.description || 'Add a back-cover image or a book description in Book settings.'), h('div', { class: 'bg-isbn' }, book.isbn ? `ISBN ${book.isbn}` : '')));
    el.append(h('div', { class: 'pp-shade' }));
    return el;
  }

  function draw() {
    const pages = layout.pages;
    if (!pages.length) return;
    const n = pages.length;
    current = Math.max(-1, Math.min(current, n));
    const spread = (P().view || 'spread') === 'spread';
    let items;
    if (current === -1) items = spread ? [null, coverEl('front')] : [coverEl('front')];
    else if (current === n) items = spread ? [coverEl('back'), null] : [coverEl('back')];
    else if (spread) {
      const left = (current + 1) % 2 === 0 ? current : current - 1;
      items = [pages[left] ? pageEl(pages[left]) : null, pages[left + 1] ? pageEl(pages[left + 1]) : null];
    } else items = [pageEl(pages[current])];
    desk.className = `pp-desk ${spread ? 'spread' : 'single'}`;
    const book = h('div', { class: 'pp-book' }, items.map((el) => el || h('div', { class: 'pp-page empty' })));
    if (spread && current >= 0 && current < n) book.append(h('div', { class: 'pp-spine' }));
    desk.replaceChildren(book);
    fit();
    if (current === -1) pageLbl.textContent = 'Front cover';
    else if (current === n) pageLbl.textContent = 'Back cover';
    else {
      const p = pages[current];
      pageLbl.textContent = `${p.blank ? 'Blank page' : `Page ${p.folio}`} · ${p.sec ? p.sec.tocTitle : ''}`.replace(/ · $/, '') + `  (${current + 1} of ${n})`;
    }
    progress.firstChild.style.width = `${(((current + 1) / (n + 1)) * 100).toFixed(1)}%`;
    prevBtn.disabled = current === -1;
    nextBtn.disabled = current === n;
    firstBtn.classList.toggle('on', current === -1);
    lastBtn.classList.toggle('on', current === n);
  }

  function go(i) { current = i; draw(); }

  function fit() {
    if (!app.book) return;
    const r = stage.getBoundingClientRect();
    const m = metrics();
    const spread = (P().view || 'spread') === 'spread';
    const w = spread ? m.pw * 2 : m.pw;
    const z = mag.get();
    stage.classList.toggle('zoomed', z > 1 || fitMode === 'width');
    const base = fitMode === 'width' ? (r.width - 64) / w : Math.min((r.width - 48) / w, (r.height - 48) / m.ph);
    const s = base * z;
    desk.style.setProperty('--s', String(Math.max(0.1, s)));
    desk.style.width = `${w * s}px`;
    desk.style.height = `${m.ph * s}px`;
  }

  function step(dir) {
    const n = layout.pages.length;
    const spread = (P().view || 'spread') === 'spread';
    if (current === -1) { if (dir > 0) current = 0; }
    else if (current === n) { if (dir < 0) current = n - 1; }
    else if (spread) {
      const left = (current + 1) % 2 === 0 ? current : current - 1;
      current = dir > 0 ? (left + 2 > n - 1 ? n : left + 2) : (left - 1 < 0 ? -1 : left - 1);
    } else current += dir;
    draw();
  }

  /** Find the page in the measuring flow holding the caret. */
  function caretPage(secId, caret) {
    const info = layout.bySec.get(secId);
    if (!info) return null;
    if (!caret) return info.start;
    mflow.innerHTML = info.html;
    const body = mflow.querySelector('.bk-body');
    const blocks = body ? [...body.children].filter((c) => !c.classList.contains('bk-author-photo')) : [];
    const el = blocks[Math.min(caret.index, blocks.length - 1)];
    if (!el) return info.start;
    const rects = el.getClientRects();
    if (!rects.length) return info.start;
    const r = rects[Math.min(rects.length - 1, Math.floor(caret.frac * rects.length))];
    const m = metrics();
    const col = Math.floor((r.left - mflow.getBoundingClientRect().left + 2) / (m.W + G));
    return info.start + Math.max(0, Math.min(info.count - 1, col));
  }

  /* ---------------------------------------------------------- export */
  function indexPageMap() {
    const terms = (app.book.index?.terms || []).map(String).filter(Boolean);
    if (!terms.length) return {};
    const res = Object.fromEntries(terms.map((t) => [t, new Set()]));
    const m = metrics();
    for (const [id, info] of layout.bySec) {
      const sec = app.sections().find((s) => s.id === id);
      if (!sec || SECTION_TYPES[sec.type]?.generated) continue;
      mflow.innerHTML = info.html;
      const base = mflow.getBoundingClientRect().left;
      const walker = document.createTreeWalker(mflow.querySelector('.bk-body') || mflow, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const t of terms) {
          const re = new RegExp(termRegex(t).source, 'giu');
          for (const match of node.data.matchAll(re)) {
            const start = match.index + match[1].length;
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, Math.min(node.data.length, start + t.length));
            const rect = range.getClientRects()[0];
            if (!rect) continue;
            const col = Math.floor((rect.left - base + 2) / (m.W + G));
            const pg = layout.pages[info.start + Math.max(0, Math.min(info.count - 1, col))];
            if (pg) res[t].add(pg.folio);
          }
        }
      }
    }
    const out = {};
    for (const [t, set] of Object.entries(res)) out[t] = [...set];
    return out;
  }

  async function exportPdf() {
    restyle();
    computeLayout();
    const idx = indexPageMap();
    if (Object.keys(idx).length) computeLayout(idx);
    const m = metrics();
    const pages = [...layout.pages];
    const parts = [];
    if (P().includeCover && app.book.cover) {
      parts.push(`<div class="pp-page cover"><img src="${'book://current/' + app.book.cover.split('/').map(encodeURIComponent).join('/')}" alt="${escapeText(coverAlt(app.book, 'cover')).replace(/"/g, '&quot;')}" style="${coverImgCss(coverOpts(app.book, 'cover'), trimCoverMargins(m.t))}"></div>`);
      parts.push('<div class="pp-page blank"></div>');
    }
    for (const p of pages) parts.push(pageEl(p, true).outerHTML);
    const html = `<!DOCTYPE html><html lang="${app.book.language || 'en'}"><head><meta charset="utf-8"><title>${escapeText(app.book.title || 'Book')}</title>
<link rel="stylesheet" href="app://lutefisk/styles/fonts.css">
<style>
@page{size:${m.t.w}in ${m.t.h}in;margin:0}
html,body{margin:0;padding:0;background:#fff}
.pp-page{position:relative;overflow:hidden;break-after:page;page-break-after:always;background:#fff;color:#111}
.pp-page:last-child{break-after:auto;page-break-after:auto}
.pp-body{position:absolute;overflow:hidden}
.pp-head,.pp-folio{position:absolute;text-align:center;letter-spacing:.08em;font-variant:small-caps;color:#333}
.pp-folio{letter-spacing:0;font-variant:normal}
.pp-page.cover{background:#fff}
${styleEl.textContent}
</style></head><body>${parts.join('\n')}</body></html>`;
    toast('Rendering PDF…');
    return window.lutefisk.exportPdf({ html, widthIn: m.t.w, heightIn: m.t.h, title: app.book.title });
  }

  return {
    init() { syncControls(); restyle(); },
    /** Re-layout after edits. sectionId/caret: where the writer is. */
    update(sectionId, caret, opts = {}) {
      if (opts.full) { syncControls(); restyle(); invalidate(); }
      computeLayout();
      if (sectionId && (caret || opts.jump)) {
        const pg = caretPage(sectionId, caret);
        if (pg != null) current = pg;
      }
      draw();
    },
    exportPdf,
    get pageCount() { return layout.pages.length; },
    get tocKey() { return tocKey; },
  };
}

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
