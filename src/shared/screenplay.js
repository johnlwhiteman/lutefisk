// Screenplay formatting and pagination, following standard industry layout:
// Courier 12 pt (10 characters per inch, 6 lines per inch), 1.5" left margin,
// fixed indents per element, ~1 page per minute, (MORE)/(CONT'D) for
// dialogue that breaks across pages, and keep-together rules.
import { parseInline, plain } from './fountain.js';

export const FORMATS = {
  feature: { id: 'feature', label: 'Feature Film (US Letter)', w: 8.5, h: 11, top: 1, bottom: 1, left: 1.5, right: 1, lines: 54 },
  'feature-a4': { id: 'feature-a4', label: 'Feature Film (A4)', w: 8.27, h: 11.69, top: 1, bottom: 1, left: 1.5, right: 0.77, lines: 58 },
  tv: { id: 'tv', label: 'TV Drama, One Hour (US Letter)', w: 8.5, h: 11, top: 1, bottom: 1, left: 1.5, right: 1, lines: 54, acts: true },
};
export const formatById = (id) => FORMATS[id] || FORMATS.feature;

// Indent/width in characters from the left text margin (1 char = 0.1").
export const SPECS = {
  scene: { indent: 0, width: 60, before: 1, upper: true },
  action: { indent: 0, width: 60, before: 1 },
  character: { indent: 20, width: 38, before: 1, upper: true },
  paren: { indent: 15, width: 25, before: 0 },
  dialogue: { indent: 10, width: 35, before: 0 },
  lyric: { indent: 10, width: 35, before: 0, italic: true },
  transition: { indent: 40, width: 20, before: 1, upper: true, align: 'right' },
  shot: { indent: 0, width: 60, before: 1, upper: true },
  centered: { indent: 0, width: 60, before: 1, align: 'center' },
  act: { indent: 0, width: 60, before: 1, upper: true, align: 'center', underline: true },
};
export const ELEMENT_LABELS = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue',
  transition: 'Transition', shot: 'Shot', centered: 'Centered', act: 'Act Break', lyric: 'Lyrics', section: 'Section', synopsis: 'Synopsis',
};

/** Word-wrap inline runs into lines of at most `width` characters. */
export function wrapRuns(runs, width) {
  const lines = [];
  for (const para of splitRunsByNewline(runs)) {
    let line = [];
    let len = 0;
    const tokens = [];
    for (const r of para) for (const tok of r.text.split(/(\s+)/)) if (tok) tokens.push({ ...r, text: tok });
    for (const t of tokens) {
      const space = /^\s+$/.test(t.text);
      if (space) { if (len && len < width) { line.push({ ...t, text: ' ' }); len += 1; } continue; }
      let word = t.text;
      while (word.length > width) { // hard-split very long words
        if (len) { lines.push(trimLine(line)); line = []; len = 0; }
        lines.push([{ ...t, text: word.slice(0, width) }]);
        word = word.slice(width);
      }
      if (len + word.length > width) { lines.push(trimLine(line)); line = []; len = 0; }
      line.push({ ...t, text: word });
      len += word.length;
    }
    lines.push(trimLine(line));
  }
  return lines.length ? lines : [[]];
}
function splitRunsByNewline(runs) {
  const paras = [[]];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((p, i) => { if (i) paras.push([]); if (p) paras[paras.length - 1].push({ ...r, text: p }); });
  }
  return paras;
}
function trimLine(line) {
  while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
  return line;
}
const lineLen = (runs) => runs.reduce((n, r) => n + r.text.length, 0);
const upperRuns = (runs) => runs.map((r) => ({ ...r, text: r.text.toUpperCase() }));

function part(type, runs, extra = {}) {
  const s = SPECS[type] || SPECS.action;
  let indent = extra.indent ?? s.indent;
  const width = extra.width ?? s.width;
  if (s.align === 'right') indent = /^FADE IN/i.test(runs.map((r) => r.text).join('')) ? 0 : indent + width - lineLen(runs);
  if (s.align === 'center') indent = Math.max(0, Math.floor((60 - lineLen(runs)) / 2));
  return { indent, runs: s.italic || s.underline ? runs.map((r) => ({ ...r, i: r.i || s.italic, u: r.u || s.underline })) : runs, type };
}

function elementLines(e, extra = {}) {
  const s = SPECS[e.type] || SPECS.action;
  let runs = parseInline(e.text);
  if (s.upper) runs = upperRuns(runs);
  if (e.type === 'paren') {
    const t = plain(e.text).trim();
    if (!/^\(/.test(t)) runs = [{ text: '(' }, ...runs];
    if (!/\)$/.test(t)) runs = [...runs, { text: ')' }];
  }
  return wrapRuns(runs, extra.width ?? s.width).map((r) => part(e.type, r, extra));
}

/** Character names spoken, normalised (extensions removed). */
export const charName = (t) => plain(t).toUpperCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\^$/, '').trim();

/**
 * Lay out a script into pages.
 * opts: { format, sceneNumbers, contd (auto CONT'D), moreContd (MORE/CONT'D at breaks), doubleSpaceScenes }
 * Returns { pages: [{ number, lines: [{ row, parts }] }], elementPage: [], sceneNumbers: Map, fmt }
 */
export function layoutScript(elements, opts = {}) {
  const fmt = formatById(opts.format);
  const L = fmt.lines;
  const blocks = [];
  let sceneNo = 0;
  const sceneNumbers = new Map();
  let lastSpeaker = null;

  // Build blocks (dialogue groups are kept together for break rules).
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i];
    if (e.type === 'section' || e.type === 'synopsis') continue;
    if (e.type === 'pagebreak') { blocks.push({ type: 'pagebreak', idx: i }); continue; }
    if (e.type === 'scene') { sceneNo++; sceneNumbers.set(i, e.number || String(sceneNo)); lastSpeaker = null; }
    if (e.type === 'character') {
      // collect the dialogue group (and an optional dual partner)
      const grp = [i];
      let j = i + 1;
      while (j < elements.length && ['paren', 'dialogue', 'lyric'].includes(elements[j].type)) grp.push(j++);
      let dual = null;
      if (j < elements.length && elements[j].type === 'character' && elements[j].dual) {
        dual = [j];
        let k = j + 1;
        while (k < elements.length && ['paren', 'dialogue', 'lyric'].includes(elements[k].type)) dual.push(k++);
        j = k;
      }
      const name = charName(e.text);
      let label = e.text;
      if (opts.contd !== false && lastSpeaker === name && !/CONT['’]D/i.test(e.text)) label = `${plain(e.text).trim()} (CONT'D)`;
      lastSpeaker = dual ? charName(elements[dual[0]].text) : name;
      if (dual) {
        const left = groupLines(elements, grp, label, { col: 'left' });
        const right = groupLines(elements, dual, elements[dual[0]].text, { col: 'right' });
        const rows = Math.max(left.length, right.length);
        const lines = [];
        for (let r = 0; r < rows; r++) lines.push([...(left[r] ? [left[r]] : []), ...(right[r] ? [right[r]] : [])]);
        blocks.push({ type: 'dual', idx: i, lines, before: 1, name, rows: lines.map(() => i) });
      } else {
        const lines = groupLines(elements, grp, label, {});
        blocks.push({ type: 'dialogue', idx: i, lines: lines.map((p) => [p]), before: 1, name, owners: lines.map((p) => p.owner) });
      }
      i = j - 1;
      continue;
    }
    const s = SPECS[e.type] || SPECS.action;
    const lines = elementLines(e).map((p) => [p]);
    let before = s.before;
    if (e.type === 'scene' && opts.doubleSpaceScenes) before = 2;
    blocks.push({ type: e.type, idx: i, lines, before, num: e.type === 'scene' ? sceneNumbers.get(i) : null });
  }

  function groupLines(els, idxs, label, { col }) {
    const out = [];
    const dualW = { character: { indent: col === 'right' ? 42 : 10, width: 18 }, paren: { indent: col === 'right' ? 34 : 3, width: 22 }, dialogue: { indent: col === 'right' ? 31 : 0, width: 28 }, lyric: { indent: col === 'right' ? 31 : 0, width: 28 } };
    idxs.forEach((k, n) => {
      const e = els[k];
      const extra = col ? dualW[e.type] || {} : {};
      const lines = elementLines(n === 0 ? { ...e, text: label } : e, extra);
      for (const p of lines) out.push({ ...p, owner: k });
    });
    return out;
  }

  // Paginate.
  const pages = [];
  let rows = [];
  const elementPage = new Array(elements.length).fill(0);
  const elementRows = new Array(elements.length).fill(0);
  const newPage = () => { pages.push({ number: pages.length + 1, lines: rows }); rows = []; };
  const place = (parts, owner) => { rows.push({ row: rows.length, parts }); if (owner != null) { elementRows[owner]++; if (!elementPage[owner]) elementPage[owner] = pages.length + 1; } };
  const room = () => L - rows.length;

  for (let b = 0; b < blocks.length; b++) {
    const blk = blocks[b];
    if (blk.type === 'pagebreak') { if (rows.length) newPage(); continue; }
    if (fmt.acts && blk.type === 'act' && /^(ACT|TEASER|COLD OPEN|TAG)/i.test(plain(elements[blk.idx].text)) && rows.length) newPage();
    const spacing = rows.length ? blk.before : 0;
    const n = blk.lines.length;
    // keep scene headings / shots with at least two lines of what follows
    const next = blocks[b + 1];
    const keepWith = ['scene', 'shot'].includes(blk.type) && next && next.type !== 'pagebreak' ? Math.min(2, next.lines.length) + (next.before || 0) : 0;
    if (spacing + n + keepWith <= room()) {
      for (let s = 0; s < spacing; s++) place([]);
      blk.lines.forEach((parts, k) => place(numbered(blk, parts, k), blk.owners ? blk.owners[k] : blk.idx));
      continue;
    }
    const avail = room() - spacing;
    if (blk.type === 'dialogue' && opts.moreContd !== false) {
      // Split at a dialogue line, leaving char + ≥2 lines here and room for (MORE).
      const owners = blk.owners;
      let k = Math.min(n - 1, avail - 1);
      const minKeep = 1 + Math.min(2, n - 1);
      while (k >= minKeep && elements[owners[k - 1]].type !== 'dialogue') k--;
      // prefer a sentence end
      let best = -1;
      for (let x = k; x >= minKeep; x--) {
        if (elements[owners[x - 1]].type !== 'dialogue') continue;
        const txt = blk.lines[x - 1][0].runs.map((r) => r.text).join('');
        if (/[.!?…]["”’)]?$/.test(txt)) { best = x; break; }
      }
      if (best < 0) best = k >= minKeep && elements[owners[k - 1]]?.type === 'dialogue' ? k : -1;
      if (best >= minKeep && n - best >= 1) {
        for (let s = 0; s < spacing; s++) place([]);
        blk.lines.slice(0, best).forEach((parts, x) => place(parts, owners[x]));
        place([part('character', [{ text: '(MORE)' }])]);
        newPage();
        const name = plain(elements[blk.idx].text).toUpperCase().replace(/\s*\(CONT['’]D\)\s*$/i, '');
        place([part('character', [{ text: `${name} (CONT'D)` }])]);
        blk.lines.slice(best).forEach((parts, x) => place(parts, owners[best + x]));
        continue;
      }
    }
    if (blk.type === 'action' && avail >= 2 && n - avail >= 2) {
      let k = avail;
      for (let x = avail; x >= 2; x--) {
        const txt = blk.lines[x - 1][0].runs.map((r) => r.text).join('');
        if (/[.!?…]["”’)]?$/.test(txt)) { k = x; break; }
      }
      for (let s = 0; s < spacing; s++) place([]);
      blk.lines.slice(0, k).forEach((parts) => place(parts, blk.idx));
      newPage();
      blk.lines.slice(k).forEach((parts) => place(parts, blk.idx));
      continue;
    }
    if (rows.length) newPage();
    blk.lines.forEach((parts, k) => place(numbered(blk, parts, k), blk.owners ? blk.owners[k] : blk.idx));
  }
  if (rows.length || !pages.length) newPage();
  // Elements that produced no lines (sections, synopses) inherit the next page.
  for (let i = elements.length - 1, last = pages.length; i >= 0; i--) { if (elementPage[i]) last = elementPage[i]; else elementPage[i] = last; }
  return { pages, elementPage, elementRows, sceneNumbers, fmt };

  function numbered(blk, parts, k) {
    if (blk.type === 'scene' && opts.sceneNumbers && k === 0) return parts.map((p) => ({ ...p, sceneNo: blk.num }));
    return parts;
  }
}

/* --------------------------------------------------------------- HTML out */

const escH = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function runsHtml(runs) {
  return runs.map((r) => {
    let t = escH(r.text);
    if (r.u) t = `<u>${t}</u>`;
    if (r.i) t = `<i>${t}</i>`;
    if (r.b) t = `<b>${t}</b>`;
    return t;
  }).join('');
}

/** One page as absolutely positioned lines (inches; 1ch = 0.1in in Courier at 12pt). */
export function pageHtml(page, fmt, { pageNumbers = true } = {}) {
  let html = '';
  if (pageNumbers && page.number > 1) html += `<div class="sp-num" style="top:0.5in;right:${fmt.right}in">${page.number}.</div>`;
  for (const line of page.lines) {
    for (const p of line.parts) {
      const top = `calc(${fmt.top}in + ${line.row} * (1in / 6))`;
      html += `<div class="sp-line sp-${p.type}" style="top:${top};left:calc(${fmt.left}in + ${p.indent}ch)">${runsHtml(p.runs)}</div>`;
      if (p.sceneNo) {
        html += `<div class="sp-line sp-sceneno" style="top:${top};left:${fmt.left - 0.75}in">${escH(p.sceneNo)}</div>`;
        html += `<div class="sp-line sp-sceneno" style="top:${top};left:calc(${fmt.w - fmt.right + 0.2}in)">${escH(p.sceneNo)}</div>`;
      }
    }
  }
  return `<div class="sp-page" style="width:${fmt.w}in;height:${fmt.h}in">${html}</div>`;
}

/** Title page, laid out like Final Draft's default. */
export function titlePageHtml(tp, fmt) {
  const t = (k) => escH(tp[k] || '');
  const lines = (k) => String(tp[k] || '').split('\n').map(escH).join('<br>');
  return `<div class="sp-page sp-title" style="width:${fmt.w}in;height:${fmt.h}in">
<div class="sp-tp-center" style="top:${fmt.h * 0.33}in">
<div class="sp-tp-title">${runsHtml(parseInline((tp.Title || 'UNTITLED').toUpperCase()))}</div>
${tp.Credit ? `<div class="sp-tp-line">${t('Credit')}</div>` : '<div class="sp-tp-line">Written by</div>'}
<div class="sp-tp-line">${lines('Author')}</div>
${tp.Source ? `<div class="sp-tp-line sp-tp-source">${lines('Source')}</div>` : ''}
</div>
<div class="sp-tp-contact" style="left:${fmt.left}in;bottom:${fmt.bottom}in">${lines('Contact')}</div>
<div class="sp-tp-draft" style="right:${fmt.right}in;bottom:${fmt.bottom}in">${lines('Draft date')}${tp.Copyright ? `<br>${t('Copyright')}` : ''}</div>
</div>`;
}

export const SCRIPT_CSS = `
.sp-page{position:relative;background:#fff;color:#111;font-family:'Courier Prime','Courier New',Courier,monospace;font-size:12pt;line-height:12pt;overflow:hidden;box-sizing:border-box;}
.sp-line{position:absolute;white-space:pre;}
.sp-num{position:absolute;}
.sp-sceneno{font-weight:400;}
.sp-scene,.sp-shot{font-weight:400;}
.sp-tp-center{position:absolute;left:0;right:0;text-align:center;}
.sp-tp-title{margin-bottom:.4in;}
.sp-tp-line{margin-top:.17in;}
.sp-tp-source{margin-top:.5in;}
.sp-tp-contact,.sp-tp-draft{position:absolute;line-height:12pt;}
.sp-tp-draft{text-align:right;}
`;

/** Plain-text rendition (fixed width, form feeds between pages). */
export function scriptText(layout, titlePage) {
  const fmt = layout.fmt;
  const margin = ' '.repeat(Math.round(fmt.left * 10) - 10);
  const pages = layout.pages.map((pg) => {
    const out = [];
    out.push(pg.number > 1 ? `${' '.repeat(70 - String(pg.number).length)}${pg.number}.` : '', '');
    for (const line of pg.lines) {
      let s = '';
      for (const p of line.parts) {
        const txt = p.runs.map((r) => r.text).join('');
        s = s.padEnd(p.indent, ' ') + txt;
      }
      out.push(s ? margin + s : '');
    }
    return out.join('\n').replace(/\s+$/g, '');
  });
  let tp = '';
  if (titlePage && Object.keys(titlePage).length) {
    const c = (x) => ' '.repeat(Math.max(0, Math.floor((70 - x.length) / 2))) + x;
    tp = ['', '', '', '', '', '', '', '', '', '', c(plain(titlePage.Title || '').toUpperCase()), '', c(titlePage.Credit || 'Written by'), '', ...String(titlePage.Author || '').split('\n').map(c), '', '', '', '', '', '', '', ...String(titlePage.Contact || '').split('\n'), '', String(titlePage['Draft date'] || '')].join('\n');
  }
  return `${tp ? `${tp}\n\f\n` : ''}${pages.join('\n\f\n')}\n`;
}

/* -------------------------------------------------------------- analysis */

export function analyzeScript(elements, layout) {
  const scenes = [];
  const chars = new Map();
  let cur = null;
  let words = 0, dialogueWords = 0;
  const pageOf = (i) => layout?.elementPage?.[i] || 1;
  elements.forEach((e, i) => {
    const w = (plain(e.text).match(/[\p{L}\p{N}’']+/gu) || []).length;
    if (!['section', 'synopsis'].includes(e.type)) words += w;
    if (e.type === 'scene') {
      const t = plain(e.text).toUpperCase();
      const m = /^(INT\.?\/EXT|EXT\.?\/INT|I\/E|INT|EXT|EST)[.\s]+(.*?)(?:\s+-+\s+(.*))?$/.exec(t) || [];
      cur = { idx: i, heading: t, ie: (m[1] || '').replace(/\./g, ''), location: (m[2] || t).trim(), time: (m[3] || '').trim(), page: pageOf(i), chars: new Set(), synopsis: '', words: 0 };
      scenes.push(cur);
    } else if (e.type === 'synopsis' && cur && !cur.synopsis) cur.synopsis = plain(e.text);
    if (cur) cur.words += w;
    if (e.type === 'character') {
      const n = charName(e.text);
      if (!n) return;
      const c = chars.get(n) || { name: n, speeches: 0, words: 0, scenes: new Set(), first: pageOf(i) };
      c.speeches++;
      let j = i + 1;
      while (j < elements.length && ['paren', 'dialogue', 'lyric'].includes(elements[j].type)) {
        if (elements[j].type !== 'paren') { const dw = (plain(elements[j].text).match(/[\p{L}\p{N}’']+/gu) || []).length; c.words += dw; dialogueWords += dw; }
        j++;
      }
      if (cur) { c.scenes.add(cur.idx); cur.chars.add(n); }
      chars.set(n, c);
    }
  });
  const pages = layout?.pages?.length || 1;
  // Scene length in eighths of a page, from the lines each scene really occupies.
  const L = layout?.fmt?.lines || 54;
  scenes.forEach((s, k) => {
    const end = k + 1 < scenes.length ? scenes[k + 1].idx : elements.length;
    let rows = 0;
    for (let i = s.idx; i < end; i++) rows += (layout?.elementRows?.[i] || 0) + (i > s.idx && ['action', 'character', 'transition', 'shot', 'centered'].includes(elements[i].type) ? 1 : 0);
    s.length = Math.max(1, Math.round((rows / L) * 8)) / 8;
  });
  return { scenes, characters: [...chars.values()].sort((a, b) => b.words - a.words), words, dialogueWords, pages };
}
