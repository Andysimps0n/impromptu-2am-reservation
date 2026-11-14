import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(root);
const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
const heroLogoName = files.find(name => name.normalize('NFC').includes('로고1.png'));
if (!logoName || !heroLogoName) throw new Error('Club logo PNG was not found');
const [template, sourceHtml, privacyHtml, styles, hosting, logo, heroLogo, instruments, posterBackground] = await Promise.all([
  readFile(resolve(root, 'worker/index.js'), 'utf8'),
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'privacy.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
  readFile(resolve(root, '.openai/hosting.json'), 'utf8'),
  readFile(resolve(root, logoName)),
  readFile(resolve(root, heroLogoName)),
  readFile(resolve(root, 'poster-instruments.png')),
  readFile(resolve(root, 'poster-background.jpg')),
]);
const clientBundle = await build({ entryPoints: [resolve(root, 'src/main.jsx')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, write: false });
const client = clientBundle.outputFiles[0].text;
if (!template.includes('__INDEX_HTML__') || !template.includes('__PRIVACY_HTML__') || !template.includes('__APP_JS__') || !template.includes('__SITE_CSS__') || !template.includes('__LOGO_PNG__') || !template.includes('__HERO_LOGO_PNG__') || !template.includes('__INSTRUMENTS_PNG__') || !template.includes('__POSTER_BACKGROUND_JPG__')) throw new Error('Worker asset placeholders are missing');
const output = template
  .replace('__INDEX_HTML__', () => JSON.stringify(sourceHtml))
  .replace('__PRIVACY_HTML__', () => JSON.stringify(privacyHtml))
  .replace('__APP_JS__', () => JSON.stringify(client))
  .replace('__SITE_CSS__', () => JSON.stringify(styles))
  .replace('__LOGO_PNG__', () => JSON.stringify(logo.toString('base64')))
  .replace('__HERO_LOGO_PNG__', () => JSON.stringify(heroLogo.toString('base64')))
  .replace('__INSTRUMENTS_PNG__', () => JSON.stringify(instruments.toString('base64')))
  .replace('__POSTER_BACKGROUND_JPG__', () => JSON.stringify(posterBackground.toString('base64')));
const target = resolve(root, 'dist/server/index.js');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output);
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
console.log(`Built ${target}`);
