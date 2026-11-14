// Cover image editor: move, zoom, rotate and crop the front or back cover to
// the e-book or print shape. The original upload is kept untouched; the crop
// is saved as a new image in assets/ and can be re-edited from the original.
import { h, icon, assetUrl, toast, segmented } from './ui.js';
import { TRIMS } from '../shared/print.js';

const STAGE_H = 460;

export function openCoverEditor(app, key, onDone) {
  const b = app.book;
  b.coverLayout ||= {};
  const lay = (b.coverLayout[key] ||= {});
  const source = lay.source || b[key];
  if (!source) return;
  const trim = TRIMS[b.print?.trim] || TRIMS['6x9'];
  const ASPECTS = {
    ebook: { label: 'E-book cover (1600 × 2560)', r: 1600 / 2560 },
    print: { label: `Print trim (${trim.label.split(' (')[0]})`, r: trim.w / trim.h },
    square: { label: 'Square (audiobook)', r: 1 },
    free: { label: 'Original shape', r: 0 },
  };
  const st = { aspect: 'ebook', zoom: 1, cx: 0.5, cy: 0.5, rot: 0, ...(lay.crop || {}) };
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const view = h('img', { class: 'ce-img', alt: '', draggable: 'false' });
  const frame = h('div', { class: 'ce-frame' });
  const stage = h('div', { class: 'ce-stage' }, view, frame);
  const zoomIn = h('input', { type: 'range', min: '1', max: '5', step: '0.01', 'aria-label': 'Zoom' });
  const info = h('span', { class: 'hint ce-info' });

  // Rotated image size in source pixels.
  const dims = () => (st.rot % 180 ? { w: img.naturalHeight, h: img.naturalWidth } : { w: img.naturalWidth, h: img.naturalHeight });
  const ratio = () => ASPECTS[st.aspect].r || dims().w / dims().h;
  const frameSize = () => { const r = ratio(); return { W: Math.round(STAGE_H * r), H: STAGE_H }; };
  const baseScale = () => { const { W, H } = frameSize(); const d = dims(); return Math.max(W / d.w, H / d.h); };
  function clamp() {
    const { W, H } = frameSize();
    const d = dims();
    const s = baseScale() * st.zoom;
    const hw = W / (2 * s * d.w), hh = H / (2 * s * d.h); // half crop size in normalized coords
    st.cx = Math.min(1 - hw, Math.max(hw, st.cx));
    st.cy = Math.min(1 - hh, Math.max(hh, st.cy));
  }
  function draw() {
    if (!img.naturalWidth) return;
    clamp();
    const { W, H } = frameSize();
    const d = dims();
    const s = baseScale() * st.zoom;
    stage.style.width = `${W + 160}px`;
    stage.style.height = `${H + 80}px`;
    frame.style.width = `${W}px`;
    frame.style.height = `${H}px`;
    // Center of the stage minus the crop center, in screen pixels.
    const ox = (W + 160) / 2 - st.cx * d.w * s;
    const oy = (H + 80) / 2 - st.cy * d.h * s;
    view.style.width = `${img.naturalWidth * s}px`;
    view.style.height = `${img.naturalHeight * s}px`;
    const rw = d.w * s, rh = d.h * s;
    view.style.transform = `translate(${ox + rw / 2}px, ${oy + rh / 2}px) translate(-50%, -50%) rotate(${st.rot}deg)`;
    zoomIn.value = String(st.zoom);
    const outH = Math.min(2560, Math.round(H / s));
    info.textContent = `Crop: ${Math.round(W / s)} × ${Math.round(H / s)} px of ${img.naturalWidth} × ${img.naturalHeight}${outH < 1600 && st.aspect === 'ebook' ? ' — low resolution for an e-book cover' : ''}`;
  }

  // Drag to move, wheel / slider to zoom.
  stage.addEventListener('pointerdown', (e) => {
    try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const start = { x: e.clientX, y: e.clientY, cx: st.cx, cy: st.cy };
    const s = baseScale() * st.zoom, d = dims();
    const move = (ev) => { st.cx = start.cx - (ev.clientX - start.x) / (s * d.w); st.cy = start.cy - (ev.clientY - start.y) / (s * d.h); draw(); };
    const up = () => { stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerup', up); };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); st.zoom = Math.min(5, Math.max(1, st.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06))); draw(); }, { passive: false });
  zoomIn.addEventListener('input', () => { st.zoom = Number(zoomIn.value); draw(); });
  const nudge = (dx, dy) => { const s = baseScale() * st.zoom, d = dims(); st.cx += dx / (s * d.w); st.cy += dy / (s * d.h); draw(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const step = e.shiftKey ? 20 : 4;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k && e.target.tagName !== 'SELECT' && e.target.type !== 'range') { e.preventDefault(); nudge(...k); }
  };

  async function apply() {
    const { W, H } = frameSize();
    const d = dims();
    const s = baseScale() * st.zoom;
    const srcW = W / s, srcH = H / s;
    const outScale = Math.min(1, 2560 / srcH, 4000 / srcW);
    const cw = Math.round(srcW * outScale), chh = Math.round(srcH * outScale);
    const canvas = h('canvas', { width: cw, height: chh });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, chh);
    ctx.imageSmoothingQuality = 'high';
    const k = outScale;
    ctx.translate(cw / 2 - (st.cx - 0.5) * d.w * k, chh / 2 - (st.cy - 0.5) * d.h * k);
    ctx.rotate((st.rot * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth * k / 2, -img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Could not create the image');
    const rel = await window.lutefisk.writeImage({ name: `${key === 'cover' ? 'cover' : 'back-cover'}-crop`, data: new Uint8Array(await blob.arrayBuffer()) });
    lay.source = source;
    lay.crop = { aspect: st.aspect, zoom: +st.zoom.toFixed(4), cx: +st.cx.toFixed(5), cy: +st.cy.toFixed(5), rot: st.rot };
    b[key] = rel;
    app.markDirty();
    app.refreshAll?.();
    toast('Cover adjusted', 'ok');
    close();
    onDone?.();
  }
  function revert() {
    b[key] = source;
    delete lay.crop; delete lay.source;
    app.markDirty(); app.refreshAll?.();
    toast('Original cover restored');
    close(); onDone?.();
  }

  const aspectSeg = segmented(Object.entries(ASPECTS).map(([value, a]) => ({ value, label: a.label })), st.aspect, (v) => { st.aspect = v; draw(); }, { label: 'Shape' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const dlg = h('div', { class: 'dlg ce-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Adjust cover' },
    h('h2', {}, icon('cover', 18), key === 'cover' ? 'Adjust Front Cover' : 'Adjust Back Cover'),
    aspectSeg,
    h('div', { class: 'ce-wrap' }, stage),
    h('div', { class: 'ce-tools' },
      h('button', { class: 'tb-btn', title: 'Zoom out', onclick: () => { st.zoom = Math.max(1, st.zoom / 1.15); draw(); } }, icon('minus', 16)),
      zoomIn,
      h('button', { class: 'tb-btn', title: 'Zoom in', onclick: () => { st.zoom = Math.min(5, st.zoom * 1.15); draw(); } }, icon('plus', 16)),
      h('span', { class: 'tb-sep' }),
      h('button', { class: 'btn small', title: 'Rotate left', onclick: () => { st.rot = (st.rot + 270) % 360; draw(); } }, icon('rotate', 14), 'Rotate'),
      h('button', { class: 'btn small', onclick: () => { st.zoom = 1; st.cx = 0.5; st.cy = 0.5; st.rot = 0; draw(); } }, 'Reset'),
      h('span', { class: 'spacer' }), info),
    h('p', { class: 'hint' }, 'Drag the picture to move it, scroll or use the slider to zoom, arrow keys to nudge. Everything outside the frame is cropped. Your original image is kept, so you can re-adjust any time.'),
    h('div', { class: 'btn-row' },
      lay.source ? h('button', { class: 'btn plain', onclick: revert }, 'Use Original') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: () => apply().catch((err) => toast(`Could not save: ${err.message || err}`, 'error')) }, 'Apply')));
  const overlay = h('div', { class: 'overlay' }, dlg);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  document.addEventListener('keydown', onKey, true);
  img.onload = () => { view.src = img.src; draw(); };
  img.onerror = () => { toast('Could not load the cover image', 'error'); close(); };
  img.src = assetUrl(source);
}
