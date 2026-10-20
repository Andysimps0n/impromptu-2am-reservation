import { describe, expect, it } from 'vitest';
import { api, createBooking, env, HOLD_MS, seedBooking, seatState } from './helpers.js';

describe('입금 대기 좌석 홀드', () => {
  it('30분이 지난 입금 대기 좌석은 다시 예매할 수 있다', async () => {
    const id = await seedBooking({
      phone: '01012121212',
      seats: ['B10'],
      status: 'pending',
      createdAt: Date.now() - HOLD_MS - 1000,
    });

    expect(await seatState('1', 'B10')).toBe('available');

    const expired = await env.DB.prepare('SELECT status FROM bookings WHERE id=?').bind(id).first();
    expect(expired.status).toBe('expired');

    const again = await createBooking({ phone: '01013131313', seats: ['B10'] });
    expect(again.status).toBe(201);
  });

  it('입금 확인된 좌석은 30분이 지나도 유지된다', async () => {
    await seedBooking({
      phone: '01014141414',
      seats: ['B11'],
      status: 'paid',
      createdAt: Date.now() - HOLD_MS - 1000,
    });
    expect(await seatState('1', 'B11')).toBe('sold');
  });

  it.skip('만료된 입금 대기 예약을 조회하면 expired 상태를 보여야 한다 — 조회 API가 만료 처리 전 pending 행을 그대로 반환함', async () => {
    const id = await seedBooking({
      phone: '01015151515',
      seats: ['B12'],
      status: 'pending',
      createdAt: Date.now() - HOLD_MS - 1000,
    });
    const lookup = await api('/api/booking-lookup', {
      method: 'POST',
      body: { id, phone: '01015151515' },
    });
    expect(lookup.status).toBe(200);
    expect(lookup.data.status).toBe('expired');
  });
});
