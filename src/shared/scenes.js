// Scenes: a chapter can optionally be split into separately-edited scenes.
// The chapter's text is always the scenes joined with scene breaks, so every
// renderer and exporter keeps working with one Markdown string per chapter.
import { extractFootnotes, parseMarkdown } from './markdown.js';

const BREAK_LINE = /^\s{0,3}(?:\*\s*\*\s*\*[\s*]*|-\s*-\s*-[\s-]*|_\s*_\s*_[\s_]*)$/;

/** Give each scene's footnote labels a unique prefix so they never collide. */
function relabel(md, prefix) {
  return md.replace(/\[\^([^\]\s]+)\]/g, (_m, l) => `[^${prefix}${l}]`);
}

/** Chapter Markdown built from its scenes. */
/** Chapter Markdown from its scenes. Scenes marked `exclude` are left out unless `all`. */
export function joinScenes(scenes, contents, { all = false } = {}) {
  const parts = (scenes || []).map((sc, i) => (!all && sc.exclude ? '' : relabel(String(contents[sc.id] || '').trim(), `s${i + 1}-`))).filter(Boolean);
  return parts.length ? `${parts.join('\n\n* * *\n\n')}\n` : '';
}

/** Split chapter Markdown at its scene breaks. Footnotes travel with the scene that cites them. */
export function splitAtBreaks(md) {
  const { body, defs } = extractFootnotes(md);
  const chunks = [[]];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && BREAK_LINE.test(line)) chunks.push([]);
    else chunks[chunks.length - 1].push(line);
  }
  return chunks.map((c) => c.join('\n').trim()).filter((t, i, all) => t || all.length === 1).map((text) => {
    const used = [...new Set([...text.matchAll(/\[\^([^\]\s]+)\]/g)].map((m) => m[1]))];
    const notes = used.filter((l) => defs.has(l)).map((l) => `[^${l}]: ${defs.get(l)}`);
    return `${text}${notes.length ? `\n\n${notes.join('\n')}` : ''}\n`;
  });
}

/** Number of top-level blocks Markdown renders to (for caret tracking across scenes). */
export function countBlocks(md) {
  const { tokens } = parseMarkdown(md || '');
  return tokens.filter((t) => t.level === 0 && (t.nesting === 1 || t.type === 'hr' || t.type === 'fence' || t.type === 'code_block')).length;
}

/** First words of a scene, for untitled scene labels. */
/** Plain prose words only: no images, drawings, equations, code, tables, citations, footnote marks or comments. */
export function proseText(md) {
  const parts = [];
  let inTable = 0;
  for (const tok of parseMarkdown(String(md || '')).tokens) {
    if (tok.type === 'table_open') inTable++;
    else if (tok.type === 'table_close') inTable--;
    if (tok.type !== 'inline' || inTable) continue;
    const t = (tok.children || []).map((c) => (c.type === 'text' ? c.content : c.type === 'softbreak' || c.type === 'hardbreak' ? ' ' : '')).join('');
    if (t.trim()) parts.push(t.trim());
  }
  return parts.join(' ').replace(/[([]\s*(?:see|cf\.?|e\.g\.,?)?\s*[)\]]/gi, '').replace(/\s+([.,;:!?…])/g, '$1').replace(/\s+/g, ' ').trim();
}

export function sceneSnippet(md, words = 6) {
  const text = proseText(md);
  const w = text.split(' ').filter(Boolean);
  return w.length ? w.slice(0, words).join(' ') + (w.length > words ? '…' : '') : '';
}
