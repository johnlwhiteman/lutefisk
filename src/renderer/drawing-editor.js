// Freehand drawing: pen, pencil, brush, marker, shapes and eraser with colours,
// widths and opacity. Strokes are kept as editable JSON in the book's assets;
// a PNG copy is what e-readers, print and Word receive.
import { h, icon, toast } from './ui.js';

const COLORS = ['#111111', '#5f6368', '#ffffff', '#d93025', '#e8710a', '#f9ab00', '#188038', '#1a73e8', '#7b1fa2', '#c2185b', '#795548', '#00897b'];
const TOOLS = [
  { id: 'pen', label: 'Pen', hint: 'Smooth ink line' },
  { id: 'pencil', label: 'Pencil', hint: 'Thin, textured graphite' },
  { id: 'brush', label: 'Brush', hint: 'Thicker when slow, thinner when fast' },
  { id: 'marker', label: 'Highlighter', hint: 'Flat, see-through tip' },
  { id: 'line', label: 'Line', hint: 'Straight line (hold ⇧ to snap)' },
  { id: 'arrow', label: 'Arrow', hint: 'Straight arrow' },
  { id: 'rect', label: 'Rectangle', hint: 'Box (hold ⇧ for a square)' },
  { id: 'ellipse', label: 'Ellipse', hint: 'Oval (hold ⇧ for a circle)' },
  { id: 'eraser', label: 'Eraser', hint: 'Rub out' },
];
const SIZES = { landscape: [1200, 800, 'Landscape 3:2'], wide: [1280, 720, 'Wide 16:9'], square: [1000, 1000, 'Square'], portrait: [800, 1200, 'Portrait 2:3'] };
const BGS = { transparent: ['Transparent', null], white: ['White', '#ffffff'], paper: ['Paper', '#fbf6e9'] };

/** Deterministic pseudo-random so pencil texture looks identical every render. */
const rand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

export function renderDrawing(ctx, data, scale = 1) {
  const W = data.width * scale, H = data.height * scale;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  // Strokes go on their own layer so the eraser removes ink, not the background.
  const layer = document.createElement('canvas');
  layer.width = W; layer.height = H;
  const c = layer.getContext('2d');
  c.scale(scale, scale);
  data.strokes.forEach((s, si) => drawStroke(c, s, si));
  if (data.background && BGS[data.background]?.[1]) { ctx.fillStyle = BGS[data.background][1]; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function drawStroke(c, s, si) {
  const p = s.points || [];
  c.save();
  c.globalAlpha = s.opacity ?? 1;
  c.strokeStyle = s.color; c.fillStyle = s.color;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = s.width;
  if (s.tool === 'eraser') { c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1; c.strokeStyle = '#000'; }
  if (['line', 'arrow', 'rect', 'ellipse'].includes(s.tool) && p.length >= 2) {
    const [a, b] = [p[0], p[p.length - 1]];
    c.beginPath();
    if (s.tool === 'rect') c.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    else if (s.tool === 'ellipse') c.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 0.5, Math.abs(b[1] - a[1]) / 2 || 0.5, 0, 0, Math.PI * 2);
    else { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    if (s.fill && (s.tool === 'rect' || s.tool === 'ellipse')) { c.save(); c.globalAlpha *= 0.25; c.fill(); c.restore(); }
    c.stroke();
    if (s.tool === 'arrow') {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const L = Math.max(12, s.width * 4);
      c.beginPath();
      c.moveTo(b[0], b[1]);
      c.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45));
      c.moveTo(b[0], b[1]);
      c.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45));
      c.stroke();
    }
    c.restore();
    return;
  }
  if (!p.length) { c.restore(); return; }
  if (p.length === 1) { c.beginPath(); c.arc(p[0][0], p[0][1], s.width / 2, 0, Math.PI * 2); c.fill(); c.restore(); return; }
  const smooth = (pts) => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    c.stroke();
  };
  if (s.tool === 'marker') { c.lineCap = 'square'; c.lineJoin = 'bevel'; smooth(p); }
  else if (s.tool === 'pencil') {
    c.lineWidth = Math.max(1, s.width * 0.6);
    c.globalAlpha = (s.opacity ?? 1) * 0.55;
    for (let pass = 0; pass < 3; pass++) {
      const j = Math.max(0.4, s.width * 0.25);
      smooth(p.map((q, i) => [q[0] + (rand(i + si, pass) - 0.5) * j, q[1] + (rand(i + si, pass + 7) - 0.5) * j]));
    }
  } else if (s.tool === 'brush') {
    for (let i = 1; i < p.length; i++) {
      const [x0, y0, t0] = p[i - 1], [x1, y1, t1] = p[i];
      const speed = Math.hypot(x1 - x0, y1 - y0) / Math.max(1, (t1 || 0) - (t0 || 0));
      c.lineWidth = Math.max(1, s.width * Math.min(1.4, Math.max(0.35, 1.3 - speed * 0.35)));
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
  } else smooth(p);
  c.restore();
}

/**
 * Open the drawing editor. existing: { json, rel, pngRel } to edit, or null for a new drawing.
 * Resolves with { png, json } paths (in assets/) or null if cancelled.
 */
export function openDrawingEditor(existing = null) {
  return new Promise((resolve) => {
    let data = existing?.json ? JSON.parse(existing.json) : { kind: 'lutefisk-drawing', version: 1, width: 1200, height: 800, background: 'transparent', strokes: [] };
    const redo = [];
    const st = { tool: 'pen', color: '#111111', width: 6, opacity: 1, fill: false };
    const canvas = h('canvas', { class: 'dr-canvas' });
    const ctx = canvas.getContext('2d');
    const wrap = h('div', { class: 'dr-stage' }, canvas);
    let current = null;
    let viewScale = 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function layout() {
      const box = wrap.getBoundingClientRect();
      viewScale = Math.min((box.width - 24) / data.width, (box.height - 24) / data.height, 1.2);
      canvas.style.width = `${data.width * viewScale}px`;
      canvas.style.height = `${data.height * viewScale}px`;
      canvas.width = Math.round(data.width * viewScale * dpr);
      canvas.height = Math.round(data.height * viewScale * dpr);
      paint();
    }
    function paint() {
      const d = current ? { ...data, strokes: [...data.strokes, current] } : data;
      renderDrawing(ctx, d, viewScale * dpr);
      canvas.classList.toggle('transparent', !BGS[data.background]?.[1]);
      undoBtn.disabled = !data.strokes.length;
      redoBtn.disabled = !redo.length;
    }
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return [+((e.clientX - r.left) / viewScale).toFixed(1), +((e.clientY - r.top) / viewScale).toFixed(1), Math.round(e.timeStamp)];
    };
    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      current = { tool: st.tool, color: st.color, width: st.tool === 'eraser' ? st.width * 2.5 : st.width, opacity: st.tool === 'marker' ? Math.min(st.opacity, 0.45) : st.opacity, points: [at(e)] };
      if (st.fill && (st.tool === 'rect' || st.tool === 'ellipse')) current.fill = true;
      paint();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      let p = at(e);
      if (['line', 'arrow', 'rect', 'ellipse'].includes(current.tool)) {
        const a = current.points[0];
        if (e.shiftKey) {
          if (current.tool === 'rect' || current.tool === 'ellipse') { const d = Math.max(Math.abs(p[0] - a[0]), Math.abs(p[1] - a[1])); p = [a[0] + Math.sign(p[0] - a[0]) * d, a[1] + Math.sign(p[1] - a[1]) * d, p[2]]; }
          else { const ang = Math.round(Math.atan2(p[1] - a[1], p[0] - a[0]) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(p[0] - a[0], p[1] - a[1]); p = [+(a[0] + Math.cos(ang) * len).toFixed(1), +(a[1] + Math.sin(ang) * len).toFixed(1), p[2]]; }
        }
        current.points = [a, p];
      } else {
        const last = current.points[current.points.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
        current.points.push(p);
      }
      paint();
    });
    const finish = () => { if (!current) return; data.strokes.push(current); current = null; redo.length = 0; paint(); };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);

    // Toolbar
    const toolBtns = TOOLS.map((t) => h('button', { type: 'button', class: `dr-tool${t.id === st.tool ? ' on' : ''}`, 'data-t': t.id, title: `${t.label} — ${t.hint}`, onclick: () => { st.tool = t.id; for (const b of toolBtns) b.classList.toggle('on', b.dataset.t === t.id); } }, toolGlyph(t.id), h('span', {}, t.label)));
    const swatches = COLORS.map((c) => h('button', { type: 'button', class: `dr-swatch${c === st.color ? ' on' : ''}`, title: c, style: { background: c }, onclick: () => setColor(c) }));
    const custom = h('input', { type: 'color', value: st.color, title: 'Custom colour', 'aria-label': 'Custom colour' });
    custom.addEventListener('input', () => setColor(custom.value));
    function setColor(c) { st.color = c; custom.value = c; for (const s of swatches) s.classList.toggle('on', s.title === c); }
    const widthIn = h('input', { type: 'range', min: '1', max: '60', value: String(st.width), 'aria-label': 'Width' });
    const widthLbl = h('span', { class: 'dr-val' }, `${st.width}px`);
    widthIn.addEventListener('input', () => { st.width = +widthIn.value; widthLbl.textContent = `${st.width}px`; });
    const opIn = h('input', { type: 'range', min: '10', max: '100', value: '100', 'aria-label': 'Opacity' });
    const opLbl = h('span', { class: 'dr-val' }, '100%');
    opIn.addEventListener('input', () => { st.opacity = +opIn.value / 100; opLbl.textContent = `${opIn.value}%`; });
    const fillBox = h('input', { type: 'checkbox' });
    fillBox.addEventListener('change', () => { st.fill = fillBox.checked; });
    const sizeSel = h('select', { 'aria-label': 'Canvas size' }, Object.entries(SIZES).map(([k, [w, hh, l]]) => h('option', { value: k }, `${l} (${w}×${hh})`)));
    sizeSel.value = Object.entries(SIZES).find(([, [w, hh]]) => w === data.width && hh === data.height)?.[0] || 'landscape';
    sizeSel.addEventListener('change', () => { const [w, hh] = SIZES[sizeSel.value]; data.width = w; data.height = hh; layout(); });
    const bgSel = h('select', { 'aria-label': 'Background' }, Object.entries(BGS).map(([k, [l]]) => h('option', { value: k }, l)));
    bgSel.value = data.background || 'transparent';
    bgSel.addEventListener('change', () => { data.background = bgSel.value; paint(); });
    const undoBtn = h('button', { type: 'button', class: 'tb-btn', title: 'Undo (⌘Z)', onclick: () => { if (data.strokes.length) { redo.push(data.strokes.pop()); paint(); } } }, icon('undo', 16));
    const redoBtn = h('button', { type: 'button', class: 'tb-btn', title: 'Redo (⇧⌘Z)', onclick: () => { if (redo.length) { data.strokes.push(redo.pop()); paint(); } } }, icon('redo', 16));
    const clearBtn = h('button', { type: 'button', class: 'btn small plain danger', onclick: () => { if (data.strokes.length) { redo.push(...data.strokes.reverse()); data.strokes = []; paint(); } } }, 'Clear');

    async function save() {
      if (!data.strokes.length) { toast('Draw something first', 'info'); return; }
      const out = h('canvas', { width: data.width * 2, height: data.height * 2 });
      renderDrawing(out.getContext('2d'), data, 2);
      const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
      const res = await window.lutefisk.writeDrawing({ rel: existing?.rel || null, pngRel: existing?.pngRel || null, json: JSON.stringify(data), png: new Uint8Array(await blob.arrayBuffer()) });
      close(res);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redoBtn : undoBtn).click(); }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        const k = { p: 'pen', n: 'pencil', b: 'brush', h: 'marker', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', e: 'eraser' }[e.key.toLowerCase()];
        if (k) toolBtns.find((b) => b.dataset.t === k)?.click();
        if (e.key === '[' || e.key === ']') { widthIn.value = String(Math.max(1, Math.min(60, st.width + (e.key === ']' ? 2 : -2)))); widthIn.dispatchEvent(new Event('input')); }
      }
    };
    const close = (val) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', layout); resolve(val); };
    const dlg = h('div', { class: 'dlg dr-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Drawing' },
      h('div', { class: 'dr-head' }, h('h2', {}, icon('pen', 18), existing ? 'Edit Drawing' : 'New Drawing'),
        h('label', { class: 'dr-field' }, 'Canvas', sizeSel), h('label', { class: 'dr-field' }, 'Background', bgSel),
        h('span', { class: 'spacer' }), undoBtn, redoBtn, clearBtn),
      h('div', { class: 'dr-body' },
        h('aside', { class: 'dr-side' },
          h('div', { class: 'dr-group' }, h('h4', {}, 'Tip'), h('div', { class: 'dr-tools' }, toolBtns)),
          h('div', { class: 'dr-group' }, h('h4', {}, 'Colour'), h('div', { class: 'dr-swatches' }, swatches, custom)),
          h('div', { class: 'dr-group' }, h('h4', {}, 'Width'), h('div', { class: 'dr-row' }, widthIn, widthLbl)),
          h('div', { class: 'dr-group' }, h('h4', {}, 'Opacity'), h('div', { class: 'dr-row' }, opIn, opLbl)),
          h('label', { class: 'dr-check' }, fillBox, 'Fill shapes (tinted)'),
          h('p', { class: 'hint' }, 'Shortcuts: P pen · N pencil · B brush · H highlighter · L line · A arrow · R rectangle · O ellipse · E eraser · [ ] width')),
        wrap),
      h('div', { class: 'btn-row' }, h('span', { class: 'hint' }, 'Saved as a picture every e-reader, printer and Word can show. Your strokes are kept, so you can edit the drawing later.'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => save().catch((err) => toast(`Could not save the drawing: ${err.message || err}`, 'error')) }, existing ? 'Update Drawing' : 'Insert Drawing')));
    const overlay = h('div', { class: 'overlay' }, dlg);
    document.body.append(overlay);
    requestAnimationFrame(() => { overlay.classList.add('in'); layout(); });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', layout);
  });
}

function toolGlyph(id) {
  const paths = {
    pen: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z', pencil: 'M4 20l3-1 12-12-2-2L5 17l-1 3zM15 5l4 4', brush: 'M7 16c-2 0-3 2-3 4 2 0 4-1 4-3l9-11-2-2z',
    marker: 'M5 19h6M8 16l-3 3M9 15l8-8 3 3-8 8H9z', line: 'M5 19L19 5', arrow: 'M5 19L19 5M11 5h8v8', rect: 'M4 6h16v12H4z', ellipse: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z',
    eraser: 'M8 20h12M5 15l9-9 5 5-9 9H8l-3-3a1.4 1.4 0 0 1 0-2z',
  };
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('class', 'icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[id]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}
