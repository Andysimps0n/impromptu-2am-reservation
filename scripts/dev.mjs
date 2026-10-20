import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const target = resolve(root, 'dist/server/index.js');

// 1x1 transparent PNG, used when the club logo file is not in the repo.
const fallbackLogo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function bundleSite() {
  const files = await readdir(root);
  const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
  const heroLogoName = files.find(name => name.normalize('NFC').includes('로고1.png'));
  const [template, sourceHtml, privacyHtml, styles, logo, heroLogo, instruments] = await Promise.all([
    readFile(resolve(root, 'worker/index.js'), 'utf8'),
    readFile(resolve(root, 'index.html'), 'utf8'),
    readFile(resolve(root, 'privacy.html'), 'utf8'),
    readFile(resolve(root, 'styles.css'), 'utf8'),
    logoName ? readFile(resolve(root, logoName)) : Promise.resolve(fallbackLogo),
    heroLogoName ? readFile(resolve(root, heroLogoName)) : Promise.resolve(fallbackLogo),
    readFile(resolve(root, 'poster-instruments.png')),
  ]);
  const clientBundle = await build({ entryPoints: [resolve(root, 'app.js')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, write: false });
  const client = clientBundle.outputFiles[0].text;
  const output = template
    .replace('__INDEX_HTML__', () => JSON.stringify(sourceHtml))
    .replace('__PRIVACY_HTML__', () => JSON.stringify(privacyHtml))
    .replace('__APP_JS__', () => JSON.stringify(client))
    .replace('__SITE_CSS__', () => JSON.stringify(styles))
    .replace('__LOGO_PNG__', () => JSON.stringify(logo.toString('base64')))
    .replace('__HERO_LOGO_PNG__', () => JSON.stringify(heroLogo.toString('base64')))
    .replace('__INSTRUMENTS_PNG__', () => JSON.stringify(instruments.toString('base64')));
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, output);
  await rename(temporary, target);
}

await bundleSite();
console.log(`Built ${target}`);
if (process.argv.includes('--once')) process.exit(0);

let rebuildTimer;
let rebuilding = false;
let rebuildAgain = false;

async function rebuild(reason) {
  if (rebuilding) {
    rebuildAgain = true;
    return;
  }
  rebuilding = true;
  try {
    await bundleSite();
    console.log(`Rebuilt site bundle after ${reason}`);
  } catch (error) {
    console.error(`Site bundle failed after ${reason}`);
    console.error(error);
  } finally {
    rebuilding = false;
    if (rebuildAgain) {
      rebuildAgain = false;
      rebuild('another save');
    }
  }
}

function scheduleRebuild(reason) {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuild(reason), 200);
}

watch(resolve(root, 'src'), { recursive: true }, (_event, filename) => scheduleRebuild(filename || 'src'));
for (const name of ['styles.css', 'index.html', 'privacy.html', 'worker/index.js', 'app.js']) {
  watch(resolve(root, name), () => scheduleRebuild(name));
}

function run(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, stdio: 'inherit' });
    child.on('exit', code => (code === 0 ? resolveRun() : reject(new Error(`wrangler ${args.join(' ')} exited ${code}`))));
  });
}

if (process.argv.includes('--watch-only')) {
  console.log('Watching source files. Saves rebuild the site bundle.');
  await new Promise(() => {});
}

await run(['d1', 'migrations', 'apply', 'DB', '--local']);
await run(['dev', '--port', '8787', '--local']);
