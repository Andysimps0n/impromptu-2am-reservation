import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(root);
const logoName = files.find(name => name.normalize('NFC').includes('로고2.png'));
if (!logoName) throw new Error('Club logo PNG was not found');
const [template, sourceHtml, client, hosting, logo] = await Promise.all([
  readFile(resolve(root, 'worker/index.js'), 'utf8'),
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, '.openai/hosting.json'), 'utf8'),
  readFile(resolve(root, logoName)),
]);
if (!template.includes('__INDEX_HTML__') || !template.includes('__APP_JS__')) throw new Error('Worker asset placeholders are missing');
if (!sourceHtml.includes('__CLUB_LOGO__')) throw new Error('Club logo placeholder is missing');
const html = sourceHtml.replace('__CLUB_LOGO__', logo.toString('base64'));
const output = template.replace('__INDEX_HTML__', () => JSON.stringify(html)).replace('__APP_JS__', () => JSON.stringify(client));
const target = resolve(root, 'dist/server/index.js');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output);
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
console.log(`Built ${target}`);
