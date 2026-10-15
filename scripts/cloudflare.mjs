import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, '.env.cloudflare');
let content;
try {
  content = await readFile(configPath, 'utf8');
} catch {
  console.error('Create .env.cloudflare from cloudflare.env.example first.');
  process.exit(1);
}

const values = {};
for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const index = trimmed.indexOf('=');
  if (index < 1) continue;
  values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
}

for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
  if (!values[key]) {
    console.error(`Set ${key} in .env.cloudflare first.`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
let input;
if (args[0] === 'set-admin-password') {
  if (!values.ADMIN_PASSWORD) {
    console.error('Set ADMIN_PASSWORD in .env.cloudflare first.');
    process.exit(1);
  }
  args.splice(0, 1, 'secret', 'put', 'ADMIN_PASSWORD');
  input = `${values.ADMIN_PASSWORD}\n`;
}

if (args[0] === 'set-kakao-secrets') {
  const secretNames = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'KAKAO_PF_ID', 'KAKAO_TEMPLATE_PENDING', 'KAKAO_TEMPLATE_CONFIRMED'];
  const missing = secretNames.filter(name => !values[name]);
  if (missing.length) {
    console.error(`Set ${missing.join(', ')} in .env.cloudflare first.`);
    process.exit(1);
  }
  for (const name of secretNames) {
    const result = spawnSync('npx', ['--yes', 'wrangler', 'secret', 'put', name], {
      cwd: root,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: values.CLOUDFLARE_API_TOKEN },
      encoding: 'utf8',
      input: `${values[name]}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log('Kakao notification secrets uploaded.');
  process.exit(0);
}

const result = spawnSync('npx', ['--yes', 'wrangler', ...args], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: values.CLOUDFLARE_API_TOKEN },
  encoding: 'utf8',
  input,
  stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
