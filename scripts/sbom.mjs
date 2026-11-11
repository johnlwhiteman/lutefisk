// Generates Software Bills of Materials in CycloneDX 1.5 and SPDX 2.3 JSON
// using npm's built-in `npm sbom`, for both the shipped application and the
// full build toolchain, plus a readable Markdown summary.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

mkdirSync('sbom', { recursive: true });
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) => execFileSync(npm, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });

const outputs = {
  'lutefisk-runtime.cdx.json': ['sbom', '--sbom-format', 'cyclonedx', '--sbom-type', 'application', '--omit', 'dev'],
  'lutefisk-runtime.spdx.json': ['sbom', '--sbom-format', 'spdx', '--omit', 'dev'],
  'lutefisk-full.cdx.json': ['sbom', '--sbom-format', 'cyclonedx', '--sbom-type', 'application'],
  'lutefisk-full.spdx.json': ['sbom', '--sbom-format', 'spdx'],
};
for (const [file, args] of Object.entries(outputs)) writeFileSync(`sbom/${file}`, run(args));

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const rows = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = path.replace(/^.*node_modules\//, '');
  rows.push({ name, version: info.version, license: info.license || '', dev: !!info.dev, optional: !!info.optional });
}
rows.sort((a, b) => a.name.localeCompare(b.name));
const runtime = rows.filter((r) => !r.dev);
const dev = rows.filter((r) => r.dev);
const table = (list) => ['| Package | Version | License |', '|---|---|---|', ...list.map((r) => `| ${r.name} | ${r.version} | ${r.license} |`)].join('\n');
const audit = (() => { try { return JSON.parse(run(['audit', '--json'])).metadata.vulnerabilities; } catch (e) { return JSON.parse(e.stdout).metadata.vulnerabilities; } })();
const electronVersion = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')).version;

writeFileSync('sbom/SBOM.md', `# Lutefisk ${pkg.version} — Software Bill of Materials

Generated ${new Date().toISOString()} with \`npm sbom\` (npm ${run(['--version']).trim()}).

Machine-readable files:

* \`lutefisk-runtime.cdx.json\` / \`lutefisk-runtime.spdx.json\` — components shipped inside the app
* \`lutefisk-full.cdx.json\` / \`lutefisk-full.spdx.json\` — runtime + build toolchain

Embedded runtime: **Electron ${electronVersion}** (Chromium + Node.js), downloaded from the official Electron release.

\`npm audit\`: ${Object.entries(audit).map(([k, v]) => `${k} ${v}`).join(', ')}.

## Shipped in the application (${runtime.length})

${table(runtime)}

## Build-time only (${dev.length})

${table(dev)}
`);
console.log(`SBOM written to sbom/ (${runtime.length} runtime, ${dev.length} build-time components)`);
