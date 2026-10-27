import { describe, expect, it } from 'vitest';
import { api, createBooking, seedBooking } from './helpers.js';

const DORM_CODE = /^(장기려|카이퍼|로뎀|벧엘) (\d{3})호$/;

describe('기숙사 호실 예약 코드', () => {
  it('새 예약은 기숙사 이름과 101~501호 코드를 받는다', async () => {
    for (let index = 0; index < 20; index += 1) {
      const result = await createBooking({ seats: [`${index < 12 ? 'D' : 'E'}${String((index % 12) + 1).padStart(2, '0')}`], phone: `0105555${String(1000 + index)}`, ip: `198.51.100.${index + 1}` });
      expect(result.status).toBe(201);
      expect(result.data.id).toMatch(/^STG-[A-Z0-9]+$/);
      const match = result.data.code.match(DORM_CODE);
      expect(match).not.toBeNull();
      const room = Number(match[2]);
      expect(room).toBeGreaterThanOrEqual(101);
      expect(room).toBeLessThanOrEqual(501);
    }
  });

  it('코드와 연락처로 조회하고, 띄어쓰기가 달라도 찾는다', async () => {
    const created = await createBooking({ seats: ['E01'], phone: '01077778888' });
    expect(created.status).toBe(201);
    const code = created.data.code;
    for (const typed of [code, code.replace(/\s+/g, ''), ` ${code.replace(' ', '  ')} `]) {
      const found = await api('/api/booking-lookup', { method: 'POST', body: { id: typed, phone: '010-7777-8888' } });
      expect(found.status).toBe(200);
      expect(found.data.id).toBe(created.data.id);
      expect(found.data.code).toBe(code);
    }
    const wrongPhone = await api('/api/booking-lookup', { method: 'POST', body: { id: code, phone: '01000000000' } });
    expect(wrongPhone.status).toBe(404);
  });

  it('기존 STG 코드 예약도 그대로 조회된다', async () => {
    await seedBooking({ id: 'STG-LEGACY01', phone: '01012341234', seats: ['F01'] });
    const found = await api('/api/booking-lookup', { method: 'POST', body: { id: 'stg-legacy01', phone: '010-1234-1234' } });
    expect(found.status).toBe(200);
    expect(found.data.id).toBe('STG-LEGACY01');
    expect(found.data.code).toBe('STG-LEGACY01');
  });
});
