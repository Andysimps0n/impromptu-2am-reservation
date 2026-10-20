import { describe, expect, it } from 'vitest';
import { api, createBooking, loginAdmin, seedBooking, seatState } from './helpers.js';

describe('관객 예매', () => {
  it('유효한 예매는 예약 코드와 금액을 만든다', async () => {
    const result = await createBooking({ seats: ['B01'] });
    expect(result.status).toBe(201);
    expect(result.data.id).toMatch(/^STG-[A-Z0-9]+$/);
    expect(result.data.seats).toEqual(['B01']);
    expect(result.data.amount).toBe(6500);
    expect(await seatState('1', 'B01')).toBe('held');
  });

  it('한 번에 2석을 예매하면 금액은 좌석 수 × 티켓 가격이다', async () => {
    const result = await createBooking({ seats: ['B02', 'B03'] });
    expect(result.status).toBe(201);
    expect(result.data.amount).toBe(13000);
    expect(result.data.seats).toEqual(['B02', 'B03']);
  });

  it('같은 연락처는 회차당 최대 2석만 예매할 수 있다', async () => {
    const first = await createBooking({ phone: '01022223333', seats: ['B04', 'B05'] });
    expect(first.status).toBe(201);

    const third = await createBooking({ phone: '01022223333', seats: ['B06'] });
    expect(third.status).toBe(429);
    expect(third.data.error).toMatch(/최대 2석/);
    expect(await seatState('1', 'B06')).toBe('available');
  });

  it('한 요청에서 3석을 고르면 거절한다', async () => {
    const result = await createBooking({ seats: ['B07', 'B08', 'B09'] });
    expect(result.status).toBe(400);
    expect(result.data.error).toMatch(/최대 2석/);
  });

  it('이미 잡힌 좌석은 다른 사람이 예매할 수 없다', async () => {
    const first = await createBooking({ phone: '01033334444', seats: ['C01'] });
    expect(first.status).toBe(201);

    const second = await createBooking({ phone: '01033335555', seats: ['C01'] });
    expect(second.status).toBe(409);
    expect(second.data.error).toMatch(/이미 예약된 좌석/);
  });

  it('같은 좌석을 동시에 예매하면 하나만 성공한다', async () => {
    const [first, second] = await Promise.all([
      createBooking({ phone: '01033336666', seats: ['C02'], ip: '203.0.113.30' }),
      createBooking({ phone: '01033337777', seats: ['C02'], ip: '203.0.113.31' }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('A열 운영진 보유석은 예매할 수 없다', async () => {
    const result = await createBooking({ seats: ['A01'] });
    expect(result.status).toBe(400);
    expect(result.data.error).toMatch(/A열/);
  });

  it('존재하지 않는 좌석은 예매할 수 없다', async () => {
    const missing = await createBooking({ seats: ['Z01'] });
    expect(missing.status).toBe(400);

    const extraL = await createBooking({ seats: ['L09'] });
    expect(extraL.status).toBe(400);
  });

  it('예매 접수가 닫혀 있으면 423을 반환한다', async () => {
    const admin = await loginAdmin();
    const closed = await api('/api/admin/settings', {
      method: 'POST',
      cookie: admin.cookie,
      body: { showId: '1', bookingOpen: false },
    });
    expect(closed.status).toBe(200);

    const result = await createBooking({ seats: ['D01'] });
    expect(result.status).toBe(423);
    expect(result.data.error).toMatch(/예매 접수 기간/);
  });

  it('다른 회차에서는 같은 연락처로 다시 2석을 예매할 수 있다', async () => {
    const show1 = await createBooking({ phone: '01044445555', showId: '1', seats: ['E01', 'E02'] });
    const show2 = await createBooking({ phone: '01044445555', showId: '2', seats: ['E01', 'E02'] });
    expect(show1.status).toBe(201);
    expect(show2.status).toBe(201);
  });

  it('연락처가 10~11자리 숫자가 아니면 거절한다', async () => {
    const result = await createBooking({ phone: '010-12', seats: ['F01'] });
    expect(result.status).toBe(400);
    expect(result.data.error).toMatch(/연락처/);
  });

  it('이름이나 입금자명이 없으면 거절한다', async () => {
    const noName = await createBooking({ name: '  ', seats: ['F02'] });
    expect(noName.status).toBe(400);

    const noPayer = await createBooking({ payer: '', seats: ['F03'] });
    expect(noPayer.status).toBe(400);
  });

  it('예약 코드와 연락처가 맞으면 조회되고 전화번호는 마스킹된다', async () => {
    const created = await createBooking({ phone: '01056781234', seats: ['G01'] });
    const lookup = await api('/api/booking-lookup', {
      method: 'POST',
      body: { id: created.data.id, phone: '01056781234' },
    });
    expect(lookup.status).toBe(200);
    expect(lookup.data.id).toBe(created.data.id);
    expect(lookup.data.phone).toBe('010-****-1234');
    expect(lookup.data.seats).toEqual(['G01']);
  });

  it('연락처가 다르면 예약을 조회할 수 없다', async () => {
    const created = await createBooking({ phone: '01088889999', seats: ['G02'] });
    const lookup = await api('/api/booking-lookup', {
      method: 'POST',
      body: { id: created.data.id, phone: '01000000000' },
    });
    expect(lookup.status).toBe(404);
  });

  it('입금 확인된 좌석은 sold, 환불 대기 좌석은 refund_pending으로 보인다', async () => {
    await seedBooking({ id: 'STG-SOLD01', phone: '01010101010', seats: ['H01'], status: 'paid' });
    await seedBooking({ id: 'STG-REF001', phone: '01010101011', seats: ['H02'], status: 'refund_pending' });
    expect(await seatState('1', 'H01')).toBe('sold');
    expect(await seatState('1', 'H02')).toBe('refund_pending');
  });
});
