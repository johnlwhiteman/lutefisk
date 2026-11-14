// Template designer: start from any design, change fonts, sizes, chapter
// heading style, ornaments, scene breaks and drop caps with a live preview,
// then save it to this book (and to My Templates for use in other books).
import { h, icon, setHtml, toast, confirmDialog, assetUrl } from './ui.js';
import { FONTS } from '../shared/fonts.js';
import { templateCss, baseCss, sanitizeTemplate, TEMPLATE_OPTIONS, setCustomTemplates } from '../shared/templates.js';
import { markdownToPlain } from '../shared/markdown.js';
import { joinScenes } from '../shared/scenes.js';

const escHtml = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/**
 * Sample text from the book itself: the open chapter (or the first chapter with
 * text) — its title, subtitle and opening paragraphs. Null when there's no text yet.
 */
export function bookSample(app, { paras = 3, chars = 420 } = {}) {
  if (!app?.book) return null;
  const secs = app.sections ? app.sections() : [];
  const text = (sec) => (sec?.scenes?.length ? joinScenes(sec.scenes, app.contents, { all: true }) : app.contents?.[sec?.id]) || '';
  const pick = (sec) => (sec && text(sec).trim() ? sec : null);
  const cur = secs.find((x) => x.id === app.currentId || x.scenes?.some((sc) => sc.id === app.currentId));
  const sec = pick(cur && cur.type === 'chapter' ? cur : null) || secs.filter((x) => x.type === 'chapter').map(pick).find(Boolean);
  if (!sec) return null;
  const blocks = markdownToPlain(text(sec)).split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 1 && !/^[*\-_=#~`|]+$/.test(p));
  if (!blocks.length) return null;
  const clip = (p, n) => (p.length > n ? `${p.slice(0, n).replace(/\s+\S*$/, '')}…` : p);
  return { title: sec.displayTitle || sec.title || app.book.title || 'Chapter', subtitle: sec.subtitle || '', paras: blocks.slice(0, paras).map((p, i) => clip(p, i ? Math.round(chars / 2) : chars)), after: blocks[paras] ? clip(blocks[paras], 160) : '' };
}

const LIB_KEY = 'lutefisk.myTemplates';
export const myTemplates = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]').map((t) => sanitizeTemplate(t)); } catch { return []; } };
const saveLibrary = (list) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

const ORNAMENTS = ['', '❦', '❧', '✦', '✧', '⁂', '※', '❀', '✿', '★', '✶', '◆', '◇', '✠', '†', '§', '~', '—', '•', '·'];
const SCENES = ['* * *', '⁂', '❦', '✦ ✦ ✦', '· · ·', '◆', '—', '~', '§', '❧', '○ ○ ○', '— ◆ —'];
const LABELS = {
  numbering: { words: 'Chapter One', numeral: 'Chapter 1', roman: 'Chapter I', 'number-only': '1', 'roman-only': 'I', cjk: '第三章', 'cjk-only': '三' },
  heading: { both: 'Chapter number and title', title: 'Title only — no chapter number', number: 'Chapter number only — no title' },
  numCase: { smallcaps: 'Small capitals', upper: 'All capitals', none: 'As typed' },
  titleCase: { none: 'As typed', upper: 'All capitals' },
  align: { center: 'Centered', left: 'Left' },
  rule: { none: 'None', above: 'Line above', below: 'Line below', both: 'Lines above & below', double: 'Double lines' },
  dropcap: { drop: 'Dropped (3 lines)', raised: 'Raised (tall first letter)', none: 'None' },
  firstLine: { smallcaps: 'Small capitals', uppercase: 'All capitals', none: 'Normal' },
};
const SAMPLE = `<section class="bk-sec t-chapter dc"><header class="bk-head"><p class="bk-num">%NUM%</p><h1 class="bk-title">The Lantern Road</h1><div class="bk-orn" aria-hidden="true"></div></header><div class="bk-body"><p>Morning came slowly to the valley, spilling over the ridge like honey from a tipped jar. Mara had been awake for an hour already, listening to the house settle and the kettle tick as it cooled.</p><p>She packed the lantern anyway. Her grandmother had said it would be needed, and her grandmother had never once been wrong about weather, or roads, or people.</p><div class="bk-scene"><span></span></div><p>By noon the road had narrowed to a path, and the path to a suggestion.</p></div></section>`;

/** Open the designer. base: a template to start from; resolves when closed. */
export function openTemplateEditor(app, base, { onSaved, current = false, fresh = false } = {}) {
  const fontIds = FONTS.filter((f) => f.pkg && f.kind !== 'mono').map((f) => f.id);
  const isEdit = !!base.custom;
  // Remember where a template came from: a built-in design you changed, or a new one of your own.
  const origin = isEdit ? base.origin : fresh ? 'new' : 'changed';
  const t = sanitizeTemplate({ ...base, id: isEdit ? base.id : undefined, name: isEdit ? base.name : fresh ? 'My Template' : `${base.name} (Custom)`, baseId: isEdit ? base.baseId : base.id, baseName: isEdit ? base.baseName : base.name, origin }, fontIds);
  const style = h('style');
  const page = h('div', { class: 'bk tpl-designer' });
  const sample = bookSample(app); // your own words when the book has any
  const draw = () => {
    style.textContent = `${baseCss('.tpl-designer', 'device')}\n${templateCss(t, '.tpl-designer', { ctx: 'device', dropCaps: true, color: true })}`;
    if (t.numbering === 'none') { t.numbering = 'words'; t.heading = 'title'; }
    const num = { words: 'Chapter Three', numeral: 'Chapter 3', roman: 'Chapter III', 'number-only': '3', 'roman-only': 'III', cjk: '第三章', 'cjk-only': '三' }[t.numbering] || 'Chapter Three';
    let html = SAMPLE.replace('%NUM%', num);
    if (sample) {
      html = html.replace('<h1 class="bk-title">The Lantern Road</h1>', `<h1 class="bk-title">${escHtml(sample.title)}</h1>${sample.subtitle ? `<p class="bk-subtitle">${escHtml(sample.subtitle)}</p>` : ''}`)
        .replace(/<div class="bk-body">[\s\S]*<\/div><\/section>$/, `<div class="bk-body">${sample.paras.map((p) => `<p>${escHtml(p)}</p>`).join('')}${sample.after ? `<div class="bk-scene"><span></span></div><p>${escHtml(sample.after)}</p>` : ''}</div></section>`);
    }
    if (t.ornamentImg && (t.ornamentData || app.book)) html = html.replace('<div class="bk-orn" aria-hidden="true"></div>', `<div class="bk-orn bk-orn-pic" aria-hidden="true"><img src="${t.ornamentData || assetUrl(t.ornamentImg)}" alt=""></div>`);
    if (t.heading === 'title') html = html.replace(/<p class="bk-num">[^<]*<\/p>/, '');
    if (t.heading === 'number') html = html.replace(/<h1 class="bk-title">[^<]*<\/h1>/, '');
    setHtml(page, html);
    numberField.style.opacity = t.heading === 'title' ? '.45' : '';
  };
  const field = (label, control, hint) => h('label', { class: 'td-field' }, h('span', {}, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
  const sel = (key, options) => {
    const s = h('select', {}, options.map(([v, l]) => h('option', { value: v }, l)));
    s.value = String(t[key]);
    s.addEventListener('change', () => { t[key] = s.value; draw(); });
    return s;
  };
  const range = (key, min, max, step, fmt = (v) => v) => {
    const r = h('input', { type: 'range', min, max, step, value: String(t[key]) });
    const out = h('span', { class: 'td-val' }, fmt(t[key]));
    r.addEventListener('input', () => { t[key] = Number(r.value); out.textContent = fmt(t[key]); draw(); });
    return h('span', { class: 'td-range' }, r, out);
  };
  const check = (key, label) => {
    const c = h('input', { type: 'checkbox', checked: !!t[key] });
    c.addEventListener('change', () => { t[key] = c.checked; draw(); });
    return h('label', { class: 'td-check' }, c, label);
  };
  const glyphPick = (key, list) => {
    const input = h('input', { type: 'text', value: t[key], maxlength: '16', class: 'td-glyph-in' });
    input.addEventListener('input', () => { t[key] = input.value.replace(/[<>\\]/g, ''); draw(); });
    return h('div', { class: 'td-glyphs' }, list.map((g) => h('button', { type: 'button', class: 'td-glyph', title: g || 'None', onclick: () => { t[key] = g; input.value = g; draw(); } }, g || '∅')), input);
  };
  /* ---- picture ornament: any image, stored in the book's assets as PNG or JPEG */
  const picName = h('span', { class: 'td-pic-name' });
  const picThumb = h('img', { class: 'td-pic-thumb', alt: '' });
  const picRemove = h('button', { type: 'button', class: 'btn small plain', onclick: () => { t.ornamentImg = ''; delete t.ornamentData; drawPic(); draw(); } }, 'Remove');
  const picWidth = range('ornamentImgW', 1, 20, 0.5, (v) => `${v} em`);
  const picWidthRow = h('div', { class: 'td-pic-w' }, field('Picture width', picWidth));
  const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml', hidden: true });
  const drawPic = () => {
    const on = !!t.ornamentImg;
    picThumb.hidden = !on; picRemove.hidden = !on; picWidthRow.hidden = !on;
    if (on) picThumb.src = t.ornamentData || assetUrl(t.ornamentImg);
    picName.textContent = on ? '' : 'Use a picture instead of a character — a flourish, a drawing, a logo.';
  };
  fileIn.addEventListener('change', async () => {
    const file = fileIn.files?.[0];
    fileIn.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast('That picture is too large (8 MB at most)', 'error'); return; }
    try {
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Couldn’t read the file')); r.readAsDataURL(file); });
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not an image Lutefisk can read')); i.src = url; });
      const k = Math.min(1, 800 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.naturalWidth || 300) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || 100) * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL('image/png');
      const bytes = Uint8Array.from(atob(png.split(',')[1]), (ch) => ch.charCodeAt(0));
      t.ornamentImg = await window.lutefisk.writeImage({ name: `ornament-${(t.name || 'template').toLowerCase()}`, data: bytes });
      t.ornamentData = png;
      drawPic(); draw();
    } catch (err) { toast(String(err.message || err), 'error'); }
  });
  const picField = h('div', { class: 'td-pic' }, picThumb, picName,
    h('button', { type: 'button', class: 'btn small', onclick: () => fileIn.click() }, icon('image', 14), 'Choose Picture…'), picRemove, fileIn);
  const fontOpts = FONTS.filter((f) => fontIds.includes(f.id)).map((f) => [f.id, `${f.family}${f.note ? ` — ${f.note}` : ''}`]);
  const color = h('input', { type: 'color', value: t.accent });
  color.addEventListener('input', () => { t.accent = color.value; draw(); });
  const name = h('input', { type: 'text', value: t.name, maxlength: '60', 'aria-label': 'Template name' });
  name.addEventListener('input', () => { t.name = name.value; });

  const numberField = field('Chapter number', sel('numbering', TEMPLATE_OPTIONS.numbering.filter((v) => v !== 'none').map((v) => [v, LABELS.numbering[v]])));
  const form = h('div', { class: 'td-form' },
    field('Name', name),
    h('h4', {}, 'Text'),
    field('Chapter heading', sel('heading', TEMPLATE_OPTIONS.heading.map((v) => [v, LABELS.heading[v]])), 'Books using this template can still choose differently in Book › Chapters.'),
    field('Drop cap', sel('dropcap', TEMPLATE_OPTIONS.dropcap.map((v) => [v, LABELS.dropcap[v]]))),
    field('Opening line', sel('firstLine', TEMPLATE_OPTIONS.firstLine.map((v) => [v, LABELS.firstLine[v]])), 'Shown when “As the template designs it” is chosen in Book › Chapters.'),
    field('Body font', sel('body', fontOpts)),
    field('Text size', range('scale', 0.7, 1.6, 0.01, (v) => `${Math.round(v * 100)}%`)),
    field('Line spacing', range('lh', 1.1, 2.2, 0.05, (v) => v.toFixed(2))),
    field('First-line indent', range('indent', 0, 4, 0.1, (v) => `${v.toFixed(1)} em`)),
    field('Space between paragraphs', range('gap', 0, 2, 0.1, (v) => `${v.toFixed(1)} em`)),
    check('justify', 'Justify text (straight right edge)'),
    h('h4', {}, 'Chapter openings'),
    field('Heading font', sel('head', fontOpts)),
    field('Alignment', sel('align', TEMPLATE_OPTIONS.align.map((v) => [v, LABELS.align[v]]))),
    numberField,
    field('Number style', sel('numCase', TEMPLATE_OPTIONS.numCase.map((v) => [v, LABELS.numCase[v]]))),
    field('Number size', range('numSize', 0.6, 6, 0.05, (v) => `${v.toFixed(2)}×`)),
    field('Title size', range('titleSize', 0.8, 3.5, 0.05, (v) => `${v.toFixed(2)}×`)),
    field('Title weight', range('titleWeight', 100, 900, 100, (v) => ({ 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' })[v])),
    check('titleItalic', 'Italic title'),
    field('Title style', sel('titleCase', TEMPLATE_OPTIONS.titleCase.map((v) => [v, LABELS.titleCase[v]]))),
    field('Letter spacing', range('tracking', 0, 0.5, 0.01, (v) => `${v.toFixed(2)} em`)),
    field('Space above heading', range('sink', 0, 14, 0.5, (v) => `${v} lines`)),
    field('Rules', sel('rule', TEMPLATE_OPTIONS.rule.map((v) => [v, LABELS.rule[v]]))),
    field('Ornament under the title', glyphPick('ornament', ORNAMENTS)),
    field('…or a picture', picField),
    picWidthRow,
    field('Accent color', color, 'Used for numbers, ornaments, scene breaks and drop caps in color formats.'),
    h('h4', {}, 'Details'),
    field('Scene break', glyphPick('scene', SCENES)));

  function save() {
    const clean = sanitizeTemplate({ ...t, name: t.name.trim() || 'My Template' }, fontIds);
    const b = app.book;
    const { ornamentData, ...forBook } = clean; // the picture itself lives in the book's assets folder
    void ornamentData;
    b.customTemplates = [...(b.customTemplates || []).filter((x) => x.id !== clean.id), forBook];
    try { saveLibrary([...myTemplates().filter((x) => x.id !== clean.id), clean]); } catch { saveLibrary([...myTemplates().filter((x) => x.id !== clean.id), forBook]); }
    setCustomTemplates(b.customTemplates);
    b.template = clean.id;
    app.markDirty(); app.refreshAll();
    toast(`Template “${clean.name}” saved`, 'ok');
    close(); onSaved?.(clean);
  }
  async function remove() {
    if (!(await confirmDialog(`Delete “${t.name}”?`, 'It is removed from this book and from My Templates. Books using it switch to Classic.'))) return;
    const b = app.book;
    b.customTemplates = (b.customTemplates || []).filter((x) => x.id !== t.id);
    saveLibrary(myTemplates().filter((x) => x.id !== t.id));
    setCustomTemplates(b.customTemplates);
    if (b.template === t.id) b.template = 'classic';
    app.markDirty(); app.refreshAll();
    close(); onSaved?.(null);
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const dlg = h('div', { class: 'dlg td-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Template designer' },
    h('button', { class: 'btn small plain td-all', title: 'Show All Templates — browse every design and choose another (unsaved changes here are discarded)', onclick: () => { close(); app.openTemplates?.(); } }, icon('arrowLeft', 14), 'Show All Templates'),
    h('h2', {}, icon('palette', 18), current ? `Current Template — ${base.name}` : isEdit ? 'Edit Template' : 'New Template', h('small', { class: 'hint' }, current && !isEdit ? 'Built-in designs stay as they are; your changes are saved as your own copy, used by this book.' : isEdit ? '' : `based on ${base.name}`)),
    h('div', { class: 'td-cols' }, form, h('div', { class: 'td-preview' }, style, h('div', { class: 'td-page' }, page))),
    h('div', { class: 'btn-row' }, isEdit ? h('button', { class: 'btn plain danger', onclick: remove }, 'Delete Template') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: save }, isEdit || current ? 'Save Template' : 'Create Template')));
  const overlay = h('div', { class: 'overlay' }, dlg);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  document.addEventListener('keydown', onKey, true);
  drawPic();
  draw();
}
