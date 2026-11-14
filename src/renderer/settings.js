// App settings: where projects live, how saving works, and whether file choosers
// remember the last folder. Stored by the main process in the app's own data
// folder (never in a project or in the app's source).
import { applyLanguage } from './i18n-dom.js';
import { LANGUAGES } from '../shared/i18n.js';
import { h, icon, toast, segmented, dialog } from './ui.js';

const B = window.lutefisk;
export const settings = { autosave: true, autosaveSeconds: 5, rememberLastDir: true, libraryDir: '', backupDir: '', defaultLibraryDir: '', theme: 'system', skin: 'classic' };
const listeners = new Set();

/** Skins: the look of the app (never the book). Each has a day and a night version. */
export const SKINS = [
  { id: 'classic', name: 'Classic', about: 'Clean and simple', day: ['#f5f5f7', '#007aff'], night: ['#1c1c1e', '#0a84ff'] },
  { id: 'paper', name: 'Paper', about: 'Warm parchment with a paper grain', tex: 'grain', day: ['#f4eee2', '#a0522d'], night: ['#211c16', '#d4895a'] },
  { id: 'typewriter', name: 'Typewriter', about: 'Cream paper, ribbon red and typewriter type', tex: 'grain', day: ['#f3efe4', '#b3261e'], night: ['#1d1b18', '#ff6b5e'] },
  { id: 'linen', name: 'Linen', about: 'Woven fabric and blue-gray ink', tex: 'linen', day: ['#efede7', '#4a6a8a'], night: ['#1b1c1e', '#8fb3d6'] },
  { id: 'leather', name: 'Leather', about: 'A stitched leather binder with brass accents', tex: 'leather', day: ['#5a3a24', '#d9a35e'], night: ['#3a2618', '#d9a35e'] },
  { id: 'study', name: 'Study', about: 'Your book on a walnut desk', tex: 'wood', day: ['#6b4a33', '#f1ece4'], night: ['#2b1d13', '#c9935f'] },
  { id: 'blueprint', name: 'Blueprint', about: 'A drafting-table grid', tex: 'grid', day: ['#eef3fa', '#1f5fbf'], night: ['#0f2747', '#7cc4ff'] },
  { id: 'midnight', name: 'Midnight', about: 'Deep navy and a field of stars at night', tex: 'stars', day: ['#eef0f7', '#4b4fd1'], night: ['#0b0e1d', '#a8a5ff'] },
  { id: 'fjord', name: 'Fjord', about: 'Cool slate and sea blue', day: ['#eef2f5', '#0f7b8a'], night: ['#141c22', '#38b2c2'] },
  { id: 'forest', name: 'Forest', about: 'Sage and pine', day: ['#eff2ec', '#2f7d4f'], night: ['#151b16', '#5fbf84'] },
  { id: 'rose', name: 'Rose', about: 'Blush and berry', day: ['#f8f0f2', '#c2185b'], night: ['#1f1619', '#f06292'] },
  { id: 'lavender', name: 'Lavender', about: 'Soft violet', day: ['#f2f0f8', '#6b4fc4'], night: ['#18161f', '#9f87ff'] },
  { id: 'graphite', name: 'Graphite', about: 'Quiet monochrome', day: ['#f1f1f1', '#3d3d42'], night: ['#161616', '#d0d0d4'] },
  { id: 'contrast', name: 'High Contrast', about: 'Strong contrast for easier reading', day: ['#ffffff', '#0040c1'], night: ['#000000', '#6cb4ff'] },
];
export const applySkin = (id) => { document.documentElement.dataset.skin = SKINS.some((s) => s.id === id) ? id : 'classic'; };
export const setSkin = (skin) => { applySkin(skin); return update({ skin }); };

/** Vision and comfort settings, applied to the whole window. */
export function applyA11y(st = settings) {
  const d = document.documentElement.dataset;
  d.a11yFont = st.a11yFont ? 'on' : '';
  d.a11yContrast = st.a11yContrast ? 'on' : '';
  d.a11yMotion = st.a11yMotion ? 'reduce' : '';
  d.a11yFocus = st.a11yFocus ? 'on' : '';
  d.a11ySpacing = st.a11ySpacing && st.a11ySpacing !== 'normal' ? st.a11ySpacing : '';
}

export async function loadSettings() {
  try { Object.assign(settings, await B.getSettings()); } catch { /* defaults */ }
  applySkin(settings.skin);
  applyA11y();
  applyLanguage(settings.uiLanguage || 'en-US');
  for (const fn of listeners) fn(settings);
  return settings;
}
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
async function update(patch) {
  try { Object.assign(settings, await B.setSettings(patch)); } catch (err) { toast(String(err?.message || err), 'error'); }
  applyA11y();
  if ('uiLanguage' in patch) applyLanguage(settings.uiLanguage || 'en-US');
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

function skinPicker(redraw) {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return h('div', { class: 'skin-grid', role: 'radiogroup', 'aria-label': 'Skin' }, SKINS.map((s) => {
    const [bg, accent] = dark ? s.night : s.day;
    const on = (settings.skin || 'classic') === s.id;
    return h('button', { type: 'button', class: `skin-card${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), title: `${s.name} — ${s.about}`, onclick: () => setSkin(s.id).then(() => redraw?.()) },
      h('span', { class: `skin-sw${s.tex ? ` tex-${s.tex}` : ''}`, style: { backgroundColor: bg } }, h('i', { style: { background: accent } }), h('i', { style: { background: accent, opacity: '.35' } })),
      h('span', {}, s.name));
  }));
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

/** Add a word to your dictionary (from the editor's right-click menu). */
export const addDictionaryWord = (w) => update({ dictionary: [...(settings.dictionary || []), String(w).trim()] });

/** Settings › Spelling & Grammar: Harper, checked on this computer. */
function spellSection(draw) {
  const check = (key, label, hint) => {
    const box = h('input', { type: 'checkbox', checked: settings[key] !== false });
    box.addEventListener('change', () => update({ [key]: box.checked }).then(draw));
    return h('label', { class: 'st-check a11y-check' }, box, h('span', {}, h('b', {}, label), hint ? h('small', { class: 'hint' }, hint) : null));
  };
  const dialect = h('select', { 'aria-label': 'English dialect' }, [['american', 'American'], ['british', 'British'], ['canadian', 'Canadian'], ['australian', 'Australian'], ['indian', 'Indian']].map(([v, l]) => h('option', { value: v }, l)));
  dialect.value = settings.spellDialect || 'american';
  dialect.addEventListener('change', () => update({ spellDialect: dialect.value }).then(draw));
  const dict = settings.dictionary || [];
  const add = h('input', { type: 'text', placeholder: 'Add a word…', 'aria-label': 'Add a word to your dictionary', maxlength: 64, class: 'dict-add' });
  add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); update({ dictionary: [...dict, add.value.trim()] }).then(draw); } });
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('check', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Spelling & Grammar'),
      check('spellOn', 'Check spelling and grammar', 'Powered by Harper, which is built into Lutefisk and runs entirely on this computer — your text is never sent anywhere. Right-click an underlined word for suggestions.'),
      settings.spellOn !== false ? h('div', { class: 'st-sub-opts' },
        h('label', { class: 'st-row' }, h('span', {}, 'When'), (() => {
          const sel = h('select', { 'aria-label': 'When to check' }, h('option', { value: 'auto' }, 'Automatically, as I write'), h('option', { value: 'manual' }, 'Only when I ask (Check Now or F7)'));
          sel.value = settings.spellMode === 'manual' ? 'manual' : 'auto';
          sel.addEventListener('change', () => update({ spellMode: sel.value }).then(draw));
          return sel;
        })()),
        h('label', { class: 'st-row' }, h('span', {}, 'English'), dialect),
        check('spellGrammar', 'Grammar', 'Agreement, word choice, punctuation and more — underlined in blue.'),
        check('spellStyle', 'Style', 'Wordiness, repetition and readability — dotted in purple.'),
        h('div', { class: 'fld' }, h('span', {}, `Your dictionary${dict.length ? ` (${dict.length})` : ''}`), add,
          dict.length ? h('div', { class: 'dict-list' }, dict.map((w) => h('span', { class: 'dict-word' }, w, h('button', { type: 'button', 'aria-label': `Remove ${w}`, title: 'Remove', onclick: () => update({ dictionary: dict.filter((x) => x !== w) }).then(draw) }, icon('close', 10))))) : h('small', { class: 'hint' }, 'Names and invented words you add here aren’t marked as misspelled.'))) : null));
}

/** Settings › Language: the language of menus and buttons (never of your book). */
function languageSection(draw) {
  const sel = h('select', { class: 'no-i18n', 'aria-label': 'Interface language' },
    LANGUAGES.map(([code, name, en]) => h('option', { value: code }, name === en ? name : `${name} — ${en}`)));
  sel.value = settings.uiLanguage || 'en-US';
  sel.addEventListener('change', () => update({ uiLanguage: sel.value }).then(draw));
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('globe', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Language'),
      h('label', { class: 'st-row' }, h('span', {}, 'Interface language'), sel),
      h('p', { class: 'hint' }, 'Menus, buttons and labels. Your book’s own language is set in Book › General.'),
      sel.value === 'lkt' ? h('p', { class: 'hint' }, 'Lakȟótiyapi is just beginning: a few words are in place and the rest shows in English until fluent speakers contribute translations.') : null));
}

/** Settings › Vision & Comfort: larger interface, an easier-to-read font, stronger contrast, calmer motion. */
function a11ySection(draw) {
  const check = (key, label, hint) => {
    const box = h('input', { type: 'checkbox', checked: !!settings[key] });
    box.addEventListener('change', () => update({ [key]: box.checked }).then(draw));
    return h('label', { class: 'st-check a11y-check' }, box, h('span', {}, h('b', {}, label), h('small', { class: 'hint' }, hint)));
  };
  const sizes = [[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.4, '140%'], [1.6, '160%'], [1.8, '180%'], [2, '200%']];
  return h('section', { class: 'st-sec' },
    h('div', { class: 'st-ic' }, icon('eye', 18)),
    h('div', { class: 'st-main' },
      h('h3', {}, 'Vision & Comfort'),
      h('label', { class: 'st-row' }, h('span', {}, 'Interface size'),
        (() => {
          const sel = h('select', { 'aria-label': 'Interface size' }, sizes.map(([v, l]) => h('option', { value: String(v) }, l)));
          sel.value = String(settings.uiZoom || 1);
          sel.addEventListener('change', () => update({ uiZoom: Number(sel.value) }).then(draw));
          return sel;
        })(),
        h('small', { class: 'hint' }, '⇧⌘+ / ⇧⌘− also work. The editor and previews have their own text size.')),
      h('label', { class: 'st-row' }, h('span', {}, 'Editor line spacing'),
        segmented([{ value: 'normal', label: 'Normal' }, { value: 'relaxed', label: 'Relaxed' }, { value: 'loose', label: 'Loose' }], settings.a11ySpacing || 'normal', (v) => update({ a11ySpacing: v }).then(draw), { label: 'Editor line spacing' })),
      check('a11yFont', 'Easier-to-read font', 'Uses Atkinson Hyperlegible — designed for low vision — for menus, the binder and the editor. Your book keeps its own fonts.'),
      check('a11yContrast', 'Stronger contrast', 'Darker secondary text, clearer borders and underlined links. Pairs well with the High Contrast skin.'),
      check('a11yFocus', 'Always show a bold focus ring', 'A thick outline around whatever has keyboard focus, so you never lose your place.'),
      check('a11yMotion', 'Reduce motion', 'Turns off animations and sliding panels.'),
      h('p', { class: 'hint' }, 'Also: the editor text size goes from 25% to 300%; every control has a keyboard shortcut or tooltip; and screen readers can read equations from their LaTeX alt text.')));
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
          h('p', { class: 'hint' }, 'System follows your computer’s light or dark setting. The sun/moon button in the title bar switches quickly. Book previews keep their own page colors.'),
          h('h3', { class: 'st-sub' }, 'Skin'),
          skinPicker(draw),
          h('p', { class: 'hint' }, 'Colors and textures for Lutefisk itself, in day and night. Your book’s design is set by its template.'))),
      languageSection(draw),
      spellSection(draw),
      a11ySection(draw),
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

/**
 * Back Up Book: like Save As for a copy — beside the book, in your backup folder,
 * or anywhere you choose; as one .zip file or as a plain folder copy.
 */
export async function backupDialog(app, saveFirst) {
  if (!app.book) return null;
  let where = 'beside';
  let asFolder = false;
  const radio = (name, value, label, sub, checked, on) => {
    const r = h('input', { type: 'radio', name, value, checked });
    r.addEventListener('change', () => on(value));
    return h('label', { class: 'bu-opt' }, r, h('span', {}, h('b', {}, label), sub ? h('small', { class: 'hint' }, sub) : null));
  };
  const body = h('div', { class: 'bu-body' },
    h('div', { class: 'bu-group' }, h('div', { class: 'bu-head' }, 'Save the backup'),
      radio('bu-where', 'beside', 'In the same folder as the book', 'Next to the book’s own folder.', true, (v) => { where = v; }),
      settings.backupDir ? radio('bu-where', 'backup', 'In your backup folder', pretty(settings.backupDir), false, (v) => { where = v; }) : null,
      radio('bu-where', 'choose', 'In another folder…', 'You choose the folder next.', false, (v) => { where = v; })),
    h('div', { class: 'bu-group' }, h('div', { class: 'bu-head' }, 'As'),
      radio('bu-as', 'zip', 'One .zip file', 'Easy to keep, e-mail or restore.', true, () => { asFolder = false; }),
      radio('bu-as', 'folder', 'A copy of the book folder', 'Opens in Lutefisk like any book.', false, () => { asFolder = true; })),
    h('p', { class: 'hint' }, 'The backup is named with the book’s title and today’s date and time. Your book is saved first.'));
  const ok = await dialog({ title: `Back Up “${app.book.title || 'Untitled'}”`, body, ok: 'Back Up' });
  if (!ok) return null;
  await saveFirst?.();
  return backupProject(null, { where: where === 'beside' ? 'beside' : undefined, choose: where === 'choose', asFolder });
}

/** Back up a project (the open one when dir is omitted) and report where it went. */
export async function backupProject(dir, { choose = false, where, asFolder = false } = {}) {
  try {
    const res = await B.backupProject({ dir, choose, where, asFolder });
    if (!res) return null;
    const mb = res.bytes / (1024 * 1024);
    toast(`Backed up${res.folder ? ' as a folder' : ''} (${mb < 1 ? `${Math.max(1, Math.round(res.bytes / 1024))} KB` : `${mb.toFixed(1)} MB`}) to ${pretty(res.dir)}`, 'ok', 4000);
    try { B.revealBackup(res.file); } catch { /* ignore */ }
    return res;
  } catch (err) { toast(`Backup failed: ${String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 'error', 6000); return null; }
}
