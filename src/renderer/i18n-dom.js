// Shows the interface in the chosen language by translating Lutefisk's own
// labels as they appear: text, tooltips, accessible names and placeholders.
// Your writing is never touched — the editor, the previews and covers are
// skipped, and input values are never changed. The English originals are
// remembered so switching languages (or back to English) is instant.
import { t, setLanguage, isEnglish } from '../shared/i18n.js';

const SKIP = '.ProseMirror, .pp-desk, .pp-measure, .scr, .dv-screen, .gen-cover, .cover-gen, .no-i18n, [contenteditable="true"], textarea, code, pre, .pb-card-t, .pb-card-x, .tl-when, .ch-name, .cm-body, .snip-card, .lib-title';
const ATTRS = ['title', 'aria-label', 'placeholder'];
const textOrig = new WeakMap(); // Text node → English
const attrOrig = new WeakMap(); // Element → { attr: English }
let observer = null;

const skipped = (el) => !el || !!el.closest?.(SKIP);

function doText(node) {
  const el = node.parentElement;
  if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || skipped(el)) return;
  const cur = node.nodeValue;
  if (!cur || !cur.trim()) return;
  let orig = textOrig.get(node);
  // Text changed by the app since we translated it: that's the new original.
  if (orig === undefined || (orig.out !== cur)) orig = { src: cur };
  const out = isEnglish() ? orig.src : t(orig.src);
  orig.out = out;
  textOrig.set(node, orig);
  if (out !== cur) node.nodeValue = out;
}
function doAttrs(el) {
  if (skipped(el)) return;
  let rec = attrOrig.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null || !cur.trim()) continue;
    rec ||= {};
    let o = rec[a];
    if (!o || o.out !== cur) o = { src: cur };
    o.out = isEnglish() ? o.src : t(o.src);
    rec[a] = o;
    if (o.out !== cur) el.setAttribute(a, o.out);
  }
  if (rec) attrOrig.set(el, rec);
}
function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
}

let pending = new Set();
function flush() {
  const list = pending; pending = new Set();
  for (const n of list) if (n.isConnected) walk(n);
}

/** Apply a language to the whole window, and keep new interface text in it. */
export function applyLanguage(code) {
  setLanguage(code);
  document.documentElement.dataset.uiLang = code;
  walk(document.body);
  if (isEnglish() && observer) return; // keep watching so originals stay current
  if (!observer) {
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') for (const n of m.addedNodes) pending.add(n);
        else if (m.type === 'characterData') pending.add(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
      }
      // Mutation callbacks run before the next paint, so new text never flashes in English.
      if (pending.size) flush();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
}
