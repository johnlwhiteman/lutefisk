// Fails if any installed package version is marked deprecated on the npm
// registry. Reads package-lock.json and queries the registry once per package.
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const pkgs = new Map();
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || !info.version) continue;
  const name = path.replace(/^.*node_modules\//, '');
  if (!pkgs.has(name)) pkgs.set(name, new Set());
  pkgs.get(name).add(info.version);
}
const registry = process.env.npm_config_registry || 'https://registry.npmjs.org/';
const deprecated = [];
const names = [...pkgs.keys()];
for (let i = 0; i < names.length; i += 16) {
  await Promise.all(names.slice(i, i + 16).map(async (name) => {
    const r = await fetch(registry + name.replace('/', '%2F'), { headers: { accept: 'application/vnd.npm.install-v1+json' } });
    if (!r.ok) throw new Error(`${name}: registry answered ${r.status}`);
    const meta = await r.json();
    for (const v of pkgs.get(name)) {
      const d = meta.versions?.[v]?.deprecated;
      if (d) deprecated.push(`${name}@${v}: ${d}`);
    }
  }));
}
if (deprecated.length) {
  console.error(`Deprecated packages (${deprecated.length}):\n` + deprecated.join('\n'));
  process.exit(1);
}
console.log(`No deprecated packages among ${pkgs.size} installed packages.`);
