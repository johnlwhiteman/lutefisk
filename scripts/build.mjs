// Build script: bundles main, preload and renderer with esbuild and copies
// static assets (HTML, CSS, fonts) into dist/. No network access required.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONTS } from '../src/shared/fonts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const prod = process.argv.includes('--prod');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'renderer', 'fonts'), { recursive: true });

const common = { bundle: true, sourcemap: !prod, minify: prod, legalComments: 'linked', logLevel: 'warning' };

await build({
  ...common,
  entryPoints: [join(root, 'src/main/main.js')],
  outfile: join(dist, 'main.cjs'),
  platform: 'node', format: 'cjs', target: 'node22',
  external: ['electron'],
});
await build({
  ...common,
  entryPoints: [join(root, 'src/preload/preload.js')],
  outfile: join(dist, 'preload.cjs'),
  platform: 'node', format: 'cjs', target: 'node22',
  external: ['electron'],
});
// The renderer is built as ES modules so rarely used parts can load on demand.
await build({
  ...common,
  entryPoints: [join(root, 'src/renderer/app.js')],
  outdir: join(dist, 'renderer'),
  entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
  platform: 'browser', format: 'esm', target: 'chrome140',
  external: ['fs'], // harper.js reads its WebAssembly with fs only under Node; in the app it's fetched
});

cpSync(join(root, 'src/renderer/index.html'), join(dist, 'renderer', 'index.html'));
cpSync(join(root, 'src/renderer/styles'), join(dist, 'renderer', 'styles'), { recursive: true });
cpSync(join(root, 'assets'), join(dist, 'renderer', 'assets'), { recursive: true });

// Copy only the font files we need (Latin + Latin Extended, regular/bold, roman/italic).
let css = '';
for (const f of FONTS.filter((f) => f.pkg)) {
  const dir = join(root, 'node_modules', '@fontsource', f.pkg, 'files');
  if (!existsSync(dir)) throw new Error(`Missing font package ${f.pkg}`);
  const files = readdirSync(dir);
  for (const weight of [400, 700]) {
    for (const style of ['normal', 'italic']) {
      for (const subset of ['latin', 'latin-ext', ...(f.extraSubsets || [])]) {
        const name = `${f.pkg}-${subset}-${weight}-${style}.woff2`;
        if (!files.includes(name)) continue;
        copyFileSync(join(dir, name), join(dist, 'renderer', 'fonts', name));
        const range = subset === 'latin'
          ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
          : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
        css += `@font-face{font-family:'${f.family}';font-style:${style};font-weight:${weight};font-display:block;src:url('../fonts/${name}') format('woff2');unicode-range:${range}}\n`;
      }
    }
  }
}
// OpenType MATH font for equations (STIX Two Math, OFL).
{
  const name = 'stix-two-math-latin-400-normal.woff2';
  copyFileSync(join(root, 'node_modules', '@fontsource', 'stix-two-math', 'files', name), join(dist, 'renderer', 'fonts', name));
  // Harper, the local spelling and grammar checker (WebAssembly; runs entirely on this computer).
  mkdirSync(join(dist, 'renderer', 'harper'), { recursive: true });
  copyFileSync(join(root, 'node_modules', 'harper.js', 'dist', 'harper_wasm_bg.wasm'), join(dist, 'renderer', 'harper', 'harper.wasm'));
  css += `@font-face{font-family:'STIX Two Math';font-style:normal;font-weight:400;font-display:block;src:url('../fonts/${name}') format('woff2')}\n`;
}
writeFileSync(join(dist, 'renderer', 'styles', 'fonts.css'), css);
console.log('Build complete →', dist);
