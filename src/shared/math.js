// LaTeX equations. Written in the manuscript as $…$ (inline) or $$…$$
// (display) and converted with Temml to MathML, which the previews and PDF
// typeset natively. For readers without MathML (older Kindles, Nooks) and for
// Word, exporters rasterise the MathML to PNG images with the LaTeX as alt text.
import temml from 'temml';

export const MATH_FONT = { family: 'STIX Two Math', file: 'stix-two-math-latin-400-normal.woff2', pkg: 'stix-two-math' };

/** MathML for one equation. Never throws: errors come back as { error }. */
export function texToMathml(tex, display = false, { annotate = false } = {}) {
  const src = String(tex || '').slice(0, 5000);
  try {
    const out = temml.renderToString(src, { displayMode: display, annotate, throwOnError: true, trust: false, xml: true, colorIsTextColor: true });
    return { html: out.replace('<math ', `<math alttext="${escAttr(src)}" `) };
  } catch (err) {
    return { error: String(err?.message || err).replace(/^Temml parse error:\s*/i, ''), html: `<span class="bk-math-err" title="${escAttr(String(err?.message || err))}">${escText(src)}</span>` };
  }
}

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

/** Stable key for an equation (for image file names and caching). */
export function mathKey(tex, display) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = `${display ? 'D' : 'I'}:${tex}`;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

/** markdown-it inline rule for $…$ and $$…$$ (Pandoc's rules for single dollars). */
export function mathRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
  const display = src.charCodeAt(start + 1) === 0x24;
  const open = display ? 2 : 1;
  if (display) {
    const end = src.indexOf('$$', start + 2);
    if (end < 0) return false;
    const tex = src.slice(start + 2, end).trim();
    if (!tex) return false;
    if (!silent) { const t = state.push('math', '', 0); t.meta = { tex, display: true }; }
    state.pos = end + 2;
    return true;
  }
  const next = src.charAt(start + 1);
  if (!next || /\s/.test(next)) return false;
  let end = start + open;
  while ((end = src.indexOf('$', end)) >= 0) {
    if (src.charCodeAt(end - 1) === 0x5c /* \ */) { end++; continue; }
    if (/\s/.test(src.charAt(end - 1)) || /\d/.test(src.charAt(end + 1) || '')) return false;
    break;
  }
  if (end < 0) return false;
  const tex = src.slice(start + 1, end);
  if (!tex.trim() || /\n\s*\n/.test(tex)) return false;
  if (!silent) { const t = state.push('math', '', 0); t.meta = { tex, display: false }; }
  state.pos = end + 1;
  return true;
}

/** HTML for a math token. env.mathImage(tex, display) → { src, w, h, depth } switches to images. */
export function renderMathToken(meta, env = {}) {
  const { tex, display } = meta;
  if (env.mathImage) {
    const img = env.mathImage(tex, display);
    if (img) {
      const em = (px) => `${(px / img.scale).toFixed(3)}em`;
      const tag = `<img class="bk-math-img" src="${escAttr(img.src)}" alt="${escAttr(tex)}" style="height:${em(img.h)};vertical-align:-${em(img.depth)}" />`;
      return display ? `<span class="bk-math-d">${tag}</span>` : tag;
    }
  }
  const { html } = texToMathml(tex, display);
  return display ? `<span class="bk-math-d">${html}</span>` : `<span class="bk-math">${html}</span>`;
}

/** All distinct equations in a set of Markdown sources (uses a markdown-it instance). */
export function collectMath(md, sources) {
  const out = new Map();
  const walk = (tokens) => {
    for (const t of tokens) {
      if (t.type === 'math') out.set(mathKey(t.meta.tex, t.meta.display), t.meta);
      if (t.children) walk(t.children);
    }
  };
  for (const src of sources) walk(md.parse(String(src || ''), {}));
  return out;
}

export const MATH_CSS = (s = '') => `
${s} math{font-family:'STIX Two Math',math;font-style:normal;font-weight:normal;text-indent:0;text-transform:none;letter-spacing:normal;}
${s} .bk-math-d{display:block;text-align:center;margin:.8em 0;text-indent:0;}
${s} .bk-math-d math{display:block math;}
${s} .bk-math-img{display:inline;margin:0;}
${s} .bk-math-err{color:#b3261e;font-family:monospace;font-size:.9em;}
`;
