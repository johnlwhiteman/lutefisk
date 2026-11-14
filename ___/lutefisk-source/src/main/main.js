// Lutefisk — Electron main process.
//
// Security model
//  • Renderer is sandboxed, context-isolated, has no Node.js, and talks to the
//    main process only through the small, validated API in preload.js.
//  • A strict Content-Security-Policy is sent with every app page.
//  • The renderer cannot reach the network: every http(s)/ws request from the
//    default session is canceled. Book text never leaves this computer.
//  • The only outbound request the app ever makes is when *you* paste a URL
//    into the bibliography tool; that request goes to that URL only, from an
//    in-memory session with no cookies, and carries no book data.
//  • No telemetry, crash reporting, or auto-update.
import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell, nativeTheme, nativeImage } from 'electron';
import path from 'node:path';
import fsSync from 'node:fs';
import { promises as fs } from 'node:fs';
import {
  loadBook, saveBook, createBook, importAsset, writeAssetData, writeDrawing, readDrawing, isBookDir, within, mimeFor, isAssetPath, readSummary, importResearchFile,
} from './bookstore.js';
import { buildEpub } from './export-epub.js';
import { buildDocx } from './export-docx.js';
import { buildMarkdown } from './export-markdown.js';
import { buildText } from './export-txt.js';
import { buildRtf } from './export-rtf.js';
import { buildMobi } from './export-mobi.js';
import { zip as zipAsync } from 'fflate';
import { texToMathml } from '../shared/math.js';

const APP_ROOT = path.join(__dirname, 'renderer');
const isDev = !app.isPackaged && process.env.LUTEFISK_DEV === '1';

let win = null;
let bookDir = null; // the only folder the renderer may touch
let allowClose = false;
const exportPages = new Map(); // token → html for PDF rendering

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' book: data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src book:",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const PRINT_CSP = "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' book: data:; font-src 'self'; script-src 'none'";

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  { scheme: 'book', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } },
]);

// Sandbox every renderer. (--no-sandbox is only for CI containers running as root.)
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
app.setName('Lutefisk');
const APP_ICON = path.join(__dirname, 'renderer', 'assets', 'icon-512.png');
app.setAboutPanelOptions({
  applicationName: 'Lutefisk',
  applicationVersion: app.getVersion(),
  copyright: 'Your words stay on your computer.',
  credits: 'Write, design and publish books, privately.',
  iconPath: APP_ICON,
});

// The app used to be called Chedditor: carry over its recent books, preferences
// and writing history the first time Lutefisk starts.
function migrateFromChedditor() {
  try {
    const oldDir = path.join(app.getPath('appData'), 'Chedditor');
    const newDir = app.getPath('userData');
    if (!fsSync.existsSync(oldDir)) return;
    fsSync.mkdirSync(newDir, { recursive: true });
    for (const f of ['recent.json', 'prefs.json', 'history.jsonl']) {
      const from = path.join(oldDir, f), to = path.join(newDir, f);
      if (fsSync.existsSync(from) && !fsSync.existsSync(to)) fsSync.copyFileSync(from, to);
    }
  } catch { /* nothing to migrate */ }
}

// Packaged builds refuse remote debugging, so nothing can attach to a running
// session and read the manuscript out of memory.
if (app.isPackaged && (app.commandLine.hasSwitch('remote-debugging-port') || app.commandLine.hasSwitch('remote-debugging-pipe') || app.commandLine.hasSwitch('inspect'))) {
  app.exit(1);
}

/* ------------------------------------------------------------------ helpers */

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
async function getRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((x) => typeof x?.dir === 'string').slice(0, 12) : [];
  } catch { return []; }
}
async function addRecent(dir, title) {
  const list = (await getRecent()).filter((r) => r.dir !== dir);
  list.unshift({ dir, title: String(title || path.basename(dir)), opened: new Date().toISOString() });
  await fs.mkdir(path.dirname(recentFile()), { recursive: true });
  await fs.writeFile(recentFile(), JSON.stringify(list.slice(0, 12), null, 2), { mode: 0o600 });
}

function requireBook() {
  if (!bookDir) throw new Error('No book is open');
  return bookDir;
}

/** Only accept IPC from our own top-level page. */
function trusted(e) {
  const url = e.senderFrame?.url || '';
  return e.sender === win?.webContents && url.startsWith('app://lutefisk/');
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trusted(e)) throw new Error('Untrusted sender');
    return fn(...args);
  });
}

async function openBookAt(dir) {
  const data = await loadBook(dir);
  if (data.book?.kind && data.book.kind !== 'book') throw new Error('That project isn’t a book. This version of Lutefisk opens books only.');
  bookDir = dir;
  await addRecent(dir, data.book.title);
  win?.setTitle(`${data.book.title || 'Untitled'} — Lutefisk`);
  return data;
}

/* ---------------------------------------------------------------- protocols */

function registerProtocols() {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    if (url.host !== 'lutefisk') return new Response('Not found', { status: 404 });
    if (url.pathname.startsWith('/__export/')) {
      const html = exportPages.get(url.pathname.slice('/__export/'.length));
      if (!html) return new Response('Not found', { status: 404 });
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PRINT_CSP } });
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    let file;
    try { file = within(APP_ROOT, rel); } catch { return new Response('Forbidden', { status: 403 }); }
    try {
      const body = await fs.readFile(file);
      const headers = { 'content-type': mimeFor(file), 'x-content-type-options': 'nosniff' };
      if (file.endsWith('.html')) headers['content-security-policy'] = CSP;
      return new Response(body, { headers });
    } catch { return new Response('Not found', { status: 404 }); }
  });

  protocol.handle('book', async (req) => {
    const url = new URL(req.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (url.host !== 'current' || !bookDir) return new Response('Not found', { status: 404 });
    if (!isAssetPath(rel)) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.readFile(within(bookDir, rel));
      return new Response(body, {
        headers: {
          'content-type': mimeFor(rel), 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache',
          'access-control-allow-origin': 'app://lutefisk', // lets CSS shape-outside read image transparency
          // PDFs open in Chromium's built-in viewer; everything else gets a no-script policy.
          ...(rel.endsWith('.pdf') ? {} : { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }),
        },
      });
    } catch { return new Response('Not found', { status: 404 }); }
  });
}

function lockDownSession() {
  const ses = session.defaultSession;
  // Block every network request from app windows (book data stays local).
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (_d, cb) => cb({ cancel: true }));
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setSpellCheckerDictionaryDownloadURL('https://localhost.invalid/');
  ses.on('will-download', (e) => e.preventDefault());
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('will-redirect', (e) => e.preventDefault());
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

/* ------------------------------------------------------------------- window */

const MAC = process.platform === 'darwin';
/** Day, night, or follow the system. The window's CSS follows prefers-color-scheme, which this sets. */
function applyTheme(theme) { nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system'; }
const overlay = () => (nativeTheme.shouldUseDarkColors
  ? { color: '#00000000', symbolColor: '#e8e6e3', height: 52 }
  : { color: '#00000000', symbolColor: '#1d1d1f', height: 52 });

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1080, minHeight: 660,
    title: 'Lutefisk',
    icon: APP_ICON,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f5f5f7',
    show: false,
    // Unified title bar: content extends under it like native document apps.
    ...(MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 }, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
      : { titleBarStyle: 'hidden', titleBarOverlay: overlay() }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      spellcheck: true,
      devTools: isDev,
      plugins: true, // Chromium's built-in PDF viewer for research PDFs
    },
  });
  if (!MAC) nativeTheme.on('updated', () => { try { win?.setTitleBarOverlay(overlay()); } catch { /* not supported */ } });
  win.webContents.on('did-finish-load', async () => {
    const z = Number((await readPrefs()).uiZoom);
    if (z >= 0.9 && z <= 2) win?.webContents.setZoomFactor(z);
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://lutefisk/index.html');
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('menu', 'flush-and-close');
    // If the window doesn't answer (it's busy or broken), close anyway — unless it
    // asked for more time to let you choose whether to save.
    closeTimer = setTimeout(() => { allowClose = true; win?.close(); }, 4000);
  });
  win.on('closed', () => { win = null; });
}

/* Interface size (whole window), remembered between launches. */
const UI_STEPS = [0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');
async function readPrefs() { try { return JSON.parse(await fs.readFile(prefsFile(), 'utf8')); } catch { return {}; } }
async function writePrefs(p) { await fs.writeFile(prefsFile(), JSON.stringify(p, null, 2), { mode: 0o600 }).catch(() => {}); }
let closeTimer = null;

/* App settings the user controls. Paths are only ever set through a folder chooser. */
const SETTINGS_DEFAULTS = { autosave: true, autosaveSeconds: 5, rememberLastDir: true, theme: 'system', skin: 'classic' };
const SKINS = ['classic', 'paper', 'typewriter', 'linen', 'leather', 'study', 'blueprint', 'midnight', 'fjord', 'forest', 'rose', 'lavender', 'graphite', 'contrast'];
function cleanSettings(p) {
  const secs = Number(p.autosaveSeconds);
  return {
    libraryDir: typeof p.libraryDir === 'string' && path.isAbsolute(p.libraryDir) ? p.libraryDir : '',
    backupDir: typeof p.backupDir === 'string' && path.isAbsolute(p.backupDir) ? p.backupDir : '',
    autosave: p.autosave !== false,
    autosaveSeconds: Number.isFinite(secs) ? Math.max(1, Math.min(600, Math.round(secs))) : SETTINGS_DEFAULTS.autosaveSeconds,
    rememberLastDir: p.rememberLastDir !== false,
    lastDir: typeof p.lastDir === 'string' && path.isAbsolute(p.lastDir) ? p.lastDir : '',
    theme: ['system', 'light', 'dark'].includes(p.theme) ? p.theme : 'system',
    skin: SKINS.includes(p.skin) ? p.skin : 'classic',
  };
}
async function uiZoom(dir) {
  if (!win) return;
  const cur = win.webContents.getZoomFactor();
  let i = UI_STEPS.findIndex((x) => x >= cur - 0.001);
  if (i < 0) i = 1;
  const next = dir === 0 ? 1 : UI_STEPS[Math.max(0, Math.min(UI_STEPS.length - 1, i + dir))];
  win.webContents.setZoomFactor(next);
  const prefs = await readPrefs();
  prefs.uiZoom = next;
  await fs.writeFile(prefsFile(), JSON.stringify(prefs), { mode: 0o600 }).catch(() => {});
}

function send(cmd) { return () => win?.webContents.send('menu', cmd); }

function buildMenu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Settings…', accelerator: 'Cmd+,', click: send('open-settings') }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Book…', accelerator: 'CmdOrCtrl+N', click: send('new-book') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open-book') },
        { label: 'Library', accelerator: 'CmdOrCtrl+Shift+L', click: send('library') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Back Up Book…', accelerator: 'CmdOrCtrl+Shift+S', click: send('backup-book') },
        ...(mac ? [] : [{ type: 'separator' }, { label: 'Settings…', accelerator: 'Ctrl+,', click: send('open-settings') }]),
        { type: 'separator' },
        { label: 'New Chapter', accelerator: 'CmdOrCtrl+Shift+N', click: send('new-chapter') },
        { label: 'New Scene', accelerator: 'CmdOrCtrl+Alt+N', click: send('new-scene') },
        { label: 'Split Scene at Cursor', accelerator: 'CmdOrCtrl+Alt+K', click: send('split-scene') },
        { type: 'separator' },
        { label: 'Export EPUB…', click: send('export-epub') },
        { label: 'Export Markdown…', click: send('export-md') },
        { label: 'Export MOBI (older Kindles)…', click: send('export-mobi') },
        { label: 'Export PDF (Print)…', accelerator: 'CmdOrCtrl+P', click: send('export-pdf') },
        { label: 'Export RTF…', click: send('export-rtf') },
        { label: 'Export Plain Text…', click: send('export-txt') },
        { label: 'Export Word…', click: send('export-docx') },
        { type: 'separator' },
        { label: 'Show Book Folder', click: send('reveal') },
        ...(mac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Device Preview', accelerator: 'CmdOrCtrl+Alt+1', click: send('view-device') },
        { label: 'Print Preview', accelerator: 'CmdOrCtrl+Alt+2', click: send('view-print') },
        { label: 'Insights', accelerator: 'CmdOrCtrl+Alt+3', click: send('view-stats') },
        { type: 'separator' },
        { label: 'Zoom In Text', accelerator: 'CmdOrCtrl+=', click: send('zoom-in') },
        { label: 'Zoom In Text ', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: send('zoom-in') },
        { label: 'Zoom Out Text', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
        { label: 'Actual Text Size', accelerator: 'CmdOrCtrl+0', click: send('zoom-reset') },
        { type: 'separator' },
        { label: 'Larger Interface', accelerator: 'CmdOrCtrl+Shift+=', click: () => uiZoom(1) },
        { label: 'Smaller Interface', accelerator: 'CmdOrCtrl+Shift+-', click: () => uiZoom(-1) },
        { label: 'Default Interface Size', accelerator: 'CmdOrCtrl+Shift+0', click: () => uiZoom(0) },
        { type: 'separator' },
        { label: 'Focus on Writing', accelerator: 'CmdOrCtrl+Shift+F', click: send('focus-mode') },
        { label: 'Focus on Preview', accelerator: 'CmdOrCtrl+Alt+P', click: send('toggle-preview') },
        { label: 'Characters', click: send('open-characters') },
        { label: 'Plot Board', accelerator: 'CmdOrCtrl+Alt+L', click: send('open-plot') },
        { label: 'Writing History', click: send('open-history') },
        { type: 'separator' },
        { label: 'Search Book', accelerator: 'CmdOrCtrl+F', click: send('content-search') },
        { label: 'Find and Replace', accelerator: 'CmdOrCtrl+Shift+H', click: send('find-replace') },
        { label: 'Show / Hide Comments', accelerator: 'CmdOrCtrl+Alt+C', click: send('toggle-comments') },
        { label: 'Toggle Sidebar', accelerator: MAC ? 'Cmd+Ctrl+S' : 'Ctrl+Shift+B', click: send('toggle-sidebar') },
        { type: 'separator' }, { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Lutefisk Help', accelerator: 'F1', click: send('help') }, { label: 'Guided Tour', click: send('tour') }, ...(mac ? [] : [{ type: 'separator' }, { role: 'about', label: 'About Lutefisk' }])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------------------------------------------------------------- IPC */

function registerIpc() {
  handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, electron: process.versions.electron }));
  handle('app:close-ready', () => { allowClose = true; setImmediate(() => win?.close()); });
  handle('app:close-hold', () => { clearTimeout(closeTimer); return true; });

  /* ---- settings */
  handle('settings:get', async () => ({ ...cleanSettings({ ...SETTINGS_DEFAULTS, ...(await readPrefs()) }), defaultLibraryDir: defaultLibraryDir() }));
  handle('settings:set', async (patch = {}) => {
    const prefs = await readPrefs();
    // Paths can't be set from the window, only through the choosers below.
    for (const k of ['autosave', 'autosaveSeconds', 'rememberLastDir', 'theme', 'skin']) if (k in patch) prefs[k] = patch[k];
    if (patch.resetLibraryDir) { delete prefs.libraryDir; customLibrary = ''; }
    if (patch.rememberLastDir === false) delete prefs.lastDir;
    Object.assign(prefs, cleanSettings({ ...SETTINGS_DEFAULTS, ...prefs }));
    await writePrefs(prefs);
    const clean = cleanSettings(prefs);
    if ('theme' in patch) applyTheme(clean.theme);
    return clean;
  });
  handle('settings:chooseDir', async (which) => {
    if (!['libraryDir', 'backupDir'].includes(which)) throw new Error('Unknown setting');
    const prefs = await readPrefs();
    const res = await dialog.showOpenDialog(win, { title: { libraryDir: 'Choose the Folder for Your Books', backupDir: 'Choose a Folder for Backups' }[which], buttonLabel: 'Choose', defaultPath: prefs[which] || libraryDir(), properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    prefs[which] = res.filePaths[0];
    await writePrefs(prefs);
    if (which === 'libraryDir') { allowedParents.add(res.filePaths[0]); customLibrary = res.filePaths[0]; }
    return res.filePaths[0];
  });
  handle('settings:reveal', async (which) => {
    const p = cleanSettings(await readPrefs());
    const dir = which === 'backupDir' ? p.backupDir : (p.libraryDir || libraryDir());
    if (dir) { await fs.mkdir(dir, { recursive: true }).catch(() => {}); shell.openPath(dir); }
  });
  /** Where file choosers start: the last folder used, if you want that remembered. */
  async function startDir() {
    const p = cleanSettings({ ...SETTINGS_DEFAULTS, ...(await readPrefs()) });
    if (p.rememberLastDir && p.lastDir) { try { await fs.access(p.lastDir); return p.lastDir; } catch { /* moved */ } }
    return p.libraryDir || libraryDir();
  }
  /** Where picture and research pickers start: the folder you last picked from, else the working folder. */
  async function pickStartDir() {
    const prefs = await readPrefs();
    if (prefs.rememberLastDir !== false && typeof prefs.lastPickDir === 'string') { try { await fs.access(prefs.lastPickDir); return prefs.lastPickDir; } catch { /* moved */ } }
    return cwdLibrary ? path.dirname(path.dirname(cwdLibrary)) : app.getPath('pictures');
  }
  async function rememberPickDir(file) {
    const prefs = await readPrefs();
    if (prefs.rememberLastDir === false) return;
    prefs.lastPickDir = path.dirname(file);
    await writePrefs(prefs);
  }
  async function rememberDir(dir) {
    const prefs = await readPrefs();
    if (prefs.rememberLastDir === false) return;
    prefs.lastDir = dir;
    await writePrefs(prefs);
  }

  handle('book:recent', () => getRecent());

  // Books live in ./local/books (or ~/Documents/Lutefisk) by default; other parents must be
  // picked by the user through the native folder chooser first.
  const allowedParents = new Set();
  let customLibrary = '';
  readPrefs().then((p) => {
    const c = cleanSettings(p);
    customLibrary = c.libraryDir;
    if (customLibrary) allowedParents.add(customLibrary);
    if (c.rememberLastDir && c.lastDir) allowedParents.add(c.lastDir); // a folder you chose before
    applyTheme(c.theme);
  });
  // New books go in local/books under the folder Lutefisk was started from (ignored by git),
  // unless that folder isn't usable — the root of the disk, or the app's own install folder.
  const documentsLibraryDir = () => path.join(app.getPath('documents'), 'Lutefisk');
  const cwdLibrary = (() => {
    try {
      const cwd = fsSync.realpathSync(process.cwd());
      const exeDir = path.dirname(app.getPath('exe'));
      if (cwd === path.parse(cwd).root || cwd === app.getPath('home') || cwd.startsWith(exeDir) || (process.resourcesPath && cwd.startsWith(path.dirname(process.resourcesPath)))) return '';
      fsSync.accessSync(cwd, fsSync.constants.W_OK);
      return path.join(cwd, 'local', 'books');
    } catch { return ''; }
  })();
  const defaultLibraryDir = () => cwdLibrary || documentsLibraryDir();
  const libraryDir = () => customLibrary || defaultLibraryDir();
  const legacyLibraryDir = () => path.join(app.getPath('documents'), 'Chedditor');

  handle('library:list', async () => {
    const seen = new Map();
    const add = async (dir, opened) => {
      if (seen.has(dir) || !(await isBookDir(dir))) return;
      const sum = await readSummary(dir).catch(() => null);
      if (!sum) return;
      let cover = '';
      if (sum.coverPath) {
        try {
          const img = nativeImage.createFromPath(sum.coverPath);
          if (!img.isEmpty()) cover = img.resize({ width: 360, quality: 'good' }).toDataURL();
        } catch { /* unreadable cover */ }
      }
      if (sum.kind !== 'book') return; // screenplays, notebooks and papers from older versions aren't shown
      seen.set(dir, { files: sum.files || 0, dir, title: sum.title, subtitle: sum.subtitle, author: sum.author, words: sum.words, modified: sum.modified, opened: opened || '', cover, template: sum.template, kind: sum.kind, format: sum.format });
    };
    for (const r of await getRecent()) await add(r.dir, r.opened);
    customLibrary = cleanSettings(await readPrefs()).libraryDir;
    for (const lib of [...new Set([libraryDir(), defaultLibraryDir(), documentsLibraryDir(), legacyLibraryDir()])]) {
      try {
        for (const e of await fs.readdir(lib, { withFileTypes: true })) if (e.isDirectory()) await add(path.join(lib, e.name));
      } catch { /* library folder not created yet */ }
    }
    // New books start where you last saved one, if you want that remembered.
    const p = cleanSettings({ ...SETTINGS_DEFAULTS, ...(await readPrefs()) });
    let newBookDir = libraryDir();
    if (p.rememberLastDir && p.lastDir) { try { await fs.access(p.lastDir); newBookDir = p.lastDir; allowedParents.add(p.lastDir); } catch { /* moved */ } }
    return { books: [...seen.values()].sort((a, b) => (b.opened || b.modified).localeCompare(a.opened || a.modified)), libraryDir: libraryDir(), newBookDir, home: app.getPath('home') };
  });

  handle('library:chooseLocation', async () => {
    const res = await dialog.showOpenDialog(win, { title: 'Choose Where to Save', buttonLabel: 'Choose', defaultPath: await startDir(), properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    allowedParents.add(res.filePaths[0]);
    await rememberDir(res.filePaths[0]);
    return res.filePaths[0];
  });

  handle('library:forget', async (dir) => {
    const list = (await getRecent()).filter((r) => r.dir !== dir);
    await fs.writeFile(recentFile(), JSON.stringify(list, null, 2), { mode: 0o600 });
  });

  /** A project folder the app already knows: a recent one, or one inside a library folder. */
  async function knownProject(dir) {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) return false;
    const known = (await getRecent()).some((r) => r.dir === dir) || [libraryDir(), defaultLibraryDir(), documentsLibraryDir(), legacyLibraryDir()].includes(path.dirname(dir));
    return known && (await isBookDir(dir));
  }
  handle('library:reveal', async (dir) => {
    if (await knownProject(dir)) shell.showItemInFolder(path.join(dir, 'book.yaml'));
  });

  /** The text of every project the Library knows, for Insights across all books. Read-only. */
  handle('library:texts', async () => {
    const dirs = new Set((await getRecent()).map((r) => r.dir));
    for (const lib of [libraryDir(), defaultLibraryDir(), documentsLibraryDir()]) {
      try { for (const e of await fs.readdir(lib, { withFileTypes: true })) if (e.isDirectory()) dirs.add(path.join(lib, e.name)); } catch { /* none */ }
    }
    const out = [];
    let total = 0;
    for (const dir of dirs) {
      if (!(await isBookDir(dir))) continue;
      try {
        const { book, contents } = await loadBook(dir);
        let text = '';
        if (book.kind && book.kind !== 'book') continue;
        for (const sec of book.sections || []) if (sec && sec.enabled !== false && !sec.exclude && contents[sec.id] && !['title-page', 'copyright', 'toc', 'index', 'bibliography', 'endnotes'].includes(sec.type)) text += `${contents[sec.id]}\n\n`;
        total += text.length;
        if (total > 40 * 1024 * 1024) break;
        out.push({ title: book.title || path.basename(dir), kind: book.kind || 'book', text });
      } catch { /* unreadable project */ }
    }
    return out;
  });

  /** Delete the open book (from Book settings): move its folder to the Trash and close it. */
  handle('book:delete-open', async () => {
    const dir = requireBook();
    bookDir = null;
    await shell.trashItem(dir);
    const list = (await getRecent()).filter((r) => r.dir !== dir);
    await fs.writeFile(recentFile(), JSON.stringify(list, null, 2), { mode: 0o600 });
    return true;
  });

  /** Move a project folder to the Trash (recoverable), never a permanent delete. */
  handle('library:delete', async (dir) => {
    if (!(await knownProject(dir))) throw new Error('That project couldn’t be found.');
    if (bookDir === dir) throw new Error('Close the project before deleting it.');
    await shell.trashItem(dir);
    const list = (await getRecent()).filter((r) => r.dir !== dir);
    await fs.writeFile(recentFile(), JSON.stringify(list, null, 2), { mode: 0o600 });
    return true;
  });

  /** Zip a whole project folder into a backup file in a folder you choose. */
  async function zipFolder(dir) {
    const files = {};
    let total = 0;
    const walk = async (rel) => {
      for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
        if (e.name === '.DS_Store' || e.isSymbolicLink()) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else if (e.isFile()) {
          const buf = await fs.readFile(path.join(dir, r));
          total += buf.length;
          if (total > 2 * 1024 * 1024 * 1024) throw new Error('This project is too large to back up as one file.');
          files[`${path.basename(dir)}/${r}`] = [new Uint8Array(buf), { level: /\.(png|jpe?g|gif|webp|zip|epub|mobi|pdf|docx)$/i.test(e.name) ? 0 : 6, mtime: new Date() }];
        }
      }
    };
    await walk('');
    return new Promise((res, rej) => zipAsync(files, (err, data) => (err ? rej(err) : res(data))));
  }
  /**
   * Back up a book: a .zip (default) or a full folder copy, saved beside the book
   * (where: 'beside'), in the backup folder, or in a folder you choose.
   */
  handle('library:backup', async ({ dir, choose: chooseIn, where, asFolder = false } = {}) => {
    let choose = chooseIn;
    const target = dir || bookDir;
    if (!target || (target !== bookDir && !(await knownProject(target)))) throw new Error('That project couldn’t be found.');
    const prefs = await readPrefs();
    let out = where === 'beside' ? path.dirname(target) : cleanSettings(prefs).backupDir;
    const testOut = !app.isPackaged && process.env.LUTEFISK_TEST_OUT;
    if (testOut) { out = testOut; choose = false; }
    if (where !== 'beside' && (choose || !out)) {
      const res = await dialog.showOpenDialog(win, { title: 'Choose a Folder for the Backup', buttonLabel: 'Back Up Here', defaultPath: out || path.dirname(target), properties: ['openDirectory', 'createDirectory'] });
      if (res.canceled || !res.filePaths[0]) return null;
      out = res.filePaths[0];
      prefs.backupDir = out;
      await writePrefs(prefs);
    }
    const sum = await readSummary(target).catch(() => ({ title: path.basename(target) }));
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
    const base = `${String(sum.title || path.basename(target)).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().slice(0, 80) || 'Project'} — backup ${stamp}`;
    if (asFolder) {
      let copy = path.join(out, base);
      for (let i = 2; await fs.access(copy).then(() => true, () => false); i++) copy = path.join(out, `${base} (${i})`);
      if (path.resolve(copy).startsWith(path.resolve(target) + path.sep)) throw new Error('Choose a folder outside the book itself.');
      await fs.cp(target, copy, { recursive: true, errorOnExist: true, force: false, filter: (src) => !/[\\/]\.trash([\\/]|$)/.test(src.slice(target.length)) });
      let bytes = 0;
      const walk = async (d) => { for (const e of await fs.readdir(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) await walk(f); else bytes += (await fs.stat(f)).size; } };
      await walk(copy);
      return { file: copy, dir: out, bytes, folder: true };
    }
    const data = await zipFolder(target);
    const file = path.join(out, `${base}.zip`);
    await fs.writeFile(file, data, { mode: 0o600 });
    return { file, dir: out, bytes: data.length };
  });
  handle('library:revealFile', async (file) => {
    const prefs = cleanSettings(await readPrefs());
    if (typeof file !== 'string') return;
    const okDir = (prefs.backupDir && path.dirname(file) === prefs.backupDir) || (bookDir && path.dirname(file) === path.dirname(bookDir));
    if (okDir) shell.showItemInFolder(file);
  });

  handle('book:new', async ({ book, contents, parent }) => {
    const base = parent || libraryDir();
    if (base !== libraryDir() && !allowedParents.has(base)) throw new Error('Choose a location first.');
    await fs.mkdir(base, { recursive: true });
    const name = String(book?.title || 'Untitled Book').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().slice(0, 80) || 'Untitled Book';
    let dir = path.join(base, name);
    for (let i = 2; ; i++) {
      try { await fs.access(dir); dir = path.join(base, `${name} ${i}`); } catch { break; }
    }
    await createBook(dir, book, contents);
    await rememberDir(base);
    return openBookAt(dir);
  });

  handle('book:openPath', async (dir) => {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('Invalid folder');
    if (!(await isBookDir(dir))) {
      // A dropped book.yaml file is fine too.
      if (path.basename(dir) === 'book.yaml' && (await isBookDir(path.dirname(dir)))) return openBookAt(path.dirname(dir));
      throw new Error('That folder isn’t a Lutefisk book (no book.yaml inside).');
    }
    return openBookAt(dir);
  });

  /** Open a book: its folder or its book.yaml. */
  handle('book:open', async () => {
    const mac = process.platform === 'darwin';
    const testIn = !app.isPackaged && process.env.LUTEFISK_TEST_IN;
    const res = testIn ? { canceled: false, filePaths: [testIn] } : await dialog.showOpenDialog(win, {
      title: 'Open', buttonLabel: 'Open', defaultPath: await startDir(),
      message: 'Choose a book folder or its book.yaml.',
      properties: mac ? ['openFile', 'openDirectory'] : ['openDirectory'],
      filters: [{ name: 'Lutefisk books', extensions: ['yaml'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const pick = res.filePaths[0];
    let dir = pick;
    const st = await fs.stat(pick);
    if (st.isFile()) {
      dir = path.dirname(pick);
    }
    if (!(await isBookDir(dir))) throw new Error('That isn’t a Lutefisk book (there’s no book.yaml in the folder).');
    await rememberDir(path.dirname(dir));
    return openBookAt(dir);
  });

  handle('book:openRecent', async (dir) => {
    // Recent projects, and any project inside a Library folder.
    if (!(await knownProject(dir))) throw new Error('That project couldn’t be found.');
    if (!(await isBookDir(dir))) throw new Error('This book folder was moved or deleted.');
    return openBookAt(dir);
  });

  handle('book:save', async ({ book, files, removed, notes, removedNotes }) => {
    const dir = requireBook();
    await saveBook(dir, book, files || {}, Array.isArray(removed) ? removed : [], notes || {}, Array.isArray(removedNotes) ? removedNotes : []);
    win?.setTitle(`${book.title || 'Untitled'} — Lutefisk`);
    return { ok: true, savedAt: Date.now() };
  });



  handle('book:reveal', () => { if (bookDir) shell.showItemInFolder(path.join(bookDir, 'book.yaml')); });

  handle('asset:import', async () => {
    const dir = requireBook();
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose Image', properties: ['openFile'], defaultPath: await pickStartDir(),
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    await rememberPickDir(res.filePaths[0]);
    return importAsset(dir, res.filePaths[0]);
  });

  handle('asset:write', async ({ name, data }) => {
    const dir = requireBook();
    if (!(data instanceof Uint8Array)) throw new Error('Invalid image');
    return writeAssetData(dir, name, data);
  });

  handle('drawing:write', async ({ rel, json, png, pngRel }) => {
    const dir = requireBook();
    const jsonRel = await writeDrawing(dir, rel, json);
    // The PNG sits beside the JSON with the same base name, overwritten on each edit.
    const base = jsonRel.replace(/^assets\//, '').replace(/\.json$/, '');
    if (!(png instanceof Uint8Array) || png[0] !== 0x89) throw new Error('Invalid drawing image');
    const out = pngRel && /^assets\/[A-Za-z0-9._-]+\.png$/.test(pngRel) ? pngRel : `assets/${base}.png`;
    await fs.writeFile(within(dir, out), Buffer.from(png));
    return { json: jsonRel, png: out };
  });
  handle('edit:paste', async () => { win?.webContents.paste(); return true; });
  handle('drawing:read', async ({ rel }) => readDrawing(requireBook(), rel));

  handle('research:import', async () => {
    const dir = requireBook();
    const res = await dialog.showOpenDialog(win, {
      title: 'Add to Research', buttonLabel: 'Add', properties: ['openFile', 'multiSelections'], defaultPath: await pickStartDir(),
      filters: [
        { name: 'Research files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'txt', 'md', 'markdown', 'docx', 'doc', 'rtf', 'odt', 'epub', 'csv', 'xlsx', 'pptx', 'mp3', 'm4a', 'mp4', 'mov'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (res.canceled) return [];
    if (res.filePaths[0]) await rememberPickDir(res.filePaths[0]);
    const out = [];
    for (const f of res.filePaths.slice(0, 50)) {
      const ext = path.extname(f).toLowerCase();
      if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
        const st = await fs.stat(f);
        if (st.size <= 5 * 1024 * 1024) { out.push({ kind: 'note', title: path.basename(f, ext), text: await fs.readFile(f, 'utf8') }); continue; }
      }
      const r = await importResearchFile(dir, f);
      const kind = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(r.ext) ? 'image' : r.ext === '.pdf' ? 'pdf' : 'file';
      out.push({ kind, title: r.name, file: r.rel, size: r.size });
    }
    return out;
  });

  handle('research:openFile', async (rel) => {
    const dir = requireBook();
    if (!isAssetPath(rel) || !rel.startsWith('research/')) throw new Error('Invalid file');
    const err = await shell.openPath(within(dir, rel));
    if (err) throw new Error(err);
  });

  // ---- Writing history (local only): per book in <book>/stats/history.jsonl,
  // across all books in the app's user-data folder.
  const globalHistory = () => path.join(app.getPath('userData'), 'history.jsonl');
  const bookHistory = (dir) => path.join(dir, 'stats', 'history.jsonl');
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  async function readJsonl(file, sinceMs) {
    try {
      const out = [];
      for (const line of (await fs.readFile(file, 'utf8')).split('\n')) {
        if (!line) continue;
        try { const e = JSON.parse(line); if (Date.parse(e.t) >= sinceMs) out.push(e); } catch { /* skip bad line */ }
      }
      return out;
    } catch { return []; }
  }

  handle('history:log', async ({ bookId, title, events }) => {
    const dir = requireBook();
    if (!Array.isArray(events) || !events.length) return;
    const rows = events.slice(0, 500).map((e) => ({
      t: new Date(Date.parse(e.t) || Date.now()).toISOString(),
      d: clampInt(e.d, -1e6, 1e6), w: clampInt(e.w, 0, 1e8), s: clampInt(e.s, 0, 86400), sw: clampInt(e.sw, 0, 86400),
    }));
    await fs.mkdir(path.dirname(bookHistory(dir)), { recursive: true });
    await fs.appendFile(bookHistory(dir), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
    const id = String(bookId || '').slice(0, 64);
    const name = String(title || '').slice(0, 200);
    await fs.mkdir(path.dirname(globalHistory()), { recursive: true });
    await fs.appendFile(globalHistory(), rows.map((r) => JSON.stringify({ ...r, b: id, n: name })).join('\n') + '\n', { mode: 0o600 });
  });

  // Reset Insights: forget the writing history of the open book, or of every book.
  handle('history:reset', async ({ scope, bookId } = {}) => {
    const rm = (f) => fs.rm(f, { force: true }).catch(() => {});
    if (scope === 'all') {
      const dirs = new Set((await getRecent()).map((r) => r.dir));
      for (const lib of [libraryDir(), defaultLibraryDir(), documentsLibraryDir(), legacyLibraryDir()]) {
        try { for (const e of await fs.readdir(lib, { withFileTypes: true })) if (e.isDirectory()) dirs.add(path.join(lib, e.name)); } catch { /* none */ }
      }
      if (bookDir) dirs.add(bookDir);
      for (const dir of dirs) if (await isBookDir(dir)) await rm(bookHistory(dir));
      await rm(globalHistory());
      return true;
    }
    const dir = requireBook();
    await rm(bookHistory(dir));
    // Drop this book's lines from the all-books history too.
    const id = String(bookId || '').slice(0, 64);
    try {
      const keep = (await fs.readFile(globalHistory(), 'utf8')).split('\n').filter((line) => {
        if (!line) return false;
        try { return JSON.parse(line).b !== id; } catch { return false; }
      });
      await fs.writeFile(globalHistory(), keep.length ? `${keep.join('\n')}\n` : '', { mode: 0o600 });
    } catch { /* no history yet */ }
    return true;
  });

  handle('history:get', async ({ days = 400 } = {}) => {
    const since = Date.now() - Math.min(3650, Math.max(1, Number(days) || 400)) * 86400000;
    return { book: bookDir ? await readJsonl(bookHistory(bookDir), since) : [], all: await readJsonl(globalHistory(), since) };
  });

  handle('cite:fetch', (url) => fetchCitation(url));

  handle('shell:open', (url) => {
    const u = new URL(String(url));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web links can be opened');
    return shell.openExternal(u.toString());
  });

  handle('export:epub', async ({ book, contents }) => {
    const dir = requireBook();
    const out = await saveTarget(book, 'epub', 'EPUB e-book');
    if (!out) return null;
    const data = await buildEpub({ dir, book, contents, rasterize: rasterizeMath });
    await fs.writeFile(out, data);
    reveal(out);
    return out;
  });

  handle('export:docx', async ({ book, contents }) => {
    const dir = requireBook();
    const out = await saveTarget(book, 'docx', 'Word document');
    if (!out) return null;
    const data = await buildDocx({ dir, book, contents, rasterize: rasterizeMath });
    await fs.writeFile(out, data);
    reveal(out);
    return out;
  });

  handle('export:rtf', async ({ book, contents }) => {
    const dir = requireBook();
    const out = await saveTarget(book, 'rtf', 'Rich Text Format');
    if (!out) return null;
    await fs.writeFile(out, await buildRtf({ dir, book, contents, rasterize: rasterizeMath, toPng: (buf) => flattenImage(buf, 'png') }));
    reveal(out);
    return out;
  });

  handle('export:txt', async ({ book, contents }) => {
    requireBook();
    const out = await saveTarget(book, 'txt', 'Plain Text');
    if (!out) return null;
    await fs.writeFile(out, buildText({ book, contents }), 'utf8');
    reveal(out);
    return out;
  });

  handle('export:mobi', async ({ book, contents }) => {
    const dir = requireBook();
    const out = await saveTarget(book, 'mobi', 'Kindle MOBI');
    if (!out) return null;
    await fs.writeFile(out, await buildMobi({ dir, book, contents, rasterize: rasterizeMath, toJpeg: (buf) => flattenImage(buf, 'jpg') }));
    reveal(out);
    return out;
  });

  handle('export:md', async ({ book, contents }) => {
    const dir = requireBook();
    const out = await saveTarget(book, 'md', 'Markdown');
    if (!out) return null;
    const { markdown, images } = await buildMarkdown({ dir, book, contents, assetsFolder: `${path.basename(out, '.md')} assets` });
    await fs.writeFile(out, markdown, 'utf8');
    if (images.length) {
      const target = path.join(path.dirname(out), `${path.basename(out, '.md')} assets`);
      await fs.mkdir(target, { recursive: true });
      for (const img of images) await fs.copyFile(within(dir, img.rel), path.join(target, img.name));
    }
    reveal(out);
    return out;
  });

  handle('export:pdf', async ({ html, widthIn, heightIn, title }) => {
    requireBook();
    const out = await saveTarget({ title }, 'pdf', 'PDF document');
    if (!out) return null;
    const pdf = await renderPdf(String(html), Number(widthIn), Number(heightIn));
    await fs.writeFile(out, pdf);
    reveal(out);
    return out;
  });
}

function reveal(file) {
  if (!process.env.LUTEFISK_TEST_OUT) shell.showItemInFolder(file);
}

async function saveTarget(book, ext, label) {
  const name = String(book?.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'book';
  // Automated tests only (never honored in packaged builds).
  if (!app.isPackaged && process.env.LUTEFISK_TEST_OUT) return path.join(process.env.LUTEFISK_TEST_OUT, `${name}.${ext}`);
  const res = await dialog.showSaveDialog(win, {
    title: `Export ${label}`,
    defaultPath: path.join(bookDir || app.getPath('documents'), `${name}.${ext}`),
    filters: [{ name: label, extensions: [ext] }],
  });
  return res.canceled ? null : res.filePath;
}

/** Render paginated HTML (already laid out page-by-page) into a PDF. */
/**
 * Rasterise equations to PNG for readers without MathML and for Word.
 * equations: Map(key → { tex, display }) → Map(key → { png, w, h, depth, scale }).
 * Rendered offscreen at 54 px per em; sizes are scaled back to em by the exporters.
 */
const MATH_PX = 54;
async function rasterizeMath(equations) {
  const out = new Map();
  if (!equations || !equations.size) return out;
  const token = crypto.randomUUID();
  exportPages.set(token, `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app://lutefisk/styles/fonts.css"><style>
html,body{margin:0;background:#fff;color:#000}
#wrap{position:absolute;left:0;top:0;white-space:nowrap;font-size:${MATH_PX}px;line-height:normal}
#m{display:inline-block;padding:4px 3px}
math{font-family:'STIX Two Math',math;display:inline math !important}
.bk-math-err{font-family:monospace;color:#b3261e}
#b{display:inline-block;width:0;height:0;vertical-align:baseline}
</style></head><body><div id="wrap"><span id="m"></span><span id="b"></span></div></body></html>`);
  const win = new BrowserWindow({
    show: false, width: 3200, height: 1400,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  try {
    await win.loadURL(`app://lutefisk/__export/${token}`);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => document.fonts.load("54px \'STIX Two Math\'")).then(() => true)');
    for (const [key, { tex, display }] of equations) {
      const { html } = texToMathml(tex, display);
      const box = await win.webContents.executeJavaScript(`(() => {
        document.getElementById('m').innerHTML = ${JSON.stringify(html)};
        return document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => {
          const m = document.getElementById('m').getBoundingClientRect();
          const b = document.getElementById('b').getBoundingClientRect();
          return { x: m.left, y: m.top, w: m.width, h: m.height, base: b.top };
        });
      })()`);
      const rect = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.min(3200, Math.ceil(box.w)), height: Math.min(1400, Math.ceil(box.h)) };
      if (rect.width < 2 || rect.height < 2) continue;
      const img = await win.webContents.capturePage(rect);
      const size = img.getSize();
      out.set(key, { png: img.toPNG(), w: size.width, h: size.height, depth: Math.max(0, rect.y + rect.height - box.base) * (size.height / rect.height), scale: MATH_PX * (size.height / rect.height) });
    }
  } finally {
    exportPages.delete(token);
    win.destroy();
  }
  return out;
}

/** Decode any supported image, flatten transparency onto white and re-encode (for MOBI/RTF). */
function flattenImage(buf, kind) {
  let img = nativeImage.createFromBuffer(Buffer.from(buf));
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  if (kind === 'jpg' && width > 1200) img = img.resize({ width: 1200, quality: 'best' });
  const sz = img.getSize();
  const bmp = Buffer.from(img.toBitmap());
  let alpha = false;
  for (let i = 3; i < bmp.length; i += 4) if (bmp[i] !== 255) { alpha = true; break; }
  if (alpha) {
    for (let i = 0; i < bmp.length; i += 4) {
      const a = bmp[i + 3] / 255;
      bmp[i] = Math.min(255, Math.round(bmp[i] + 255 * (1 - a))); // premultiplied BGRA
      bmp[i + 1] = Math.min(255, Math.round(bmp[i + 1] + 255 * (1 - a))); // premultiplied BGRA
      bmp[i + 2] = Math.min(255, Math.round(bmp[i + 2] + 255 * (1 - a))); // premultiplied BGRA
      bmp[i + 3] = 255;
    }
    img = nativeImage.createFromBitmap(bmp, { width: sz.width, height: sz.height });
  }
  void height;
  return kind === 'jpg' ? img.toJPEG(85) : img.toPNG();
}

async function renderPdf(html, widthIn, heightIn) {
  if (!(widthIn > 2 && widthIn < 20 && heightIn > 2 && heightIn < 20)) throw new Error('Bad page size');
  const token = crypto.randomUUID();
  exportPages.set(token, html);
  const pw = new BrowserWindow({
    show: false, width: 900, height: 1200,
    // Page scripts are blocked by CSP (script-src 'none'); main only uses
    // executeJavaScript to wait until fonts and images have loaded.
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  try {
    await pw.loadURL(`app://lutefisk/__export/${token}`);
    await pw.webContents.executeJavaScript(`Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))]).then(() => true)`);
    await new Promise((r) => setTimeout(r, 150));
    return await pw.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: { width: widthIn, height: heightIn },
      margins: { marginType: 'none' },
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });
  } finally {
    exportPages.delete(token);
    pw.destroy();
  }
}

/* -------------------------------------------------------- citation fetching */

let citeSession;
async function fetchCitation(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw new Error('That does not look like a web address.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) links can be analyzed.');
  if (url.username || url.password) throw new Error('Links with embedded credentials are not allowed.');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
    throw new Error('Local network addresses are not allowed.');
  }
  citeSession ||= session.fromPartition('lutefisk-cite', { cache: false });
  citeSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const doi = /(^|\.)doi\.org$/i.test(url.hostname) ? decodeURIComponent(url.pathname.slice(1)) : '';
    if (/^10\.\d{4,9}\//.test(doi)) {
      const r = await citeSession.fetch(`https://doi.org/${encodeURI(doi)}`, {
        headers: { accept: 'application/vnd.citationstyles.csl+json' }, signal: ctrl.signal, credentials: 'omit',
      });
      if (r.ok) return { kind: 'csl', url: url.toString(), csl: JSON.parse(await readLimited(r, 2_000_000)) };
    }
    const r = await citeSession.fetch(url.toString(), {
      headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' },
      signal: ctrl.signal, credentials: 'omit', redirect: 'follow',
    });
    if (!r.ok) throw new Error(`The site answered ${r.status} ${r.statusText}`.trim());
    const type = r.headers.get('content-type') || '';
    if (!/html|xml/.test(type)) return { kind: 'other', url: r.url || url.toString(), contentType: type };
    return { kind: 'html', url: r.url || url.toString(), html: await readLimited(r, 3_000_000) };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The site took too long to respond.');
    throw err;
  } finally { clearTimeout(timer); }
}

async function readLimited(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/* --------------------------------------------------------------- lifecycle */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    migrateFromChedditor();
    if (MAC && !app.isPackaged) { try { app.dock?.setIcon(APP_ICON); } catch { /* dev only */ } }
    lockDownSession();
    registerProtocols();
    registerIpc();
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) { allowClose = false; createWindow(); } });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); else allowClose = false; });
}
