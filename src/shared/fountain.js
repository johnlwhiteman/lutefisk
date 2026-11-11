// Fountain (https://fountain.io) — the open plain-text screenplay format —
// parser and writer. Screenplays are stored as .fountain files.
//
// Element types: scene, action, character, paren, dialogue, transition, shot,
// centered, act, lyric, section, synopsis, pagebreak.

const SCENE_RE = /^(?:INT|EXT|EST|INT\.?\/EXT|INT\/EXT|EXT\/INT|I\/E)[.\s]/i;
const ACT_RE = /^(?:COLD OPEN|TEASER|TAG|PROLOGUE|EPILOGUE|ACT [A-Z0-9]+|END OF (?:ACT [A-Z0-9]+|TEASER|COLD OPEN|SHOW|EPISODE))$/i;
const TRANSITION_RE = /^[A-Z0-9 .'’-]+TO:$/;
const KNOWN_TRANSITIONS = /^(FADE IN:|FADE OUT\.|FADE TO BLACK\.|CUT TO BLACK\.|THE END|END CREDITS|FADE OUT:)$/;

export const TITLE_KEYS = ['Title', 'Credit', 'Author', 'Source', 'Draft date', 'Contact', 'Copyright', 'Notes'];

/** Parse inline emphasis: ***bold italic***, **bold**, *italic*, _underline_. */
export function parseInline(text) {
  const runs = [];
  let b = false, i = false, u = false, buf = '';
  const push = () => { if (buf) { runs.push({ text: buf, b, i, u }); buf = ''; } };
  const s = String(text || '').replace(/\[\[[\s\S]*?\]\]/g, ''); // notes are not printed
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && k + 1 < s.length && '*_\\'.includes(s[k + 1])) { buf += s[++k]; continue; }
    if (c === '*') {
      let n = 1;
      while (s[k + n] === '*' && n < 3) n++;
      push();
      if (n === 3) { b = !b; i = !i; } else if (n === 2) b = !b; else i = !i;
      k += n - 1;
      continue;
    }
    if (c === '_') { push(); u = !u; continue; }
    buf += c;
  }
  push();
  return runs;
}

/** Plain text without emphasis markers or notes. */
export const plain = (text) => parseInline(text).map((r) => r.text).join('');

function isUpperLine(line) {
  const letters = line.replace(/\(.*?\)/g, '').replace(/[^A-Za-zÀ-ɏ]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
}

/** Parse Fountain text → { titlePage: {key: value}, elements: [{type, text, dual?, level?, number?}] } */
export function parseFountain(src) {
  let text = String(src || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  text = text.replace(/\/\*[\s\S]*?\*\//g, ''); // boneyard
  const lines = text.split('\n');
  const titlePage = {};
  let i = 0;
  // Title page: key: value pairs at the very top.
  while (i < lines.length && !lines[i].trim()) i++;
  if (/^[A-Za-z][A-Za-z ]{0,30}:/.test(lines[i] || '') && !SCENE_RE.test(lines[i]) && !TRANSITION_RE.test(lines[i].trim())) {
    let key = null;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { i++; break; }
      const m = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.*)$/.exec(line);
      if (m && !/^\s/.test(line)) {
        key = m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Draft Date$/, 'Draft date');
        if (key === 'Authors') key = 'Author';
        titlePage[key] = m[2].trim();
      } else if (key) titlePage[key] = (titlePage[key] ? `${titlePage[key]}\n` : '') + line.trim();
    }
  }

  const els = [];
  // Group the remaining lines into blocks separated by blank lines.
  const blocks = [];
  let cur = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() && line !== '  ') { if (cur.length) { blocks.push(cur); cur = []; } continue; }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  for (const block of blocks) {
    const first = block[0].trim();
    if (/^={3,}$/.test(first)) { els.push({ type: 'pagebreak', text: '' }); continue; }
    if (/^#+/.test(first)) { const m = /^(#+)\s*(.*)$/.exec(first); els.push({ type: 'section', text: m[2], level: m[1].length }); continue; }
    if (/^=(?!=)/.test(first)) { els.push({ type: 'synopsis', text: block.map((l) => l.trim().replace(/^=\s?/, '')).join(' ') }); continue; }
    if (block.length === 1 && /^\.(?!\.)/.test(first)) { els.push(scene(first.slice(1))); continue; }
    if (block.length === 1 && SCENE_RE.test(first)) { els.push(scene(first)); continue; }
    if (block.length === 1 && /^>.*<$/.test(first)) {
      const t = first.slice(1, -1).trim();
      els.push({ type: ACT_RE.test(t) ? 'act' : 'centered', text: t });
      continue;
    }
    if (block.length === 1 && /^>/.test(first)) { els.push({ type: 'transition', text: first.slice(1).trim() }); continue; }
    if (block.length === 1 && (TRANSITION_RE.test(first) || KNOWN_TRANSITIONS.test(first))) { els.push({ type: 'transition', text: first }); continue; }
    if (/^~/.test(first)) { for (const l of block) els.push({ type: 'lyric', text: l.trim().replace(/^~\s?/, '') }); continue; }
    if (/^!/.test(first)) { els.push({ type: 'action', text: [block[0].trim().slice(1), ...block.slice(1)].join('\n') }); continue; }
    if (block.length === 1 && /\[\[shot\]\]\s*$/i.test(first)) { els.push({ type: 'shot', text: first.replace(/\s*\[\[shot\]\]\s*$/i, '') }); continue; }
    // Character + dialogue
    const charLine = first;
    const forcedChar = /^@/.test(charLine);
    if (block.length > 1 && (forcedChar || (isUpperLine(charLine) && !/^\(/.test(charLine) && !/[.!?]$/.test(charLine.replace(/\(.*\)\s*\^?$/, '').trim())))) {
      let name = forcedChar ? charLine.slice(1) : charLine;
      let dual = false;
      if (/\^\s*$/.test(name)) { dual = true; name = name.replace(/\s*\^\s*$/, ''); }
      els.push({ type: 'character', text: name.trim(), dual });
      let dlg = [];
      const flush = () => { if (dlg.length) { els.push({ type: 'dialogue', text: dlg.join('\n') }); dlg = []; } };
      for (const l of block.slice(1)) {
        const t = l.trim();
        if (/^\(.*\)$/.test(t)) { flush(); els.push({ type: 'paren', text: t }); } else dlg.push(l === '  ' ? '' : t);
      }
      flush();
      continue;
    }
    els.push({ type: 'action', text: block.map((l) => l.replace(/^\s{0,3}/, (m) => (m.length >= 4 ? m : ''))).join('\n') });
  }
  return { titlePage, elements: els };

  function scene(t) {
    const m = /^(.*?)\s*#([\w.-]+)#\s*$/.exec(t.trim());
    return m ? { type: 'scene', text: m[1].trim(), number: m[2] } : { type: 'scene', text: t.trim() };
  }
}

const esc = (t) => String(t || '');

/** Write elements back to Fountain, adding forcing characters only where needed. */
export function writeFountain(titlePage, elements) {
  const out = [];
  const tp = Object.entries(titlePage || {}).filter(([, v]) => String(v || '').trim());
  if (tp.length) {
    for (const [k, v] of tp) {
      const lines = String(v).split('\n');
      out.push(lines.length > 1 ? `${k}:\n${lines.map((l) => `    ${l}`).join('\n')}` : `${k}: ${lines[0]}`);
    }
    out.push('');
  }
  let inDialogue = false;
  const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
  for (const e of elements) {
    const t = esc(e.text);
    const up = t.toUpperCase();
    if (!['paren', 'dialogue'].includes(e.type) && inDialogue) { inDialogue = false; }
    switch (e.type) {
      case 'scene': blank(); out.push(`${SCENE_RE.test(up) ? '' : '.'}${up}${e.number ? ` #${e.number}#` : ''}`); out.push(''); break;
      case 'character': {
        blank();
        const needsForce = !isUpperLine(up) || /^[!.>~=#@]/.test(up) || SCENE_RE.test(up);
        out.push(`${needsForce ? '@' : ''}${up}${e.dual ? ' ^' : ''}`);
        inDialogue = true;
        break;
      }
      case 'paren': if (!inDialogue) { blank(); out.push('@'); inDialogue = true; } out.push(/^\(.*\)$/.test(t.trim()) ? t.trim() : `(${t.trim().replace(/^\(|\)$/g, '')})`); break;
      case 'dialogue': if (!inDialogue) { blank(); out.push('@'); inDialogue = true; } out.push(...t.split('\n').map((l) => (l === '' ? '  ' : l))); break;
      case 'transition': blank(); out.push(TRANSITION_RE.test(up) || KNOWN_TRANSITIONS.test(up) ? up : `> ${up}`); out.push(''); break;
      case 'shot': blank(); out.push(`${up} [[shot]]`); out.push(''); break;
      case 'centered': blank(); out.push(`> ${t} <`); out.push(''); break;
      case 'act': blank(); out.push(`> ${up} <`); out.push(''); break;
      case 'lyric': if (out[out.length - 1] !== '' && !String(out[out.length - 1]).startsWith('~')) out.push(''); out.push(`~${t}`); break;
      case 'section': blank(); out.push(`${'#'.repeat(e.level || 1)} ${t}`); out.push(''); break;
      case 'synopsis': out.push(`= ${t}`); out.push(''); break;
      case 'pagebreak': blank(); out.push('==='); out.push(''); break;
      default: {
        blank();
        const firstLine = t.split('\n')[0];
        const ambiguous = SCENE_RE.test(firstLine) || /^[.>~=#@!]/.test(firstLine) || (isUpperLine(firstLine) && t.split('\n').length > 1) || TRANSITION_RE.test(firstLine.trim());
        out.push(`${ambiguous ? '!' : ''}${t}`);
        out.push('');
      }
    }
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
