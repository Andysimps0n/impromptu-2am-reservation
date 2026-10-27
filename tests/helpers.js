import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import worker from '../worker/index.js';

// 테스트는 Worker의 fetch 핸들러를 직접 호출한다.
// createExecutionContext + waitOnExecutionContext를 쓰는 이유:
// 입금 확인 문자는 ctx.waitUntil로 백그라운드에서 보내지므로,
// 응답이 끝난 뒤에도 그 작업이 끝나길 기다려야 문자 상태를 검증할 수 있다.

const HOLD_MS = 30 * 60 * 1000;
const BOOKING_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export const TEST_ADMIN = {
  username: 'test-admin',
  password: 'test-admin-password',
};

export { HOLD_MS, BOOKING_RETENTION_MS, env };

export async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, ip = '203.0.113.10', cookie } = options;
  const requestHeaders = {
    'cf-connecting-ip': ip,
    ...headers,
  };
  if (cookie) requestHeaders.cookie = cookie;
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';

  const request = new Request(`https://example.com${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

export async function loginAdmin(options = {}) {
  const result = await api('/api/admin/login', {
    method: 'POST',
    ip: options.ip || '198.51.100.10',
    body: {
      username: options.username ?? TEST_ADMIN.username,
      password: options.password ?? TEST_ADMIN.password,
    },
  });
  const setCookie = result.headers.getSetCookie?.()[0] || result.headers.get('set-cookie') || '';
  const token = /stage_admin=([^;]+)/.exec(setCookie)?.[1] || '';
  return { ...result, cookie: token ? `stage_admin=${token}` : '' };
}

export async function adminApi(path, options = {}) {
  const auth = options.cookie ? { cookie: options.cookie } : await loginAdmin();
  return api(path, { ...options, cookie: auth.cookie || options.cookie });
}

let bookingSeq = 0;

export async function createBooking(input = {}) {
  bookingSeq += 1;
  return api('/api/bookings', {
    method: 'POST',
    ip: input.ip ?? `203.0.113.${(bookingSeq % 200) + 1}`,
    body: {
      showId: input.showId ?? '1',
      name: input.name ?? '김관객',
      phone: input.phone ?? `010${String(80000000 + bookingSeq).slice(-8)}`,
      payer: input.payer ?? '김입금',
      seats: input.seats ?? ['B01'],
    },
  });
}

export async function seedBooking(input = {}) {
  const id = input.id || `STG-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const name = input.name || '김관객';
  const phone = input.phone || '01011112222';
  const payer = input.payer || '김입금';
  const seats = input.seats || ['C01'];
  const status = input.status || 'pending';
  const showId = input.showId || '1';
  const createdAt = input.createdAt ?? Date.now();
  const statements = [
    env.DB.prepare(`INSERT INTO bookings(
        id,name,phone,payer,amount,status,created_at,show_id,
        notification_status,notification_attempts,notification_error_code,notification_updated_at,
        ticket_access_hash,privacy_delete_after
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id,
      name,
      phone,
      payer,
      input.amount ?? seats.length * 6500,
      status,
      createdAt,
      showId,
      input.notificationStatus || 'untracked',
      input.notificationAttempts || 0,
      input.notificationErrorCode || null,
      input.notificationUpdatedAt || null,
      input.ticketAccessHash || null,
      input.privacyDeleteAfter || null,
    ),
  ];

  for (const [index, seat] of seats.entries()) {
    statements.push(env.DB.prepare('INSERT INTO booking_seats(seat,booking_id) VALUES(?,?)').bind(seat, id));
    if (['pending', 'paid'].includes(status)) {
      statements.push(env.DB.prepare('INSERT INTO performance_seat_locks(show_id,seat,booking_id) VALUES(?,?,?)').bind(showId, seat, id));
      statements.push(env.DB.prepare('INSERT INTO phone_seat_locks(show_id,phone,slot,booking_id,seat) VALUES(?,?,?,?,?)')
        .bind(showId, phone, index + 1, id, seat));
    }
  }

  for (const ticket of input.tickets || []) {
    statements.push(env.DB.prepare('INSERT INTO tickets(id,booking_id,show_id,seat,status,checked_in_at) VALUES(?,?,?,?,?,?)')
      .bind(ticket.id, id, showId, ticket.seat, ticket.status || 'valid', ticket.checkedInAt || null));
  }

  await env.DB.batch(statements);
  return id;
}

export async function runScheduledCleanup() {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController(), env, ctx);
  await waitOnExecutionContext(ctx);
}

export async function seatState(showId, seat) {
  const result = await api(`/api/seats?show=${encodeURIComponent(showId)}`);
  return result.data.seats?.[seat];
}

export function mockSolapi(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    if (!url.startsWith('https://api.solapi.com/')) {
      throw new Error(`테스트가 외부 네트워크에 접근했습니다: ${url}`);
    }
    return handler(input, init, url);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}
