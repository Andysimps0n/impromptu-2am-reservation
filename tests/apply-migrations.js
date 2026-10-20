import { applyD1Migrations, reset } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach } from 'vitest';

if (!env.TEST_MIGRATIONS) {
  throw new Error('TEST_MIGRATIONS 바인딩이 없습니다. vitest.config.js를 확인하세요.');
}

env.ADMIN_USERNAME = 'test-admin';
env.ADMIN_PASSWORD = 'test-admin-password';
env.SOLAPI_API_KEY = '';
env.SOLAPI_API_SECRET = '';
env.SOLAPI_FROM_NUMBER = '';
env.CLOUDFLARE_API_TOKEN = '';
env.CLOUDFLARE_ACCOUNT_ID = '';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(async () => {
  await reset();
  env.ADMIN_USERNAME = 'test-admin';
  env.ADMIN_PASSWORD = 'test-admin-password';
  env.SOLAPI_API_KEY = '';
  env.SOLAPI_API_SECRET = '';
  env.SOLAPI_FROM_NUMBER = '';
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
