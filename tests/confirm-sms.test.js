import { afterEach, describe, expect, it } from 'vitest';
import { api, createBooking, env, loginAdmin, mockSolapi, seedBooking, sha256Hex } from './helpers.js';

describe('입금 확인과 문자·QR 링크', () => {
  afterEach(() => {
    delete env.SOLAPI_API_KEY;
    delete env.SOLAPI_API_SECRET;
    delete env.SOLAPI_FROM_NUMBER;
  });

  it('입금 확인하면 예약이 paid가 되고 좌석마다 티켓이 생긴다', async () => {
    const created = await createBooking({ phone: '01016161616', seats: ['C02', 'C03'] });
    const admin = await loginAdmin();
    const confirmed = await api(`/api/admin/bookings/${created.data.id}/confirm`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.data.confirmed).toBe(true);

    const tickets = await env.DB.prepare('SELECT seat,status FROM tickets WHERE booking_id=? ORDER BY seat')
      .bind(created.data.id).all();
    expect(tickets.results.map(row => row.seat)).toEqual(['C02', 'C03']);
    expect(tickets.results.every(row => row.status === 'valid')).toBe(true);
  });

  it('Solapi 설정이 없으면 문자를 보내지 않고 not_configured로 남긴다', async () => {
    const restore = mockSolapi(() => {
      throw new Error('Solapi가 호출되면 안 됩니다.');
    });
    try {
      const created = await createBooking({ phone: '01017171717', seats: ['C04'] });
      const admin = await loginAdmin();
      await api(`/api/admin/bookings/${created.data.id}/confirm`, {
        method: 'POST',
        cookie: admin.cookie,
        body: {},
      });
      const row = await env.DB.prepare('SELECT notification_status FROM bookings WHERE id=?').bind(created.data.id).first();
      expect(row.notification_status).toBe('not_configured');
    } finally {
      restore();
    }
  });

  it('Solapi mock이 성공하면 QR 링크 문자를 보내고 그 링크로 티켓을 열 수 있다', async () => {
    env.SOLAPI_API_KEY = 'test-solapi-key';
    env.SOLAPI_API_SECRET = 'test-solapi-secret';
    env.SOLAPI_FROM_NUMBER = '01000000000';

    let payload;
    const restore = mockSolapi((_input, init) => {
      payload = JSON.parse(init.body);
      return Response.json({
        failedMessageList: [],
        count: { registeredSuccess: 1, registeredFailed: 0 },
      });
    });

    try {
      const created = await createBooking({ phone: '01018181818', seats: ['C05'] });
      const admin = await loginAdmin();
      await api(`/api/admin/bookings/${created.data.id}/confirm`, {
        method: 'POST',
        cookie: admin.cookie,
        body: {},
      });

      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0].to).toBe('01018181818');
      expect(payload.messages[0].type).toBe('SMS');
      expect(payload.messages[0].text).toMatch(/^즉새두 QR https:\/\/example.com\/#t=/);

      const token = payload.messages[0].text.split('#t=')[1];
      const link = await api('/api/ticket-link', { method: 'POST', body: { token } });
      expect(link.status).toBe(200);
      expect(link.data.tickets.map(ticket => ticket.seat)).toEqual(['C05']);

      const row = await env.DB.prepare('SELECT notification_status FROM bookings WHERE id=?').bind(created.data.id).first();
      expect(row.notification_status).toBe('accepted');
    } finally {
      restore();
    }
  });

  it('입금 확인되지 않은 예약은 티켓 링크로 열 수 없다', async () => {
    const token = 'A'.repeat(16);
    await seedBooking({
      phone: '01019191919',
      seats: ['C06'],
      status: 'pending',
      ticketAccessHash: await sha256Hex(token),
    });
    const link = await api('/api/ticket-link', { method: 'POST', body: { token } });
    expect(link.status).toBe(404);
  });

  it('잘못된 토큰은 404이다', async () => {
    const link = await api('/api/ticket-link', { method: 'POST', body: { token: 'not-a-real-token' } });
    expect(link.status).toBe(404);
  });

  it('문자 재전송은 실패한 확정 예약에만 가능하다', async () => {
    const created = await createBooking({ phone: '01020202020', seats: ['C07'] });
    const admin = await loginAdmin();
    await api(`/api/admin/bookings/${created.data.id}/confirm`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });

    const retry = await api(`/api/admin/bookings/${created.data.id}/retry-sms`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(retry.status).toBe(200);

    const pendingRetry = await api('/api/admin/bookings/STG-MISSING/retry-sms', {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(pendingRetry.status).toBe(404);
  });

  it('입금 대기가 아닌 예약은 입금 확인할 수 없다', async () => {
    const id = await seedBooking({ phone: '01021212121', seats: ['C08'], status: 'paid' });
    const admin = await loginAdmin();
    const confirmed = await api(`/api/admin/bookings/${id}/confirm`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(confirmed.status).toBe(404);
  });

  it('2분 넘게 sending이면 관리자 목록에서 uncertain으로 바꾼다', async () => {
    await seedBooking({
      id: 'STG-SEND01',
      phone: '01023232323',
      seats: ['C09'],
      status: 'paid',
      notificationStatus: 'sending',
      notificationUpdatedAt: Date.now() - 3 * 60 * 1000,
    });
    const admin = await loginAdmin();
    const list = await api('/api/admin/bookings?show=1', { cookie: admin.cookie });
    expect(list.status).toBe(200);
    const row = list.data.bookings.find(item => item.id === 'STG-SEND01');
    expect(row.notificationStatus).toBe('uncertain');
    expect(row.notificationErrorCode).toBe('DELIVERY_TIMEOUT');
  });
});
