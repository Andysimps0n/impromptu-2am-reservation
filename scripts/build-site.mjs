import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [template, html, client, hosting] = await Promise.all([
  readFile(resolve(root, 'worker/index.js'), 'utf8'),
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, '.openai/hosting.json'), 'utf8'),
]);
if (!template.includes('__INDEX_HTML__') || !template.includes('__APP_JS__')) throw new Error('Worker asset placeholders are missing');
const output = template.replace('__INDEX_HTML__', () => JSON.stringify(html)).replace('__APP_JS__', () => JSON.stringify(client));
const target = resolve(root, 'dist/server/index.js');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output);
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
console.log(`Built ${target}`);
