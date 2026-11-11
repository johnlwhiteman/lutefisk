// EPUB 3 exporter (with EPUB 2 NCX for older readers). Pure local work: the
// archive is assembled in memory with fflate and written where you choose.
import { coverOpts, coverAlt } from '../shared/cover.js';
import { mathKey, MATH_FONT } from '../shared/math.js';
import { collectBookMath } from '../shared/markdown.js';
import { zipSync, strToU8 } from 'fflate';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { renderBook, prepare } from '../shared/bookhtml.js';
import { baseCss, templateCss, templateById, withCasePrefs, setCustomTemplates } from '../shared/templates.js';
import { fontById } from '../shared/fonts.js';
import { safeAssetPath, escapeHtml as esc } from '../shared/markdown.js';
import { readAsset, mimeFor } from './bookstore.js';

const FONT_DIR = path.join(__dirname, 'renderer', 'fonts');

const xhtml = (title, lang, body, bodyClass = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="UTF-8" /><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="../css/book.css" /></head>
<body class="${bodyClass}">
${body}
</body>
</html>`;

export function bookUuid(book) {
  if (book.uuid && /^[0-9a-f-]{36}$/i.test(book.uuid)) return book.uuid;
  return crypto.randomUUID();
}

function assetName(rel) {
  return path.posix.basename(rel).replace(/\s+/g, '_');
}

export async function buildEpub({ dir, book, contents, rasterize }) {
  const lang = book.language || 'en';
  setCustomTemplates(book.customTemplates);
  const tpl = withCasePrefs(templateById(book.template), book);
  const uid = book.isbn ? `urn:isbn:${String(book.isbn).replace(/[^0-9Xx]/g, '')}` : `urn:uuid:${bookUuid(book)}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const sections = prepare(book);
  const fileFor = (id) => `${id}.xhtml`;
  const endnotesSec = sections.find((s) => s.type === 'endnotes');

  // Collect images referenced by the book.
  const images = new Map(); // rel → name
  const addImg = (rel) => { const s = safeAssetPath(rel); if (s && !images.has(s)) images.set(s, assetName(s)); return s; };
  for (const id of Object.keys(contents)) for (const m of String(contents[id]).matchAll(/\]\((assets\/[^)\s"]+)/g)) addImg(m[1]);
  const cover = book.cover ? addImg(book.cover) : null;
  if (book.authorPhoto) addImg(book.authorPhoto);

  // Equations: images (every reader, the default) or MathML.
  const mathAsImages = book.mathOutput !== 'mathml';
  const equations = collectBookMath(Object.values(contents));
  const mathPngs = mathAsImages && rasterize && equations.size ? await rasterize(equations) : new Map();
  const mathImage = mathAsImages ? (tex, display) => {
    const k = mathKey(tex, display);
    const r = mathPngs.get(k);
    return r ? { src: `../images/math-${k}.png`, h: r.h, depth: r.depth, scale: r.scale } : null;
  } : null;

  const rendered = renderBook({
    book, contents, xhtml: true, mathImage,
    assetUrl: (src) => `../images/${assetName(src)}`,
    hrefFor: fileFor,
    endnotesHref: endnotesSec && book.notesPlacement === 'book' ? fileFor(endnotesSec.id) : '',
  });

  const files = {};
  files['mimetype'] = [strToU8('application/epub+zip'), { level: 0 }];
  files['META-INF/container.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  // Fonts (OFL – embedding permitted). Basic Latin subset only so readers
  // that ignore unicode-range still get complete glyph coverage.
  const fontIds = [...new Set([tpl.body, tpl.head])];
  let fontCss = '';
  const manifestFonts = [];
  if (rendered.some((r) => r.html.includes('class="bk-code'))) {
    for (const w of [400, 700]) {
      const name = `jetbrains-mono-latin-${w}-normal.woff2`;
      try {
        files[`OEBPS/fonts/${name}`] = new Uint8Array(await fs.readFile(path.join(FONT_DIR, name)));
        manifestFonts.push(name);
        fontCss += `@font-face{font-family:'JetBrains Mono';font-weight:${w};font-style:normal;src:url('../fonts/${name}') format('woff2');}\n`;
      } catch { /* readers fall back to their monospace font */ }
    }
  }
  if (!mathAsImages && equations.size) {
    try {
      files[`OEBPS/fonts/${MATH_FONT.file}`] = new Uint8Array(await fs.readFile(path.join(FONT_DIR, MATH_FONT.file)));
      manifestFonts.push(MATH_FONT.file);
      fontCss += `@font-face{font-family:'${MATH_FONT.family}';src:url('../fonts/${MATH_FONT.file}') format('woff2');}\n`;
    } catch { /* readers fall back to their own math font */ }
  }
  for (const id of fontIds) {
    const f = fontById(id);
    if (!f?.pkg) continue;
    for (const [w, st] of [[400, 'normal'], [400, 'italic'], [700, 'normal'], [700, 'italic']]) {
      for (const subset of ['latin', ...(f.extraSubsets || [])]) {
        const name = `${f.pkg}-${subset}-${w}-${st}.woff2`;
        try {
          files[`OEBPS/fonts/${name}`] = new Uint8Array(await fs.readFile(path.join(FONT_DIR, name)));
          manifestFonts.push(name);
          fontCss += `@font-face{font-family:'${f.family}';font-weight:${w};font-style:${st};src:url('../fonts/${name}') format('woff2');}\n`;
        } catch { /* weight not available */ }
      }
    }
  }
  const css = `${fontCss}
body{margin:0 4%;}
p{margin:0;}
${baseCss('.bk', 'epub')}
${templateCss(tpl, '.bk', { ctx: 'epub', dropCaps: book.dropCaps !== false, color: true })}
.bk-cover{margin:0;padding:0;text-align:center;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.bk-cover.v-top{justify-content:flex-start;}
.bk-cover.v-bottom{justify-content:flex-end;}
.bk-cover img{max-width:100%;max-height:100%;height:auto;}
.bk-cover.ext-bleed img{width:100%;height:100%;object-fit:cover;}
.bk-cover.ext-bleed.v-top img{object-position:50% 0;}
.bk-cover.ext-bleed.v-bottom img{object-position:50% 100%;}
.bk-cover.ext-margins{padding:6% 7%;}
aside.bk-notes{display:block;}
`;
  files['OEBPS/css/book.css'] = strToU8(css);

  for (const [rel, name] of images) {
    try { files[`OEBPS/images/${name}`] = new Uint8Array(await readAsset(dir, rel)); } catch { images.delete(rel); }
  }
  for (const [k, r] of mathPngs) files[`OEBPS/images/math-${k}.png`] = new Uint8Array(r.png);

  const manifest = [];
  const spine = [];
  if (cover && images.has(cover)) {
    files['OEBPS/text/cover.xhtml'] = strToU8(xhtml('Cover', lang, `<section class="bk-cover ext-${coverOpts(book).extent} v-${coverOpts(book).valign}" epub:type="cover"><img src="../images/${esc(images.get(cover))}" alt="${esc(coverAlt(book))}" /></section>`));
    manifest.push('<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover" linear="yes"/>');
  }
  const bodyClass = `bk tpl-${tpl.id}`;
  for (const r of rendered) {
    const id = r.sec.id;
    files[`OEBPS/text/${fileFor(id)}`] = strToU8(xhtml(r.sec.tocTitle, lang, r.html, bodyClass));
    manifest.push(`<item id="x-${esc(id)}" href="text/${fileFor(id)}" media-type="application/xhtml+xml"${r.html.includes('<math') ? ' properties="mathml"' : ''}/>`);
    spine.push(`<itemref idref="x-${esc(id)}"/>`);
  }

  // Navigation document (EPUB 3) and NCX (EPUB 2 / older Kindle tooling).
  const navItems = rendered.filter((r) => !['title-page', 'copyright'].includes(r.sec.type));
  const firstBody = rendered.find((r) => ['prologue', 'chapter'].includes(r.sec.type)) || rendered[0];
  const tocSec = rendered.find((r) => r.sec.type === 'toc');
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${esc(lang)}" lang="${esc(lang)}">
<head><meta charset="UTF-8" /><title>Contents</title><link rel="stylesheet" type="text/css" href="css/book.css" /></head>
<body class="bk">
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${navItems.map((r) => `<li><a href="text/${fileFor(r.sec.id)}">${esc(r.sec.tocTitle)}</a></li>`).join('\n')}
</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>
${cover && images.has(cover) ? '<li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>' : ''}
${tocSec ? `<li><a epub:type="toc" href="text/${fileFor(tocSec.sec.id)}">Table of Contents</a></li>` : ''}
${firstBody ? `<li><a epub:type="bodymatter" href="text/${fileFor(firstBody.sec.id)}">Start of Content</a></li>` : ''}
</ol></nav>
</body></html>`;
  files['OEBPS/nav.xhtml'] = strToU8(nav);
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${esc(uid)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${esc(book.title || 'Untitled')}</text></docTitle>
<navMap>
${navItems.map((r, i) => `<navPoint id="np-${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(r.sec.tocTitle)}</text></navLabel><content src="text/${fileFor(r.sec.id)}"/></navPoint>`).join('\n')}
</navMap></ncx>`;
  files['OEBPS/toc.ncx'] = strToU8(ncx);
  manifest.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');

  manifest.push('<item id="css" href="css/book.css" media-type="text/css"/>');
  manifestFonts.forEach((n, i) => manifest.push(`<item id="font-${i}" href="fonts/${n}" media-type="font/woff2"/>`));
  let imgIdx = 0;
  for (const k of mathPngs.keys()) manifest.push(`<item id="math-${k}" href="images/math-${k}.png" media-type="image/png"/>`);
  for (const [rel, name] of images) {
    const isCover = rel === cover;
    manifest.push(`<item id="${isCover ? 'cover-image' : `img-${imgIdx++}`}" href="images/${esc(name)}" media-type="${mimeFor(name)}"${isCover ? ' properties="cover-image"' : ''}/>`);
  }

  const subjects = (book.keywords || []).map((k) => `<dc:subject>${esc(k)}</dc:subject>`).join('');
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${esc(uid)}</dc:identifier>
<dc:title id="t1">${esc(book.title || 'Untitled')}</dc:title>
${book.subtitle ? `<dc:title id="t2">${esc(book.subtitle)}</dc:title><meta refines="#t2" property="title-type">subtitle</meta>` : ''}
<meta refines="#t1" property="title-type">main</meta>
<dc:creator id="creator">${esc(book.author || 'Unknown')}</dc:creator>
<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
<dc:language>${esc(lang)}</dc:language>
${book.publisher ? `<dc:publisher>${esc(book.publisher)}</dc:publisher>` : ''}
${book.description ? `<dc:description>${esc(book.description)}</dc:description>` : ''}
${book.year ? `<dc:date>${esc(String(book.year))}</dc:date>` : ''}
<dc:rights>Copyright © ${esc(String(book.year || new Date().getFullYear()))} ${esc(book.author || '')}</dc:rights>
${subjects}
<meta property="dcterms:modified">${modified}</meta>
${cover && images.has(cover) ? '<meta name="cover" content="cover-image"/>' : ''}
<meta name="generator" content="Lutefisk"/>
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>`;
  files['OEBPS/content.opf'] = strToU8(opf);

  // mimetype must be the first entry and stored uncompressed.
  const ordered = { mimetype: files.mimetype };
  for (const k of Object.keys(files)) if (k !== 'mimetype') ordered[k] = files[k];
  return Buffer.from(zipSync(ordered, { level: 9, mtime: new Date() }));
}
