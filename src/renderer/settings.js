// App settings: where projects live, how saving works, and whether file choosers
// remember the last folder. Stored by the main process in the app's own data
// folder (never in a project or in the app's source).
import { h, icon, toast, segmented } from './ui.js';

const B = window.lutefisk;
export const settings = { autosave: true, autosaveSeconds: 5, rememberLastDir: true, libraryDir: '', backupDir: '', defaultLibraryDir: '', theme: 'system' };
const listeners = new Set();

export async function loadSettings() {
  try { Object.assign(settings, await B.getSettings()); } catch { /* defaults */ }
  for (const fn of listeners) fn(settings);
  return settings;
}
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
async function update(patch) {
  try { Object.assign(settings, await B.setSettings(patch)); } catch (err) { toast(String(err?.message || err), 'error'); }
  for (const fn of listeners) fn(settings);
}

/**
 * Autosave scheduler. Saves `seconds` after the last change; while you keep
 * typing it still saves at least every 30 seconds. In manual mode it does nothing.
 */
export function autosaver(fn) {
  let t = null;
  let first = 0;
  const run = () => { clearTimeout(t); t = null; first = 0; fn(); };
  const d = () => {
    if (!settings.autosave) return;
    const now = Date.now();
    if (!first) first = now;
    clearTimeout(t);
    const wait = Math.max(1, settings.autosaveSeconds || 5) * 1000;
    const maxWait = Math.max(30000, wait * 3);
    t = setTimeout(run, Math.max(0, Math.min(wait, first + maxWait - now)));
  };
  d.cancel = () => { clearTimeout(t); t = null; first = 0; };
  d.flush = () => { if (t) run(); };
  return d;
}

/** Day or night, chosen here or with the sun/moon button; “System” follows the computer. */
export const setTheme = (theme) => update({ theme });
const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
export function themeButton() {
  const b = h('button', { class: 'tb-icon tb-theme', 'aria-label': 'Day or night mode' });
  const draw = () => { b.replaceChildren(icon(isDark() ? 'moon' : 'sun', 18)); b.title = isDark() ? 'Night mode — click for day' : 'Day mode — click for night'; };
  b.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  draw();
  return b;
}

const pretty = (p, home) => (p ? (home && p.startsWith(home) ? `~${p.slice(home.length)}` : p) : '');

export function openSettings(sheet) {
  const body = h('div', { class: 'settings' });
  const draw = () => {
    const lib = settings.libraryDir || settings.defaultLibraryDir;
    const secs = h('input', { type: 'number', min: 1, max: 600, step: 1, value: String(settings.autosaveSeconds), class: 'st-secs', 'aria-label': 'Seconds after a change' });
    secs.addEventListener('change', () => update({ autosaveSeconds: Number(secs.value) || 5 }).then(draw));
    const remember = h('input', { type: 'checkbox', checked: settings.rememberLastDir });
    remember.addEventListener('change', () => update({ rememberLastDir: remember.checked }));
    body.replaceChildren(
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon(isDark() ? 'moon' : 'sun', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Appearance'),
          segmented([{ value: 'system', label: 'System' }, { value: 'light', label: 'Day', icon: 'sun' }, { value: 'dark', label: 'Night', icon: 'moon' }], settings.theme || 'system', (v) => setTheme(v).then(() => setTimeout(draw, 50)), { label: 'Appearance' }),
          h('p', { class: 'hint' }, 'System follows your computer’s light or dark setting. The sun/moon button in the title bar switches quickly. Book previews keep their own page colours.'))),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('folder', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Projects folder'),
          h('p', { class: 'hint' }, 'New books are created here, and the Library lists every book in it.'),
          h('div', { class: 'st-path' }, h('code', {}, lib || '—'),
            h('button', { class: 'btn small', onclick: async () => { const p = await B.chooseSettingsDir('libraryDir'); if (p) { settings.libraryDir = p; draw(); toast('New projects will be saved there', 'ok', 1600); } } }, 'Change…'),
            h('button', { class: 'btn small plain', onclick: () => B.revealSettingsDir('libraryDir') }, 'Show'),
            settings.libraryDir ? h('button', { class: 'btn small plain', onclick: () => update({ resetLibraryDir: true }).then(draw) }, 'Use Default') : null))),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('save', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Saving'),
          segmented([{ value: 'auto', label: 'Automatically' }, { value: 'manual', label: 'Manually' }], settings.autosave ? 'auto' : 'manual', (v) => update({ autosave: v === 'auto' }).then(draw), { label: 'Saving' }),
          settings.autosave
            ? h('label', { class: 'st-row' }, h('span', {}, 'Save'), secs, h('span', {}, `second${settings.autosaveSeconds === 1 ? '' : 's'} after a change`))
            : h('p', { class: 'hint' }, `Save with ${B.platform === 'darwin' ? '⌘S' : 'Ctrl+S'}. If you leave a project or quit with unsaved changes, Lutefisk asks first.`),
          settings.autosave ? h('p', { class: 'hint' }, 'While you keep typing, it still saves at least every 30 seconds.') : null)),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('history', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Folders'),
          h('label', { class: 'st-check' }, remember, h('span', {}, 'Open and save dialogs start in the last folder you used')))),
      h('section', { class: 'st-sec' },
        h('div', { class: 'st-ic' }, icon('download', 18)),
        h('div', { class: 'st-main' },
          h('h3', {}, 'Backups'),
          h('p', { class: 'hint' }, 'Back Up makes a .zip of a whole project. Use it from a project’s ⋯ menu in the Library, or File › Back Up This Project.'),
          h('div', { class: 'st-path' }, h('code', {}, settings.backupDir || 'Ask each time'),
            h('button', { class: 'btn small', onclick: async () => { const p = await B.chooseSettingsDir('backupDir'); if (p) { settings.backupDir = p; draw(); } } }, 'Change…'),
            settings.backupDir ? h('button', { class: 'btn small plain', onclick: () => B.revealSettingsDir('backupDir') }, 'Show') : null))),
      h('p', { class: 'hint st-foot' }, icon('eye', 13), 'Settings are stored only on this computer, in Lutefisk’s own data folder.'));
  };
  draw();
  sheet('Settings', body);
}

/** Back up a project (the open one when dir is omitted) and report where it went. */
export async function backupProject(dir, { choose = false } = {}) {
  try {
    const res = await B.backupProject({ dir, choose });
    if (!res) return null;
    const mb = res.bytes / (1024 * 1024);
    toast(`Backed up (${mb < 1 ? `${Math.max(1, Math.round(res.bytes / 1024))} KB` : `${mb.toFixed(1)} MB`}) to ${pretty(res.dir)}`, 'ok', 4000);
    return res;
  } catch (err) { toast(`Backup failed: ${String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error', 6000); return null; }
}
