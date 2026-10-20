import { describe, expect, it } from 'vitest';
import { api, createBooking, loginAdmin, seedBooking, seatState } from './helpers.js';

describe('취소와 환불', () => {
  it('입금 대기 예약을 취소하면 좌석과 연락처 제한이 바로 풀린다', async () => {
    const created = await createBooking({ phone: '01024242424', seats: ['D02'] });
    const admin = await loginAdmin();
    const cancelled = await api(`/api/admin/bookings/${created.data.id}/cancel`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.status).toBe('cancelled');
    expect(await seatState('1', 'D02')).toBe('available');

    const again = await createBooking({ phone: '01024242424', seats: ['D03', 'D04'] });
    expect(again.status).toBe(201);
  });

  it('확정 예약을 취소하면 환불 대기가 되고 좌석은 아직 잡혀 있다', async () => {
    const id = await seedBooking({ phone: '01025252525', seats: ['D05'], status: 'paid' });
    const admin = await loginAdmin();
    const cancelled = await api(`/api/admin/bookings/${id}/cancel`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data.status).toBe('refund_pending');
    expect(await seatState('1', 'D05')).toBe('refund_pending');

    const taken = await createBooking({ phone: '01026262626', seats: ['D05'] });
    expect(taken.status).toBe(409);
  });

  it('환불 완료하면 좌석이 다시 열린다', async () => {
    const id = await seedBooking({ phone: '01027272727', seats: ['D06'], status: 'refund_pending' });
    const admin = await loginAdmin();
    const refunded = await api(`/api/admin/bookings/${id}/refund-complete`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(refunded.status).toBe(200);
    expect(refunded.data.status).toBe('refunded');
    expect(await seatState('1', 'D06')).toBe('available');

    const again = await createBooking({ phone: '01028282828', seats: ['D06'] });
    expect(again.status).toBe(201);
  });

  it('환불 대기가 아닌 예약은 환불 완료 처리할 수 없다', async () => {
    const id = await seedBooking({ phone: '01029292929', seats: ['D07'], status: 'paid' });
    const admin = await loginAdmin();
    const refunded = await api(`/api/admin/bookings/${id}/refund-complete`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(refunded.status).toBe(404);
  });
});
