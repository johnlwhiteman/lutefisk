// 100 book design templates. Each template is a small set of typographic
// decisions; css() turns it into concrete CSS (no custom properties, so the
// same stylesheet works in older e-reader engines such as Kindle KF8).
import { fontStack } from './fonts.js';
import { MATH_CSS } from './math.js';
import { CODE_CSS } from './code.js';

const T = (id, name, category, o) => ({
  id, name, category,
  body: 'literata', head: 'literata', scale: 1, lh: 1.5, indent: 1.4, gap: 0, justify: true,
  align: 'center', numbering: 'words', numCase: 'smallcaps', numSize: 1.05, titleSize: 1.9, titleWeight: 400,
  titleItalic: false, titleCase: 'none', tracking: 0, sink: 7, ornament: '', rule: 'none',
  dropcap: 'drop', firstLine: 'smallcaps', accent: '#1f1f1f', heading: o.numbering === 'none' ? 'title' : 'both', ...o,
  // Most designs use the classic * * * scene break; the World & Heritage designs keep their own ornaments.
  scene: category === 'World & Heritage' ? (o.scene ?? '* * *') : '* * *',
});

export const TEMPLATES = [
  T('classic', 'Classic', 'General', { ornament: '❦', numCase: 'smallcaps' }),
  T('garamond', 'Garamond Traditional', 'Literary', { body: 'eb-garamond', head: 'eb-garamond', scale: 1.08, numbering: 'roman-only', ornament: '❧', scene: '❧', titleItalic: true }),
  T('modern', 'Modern', 'General', { body: 'source-serif', head: 'inter', align: 'left', numbering: 'number-only', numSize: 3.2, titleWeight: 700, titleSize: 1.6, rule: 'above', scene: '—', numCase: 'none', firstLine: 'none' }),
  T('minimal', 'Minimal', 'General', { body: 'lora', head: 'lato', numbering: 'number-only', numSize: 1.4, titleSize: 1.4, titleCase: 'upper', tracking: 0.2, scene: '·   ·   ·', dropcap: 'none', firstLine: 'none' }),
  T('romance', 'Romance', 'Fiction', { body: 'lora', head: 'playfair', titleItalic: true, titleSize: 2.2, ornament: '❦', scene: '❦', accent: '#9c2f4f', dropcap: 'drop' }),
  T('thriller', 'Thriller', 'Fiction', { body: 'pt-serif', head: 'inter', align: 'left', numbering: 'number-only', numSize: 4, titleWeight: 800, titleCase: 'upper', titleSize: 1.3, tracking: 0.08, rule: 'below', scene: '■', accent: '#b3261e', firstLine: 'uppercase', dropcap: 'raised' }),
  T('fantasy', 'Epic Fantasy', 'Fiction', { body: 'eb-garamond', head: 'cinzel', scale: 1.05, ornament: '✦', scene: '✦ ✦ ✦', titleSize: 1.8, numCase: 'upper', tracking: 0.12, accent: '#6b4b16' }),
  T('scifi', 'Science Fiction', 'Fiction', { body: 'noto-serif', head: 'inter', numbering: 'number-only', numSize: 2.4, titleCase: 'upper', tracking: 0.3, titleSize: 1.2, titleWeight: 300, scene: '◆', accent: '#1565c0', rule: 'both', firstLine: 'none' }),
  T('literary', 'Literary', 'Literary', { body: 'crimson-pro', head: 'cormorant', scale: 1.1, numbering: 'roman-only', numSize: 2.2, titleItalic: true, titleSize: 1.7, scene: '⁂', dropcap: 'none' }),
  T('memoir', 'Memoir', 'Nonfiction', { body: 'libre-baskerville', head: 'libre-baskerville', scale: 0.95, titleItalic: true, titleSize: 1.6, ornament: '~', scene: '~', lh: 1.6 }),
  T('mystery', 'Mystery', 'Fiction', { body: 'libre-caslon', head: 'libre-caslon', numbering: 'numeral', numCase: 'upper', tracking: 0.1, titleSize: 1.7, scene: '* * *', firstLine: 'uppercase', accent: '#2e3b4e' }),
  T('horror', 'Horror', 'Fiction', { body: 'spectral', head: 'cormorant', numbering: 'roman', numCase: 'upper', titleCase: 'upper', titleWeight: 700, tracking: 0.15, titleSize: 1.7, ornament: '†', scene: '†', accent: '#7a0f0f' }),
  T('young-adult', 'Young Adult', 'Fiction', { body: 'literata', head: 'lato', numbering: 'number-only', numSize: 3, titleWeight: 700, titleSize: 1.5, scene: '✶', accent: '#6a1b9a', dropcap: 'raised', firstLine: 'none' }),
  T('children', "Children's", 'Fiction', { body: 'atkinson', head: 'atkinson', scale: 1.18, lh: 1.7, numbering: 'numeral', titleWeight: 700, titleSize: 1.8, scene: '★ ★ ★', accent: '#e65100', dropcap: 'raised', justify: false, firstLine: 'none' }),
  T('nonfiction', 'Nonfiction', 'Nonfiction', { body: 'source-serif', head: 'source-serif', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.08, titleWeight: 700, titleSize: 1.8, scene: '—', rule: 'below', firstLine: 'none' }),
  T('business', 'Business', 'Nonfiction', { body: 'source-serif', head: 'inter', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.1, titleWeight: 700, titleSize: 1.7, indent: 0, gap: 0.8, justify: false, scene: '—', dropcap: 'none', firstLine: 'none', accent: '#0b5394' }),
  T('academic', 'Academic', 'Nonfiction', { body: 'noto-serif', head: 'noto-serif', scale: 0.95, align: 'left', numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.5, sink: 3, scene: '* * *', dropcap: 'none', firstLine: 'none' }),
  T('poetry', 'Poetry', 'Literary', { body: 'cormorant', head: 'cormorant', scale: 1.12, numbering: 'none', titleItalic: true, titleSize: 1.6, indent: 0, gap: 1, justify: false, scene: '◇', dropcap: 'none', firstLine: 'none' }),
  T('historical', 'Historical', 'Fiction', { body: 'eb-garamond', head: 'libre-caslon', scale: 1.05, numCase: 'smallcaps', titleSize: 1.7, ornament: '❦', scene: '❦', accent: '#5d4037' }),
  T('western', 'Western', 'Fiction', { body: 'alegreya', head: 'alegreya', numCase: 'upper', titleCase: 'upper', titleWeight: 700, tracking: 0.1, titleSize: 1.6, ornament: '✶ ✶ ✶', scene: '✶ ✶ ✶', accent: '#8d4f1e' }),
  T('noir', 'Noir', 'Fiction', { body: 'pt-serif', head: 'libre-baskerville', numbering: 'number-only', numSize: 2.6, titleCase: 'upper', tracking: 0.2, titleSize: 1.2, rule: 'both', scene: '—  ◼  —', accent: '#000000', firstLine: 'uppercase' }),
  T('cozy', 'Cozy', 'Fiction', { body: 'lora', head: 'lora', titleItalic: true, titleSize: 1.9, ornament: '❀', scene: '❀', accent: '#7b5e2a' }),
  T('gothic', 'Gothic', 'Fiction', { body: 'cormorant', head: 'cinzel', scale: 1.12, numbering: 'roman-only', numSize: 1.6, titleSize: 1.6, tracking: 0.08, ornament: '✠', scene: '✠', accent: '#3e2723' }),
  T('art-deco', 'Art Deco', 'Literary', { body: 'libre-baskerville', head: 'playfair', scale: 0.95, numbering: 'roman', numCase: 'upper', tracking: 0.35, titleCase: 'upper', titleSize: 1.5, rule: 'double', scene: '◆ ◆ ◆', accent: '#8a6d1d' }),
  T('contemporary', 'Contemporary', 'General', { body: 'merriweather', head: 'merriweather', scale: 0.92, align: 'left', numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.6, scene: '* * *', lh: 1.6, firstLine: 'none' }),
  // ---- 25 more designs
  T('paperback-classic', 'Paperback Classic', 'General', { body: 'pt-serif', head: 'pt-serif', numbering: 'numeral', numCase: 'none', numSize: 1.3, titleSize: 1.5, titleItalic: true, scene: '* * *', firstLine: 'none' }),
  T('swiss', 'Swiss', 'General', { body: 'source-serif', head: 'inter', align: 'left', numbering: 'number-only', numSize: 5, numCase: 'none', titleWeight: 600, titleSize: 1.35, scene: '—', rule: 'above', sink: 9, dropcap: 'none', firstLine: 'none', accent: '#d32f2f' }),
  T('geometric', 'Geometric', 'General', { body: 'merriweather', head: 'lato', scale: 0.94, numbering: 'number-only', numSize: 2.8, numCase: 'none', titleCase: 'upper', tracking: 0.25, titleWeight: 300, titleSize: 1.15, scene: '○ ○ ○', rule: 'below', dropcap: 'raised', firstLine: 'none', accent: '#00796b' }),
  T('large-print', 'Large Print', 'Accessibility', { body: 'atkinson', head: 'atkinson', scale: 1.35, lh: 1.6, align: 'left', numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.5, indent: 1, justify: false, scene: '* * *', dropcap: 'none', firstLine: 'none' }),
  T('dyslexia-friendly', 'Dyslexia Friendly', 'Accessibility', { body: 'opendyslexic', head: 'opendyslexic', scale: 0.98, lh: 1.8, align: 'left', numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.35, indent: 0, gap: 0.9, justify: false, scene: '* * *', dropcap: 'none', firstLine: 'none' }),
  T('chapbook', 'Chapbook', 'Literary', { body: 'cormorant', head: 'cormorant', scale: 1.15, numbering: 'roman-only', numSize: 1.3, numCase: 'upper', tracking: 0.2, titleItalic: true, titleSize: 1.5, ornament: '·', scene: '·', dropcap: 'none', firstLine: 'smallcaps' }),
  T('short-stories', 'Short Stories', 'Literary', { body: 'crimson-pro', head: 'playfair', scale: 1.08, numbering: 'none', titleSize: 2.1, titleItalic: true, ornament: '—', scene: '◦ ◦ ◦', accent: '#37474f' }),
  T('essays', 'Essays', 'Literary', { body: 'libre-caslon', head: 'libre-caslon', scale: 0.96, align: 'left', numbering: 'roman', numCase: 'smallcaps', titleSize: 1.6, scene: '§', rule: 'below', dropcap: 'none', firstLine: 'smallcaps' }),
  T('private-press', 'Private Press', 'Literary', { body: 'eb-garamond', head: 'eb-garamond', scale: 1.1, numbering: 'roman-only', numSize: 1.2, numCase: 'upper', tracking: 0.3, titleCase: 'upper', titleSize: 1.1, ornament: '❧', scene: '❧', accent: '#a52a2a', dropcap: 'drop', firstLine: 'smallcaps' }),
  T('regency', 'Regency', 'Fiction', { body: 'libre-baskerville', head: 'playfair', scale: 0.95, numbering: 'words', numCase: 'smallcaps', titleItalic: true, titleSize: 1.8, ornament: '⁂', scene: '⁂', accent: '#4a5d8a' }),
  T('paranormal', 'Paranormal Romance', 'Fiction', { body: 'lora', head: 'cinzel', numbering: 'number-only', numSize: 2.4, numCase: 'none', titleSize: 1.4, tracking: 0.1, ornament: '☾', scene: '☾ ✦ ☽', accent: '#4a148c' }),
  T('fairy-tale', 'Fairy Tale', 'Fiction', { body: 'alegreya', head: 'cormorant', scale: 1.08, numbering: 'words', numCase: 'smallcaps', titleItalic: true, titleSize: 2, ornament: '❀', scene: '✿ ❀ ✿', accent: '#2e7d32', dropcap: 'drop', firstLine: 'smallcaps' }),
  T('urban-fantasy', 'Urban Fantasy', 'Fiction', { body: 'pt-serif', head: 'lato', align: 'left', numbering: 'number-only', numSize: 3.4, numCase: 'none', titleWeight: 700, titleCase: 'upper', tracking: 0.12, titleSize: 1.2, scene: '✷', rule: 'above', accent: '#c62828', dropcap: 'raised', firstLine: 'uppercase' }),
  T('space-opera', 'Space Opera', 'Fiction', { body: 'noto-serif', head: 'cinzel', numbering: 'numeral', numCase: 'upper', tracking: 0.25, titleSize: 1.4, ornament: '✧', scene: '✧ ✧ ✧', rule: 'double', accent: '#283593' }),
  T('cyberpunk', 'Cyberpunk', 'Fiction', { body: 'source-serif', head: 'roboto', align: 'left', numbering: 'number-only', numSize: 3.6, numCase: 'none', titleWeight: 300, titleCase: 'upper', tracking: 0.35, titleSize: 1.1, scene: '// //', rule: 'both', accent: '#00838f', dropcap: 'none', firstLine: 'uppercase' }),
  T('steampunk', 'Steampunk', 'Fiction', { body: 'libre-caslon', head: 'playfair', numbering: 'roman', numCase: 'upper', tracking: 0.12, titleCase: 'upper', titleWeight: 700, titleSize: 1.4, ornament: '⚙', scene: '⚙ ⚙ ⚙', rule: 'double', accent: '#795548' }),
  T('espionage', 'Espionage', 'Fiction', { body: 'pt-serif', head: 'roboto', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.2, titleWeight: 500, titleCase: 'upper', titleSize: 1.1, scene: '— ✕ —', rule: 'below', accent: '#455a64', dropcap: 'none', firstLine: 'uppercase' }),
  T('legal-thriller', 'Legal Thriller', 'Fiction', { body: 'libre-baskerville', head: 'libre-baskerville', scale: 0.95, numbering: 'number-only', numSize: 2.2, numCase: 'none', titleCase: 'upper', tracking: 0.15, titleSize: 1.1, scene: '§ § §', rule: 'both', accent: '#1a237e', firstLine: 'uppercase' }),
  T('middle-grade', 'Middle Grade', 'Fiction', { body: 'literata', head: 'atkinson', scale: 1.1, lh: 1.6, numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.7, scene: '✦ ✦ ✦', accent: '#00897b', dropcap: 'raised', justify: false, firstLine: 'none' }),
  T('early-reader', 'Early Reader', 'Fiction', { body: 'atkinson', head: 'atkinson', scale: 1.4, lh: 1.8, numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.6, indent: 0, gap: 0.8, justify: false, scene: '☆ ☆ ☆', accent: '#1e88e5', dropcap: 'none', firstLine: 'none' }),
  T('biography', 'Biography', 'Nonfiction', { body: 'spectral', head: 'spectral', numbering: 'words', numCase: 'smallcaps', tracking: 0.05, titleSize: 1.7, titleItalic: true, scene: '—', rule: 'below', firstLine: 'smallcaps' }),
  T('self-help', 'Self-Help', 'Nonfiction', { body: 'merriweather', head: 'lato', scale: 0.94, align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.15, titleWeight: 800, titleSize: 1.8, indent: 0, gap: 0.8, justify: false, scene: '● ● ●', accent: '#ef6c00', dropcap: 'none', firstLine: 'none' }),
  T('travel', 'Travel', 'Nonfiction', { body: 'lora', head: 'playfair', align: 'left', numbering: 'number-only', numSize: 3, numCase: 'none', titleItalic: true, titleSize: 1.9, scene: '✈', rule: 'above', accent: '#00695c', dropcap: 'raised', firstLine: 'none' }),
  T('cookbook', 'Cookbook', 'Nonfiction', { body: 'source-serif', head: 'playfair', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.12, titleWeight: 700, titleSize: 2, indent: 0, gap: 0.7, justify: false, scene: '❦', rule: 'below', accent: '#bf360c', dropcap: 'none', firstLine: 'none' }),
  T('spiritual', 'Spiritual', 'Nonfiction', { body: 'cormorant', head: 'cinzel', scale: 1.12, lh: 1.6, numbering: 'words', numCase: 'upper', tracking: 0.2, titleSize: 1.4, ornament: '✣', scene: '✣', accent: '#6d4c41' }),

  // ---- World & heritage: Chinese & Japanese, Old English
  T('mincho', 'Mincho', 'World & Heritage', { body: 'shippori', head: 'shippori', lh: 1.75, numbering: 'cjk', numCase: 'none', numSize: 1.4, titleSize: 1.8, ornament: '〇', scene: '〜', accent: '#b91c1c', dropcap: 'none', firstLine: 'none' }),
  T('kyoto', 'Kyoto', 'World & Heritage', { body: 'shippori', head: 'shippori', scale: 1.02, lh: 1.8, align: 'left', numbering: 'cjk-only', numCase: 'none', numSize: 3.4, titleSize: 1.5, titleWeight: 400, scene: '・・・', rule: 'above', accent: '#7f1d1d', dropcap: 'none', firstLine: 'none', sink: 9 }),
  T('zen', 'Zen', 'World & Heritage', { body: 'shippori', head: 'shippori', lh: 1.9, numbering: 'cjk-only', numCase: 'none', numSize: 2.2, titleSize: 1.3, tracking: 0.25, titleCase: 'upper', ornament: '◯', scene: '◯', accent: '#1c1917', indent: 0, gap: 1, justify: false, dropcap: 'none', firstLine: 'none' }),
  T('haiku', 'Haiku', 'World & Heritage', { body: 'shippori', head: 'cormorant', scale: 1.1, numbering: 'cjk-only', numCase: 'none', numSize: 1.6, titleItalic: true, titleSize: 1.6, indent: 0, gap: 1.2, justify: false, scene: '— 〜 —', accent: '#4d7c0f', dropcap: 'none', firstLine: 'none' }),
  T('ink-scroll', 'Ink Scroll', 'World & Heritage', { body: 'noto-serif', head: 'shippori', numbering: 'cjk', numCase: 'none', numSize: 1.8, titleSize: 1.7, titleWeight: 700, ornament: '❖', scene: '❖', rule: 'double', accent: '#991b1b', dropcap: 'raised', firstLine: 'none' }),
  T('jade', 'Jade', 'World & Heritage', { body: 'shippori', head: 'cinzel', numbering: 'cjk', numCase: 'none', numSize: 1.3, titleSize: 1.4, tracking: 0.12, ornament: '◇ ◆ ◇', scene: '◆', accent: '#047857', firstLine: 'none' }),
  T('tokyo-modern', 'Tokyo Modern', 'World & Heritage', { body: 'shippori', head: 'inter', align: 'left', numbering: 'cjk-only', numCase: 'none', numSize: 4.2, titleWeight: 700, titleSize: 1.3, scene: '／', rule: 'below', accent: '#dc2626', dropcap: 'none', firstLine: 'none' }),
  T('old-english', 'Old English', 'World & Heritage', { body: 'im-fell', head: 'unifraktur', scale: 1.05, numbering: 'roman', numCase: 'none', numSize: 1.6, titleSize: 2, ornament: '❧', scene: '❧', accent: '#7f1d1d', dropcap: 'drop', firstLine: 'smallcaps' }),
  T('blackletter', 'Blackletter', 'World & Heritage', { body: 'eb-garamond', head: 'unifraktur', scale: 1.06, numbering: 'roman-only', numCase: 'none', numSize: 2.4, titleSize: 2.1, ornament: '✠', scene: '✠', rule: 'double', accent: '#111111', dropcap: 'drop' }),
  T('gutenberg', 'Gutenberg', 'World & Heritage', { body: 'im-fell', head: 'unifraktur', scale: 1.08, lh: 1.45, numbering: 'roman', numCase: 'none', numSize: 1.4, titleSize: 1.9, ornament: '☙ ❧', scene: '❦', accent: '#991b1b', dropcap: 'drop', firstLine: 'uppercase' }),
  T('illuminated', 'Illuminated Manuscript', 'World & Heritage', { body: 'eb-garamond', head: 'uncial', scale: 1.08, numbering: 'roman-only', numCase: 'none', numSize: 2, titleSize: 1.8, ornament: '✥', scene: '✥ ✥ ✥', accent: '#1e40af', dropcap: 'drop', firstLine: 'smallcaps' }),
  T('celtic', 'Celtic', 'World & Heritage', { body: 'alegreya', head: 'uncial', numbering: 'words', numCase: 'none', numSize: 1.2, titleSize: 1.9, ornament: '☘', scene: '☘', accent: '#166534', dropcap: 'raised' }),
  T('elizabethan', 'Elizabethan', 'World & Heritage', { body: 'im-fell', head: 'im-fell', scale: 1.08, numbering: 'roman', numCase: 'upper', tracking: 0.15, titleItalic: true, titleSize: 1.8, ornament: '❦', scene: '❦', accent: '#5b21b6', dropcap: 'drop', firstLine: 'smallcaps' }),
  T('chancery', 'Chancery', 'World & Heritage', { body: 'im-fell', head: 'cormorant', scale: 1.06, numbering: 'words', numCase: 'smallcaps', titleItalic: true, titleSize: 2.1, ornament: '⁂', scene: '⁂', rule: 'below', accent: '#78350f' }),
  T('broadside', 'Broadside', 'World & Heritage', { body: 'im-fell', head: 'playfair', numbering: 'roman', numCase: 'upper', tracking: 0.12, titleCase: 'upper', titleWeight: 700, titleSize: 1.5, scene: '☞ ☜', rule: 'double', accent: '#111111', firstLine: 'uppercase' }),

  // ---- more genres and moods
  T('epistolary', 'Letters & Diaries', 'Fiction', { body: 'libre-baskerville', head: 'cormorant', scale: 0.95, align: 'left', numbering: 'none', titleItalic: true, titleSize: 1.6, indent: 0, gap: 0.8, justify: false, scene: '~', dropcap: 'none', firstLine: 'none', accent: '#57534e' }),
  T('typewriter', 'Typewriter Manuscript', 'General', { body: 'courier-prime', head: 'courier-prime', scale: 0.92, lh: 1.8, align: 'left', numbering: 'numeral', numCase: 'upper', titleCase: 'upper', titleSize: 1, numSize: 1, scene: '#', justify: false, dropcap: 'none', firstLine: 'none', accent: '#111111' }),
  T('newspaper', 'Newspaper', 'General', { body: 'pt-serif', head: 'playfair', scale: 0.95, lh: 1.4, align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.15, titleWeight: 800, titleSize: 2.2, rule: 'double', scene: '■', dropcap: 'raised', firstLine: 'uppercase', accent: '#111111' }),
  T('magazine', 'Magazine', 'General', { body: 'source-serif', head: 'playfair', align: 'left', numbering: 'number-only', numSize: 4.4, numCase: 'none', titleItalic: true, titleSize: 2.4, scene: '●', rule: 'none', dropcap: 'drop', firstLine: 'uppercase', accent: '#be123c' }),
  T('pastel', 'Pastel', 'General', { body: 'lora', head: 'lato', numbering: 'number-only', numSize: 2.6, numCase: 'none', titleWeight: 300, titleSize: 1.6, scene: '♡', accent: '#db2777', dropcap: 'raised', firstLine: 'none' }),
  T('midnight', 'Midnight', 'General', { body: 'spectral', head: 'cinzel', numbering: 'roman', numCase: 'upper', tracking: 0.25, titleSize: 1.3, ornament: '☾', scene: '☾ ✦ ☽', accent: '#1e3a8a' }),
  T('bold-statement', 'Bold Statement', 'General', { body: 'merriweather', head: 'roboto', align: 'left', numbering: 'number-only', numSize: 6, numCase: 'none', titleWeight: 900, titleCase: 'upper', titleSize: 1.6, tracking: 0.02, scene: '▬', rule: 'none', dropcap: 'none', firstLine: 'none', accent: '#ea580c' }),
  T('botanical', 'Botanical', 'Nonfiction', { body: 'crimson-pro', head: 'cormorant', scale: 1.08, numbering: 'words', numCase: 'smallcaps', titleItalic: true, titleSize: 1.9, ornament: '❦', scene: '✿ ❦ ✿', accent: '#3f6212' }),
  T('nautical', 'Nautical', 'Fiction', { body: 'libre-caslon', head: 'cinzel', numbering: 'roman', numCase: 'upper', tracking: 0.2, titleSize: 1.4, ornament: '⚓', scene: '〰', rule: 'both', accent: '#1e3a8a' }),
  T('pirate', 'Pirate Tale', 'Fiction', { body: 'im-fell', head: 'playfair', numbering: 'words', numCase: 'upper', tracking: 0.08, titleWeight: 700, titleSize: 1.8, ornament: '☠', scene: '⚔', accent: '#7c2d12' }),
  T('mythology', 'Mythology', 'Fiction', { body: 'eb-garamond', head: 'cinzel', scale: 1.06, numbering: 'roman-only', numSize: 2.4, numCase: 'none', titleSize: 1.5, tracking: 0.15, ornament: '⚡', scene: '⟡', rule: 'double', accent: '#a16207' }),
  T('dystopian', 'Dystopian', 'Fiction', { body: 'noto-serif', head: 'roboto', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.4, titleWeight: 300, titleCase: 'upper', titleSize: 1.1, scene: '▪ ▪ ▪', rule: 'above', dropcap: 'none', firstLine: 'uppercase', accent: '#525252' }),
  T('military', 'Military History', 'Nonfiction', { body: 'pt-serif', head: 'roboto', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.25, titleWeight: 700, titleCase: 'upper', titleSize: 1.3, scene: '★', rule: 'below', dropcap: 'none', firstLine: 'none', accent: '#3f6212' }),
  T('history', 'History', 'Nonfiction', { body: 'libre-caslon', head: 'libre-caslon', numbering: 'words', numCase: 'smallcaps', tracking: 0.06, titleSize: 1.7, ornament: '⁂', scene: '⁂', rule: 'below', firstLine: 'smallcaps', accent: '#7c2d12' }),
  T('philosophy', 'Philosophy', 'Nonfiction', { body: 'crimson-pro', head: 'crimson-pro', scale: 1.06, numbering: 'roman', numCase: 'smallcaps', titleItalic: true, titleSize: 1.6, scene: '§', dropcap: 'none', firstLine: 'smallcaps', accent: '#334155' }),
  T('popular-science', 'Popular Science', 'Nonfiction', { body: 'source-serif', head: 'inter', align: 'left', numbering: 'number-only', numSize: 3.4, numCase: 'none', titleWeight: 700, titleSize: 1.6, scene: '◎', rule: 'above', dropcap: 'none', firstLine: 'none', accent: '#0369a1' }),
  T('technical', 'Technical Manual', 'Nonfiction', { body: 'noto-serif', head: 'roboto', scale: 0.94, align: 'left', numbering: 'numeral', numCase: 'none', titleWeight: 700, titleSize: 1.5, indent: 0, gap: 0.7, justify: false, scene: '—', dropcap: 'none', firstLine: 'none', accent: '#0f766e', sink: 3 }),
  T('workbook', 'Workbook', 'Nonfiction', { body: 'atkinson', head: 'atkinson', align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.12, titleWeight: 700, titleSize: 1.7, indent: 0, gap: 0.9, justify: false, scene: '✎', rule: 'below', dropcap: 'none', firstLine: 'none', accent: '#7c3aed' }),
  T('journal', 'Journal', 'Nonfiction', { body: 'lora', head: 'cormorant', align: 'left', numbering: 'none', titleItalic: true, titleSize: 2, indent: 0, gap: 1, justify: false, scene: '✦', dropcap: 'none', firstLine: 'none', accent: '#a16207' }),
  T('gardening', 'Gardening', 'Nonfiction', { body: 'merriweather', head: 'lora', scale: 0.94, numbering: 'numeral', numCase: 'none', titleItalic: true, titleSize: 1.9, ornament: '✿', scene: '❀', accent: '#4d7c0f', dropcap: 'raised', firstLine: 'none' }),
  T('sports', 'Sports', 'Nonfiction', { body: 'pt-serif', head: 'roboto', align: 'left', numbering: 'number-only', numSize: 4.6, numCase: 'none', titleWeight: 900, titleCase: 'upper', titleSize: 1.4, scene: '▲', rule: 'below', dropcap: 'none', firstLine: 'uppercase', accent: '#1d4ed8' }),
  T('bedtime', 'Bedtime Stories', 'Fiction', { body: 'atkinson', head: 'lora', scale: 1.22, lh: 1.75, numbering: 'none', titleItalic: true, titleSize: 2, scene: '☾ ⋆ ☽', accent: '#4338ca', dropcap: 'raised', justify: false, firstLine: 'none' }),
  T('comic-novel', 'Comic Novel', 'Fiction', { body: 'literata', head: 'lato', numbering: 'number-only', numSize: 3.2, numCase: 'none', titleWeight: 900, titleSize: 1.7, scene: '✱ ✱ ✱', accent: '#f59e0b', dropcap: 'raised', firstLine: 'none' }),
  T('medical', 'Medical', 'Nonfiction', { body: 'source-serif', head: 'inter', scale: 0.95, align: 'left', numbering: 'numeral', numCase: 'upper', tracking: 0.1, titleWeight: 600, titleSize: 1.5, indent: 0, gap: 0.7, justify: false, scene: '+', dropcap: 'none', firstLine: 'none', accent: '#0e7490' }),
  T('legal-brief', 'Legal Brief', 'Nonfiction', { body: 'libre-baskerville', head: 'libre-baskerville', scale: 0.92, lh: 1.6, align: 'left', numbering: 'roman', numCase: 'upper', titleCase: 'upper', titleSize: 1.2, tracking: 0.08, scene: '§', rule: 'none', dropcap: 'none', firstLine: 'none', accent: '#111111' }),
  T('arctic', 'Arctic', 'Fiction', { body: 'noto-serif', head: 'lato', numbering: 'words', numCase: 'upper', tracking: 0.35, titleWeight: 300, titleSize: 1.4, ornament: '❄', scene: '❄', accent: '#0e7490', firstLine: 'none' }),
  T('desert', 'Desert', 'Fiction', { body: 'alegreya', head: 'cinzel', numbering: 'roman', numCase: 'upper', tracking: 0.2, titleSize: 1.4, ornament: '☀', scene: '∴', accent: '#b45309' }),
  T('ocean', 'Ocean', 'Fiction', { body: 'lora', head: 'playfair', numbering: 'words', numCase: 'smallcaps', titleItalic: true, titleSize: 2, ornament: '〰', scene: '〰 〰', accent: '#0369a1' }),
  T('victorian', 'Victorian', 'Fiction', { body: 'libre-baskerville', head: 'playfair', scale: 0.95, numbering: 'roman', numCase: 'upper', tracking: 0.12, titleItalic: true, titleSize: 1.8, ornament: '❦', scene: '❦', rule: 'double', accent: '#581c87', dropcap: 'drop', firstLine: 'smallcaps' }),
  T('literary-modern', 'Literary Modern', 'Literary', { body: 'source-serif', head: 'source-serif', align: 'left', numbering: 'number-only', numSize: 1.6, numCase: 'none', titleItalic: true, titleSize: 1.5, scene: '◦', dropcap: 'none', firstLine: 'none', accent: '#404040', sink: 8 }),
];

/**
 * Apply the author's case preferences to a template.
 * book.firstLine: 'normal' (default) | 'smallcaps' | 'uppercase' | 'template'
 * book.headingCase: 'template' (default) | 'normal'
 */
export function withCasePrefs(tpl, book = {}) {
  const t = { ...tpl };
  const fl = book.firstLine || 'normal';
  t.firstLine = fl === 'template' ? tpl.firstLine : fl === 'normal' ? 'none' : fl;
  if (book.headingCase === 'normal') {
    t.numCase = 'none';
    t.titleCase = 'none';
    t.tracking = 0;
    if (t.head === 'cinzel') t.head = 'eb-garamond'; // Cinzel has no lowercase letters
  }
  t.normalHeadings = book.headingCase === 'normal';
  return t;
}

/* ---- custom templates: designed by the author, stored in book.yaml (and the user's library). */
let CUSTOM = [];
const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const glyphs = (v, d) => String(v ?? d).replace(/[<>\\\u0000-\u001f\u007f]/g, '').slice(0, 16);
export const TEMPLATE_OPTIONS = {
  numbering: ['words', 'numeral', 'roman', 'number-only', 'roman-only', 'cjk', 'cjk-only', 'none'],
  heading: ['both', 'title', 'number'],
  numCase: ['smallcaps', 'upper', 'none'], titleCase: ['none', 'upper'], align: ['center', 'left'],
  rule: ['none', 'above', 'below', 'both', 'double'], dropcap: ['drop', 'raised', 'none'], firstLine: ['smallcaps', 'uppercase', 'none'],
};
/** Validate a custom template so a shared book can't inject anything into CSS. */
/** Where a custom template came from. Older ones named "Classic (Custom)" were customized from Classic. */
function templateOrigin(t) {
  let baseId = /^[a-z0-9-]{1,48}$/.test(t?.baseId || '') ? t.baseId : '';
  let baseName = String(t?.baseName || '').replace(/[<>]/g, '').slice(0, 60);
  if (!baseId && !t?.origin) {
    const m = /^(.+) \(Custom\)$/.exec(String(t?.name || ''));
    const b = m && TEMPLATES.find((x) => x.name === m[1]);
    if (b) { baseId = b.id; baseName = b.name; }
  }
  const origin = t?.origin === 'new' || t?.origin === 'changed' ? t.origin : TEMPLATES.some((x) => x.id === baseId) ? 'changed' : 'new';
  return { origin, baseId, baseName: baseName || TEMPLATES.find((x) => x.id === baseId)?.name || '' };
}
export function sanitizeTemplate(t, fontIds) {
  const base = T('x', 'x', 'Custom', {});
  const ok = (id, d) => (!fontIds || fontIds.includes(id) ? id : d);
  return {
    ...base,
    id: /^custom-[a-z0-9-]{1,40}$/.test(t?.id || '') ? t.id : `custom-${Date.now().toString(36)}`,
    name: String(t?.name || 'My Template').replace(/[<>]/g, '').slice(0, 60),
    category: 'My Templates', custom: true,
    body: ok(String(t?.body || base.body), base.body), head: ok(String(t?.head || base.head), base.head),
    scale: num(t?.scale, 0.7, 1.6, 1), lh: num(t?.lh, 1.1, 2.2, 1.5), indent: num(t?.indent, 0, 4, 1.4), gap: num(t?.gap, 0, 2, 0),
    justify: t?.justify !== false, align: pick(t?.align, TEMPLATE_OPTIONS.align, 'center'),
    numbering: pick(t?.numbering, TEMPLATE_OPTIONS.numbering, 'words'), heading: pick(t?.heading, TEMPLATE_OPTIONS.heading, t?.numbering === 'none' ? 'title' : 'both'), numCase: pick(t?.numCase, TEMPLATE_OPTIONS.numCase, 'smallcaps'),
    numSize: num(t?.numSize, 0.6, 6, 1.05), titleSize: num(t?.titleSize, 0.8, 3.5, 1.9), titleWeight: num(t?.titleWeight, 100, 900, 400),
    titleItalic: !!t?.titleItalic, titleCase: pick(t?.titleCase, TEMPLATE_OPTIONS.titleCase, 'none'), tracking: num(t?.tracking, 0, 0.5, 0),
    sink: num(t?.sink, 0, 14, 7), ornament: glyphs(t?.ornament, ''), scene: glyphs(t?.scene, '* * *') || '* * *',
    rule: pick(t?.rule, TEMPLATE_OPTIONS.rule, 'none'), dropcap: pick(t?.dropcap, TEMPLATE_OPTIONS.dropcap, 'drop'),
    firstLine: pick(t?.firstLine, TEMPLATE_OPTIONS.firstLine, 'smallcaps'),
    accent: /^#[0-9a-f]{6}$/i.test(t?.accent || '') ? t.accent : '#1f1f1f',
    // A picture ornament: an image in the book's assets folder, its width in ems, and (library copies only) the image itself.
    ornamentImg: /^assets\/[A-Za-z0-9_\-./]{1,120}\.(png|jpe?g)$/.test(t?.ornamentImg || '') && !String(t.ornamentImg).includes('..') ? t.ornamentImg : '',
    ornamentImgW: num(t?.ornamentImgW, 1, 20, 6),
    // Where it came from: 'changed' (a built-in design you customized) or 'new' (your own design).
    ...templateOrigin(t),
    ...(typeof t?.ornamentData === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(t.ornamentData) && t.ornamentData.length < 400000 ? { ornamentData: t.ornamentData } : {}),
  };
}
/** Make a book's custom templates available to templateById (call when a book loads or before export). */
export function setCustomTemplates(list) {
  CUSTOM = (Array.isArray(list) ? list : []).slice(0, 100).map((t) => sanitizeTemplate(t));
}
export const customTemplates = () => CUSTOM;

export function templateById(id) {
  return CUSTOM.find((t) => t.id === id) || TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

const q = (s) => JSON.stringify(String(s));

/**
 * CSS for one template.
 * scope: selector prefix for the book root, e.g. '.bk.tpl-classic'
 * opts: { bodyFont (override id), dropCaps (bool), color (bool), ctx: 'device'|'print'|'epub' }
 */
export function templateCss(tpl, scope, opts = {}) {
  const s = scope;
  const body = fontStack(opts.bodyFont || tpl.body);
  const head = fontStack(tpl.head);
  const accent = opts.color === false ? '#111' : tpl.accent;
  const ctx = opts.ctx || 'device';
  const textTransform = (c) => (c === 'upper' ? 'uppercase' : 'none');
  const variant = (c) => (c === 'smallcaps' ? 'small-caps' : 'normal');
  const rules = {
    none: '', above: 'border-top:2px solid currentColor;padding-top:.8em;',
    below: 'border-bottom:1px solid currentColor;padding-bottom:.8em;',
    both: 'border-top:1px solid currentColor;border-bottom:1px solid currentColor;padding:.8em 0;',
    double: 'border-top:3px double currentColor;border-bottom:3px double currentColor;padding:.8em 0;',
  };
  const sink = ctx === 'print' ? tpl.sink : ctx === 'epub' ? tpl.sink * 0.5 : tpl.sink * 0.45;
  let css = `
${s}{font-family:${body};font-size:${tpl.scale}em;line-height:${tpl.lh};}
${s} .bk-body p{margin:0 0 ${tpl.gap}em 0;text-indent:${tpl.indent}em;text-align:${tpl.justify ? 'justify' : 'left'};}
${s} .bk-body > p:first-child, ${s} .bk-body > p:first-of-type, ${s} .bk-scene + p, ${s} .bk-body h2 + p, ${s} .bk-body h3 + p, ${s} .bk-body blockquote + p{text-indent:0;}
${s} .bk-head{text-align:${tpl.align};margin:${sink}em 0 2.2em 0;${rules[tpl.rule] || ''}}
${s} .bk-num{font-family:${head};font-size:${tpl.numSize}em;font-variant:${variant(tpl.numCase)};text-transform:${textTransform(tpl.numCase)};letter-spacing:${tpl.tracking}em;margin:0 0 .35em 0;color:${accent};line-height:1.1;}
${s} .bk-title{font-family:${head};font-size:${tpl.titleSize}em;font-weight:${tpl.titleWeight};font-style:${tpl.titleItalic ? 'italic' : 'normal'};text-transform:${textTransform(tpl.titleCase)};letter-spacing:${tpl.titleCase === 'upper' ? tpl.tracking : 0}em;margin:0;line-height:1.2;}
${s} .bk-orn{font-family:${head};color:${accent};margin-top:.7em;font-size:1.2em;}
${s} .bk-subtitle{font-family:${head};font-size:1.05em;font-style:italic;font-weight:400;margin:.5em 0 0;text-indent:0;letter-spacing:0;text-transform:none;opacity:.85;}
${s} .bk-scene::before{content:${q(tpl.scene)};color:${accent};font-family:${head};letter-spacing:.2em;}
${s} .bk-body h2, ${s} .bk-body h3, ${s} .bk-body h4{font-family:${head};}
${s} .bk-gen-title{font-family:${head};text-align:${tpl.align};font-weight:${tpl.titleWeight};font-style:${tpl.titleItalic ? 'italic' : 'normal'};text-transform:${textTransform(tpl.titleCase)};letter-spacing:${tpl.titleCase === 'upper' ? tpl.tracking : 0}em;}
${s} .t-title-page .bk-tp-title{font-family:${head};font-weight:${tpl.titleWeight};font-style:${tpl.titleItalic ? 'italic' : 'normal'};text-transform:${textTransform(tpl.titleCase)};letter-spacing:${tpl.tracking}em;}
${s} .t-title-page .bk-tp-orn::before{content:${q(tpl.ornament || tpl.scene)};color:${accent};}
`;
  if (tpl.firstLine !== 'none' && opts.dropCaps && tpl.dropcap !== 'none') {
    css += `${s} .dc .bk-body > p:first-of-type::first-line{font-family:inherit;font-weight:inherit;font-style:inherit;font-variant:normal;font-synthesis:none;text-transform:uppercase;${tpl.firstLine === 'smallcaps' ? 'font-size:.8em;letter-spacing:.06em;' : 'letter-spacing:.05em;'}}\n`;
  }
  if (opts.dropCaps && tpl.dropcap !== 'none') {
    // The drop cap sits inside ::first-line, so undo any size change made to the opening line.
    const k = tpl.firstLine === 'smallcaps' ? 1 / 0.8 : 1;
    const em = (v) => `${+(v * k).toFixed(3)}em`;
    css += tpl.dropcap === 'raised'
      ? `${s} .dc .bk-body > p:first-of-type::first-letter{font-family:${head};font-size:${em(2.6)};line-height:1;color:${accent};font-weight:${Math.max(400, tpl.titleWeight)};}\n`
      : `${s} .dc .bk-body > p:first-of-type::first-letter{float:left;font-family:${head};font-size:${em(3.55)};line-height:.82;padding:.06em .08em 0 0;margin-top:.04em;color:${accent};font-weight:${tpl.titleWeight};font-style:normal;}\n`;
  }
  // Display pages and reference lists keep their own alignment regardless of body justification.
  css += `${s} .t-title-page .bk-body p, ${s} .t-dedication .bk-body p, ${s} .t-epigraph .bk-body p{text-align:center;text-indent:0;}
${s} .t-copyright .bk-body p, ${s} .bk-bib p, ${s} .bk-index p, ${s} .bk-about .bk-body p{text-align:left;text-indent:0;}
${s} .bk-bib p{text-indent:-2em;}
${s} .bk-index .ix-letter{break-after:avoid;page-break-after:avoid;}\n`;
  if (tpl.normalHeadings) {
    css += `${s} .bk-num, ${s} .bk-title, ${s} .bk-gen-title, ${s} .t-title-page .bk-tp-title, ${s} .t-title-page .bk-tp-author, ${s} .t-title-page .bk-tp-pub, ${s} .bk-notes h2, ${s} .bk-endnotes h3{text-transform:none;font-variant:normal;letter-spacing:normal;}\n`;
  }
  if (!tpl.ornament && !tpl.ornamentImg) css += `${s} .bk-orn{display:none}\n`;
  else if (tpl.ornament) css += `${s} .bk-orn:not(.bk-orn-pic)::before{content:${q(tpl.ornament)};}\n`;
  if (!tpl.ornamentImg) css += `${s} .bk-orn-pic{display:none}\n`;
  css += `${s} .bk-orn-pic{line-height:0;margin-top:.9em;}\n${s} .bk-orn-pic img{width:${tpl.ornamentImgW || 6}em;max-width:70%;height:auto;display:inline-block;}\n`;
  return css;
}

/** Template-independent book CSS. ctx: 'device' | 'print' | 'epub'. */
export function baseCss(scope = '.bk', ctx = 'device') {
  const s = scope;
  return `
${s}{color:inherit;hyphens:auto;-webkit-hyphens:auto;overflow-wrap:break-word;font-kerning:normal;font-variant-ligatures:common-ligatures;widows:2;orphans:2;}
${s} .bk-sec{margin:0;padding:0;}
${s} .bk-head{break-after:avoid;page-break-after:avoid;break-inside:avoid;}
${s} .bk-body h2.bk-h1{font-size:1.5em;margin:1.6em 0 .7em;}
${s} .bk-align-center>*{text-align:center;text-indent:0!important;}
${s} .bk-align-right>*{text-align:right;text-indent:0!important;}
${s} .bk-align-left>*{text-align:left;}
${s} .bk-align-justify>*{text-align:justify;}
${s} .bk-align-verse{margin:1em 0 1em 2.2em;}
${s} .bk-align-verse>p{text-align:left!important;text-indent:0!important;hyphens:manual;-webkit-hyphens:manual;margin:0 0 .9em!important;}
${s} .bk-align-verse>p:last-child{margin-bottom:0!important;}
${s} .bk-align-hanging>p{text-align:left!important;text-indent:-2em!important;padding-left:2em;margin:0 0 .45em!important;}
${s} u{text-decoration:underline;text-decoration-thickness:.06em;text-underline-offset:.15em;}
${s} sub,${s} sup{font-size:.72em;line-height:0;}
${s} .bk-body h2{font-size:1.25em;margin:1.4em 0 .6em;font-weight:600;break-after:avoid;page-break-after:avoid;line-height:1.25;}
${s} .bk-body h3{font-size:1.1em;margin:1.2em 0 .5em;font-weight:600;break-after:avoid;page-break-after:avoid;}
${s} .bk-body h4, ${s} .bk-body h5, ${s} .bk-body h6{font-size:1em;margin:1em 0 .4em;font-style:italic;font-weight:400;}
${s} .bk-body blockquote{margin:1em 1.6em;font-style:italic;}
${s} .bk-body blockquote p{text-indent:0;}
${s} .bk-body ul, ${s} .bk-body ol{margin:.6em 0 .6em 1.6em;padding:0;}
${s} .bk-body li p{text-indent:0;margin:0;}
${s} .bk-body ul.bk-bullets{list-style:none;}
${s} .bk-body ul.bk-bullets > li{position:relative;}
${s} .bk-body ul.bk-bullets > li::before{content:attr(data-bullet);position:absolute;left:-1.35em;width:1.1em;text-align:center;text-indent:0;}
${s} .bk-body a{color:inherit;}
${s} .bk-scene{text-align:center;margin:1.1em 0;text-indent:0;break-after:avoid;page-break-after:avoid;}
${s} .bk-pagebreak{display:block;height:0;margin:0;padding:0;border:0;break-after:${ctx === 'epub' ? 'page' : 'column'};page-break-after:always;}
${s} .bk-pagebreak + p{text-indent:0;}
${s} img.bk-img, ${s} .bk-fig{display:block;max-width:100%;height:auto;margin:1em auto;break-inside:avoid;page-break-inside:avoid;}
${s} .bk-fig img{display:block;width:100%;height:auto;}
${s} .bk-img.a-left{margin-left:0;margin-right:auto;}
${s} .bk-img.a-right{margin-left:auto;margin-right:0;}
${s} .bk-img.a-full{width:100%;}
${s} .bk-body{isolation:isolate;}
${s} .w-inline{display:inline-block;vertical-align:baseline;margin:0 .25em;}
${s} .w-square, ${s} .w-tight, ${s} .w-through{float:left;margin:.2em 1.3em .7em 0;}
${s} .w-square.a-right, ${s} .w-tight.a-right, ${s} .w-through.a-right{float:right;margin:.2em 0 .7em 1.3em;}
${s} .w-tight, ${s} .w-through{shape-margin:.8em;shape-image-threshold:.3;}
${s} .bk-fig.w-square, ${s} .bk-fig.w-tight, ${s} .bk-fig.w-through{margin-top:.35em;}
${s} p:has(> .w-square:only-child), ${s} p:has(> .w-tight:only-child), ${s} p:has(> .w-through:only-child){margin:0;text-indent:0;}
${s} p:has(> .w-behind), ${s} p:has(> .w-front){position:relative;height:0;margin:0;text-indent:0;}
${s} .w-behind, ${s} .w-front{position:absolute;top:0;left:0;margin:0;}
${s} .w-behind.a-right, ${s} .w-front.a-right{left:auto;right:0;}
${s} .w-behind.a-center, ${s} .w-front.a-center{left:50%;transform:translateX(-50%);}
${s} .w-behind.a-full, ${s} .w-front.a-full{width:100%;}
${s} .w-behind{z-index:-1;}
${s} .w-front{z-index:2;}
${s} .bk-scene, ${s} .bk-notes, ${s} .bk-body h2, ${s} .bk-body h3{clear:both;}
${s} .bk-cap{display:block;font-size:.85em;font-style:italic;text-align:center;margin-top:.4em;}
${s} sup.fnref{font-size:.7em;line-height:0;vertical-align:super;}
${s} sup.fnref a{text-decoration:none;color:inherit;}
${s} .bk-notes{margin-top:2em;font-size:.85em;line-height:1.4;border-top:1px solid currentColor;padding-top:.6em;}
${s} .bk-notes h2{font-size:1em;margin:0 0 .5em;font-variant:small-caps;font-weight:400;letter-spacing:.05em;}
${s} .bk-notes ol{margin:0;padding-left:1.6em;}
${s} .bk-notes li{margin:0 0 .35em;}
${s} .bk-notes li p{margin:0;text-indent:0;}
${s} .bk-gen-title{font-size:1.6em;margin:${ctx === 'print' ? '5em' : '2em'} 0 1.4em;line-height:1.2;break-after:avoid;}
${s} .t-title-page{text-align:center;padding-top:${ctx === 'print' ? '28%' : '22%'};}
${s} .t-title-page .bk-tp-title{font-size:2.6em;line-height:1.15;margin:0 0 .4em;}
${s} .t-title-page .bk-tp-sub{font-size:1.2em;font-style:italic;margin:0 0 2.5em;}
${s} .t-title-page .bk-tp-orn{margin:0 0 2.5em;font-size:1.3em;}
${s} .t-title-page .bk-tp-author{font-size:1.3em;letter-spacing:.08em;font-variant:small-caps;margin:0;}
${s} .t-title-page .bk-tp-pub{font-size:.85em;margin-top:${ctx === 'print' ? '14em' : '5em'};letter-spacing:.1em;text-transform:uppercase;}
${s} .t-copyright .bk-body{font-size:.78em;padding-top:${ctx === 'print' ? '55%' : '6em'};}
${s} .t-copyright .bk-body p{text-indent:0;margin:0 0 .9em;text-align:left;}
${s} .t-dedication .bk-body, ${s} .t-epigraph .bk-body{padding-top:${ctx === 'print' ? '35%' : '30%'};text-align:center;}
${s} .t-dedication .bk-body p, ${s} .t-epigraph .bk-body p{text-indent:0;text-align:center;margin:0 0 .8em;}
${s} .t-dedication .bk-head, ${s} .t-epigraph .bk-head{display:none;}
${s} .bk-toc{list-style:none;margin:0;padding:0;}
${s} .bk-toc li{display:flex;align-items:baseline;gap:.4em;margin:0 0 .55em;text-indent:0;}
${s} .bk-toc li.g-front, ${s} .bk-toc li.g-back{font-style:italic;}
${s} .bk-toc a{color:inherit;text-decoration:none;}
${s} .bk-toc .lead{flex:1;border-bottom:1px dotted currentColor;opacity:.5;transform:translateY(-.25em);}
${s} .bk-toc .pg{min-width:1.5em;text-align:right;font-variant-numeric:oldstyle-nums;}
${s} .bk-bib p{text-indent:-2em;padding-left:2em;margin:0 0 .7em;text-align:left;overflow-wrap:anywhere;}
${s} .bk-index{column-count:${ctx === 'device' ? 1 : 2};column-gap:1.5em;font-size:.9em;}
${s} .bk-index p{text-indent:0;margin:0 0 .25em;text-align:left;break-inside:avoid;}
${s} .bk-index .ix-letter{font-weight:700;margin-top:.8em;}
${s} .bk-endnotes h3{font-size:1em;font-variant:small-caps;margin:1.2em 0 .4em;font-weight:400;letter-spacing:.05em;}
${s} .bk-endnotes ol{padding-left:1.6em;margin:0;}
${s} .bk-endnotes li{margin:0 0 .4em;font-size:.9em;}
${s} .bk-author-photo{display:block;width:45%;max-width:220px;margin:0 auto 1.4em;border-radius:2px;}
${s} .bk-about .bk-body p{text-indent:0;margin-bottom:.8em;}
${s} .bk-table{margin:1em 0;overflow-x:auto;break-inside:avoid;page-break-inside:avoid;}
${s} .bk-table table{border-collapse:collapse;width:100%;font-size:.88em;line-height:1.35;}
${s} .bk-table th, ${s} .bk-table td{border:1px solid currentColor;padding:.3em .5em;text-align:left;vertical-align:top;text-indent:0;}
${s} .bk-table th{font-weight:700;}
${s} .bk-table thead tr{border-bottom:2px solid currentColor;}
${MATH_CSS(s)}
${CODE_CSS(s)}`;
}
