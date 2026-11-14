// Packages Lutefisk for macOS, Windows and Linux with @electron/packager and
// hardens the Electron binary with fuses.
//   node scripts/package.mjs                     → current platform/arch
//   node scripts/package.mjs --platform=win32 --arch=x64
// Run `npm run build:prod` first (the npm "package*" scripts do this for you).
import { packager } from '@electron/packager';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const platform = arg('platform', process.platform);
const arch = arg('arch', process.arch);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

if (!existsSync('dist/main.cjs')) throw new Error('Run `npm run build:prod` first.');

const keep = /^\/(dist(\/|$)|package\.json$|LICENSE$|sbom(\/|$))/;
const paths = await packager({
  dir: '.',
  out: 'release',
  name: pkg.productName,
  executableName: platform === 'linux' ? 'lutefisk' : pkg.productName,
  appVersion: pkg.version,
  appBundleId: 'app.lutefisk.desktop',
  appCategoryType: 'public.app-category.productivity',
  platform,
  arch,
  asar: true,
  overwrite: true,
  prune: false,
  // Everything the app needs is bundled into dist/, so ship nothing else.
  ignore: (p) => p !== '' && !keep.test(p),
  icon: existsSync(`build/icon.${platform === 'darwin' ? 'icns' : platform === 'win32' ? 'ico' : 'png'}`) ? 'build/icon' : undefined,
  win32metadata: { CompanyName: 'Lutefisk', FileDescription: 'Lutefisk book studio', ProductName: 'Lutefisk' },
  extendInfo: { NSHumanReadableCopyright: 'Lutefisk' },
});

for (const out of paths) {
  const exe = platform === 'darwin' ? join(out, `${pkg.productName}.app`)
    : platform === 'win32' ? join(out, `${pkg.productName}.exe`) : join(out, 'lutefisk');
  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'darwin' && arch === 'arm64',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  console.log('Packaged and hardened:', out);
}
console.log('\nFor public distribution, code-sign (macOS: Developer ID + notarization; Windows: Authenticode) the folders above.');
