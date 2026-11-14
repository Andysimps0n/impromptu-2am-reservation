# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm run dev                 # build site bundle, apply local D1 migrations, run wrangler dev on :8787 (watches src/, index.html, styles.css, privacy.html, worker/index.js)
npm run build               # bundle HTML/CSS/React into dist/server/index.js (one-shot, no wrangler)
npm test                    # vitest run (all tests, in workerd via @cloudflare/vitest-plugin)
npx vitest run tests/bookings.test.js            # single file
npx vitest run -t "<test name substring>"        # single test by name
npm run migrate:cloudflare  # apply drizzle/ SQL migrations to remote D1
npm run deploy:cloudflare   # build + wrangler deploy
```

There is no lint script. `npm run build:vercel` produces a static-only `vercel-dist/` (see Deployment).

## Architecture

**Single Cloudflare Worker + D1, with the frontend embedded in it.** `worker/index.js` (~1k lines) is the entire backend: router, booking logic, admin auth, SMS, Google Sheets sync, and the cron handler. Its `__INDEX_HTML__`, `__APP_JS__`, `__SITE_CSS__`, `__LOGO_PNG__` etc. placeholders are replaced at build time, which esbuilds `src/main.jsx` into an IIFE and inlines everything as JSON/base64 into `dist/server/index.js`. The logic lives in two places: `scripts/build-site.mjs` (used by `npm run build`/`deploy`) and a separate `bundleSite()` in `scripts/dev.mjs` (used by `npm run dev`, which also watches and rebuilds on save). Changes to the placeholder list or bundling inputs must be made in both. Do not hand-edit `dist/`.

**Frontend** is React 19 + react-router, split by responsibility:
- `src/App.jsx` route table; `src/pages/` one file per route (public `/`, `/booking/*`, `/ticket`, `/admin/*`).
- `src/features/booking/` and `src/features/admin/` hold feature components and their contexts (`PublicBookingContext`, `AdminContext`).
- The Worker serves the same `index.html` for all SPA paths (`SPA_PATH` regex). Legacy hash/query URLs (`/#t=TOKEN` in old SMS links, `/?admin=1`) are redirected client-side by `legacyRedirect` in `src/App.jsx`; keep those working.

**Data model and booking lifecycle.** Schema lives only in `drizzle/*.sql`, applied in order; the Worker uses raw `env.DB.prepare(...)` queries, not an ORM. Never change schema inside a request handler. Key flow:
- Seats are a fixed grid (rows A–L; row A is reserved for staff). `performance_seat_locks` keyed by show/session tracks taken seats; `bookings.status` moves `pending` (30-minute hold, released by `cleanExpired` lazily on read) → `paid` → refund states. Cancelling a pending booking frees seats immediately; a paid booking only frees seats after an admin marks the refund complete.
- Per-contact and per-IP limits are enforced through a rate-limit table (`consumeRateLimit`), and contact-based seat caps apply per session.
- Entry tickets: on payment confirmation, one QR per seat is created. The raw access token goes only into the SMS link/URL fragment; D1 stores its SHA-256 hash. Check-in is one-way and server-enforced.
- Events: one published event at a time (`getActiveEvent`); a booking is tied to an `event_sessions` row (show id).

**Auth.** Admin = Kakao OAuth (`/auth/kakao/login` → `/auth/kakao/callback`), and the Worker only admits Kakao member IDs listed in `ADMIN_KAKAO_IDS`; it never trusts client-sent nickname/token. Session cookie `stage_admin` (HttpOnly, Secure, 8h). Password login exists only when `ADMIN_PASSWORD_LOGIN=1`. Non-admin booking can optionally require Kakao via `REQUIRE_KAKAO_BOOKING`.

**Background work.** `wrangler.jsonc` has two crons: `0 18 * * *` (daily cleanup of personal data 90 days after event/refund — `runScheduledCleanup`) and `*/3 * * * *` (`runSheetSync`, DB → Google Sheets one-way copy of bookings/tickets/users; only changed tabs are rewritten). `scheduled()` dispatches on `controller.cron`.

**SMS** (Solapi) is sent asynchronously via `ctx.waitUntil` only when an admin confirms payment; failures are recorded per booking and can be retried from admin UI.

## Testing

Tests run inside the real Workers runtime (miniflare). `tests/apply-migrations.js` resets D1 and reapplies `drizzle/` before each test. Tests call `worker.fetch` directly through `tests/helpers.js#api`, which also drains `waitUntil` promises. Env vars for tests are set in `vitest.config.js` (`ADMIN_PASSWORD_LOGIN=1`, empty Kakao/SMS keys), so tests do not hit external services. Keep it that way; if you add an external call, gate it on a binding that is empty in tests.

## Configuration and secrets

- `wrangler.jsonc` holds the non-secret config and D1 `database_id`; keep secrets out of it.
- Local secrets go in `.dev.vars` (copied from `.env.example`); deploy-time secrets are pushed with `npm run set:cloudflare-*` from `.env.cloudflare` (template: `cloudflare.env.example`). Both are gitignored; do not read or print their contents.
- `.openai/hosting.json` is hosting metadata; `.cursor/toss.md` is a design-token reference, not repo instructions.

## Deployment

Primary target is Cloudflare Workers (`deploy:cloudflare`). `vercel.json` also exists: it builds a static site and rewrites `/api/*` to the Workers domain, so the Vercel build has no backend of its own.

## Domain notes

- UI copy and the privacy policy (`privacy.html`) are in Korean; keep user-facing strings in Korean.
- The project name is 즉흥적 새벽 2시 공연 예매 (ticketing for a club show). `review-log.md` is a design-review log, not code docs.
