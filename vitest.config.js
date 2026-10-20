import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const emptyAsset = '""';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(root, 'drizzle'));

  return {
    define: {
      __INDEX_HTML__: emptyAsset,
      __PRIVACY_HTML__: emptyAsset,
      __APP_JS__: emptyAsset,
      __SITE_CSS__: emptyAsset,
      __LOGO_PNG__: emptyAsset,
      __HERO_LOGO_PNG__: emptyAsset,
      __INSTRUMENTS_PNG__: emptyAsset,
    },
    plugins: [
      cloudflareTest({
        remoteBindings: false,
        wrangler: { configPath: './tests/wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_USERNAME: 'test-admin',
            ADMIN_PASSWORD: 'test-admin-password',
            SOLAPI_API_KEY: '',
            SOLAPI_API_SECRET: '',
            SOLAPI_FROM_NUMBER: '',
          },
        },
      }),
    ],
    test: {
      include: ['tests/**/*.test.js'],
      setupFiles: ['./tests/apply-migrations.js'],
      testTimeout: 20000,
    },
  };
});
