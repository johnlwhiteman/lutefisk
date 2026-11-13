// Markdown exporter: the whole book as one portable .md file with YAML front
// matter. Footnote labels are made unique per section, images are copied to
// "<name> assets/" next to the file, and generated sections (contents,
// bibliography, index) are written out as plain Markdown.
import { setCustomTemplates } from '../shared/templates.js';
import { coverAlt } from '../shared/cover.js';
import YAML from 'yaml';
import { prepare, indexLocations, citer } from '../shared/bookhtml.js';
import { extractFootnotes, stripComments, safeAssetPath } from '../shared/markdown.js';
import { fillPlaceholders } from '../shared/sections.js';
import { formatBibliography } from '../shared/citations.js';

const htmlToMd = (html) => String(html)
  .replace(/<\/?(i|em)>/g, '*').replace(/<\/?(b|strong)>/g, '**')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

export async function buildMarkdown({ book, contents, assetsFolder }) {
  setCustomTemplates(book.customTemplates);
  const sections = prepare(book);
  const images = new Map();
  const cite = citer(book);
  const assetRef = (rel) => {
    const s = safeAssetPath(rel);
    if (!s) return null;
    const name = s.slice('assets/'.length);
    images.set(s, { rel: s, name });
    return `${encodeURI(assetsFolder)}/${encodeURIComponent(name)}`;
  };

  const front = {
    title: book.title || 'Untitled', subtitle: book.subtitle || undefined, author: book.author || undefined,
    publisher: book.publisher || undefined, date: book.year ? String(book.year) : undefined, lang: book.language || 'en',
    isbn: book.isbn || undefined, description: book.description || undefined,
    keywords: book.keywords?.length ? book.keywords : undefined,
    'cover-image': book.cover ? assetRef(book.cover) : undefined,
    'cover-alt': book.cover ? coverAlt(book) : undefined,
  };
  for (const k of Object.keys(front)) if (front[k] === undefined) delete front[k];
  const frontMatter = `---\n${YAML.stringify(front, { lineWidth: 0 }).trim()}\n---`;
  const out = [];

  for (const s of sections) {
    const heading = (t) => `# ${t}`;
    switch (s.type) {
      case 'title-page':
        out.push([`# ${book.title || 'Untitled'}`, book.subtitle ? `*${book.subtitle}*` : '', book.author ? `**${book.author}**` : '', book.publisher || ''].filter(Boolean).join('\n\n'));
        continue;
      case 'toc':
        out.push(`${heading(s.title || 'Contents')}\n\n${sections.filter((x) => !['title-page', 'copyright', 'toc', 'dedication', 'epigraph'].includes(x.type)).map((x) => `- [${x.tocTitle}](#${slug(x.tocTitle)})`).join('\n')}`);
        continue;
      case 'bibliography': {
        const style = book.citationStyle || 'apa';
        const list = formatBibliography(book.bibliography, style).map((e) => htmlToMd(e));
        out.push(`${heading(s.title || (style === 'mla' ? 'Works Cited' : style === 'chicago' ? 'Bibliography' : 'References'))}\n\n${list.join('\n\n') || '*No sources.*'}`);
        continue;
      }
      case 'index': {
        const locs = indexLocations(book, contents, sections);
        const lines = Object.keys(locs).sort((a, b) => a.localeCompare(b)).map((t) => `- **${t}** — ${locs[t].map((x) => `[${x.label || x.tocTitle}](#${slug(x.tocTitle)})`).join(', ')}`);
        out.push(`${heading(s.title || 'Index')}\n\n${lines.join('\n')}`);
        continue;
      }
      case 'endnotes':
        continue; // footnotes stay attached to their chapters in Markdown
      default: break;
    }
    const { body, defs } = extractFootnotes(stripComments(fillPlaceholders(contents[s.id] || '', book)));
    const prefix = s.id.replace(/[^a-z0-9]/g, '');
    let text = body
      .replace(/\[@([A-Za-z0-9_-]{1,64})(?:,\s*([^\]\n]{1,60}))?\]/g, (_m, ref, loc) => cite(ref, (loc || '').trim()))
      .replace(/\[\^([^\]\s]+)\]/g, (_m, l) => `[^${prefix}-${l}]`)
      .replace(/(!\[[^\]]*\]\()(assets\/[^)\s"]+)/g, (m, a, rel) => { const r = assetRef(rel); return r ? a + r : m; })
      .replace(/^#(?=#* )/gm, '##'); // section titles are H1; body headings move down a level
    const notes = [...defs].map(([l, t]) => `[^${prefix}-${l}]: ${t.replace(/\[@([A-Za-z0-9_-]{1,64})(?:,\s*([^\]\n]{1,60}))?\]/g, (_m, ref, loc) => cite(ref, (loc || '').trim()))}`).join('\n');
    const title = s.type === 'chapter' ? s.tocTitle : s.displayTitle;
    const head = ['copyright', 'dedication', 'epigraph'].includes(s.type) ? '' : `${heading(title)}\n\n`;
    if (s.type === 'about-author' && book.authorPhoto) {
      const r = assetRef(book.authorPhoto);
      if (r) text = `![${book.author || 'Author'}](${r})\n\n${text}`;
    }
    out.push(`${head}${text.trim()}${notes ? `\n\n${notes}` : ''}`);
  }
  return { markdown: `${frontMatter}\n\n${out.join('\n\n---\n\n')}\n`, images: [...images.values()] };
}
