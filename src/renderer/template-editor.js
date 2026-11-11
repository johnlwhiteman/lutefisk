// Template designer: start from any design, change fonts, sizes, chapter
// heading style, ornaments, scene breaks and drop caps with a live preview,
// then save it to this book (and to My Templates for use in other books).
import { h, icon, setHtml, toast, confirmDialog } from './ui.js';
import { FONTS } from '../shared/fonts.js';
import { templateCss, baseCss, sanitizeTemplate, TEMPLATE_OPTIONS, setCustomTemplates } from '../shared/templates.js';

const LIB_KEY = 'lutefisk.myTemplates';
export const myTemplates = () => { try { return JSON.parse(localStorage.getItem(LIB_KEY) || '[]').map((t) => sanitizeTemplate(t)); } catch { return []; } };
const saveLibrary = (list) => { try { localStorage.setItem(LIB_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

const ORNAMENTS = ['', '❦', '❧', '✦', '✧', '⁂', '※', '❀', '✿', '★', '✶', '◆', '◇', '✠', '†', '§', '~', '—', '•', '·'];
const SCENES = ['* * *', '⁂', '❦', '✦ ✦ ✦', '· · ·', '◆', '—', '~', '§', '❧', '○ ○ ○', '— ◆ —'];
const LABELS = {
  numbering: { words: 'Chapter One', numeral: 'Chapter 1', roman: 'Chapter I', 'number-only': '1', 'roman-only': 'I', none: 'No number' },
  numCase: { smallcaps: 'Small capitals', upper: 'All capitals', none: 'As typed' },
  titleCase: { none: 'As typed', upper: 'All capitals' },
  align: { center: 'Centered', left: 'Left' },
  rule: { none: 'None', above: 'Line above', below: 'Line below', both: 'Lines above & below', double: 'Double lines' },
  dropcap: { drop: 'Dropped (3 lines)', raised: 'Raised (tall first letter)', none: 'None' },
  firstLine: { smallcaps: 'Small capitals', uppercase: 'All capitals', none: 'Normal' },
};
const SAMPLE = `<section class="bk-sec t-chapter dc"><header class="bk-head"><p class="bk-num">%NUM%</p><h1 class="bk-title">The Lantern Road</h1><div class="bk-orn" aria-hidden="true"></div></header><div class="bk-body"><p>Morning came slowly to the valley, spilling over the ridge like honey from a tipped jar. Mara had been awake for an hour already, listening to the house settle and the kettle tick as it cooled.</p><p>She packed the lantern anyway. Her grandmother had said it would be needed, and her grandmother had never once been wrong about weather, or roads, or people.</p><div class="bk-scene"><span></span></div><p>By noon the road had narrowed to a path, and the path to a suggestion.</p></div></section>`;

/** Open the designer. base: a template to start from; resolves when closed. */
export function openTemplateEditor(app, base, { onSaved } = {}) {
  const fontIds = FONTS.filter((f) => f.pkg && f.kind !== 'mono').map((f) => f.id);
  const isEdit = !!base.custom;
  const t = sanitizeTemplate({ ...base, id: isEdit ? base.id : undefined, name: isEdit ? base.name : `${base.name} (Custom)` }, fontIds);
  const style = h('style');
  const page = h('div', { class: 'bk tpl-designer' });
  const draw = () => {
    style.textContent = `${baseCss('.tpl-designer', 'device')}\n${templateCss(t, '.tpl-designer', { ctx: 'device', dropCaps: true, color: true })}`;
    const num = { words: 'Chapter Three', numeral: 'Chapter 3', roman: 'Chapter III', 'number-only': '3', 'roman-only': 'III', none: '' }[t.numbering];
    setHtml(page, SAMPLE.replace('%NUM%', num));
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
  const fontOpts = FONTS.filter((f) => fontIds.includes(f.id)).map((f) => [f.id, `${f.family}${f.note ? ` — ${f.note}` : ''}`]);
  const color = h('input', { type: 'color', value: t.accent });
  color.addEventListener('input', () => { t.accent = color.value; draw(); });
  const name = h('input', { type: 'text', value: t.name, maxlength: '60', 'aria-label': 'Template name' });
  name.addEventListener('input', () => { t.name = name.value; });

  const form = h('div', { class: 'td-form' },
    field('Name', name),
    h('h4', {}, 'Text'),
    field('Body font', sel('body', fontOpts)),
    field('Text size', range('scale', 0.7, 1.6, 0.01, (v) => `${Math.round(v * 100)}%`)),
    field('Line spacing', range('lh', 1.1, 2.2, 0.05, (v) => v.toFixed(2))),
    field('First-line indent', range('indent', 0, 4, 0.1, (v) => `${v.toFixed(1)} em`)),
    field('Space between paragraphs', range('gap', 0, 2, 0.1, (v) => `${v.toFixed(1)} em`)),
    check('justify', 'Justify text (straight right edge)'),
    h('h4', {}, 'Chapter openings'),
    field('Heading font', sel('head', fontOpts)),
    field('Alignment', sel('align', TEMPLATE_OPTIONS.align.map((v) => [v, LABELS.align[v]]))),
    field('Chapter number', sel('numbering', TEMPLATE_OPTIONS.numbering.map((v) => [v, LABELS.numbering[v]]))),
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
    field('Accent colour', color, 'Used for numbers, ornaments, scene breaks and drop caps in colour formats.'),
    h('h4', {}, 'Details'),
    field('Scene break', glyphPick('scene', SCENES)),
    field('Drop cap', sel('dropcap', TEMPLATE_OPTIONS.dropcap.map((v) => [v, LABELS.dropcap[v]]))),
    field('Opening line', sel('firstLine', TEMPLATE_OPTIONS.firstLine.map((v) => [v, LABELS.firstLine[v]])), 'Shown when “As the template designs it” is chosen in Book › Chapters.'));

  function save() {
    const clean = sanitizeTemplate({ ...t, name: t.name.trim() || 'My Template' }, fontIds);
    const b = app.book;
    b.customTemplates = [...(b.customTemplates || []).filter((x) => x.id !== clean.id), clean];
    saveLibrary([...myTemplates().filter((x) => x.id !== clean.id), clean]);
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
    h('h2', {}, icon('palette', 18), isEdit ? 'Edit Template' : 'New Template', h('small', { class: 'hint' }, isEdit ? '' : `based on ${base.name}`)),
    h('div', { class: 'td-cols' }, form, h('div', { class: 'td-preview' }, style, h('div', { class: 'td-page' }, page))),
    h('div', { class: 'btn-row' }, isEdit ? h('button', { class: 'btn plain danger', onclick: remove }, 'Delete Template') : null, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: save }, isEdit ? 'Save Template' : 'Create Template')));
  const overlay = h('div', { class: 'overlay' }, dlg);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('in'));
  document.addEventListener('keydown', onKey, true);
  draw();
}
