// Minimal tokenizer for the well-formed HTML Lutefisk itself renders. Used by
// the RTF and MOBI exporters to turn the book HTML into other formats.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e.toLowerCase()] ?? m;
});

const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'col']);

/** Parse into a tree: { tag, attrs, children } / { text }. */
export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] != null) { stack[stack.length - 1].children.push({ text: decode(m[5]) }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4] && !VOID.has(tag)) stack.push(node);
  }
  return root;
}

export const hasClass = (n, c) => (` ${n.attrs?.class || ''} `).includes(` ${c} `);
export const textOf = (n) => (n.text != null ? n.text : (n.children || []).map(textOf).join(''));
export function find(n, pred, out = []) {
  if (pred(n)) out.push(n);
  for (const c of n.children || []) find(c, pred, out);
  return out;
}
