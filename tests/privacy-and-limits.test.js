import { describe, expect, it } from 'vitest';
import { api, BOOKING_RETENTION_MS, createBooking, env, loginAdmin, runScheduledCleanup, seedBooking } from './helpers.js';

describe('개인정보 보관과 요청 제한', () => {
  it('보관 기간이 지난 취소·만료·환불 완료 예약은 삭제한다', async () => {
    const cutoff = Date.now() - BOOKING_RETENTION_MS - 1000;
    await seedBooking({
      id: 'STG-OLD001',
      phone: '01037373737',
      seats: ['G03'],
      status: 'cancelled',
      privacyDeleteAfter: cutoff,
    });
    await seedBooking({
      id: 'STG-OLD002',
      phone: '01038383838',
      seats: ['G04'],
      status: 'refunded',
      privacyDeleteAfter: cutoff,
    });

    await runScheduledCleanup();

    const cancelled = await env.DB.prepare('SELECT id FROM bookings WHERE id=?').bind('STG-OLD001').first();
    const refunded = await env.DB.prepare('SELECT id FROM bookings WHERE id=?').bind('STG-OLD002').first();
    expect(cancelled).toBeNull();
    expect(refunded).toBeNull();
  });

  it('환불 처리 중인 예약은 보관 기간이 지나도 삭제하지 않는다', async () => {
    await seedBooking({
      id: 'STG-KEEP01',
      phone: '01039393939',
      seats: ['G05'],
      status: 'refund_pending',
      privacyDeleteAfter: Date.now() - BOOKING_RETENTION_MS - 1000,
    });

    await runScheduledCleanup();

    const kept = await env.DB.prepare('SELECT id,status FROM bookings WHERE id=?').bind('STG-KEEP01').first();
    expect(kept.status).toBe('refund_pending');
  });

  it('같은 IP에서 예매를 21번째 요청하면 429가 난다', async () => {
    const ip = '203.0.113.90';
    let last;
    for (let i = 0; i < 21; i += 1) {
      const row = String.fromCharCode(66 + Math.floor(i / 12));
      const number = String((i % 12) + 1).padStart(2, '0');
      last = await createBooking({
        ip,
        phone: `0109${String(i).padStart(7, '0')}`,
        seats: [`${row}${number}`],
      });
    }
    expect(last.status).toBe(429);
    expect(last.data.error).toMatch(/요청이 많습니다/);
  });

  it('같은 IP에서 예약 조회를 9번째 하면 429가 난다', async () => {
    const ip = '203.0.113.91';
    let last;
    for (let i = 0; i < 9; i += 1) {
      last = await api('/api/booking-lookup', {
        method: 'POST',
        ip,
        body: { id: 'STG-NONE', phone: '01000000000' },
      });
    }
    expect(last.status).toBe(429);
    expect(last.data.error).toMatch(/조회 시도가 많습니다/);
  });

  it('공개 공연 조회는 개인정보를 포함하지 않는다', async () => {
    const result = await api('/api/event');
    expect(result.status).toBe(200);
    expect(result.data.event.title).toBe('즉흥적 새벽 2시');
    expect(JSON.stringify(result.data)).not.toMatch(/010\d{8}/);
  });

  it('관리자 로그인 없이는 예약 목록을 볼 수 없다', async () => {
    await seedBooking({ phone: '01040404040', seats: ['G06'], status: 'pending' });
    const result = await api('/api/admin/bookings?show=1');
    expect(result.status).toBe(401);
    await loginAdmin();
  });
});
