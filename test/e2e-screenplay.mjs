// End-to-end test for screenplays: creates a new screenplay through the UI,
// types with Final Draft–style element flow and SmartType, opens the sample
// screenplay, exercises every view, and runs every export.
// Usage: node test/e2e-screenplay.mjs <sampleScriptDir> <outDir>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const [scriptDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const userData = join(os.homedir(), '.config', 'Lutefisk');
mkdirSync(userData, { recursive: true });
writeFileSync(join(userData, 'recent.json'), JSON.stringify([{ dir: scriptDir, title: 'The Lantern Road' }]));
const PORT = 9335;
const proc = spawn(join(process.cwd(), 'node_modules', '.bin', 'electron'), ['.', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--window-size=1600,1000'], { env: { ...process.env, LUTEFISK_TEST_OUT: outDir, LUTEFISK_TEST_IN: join(outDir, 'The Lantern Road.fadein') }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let i = 0; i < 60 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.url.startsWith('app://lutefisk')); } catch { /* starting */ } if (!t) await sleep(500); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description); });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64')); };
const click = (sel) => ev(`(() => { const el = ${sel}; if (!el) throw new Error('not found: ' + ${JSON.stringify(sel)}); el.click(); return true; })()`);
const key = async (k, mods = 0) => {
  const codes = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40 };
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: codes[k], nativeVirtualKeyCode: codes[k], modifiers: mods });
  await sleep(60);
};
const type = async (text) => { await send('Input.insertText', { text }); await sleep(60); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await sleep(1500);
const R = {};

// ---- New screenplay via the New Project sheet
await ev(`localStorage.removeItem('lutefisk.guideSeen')`);
await click(`document.querySelector('.lib-new')`);
await sleep(400);
await click(`[...document.querySelectorAll('.nb-kind button')].find(b => b.textContent.includes('Screenplay'))`);
await ev(`(() => { const i = document.querySelectorAll('.nb-form input'); i[0].value = 'Night Train'; i[0].dispatchEvent(new Event('input')); i[2].value = 'Sam Writer'; i[2].dispatchEvent(new Event('input')); })()`);
await sleep(300);
await shot('sp-01-new-project');
await click(`document.querySelector('.nb-form .btn.primary')`);
await sleep(1500);
R.welcomeBanner = await ev(`!!document.querySelector('.guide-banner')`);
await shot('sp-01b-welcome');
await ev(`document.querySelector('.guide-banner .tb-btn')?.click()`);
// Cursor into the empty scene heading, then type with element flow.
await ev(`(() => { const ed = document.querySelector('.sp-editor'); ed.focus(); const last = ed.lastElementChild; const s = getSelection(); s.selectAllChildren(last); s.collapseToEnd(); })()`);
await type('INT. TRAIN CAR - NIGHT');
await key('Enter'); // → Action
await type('Rain streaks the windows. SAM (30s) counts coins on the table.');
await key('Enter'); await key('Tab'); // → Character
await type('SAM');
await key('Enter'); // → Dialogue
await type('Three dollars. Enough for one ticket.');
await key('Enter'); await key('Tab'); // Action → Character
await type('CONDUCTOR');
await key('Enter');
await type('(not unkindly)');
await key('Enter');
await type('Then somebody walks.');
await key('Enter');
await key('Enter'); await key('Tab');
await type('SA');
await sleep(200);
R.smarttype = await ev(`[...document.querySelectorAll('.st-item')].map(x => x.textContent)`);
await shot('sp-02-smarttype');
await key('Enter'); // accept SAM
await key('Enter'); // → dialogue
await type('Then I walk.');
await key('Enter'); await key('Tab'); await key('Tab'); // Character → Transition
await type('CUT TO:');
await sleep(600);
R.hint = await ev(`document.querySelector('.st-hint-text')?.textContent`);
R.typedElements = await ev(`[...document.querySelectorAll('.sp-editor .sp-el')].map(p => p.dataset.t + ': ' + p.textContent)`);
await shot('sp-03-typed');

// ---- Open the sample screenplay
await click(`document.querySelector('.tb-left .tb-icon')`);
await sleep(1200);
await shot('sp-04-library');
await click(`[...document.querySelectorAll('.lib-book')].find(b => b.textContent.includes('Lantern'))`);
await sleep(1800);
await shot('sp-05-workspace-no-preview');
R.previewHiddenByDefault = await ev(`document.querySelector('.workspace').classList.contains('no-preview')`);
R.status = await ev(`document.querySelector('.st-words').textContent`);
R.scenes = await ev(`document.querySelectorAll('.sb-scnum').length`);
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Preview'))`);
await sleep(900);
await shot('sp-06-pages');
R.pagesShown = await ev(`document.querySelectorAll('.sp-stack .sp-page').length`);
R.moreContd = await ev(`document.querySelector('.sp-stack').textContent.includes('(MORE)')`);
await click(`document.querySelector('.sp-pane .segmented button[data-v="cards"]')`);
await sleep(700);
await shot('sp-09-index-cards');
await click(`document.querySelector('.sp-pane .segmented button[data-v="title"]')`);
await sleep(500);
await sleep(400);
await shot('sp-10-title-page');
await click(`document.querySelector('.sp-pane .segmented button[data-v="script"]')`);
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Insights'))`);
await sleep(600);
await shot('sp-12-insights');
await ev(`document.querySelector('.sheet-head .btn').click()`);
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Script'))`);
await sleep(400);
await shot('sp-13-settings');
await ev(`document.querySelector('.sheet-head .btn').click()`);

// ---- Guide
await click(`[...document.querySelectorAll('.tb-item')].find(b => b.textContent.includes('Guide'))`);
await sleep(600);
R.guideTags = await ev(`[...document.querySelectorAll('.guide-tag')].map(t => t.textContent)`);
await shot('sp-14-guide-anatomy');
for (const [id, name] of [['elements', 'sp-15-guide-elements'], ['start', 'sp-16-guide-start'], ['format', 'sp-17-guide-format'], ['keys', 'sp-18-guide-keys']]) {
  await click(`document.querySelector('.guide-nav button[data-id="${id}"]')`);
  await sleep(400);
  await shot(name);
}
await click(`document.querySelector('.guide-nav button[data-id="start"]')`);
await sleep(300);
const before = await ev(`document.querySelectorAll('.sp-editor .sp-el').length`);
await click(`document.querySelector('.guide-content .btn.primary')`);
await sleep(800);
R.exampleInserted = (await ev(`document.querySelectorAll('.sp-editor .sp-el').length`)) - before;
await shot('sp-19-example-inserted');
await ev(`document.execCommand('undo')`);

// ---- Exports
for (const [kind, label] of [['pdf', 'PDF'], ['fdx', 'Final Draft'], ['fadein', 'Fade In'], ['fountain', 'Fountain'], ['docx', 'Word'], ['txt', 'Plain Text']]) {
  await ev(`(() => { document.querySelector('.export-btn').click(); [...document.querySelectorAll('.pop-item')].find(x => x.textContent.startsWith(${JSON.stringify(label)})).click(); })()`);
  const file = join(outDir, `The Lantern Road.${kind}`);
  for (let i = 0; i < 80 && !existsSync(file); i++) await sleep(250);
  await sleep(500);
  R[`export_${kind}`] = existsSync(file);
}
// ---- Round-trip: import the .fadein we just wrote
R.originalElements = await ev(`[...document.querySelectorAll('.sp-editor .sp-el')].map(p => p.dataset.t + (p.classList.contains('dual') ? '^' : '') + ': ' + p.textContent)`);
await click(`document.querySelector('.tb-left .tb-icon')`);
await sleep(1200);
await click(`[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('Import Screenplay'))`);
await sleep(2500);
R.importToast = await ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`);
R.importedElements = await ev(`[...document.querySelectorAll('.sp-editor .sp-el')].map(p => p.dataset.t + (p.classList.contains('dual') ? '^' : '') + ': ' + p.textContent)`);
const norm = (a) => a.map((x) => x.startsWith('character') ? x.toUpperCase() : x);
R.roundTripSame = JSON.stringify(norm(R.originalElements)) === JSON.stringify(norm(R.importedElements));
if (!R.roundTripSame) R.roundTripDiff = R.originalElements.map((x, i) => x === R.importedElements[i] ? null : [i, x, R.importedElements[i]]).filter(Boolean).slice(0, 8);
await click(`document.querySelector('.sp-pane .segmented button[data-v="title"]')`);
await sleep(500);
R.importedTitlePage = await ev(`[...document.querySelectorAll('.gen-panel .fld input, .gen-panel .fld textarea')].map(i => i.value).filter(Boolean)`);
await shot('sp-20-fadein-imported');
R.errors = logs;
writeFileSync(join(outDir, 'sp-results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R, null, 2));
ws.close(); proc.kill(); await sleep(400);
rmSync(join(userData, 'recent.json'), { force: true });
