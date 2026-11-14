import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import worker from '../worker/index.js';
import { seedBooking } from './helpers.js';

const SHEET_ID = 'test-sheet';
const EVENT_TAB = 'legacy-2026 예약';
const TICKET_TAB = 'legacy-2026 티켓';

let pem;
let syncEnv;
let sheets;
let values;
let requests;
let nextSheetId;
let originalFetch;

// 구글 API를 흉내 내는 메모리 시트. 탭 생성·삭제·비우기·쓰기만 지원한다.
const fakeGoogle = async (input, init = {}) => {
  const url = String(input);
  const method = init.method || 'GET';
  const body = typeof init.body === 'string' ? init.body : null;
  requests.push({ url, method, body });

  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    return Response.json({ access_token: 'test-token', expires_in: 3600 });
  }
  if (url.includes(`/${SHEET_ID}?fields=`)) {
    return Response.json({ sheets: [...sheets].map(([title, sheetId]) => ({ properties: { title, sheetId } })) });
  }
  if (url.endsWith(`/${SHEET_ID}:batchUpdate`)) {
    const replies = [];
    for (const request of JSON.parse(body).requests) {
      if (request.addSheet) {
        const title = request.addSheet.properties.title;
        const sheetId = nextSheetId;
        nextSheetId += 1;
        sheets.set(title, sheetId);
        replies.push({ addSheet: { properties: { sheetId, title } } });
      }
      if (request.deleteSheet) {
        for (const [title, sheetId] of sheets) {
          if (sheetId === request.deleteSheet.sheetId) {
            sheets.delete(title);
            values.delete(title);
          }
        }
        replies.push({});
      }
    }
    return Response.json({ replies });
  }
  if (url.endsWith('/values:batchClear')) {
    for (const range of JSON.parse(body).ranges) values.delete(unquote(range));
    return Response.json({});
  }
  if (url.endsWith('/values:batchUpdate')) {
    for (const item of JSON.parse(body).data) values.set(unquote(item.range.replace(/!A1$/, '')), item.values);
    return Response.json({});
  }
  return new Response('unexpected request', { status: 500 });
};

const unquote = range => range.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");

const runSheetSync = async target => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: '*/3 * * * *' }), target, ctx);
  await waitOnExecutionContext(ctx);
};

const valueWrites = () => requests.filter(request => request.url.endsWith('/values:batchUpdate'));

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const base64 = btoa(String.fromCharCode(...der)).match(/.{1,64}/g).join('\n');
  pem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
  syncEnv = {
    ...env,
    GOOGLE_SHEET_ID: SHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sync@example.test',
    GOOGLE_PRIVATE_KEY: pem,
  };
});

beforeEach(() => {
  sheets = new Map();
  values = new Map();
  requests = [];
  nextSheetId = 100;
  originalFetch = globalThis.fetch;
  globalThis.fetch = fakeGoogle;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('구글 스프레드시트 동기화', () => {
  it('공연별 예약·티켓 탭과 유저 탭을 만들고 예약 행을 채운다', async () => {
    await seedBooking({
      id: 'STG-SYNC01',
      name: '홍길동',
      phone: '01012341234',
      seats: ['F06'],
      status: 'paid',
      ticketAccessHash: 'secret-hash-value',
      tickets: [{ id: 'T-SYNC01', seat: 'F06' }],
    });

    await runSheetSync(syncEnv);

    const eventRows = values.get(EVENT_TAB);
    expect(eventRows[0][0]).toBe('예약ID');
    expect(eventRows[1][0]).toBe('STG-SYNC01');
    expect(eventRows[1][3]).toBe('paid');
    expect(eventRows[1][4]).toBe('홍길동');
    expect(eventRows[1][5]).toBe('01012341234');
    expect(eventRows[1][7]).toBe('F06');
    expect(values.get(TICKET_TAB)[1][0]).toBe('T-SYNC01');
    expect(values.has('유저')).toBe(true);
    expect(sheets.has(EVENT_TAB)).toBe(true);
    expect(sheets.has(TICKET_TAB)).toBe(true);
  });

  it('티켓 접근 토큰 해시는 어떤 요청에도 실리지 않는다', async () => {
    await seedBooking({ id: 'STG-SYNC02', phone: '01022223333', seats: ['F07'], status: 'paid', ticketAccessHash: 'secret-hash-value' });

    await runSheetSync(syncEnv);

    expect(JSON.stringify(requests.map(request => request.body ?? ''))).not.toContain('secret-hash-value');
  });

  it('값은 RAW 모드로 쓴다', async () => {
    await seedBooking({ id: 'STG-SYNC03', phone: '01033334444', seats: ['F08'], status: 'pending' });

    await runSheetSync(syncEnv);

    expect(valueWrites().length).toBeGreaterThan(0);
    for (const write of valueWrites()) expect(JSON.parse(write.body).valueInputOption).toBe('RAW');
  });

  it('수식으로 해석될 수 있는 입력은 작은따옴표를 붙여 쓴다', async () => {
    await seedBooking({ id: 'STG-SYNC04', name: '=HYPERLINK("x")', phone: '01044445555', seats: ['F09'], status: 'pending' });

    await runSheetSync(syncEnv);

    expect(values.get(EVENT_TAB)[1][4]).toBe("'=HYPERLINK(\"x\")");
  });

  it('바뀐 내용이 없으면 두 번째 실행은 값을 다시 쓰지 않는다', async () => {
    await seedBooking({ id: 'STG-SYNC05', phone: '01055556666', seats: ['F10'], status: 'paid' });
    await runSheetSync(syncEnv);

    requests = [];
    await runSheetSync(syncEnv);

    expect(valueWrites().length).toBe(0);
    expect(requests.filter(request => request.url.includes('/values:'))).toEqual([]);
  });

  it('예약 상태가 바뀌면 그 공연의 예약 탭만 다시 쓴다', async () => {
    await seedBooking({ id: 'STG-SYNC06', phone: '01066667777', seats: ['F11'], status: 'paid', tickets: [{ id: 'T-SYNC06', seat: 'F11' }] });
    await runSheetSync(syncEnv);

    await env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").bind('STG-SYNC06').run();
    requests = [];
    await runSheetSync(syncEnv);

    const written = valueWrites().map(write => JSON.parse(write.body).data.map(item => item.range));
    expect(written).toEqual([[`'${EVENT_TAB}'!A1`]]);
    expect(values.get(EVENT_TAB)[1][3]).toBe('cancelled');
  });

  it('DB에서 사라진 공연의 탭은 지우고, 직접 만든 탭은 건드리지 않는다', async () => {
    sheets.set('EVT-GONE 예약', 77);
    values.set('EVT-GONE 예약', [['예약ID']]);
    sheets.set('내 메모', 88);
    values.set('내 메모', [['자유 기록']]);
    await env.DB.prepare('INSERT INTO sheet_sync_state(tab,sheet_id,content_hash,synced_at) VALUES(?,?,?,?)')
      .bind('EVT-GONE 예약', 77, 'old-hash', 0).run();

    await runSheetSync(syncEnv);

    expect(sheets.has('EVT-GONE 예약')).toBe(false);
    expect(sheets.get('내 메모')).toBe(88);
    expect(values.get('내 메모')).toEqual([['자유 기록']]);
    const state = await env.DB.prepare('SELECT tab FROM sheet_sync_state WHERE tab=?').bind('EVT-GONE 예약').first();
    expect(state).toBeNull();
  });

  it('동기화 설정이 없으면 구글에 아무 요청도 보내지 않는다', async () => {
    await runSheetSync({ ...env, GOOGLE_SHEET_ID: undefined });

    expect(requests).toEqual([]);
  });
});
