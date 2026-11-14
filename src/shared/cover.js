// Cover image layout: alt text, print extent (full bleed or within the page
// margins) and vertical alignment. Shared by the previews, PDF and EPUB.

export const COVER_EXTENTS = [['bleed', 'Full bleed'], ['margins', 'Within margins']];
export const COVER_VALIGNS = [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']];

/** Normalized settings for 'cover' (front) or 'backCover'. */
export function coverOpts(book, key = 'cover') {
  const o = (book.coverLayout && book.coverLayout[key]) || {};
  return {
    alt: typeof o.alt === 'string' ? o.alt : '',
    extent: o.extent === 'margins' ? 'margins' : 'bleed',
    valign: o.valign === 'top' || o.valign === 'bottom' ? o.valign : 'center',
  };
}

/** Alt text, falling back to a description built from the book's metadata. */
export function coverAlt(book, key = 'cover') {
  const a = coverOpts(book, key).alt.trim();
  if (a) return a;
  const who = book.author ? ` by ${book.author}` : '';
  return key === 'cover' ? `Cover of ${book.title || 'the book'}${who}` : `Back cover of ${book.title || 'the book'}`;
}

/**
 * Inline CSS for the cover <img>, positioned inside a page box.
 * margins: { x, top, bottom } as percentages of the page width/height.
 * Full bleed fills the page and crops; within margins shows the whole image.
 */
export function coverImgCss(o, margins = { x: 8, top: 7, bottom: 7 }) {
  const y = o.valign === 'top' ? 'top' : o.valign === 'bottom' ? 'bottom' : 'center';
  if (o.extent === 'margins') {
    return `position:absolute;left:${margins.x}%;right:${margins.x}%;top:${margins.top}%;bottom:${margins.bottom}%;width:${100 - 2 * margins.x}%;height:${100 - margins.top - margins.bottom}%;object-fit:contain;object-position:50% ${y};display:block`;
  }
  return `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% ${y};display:block`;
}

/** Page margins of a print trim as cover margins (symmetric, fore-edge width). */
export const trimCoverMargins = (t) => ({ x: (t.outside / t.w) * 100, top: (t.top / t.h) * 100, bottom: (t.bottom / t.h) * 100 });
