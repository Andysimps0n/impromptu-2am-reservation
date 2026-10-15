import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');

// 1x1 transparent PNG, used when the club logo file is not in the repo.
const fallbackLogo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const files = await readdir(root);
const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
const heroLogoName = files.find(name => name.normalize('NFC').includes('로고1.png'));
const [template, sourceHtml, styles, logo, heroLogo] = await Promise.all([
  readFile(resolve(root, 'worker/index.js'), 'utf8'),
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  logoName ? readFile(resolve(root, logoName)) : Promise.resolve(fallbackLogo),
  heroLogoName ? readFile(resolve(root, heroLogoName)) : Promise.resolve(fallbackLogo),
]);
const clientBundle = await build({ entryPoints: [resolve(root, 'app.js')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, write: false });
const client = clientBundle.outputFiles[0].text;

const output = template
  .replace('__INDEX_HTML__', () => JSON.stringify(sourceHtml))
  .replace('__APP_JS__', () => JSON.stringify(client))
  .replace('__SITE_CSS__', () => JSON.stringify(styles))
  .replace('__LOGO_PNG__', () => JSON.stringify(logo.toString('base64')))
  .replace('__HERO_LOGO_PNG__', () => JSON.stringify(heroLogo.toString('base64')));
const target = resolve(root, 'dist/server/index.js');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output);

function run(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, stdio: 'inherit' });
    child.on('exit', code => (code === 0 ? resolveRun() : reject(new Error(`wrangler ${args.join(' ')} exited ${code}`))));
  });
}

await run(['d1', 'migrations', 'apply', 'DB', '--local']);
await run(['dev', '--port', '8787', '--local']);
