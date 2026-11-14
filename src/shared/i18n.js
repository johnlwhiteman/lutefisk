// Interface languages: the words on Lutefisk's menus, buttons and labels — never
// the words of your book. Strings are looked up by their American English text
// (scripts/locales.tsv → locales.js). Anything not translated yet stays in
// English, so a partial language still works.
import { LOCALES } from './locales.js';

/** [code, name in its own language, English name] */
export const LANGUAGES = [
  ['en-US', 'English (US)', 'English (US)'],
  ['en-GB', 'English (UK)', 'English (UK)'],
  ['de', 'Deutsch', 'German'],
  ['fr', 'Français', 'French'],
  ['it', 'Italiano', 'Italian'],
  ['es', 'Español', 'Spanish'],
  ['pl', 'Polski', 'Polish'],
  ['ru', 'Русский', 'Russian'],
  ['uk', 'Українська', 'Ukrainian'],
  ['id', 'Bahasa Indonesia', 'Indonesian'],
  ['ms', 'Bahasa Melayu', 'Malay'],
  ['vi', 'Tiếng Việt', 'Vietnamese'],
  ['ja', '日本語', 'Japanese'],
  ['zh', '简体中文', 'Chinese (Simplified)'],
  ['ko', '한국어', 'Korean'],
  ['lkt', 'Lakȟótiyapi', 'Lakota (in progress)'],
];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l[0]);

// British spelling for any interface text, not only the listed strings.
const GB = [[/\bColor/g, 'Colour'], [/\bcolor/g, 'colour'], [/\bCenter/g, 'Centre'], [/\bcenter/g, 'centre'], [/\bAnalyz/g, 'Analys'], [/\banalyz/g, 'analys'], [/\bOrganiz/g, 'Organis'], [/\borganiz/g, 'organis'], [/\bGray\b/g, 'Grey'], [/\bgray\b/g, 'grey'], [/\bFavorite/g, 'Favourite'], [/\bfavorite/g, 'favourite'], [/\bAcknowledgments\b/g, 'Acknowledgements'], [/\bCatalog\b/g, 'Catalogue'], [/\bDialog\b/g, 'Dialogue']];

let lang = 'en-US';
let dict = {};
let patterns = [];

/** Choose the interface language (unknown codes fall back to American English). */
export function setLanguage(code) {
  lang = LANGUAGE_CODES.includes(code) ? code : 'en-US';
  dict = LOCALES[lang] || {};
  // "{n} words" → /^(\d[\d,.]*) words$/
  patterns = Object.entries(dict).filter(([k]) => k.includes('{n}')).map(([k, v]) => {
    const re = new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{n\\}', '([\\d][\\d,.\\s]*)')}$`);
    return [re, v];
  });
  return lang;
}
export const getLanguage = () => lang;
export const isEnglish = () => lang === 'en-US';

/** Translate one interface string, or return it unchanged. */
export function t(s) {
  if (lang === 'en-US' || typeof s !== 'string') return s;
  const key = s.trim();
  if (!key) return s;
  let hit = dict[key];
  if (hit === undefined && patterns.length && /\d/.test(key)) {
    for (const [re, v] of patterns) { const m = re.exec(key); if (m) { hit = v.replace('{n}', m[1].trim()); break; } }
  }
  // "843 words · ~3 pages": translate each part.
  if (hit === undefined && key.includes(' · ')) { const parts = key.split(' · ').map((x) => t(x)); if (parts.join(' · ') !== key) hit = parts.join(' · '); }
  if (hit === undefined && key.startsWith('~') && key.length > 1) { const r = t(key.slice(1)); if (r !== key.slice(1)) hit = `~${r}`; }
  if (hit === undefined && lang === 'en-GB') { let o = key; for (const [a, b] of GB) o = o.replace(a, b); if (o !== key) hit = o; }
  if (hit === undefined) return s;
  return key === s ? hit : s.replace(key, hit);
}
