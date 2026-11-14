// End-to-end smoke test: launches the real Electron app (under Xvfb on Linux),
// opens the sample book, drives the UI via the DevTools protocol, measures
// preview latency, captures screenshots and runs all three exporters.
// Usage: node test/e2e.mjs <bookDir> <outDir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const [bookDir, outDir] = process.argv.slice(2);
// The test builds its own cast and plot board, so start the sample book without them.
{
  const { readFileSync } = await import('node:fs');
  const YAML = (await import('yaml')).default;
  const f = join(bookDir, 'lutefisk.yaml');
  if (existsSync(f)) {
    const b = YAML.parse(readFileSync(f, 'utf8'));
    delete b.characters; delete b.plot;
    writeFileSync(f, YAML.stringify(b, { lineWidth: 0 }));
  }
}
mkdirSync(outDir, { recursive: true });
const userData = join(os.homedir(), '.config', 'Lutefisk');
mkdirSync(userData, { recursive: true });
writeFileSync(join(userData, 'recent.json'), JSON.stringify([{ dir: bookDir, title: 'The Lantern Road' }]));

const PORT = 9333;
const electron = join(process.cwd(), 'node_modules', '.bin', 'electron');
const proc = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--window-size=1600,1000', '--force-device-scale-factor=1'], {
  env: { ...process.env, LUTEFISK_TEST_OUT: outDir }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
proc.stdout.on('data', (d) => { log += d; });
proc.stderr.on('data', (d) => { log += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const t = list.find((x) => x.url.startsWith('app://lutefisk'));
      if (t) return t;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('App did not start\n' + log);
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const consoleMsgs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') consoleMsgs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Runtime.exceptionThrown') consoleMsgs.push(`EXCEPTION: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};
const shot = async (name) => {
  console.error('shot', name);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const key = async (k) => { const code = { Tab: 9, Enter: 13 }[k]; await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); };
const click = (sel) => evaluate(`(() => { const el = ${sel}; if (!el) throw new Error('not found: ' + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const setSelect = (sel, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; })()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 40 && !(await evaluate(`!!document.querySelector('.lib-new')`)); i++) await sleep(250);
await sleep(300);
await shot('01-library');
await click(`document.querySelector('.lib-new')`);
await sleep(500);
await evaluate(`(() => { const i = document.querySelector('.nb-form input'); i.value = 'Moonlight Ferry'; i.dispatchEvent(new Event('input')); })()`);
await sleep(300);
await shot('01b-new-book');
await evaluate(`document.querySelector('.nb-form .dlg-actions .btn.primary').click()`);
await sleep(1500);
await shot('01c-new-book-open');
const newBookChapter = await evaluate(`[...document.querySelectorAll('.sb-name')].map(b => b.textContent.trim()).find(t => /^Chapter/.test(t))`);
await click(`document.querySelector('.tb-left .tb-icon')`);
await sleep(1200);
await shot('01d-library-two');
await click(`[...document.querySelectorAll('.lib-book')].find(b => b.textContent.includes('Lantern'))`);
await evaluate(`window.__nav = (n) => {
  const row = (t) => [...document.querySelectorAll('.sb-row.nav .sb-name, .sb-name')].find((b) => b.textContent.trim().startsWith(t));
  if (n === 'Book') return document.querySelector('.sb-cover-btn');
  if (n === 'Goals') return [...document.querySelectorAll('.sb-side-btn')].find((b) => b.textContent.includes(n));
  if (n === 'Characters' || n === 'Plot') return [...document.querySelectorAll('.sb-row.nav .sb-name')].find((b) => b.textContent.includes(n));
  if (n === 'Focus') return document.querySelector('.ed-focus-btn');
  if (n === 'Insights') return [...document.querySelectorAll('.sb-side-btn')].find((b) => b.textContent.includes('Insights'));
  if (n === 'Templates') return { click: () => { [...document.querySelectorAll('.ts-btn')].find((b) => b.offsetParent).click(); document.querySelector('.ts-list .ts-foot .btn').click(); } };
  if (n === 'References') return row('Bibliography');
  return null;
}`);
await sleep(1500);
const results = {};
results.newBookChapter = newBookChapter;

// Select first chapter and screenshot each device.
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Last Lamp'))`);
await sleep(600);
const devices = await evaluate(`[...document.querySelectorAll('.pv-device option')].map(o => o.value)`);
results.devices = devices;
let n = 2;
for (const d of devices) {
  await setSelect('.pv-device', d);
  await sleep(450);
  await shot(`${String(n++).padStart(2, '0')}-device-${d}`);
}
await setSelect('.pv-device', 'kindle-paperwhite');
await sleep(400);

// Live preview latency: type characters and time until preview DOM shows them.
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const s = window.getSelection(); s.selectAllChildren(ed.querySelector('p')); s.collapseToEnd(); })()`);
const lat = [];
for (const word of [' Quickly', ' typed', ' words', ' appear', ' instantly.']) {
  const t0 = await evaluate('performance.now()');
  await send('Input.insertText', { text: word });
  const t1 = await evaluate(`new Promise(res => { const f = () => document.querySelector('.scr-flow').textContent.includes(${JSON.stringify(word.trim())}) ? res(performance.now()) : requestAnimationFrame(f); f(); })`);
  lat.push(+(t1 - t0).toFixed(1));
}
results.latencyMs = lat;
await sleep(300);
await shot('20-typing');

// Font + size + theme changes.
await setSelect('.pv-device', 'ipad');
await setSelect('.pv-theme', 'sepia');
await evaluate(`(() => { const r = document.querySelector('.preview-pane .pv-size'); r.value = 130; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()`);
await sleep(500);
await shot('21-ipad-sepia-garamond-130');
await setSelect('.pv-theme', 'light');
await evaluate(`(() => { const r = document.querySelector('.preview-pane .pv-size'); r.value = 100; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()`);
await setSelect('.pv-device', 'kindle-scribe');

// Chapter 2 (image) on the Galaxy Tab S11
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await setSelect('.pv-device', 'galaxy-tab-s11');
await sleep(500);
await evaluate(`document.querySelector('.pg-btn[aria-label="Next page"]').click()`);
await sleep(300);
await shot('22-galaxy-tab-image');

// Whole-book navigation: front cover, end.
await setSelect('.pv-device', 'kindle-paperwhite');
await evaluate(`[...document.querySelectorAll('.dv-stage, .pp-stage')].find(x => x.offsetParent).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))`);
await sleep(400);
await shot('23-front-cover');
await evaluate(`document.querySelector('.pg-btn[aria-label="Next page"]').click()`);
await sleep(400);
await shot('24-after-cover');
await evaluate(`[...document.querySelectorAll('.dv-stage, .pp-stage')].find(x => x.offsetParent).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))`);
await sleep(400);
await shot('25-end');
// Magnify the device and the editor text.
await evaluate(`document.querySelector('.mag button[aria-label="Zoom in"]').click(); document.querySelector('.mag button[aria-label="Zoom in"]').click()`);
await evaluate(`document.querySelector('.editor-size .big-a').click(); document.querySelector('.editor-size .big-a').click()`);
await sleep(500);
await shot('26-zoomed');
results.scaleBubble = { editor: await evaluate(`document.querySelector('.editor-size .range-bubble.on')?.textContent || ''`), labelHidden: await evaluate(`![...document.querySelector('.editor-size').children].some(c => !c.classList.contains('range-bubble') && /\\d+%/.test(c.textContent))`) };
await evaluate(`document.querySelector('.mag-val').click(); const r = document.querySelector('.editor-size .pv-size'); r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Last Lamp'))`);
await sleep(300);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await sleep(500);
await shot('27-dark');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

// Print preview
await click(`document.querySelector('.pv-switch button[data-v="print"]')`);
await sleep(1200);
await shot('30-print-spread');
results.printBook = await evaluate(`({ spread: !!document.querySelector('.pp-desk.spread'), spine: !!document.querySelector('.pp-spine'), viewToggle: !!document.querySelector('.pv-bar .segmented button[data-v="single"]') })`);
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Contents'))`);
await sleep(800);
await shot('32-print-toc');
results.printPages = await evaluate(`document.querySelector('#app .pv-host:not([hidden]) .pg-label').textContent`);
// Print latency
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Last Lamp'))`);
await sleep(600);
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const s = window.getSelection(); s.selectAllChildren(ed.querySelectorAll('p')[2]); s.collapseToEnd(); })()`);
const plat = [];
for (const word of [' Another', ' printed', ' sentence.']) {
  const t0 = await evaluate('performance.now()');
  await send('Input.insertText', { text: word });
  const t1 = await evaluate(`new Promise(res => { const f = () => [...document.querySelectorAll('.pp-book .pp-flow')].some(x => x.textContent.includes(${JSON.stringify(word.trim())})) ? res(performance.now()) : requestAnimationFrame(f); f(); })`);
  plat.push(+(t1 - t0).toFixed(1));
}
results.printLatencyMs = plat;
await shot('33-print-typing');
await click(`document.querySelector('.pv-switch button[data-v="device"]')`);

// Readability: focus mode (the book always fits), arrow keys, drop cap toggles.
await click(`document.querySelector('.pv-switch button[data-v="print"]')`);
await sleep(600);
await click(`document.querySelector('.pv-switch .focus-btn')`);
await sleep(700);
await shot('34-print-focus');
const lbl = () => evaluate(`document.querySelector('.pv-host:not([hidden]) .pg-label').textContent`);
const before = await lbl();
await evaluate(`document.querySelector('.pp-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))`);
await sleep(200);
const afterUp = await lbl();
await evaluate(`document.querySelector('.pp-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
await sleep(200);
results.arrowKeys = { before, afterUp, afterDown: await lbl() };
const dcFloat = (sel) => evaluate(`(() => { const p = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.closest('.dc-ok')); return p ? getComputedStyle(p, '::first-letter').float : 'n/a'; })()`);
const printSel = '.pp-book .pp-flow .bk-body > p:first-of-type';
results.dropCaps = { printOn: await dcFloat(printSel) };
await sleep(600);
results.dropCaps.printOff = await dcFloat(printSel);
await shot('35-print-no-dropcap');
await click(`document.querySelector('.pv-switch button[data-v="device"]')`);
await sleep(500);
results.dropCaps.ebookStillOn = await dcFloat('.scr-flow .bk-body > p:first-of-type');
await sleep(500);
results.dropCaps.previewOff = await dcFloat('.scr-flow .bk-body > p:first-of-type');
const firstLine = () => evaluate(`getComputedStyle(document.querySelector('.scr-flow .bk-body > p'), '::first-line').fontVariantCaps`);
results.openingLine = { defaultWithDropCapOff: await firstLine() };
await sleep(400);
results.openingLine.defaultWithDropCapOn = await firstLine();
await click(`window.__nav('Book')`);
await sleep(300);
await click(`[...document.querySelectorAll('.sheet .segmented button')].find(b => b.textContent.includes('Chapters'))`);
await sleep(200);
await evaluate(`(() => { const sel = [...document.querySelectorAll('.sheet select')].find(s => [...s.options].some(o => o.value === 'smallcaps')); sel.value = 'smallcaps'; sel.dispatchEvent(new Event('change')); })()`);
await sleep(500);
await shot('37-settings-case');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(500);
results.openingLine.smallcapsWithDropCapOn = await firstLine();
await sleep(400);
results.openingLine.smallcapsWithDropCapOff = await firstLine();
await shot('36-chapter-dropcap-off');
await click(`document.querySelector('.pv-switch .focus-btn')`);
await sleep(300);

// Chapter heading options live in Book › Chapters (and in the template designer).
const headText = () => evaluate(`(() => { const h = document.querySelector('.scr-flow .bk-head'); return h ? h.innerText.replace(/\\s+/g, ' ').trim() : ''; })()`);
await click(`window.__nav('Book')`);
await sleep(500);
await click(`document.querySelector('.sheet .segmented button[data-v="chapters"]')`);
await sleep(300);
results.headings = { editorDropdownGone: !(await evaluate(`!!document.querySelector('.head-sel')`)) };
const headSel = `[...document.querySelectorAll('.sheet select')].find(s => [...s.options].some(o => o.value === 'number'))`;
results.headings.options = await evaluate(`[...${headSel}.options].map(o => o.textContent)`);
const setHead = async (v) => { await evaluate(`(() => { const s = ${headSel}; s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`); await sleep(500); return headText(); };
results.headings.both = await setHead('both');
results.headings.titleOnly = await setHead('title');
results.headings.numberOnly = await setHead('number');
await shot('38-heading-options');
await setHead('');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(400);

// ---- Scenes
const rowMore = async (text) => { await evaluate(`(() => { const r = [...document.querySelectorAll('.sb-row')].find(li => li.querySelector('.sb-label')?.textContent === ${JSON.stringify(text)}); r.querySelector('.sb-more').click(); })()`); await sleep(200); };
const pop = (label) => click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.includes(${JSON.stringify(label)}))`);
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Last Lamp'))`);
await sleep(300);
await rowMore('The Last Lamp');
await pop('Split into Scenes');
await sleep(600);
results.scenes = { rows: await evaluate(`document.querySelectorAll('.sb-row.scene').length`), kind: await evaluate(`document.querySelector('.sec-kind').textContent`) };
await click(`document.querySelectorAll('.sb-row.scene .sb-name')[1]`);
await sleep(300);
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const sel = getSelection(); sel.selectAllChildren(ed.querySelector('p')); sel.collapseToStart(); })()`);
await send('Input.insertText', { text: 'Scene two begins here. ' });
await sleep(500);
results.scenes.inPreview = await evaluate(`document.querySelector('.scr-flow').textContent.includes('Scene two begins here')`);
results.scenes.chapterHasBreak = await evaluate(`document.querySelectorAll('.scr-flow .bk-scene').length`);
await shot('70-scenes');
await click(`document.querySelector('.sb-row.has-scenes .sb-name')`);
await sleep(400);
await shot('71-chapter-overview');
// Scenes button in the editor header: split another chapter at the cursor.
await click(`[...document.querySelectorAll('.sb-row:not(.has-scenes):not(.scene) .sb-name')].find(b => b.textContent.includes('The Pass'))`);
await sleep(400);
results.scenes.headerBtn = await evaluate(`!document.querySelector('.scenes-menu').hidden && document.querySelector('.scenes-menu').textContent`);
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const p = ed.querySelectorAll('p')[1] || ed.querySelector('p'); const sel = getSelection(); sel.selectAllChildren(p); sel.collapseToStart(); })()`);
await sleep(200);
await click(`document.querySelector('.scenes-menu')`);
await sleep(250);
await shot('74-scenes-menu');
await pop('Split at Cursor');
await sleep(700);
results.scenes.splitKind = await evaluate(`document.querySelector('.sec-kind').textContent`);
results.scenes.splitLabel = await evaluate(`document.querySelector('.scenes-menu').textContent`);
results.scenes.secondStartsWith = await evaluate(`document.querySelector('.ProseMirror p')?.textContent.slice(0, 40)`);
results.scenes.notesGone = await evaluate(`!document.querySelector('.notes-btn, .notes-box')`);
await shot('75-scene');
await click(`document.querySelector('.scenes-menu')`);
await sleep(200);
await pop('New Scene After This');
await sleep(500);
results.scenes.afterAdd = await evaluate(`document.querySelector('.sec-kind').textContent`);
await click(`document.querySelector('.scenes-menu')`);
await sleep(200);
await pop('Scene Overview');
await sleep(500);
results.scenes.overviewCards = await evaluate(`document.querySelectorAll('.scene-card:not(.add)').length`);
// Drag the last card in front of the first one.
results.scenes.orderBefore = await evaluate(`[...document.querySelectorAll('.scene-card:not(.add) p')].map(p => p.textContent.slice(0, 12))`);
await evaluate(`(() => { const cards = [...document.querySelectorAll('.scene-card:not(.add)')]; const src = cards[cards.length - 1], dst = cards[0]; const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const r = dst.getBoundingClientRect();
  dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 10 }));
  dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 10, clientY: r.top + 10 }));
  src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); })()`);
await sleep(600);
results.scenes.orderAfter = await evaluate(`[...document.querySelectorAll('.scene-card:not(.add) p')].map(p => p.textContent.slice(0, 12))`);
results.scenes.cardNote = await evaluate(`document.querySelector('.scene-card .sc-note')?.title`);
await shot('76-scene-overview');
// Each scene card: label, status and exclude, changed in place
await click(`document.querySelectorAll('.scene-card .sc-tools .ch-chip')[2]`); await sleep(300);
await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.includes('First Draft'))`); await sleep(400);
results.scenes.cardStatus = await evaluate(`document.querySelector('.scene-card .sc-tools .ch-chip.on')?.title`);
results.scenes.cardTools = await evaluate(`document.querySelectorAll('.scene-card:not(.add) .sc-tools').length === document.querySelectorAll('.scene-card:not(.add)').length`);
// The scene editor has the same row; the Chapters menu jumps anywhere
await click(`document.querySelector('.scene-card:not(.add) b')`); await sleep(700);
results.scenes.editorTools = await evaluate(`[...document.querySelectorAll('.sec-extra .ch-chip')].map(b => b.textContent.trim())`);
await click(`document.querySelector('.chapters-menu')`); await sleep(300);
results.chaptersMenu = await evaluate(`[...document.querySelectorAll('.popover .pop-item')].map(b => b.querySelector('.pop-label').textContent)`);
await evaluate(`(() => { for (const m of document.querySelectorAll('.popover')) m.remove(); })()`);
results.layout = await evaluate(`({ themeAfterGear: document.querySelector('.tb-tools .tb-icon[title="Settings"]').nextElementSibling?.classList.contains('tb-theme') ?? false, rowTwo: [...document.querySelector('.pv-bar').children].filter(c => c.offsetParent).map(c => c.className), rowOne: [...document.querySelector('.pv-switch').querySelectorAll(':scope > *, .pv-row1-items > *')].map(c => c.className) })`);

// ---- Research
await click(`document.querySelector('.sb-group.research .sb-add')`);
await sleep(200);
await pop('Note');
await sleep(400);
await evaluate(`(() => { const t = document.querySelector('.sec-title'); t.value = 'Mara Lamplighter'; t.dispatchEvent(new Event('input')); })()`);
await sleep(300);
await shot('72-research-character');
await rowMore('Mara Lamplighter');
await pop('Open Beside Editor');
await sleep(500);
results.research = { tab: await evaluate(`document.querySelector('.pv-switch button.on')?.textContent`), refTitle: await evaluate(`document.querySelector('.ref-body h2')?.textContent`) };
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await sleep(400);
await shot('73-research-beside');

// ---- Inline citation
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const sel = getSelection(); sel.selectAllChildren(ed.querySelector('p')); sel.collapseToEnd(); })()`);
await click(`document.querySelector('.ql-cite')`);
await sleep(300);
await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.includes('Citation…'))`);
await sleep(400);
await evaluate(`(() => { const l = [...document.querySelectorAll('.dlg input')].find(i => i.getAttribute('aria-label') === 'Page'); l.value = '12'; l.dispatchEvent(new Event('input')); })()`);
await sleep(200);
await shot('74-cite-picker');
await click(`document.querySelector('.dlg .btn.primary')`);
await sleep(400);
results.citation = { chip: await evaluate(`document.querySelector('.pm-cite')?.textContent`) };
await click(`document.querySelector('.pv-switch button[data-v="device"]')`);
await sleep(500);
results.citation.preview = await evaluate(`document.querySelector('.scr-flow .bk-cite')?.textContent`);

// ---- Image toolbar & wrap
await evaluate(`document.querySelector('.ProseMirror .pm-img img').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 400 }))`);
await click(`document.querySelector('.ProseMirror .pm-img img')`);
await sleep(300);
await evaluate(`(() => { const b = [...document.querySelectorAll('.pm-img-bar .pib')].find(x => x.textContent === '33%'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); })()`);
await sleep(300);
results.wraps = {};
for (const label of ['In Line with Text', 'Square', 'Tight', 'Through', 'Top and Bottom', 'Behind Text', 'In Front of Text']) {
  await evaluate(`document.querySelector('.ProseMirror .pm-img img').click()`);
  await sleep(150);
  await evaluate(`(() => { const b = document.querySelector('.pm-img-bar .pib.wrap'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); })()`);
  await sleep(200);
  await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.startsWith(${JSON.stringify(label)}))`);
  await sleep(600);
  results.wraps[label] = await evaluate(`(() => { const i = document.querySelector('.scr-flow .bk-img, .scr-flow .bk-fig'); if (!i) return 'missing'; const cs = getComputedStyle(i); return [i.className, cs.float, cs.position, cs.shapeOutside.slice(0, 12)].join(' | '); })()`);
  await shot(`77-wrap-${label.replace(/\W+/g, '-').toLowerCase()}`);
}
await evaluate(`document.querySelector('.ProseMirror .pm-img img').click()`);
await sleep(150);
await evaluate(`(() => { const b = document.querySelector('.pm-img-bar .pib.wrap'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); })()`);
await sleep(200);
await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.startsWith('Square'))`);
await sleep(500);
results.image = { barVisible: 'n/a', previewWrap: await evaluate(`(() => { const i = document.querySelector('.scr-flow img.bk-img, .scr-flow .bk-fig'); return i ? i.className + ' ' + getComputedStyle(i).float : 'none'; })()`) };
await shot('75-image-wrap');

// ---- Preview Focus (replaces Enlarge + Preview toggle)
results.previewFocus = { noPreviewButton: !(await evaluate(`[...document.querySelectorAll('.tb-item')].some(b => b.textContent.trim() === 'Preview')`)) };
await click(`document.querySelector('.pv-switch .focus-btn')`);
await sleep(700);
results.previewFocus.on = await evaluate(`(() => { const s = document.querySelector('.shell'); const vis = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.width > 2 && getComputedStyle(document.querySelector(sel)).visibility !== 'hidden'; }; return { cls: s.classList.contains('preview-focus'), editor: vis('.editor-pane'), sidebar: vis('.sidebar'), preview: vis('.preview-pane'), previewWidth: Math.round(document.querySelector('.preview-pane').getBoundingClientRect().width), label: document.querySelector('.pv-switch .focus-btn').textContent }; })()`);
await shot('78-preview-focus');
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await sleep(500);
results.previewFocus.offAfterEsc = !(await evaluate(`document.querySelector('.shell').classList.contains('preview-focus')`));

// ---- Book bar: live totals at the bottom of the editor
const bar = () => evaluate(`document.querySelector('.book-bar')?.innerText.replace(/\\s+/g, ' ')`);
await sleep(1500);
results.bookBar = { before: await bar(), status: await evaluate(`document.querySelector('.bb-here').innerText`) };
await evaluate(`document.querySelector('.editor-mount .ProseMirror').focus()`);
await send('Input.insertText', { text: ' One two three four five six seven eight nine ten.' });
await sleep(1200);
results.bookBar.after = await bar();
await sleep(2500);
results.bookBar.afterSave = await bar();
await shot('79-book-bar');

// ---- Focus mode
await click(`window.__nav('Focus')`);
await sleep(600);
results.focus = { on: await evaluate(`document.querySelector('.shell').classList.contains('writing-focus')`) };
await shot('76-focus-mode');
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
await sleep(400);
results.focus.offAfterEsc = !(await evaluate(`document.querySelector('.shell').classList.contains('writing-focus')`));

// Templates gallery
await click(`window.__nav('Templates')`);
await sleep(700);
await shot('40-templates');
results.templateCards = await evaluate(`document.querySelectorAll('.tpl-card').length`);
await click(`[...document.querySelectorAll('.tpl-card')].find(c => c.textContent.includes('Epic Fantasy'))`);
await sleep(900);
const tplName = `[...document.querySelectorAll('.ts-name')].find(n => n.offsetParent)?.textContent`;
results.templateLive = { docked: await evaluate(`!!document.querySelector('.overlay.tpl-docked')`), applied: await evaluate(tplName), example: await evaluate(`document.querySelector('.tpl-card:not(.new) .bk-title').textContent`) };
// Live view: the cards show your own text
await click(`document.querySelector('.tpl-live input')`); await sleep(300);
results.templateLive.liveTitle = await evaluate(`document.querySelector('.tpl-card:not(.new) .bk-title').textContent`);
await click(`document.querySelector('.tpl-live input')`); await sleep(200);
// Arrow keys step through designs while the preview updates beside the panel
await evaluate(`document.querySelector('.tpl-card.on').focus()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await sleep(700);
results.templateLive.afterArrow = await evaluate(`document.querySelector('.tpl-card.on .tpl-name').firstChild.textContent`);
await shot('41-fantasy-template');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(500);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await sleep(500);
results.templateLive.kept = await evaluate(`!document.querySelector('.overlay.tpl-docked') && ${tplName}`);
// The template list under the device: ↓ applies the next design and the device redraws
const press = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const deviceFont = `getComputedStyle([...document.querySelectorAll('.scr .bk-title, .scr-flow .bk-title')].find(e => e.offsetParent) || document.body).fontFamily`;
results.templateLive.fontBefore = await evaluate(deviceFont);
await evaluate(`[...document.querySelectorAll('.ts-btn')].find(b => b.offsetParent).focus()`);
await press('ArrowDown', 'ArrowDown', 40); await sleep(700);
results.templateLive.stripNext = await evaluate(tplName);
results.templateLive.fontAfter = await evaluate(deviceFont);
await press('ArrowUp', 'ArrowUp', 38); await sleep(600);
// The open list: ↓ ↓ apply live, Esc goes back
await evaluate(`[...document.querySelectorAll('.ts-btn')].find(b => b.offsetParent).click()`); await sleep(300);
const tplBefore = await evaluate(tplName);
await press('ArrowDown', 'ArrowDown', 40); await sleep(400); await press('ArrowDown', 'ArrowDown', 40); await sleep(500);
results.templateLive.listMoved = (await evaluate(tplName)) !== tplBefore;
await shot('41b-template-list');
await press('Escape', 'Escape', 27); await sleep(500);
results.templateLive.listReverted = (await evaluate(tplName)) === tplBefore && (await evaluate(`!document.querySelector('.ts-list')`));

// Insights: text analysis
await click(`window.__nav('Insights')`);
await sleep(700);
await click(`[...document.querySelectorAll('.insights .segmented button')].find(b => b.textContent.includes('Your Text'))`);
await sleep(700);
results.insights = { tiles: await evaluate(`document.querySelectorAll('.insights .stats .tile').length`), helps: await evaluate(`document.querySelectorAll('.insights .help-tip').length`) };
await shot('50-stats');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);

// Book settings
await click(`window.__nav('Book')`);
await sleep(500);
await shot('51-settings');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);

// Bibliography panel
await click(`window.__nav('References')`);
await sleep(500);
await shot('52-bibliography');

// Footnote dialog via toolbar
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Last Lamp'))`);
await sleep(300);

// ---- Writing goals
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('The Pass'))`);
await sleep(300);
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const sel = getSelection(); sel.selectAllChildren(ed.lastElementChild); sel.collapseToEnd(); })()`);
for (const w of [' The', ' snow', ' kept', ' falling', ' and', ' the', ' lantern', ' kept', ' burning.']) { await send('Input.insertText', { text: w }); await sleep(120); }
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))`);
await sleep(1500);
results.goals = { meter: await evaluate(`document.querySelector('.bb-today-g').textContent`) };
await click(`window.__nav('Goals')`);
await sleep(500);
await evaluate(`(() => { const ins = [...document.querySelectorAll('.goal-fields input')]; const set = (i, v) => { ins[i].value = v; ins[i].dispatchEvent(new Event('input')); }; set(0, 40000); set(1, 220); set(3, 1000); const d = document.querySelector('.goal-daily-row input'); d.value = 500; d.dispatchEvent(new Event('input')); })()`);
await evaluate(`(() => { const d = document.querySelector('.goal-fields input[type=date]'); d.value = '2027-06-30'; d.dispatchEvent(new Event('input')); })()`);
await sleep(600);
results.goals.today = await evaluate(`document.querySelector('.goals .tile .tile-v').textContent`);
// Famous-author presets fill the daily goal (and leave it after)
await evaluate(`(() => { const s = document.querySelector('.goal-preset'); s.value = 'trollope'; s.dispatchEvent(new Event('change')); })()`);
await sleep(200);
results.goals.preset = await evaluate(`({ n: document.querySelectorAll('.goal-preset option').length, fields: [...document.querySelectorAll('.goal-daily-row input')].map(i => i.value), note: !!document.querySelector('.goal-preset-note').textContent })`);
results.goals.presetOk = results.goals.preset.n === 11 && results.goals.preset.fields.join() === ',3,10' && results.goals.preset.note;
await evaluate(`(() => { const s = document.querySelector('.goal-preset'); s.value = ''; s.dispatchEvent(new Event('change')); const ins = document.querySelectorAll('.goal-daily-row input'); for (const [i, v] of [[0, '500'], [1, ''], [2, '']]) { ins[i].value = v; ins[i].dispatchEvent(new Event('input')); } })()`);
await sleep(200);
results.goals.progress = await evaluate(`[...document.querySelectorAll('.gprog-top span')].map(x => x.textContent)`);
await shot('80-goals');
await click(`[...document.querySelectorAll('.goal-scope button')].find(b => b.textContent.includes('All'))`);
await sleep(400);
await shot('81-goals-all-books');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(300);
results.goals.meterAfter = await evaluate(`document.querySelector('.bb-today-g').textContent`);

// ---- Stopwatch (manual), session popover, writing history
results.stopwatch = { idle: await evaluate(`document.querySelector('.stopwatch').className + ' ' + document.querySelector('.sw-time').textContent`) };
await sleep(1200);
results.stopwatch.stillIdle = await evaluate(`document.querySelector('.sw-time').textContent`);
await click(`document.querySelector('.sw-toggle')`);
await sleep(2300);
results.stopwatch.running = await evaluate(`document.querySelector('.stopwatch').classList.contains('running') + ' ' + document.querySelector('.sw-time').textContent`);
await shot('82-stopwatch-running');
await click(`document.querySelector('.sw-toggle')`);
await sleep(1200);
const t1 = await evaluate(`document.querySelector('.sw-time').textContent`);
await sleep(1200);
results.stopwatch.stopped = [t1, await evaluate(`document.querySelector('.sw-time').textContent`), await evaluate(`document.querySelector('.stopwatch').classList.contains('running')`)];
await evaluate(`document.querySelector('.bb-session').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
await sleep(300);
results.session = { panel: await evaluate(`document.querySelector('.sc-panel')?.innerText`) };
await shot('82b-session-popover');
await evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
await sleep(200);
await click(`[...document.querySelectorAll('.sb-side-btn')].find((b) => b.textContent.includes('Insights'))`);
await sleep(1200);
results.history = {
  tiles: await evaluate(`[...document.querySelectorAll('.hx-tile')].map(t => t.querySelector('.hx-tile-l').textContent + ': ' + t.querySelector('.hx-tile-v').textContent)`),
  charts: await evaluate(`document.querySelectorAll('.history svg').length`),
  bars: await evaluate(`document.querySelectorAll('.history .hx-bar').length`),
  heat: await evaluate(`document.querySelectorAll('.history .hx-heat').length`),
  rows: await evaluate(`document.querySelectorAll('.hx-table tbody tr').length`),
};
await shot('82c-history');
await evaluate(`(() => { const svg = document.querySelector('.hx-chart svg'); const r = svg.getBoundingClientRect(); svg.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.right - 20, clientY: r.top + 60 })); })()`);
await sleep(200);
results.history.tip = await evaluate(`document.querySelector('.hx-tip:not([hidden])')?.innerText`);
await click(`[...document.querySelectorAll('.history .segmented button')].find(b => b.textContent === 'Year')`);
await sleep(800);
await shot('82d-history-year');
await evaluate(`document.querySelector('.history').closest('.sheet').querySelector('.sheet-head .btn.primary').click()`);
await sleep(300);

// ---- LaTeX equations
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await sleep(400);
const putCaret = (which) => evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const sel = getSelection(); sel.selectAllChildren(ed.querySelectorAll('p')[${which}]); sel.collapseToEnd(); })()`);
const addEq = async (tex, display, shotName) => {
  await click(`[...document.querySelectorAll('.ql-toolbar button, .book-toolbar button, button')].find(b => (b.title || '').startsWith('Insert equation'))`);
  await sleep(300);
  await evaluate(`(() => { const t = document.querySelector('.math-src'); t.value = ${JSON.stringify(tex)}; t.dispatchEvent(new Event('input')); })()`);
  if (display) await click(`document.querySelector('.math-dlg .segmented button[data-v="display"]')`);
  await sleep(300);
  if (shotName) await shot(shotName);
  await click(`[...document.querySelectorAll('.math-dlg .btn.primary')].pop()`);
  await sleep(400);
};
await putCaret(0);
await send('Input.insertText', { text: ' The lamp burned at ' });
await addEq('E = mc^2', false);
await send('Input.insertText', { text: ' brightness, or so the miller claimed.' });
await putCaret(1);
await addEq('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', true, '83-latex-dialog');
await sleep(1200);
results.math = {
  editorNodes: await evaluate(`document.querySelectorAll('.ProseMirror .pm-math math').length`),
  previewMath: await evaluate(`document.querySelectorAll('.scr-flow math').length`),
};
await evaluate(`document.querySelector('.ProseMirror .pm-math.display')?.scrollIntoView({ block: 'center' })`);
await sleep(600);
await shot('84-latex-in-editor');
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))`);
await sleep(1200);
// LaTeX reference and symbol palette
await click(`[...document.querySelectorAll('button')].find(b => (b.title || '').startsWith('Insert equation'))`);
await sleep(500);
results.math.paletteSymbols = await evaluate(`document.querySelectorAll('.math-right .math-syms .sym').length`);
await shot('88-latex-symbols');
await evaluate(`(() => { const q = document.querySelector('.ref-search'); q.value = 'new line'; q.dispatchEvent(new Event('input')); })()`);
await sleep(400);
results.math.refNewLine = await evaluate(`[...document.querySelectorAll('.ref-card b')].map(b => b.textContent)`);
await shot('89-latex-reference-newline');
await evaluate(`(() => { const q = document.querySelector('.ref-search'); q.value = 'align'; q.dispatchEvent(new Event('input')); })()`);
await sleep(300);
await evaluate(`[...document.querySelectorAll('.ref-card')].find(c => c.querySelector('b').textContent === 'Align at the = sign').querySelector('.btn').click()`);
await sleep(300);
results.math.refInserted = await evaluate(`document.querySelector('.math-src').value`);
results.math.refPreviewOk = await evaluate(`!!document.querySelector('.math-preview math') && !document.querySelector('.math-err').textContent`);
await shot('90-latex-reference-inserted');
await evaluate(`[...document.querySelectorAll('.math-dlg .btn')].find(b => b.textContent === 'Cancel').click()`);
await sleep(300);
// Insert Symbol
await putCaret(0);
await click(`[...document.querySelectorAll('button')].find(b => (b.title || '').startsWith('Insert symbol'))`);
await sleep(400);
results.symbols = { categories: await evaluate(`document.querySelectorAll('.sym-nav button').length`) };
await evaluate(`(() => { const q = document.querySelector('.sym-search'); q.value = 'em dash'; q.dispatchEvent(new Event('input')); })()`);
await sleep(200);
results.symbols.search = await evaluate(`[...document.querySelectorAll('.sym-cell')].map(c => c.textContent).join(' ')`);
await click(`document.querySelector('.sym-cell')`);
await evaluate(`(() => { const q = document.querySelector('.sym-search'); q.value = 'U+2042'; q.dispatchEvent(new Event('input')); })()`);
await sleep(200);
await click(`document.querySelector('.sym-cell')`);
await evaluate(`(() => { const q = document.querySelector('.sym-search'); q.value = ''; q.dispatchEvent(new Event('input')); })()`);
await click(`[...document.querySelectorAll('.sym-nav button')].find(b => b.textContent === 'Ornaments & dingbats')`);
await sleep(300);
await shot('91-insert-symbol');
await click(`[...document.querySelectorAll('.sym-dlg .btn')].find(b => b.textContent === 'Done')`);
await sleep(300);
results.symbols.inserted = await evaluate(`document.querySelector('.ProseMirror p').textContent.slice(-12)`);
results.math.saved = (await import('node:fs')).readFileSync(join(bookDir, 'chapters', 'cha-2b7d91e0.md'), 'utf8').match(/\$[^$\n]+\$|\$\$[\s\S]+?\$\$/g);

// ---- Chapter subtitle & notes
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await sleep(400);
await evaluate(`(() => { const t = document.querySelector('.sec-subtitle'); t.value = 'In which the wheel stops turning'; t.dispatchEvent(new Event('input')); })()`);
await sleep(900);
results.subtitle = await evaluate(`document.querySelector('.scr-flow .bk-subtitle')?.textContent`);
await shot('92-subtitle');
// Live counts in the title bar while typing
results.liveCount = { before: await evaluate(`document.querySelector('.tb-count').textContent`) };
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const s = getSelection(); s.selectAllChildren(ed.querySelector('p')); s.collapseToEnd(); })()`);
for (let i = 0; i < 8; i++) { await send('Input.insertText', { text: ' more' }); await sleep(70); }
results.liveCount.during = await evaluate(`document.querySelector('.tb-count').textContent`);
results.liveCount.updated = results.liveCount.during !== results.liveCount.before;
// Logline
await click(`document.querySelector('.sb-logline')`); await sleep(300);
await evaluate(`(() => { const t = document.querySelector('.ll-main'); t.value = 'When every lamp goes dark, a lamplighter’s daughter must cross the mountains for clear oil.'; t.dispatchEvent(new Event('input')); })()`);
await evaluate(`document.querySelector('.sheet-head .btn.primary').click()`); await sleep(300);
results.notebook = { logline: await evaluate(`!!document.querySelector('.sb-ll-text')`) };
// Snippets: create, then insert from the editor's right-click menu
await click(`[...document.querySelectorAll('.sb-notebook .sb-name')].find(b => b.textContent.includes('Snippets'))`); await sleep(300);
await click(`document.querySelector('.sn-new')`); await sleep(200);
await evaluate(`(() => { document.querySelector('.sn-title-in').value = 'Weak tea'; document.querySelector('.sn-text-in .ProseMirror').focus(); })()`);
await send('Input.insertText', { text: 'A light the color of weak tea.' });
await click(`document.querySelector('.sn-card.editing .btn.primary')`); await sleep(200);
await evaluate(`document.querySelector('.sheet-head .btn.primary').click()`); await sleep(300);
await evaluate(`(() => { const p = document.querySelector('.ProseMirror p'); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 8 })); })()`);
await sleep(300);
await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.includes('Insert Snippet'))`); await sleep(300);
await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.includes('Weak tea'))`); await sleep(400);
results.notebook.snippetInserted = await evaluate(`document.querySelector('.ProseMirror').textContent.includes('color of weak tea')`);
results.notebook.snippetGone = await evaluate(`!document.querySelector('.sb-notebook') || ![...document.querySelectorAll('.sb-notebook .sb-name')].find(b => b.textContent.includes('Snippets')).querySelector('.sb-count')`);
// To-Do: an overdue item shows a red badge in Research
await click(`document.querySelector('.sb-todo')`); await sleep(300);
await evaluate(`(() => { document.querySelector('.todo-new').value = 'Check the timeline'; document.querySelector('.todo-capture .todo-date').value = '2020-01-02'; document.querySelector('.todo-capture .btn').click(); })()`); await sleep(200);
results.todo = { rows: await evaluate(`document.querySelectorAll('.todo-row').length`), overdueStat: await evaluate(`document.querySelector('.todo-stat.late b')?.textContent`) };
await evaluate(`document.querySelector('.sheet-head .btn.primary').click()`); await sleep(300);
results.todo.badge = await evaluate(`document.querySelector('.sb-overdue')?.textContent`);
// Recycle Bin: a deleted to-do can be restored
await click(`document.querySelector('.sb-todo')`); await sleep(300);
await evaluate(`[...document.querySelectorAll('.todo-row')].find(r => r.textContent.includes('Check the timeline')).querySelector('[aria-label^="Delete"]').click()`); await sleep(200);
await evaluate(`document.querySelector('.sheet-head .btn.primary').click()`); await sleep(300);
await click(`document.querySelector('.sb-bin')`); await sleep(300);
results.bin = { rows: await evaluate(`document.querySelectorAll('.bin-row').length`) };
await click(`document.querySelector('.bin-row .btn')`); await sleep(300);
results.bin.emptyAfter = await evaluate(`!!document.querySelector('.bin-empty')`);
await evaluate(`document.querySelector('.sheet-head .btn.primary').click()`); await sleep(300);
results.bin.todoBack = await evaluate(`document.querySelector('.sb-overdue')?.textContent === '1'`);
// Snippets panel beside the editor
await click(`document.querySelector('.snippets-btn')`); await sleep(300);
results.snippetPanel = await evaluate(`!document.querySelector('.snip-rail').hidden && document.querySelector('.editor-mount').classList.contains('with-snippets')`);
await click(`document.querySelector('.snippets-btn')`); await sleep(200);
results.editorTop = await evaluate(`[...document.querySelectorAll('.ed-top .sec-opts > button')].map(b => b.className.split(' ')[1])`);
results.zoomAfterPrint = await evaluate(`document.querySelector('.pv-switch .segmented').nextElementSibling.querySelector('.mag') !== null`);
results.pagerButtons = await evaluate(`[...document.querySelectorAll('.pv-host:not([hidden]) .pager .pg-btn')].map(b => b.getAttribute('aria-label'))`);
results.stopwatchIcon = await evaluate(`!!document.querySelector('.sw-toggle .sw-ic svg')`);

// ---- Table
await putCaret(1);
await click(`document.querySelector('.ql-table')`);
await sleep(200);
await pop('3 columns × 2 rows');
await sleep(300);
for (const cell of ['Lamp', 'Oil', 'Hours', 'Brass', 'Clear', '12', 'Tin', 'Tallow', '4']) { await send('Input.insertText', { text: cell }); await key('Tab'); }
await sleep(800);
results.table = { editorCells: await evaluate(`document.querySelectorAll('.ProseMirror table td, .ProseMirror table th').length`), previewCells: await evaluate(`document.querySelectorAll('.scr-flow .bk-table td, .scr-flow .bk-table th').length`) };
await shot('93-table');

// ---- Code block
await putCaret(0);
await sleep(200);
await key('Enter');
await sleep(200);
await send('Input.insertText', { text: '```' }); await send('Input.insertText', { text: ' ' });
await sleep(200);
await evaluate(`(() => { const sel = document.querySelector('.ProseMirror .pm-code-lang'); sel.value = 'yaml'; sel.dispatchEvent(new Event('change')); })()`);
await sleep(200);
await evaluate(`document.querySelector('.ProseMirror .pm-code code').focus()`);
for (const [i, line] of ['lamp:', '  fuel: clear oil   # never tallow', '  hours: 12', 'lit: true'].entries()) { if (i) await key('Enter'); await send('Input.insertText', { text: line }); }
await sleep(900);
results.code = {
  editorBlock: await evaluate(`document.querySelector('.ProseMirror .pm-code-lang')?.value`),
  editorTokens: await evaluate(`document.querySelectorAll('.ProseMirror .pm-code [class*="hljs-"]').length`),
  previewTokens: await evaluate(`document.querySelectorAll('.scr-flow pre.bk-code [class*="hljs-"]').length`),
};
await evaluate(`document.querySelector('.ProseMirror .pm-code-wrap')?.scrollIntoView({ block: 'center' })`);
await sleep(600);
await shot('93b-code-block');

// ---- Comments (right-click)
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const p = ed.querySelector('p'); const tn = [...p.childNodes].find(n => n.nodeType === 3 && n.textContent.length > 30); const r = document.createRange(); r.setStart(tn, 4); r.setEnd(tn, 20); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
await sleep(200);
await evaluate(`(() => { const p = document.querySelector('.ProseMirror p'); const b = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 60, clientY: b.top + 10 })); })()`);
await sleep(300);
await shot('94-right-click-menu');
await pop('New Comment');
await sleep(400);
await evaluate(`(() => { const t = document.querySelector('.cm-card textarea'); t.value = 'Is this too slow an opening?'; t.dispatchEvent(new Event('input')); })()`);
await click(`[...document.querySelectorAll('.cm-card .btn.primary')].find(b => b.textContent === 'Comment')`);
await sleep(400);
await evaluate(`(() => { const r = document.querySelector('.cm-reply-in'); r.value = 'Maybe trim the first line.'; r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
await sleep(500);
results.comments = { cards: await evaluate(`document.querySelectorAll('.cm-card').length`), marks: await evaluate(`document.querySelectorAll('.ProseMirror .pm-comment').length`), reply: await evaluate(`document.querySelector('.cm-reply .cm-text')?.textContent`) };
await shot('95-comments');
// Hide and show comments
await click(`document.querySelector('.comments-btn')`);
await sleep(400);
results.comments.hidden = await evaluate(`({ rail: getComputedStyle(document.querySelector('.cm-rail')).display, highlight: getComputedStyle(document.querySelector('.ProseMirror .pm-comment')).backgroundColor, btn: document.querySelector('.comments-btn').textContent })`);
await shot('95b-comments-hidden');
await click(`document.querySelector('.comments-btn')`);
await sleep(400);
results.comments.shownAgain = await evaluate(`({ rail: getComputedStyle(document.querySelector('.cm-rail')).display, btn: document.querySelector('.comments-btn').textContent })`);

// ---- Characters
await click(`window.__nav('Characters')`);
await sleep(700);
results.characters = { suggestions: await evaluate(`[...document.querySelectorAll('.ch-chip')].map(c => c.textContent)`) };
await shot('96-characters-empty');
await click(`[...document.querySelectorAll('.ch-chip')].find(c => c.textContent.includes('Mara')) || document.querySelector('.ch-empty .btn.primary')`);
await sleep(500);
await evaluate(`(() => { const n = document.querySelector('.ch-name'); if (n.value !== 'Mara Lamplighter') { n.value = 'Mara Lamplighter'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('change')); } })()`);
await evaluate(`(() => { const r = document.querySelector('.ch-role'); r.value = 'Protagonist'; r.dispatchEvent(new Event('input')); const v = document.querySelectorAll('.ch-v'); v[0].value = '19'; v[0].dispatchEvent(new Event('input')); v[1].value = 'Lamplighter’s apprentice'; v[1].dispatchEvent(new Event('input')); })()`);
await sleep(400);
results.characters.mara = { sum: await evaluate(`document.querySelector('.ch-app-sum').textContent`), rows: await evaluate(`[...document.querySelectorAll('.ch-app-row .ch-app-t')].map(x => x.textContent)`), cells: await evaluate(`document.querySelectorAll('.ch-cell.on').length`), stats: await evaluate(`document.querySelector('.ch-head-stats').innerText.replace(/\\s+/g, ' ')`) };
await click(`document.querySelector('.ch-add')`);
await sleep(400);
await evaluate(`(() => { const n = document.querySelector('.ch-name'); n.value = 'Tamsin'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('change')); const r = document.querySelector('.ch-role'); r.value = 'Mentor'; r.dispatchEvent(new Event('input')); })()`);
await sleep(400);
results.characters.tamsin = await evaluate(`document.querySelector('.ch-app-sum').textContent`);
results.characters.list = await evaluate(`[...document.querySelectorAll('.ch-row')].map(r => r.innerText.replace(/\\s+/g, ' '))`);
await shot('97-characters');
await click(`[...document.querySelectorAll('.ch-row')][0]`);
await sleep(300);
await shot('97b-character-mara');
await click(`document.querySelector('.ch-app-row')`);
await sleep(600);
results.characters.jumped = await evaluate(`document.querySelector('.sec-title').value`);

// ---- Plot board
await click(`window.__nav('Plot')`);
await sleep(700);
results.plot = { cols: await evaluate(`[...document.querySelectorAll('.pb-col')].map(c => c.innerText.replace(/\\s+/g, ' '))`), lanes: await evaluate(`[...document.querySelectorAll('.pb-lane-title')].map(i => i.value)`) };
await click(`document.querySelectorAll('.pb-cell .pb-new')[1]`);
await sleep(400);
await evaluate(`(() => { const t = document.querySelector('.pb-ed-title'); t.value = 'Mara finds the oil has turned'; const x = document.querySelector('.pb-ed-text'); x.value = 'Every lamp in the valley is dark.'; x.dispatchEvent(new Event('change')); })()`);
await click(`[...document.querySelectorAll('.pb-chip')].find(c => c.textContent.includes('Mara'))`);
await sleep(200);
await shot('98a-plot-card-edit');
await click(`[...document.querySelectorAll('.pb-ed .btn.primary')].pop()`);
await sleep(400);
// a second card in the subplot lane

const ncols = await evaluate(`document.querySelectorAll('.pb-col').length`);
await click(`document.querySelectorAll('.pb-cell .pb-new')[${ncols + 2}]`);
await sleep(400);
await evaluate(`(() => { const t = document.querySelector('.pb-ed-title'); t.value = 'Tamsin’s secret'; t.dispatchEvent(new Event('change')); })()`);
await evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
await sleep(300);
results.plot.cards = await evaluate(`[...document.querySelectorAll('.pb-card')].map(c => c.querySelector('.pb-card-t').textContent + ' @ ' + c.closest('.pb-cell').dataset.col.slice(0, 3))`);
// drag the first card one column to the right in its lane
results.plot.dragged = await evaluate(`(() => { const card = document.querySelector('.pb-card'); const from = card.closest('.pb-cell'); const cells = [...document.querySelectorAll('.pb-cell')]; const to = cells[cells.indexOf(from) + 1]; const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  const r = to.getBoundingClientRect();
  to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 20 }));
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 20 }));
  const moved = document.querySelector('.pb-card'); return { fromCol: from.dataset.col, toCol: to.dataset.col, nowCol: moved.closest('.pb-cell').dataset.col }; })()`);
await click(`document.querySelector('.pb-toolbar .btn')`);
await sleep(300);
await evaluate(`(() => { const t = [...document.querySelectorAll('.pb-lane-title')].pop(); t.value = 'The Oil Mystery'; t.dispatchEvent(new Event('change')); })()`);
await click(`document.querySelector('.pb-filter')`);
await sleep(200);
await pop('Mara Lamplighter');
await sleep(300);
results.plot.filter = { lit: await evaluate(`document.querySelectorAll('.pb-card.lit').length`), dim: await evaluate(`document.querySelectorAll('.pb-card.dim').length`) };
await shot('98-plot-board');
// Timeline view: the same cards in story order, plus a timeline-only event
await click(`[...document.querySelectorAll('.pb-views button')].find(b => b.textContent.includes('Timeline'))`);
await sleep(300);
results.plot.timeline = { items: await evaluate(`document.querySelectorAll('.tl-card').length`), cards: await evaluate(`document.querySelectorAll('.pb-card').length`) };
await click(`document.querySelector('.tl-add')`);
await sleep(300);
await evaluate(`(() => { const t = document.querySelector('.pb-ed-title'); t.value = 'The mill burns'; t.dispatchEvent(new Event('change')); const w = document.querySelector('.pb-ed-when'); w.value = 'Year 1'; w.dispatchEvent(new Event('change')); })()`);
await evaluate(`document.querySelectorAll('.popover').forEach(p => { p._cleanup?.(); p.remove(); })`);
await click(`document.querySelector('.tl-sort')`);
await sleep(300);
results.plot.timeline.after = await evaluate(`[...document.querySelectorAll('.tl-card .pb-card-t')].map(x => x.textContent)`);
results.plot.timeline.event = await evaluate(`!!document.querySelector('.tl-card.event')`);
await shot('98b-plot-timeline');
await click(`[...document.querySelectorAll('.pb-views button')].find(b => b.textContent.includes('Board'))`);
await sleep(200);
await evaluate(`document.querySelector('.plot').closest('.sheet').querySelector('.sheet-head .btn.primary').click()`);
await sleep(300);

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))`);
await sleep(1200);
{
  const fsm = await import('node:fs');
  const md = fsm.readFileSync(join(bookDir, 'chapters', 'cha-2b7d91e0.md'), 'utf8');
  results.table.markdown = (md.match(/\| Lamp[^\n]*\n[^\n]*/) || [])[0];
  results.code.markdown = (md.match(/```yaml[\s\S]*?```/) || [])[0];
  results.comments.markdown = (md.match(/\{==[^=]+==\}\{>>#c-[^<]+<<\}/) || [])[0];
  results.subtitleSaved = fsm.readFileSync(join(bookDir, 'lutefisk.yaml'), 'utf8').includes('In which the wheel stops turning');
}

// ---- 50 templates
await click(`window.__nav('Templates')`);
await sleep(700);
results.templates = { count: await evaluate(`document.querySelectorAll('.tpl-card').length`) };
await click(`[...document.querySelectorAll('.tpl-filter .segmented button')].find(b => b.textContent === 'World & Heritage')`);
await sleep(300);
results.templates.world = await evaluate(`[...document.querySelectorAll('.tpl-card:not([hidden]) .tpl-name')].map(n => n.firstChild.textContent)`);
await shot('85b-templates-world');
await click(`[...document.querySelectorAll('.tpl-filter .segmented button')].find(b => b.textContent === 'All')`);

await click(`[...document.querySelectorAll('.tpl-filter .segmented button')].find(b => b.textContent === 'Accessibility')`);
await sleep(300);
results.templates.accessibility = await evaluate(`[...document.querySelectorAll('.tpl-card:not([hidden]) .tpl-name')].map(n => n.firstChild.textContent)`);
await click(`[...document.querySelectorAll('.tpl-filter .segmented button')].find(b => b.textContent === 'Fiction')`);
await sleep(300);
await shot('85-templates-fiction');
await evaluate(`document.querySelector('.tpl-card:not(.new) .tpl-edit').click()`);
await sleep(500);
await evaluate(`(() => { const n = document.querySelector('.td-form input[type=text]'); n.value = 'My Lantern Style'; n.dispatchEvent(new Event('input')); const sel = document.querySelectorAll('.td-form select')[0]; sel.value = 'im-fell'; sel.dispatchEvent(new Event('change')); const c = document.querySelector('.td-form input[type=color]'); c.value = '#0b6e4f'; c.dispatchEvent(new Event('input')); })()`);
await sleep(300);
await shot('85c-template-designer');
await click(`[...document.querySelectorAll('.td-dlg .btn.primary')].pop()`);
await sleep(800);
results.templates.custom = await evaluate(`[...document.querySelectorAll('.tpl-card .tpl-name')].map(n => n.firstChild.textContent).filter(t => t === 'My Lantern Style').length`);
results.templates.countAfter = await evaluate(`document.querySelectorAll('.tpl-card').length`);
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(300);

// ---- Cover options
await click(`window.__nav('Book')`);
await sleep(300);
await click(`[...document.querySelectorAll('.sheet .segmented button')].find(b => b.textContent.includes('Covers'))`);
await sleep(300);
await evaluate(`(() => { const t = document.querySelector('.cover-opts textarea'); t.value = 'A lantern glowing on a mountain road at dusk'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new Event('change')); })()`);
await click(`[...document.querySelectorAll('.cover-opts .segmented button')].find(b => b.textContent === 'Within margins')`);
await click(`[...document.querySelectorAll('.cover-opts .segmented button')].find(b => b.textContent === 'Top')`);
await sleep(400);
await shot('86-cover-options');
await click(`[...document.querySelectorAll('.cover-slot .btn')].find(b => b.textContent === 'Adjust…')`);
await sleep(800);
await evaluate(`(() => { const r = document.querySelector('.ce-tools input[type=range]'); r.value = '1.6'; r.dispatchEvent(new Event('input')); const st = document.querySelector('.ce-stage'); const b = st.getBoundingClientRect(); const ev = (t, x, y) => st.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 2, clientX: x, clientY: y })); ev('pointerdown', b.left + 200, b.top + 200); ev('pointermove', b.left + 160, b.top + 240); ev('pointerup', b.left + 160, b.top + 240); })()`);
await sleep(300);
await shot('86b-cover-adjust');
await click(`[...document.querySelectorAll('.ce-dlg .btn.primary')].pop()`);
await sleep(1200);
results.coverCropped = (await import('node:fs')).readdirSync(join(bookDir, 'assets')).filter((f) => f.startsWith('cover-crop'));

await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(300);
await click(`[...document.querySelectorAll('.pv-switch .segmented button')].find(b => b.textContent.includes('Print'))`);
await sleep(800);
await evaluate(`[...document.querySelectorAll('.dv-stage, .pp-stage')].find(x => x.offsetParent).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))`);
await sleep(800);
results.cover = { printAlt: await evaluate(`document.querySelector('.pp-cover img')?.alt`), printCss: await evaluate(`document.querySelector('.pp-cover img')?.style.objectFit + ' ' + document.querySelector('.pp-cover img')?.style.objectPosition`) };
await shot('87-print-cover-margins-top');
await click(`[...document.querySelectorAll('.pv-switch .segmented button')].find(b => b.textContent.includes('E-book'))`);
await sleep(500);

// Exports
for (const kind of ['epub', 'docx', 'pdf', 'md', 'rtf', 'mobi', 'txt']) {
  const before = Date.now();
  await evaluate(`(() => { document.querySelector('.export-btn').click(); const b = [...document.querySelectorAll('.pop-item')].find(x => x.textContent.toLowerCase().includes(${JSON.stringify(({ docx: 'word', md: 'markdown' })[kind] || kind)})); b.click(); })()`);
  const file = join(outDir, `The Lantern Road.${kind}`);
  for (let i = 0; i < 120 && !existsSync(file); i++) await sleep(250);
  await sleep(800);
  results[`export_${kind}`] = existsSync(file) ? `${Date.now() - before} ms` : 'MISSING';
}
await shot('60-after-export');
{
  const txt = (await import('node:fs')).readFileSync(join(outDir, 'The Lantern Road.txt'), 'utf8');
  results.textExport = { chars: txt.length, hasChapter: /CHAPTER (ONE|1)\b/.test(txt), sceneBreak: txt.includes('* * *'), noTags: !/<\/?[a-z][^>]*>/i.test(txt) };
}
{
  const { unzipSync, strFromU8 } = await import('fflate');
  const fsm = await import('node:fs');
  const ep = unzipSync(fsm.readFileSync(join(outDir, 'The Lantern Road.epub')));
  results.math.epubImages = Object.keys(ep).filter((k) => /images\/math-/.test(k)).length;
  results.math.epubImgTag = (Object.entries(ep).map(([, v]) => strFromU8(v)).find((t) => t.includes('bk-math-img')) || '').match(/<img class="bk-math-img"[^>]*>/)?.[0];
  results.cover.epub = strFromU8(ep['OEBPS/text/cover.xhtml'] || new Uint8Array()).match(/<section[^>]*>|alt="[^"]*"/g);
  const dx = unzipSync(fsm.readFileSync(join(outDir, 'The Lantern Road.docx')));
  results.math.docxMedia = Object.keys(dx).filter((k) => k.startsWith('word/media/')).length;
  results.comments.docx = !!dx['word/comments.xml'] && (strFromU8(dx['word/comments.xml']).match(/w:comment /g) || []).length;
  results.code.docx = (strFromU8(dx['word/document.xml']).match(/Consolas/g) || []).length;
  results.table.docx = (strFromU8(dx['word/document.xml']).match(/<w:tbl>/g) || []).length;
  results.subtitle_docx = strFromU8(dx['word/document.xml']).includes('In which the wheel stops turning');
  results.math.docxAlt = (strFromU8(dx['word/document.xml']).match(/descr="[^"]*\\frac[^"]*"/) || [])[0];
  fsm.copyFileSync(join(outDir, 'The Lantern Road.epub'), join(outDir, 'math-images.epub'));
  fsm.rmSync(join(outDir, 'The Lantern Road.epub'));
}
await click(`window.__nav('Book')`);
await sleep(300);
await evaluate(`(() => { const sel = [...document.querySelectorAll('.sheet select')].find(s => [...s.options].some(o => o.value === 'mathml')); sel.value = 'mathml'; sel.dispatchEvent(new Event('change')); })()`);
await sleep(200);
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(300);
await evaluate(`(() => { document.querySelector('.export-btn').click(); [...document.querySelectorAll('.pop-item')].find(x => x.textContent.toLowerCase().includes('epub')).click(); })()`);
for (let i = 0; i < 120 && !existsSync(join(outDir, 'The Lantern Road.epub')); i++) await sleep(250);
await sleep(800);
{
  const { unzipSync, strFromU8 } = await import('fflate');
  const fsm = await import('node:fs');
  const ep = unzipSync(fsm.readFileSync(join(outDir, 'The Lantern Road.epub')));
  results.math.mathmlEpub = { opfMathml: (strFromU8(ep['OEBPS/content.opf']).match(/properties="mathml"/g) || []).length, font: Object.keys(ep).some((k) => k.includes('stix-two-math')) };
  fsm.copyFileSync(join(outDir, 'The Lantern Road.epub'), join(outDir, 'math-mathml.epub'));
}

// ---- Stage 1: binder labels/status/filter/exclude, find & replace, panes, editor formatting
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await sleep(400);
const ctxRow = (name) => evaluate(`(() => { const b = [...document.querySelectorAll('.sb-name')].find(x => x.textContent.includes('${name}')); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); })()`);
await ctxRow('Hollow Mill'); await sleep(250);
results.binder = { menu: await evaluate(`[...document.querySelectorAll('.popover .pop-label')].map(x => x.textContent)`) };
await pop('Label'); await sleep(300);
await pop('Green'); await sleep(300);
await ctxRow('The Pass'); await sleep(250);
await pop('Status'); await sleep(300);
await pop('New Status…'); await sleep(300);
await evaluate(`(() => { const i = document.querySelector('.dlg input'); i.value = 'With editor'; i.dispatchEvent(new Event('input')); document.querySelector('.dlg-form').requestSubmit(); })()`);
await sleep(400);
await ctxRow('Epilogue'); await sleep(250);
await pop('Exclude from Export'); await sleep(600);
results.binder.decor = await evaluate(`({ dot: !!document.querySelector('.sb-row .sb-dot'), status: document.querySelector('.sb-status')?.title, excluded: [...document.querySelectorAll('.sb-row.excluded .sb-label')].map(x => x.textContent), statuses: (window.__lutefiskBook || null) })`);
await click(`document.querySelector('.sb-top .sb-tool')`); await sleep(250);
await pop('With editor'); await sleep(400);
results.binder.filter = { hits: await evaluate(`[...document.querySelectorAll('.sb-row.hit .sb-label')].map(x => x.textContent)`), dimmed: await evaluate(`document.querySelectorAll('.sb-row.dim').length`), bar: await evaluate(`document.querySelector('.sb-filterbar')?.innerText`) };
await shot('100-binder-filter');
await click(`document.querySelector('.sb-filterbar button')`); await sleep(300);
// New Chapter Before
const nBefore = await evaluate(`document.querySelectorAll('.sb-group:not(.nav-group) .sb-row').length`);
await ctxRow('The Pass'); await sleep(250);
await pop('New Chapter Before'); await sleep(600);
results.binder.newBefore = { added: (await evaluate(`document.querySelectorAll('.sb-group:not(.nav-group) .sb-row').length`)) - nBefore, order: await evaluate(`[...document.querySelectorAll('.sb-group')][3]?.innerText.split('\\n').filter(Boolean).slice(0, 14)`) };
await evaluate(`(() => { const t = document.querySelector('.sec-title'); t.value = 'Interlude'; t.dispatchEvent(new Event('input')); })()`);
await sleep(300);

// Find & replace within this chapter
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await sleep(400);
await evaluate(`(() => { const i = document.querySelector('.sr-input'); i.value = 'miller'; i.dispatchEvent(new Event('input')); })()`);
await sleep(500);
await click(`document.querySelector('.sr-opt[title^="Find and replace"]')`); await sleep(200);
await evaluate(`(() => { const s = document.querySelector('.sr-scope'); s.value = 'chapter'; s.dispatchEvent(new Event('change')); const r = document.querySelectorAll('.sr-repl .sr-input')[0]; r.value = 'mill-keeper'; })()`);
await sleep(300);
results.replace = { before: await evaluate(`document.querySelector('.sr-sum')?.textContent`) };
await shot('101-find-replace');
await click(`[...document.querySelectorAll('.sr-repl .btn')].find(b => b.textContent === 'Replace All')`);
await sleep(400);
await click(`document.querySelector('.dlg .btn.primary')`);
await sleep(600);
results.replace.after = await evaluate(`document.querySelector('.sr-sum')?.textContent`);
results.replace.text = await evaluate(`document.querySelector('.ProseMirror').textContent.includes('mill-keeper')`);
await evaluate(`(() => { const i = document.querySelector('.sr-input'); i.value = ''; i.dispatchEvent(new Event('input')); })()`);
await sleep(300);

// Headings, underline, subscript, superscript, verse, page break
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const sel = getSelection(); sel.selectAllChildren(ed.firstElementChild); sel.collapseToStart(); })()`);
await evaluate(`(() => { const s = document.querySelector('.ql-header'); s.value = 'h4'; s.dispatchEvent(new Event('change')); })()`);
await sleep(200);
const selectWords = async (para, a, b) => evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); const p = ed.querySelectorAll('p')[${para}]; const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); const t = w.nextNode(); const r = document.createRange(); r.setStart(t, ${a}); r.setEnd(t, ${b}); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
await selectWords(1, 0, 4); await sleep(150);
await click(`document.querySelector('.ql-underline')`); await sleep(200);
await selectWords(2, 4, 8); await sleep(150);
await click(`document.querySelector('.ql-menu[aria-label^="Subscript"]')`); await sleep(250);
await click(`[...document.querySelectorAll('.popover .pop-item, .popover button')].find(b => b.textContent.includes('Superscript'))`); await sleep(250);
await click(`document.querySelector('.ql-menu[aria-label^="Page break"]')`); await sleep(250);
await click(`[...document.querySelectorAll('.popover .pop-item, .popover button')].find(b => b.textContent.includes('Page Break'))`); await sleep(400);
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); const ps = ed.querySelectorAll('p'); const p = ps[ps.length - 1]; const r = document.createRange(); r.selectNodeContents(p); r.collapse(true); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); })()`);
await evaluate(`(() => { const s = document.querySelector('.ql-header'); s.value = 'verse'; s.dispatchEvent(new Event('change')); })()`);
await sleep(300);
results.format = await evaluate(`({ h4: !!document.querySelector('.ProseMirror h4'), underline: !!document.querySelector('.ProseMirror u'), sup: !!document.querySelector('.ProseMirror sup:not(.pm-fn)'), verse: !!document.querySelector('.ProseMirror .pm-align-verse'), pagebreak: !!document.querySelector('.ProseMirror .pm-pagebreak'), toolbarRows: document.querySelectorAll('.editor-pane .ql-row').length })`);
await shot('102-formatting');
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))`);
await sleep(1500);
{
  const fsm = await import('node:fs');
  const files = fsm.readdirSync(join(bookDir, 'chapters')).map((f) => fsm.readFileSync(join(bookDir, 'chapters', f), 'utf8'));
  const md = files.find((t) => t.includes('####')) || '';
  results.format.saved = { h4: /^#### /m.test(md), underline: /\+\+[^+]+\+\+/.test(md), sup: /\^[^^\s][^^\n]*\^/.test(md), verse: /^::: verse$/m.test(md), pagebreak: /^\\newpage$/m.test(md) };
}

// Hide and show the panes
await click(`document.querySelector('.ed-top .sb-tool[aria-label="Hide the editor"]')`); await sleep(500);
results.panes = { editorHidden: await evaluate(`document.querySelector('.editor-pane').classList.contains('collapsed')`) };
await click(`document.querySelector('.editor-pane .pane-rail')`); await sleep(400);
await click(`document.querySelector('.pv-switch .sb-tool')`); await sleep(500);
results.panes.previewHidden = await evaluate(`document.querySelector('.preview-pane').classList.contains('collapsed')`);
await shot('103-preview-hidden');
await click(`document.querySelector('.preview-pane .pane-rail')`); await sleep(400);
await click(`document.querySelector('.sb-top .sb-tool[aria-label="Hide the binder"]')`); await sleep(500);
results.panes.binderHidden = await evaluate(`document.querySelector('.sidebar').classList.contains('collapsed')`);
await click(`document.querySelector('.sidebar .pane-rail')`); await sleep(500);
results.panes.allBack = await evaluate(`!document.querySelector('.collapsed')`);

// The split editor was removed: one editor only.
results.split = { gone: await evaluate(`!document.querySelector('.ql-split-btn') && document.querySelectorAll('.editor-mount .ProseMirror').length === 1`) };

// Link: name and address; selected text becomes the name
await evaluate(`(() => { const ed = document.querySelector('.editor-mount .ProseMirror'); ed.focus(); const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode()) && t.textContent.length < 30); const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 4); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
await click(`document.querySelector('.ql-link')`); await sleep(400);
results.link = { prefilled: await evaluate(`document.querySelector('.dlg input[name="text"]')?.value`) };
await evaluate(`(() => { const i = document.querySelector('.dlg input[name="href"]'); i.value = 'example.org/lamps'; })()`);
await click(`document.querySelector('.dlg .btn.primary')`); await sleep(400);
results.link.href = await evaluate(`document.querySelector('.ProseMirror a[href]')?.getAttribute('href')`);
// A link with its own name, typed at the caret
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const s = getSelection(); s.selectAllChildren(ed.querySelector('p')); s.collapseToEnd(); })()`);
await click(`document.querySelector('.ql-link')`); await sleep(400);
await evaluate(`(() => { document.querySelector('.dlg input[name="text"]').value = 'the lamp museum'; document.querySelector('.dlg input[name="href"]').value = 'https://example.com/museum'; })()`);
await click(`document.querySelector('.dlg .btn.primary')`); await sleep(400);
results.link.named = await evaluate(`[...document.querySelectorAll('.ProseMirror a')].some(a => a.textContent === 'the lamp museum' && a.getAttribute('href') === 'https://example.com/museum')`);

// Custom bullet
await evaluate(`(() => { const ed = document.querySelector('.ProseMirror'); ed.focus(); const s = getSelection(); s.selectAllChildren(ed.lastElementChild); s.collapseToEnd(); })()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.insertText', { text: 'Starred item' });
await click(`document.querySelector('.ql-listMenu')`); await sleep(300);
await click(`[...document.querySelectorAll('.pop-item')].find(b => b.textContent.includes('Custom Bullet'))`); await sleep(400);
await click(`[...document.querySelectorAll('.bul-chip')].find(b => b.textContent === '➤')`);
await click(`document.querySelector('.dlg .btn.primary')`); await sleep(500);
results.bullet = { editor: await evaluate(`document.querySelector('.ProseMirror ul.pm-bullets')?.dataset.bullet`) };
await sleep(1600);
await shot('104c-custom-bullet');
results.bullet.preview = await evaluate(`[...document.querySelectorAll('.scr-flow li[data-bullet]')].map(l => l.dataset.bullet)[0] || null`);

// Preview: contents button, Zoom label
await click(`[...document.querySelectorAll('.pg-btn[aria-label^="Contents"]')].find(b => b.offsetParent)`);
await sleep(300);
results.previewContents = await evaluate(`[...document.querySelectorAll('.popover .pop-item')].map(b => b.textContent.trim())`);
await click(`[...document.querySelectorAll('.popover .pop-item')].find(b => b.textContent.trim() === 'Contents')`);
await sleep(900);
// A link on the Contents page opens that part
await click(`[...document.querySelectorAll('.scr-flow .bk-toc a')].find(a => a.textContent.includes('Hollow'))`);
await sleep(900);
results.previewTocLink = await evaluate(`[...document.querySelectorAll('.pg-label')].find(x => x.offsetParent)?.textContent`);
results.previewNav = { caption: await evaluate(`[...document.querySelectorAll('.pg-label')].find(x => x.offsetParent)?.textContent`), zoomLabel: await evaluate(`[...document.querySelectorAll('.mag-val')].find(x => x.offsetParent)?.textContent`) };

// Settings & library: backup + delete (on a throwaway copy)
await click(`document.querySelector('.titlebar .tb-icon[aria-label="Settings"]')`); await sleep(400);
results.settings = await evaluate(`document.querySelector('.settings')?.innerText.split('\\n').filter(Boolean).slice(0, 8)`);
await shot('105-settings');
await evaluate(`document.querySelector('.settings').closest('.sheet').querySelector('.sheet-head .btn.primary').click()`);
await sleep(300);


results.backup = JSON.parse(await evaluate(`window.lutefisk.backupProject({}).then((r) => JSON.stringify({ ok: !!r, bytes: r && r.bytes }))`));
{
  const { unzipSync } = await import('fflate');
  const fsm = await import('node:fs');
  const zf = fsm.readdirSync(outDir).find((f) => f.endsWith('.zip') && f.includes('backup'));
  if (zf) { const z = unzipSync(fsm.readFileSync(join(outDir, zf))); results.backup.entries = Object.keys(z).length; results.backup.hasYaml = Object.keys(z).some((k) => k.endsWith('/lutefisk.yaml')); }
}

// Security probes from inside the renderer.
results.security = await evaluate(`(async () => {
  const out = {};
  out.nodeRequire = typeof require;
  out.process = typeof process;
  try { await fetch('https://example.com'); out.fetch = 'ALLOWED'; } catch { out.fetch = 'blocked'; }
  out.bridge = Object.keys(window.lutefisk).sort().join(',');
  try { await window.lutefisk.openExternal('file:///etc/passwd'); out.fileOpen = 'ALLOWED'; } catch { out.fileOpen = 'blocked'; }
  try { const r = await fetch('book://current/../lutefisk.yaml'); out.bookEscape = r.status; } catch { out.bookEscape = 'blocked'; }
  return out;
})()`);

try { results.goals.bookHistoryLines = (await import('node:fs')).readFileSync(join(bookDir, 'stats', 'history.jsonl'), 'utf8').trim().split('\n').length; results.goals.globalHistoryLines = (await import('node:fs')).readFileSync(join(userData, 'history.jsonl'), 'utf8').trim().split('\n').length; } catch (e) { results.goals.historyError = String(e); }
results.console = consoleMsgs.filter((m) => !/DevTools|Autofill/.test(m)).slice(0, 30);
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
ws.close();
proc.kill();
await sleep(500);
if (process.env.KEEP_USERDATA !== '1') rmSync(join(userData, 'recent.json'), { force: true });
