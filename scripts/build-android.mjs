import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
await build({
  entryPoints: ['native-backup.js'],
  outfile: 'dist/native-backup.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
});

// Older APKs briefly registered the web service worker. Its cached modules can
// survive an in-place update, so give native modules fresh URLs for this build.
const nativeVersion = 'v7';
for (const file of ['index.html', 'app.js', 'coach.js']) {
  const path = new URL(`../dist/${file}`, import.meta.url);
  let source = await readFile(path, 'utf8');
  if (file === 'index.html') source = source.replace('./app.js"', `./app.js?native=${nativeVersion}"`);
  else source = source.replaceAll(/(\.\/[^'"\s]+\.js)(?=['"])/g, `$1?native=${nativeVersion}`);
  await writeFile(path, source);
}
