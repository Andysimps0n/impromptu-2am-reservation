import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(root);
const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
const heroLogoName = files.find(name => name.normalize('NFC').includes('로고1.png'));
if (!logoName || !heroLogoName) throw new Error('Club logo PNG was not found');

const [sourceHtml, styles] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
]);
const clientBundle = await build({ entryPoints: [resolve(root, 'src/main.jsx')], bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, write: false });
const app = clientBundle.outputFiles[0].text;
const output = resolve(root, 'vercel-dist');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.html'), sourceHtml);
await writeFile(resolve(output, 'app.js'), app);
await writeFile(resolve(output, 'styles.css'), styles);
await copyFile(resolve(root, logoName), resolve(output, logoName));
await copyFile(resolve(root, heroLogoName), resolve(output, heroLogoName));
await copyFile(resolve(root, 'poster-instruments.png'), resolve(output, 'poster-instruments.png'));
await copyFile(resolve(root, 'poster-background.jpg'), resolve(output, 'poster-background.jpg'));
console.log(`Built ${output}`);
