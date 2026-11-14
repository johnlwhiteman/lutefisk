// LaTeX equation editor: type LaTeX, see it typeset live, choose inline or
// display, and insert. The right-hand panel has a full symbol palette and a
// searchable reference (new lines, alignment, matrices, brackets…).
import { h, icon, setHtml } from './ui.js';
import { texToMathml } from '../shared/math.js';
import { LATEX_SYMBOLS, LATEX_REFERENCE } from '../shared/latex-reference.js';

const SNIPPETS = [
  ['Fraction', '\\frac{a}{b}'], ['Root', '\\sqrt{x}'], ['Power', 'x^{2}'], ['Subscript', 'x_{i}'],
  ['Sum', '\\sum_{i=1}^{n} '], ['Integral', '\\int_{a}^{b} f(x)\\,dx'], ['New line', ' \\\\ '],
  ['Aligned', '\\begin{aligned} a &= b \\\\ &= c \\end{aligned}'], ['Matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
  ['Cases', '\\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}'], ['Text', '\\text{ words }'],
];
const mathml = new Map();
const render = (tex, display = false) => {
  const k = `${display ? 'D' : 'I'}${tex}`;
  if (!mathml.has(k)) mathml.set(k, texToMathml(tex, display).html);
  return mathml.get(k);
};

/** Resolves to { tex, display }, { remove: true } or null if canceled. */
export function openMathDialog({ tex = '', display = false, isEdit = false } = {}) {
  return new Promise((resolve) => {
    const ta = h('textarea', { class: 'math-src', rows: 5, spellcheck: 'false', placeholder: 'e.g.  E = mc^2   or   \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'aria-label': 'LaTeX source' });
    ta.value = tex;
    let mode = display ? 'display' : 'inline';
    const preview = h('div', { class: 'math-preview', 'aria-live': 'polite' });
    const err = h('div', { class: 'math-err', role: 'status' });
    const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Layout' });
    const setMode = (v) => { mode = v; for (const b of seg.children) b.classList.toggle('on', b.dataset.v === v); draw(); };
    for (const [v, label] of [['inline', 'Inline — in the sentence'], ['display', 'Display — on its own line']]) {
      seg.append(h('button', { type: 'button', role: 'radio', 'data-v': v, class: v === mode ? 'on' : '', onclick: () => setMode(v) }, h('span', {}, label)));
    }
    const insert = (s, { select } = {}) => {
      const a = ta.selectionStart, b = ta.selectionEnd;
      ta.setRangeText(s, a, b, 'end');
      // Put the caret inside the first {…} placeholder so the author can type straight away.
      if (select) { const m = /\{([a-z])\}/i.exec(s); if (m) { const p = a + m.index + 1; ta.setSelectionRange(p, p + 1); } }
      ta.focus();
      if (/\\\\|\\begin\{(aligned|align|gathered|gather|multline|cases|array|[pbBvV]?matrix)/.test(ta.value) && mode === 'inline' && /\\\\|\\begin/.test(s)) setMode('display');
      draw();
    };
    const draw = () => {
      const src = ta.value.trim();
      if (!src) { preview.replaceChildren(h('span', { class: 'hint' }, 'Your equation will appear here.')); err.textContent = ''; okBtn.disabled = true; return; }
      const r = texToMathml(src, mode === 'display');
      setHtml(preview, r.html);
      preview.classList.toggle('display', mode === 'display');
      err.textContent = r.error ? `⚠ ${r.error}` : '';
      okBtn.disabled = !!r.error;
    };
    ta.addEventListener('input', draw);

    /* ---- right panel: symbols & reference */
    let tab = 'symbols';
    const q = h('input', { type: 'search', class: 'ref-search', placeholder: 'Search symbols and how-tos: new line, matrix, arrow, alpha…', 'aria-label': 'Search LaTeX reference' });
    const tabs = h('div', { class: 'segmented ref-tabs', role: 'tablist' });
    const body = h('div', { class: 'ref-body' });
    const setTab = (t) => { tab = t; for (const b of tabs.children) b.classList.toggle('on', b.dataset.v === t); drawRef(); };
    for (const [v, label] of [['symbols', 'Symbols'], ['reference', 'Reference']]) tabs.append(h('button', { type: 'button', role: 'tab', 'data-v': v, class: v === tab ? 'on' : '', onclick: () => setTab(v) }, label));
    const symBtn = (s) => {
      const b = h('button', { type: 'button', class: 'sym', title: `${s.name} — ${s.tex}`, onclick: () => insert(/\{[a-z]+\}/i.test(s.tex) ? s.tex : `${s.tex}${/^\\[a-zA-Z]+$/.test(s.tex) ? ' ' : ''}`, { select: true }) });
      setHtml(b, render(s.tex));
      return b;
    };
    const refCard = (r) => {
      const out = h('div', { class: 'ref-out' });
      setHtml(out, render(r.code, r.display));
      return h('article', { class: 'ref-card' },
        h('div', { class: 'ref-top' }, h('b', {}, r.title), h('small', {}, r.cat)),
        r.desc ? h('p', {}, r.desc) : null,
        out,
        h('div', { class: 'ref-code' }, h('code', {}, r.code), h('button', { type: 'button', class: 'btn small', onclick: () => { if (r.display && mode === 'inline') setMode('display'); insert(r.code); } }, 'Insert')));
    };
    function drawRef() {
      const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const match = (text) => words.every((w) => text.toLowerCase().includes(w));
      if (tab === 'symbols') {
        const groups = LATEX_SYMBOLS.map((c) => ({ c, items: words.length ? c.items.filter((s) => match(`${s.name} ${s.tex} ${c.label}`)) : c.items })).filter((g) => g.items.length);
        body.replaceChildren(...groups.map(({ c, items }) => h('section', { class: 'ref-sym-group' }, h('h4', {}, c.label), h('div', { class: 'math-syms' }, items.map(symBtn)))));
        if (!groups.length) body.append(h('p', { class: 'hint' }, 'No symbols match. Try the Reference tab.'));
      } else {
        const list = LATEX_REFERENCE.filter((r) => !words.length || match(`${r.title} ${r.desc} ${r.cat} ${r.keywords} ${r.code}`));
        const cats = [...new Set(list.map((r) => r.cat))];
        body.replaceChildren(...cats.map((c) => h('section', { class: 'ref-group' }, h('h4', {}, c), ...list.filter((r) => r.cat === c).map(refCard))));
        if (!list.length) body.append(h('p', { class: 'hint' }, 'Nothing found. Try “line”, “align”, “matrix” or “bracket”.'));
      }
      body.scrollTop = 0;
    }
    q.addEventListener('input', () => {
      // Searching for how-to words jumps to the reference automatically.
      if (tab === 'symbols' && q.value.trim() && !LATEX_SYMBOLS.some((c) => c.items.some((s) => `${s.name} ${s.tex} ${c.label}`.toLowerCase().includes(q.value.trim().toLowerCase())))) setTab('reference');
      else drawRef();
    });

    const close = (val) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(val); };
    const okBtn = h('button', { class: 'btn primary', onclick: () => { const t = ta.value.trim(); close(t ? { tex: t, display: mode === 'display' } : null); } }, isEdit ? 'Update Equation' : 'Insert Equation');
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!okBtn.disabled) okBtn.click(); }
    };
    const removeBtn = isEdit ? h('button', { class: 'btn plain danger', onclick: () => close({ remove: true }) }, 'Remove') : null;
    const left = h('div', { class: 'math-left' },
      h('label', { class: 'fld' }, h('span', {}, 'LaTeX'), ta),
      h('div', { class: 'math-snips' }, SNIPPETS.map(([label, s]) => h('button', { type: 'button', class: 'chip', title: s, onclick: () => insert(s, { select: true }) }, label))),
      h('div', { class: 'fld' }, h('span', {}, 'Preview'), preview, err),
      seg,
      h('details', { class: 'math-how' }, h('summary', {}, 'How equations reach each device'),
        h('ul', {},
          h('li', {}, h('b', {}, 'Preview, print and PDF: '), 'typeset sharply with the STIX Two Math font.'),
          h('li', {}, h('b', {}, 'EPUB: '), 'converted to images by default, so every reader shows them — Kindle (including older models), Nook, Kobo and Apple Books. Or choose MathML in Book › General for searchable, scalable equations on Apple Books, Kobo, Google Play Books and Kindle with Enhanced Typesetting.'),
          h('li', {}, h('b', {}, 'Word: '), 'inserted as images.'),
          h('li', {}, h('b', {}, 'Accessibility: '), 'your LaTeX is kept as the alt text, so screen readers can read it.'),
          h('li', {}, h('b', {}, 'Markdown: '), 'kept as $…$ and $$…$$, the format Pandoc and most Markdown tools read.'))),
      h('div', { class: 'btn-row' }, removeBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel'), okBtn));
    const right = h('div', { class: 'math-right' }, h('div', { class: 'ref-head' }, tabs, q), body);
    const dlg = h('div', { class: 'dlg math-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Equation' },
      h('h2', {}, icon('sigma', 18), isEdit ? 'Edit Equation' : 'Insert Equation', h('span', { class: 'hint math-kbd' }, '⌘/Ctrl+Enter to insert · Esc to cancel')),
      h('div', { class: 'math-cols' }, left, right));
    const overlay = h('div', { class: 'overlay' }, dlg);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    document.addEventListener('keydown', onKey, true);
    draw();
    drawRef();
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
  });
}
