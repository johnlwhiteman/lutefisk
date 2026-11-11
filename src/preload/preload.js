// The only bridge between the sandboxed UI and the operating system.
// Exposes a fixed set of narrowly-scoped functions; no generic IPC access.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const MENU_COMMANDS = new Set([
  'new-book', 'open-book', 'library', 'save', 'new-chapter', 'new-scene', 'split-scene', 'export-epub', 'export-pdf', 'export-docx', 'export-md', 'export-rtf', 'export-mobi', 'export-fdx', 'export-fadein', 'export-fountain', 'import-screenplay', 'reveal',
  'view-device', 'view-print', 'view-stats', 'flush-and-close', 'zoom-in', 'zoom-out', 'zoom-reset', 'toggle-sidebar', 'focus-mode', 'toggle-preview', 'help-screenplay',
]);

contextBridge.exposeInMainWorld('lutefisk', {
  platform: process.platform,
  info: call('app:info'),
  closeReady: call('app:close-ready'),
  library: call('library:list'),
  chooseLocation: call('library:chooseLocation'),
  forgetBook: call('library:forget'),
  revealPath: call('library:reveal'),
  newBook: call('book:new'),
  openBook: call('book:open'),
  openRecent: call('book:openRecent'),
  /** Open a folder dropped onto the window. */
  openDropped(file) {
    const p = webUtils.getPathForFile(file);
    return ipcRenderer.invoke('book:openPath', p);
  },
  saveBook: call('book:save'),
  revealBook: call('book:reveal'),
  importImage: call('asset:import'),
  writeImage: call('asset:write'),
  paste: call('edit:paste'),
  writeDrawing: call('drawing:write'),
  readDrawing: call('drawing:read'),
  importResearch: call('research:import'),
  openResearchFile: call('research:openFile'),
  fetchCitation: call('cite:fetch'),
  logHistory: call('history:log'),
  getHistory: call('history:get'),
  openExternal: call('shell:open'),
  exportEpub: call('export:epub'),
  exportDocx: call('export:docx'),
  exportPdf: call('export:pdf'),
  exportMarkdown: call('export:md'),
  exportRtf: call('export:rtf'),
  exportMobi: call('export:mobi'),
  exportFdx: call('export:fdx'),
  exportFadeIn: call('export:fadein'),
  exportFountain: call('export:fountain'),
  exportScriptText: call('export:sptxt'),
  exportScriptDocx: call('export:spdocx'),
  importScreenplay: call('screenplay:import'),
  onMenu(fn) {
    ipcRenderer.on('menu', (_e, cmd) => { if (MENU_COMMANDS.has(cmd)) fn(cmd); });
  },
});
