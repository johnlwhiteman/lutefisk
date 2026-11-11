// Fonts available in Lutefisk. Bundled fonts are SIL Open Font License fonts
// shipped inside the app (no web font CDN is ever contacted). "System" fonts
// are the reading fonts built into popular devices; they are used when present
// on this computer and otherwise fall back to the closest bundled face.
export const FONTS = [
  // Bundled serif reading faces
  { id: 'literata', family: 'Literata', pkg: 'literata', kind: 'serif', note: 'Google Play Books default' },
  { id: 'eb-garamond', family: 'EB Garamond', pkg: 'eb-garamond', kind: 'serif' },
  { id: 'merriweather', family: 'Merriweather', pkg: 'merriweather', kind: 'serif' },
  { id: 'lora', family: 'Lora', pkg: 'lora', kind: 'serif' },
  { id: 'crimson-pro', family: 'Crimson Pro', pkg: 'crimson-pro', kind: 'serif' },
  { id: 'libre-baskerville', family: 'Libre Baskerville', pkg: 'libre-baskerville', kind: 'serif' },
  { id: 'source-serif', family: 'Source Serif 4', pkg: 'source-serif-4', kind: 'serif' },
  { id: 'noto-serif', family: 'Noto Serif', pkg: 'noto-serif', kind: 'serif', note: 'Android default serif' },
  { id: 'pt-serif', family: 'PT Serif', pkg: 'pt-serif', kind: 'serif' },
  { id: 'libre-caslon', family: 'Libre Caslon Text', pkg: 'libre-caslon-text', kind: 'serif' },
  { id: 'spectral', family: 'Spectral', pkg: 'spectral', kind: 'serif' },
  { id: 'alegreya', family: 'Alegreya', pkg: 'alegreya', kind: 'serif' },
  { id: 'cormorant', family: 'Cormorant Garamond', pkg: 'cormorant-garamond', kind: 'serif' },
  // Display faces (headings)
  { id: 'jetbrains-mono', family: 'JetBrains Mono', pkg: 'jetbrains-mono', kind: 'mono', note: 'Code' },
  { id: 'shippori', family: 'Shippori Mincho', pkg: 'shippori-mincho', kind: 'serif', note: 'Japanese Mincho style' },
  { id: 'tiro-sanskrit', family: 'Tiro Devanagari Sanskrit', pkg: 'tiro-devanagari-sanskrit', kind: 'serif', note: 'Latin + Devanagari', extraSubsets: ['devanagari'] },
  { id: 'im-fell', family: 'IM Fell English', pkg: 'im-fell-english', kind: 'serif', note: '17th-century English printing' },
  { id: 'unifraktur', family: 'UnifrakturMaguntia', pkg: 'unifrakturmaguntia', kind: 'display', note: 'Blackletter / Old English' },
  { id: 'uncial', family: 'Uncial Antiqua', pkg: 'uncial-antiqua', kind: 'display', note: 'Insular / Celtic uncial' },
  { id: 'playfair', family: 'Playfair Display', pkg: 'playfair-display', kind: 'display' },
  { id: 'cinzel', family: 'Cinzel', pkg: 'cinzel', kind: 'display' },
  // Bundled sans faces
  { id: 'open-sans', family: 'Open Sans', pkg: 'open-sans', kind: 'sans' },
  { id: 'roboto', family: 'Roboto', pkg: 'roboto', kind: 'sans', note: 'Android system font' },
  { id: 'inter', family: 'Inter', pkg: 'inter', kind: 'sans' },
  { id: 'lato', family: 'Lato', pkg: 'lato', kind: 'sans' },
  { id: 'atkinson', family: 'Atkinson Hyperlegible', pkg: 'atkinson-hyperlegible', kind: 'sans', note: 'Accessibility' },
  { id: 'opendyslexic', family: 'OpenDyslexic', pkg: 'opendyslexic', kind: 'sans', note: 'Accessibility (Kindle/Kobo option)' },
  // Screenplay face (Courier metrics, designed for scripts)
  { id: 'courier-prime', family: 'Courier Prime', pkg: 'courier-prime', kind: 'mono', note: 'Screenplays' },
  // Device-native fonts (not redistributable; used if installed locally)
  { id: 'bookerly', family: 'Bookerly', kind: 'serif', system: true, fallback: 'Literata', note: 'Kindle default' },
  { id: 'georgia', family: 'Georgia', kind: 'serif', system: true, fallback: 'Merriweather', note: 'Kobo, Nook, Apple Books' },
  { id: 'palatino', family: 'Palatino', kind: 'serif', system: true, fallback: 'EB Garamond', note: 'Apple Books' },
  { id: 'charter', family: 'Charter', kind: 'serif', system: true, fallback: 'Source Serif 4', note: 'Apple Books' },
  { id: 'iowan', family: 'Iowan Old Style', kind: 'serif', system: true, fallback: 'Libre Caslon Text', note: 'Apple Books' },
  { id: 'baskerville', family: 'Baskerville', kind: 'serif', system: true, fallback: 'Libre Baskerville', note: 'Apple Books, Kindle' },
  { id: 'caecilia', family: 'Caecilia', kind: 'serif', system: true, fallback: 'Merriweather', note: 'Older Kindles' },
  { id: 'helvetica', family: 'Helvetica', kind: 'sans', system: true, fallback: 'Inter', note: 'Kindle, Apple' },
];

export function fontById(id) {
  return FONTS.find((f) => f.id === id);
}

/** CSS font-family stack for a font id. */
export function fontStack(id) {
  const f = fontById(id);
  if (!f) return "'Literata', Georgia, serif";
  const generic = f.kind === 'sans' ? 'sans-serif' : 'serif';
  return f.system
    ? `'${f.family}', '${f.fallback}', ${generic}`
    : `'${f.family}', ${generic}`;
}
