// Daily-goal presets: write like a famous author. Each sets a daily target in
// words, writing time (minutes) and/or pages — a day counts as met when every
// part that's set is met. Figures are the authors' own accounts as commonly
// reported (memoirs and interviews); `note` says where each comes from.
export const WORDS_PER_PAGE = 275; // the same estimate the Goals print length uses

export const GOAL_PRESETS = [
  { id: 'king', name: 'Stephen King', words: 2000, note: 'In On Writing he describes 2,000 words a day, every day — a first draft in about three months.' },
  { id: 'angelou', name: 'Maya Angelou', minutes: 300, note: 'She kept a hotel room, arrived about 6:30 a.m., and wrote through the morning — about five hours a day.' },
  { id: 'hemingway', name: 'Ernest Hemingway', words: 500, note: 'He wrote from first light until about noon, counted his words, and was content with around 500.' },
  { id: 'woolf', name: 'Virginia Woolf', minutes: 180, note: 'For most of her life she wrote fiction from about 10 a.m. to 1 p.m. — three hours each morning.' },
  { id: 'murakami', name: 'Haruki Murakami', words: 1600, minutes: 300, note: 'Ten Japanese manuscript pages (about 1,600 English words) a day, in five to six hours starting at 4 a.m.' },
  { id: 'atwood', name: 'Margaret Atwood', words: 1000, note: 'She aims for 1,000 to 2,000 words a day; this preset uses the lower figure.' },
  { id: 'trollope', name: 'Anthony Trollope', pages: 10, minutes: 180, note: 'From 5:30 to 8:30 a.m. with his watch in front of him: 250 words every quarter hour, over ten pages a day.' },
  { id: 'oates', name: 'Joyce Carol Oates', minutes: 270, note: 'She writes intensely in the morning, from about 8:30 a.m. to 1 p.m. — four and a half hours.' },
  { id: 'sparks', name: 'Nicholas Sparks', words: 2000, minutes: 300, note: 'About 2,000 words a day, which he says takes five to six hours.' },
  { id: 'roberts', name: 'Nora Roberts', minutes: 360, note: 'In the normal course of events she works six to eight hours a day; this preset uses six.' },
];

/** A short label for a preset's targets: "2,000 words", "3 h", "10 pages + 3 h". */
export function describeGoal({ words = 0, minutes = 0, pages = 0 } = {}) {
  const parts = [];
  if (words > 0) parts.push(`${Math.round(words).toLocaleString('en-US')} words`);
  if (pages > 0) parts.push(`${pages} ${pages === 1 ? 'page' : 'pages'}`);
  if (minutes > 0) parts.push(minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`);
  return parts.join(' + ');
}

/**
 * How far a day got toward a goal. day: { words, minutes }. goal: { words,
 * minutes, pages }. Returns { pct (0–1, the least-complete part), met, parts }.
 */
export function goalProgress(day, goal) {
  const parts = [];
  const words = Math.max(0, day.words || 0);
  if (goal.words > 0) parts.push({ kind: 'words', cur: words, target: goal.words });
  if (goal.pages > 0) parts.push({ kind: 'pages', cur: words / WORDS_PER_PAGE, target: goal.pages });
  if (goal.minutes > 0) parts.push({ kind: 'minutes', cur: Math.max(0, day.minutes || 0), target: goal.minutes });
  if (!parts.length) return { pct: 0, met: false, parts };
  const pct = Math.min(...parts.map((p) => Math.min(1, p.cur / p.target)));
  return { pct, met: parts.every((p) => p.cur >= p.target), parts };
}
