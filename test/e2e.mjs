// End-to-end smoke test: launches the real Electron app (under Xvfb on Linux),
// opens the sample book, drives the UI via the DevTools protocol, measures
// preview latency, captures screenshots and runs all three exporters.
// Usage: node test/e2e.mjs <bookDir> <outDir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const [bookDir, outDir] = process.argv.slice(2);
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
await sleep(1500);
await shot('01-library');
await click(`document.querySelector('.lib-new')`);
await sleep(500);
await evaluate(`(() => { const i = document.querySelector('.nb-form input'); i.value = 'Moonlight Ferry'; i.dispatchEvent(new Event('input')); })()`);
await sleep(300);
await shot('01b-new-book');
await evaluate(`document.querySelector('.nb-form .dlg-actions .btn.primary').click()`);
await sleep(1500);
await shot('01c-new-book-open');
await click(`document.querySelector('.tb-left .tb-icon')`);
await sleep(1200);
await shot('01d-library-two');
await click(`[...document.querySelectorAll('.lib-book')].find(b => b.textContent.includes('Lantern'))`);
await sleep(1500);
const results = {};

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
await setSelect('.pv-font', 'eb-garamond');
await evaluate(`(() => { const r = document.querySelector('.pv-size'); r.value = 130; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()`);
await sleep(500);
await shot('21-ipad-sepia-garamond-130');
await setSelect('.pv-font', '');
await setSelect('.pv-theme', 'light');
await evaluate(`(() => { const r = document.querySelector('.pv-size'); r.value = 100; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()`);
await setSelect('.pv-device', 'kindle-oasis');

// Chapter 2 (image) on Kobo Forma
await click(`[...document.querySelectorAll('.sb-name')].find(b => b.textContent.includes('Hollow Mill'))`);
await setSelect('.pv-device', 'kobo-forma');
await sleep(500);
await evaluate(`document.querySelector('.pg-btn[aria-label="Next page"]').click()`);
await sleep(300);
await shot('22-kobo-forma-image');

// Whole-book navigation: front cover, end.
await setSelect('.pv-device', 'kindle-paperwhite');
await evaluate(`document.querySelector('.pg-btn[aria-label="Front cover"]').click()`);
await sleep(400);
await shot('23-front-cover');
await evaluate(`document.querySelector('.pg-btn[aria-label="Next page"]').click()`);
await sleep(400);
await shot('24-after-cover');
await evaluate(`document.querySelector('.pg-btn[aria-label="Back cover"]').click()`);
await sleep(400);
await shot('25-end');
// Magnify the device and the editor text.
await evaluate(`document.querySelector('.mag button[aria-label="Zoom in"]').click(); document.querySelector('.mag button[aria-label="Zoom in"]').click()`);
await evaluate(`document.querySelector('.zoom-ctl button[aria-label="Zoom in"]').click(); document.querySelector('.zoom-ctl button[aria-label="Zoom in"]').click()`);
await sleep(500);
await shot('26-zoomed');
await evaluate(`document.querySelector('.mag-val').click(); document.querySelector('.zoom-val').click()`);
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
await click(`document.querySelector('.pv-bar .segmented button[data-v="single"]')`);
await sleep(600);
await shot('31-print-single');
await click(`document.querySelector('.pv-bar .segmented button[data-v="spread"]')`);
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

// Readability: focus mode + fit width, arrow keys, drop cap toggles.
await click(`document.querySelector('.pv-switch button[data-v="print"]')`);
await sleep(600);
await click(`document.querySelector('.focus-btn')`);
await click(`document.querySelector('.pv-host:not([hidden]) .segmented button[data-v="width"]')`);
await sleep(700);
await shot('34-print-focus-width');
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
await click(`[...document.querySelectorAll('.pv-host:not([hidden]) .chip-toggle')].find(b => b.textContent.includes('Drop caps'))`);
await sleep(600);
results.dropCaps.printOff = await dcFloat(printSel);
await shot('35-print-no-dropcap');
await click(`document.querySelector('.pv-switch button[data-v="device"]')`);
await sleep(500);
results.dropCaps.ebookStillOn = await dcFloat('.scr-flow .bk-body > p:first-of-type');
await click(`[...document.querySelectorAll('.pv-host:not([hidden]) .chip-toggle')].find(b => b.textContent.includes('Drop caps'))`);
await sleep(500);
results.dropCaps.previewOff = await dcFloat('.scr-flow .bk-body > p:first-of-type');
const firstLine = () => evaluate(`getComputedStyle(document.querySelector('.scr-flow .bk-body > p'), '::first-line').fontVariantCaps`);
results.openingLine = { defaultWithDropCapOff: await firstLine() };
await click(`[...document.querySelectorAll('.pv-host:not([hidden]) .chip-toggle')].find(b => b.textContent.includes('Drop caps'))`);
await sleep(400);
results.openingLine.defaultWithDropCapOn = await firstLine();
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Book'))`);
await sleep(300);
await click(`[...document.querySelectorAll('.sheet .segmented button')].find(b => b.textContent.includes('Chapters'))`);
await sleep(200);
await evaluate(`(() => { const sel = [...document.querySelectorAll('.sheet select')].find(s => [...s.options].some(o => o.value === 'smallcaps')); sel.value = 'smallcaps'; sel.dispatchEvent(new Event('change')); })()`);
await sleep(500);
await shot('37-settings-case');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(500);
results.openingLine.smallcapsWithDropCapOn = await firstLine();
await click(`[...document.querySelectorAll('.pv-host:not([hidden]) .chip-toggle')].find(b => b.textContent.includes('Drop caps'))`);
await sleep(400);
results.openingLine.smallcapsWithDropCapOff = await firstLine();
await click(`[...document.querySelectorAll('.pv-host:not([hidden]) .chip-toggle')].find(b => b.textContent.includes('Drop caps'))`);
await shot('36-chapter-dropcap-off');
await click(`document.querySelector('.focus-btn')`);
await sleep(300);

// Chapter heading options from the editor.
const headText = () => evaluate(`(() => { const h = document.querySelector('.scr-flow .bk-head'); return h ? h.innerText.replace(/\\s+/g, ' ').trim() : ''; })()`);
const setHead = async (v) => { await setSelect('.head-sel', v); await sleep(400); return headText(); };
results.headings = {
  numeral: await setHead('numeral'),
  wordOnly: await setHead('word-only'),
  numberOnly: await setHead('number-only'),
  none: await setHead('none'),
  noneNoTitle: await setHead('title-off'),
  wordsNoTitle: await setHead('words'),
};
await shot('38-heading-options');
await setHead('title-on');
await setHead('');

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
await click(`document.querySelector('.notes-btn')`);
await sleep(200);
await evaluate(`(() => { const t = document.querySelector('.notes-box textarea'); t.value = 'Mara finds the second lamp.'; t.dispatchEvent(new Event('input')); })()`);
await sleep(200);
await shot('75-scene-notes');
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
// Chapter statistics
await click(`document.querySelector('.stats-btn')`);
await sleep(700);
results.chapterStats = {
  title: await evaluate(`document.querySelector('.sheet-head h2, .sheet-head b, .sheet h2')?.textContent`),
  tiles: await evaluate(`[...document.querySelectorAll('.chapter-stats .tile')].map(t => t.querySelector('.tile-l').textContent + ': ' + t.querySelector('.tile-v').textContent)`),
  dates: await evaluate(`[...document.querySelectorAll('.chapter-stats .cs-box')][0]?.innerText.split('\\n').slice(0, 14)`),
  scenesTable: await evaluate(`document.querySelectorAll('.chapter-stats .stat-table tbody tr').length`),
};
await shot('76b-chapter-stats');
await evaluate(`document.querySelector('.chapter-stats').closest('.sheet').querySelector('.sheet-head .btn').click()`);
await sleep(300);

results.scenes.cardNote = await evaluate(`document.querySelector('.scene-card .sc-note')?.title`);
await shot('76-scene-overview');

// ---- Research
await click(`document.querySelector('.sb-group.research .sb-add')`);
await sleep(200);
await pop('New Character');
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

// ---- Hide / show preview
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Preview'))`);
await sleep(400);
results.previewToggle = { hidden: await evaluate(`document.querySelector('.workspace').classList.contains('no-preview')`) };
await shot('78-preview-hidden');
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Preview'))`);
await sleep(600);
results.previewToggle.shownAgain = !(await evaluate(`document.querySelector('.workspace').classList.contains('no-preview')`));

// ---- Focus mode
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Focus'))`);
await sleep(600);
results.focus = { on: await evaluate(`document.querySelector('.shell').classList.contains('writing-focus')`) };
await shot('76-focus-mode');
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
await sleep(400);
results.focus.offAfterEsc = !(await evaluate(`document.querySelector('.shell').classList.contains('writing-focus')`));

// Templates gallery
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Design'))`);
await sleep(700);
await shot('40-templates');
results.templateCards = await evaluate(`document.querySelectorAll('.tpl-card').length`);
await click(`[...document.querySelectorAll('.tpl-card')].find(c => c.textContent.includes('Epic Fantasy'))`);
await sleep(600);
await shot('41-fantasy-template');

// Stats
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Insights'))`);
await sleep(700);
await shot('50-stats');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);

// Book settings
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Book'))`);
await sleep(500);
await shot('51-settings');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);

// Bibliography panel
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Sources'))`);
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
results.goals = { meter: await evaluate(`document.querySelector('.goal-meter').textContent`) };
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Goals'))`);
await sleep(500);
await evaluate(`(() => { const ins = [...document.querySelectorAll('.goal-fields input')]; const set = (i, v) => { ins[i].value = v; ins[i].dispatchEvent(new Event('input')); }; set(0, 40000); set(1, 220); set(3, 500); set(4, 1000); })()`);
await evaluate(`(() => { const d = document.querySelector('.goal-fields input[type=date]'); d.value = '2027-06-30'; d.dispatchEvent(new Event('input')); })()`);
await sleep(600);
results.goals.today = await evaluate(`document.querySelector('.goals .tile .tile-v').textContent`);
results.goals.progress = await evaluate(`[...document.querySelectorAll('.gprog-top span')].map(x => x.textContent)`);
await shot('80-goals');
await click(`[...document.querySelectorAll('.goal-scope button')].find(b => b.textContent.includes('All'))`);
await sleep(400);
await shot('81-goals-all-books');
await evaluate(`document.querySelector('.sheet-head .btn').click()`);
await sleep(300);
results.goals.meterAfter = await evaluate(`document.querySelector('.goal-meter').textContent`);

// ---- Session clock
results.session = { clock: await evaluate(`document.querySelector('.session-clock')?.textContent`) };
await click(`document.querySelector('.session-clock')`);
await sleep(300);
results.session.panel = await evaluate(`document.querySelector('.sc-panel')?.innerText`);
await shot('82-session-clock');
await evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
await sleep(200);

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
await click(`document.querySelector('.notes-btn')`);
await sleep(200);
await evaluate(`(() => { const t = document.querySelector('.notes-box textarea'); t.value = 'Remember: Tamsin knows about the oil.'; t.dispatchEvent(new Event('input')); })()`);
await sleep(200);
await shot('92-subtitle-and-notes');
results.notes = await evaluate(`document.querySelector('.notes-btn').textContent`);
await click(`document.querySelector('.notes-box .tb-btn')`);

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
await click(`document.querySelector('.ql-code')`);
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

// ---- Drawing
await putCaret(0);
await click(`document.querySelector('.ql-pen')`);
await sleep(600);
const stroke = async (pts, opts = '') => {
  await evaluate(`(() => { const c = document.querySelector('.dr-canvas'); const b = c.getBoundingClientRect(); const pts = ${JSON.stringify(pts)};
    const ev = (type, [x, y], i) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: b.left + x * b.width, clientY: b.top + y * b.height, timeStamp: i * 16 ${opts} }));
    ev('pointerdown', pts[0], 0); pts.slice(1).forEach((p, i) => ev('pointermove', p, i + 1)); ev('pointerup', pts[pts.length - 1], pts.length); })()`);
};
const wave = (y0, amp) => Array.from({ length: 40 }, (_, i) => [0.1 + i * 0.02, y0 + Math.sin(i / 4) * amp]);
await stroke(wave(0.35, 0.08));
await click(`[...document.querySelectorAll('.dr-swatch')][3]`);
await click(`[...document.querySelectorAll('.dr-tool')].find(b => b.dataset.t === 'brush')`);
await stroke(wave(0.6, 0.1));
await click(`[...document.querySelectorAll('.dr-tool')].find(b => b.dataset.t === 'ellipse')`);
await click(`[...document.querySelectorAll('.dr-swatch')][7]`);
await stroke([[0.6, 0.2], [0.85, 0.45]]);
await click(`[...document.querySelectorAll('.dr-tool')].find(b => b.dataset.t === 'marker')`);
await click(`[...document.querySelectorAll('.dr-swatch')][5]`);
await evaluate(`(() => { const r = document.querySelector('.dr-row input[type=range]'); r.value = '24'; r.dispatchEvent(new Event('input')); })()`);
await stroke([[0.12, 0.8], [0.5, 0.8], [0.88, 0.8]]);
await sleep(300);
await shot('96-drawing-editor');
await click(`[...document.querySelectorAll('.dr-dlg .btn.primary')].pop()`);
await sleep(1200);
results.drawing = { node: await evaluate(`!!document.querySelector('.ProseMirror .pm-img img[src*="drawing-"]')`) };
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))`);
await sleep(1200);
{
  const fsm = await import('node:fs');
  const md = fsm.readFileSync(join(bookDir, 'chapters', 'cha-2b7d91e0.md'), 'utf8');
  results.drawing.markdown = (md.match(/!\[Drawing\]\([^)]*\)\{[^}]*\}/) || [])[0];
  results.drawing.files = fsm.readdirSync(join(bookDir, 'assets')).filter((f) => f.startsWith('drawing-'));
  results.table.markdown = (md.match(/\| Lamp[^\n]*\n[^\n]*/) || [])[0];
  results.code.markdown = (md.match(/```yaml[\s\S]*?```/) || [])[0];
  results.comments.markdown = (md.match(/\{==[^=]+==\}\{>>#c-[^<]+<<\}/) || [])[0];
  results.subtitleSaved = fsm.readFileSync(join(bookDir, 'book.yaml'), 'utf8').includes('In which the wheel stops turning');
}
// Re-edit the drawing
await evaluate(`document.querySelector('.ProseMirror .pm-img img[src*="drawing-"]').closest('.pm-img').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
await sleep(700);
results.drawing.reopenedStrokes = await evaluate(`!!document.querySelector('.dr-canvas')`);
await click(`[...document.querySelectorAll('.dr-tool')].find(b => b.dataset.t === 'arrow')`);
await stroke([[0.15, 0.15], [0.45, 0.3]]);
await click(`[...document.querySelectorAll('.dr-dlg .btn.primary')].pop()`);
await sleep(1200);
await evaluate(`document.querySelector('.ProseMirror .pm-img img[src*="drawing-"]')?.scrollIntoView({ block: 'center' })`);
await sleep(800);
await shot('97-drawing-in-book');

// ---- 50 templates
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Design'))`);
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
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Book'))`);
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
await evaluate(`document.querySelector('.pv-host:not([hidden]) .pg-btn[aria-label="Front cover"]').click()`);
await sleep(800);
results.cover = { printAlt: await evaluate(`document.querySelector('.pp-cover img')?.alt`), printCss: await evaluate(`document.querySelector('.pp-cover img')?.style.objectFit + ' ' + document.querySelector('.pp-cover img')?.style.objectPosition`) };
await shot('87-print-cover-margins-top');
await click(`[...document.querySelectorAll('.pv-switch .segmented button')].find(b => b.textContent.includes('E-book'))`);
await sleep(500);

// Exports
for (const kind of ['epub', 'docx', 'pdf', 'md', 'rtf', 'mobi']) {
  const before = Date.now();
  await evaluate(`(() => { document.querySelector('.export-btn').click(); const b = [...document.querySelectorAll('.pop-item')].find(x => x.textContent.toLowerCase().includes(${JSON.stringify(({ docx: 'word', md: 'markdown' })[kind] || kind)})); b.click(); })()`);
  const file = join(outDir, `The Lantern Road.${kind}`);
  for (let i = 0; i < 120 && !existsSync(file); i++) await sleep(250);
  await sleep(800);
  results[`export_${kind}`] = existsSync(file) ? `${Date.now() - before} ms` : 'MISSING';
}
await shot('60-after-export');
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
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Book'))`);
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

// Security probes from inside the renderer.
results.security = await evaluate(`(async () => {
  const out = {};
  out.nodeRequire = typeof require;
  out.process = typeof process;
  try { await fetch('https://example.com'); out.fetch = 'ALLOWED'; } catch { out.fetch = 'blocked'; }
  out.bridge = Object.keys(window.lutefisk).sort().join(',');
  try { await window.lutefisk.openExternal('file:///etc/passwd'); out.fileOpen = 'ALLOWED'; } catch { out.fileOpen = 'blocked'; }
  try { const r = await fetch('book://current/../book.yaml'); out.bookEscape = r.status; } catch { out.bookEscape = 'blocked'; }
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
