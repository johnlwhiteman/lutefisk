// Characters: the people of a book, their attributes, and where
// the manuscript mentions them. Pure functions, shared by the app and tests.

export const ROLES = ['Protagonist', 'Antagonist', 'Deuteragonist', 'Love interest', 'Mentor', 'Sidekick', 'Supporting', 'Minor'];

/** Attribute fields offered for a new character (all optional; add your own). */
export const DEFAULT_ATTRIBUTES = ['Age', 'Occupation', 'Appearance', 'Personality', 'Goal', 'Motivation', 'Fear', 'Flaw', 'Strength', 'Backstory', 'Arc'];

export const CHARACTER_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#5e5e63', '#0f8fa8'];

export function newCharacter(id, name = '', i = 0) {
  return { id, name, aliases: [], role: '', color: CHARACTER_COLORS[i % CHARACTER_COLORS.length], matchFirst: true, attrs: DEFAULT_ATTRIBUTES.slice(0, 6).map((k) => ({ k, v: '' })), notes: '' };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The names a character is found by: full name, aliases and (optionally) the first name. */
export function characterNames(c) {
  const out = new Set();
  const name = String(c?.name || '').trim();
  if (name) out.add(name);
  for (const a of Array.isArray(c?.aliases) ? c.aliases : String(c?.aliases || '').split(',')) { const t = String(a).trim(); if (t.length > 1) out.add(t); }
  const first = name.split(/\s+/)[0];
  if (c?.matchFirst !== false && first && first.length > 2 && first !== name && !/^(the|mr|mrs|ms|dr|sir|lady|lord|miss)\.?$/i.test(first)) out.add(first);
  return [...out];
}

/**
 * A regex matching any of the character's names as whole words. Book prose is
 * matched case-sensitively (so "Will" isn't "will"); screenplays also match the
 * all-caps form used in character cues.
 */
export function mentionRegex(c, { screenplay = false } = {}) {
  const names = characterNames(c).sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  const alts = names.flatMap((n) => (screenplay ? [n, n.toUpperCase()] : [n])).map(escapeRe);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...new Set(alts)].join('|')})(?:[’']s)?(?![\\p{L}\\p{N}_])`, 'gu');
}

export function countMentions(text, c, opts) {
  const re = mentionRegex(c, opts);
  if (!re || !text) return 0;
  return (String(text).match(re) || []).length;
}

/**
 * Where each character appears. units: [{id, title, text}] in manuscript order.
 * Returns Map(characterId → [{id, title, count, index}]).
 */
export function appearances(characters, units, opts) {
  const out = new Map();
  for (const c of characters || []) {
    const re = mentionRegex(c, opts);
    const list = [];
    if (re) units.forEach((u, index) => { const n = (String(u.text || '').match(re) || []).length; if (n) list.push({ id: u.id, title: u.title, count: n, index }); });
    out.set(c.id, list);
  }
  return out;
}
