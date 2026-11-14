// Code blocks: syntax highlighting with highlight.js, tuned to work on every
// output. Colors are paired with bold/italic so highlighting still reads on
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
import awk from 'highlight.js/lib/languages/awk';
import tcl from 'highlight.js/lib/languages/tcl';
import vim from 'highlight.js/lib/languages/vim';
import nginx from 'highlight.js/lib/languages/nginx';
import apache from 'highlight.js/lib/languages/apache';
import http from 'highlight.js/lib/languages/http';
import properties from 'highlight.js/lib/languages/properties';
import graphql from 'highlight.js/lib/languages/graphql';
import protobuf from 'highlight.js/lib/languages/protobuf';
import cmake from 'highlight.js/lib/languages/cmake';
import gradle from 'highlight.js/lib/languages/gradle';
import groovy from 'highlight.js/lib/languages/groovy';
import julia from 'highlight.js/lib/languages/julia';
import matlab from 'highlight.js/lib/languages/matlab';
import fortran from 'highlight.js/lib/languages/fortran';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import clojure from 'highlight.js/lib/languages/clojure';
import fsharp from 'highlight.js/lib/languages/fsharp';
import ocaml from 'highlight.js/lib/languages/ocaml';
import objectivec from 'highlight.js/lib/languages/objectivec';
import vbnet from 'highlight.js/lib/languages/vbnet';
import vbscript from 'highlight.js/lib/languages/vbscript';
import coffeescript from 'highlight.js/lib/languages/coffeescript';
import less from 'highlight.js/lib/languages/less';
import x86asm from 'highlight.js/lib/languages/x86asm';
import armasm from 'highlight.js/lib/languages/armasm';
import nix from 'highlight.js/lib/languages/nix';
import elm from 'highlight.js/lib/languages/elm';
import crystal from 'highlight.js/lib/languages/crystal';
import nim from 'highlight.js/lib/languages/nim';
import verilog from 'highlight.js/lib/languages/verilog';
import vhdl from 'highlight.js/lib/languages/vhdl';
import wasm from 'highlight.js/lib/languages/wasm';
import prolog from 'highlight.js/lib/languages/prolog';
import scheme from 'highlight.js/lib/languages/scheme';
import lisp from 'highlight.js/lib/languages/lisp';

const LANGS = {
  bash, shell, powershell, dos, python, javascript, typescript, json, yaml, xml, css, scss, markdown, ini, java, kotlin,
  c, cpp, csharp, go, rust, swift, ruby, php, perl, lua, r, sql, scala, dart, haskell, dockerfile, makefile, diff, latex, plaintext,
  awk, tcl, vim, nginx, apache, http, properties, graphql, protobuf, cmake, gradle, groovy, julia, matlab, fortran, elixir, erlang, clojure, fsharp, ocaml, objectivec, vbnet, vbscript, coffeescript, less, x86asm, armasm, nix, elm, crystal, nim, verilog, vhdl, wasm, prolog, scheme, lisp,
};
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);

/** Languages offered in the editor, grouped for the picker. */
export const CODE_LANGUAGES = [
  ['', 'Auto-detect', 'Detect'],
  ['plaintext', 'Plain text', 'Text'],
  ['bash', 'Bash / Shell script', 'Scripts & shells'], ['shell', 'Shell session ($ prompts)', 'Scripts & shells'], ['powershell', 'PowerShell', 'Scripts & shells'], ['dos', 'Windows batch (.bat/.cmd)', 'Scripts & shells'],
  ['python', 'Python', 'Scripts & shells'], ['ruby', 'Ruby', 'Scripts & shells'], ['perl', 'Perl', 'Scripts & shells'], ['lua', 'Lua', 'Scripts & shells'], ['r', 'R', 'Scripts & shells'],
  ['awk', 'AWK', 'Scripts & shells'], ['tcl', 'Tcl', 'Scripts & shells'], ['vim', 'Vim script', 'Scripts & shells'], ['vbscript', 'VBScript', 'Scripts & shells'], ['coffeescript', 'CoffeeScript', 'Scripts & shells'], ['julia', 'Julia', 'Scripts & shells'], ['matlab', 'MATLAB', 'Scripts & shells'], ['groovy', 'Groovy', 'Scripts & shells'],
  ['json', 'JSON', 'Data & config'], ['yaml', 'YAML', 'Data & config'], ['xml', 'XML / HTML', 'Data & config'], ['ini', 'INI / TOML', 'Data & config'], ['dockerfile', 'Dockerfile', 'Data & config'], ['makefile', 'Makefile', 'Data & config'], ['sql', 'SQL', 'Data & config'], ['markdown', 'Markdown', 'Data & config'], ['latex', 'LaTeX', 'Data & config'], ['diff', 'Diff / patch', 'Data & config'],
  ['properties', 'Java properties', 'Data & config'], ['graphql', 'GraphQL', 'Data & config'], ['protobuf', 'Protocol Buffers', 'Data & config'], ['http', 'HTTP', 'Data & config'], ['nginx', 'Nginx config', 'Data & config'], ['apache', 'Apache config', 'Data & config'], ['cmake', 'CMake', 'Data & config'], ['gradle', 'Gradle', 'Data & config'], ['nix', 'Nix', 'Data & config'],
  ['javascript', 'JavaScript', 'Source code'], ['typescript', 'TypeScript', 'Source code'], ['css', 'CSS', 'Source code'], ['scss', 'SCSS', 'Source code'], ['java', 'Java', 'Source code'], ['kotlin', 'Kotlin', 'Source code'],
  ['c', 'C', 'Source code'], ['cpp', 'C++', 'Source code'], ['csharp', 'C#', 'Source code'], ['go', 'Go', 'Source code'], ['rust', 'Rust', 'Source code'], ['swift', 'Swift', 'Source code'],
  ['php', 'PHP', 'Source code'], ['scala', 'Scala', 'Source code'], ['dart', 'Dart', 'Source code'], ['haskell', 'Haskell', 'Source code'],
  ['less', 'Less', 'Source code'], ['objectivec', 'Objective-C', 'Source code'], ['vbnet', 'Visual Basic .NET', 'Source code'], ['fsharp', 'F#', 'Source code'], ['ocaml', 'OCaml', 'Source code'], ['elixir', 'Elixir', 'Source code'], ['erlang', 'Erlang', 'Source code'],
  ['clojure', 'Clojure', 'Source code'], ['lisp', 'Lisp', 'Source code'], ['scheme', 'Scheme', 'Source code'], ['elm', 'Elm', 'Source code'], ['crystal', 'Crystal', 'Source code'], ['nim', 'Nim', 'Source code'], ['fortran', 'Fortran', 'Source code'], ['prolog', 'Prolog', 'Source code'],
  ['verilog', 'Verilog', 'Source code'], ['vhdl', 'VHDL', 'Source code'], ['x86asm', 'x86 assembly', 'Source code'], ['armasm', 'ARM assembly', 'Source code'], ['wasm', 'WebAssembly (text)', 'Source code'],
];
const ALIAS = { sh: 'bash', zsh: 'bash', console: 'shell', ps: 'powershell', ps1: 'powershell', bat: 'dos', cmd: 'dos', py: 'python', rb: 'ruby', js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', yml: 'yaml', html: 'xml', xhtml: 'xml', svg: 'xml', toml: 'ini', 'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', golang: 'go', rs: 'rust', kt: 'kotlin', md: 'markdown', tex: 'latex', patch: 'diff', docker: 'dockerfile', make: 'makefile', text: 'plaintext', txt: 'plaintext', fish: 'bash', ksh: 'bash', csh: 'bash', jsonc: 'json', json5: 'json', xsl: 'xml', xslt: 'xml', plist: 'xml', rss: 'xml', conf: 'ini', cfg: 'ini', env: 'properties', gql: 'graphql', proto: 'protobuf', objc: 'objectivec', vb: 'vbnet', vbs: 'vbscript', fs: 'fsharp', ml: 'ocaml', ex: 'elixir', exs: 'elixir', erl: 'erlang', clj: 'clojure', jl: 'julia', asm: 'x86asm', wat: 'wasm', cmd2: 'dos', nginxconf: 'nginx', htaccess: 'apache' };

export const normalizeLang = (lang) => {
  const l = parseCodeInfo(lang).lang.toLowerCase();
  if (!l || l === 'auto') return '';
  const id = ALIAS[l] || l;
  return hljs.getLanguage(id) ? id : 'plaintext';
};
export const languageLabel = (lang) => CODE_LANGUAGES.find(([id]) => id === normalizeLang(lang))?.[1] || 'Plain text';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A fence's info string: "python linenums" → { lang: 'python', lineNumbers: true }. */
export function parseCodeInfo(info) {
  const words = String(info || '').trim().split(/\s+/).filter(Boolean);
  const lineNumbers = words.some((w) => w.toLowerCase() === 'linenums');
  return { lang: words.find((w) => w.toLowerCase() !== 'linenums') || '', lineNumbers };
}
/** The info string for a fence (the reverse of parseCodeInfo). */
export const codeInfo = (lang, lineNumbers) => [lang || (lineNumbers ? 'auto' : ''), lineNumbers ? 'linenums' : ''].filter(Boolean).join(' ');

/**
 * Highlighted HTML split into lines, each a complete element, with a line
 * number in front. Spans that run across lines are closed and reopened.
 */
export function numberLines(html) {
  const open = [];
  const lines = [''];
  for (const m of String(html).matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+|</g)) {
    const t = m[0];
    if (t === '\n') { lines[lines.length - 1] += '</span>'.repeat(open.length); lines.push(open.join('')); continue; }
    if (t.startsWith('<span')) open.push(t); else if (t === '</span>') open.pop();
    lines[lines.length - 1] += t;
  }
  const w = String(lines.length).length;
  // Each line keeps its line break inside it, so plain-text readers still see the lines.
  return lines.map((l, i) => `<span class="bk-ln"><span class="bk-lnum" aria-hidden="true">${String(i + 1).padStart(w, '\u2007')}</span>${l}${i < lines.length - 1 ? '\n' : ''}</span>`).join('');
}

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
${s} pre.bk-code.linenums{padding-left:.4em;}
${s} pre.bk-code .bk-ln{display:block;padding-left:3.2em;text-indent:-3.2em;}
${s} pre.bk-code .bk-lnum{display:inline-block;width:2.4em;margin-right:.8em;text-indent:0;text-align:right;color:#8c959f;font-style:normal;font-weight:400;-webkit-user-select:none;user-select:none;}
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
