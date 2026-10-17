import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
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
  const password = values.ADMIN_PASSWORD || '';
  if (password.length < 12 || password.length > 128) {
    console.error('Set ADMIN_PASSWORD to a value 12–128 characters long in .env.cloudflare.');
    process.exit(1);
  }
  const salt = randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
  const now = Date.now();
  const sql = `INSERT INTO admin_credentials(id,salt,password_hash,iterations,updated_at) VALUES(1,'${salt}','${hash}',${iterations},${now}) ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,iterations=excluded.iterations,updated_at=excluded.updated_at`;
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN: values.CLOUDFLARE_API_TOKEN };
  const reset = spawnSync('npx', ['--yes', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--command', sql], {
    cwd: root, env, encoding: 'utf8', stdio: 'inherit',
  });
  if (reset.error) { console.error(reset.error.message); process.exit(1); }
  if (reset.status !== 0) process.exit(reset.status ?? 1);
  const secret = spawnSync('npx', ['--yes', 'wrangler', 'secret', 'put', 'ADMIN_PASSWORD'], {
    cwd: root, env, encoding: 'utf8', input: `${password}\n`, stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (secret.error) { console.error(secret.error.message); process.exit(1); }
  if (secret.status !== 0) process.exit(secret.status ?? 1);
  console.log('Cloudflare D1 admin password reset.');
  process.exit(0);
}

if (args[0] === 'set-sms-secrets') {
  const secretNames = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_FROM_NUMBER'];
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
  console.log('SMS notification secrets uploaded.');
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
