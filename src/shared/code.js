// Code blocks: syntax highlighting with highlight.js, tuned to work on every
// output. Colours are paired with bold/italic so highlighting still reads on
// black-and-white e-ink screens, and long lines wrap instead of scrolling off
// small displays.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import powershell from 'highlight.js/lib/languages/powershell';
import dos from 'highlight.js/lib/languages/dos';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import markdown from 'highlight.js/lib/languages/markdown';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import swift from 'highlight.js/lib/languages/swift';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import perl from 'highlight.js/lib/languages/perl';
import lua from 'highlight.js/lib/languages/lua';
import r from 'highlight.js/lib/languages/r';
import sql from 'highlight.js/lib/languages/sql';
import scala from 'highlight.js/lib/languages/scala';
import dart from 'highlight.js/lib/languages/dart';
import haskell from 'highlight.js/lib/languages/haskell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import makefile from 'highlight.js/lib/languages/makefile';
import diff from 'highlight.js/lib/languages/diff';
import latex from 'highlight.js/lib/languages/latex';
import plaintext from 'highlight.js/lib/languages/plaintext';

const LANGS = {
  bash, shell, powershell, dos, python, javascript, typescript, json, yaml, xml, css, scss, markdown, ini, java, kotlin,
  c, cpp, csharp, go, rust, swift, ruby, php, perl, lua, r, sql, scala, dart, haskell, dockerfile, makefile, diff, latex, plaintext,
};
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);

/** Languages offered in the editor, grouped for the picker. */
export const CODE_LANGUAGES = [
  ['', 'Auto-detect', 'Detect'],
  ['plaintext', 'Plain text', 'Text'],
  ['bash', 'Bash / Shell script', 'Scripts & shells'], ['shell', 'Shell session ($ prompts)', 'Scripts & shells'], ['powershell', 'PowerShell', 'Scripts & shells'], ['dos', 'Windows batch (.bat/.cmd)', 'Scripts & shells'],
  ['python', 'Python', 'Scripts & shells'], ['ruby', 'Ruby', 'Scripts & shells'], ['perl', 'Perl', 'Scripts & shells'], ['lua', 'Lua', 'Scripts & shells'], ['r', 'R', 'Scripts & shells'],
  ['json', 'JSON', 'Data & config'], ['yaml', 'YAML', 'Data & config'], ['xml', 'XML / HTML', 'Data & config'], ['ini', 'INI / TOML', 'Data & config'], ['dockerfile', 'Dockerfile', 'Data & config'], ['makefile', 'Makefile', 'Data & config'], ['sql', 'SQL', 'Data & config'], ['markdown', 'Markdown', 'Data & config'], ['latex', 'LaTeX', 'Data & config'], ['diff', 'Diff / patch', 'Data & config'],
  ['javascript', 'JavaScript', 'Source code'], ['typescript', 'TypeScript', 'Source code'], ['css', 'CSS', 'Source code'], ['scss', 'SCSS', 'Source code'], ['java', 'Java', 'Source code'], ['kotlin', 'Kotlin', 'Source code'],
  ['c', 'C', 'Source code'], ['cpp', 'C++', 'Source code'], ['csharp', 'C#', 'Source code'], ['go', 'Go', 'Source code'], ['rust', 'Rust', 'Source code'], ['swift', 'Swift', 'Source code'],
  ['php', 'PHP', 'Source code'], ['scala', 'Scala', 'Source code'], ['dart', 'Dart', 'Source code'], ['haskell', 'Haskell', 'Source code'],
];
const ALIAS = { sh: 'bash', zsh: 'bash', console: 'shell', ps: 'powershell', ps1: 'powershell', bat: 'dos', cmd: 'dos', py: 'python', rb: 'ruby', js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', yml: 'yaml', html: 'xml', xhtml: 'xml', svg: 'xml', toml: 'ini', 'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', golang: 'go', rs: 'rust', kt: 'kotlin', md: 'markdown', tex: 'latex', patch: 'diff', docker: 'dockerfile', make: 'makefile', text: 'plaintext', txt: 'plaintext' };

export const normalizeLang = (lang) => {
  const l = String(lang || '').trim().toLowerCase().split(/\s+/)[0];
  if (!l) return '';
  const id = ALIAS[l] || l;
  return hljs.getLanguage(id) ? id : 'plaintext';
};
export const languageLabel = (lang) => CODE_LANGUAGES.find(([id]) => id === normalizeLang(lang))?.[1] || 'Plain text';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Highlighted HTML (spans with hljs-* classes) for a code string. */
export function highlightCode(code, lang, { enabled = true } = {}) {
  const src = String(code ?? '');
  if (!enabled || src.length > 200000) return esc(src);
  const id = normalizeLang(lang);
  try {
    if (id === 'plaintext') return esc(src);
    if (!id) return hljs.highlightAuto(src, Object.keys(LANGS).filter((l) => l !== 'plaintext')).value;
    return hljs.highlight(src, { language: id, ignoreIllegals: true }).value;
  } catch { return esc(src); }
}

/**
 * Highlight ranges for the editor: [{ from, to, cls }] character offsets into the code.
 * Derived from highlight.js HTML so the editor matches the book exactly.
 */
export function highlightRanges(code, lang) {
  const html = highlightCode(code, lang);
  const out = [];
  const stack = [];
  let pos = 0;
  const decode = (s) => s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" })[e]);
  for (const m of html.matchAll(/<span class="([^"]+)">|<\/span>|([^<]+)/g)) {
    if (m[1]) stack.push(m[1]);
    else if (m[0] === '</span>') stack.pop();
    else {
      const len = decode(m[2]).length;
      if (stack.length && len) out.push({ from: pos, to: pos + len, cls: stack.join(' ') });
      pos += len;
    }
  }
  return out;
}

/** Map a token class to a simple style, for Word, RTF and MOBI. */
export function tokenStyle(cls) {
  const c = ` ${cls} `;
  const has = (...names) => names.some((n) => c.includes(` hljs-${n} `) || c.includes(` hljs-${n}_ `));
  if (has('comment', 'quote')) return { color: '6A737D', italic: true };
  if (has('keyword', 'selector-tag', 'doctag')) return { color: 'A626A4', bold: true };
  if (has('string', 'regexp', 'addition', 'selector-attr')) return { color: '2E7D32' };
  if (has('number', 'literal')) return { color: '986801' };
  if (has('title', 'function', 'section')) return { color: '1F5FBF', bold: has('section') };
  if (has('attr', 'attribute', 'property', 'selector-class', 'selector-id')) return { color: 'B45309' };
  if (has('name', 'tag', 'variable', 'template-variable', 'deletion')) return { color: 'C0392B' };
  if (has('built_in', 'type', 'class')) return { color: '8A5A00' };
  if (has('meta', 'symbol', 'bullet', 'link')) return { color: '0E7490' };
  if (has('emphasis')) return { italic: true };
  if (has('strong')) return { bold: true };
  return {};
}

export const CODE_FONT = { family: 'JetBrains Mono', pkg: 'jetbrains-mono' };

/** CSS for code in the book (previews, PDF and EPUB). */
export const CODE_CSS = (s = '') => `
${s} pre.bk-code{font-family:'JetBrains Mono','DejaVu Sans Mono',Menlo,Consolas,monospace;font-size:.78em;line-height:1.45;text-align:left;text-indent:0;hyphens:none;-webkit-hyphens:none;white-space:pre-wrap;overflow-wrap:anywhere;word-wrap:break-word;margin:.9em 0;padding:.6em .8em;border:1px solid #d0d7de;border-left:3px solid #8c959f;border-radius:4px;background:#f6f8fa;color:#1f2328;break-inside:avoid;page-break-inside:avoid;}
${s} pre.bk-code code{font-family:inherit;font-size:1em;background:none;padding:0;white-space:inherit;}
${s} :not(pre)>code{font-family:'JetBrains Mono','DejaVu Sans Mono',Menlo,Consolas,monospace;font-size:.85em;}
${s} .hljs-comment,${s} .hljs-quote{color:#6a737d;font-style:italic;}
${s} .hljs-keyword,${s} .hljs-selector-tag,${s} .hljs-doctag{color:#a626a4;font-weight:700;}
${s} .hljs-string,${s} .hljs-regexp,${s} .hljs-addition,${s} .hljs-selector-attr{color:#2e7d32;}
${s} .hljs-number,${s} .hljs-literal{color:#986801;}
${s} .hljs-title,${s} .hljs-function .hljs-title,${s} .hljs-title.function_{color:#1f5fbf;}
${s} .hljs-section{color:#1f5fbf;font-weight:700;}
${s} .hljs-attr,${s} .hljs-attribute,${s} .hljs-property,${s} .hljs-selector-class,${s} .hljs-selector-id{color:#b45309;}
${s} .hljs-name,${s} .hljs-tag,${s} .hljs-variable,${s} .hljs-template-variable,${s} .hljs-deletion{color:#c0392b;}
${s} .hljs-built_in,${s} .hljs-type,${s} .hljs-class .hljs-title,${s} .hljs-title.class_{color:#8a5a00;}
${s} .hljs-meta,${s} .hljs-symbol,${s} .hljs-bullet,${s} .hljs-link{color:#0e7490;}
${s} .hljs-emphasis{font-style:italic;}
${s} .hljs-strong{font-weight:700;}
`;
