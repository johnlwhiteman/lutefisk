// Character avatars: a set of simple icon portraits drawn in white on the
// character's color, or a picture the author uploads (cropped square).
// The icons are plain SVG paths in a 64×64 box — no images, no network.

const C = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
const SHOULDERS = 'M12 60c0-11 9-18 20-18s20 7 20 18z';

/** id → { label, paths: [d…] (filled), strokes: [d…] (outlined) } */
export const AVATARS = [
  { id: 'person', label: 'Person', paths: [C(32, 24, 11), SHOULDERS] },
  { id: 'long-hair', label: 'Long hair', paths: ['M17 40c-2-17 5-29 15-29s17 12 15 29c-3-3-5-8-5-12-2 5-7 8-10 8s-8-3-10-8c0 4-2 9-5 12z', C(32, 25, 9), SHOULDERS] },
  { id: 'bearded', label: 'Bearded', paths: [C(32, 22, 10), 'M22 24c0 10 4 17 10 17s10-7 10-17c-2 4-6 6-10 6s-8-2-10-6z', SHOULDERS] },
  { id: 'child', label: 'Child', paths: [C(32, 27, 12), 'M18 60c0-9 6-14 14-14s14 5 14 14z', 'M26 16c2-5 10-5 12 0c-3-1-9-1-12 0z'] },
  { id: 'elder', label: 'Elder', paths: [C(32, 25, 10), SHOULDERS], strokes: ['M24 25h6M34 25h6M30 25h4', 'M22 18c3-6 17-6 20 0'] },
  { id: 'knight', label: 'Knight', paths: ['M20 36V22c0-8 5-13 12-13s12 5 12 13v14z', 'M12 60c0-10 8-16 20-16s20 6 20 16z'], strokes: ['M23 25h18', 'M32 25v10'] },
  { id: 'wizard', label: 'Wizard', paths: ['M32 4l13 22H19z', 'M14 27h36v4H14z', C(32, 37, 7), 'M14 62c0-9 8-15 18-15s18 6 18 15z'] },
  { id: 'royal', label: 'Royalty', paths: ['M18 22l5 8 9-12 9 12 5-8v12H18z', C(32, 41, 7), 'M15 62c0-8 7-13 17-13s17 5 17 13z'] },
  { id: 'detective', label: 'Detective', paths: ['M18 22c0-7 6-11 14-11s14 4 14 11z', 'M12 22h40v4H12z', C(32, 33, 8), 'M13 62c0-10 8-16 19-16s19 6 19 16z'] },
  { id: 'villain', label: 'Villain', paths: ['M12 26c6-8 14-8 20-3 6-5 14-5 20 3-6 8-14 9-20 4-6 5-14 4-20-4z'], strokes: [] , holes: [C(23, 26, 3), C(41, 26, 3)] },
  { id: 'cat', label: 'Cat', paths: ['M16 52V20l10 9h12l10-9v32c0 5-7 8-16 8s-16-3-16-8z'], holes: [C(25, 38, 2.5), C(39, 38, 2.5)] },
  { id: 'dog', label: 'Dog', paths: [C(32, 36, 15), 'M14 18c4-4 9-2 10 3l-5 18c-5-4-8-14-5-21z', 'M50 18c-4-4-9-2-10 3l5 18c5-4 8-14 5-21z'], holes: [C(26, 34, 2.5), C(38, 34, 2.5), C(32, 42, 3)] },
  { id: 'bird', label: 'Bird', paths: ['M14 40c0-12 10-20 22-18l6-6 2 9c4 4 6 9 5 15-1 8-8 14-18 14-10 0-17-6-17-14z', 'M49 26l9 2-8 4z'], holes: [C(40, 28, 2)] },
  { id: 'robot', label: 'Robot', paths: ['M18 18h28v24H18z', 'M30 8h4v10h-4z', 'M14 46h36v14H14z'], holes: ['M23 26h6v6h-6z', 'M35 26h6v6h-6z'] },
  { id: 'ghost', label: 'Ghost', paths: ['M16 58V30c0-11 7-19 16-19s16 8 16 19v28l-5-5-5 5-6-5-6 5-5-5z'], holes: [C(26, 30, 3), C(38, 30, 3)] },
  { id: 'heart', label: 'Romance', paths: ['M32 54C14 42 10 32 10 25c0-7 5-12 11-12 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 12 0 7-4 17-22 29z'] },
  { id: 'star', label: 'Hero', paths: ['M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2z'] },
  { id: 'mystery', label: 'Unknown', paths: [C(32, 24, 11), SHOULDERS], holes: ['M28 21c0-3 2-5 4-5s4 2 4 4c0 3-4 3-4 7h-1c0-4 4-5 4-7 0-1-1-3-3-3s-3 2-3 4z', C(31.5, 31, 1.4)] },
];

const NS = 'http://www.w3.org/2000/svg';
/** An <svg> for an avatar icon id (white on transparent; the circle behind supplies the color). */
export function avatarSvg(id) {
  const a = AVATARS.find((x) => x.id === id);
  if (!a) return null;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ch-av-ic');
  // Holes are cut with even-odd filling so the color shows through.
  const d = [...(a.paths || [])].join(' ');
  if (a.holes?.length) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `${d} ${a.holes.join(' ')}`);
    p.setAttribute('fill', '#fff');
    p.setAttribute('fill-rule', 'evenodd');
    svg.append(p);
  } else {
    for (const pd of a.paths || []) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', pd); p.setAttribute('fill', '#fff'); svg.append(p); }
  }
  for (const sd of a.strokes || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', sd); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'rgba(0,0,0,.35)'); p.setAttribute('stroke-width', '2.4'); p.setAttribute('stroke-linecap', 'round');
    svg.append(p);
  }
  return svg;
}

/** Recommended upload size for a character picture. */
export const AVATAR_PX = 256;

/** Read an image file, crop the center square and scale it to AVATAR_PX. Returns PNG bytes. */
export async function squareAvatar(file) {
  if (!file || file.size > 15 * 1024 * 1024) throw new Error('Choose a picture under 15 MB');
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Couldn’t read the file')); r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not a picture Lutefisk can read')); i.src = url; });
  const w = img.naturalWidth || AVATAR_PX, hgt = img.naturalHeight || AVATAR_PX, side = Math.min(w, hgt);
  const c = document.createElement('canvas');
  c.width = c.height = AVATAR_PX;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // Faces sit in the upper part of most portraits, so bias the crop upward on tall pictures.
  const sy = hgt > w ? Math.max(0, (hgt - side) * 0.3) : (hgt - side) / 2;
  g.drawImage(img, (w - side) / 2, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  const png = c.toDataURL('image/png');
  return { bytes: Uint8Array.from(atob(png.split(',')[1]), (ch) => ch.charCodeAt(0)), small: w < AVATAR_PX || hgt < AVATAR_PX };
}
