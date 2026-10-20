import { describe, expect, it } from 'vitest';
import { api, loginAdmin, seedBooking } from './helpers.js';

const ticketId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('입장 확인', () => {
  it('유효한 티켓은 한 번만 입장 처리된다', async () => {
    await seedBooking({
      id: 'STG-CHK001',
      phone: '01030303030',
      seats: ['E03'],
      status: 'paid',
      tickets: [{ id: ticketId, seat: 'E03' }],
    });
    const admin = await loginAdmin();
    const first = await api('/api/admin/tickets/check-in', {
      method: 'POST',
      cookie: admin.cookie,
      body: { ticketId, showId: '1' },
    });
    expect(first.status).toBe(200);
    expect(first.data.checkedIn).toBe(true);
    expect(first.data.ticket.seat).toBe('E03');

    const second = await api('/api/admin/tickets/check-in', {
      method: 'POST',
      cookie: admin.cookie,
      body: { ticketId, showId: '1' },
    });
    expect(second.status).toBe(409);
    expect(second.data.alreadyCheckedIn).toBe(true);
  });

  it('예약 코드와 좌석으로도 입장할 수 있다', async () => {
    await seedBooking({
      id: 'STG-CHK002',
      phone: '01031313131',
      seats: ['E04'],
      status: 'paid',
      tickets: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', seat: 'E04' }],
    });
    const admin = await loginAdmin();
    const result = await api('/api/admin/tickets/check-in', {
      method: 'POST',
      cookie: admin.cookie,
      body: { bookingId: 'STG-CHK002', seat: 'E04', showId: '1' },
    });
    expect(result.status).toBe(200);
    expect(result.data.ticket.seat).toBe('E04');
  });

  it('취소되었거나 확정되지 않은 예약의 티켓은 입장할 수 없다', async () => {
    await seedBooking({
      id: 'STG-CHK003',
      phone: '01032323232',
      seats: ['E05'],
      status: 'refund_pending',
      tickets: [{ id: 'cccccccccccccccccccccccccccccccc', seat: 'E05' }],
    });
    const admin = await loginAdmin();
    const result = await api('/api/admin/tickets/check-in', {
      method: 'POST',
      cookie: admin.cookie,
      body: { ticketId: 'cccccccccccccccccccccccccccccccc', showId: '1' },
    });
    expect(result.status).toBe(409);
    expect(result.data.error).toMatch(/취소되었거나 확정되지 않은/);
  });

  it('다른 회차 티켓은 입장할 수 없다', async () => {
    await seedBooking({
      id: 'STG-CHK004',
      phone: '01033333331',
      seats: ['E06'],
      status: 'paid',
      showId: '2',
      tickets: [{ id: 'dddddddddddddddddddddddddddddddd', seat: 'E06' }],
    });
    const admin = await loginAdmin();
    const result = await api('/api/admin/tickets/check-in', {
      method: 'POST',
      cookie: admin.cookie,
      body: { ticketId: 'dddddddddddddddddddddddddddddddd', showId: '1' },
    });
    expect(result.status).toBe(409);
    expect(result.data.error).toMatch(/다른 공연/);
  });
});
