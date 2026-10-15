import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(root);
const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
if (!logoName) throw new Error('Club logo PNG was not found');

const [sourceHtml, app, logo] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, logoName)),
]);
if (!sourceHtml.includes('__CLUB_LOGO__')) throw new Error('Club logo placeholder is missing');

const output = resolve(root, 'vercel-dist');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'index.html'), sourceHtml.replace('__CLUB_LOGO__', logo.toString('base64')));
await writeFile(resolve(output, 'app.js'), app);
console.log(`Built ${output}`);
