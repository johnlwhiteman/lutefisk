// Story time for the plot Timeline: sort keys for free-text "when" labels,
// the order events happen in, and which scenes are told as flashbacks.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/**
 * A sort key for a free-text story time, as a list of numbers compared in turn:
 * a calendar date gives [year, month, day] ("March 3, 1922", "1922-03-04");
 * anything else gives its numbers in order ("Year 300, day 2" → [300, 2]).
 * BC/BCE makes the year negative. null when there are no numbers at all.
 */
export function whenKey(label) {
  const t = String(label || '').trim().toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1');
  if (!t) return null;
  let m = /\b(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?\b/.exec(t);
  if (m) return [+m[1], +m[2], +(m[3] || 0)];
  const mon = MONTHS.findIndex((x) => new RegExp(`\\b${x}[a-z]*\\.?\\b`).test(t));
  const nums = (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (mon >= 0) {
    const year = nums.find((n) => Math.abs(n) > 31);
    const day = nums.find((n) => n >= 1 && n <= 31) || 0;
    if (year !== undefined) return [/\b(bc|bce)\b/.test(t) ? -year : year, mon + 1, day];
    return [mon + 1, day];
  }
  if (!nums.length) return null;
  if (/\b(bc|bce)\b/.test(t)) nums[0] = -Math.abs(nums[0]);
  return nums;
}
export const cmpWhen = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity, y = b[i] ?? -Infinity;
    if (x !== y) return x - y;
  }
  return 0;
};

/** Cards in story order: the saved chronology, then the rest in board order. */
export function chronology(plot) {
  const byId = new Map(plot.cards.map((c) => [c.id, c]));
  const out = plot.chrono.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(out);
  const colIdx = new Map(plot.columns.map((c, i) => [c.id, i]));
  const rest = plot.cards.filter((c) => !seen.has(c))
    .map((c, i) => ({ c, i, k: colIdx.has(c.col) ? colIdx.get(c.col) : Infinity }))
    .sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.c);
  return out.concat(rest);
}

/** Ids of cards told later than something that happens after them — flashbacks. */
export function flashbacks(plot, order = chronology(plot)) {
  const colIdx = new Map(plot.columns.map((c, i) => [c.id, i]));
  const out = new Set();
  let min = Infinity;
  for (let i = order.length - 1; i >= 0; i--) {
    const k = colIdx.get(order[i].col);
    if (k === undefined) continue;
    if (k > min) out.add(order[i].id);
    min = Math.min(min, k);
  }
  return out;
}
