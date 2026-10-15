import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(root);
const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
const heroLogoName = files.find(name => name.normalize('NFC').includes('로고1.png'));
if (!logoName || !heroLogoName) throw new Error('Club logo PNG was not found');

const [sourceHtml, app, styles] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'styles.css'), 'utf8'),
]);
const output = resolve(root, 'vercel-dist');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.html'), sourceHtml);
await writeFile(resolve(output, 'app.js'), app);
await writeFile(resolve(output, 'styles.css'), styles);
await copyFile(resolve(root, logoName), resolve(output, logoName));
await copyFile(resolve(root, heroLogoName), resolve(output, heroLogoName));
console.log(`Built ${output}`);
