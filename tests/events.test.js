import { describe, expect, it } from 'vitest';
import { api, createBooking, loginAdmin, seedBooking } from './helpers.js';

const draftEvent = {
  title: '테스트 공연',
  subtitle: '초안',
  description: '테스트용 공연입니다.',
  venue: '학관 104호',
  ticketPrice: 8000,
  sessions: [
    { dateLabel: '2026년 12월 1일', timeLabel: '오후 8시', startsAt: '2026-12-01T20:00:00+09:00' },
  ],
};

describe('공연 관리', () => {
  it('게시된 공연이 있으면 다른 초안을 게시할 수 없다', async () => {
    const admin = await loginAdmin();
    const created = await api('/api/admin/events', { method: 'POST', cookie: admin.cookie, body: draftEvent });
    expect(created.status).toBe(201);

    const published = await api(`/api/admin/events/${created.data.id}/publish`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(published.status).toBe(409);
    expect(published.data.error).toMatch(/이미 게시된 공연/);
  });

  it('공연을 복제하면 초안만 생기고 예약은 복사되지 않는다', async () => {
    await seedBooking({ phone: '01034343434', seats: ['F04'], status: 'paid' });
    const admin = await loginAdmin();
    const duplicated = await api('/api/admin/events/legacy-2026/duplicate', {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(duplicated.status).toBe(201);
    expect(duplicated.data.status).toBe('draft');

    const events = await api('/api/admin/events', { cookie: admin.cookie });
    const copy = events.data.events.find(item => item.id === duplicated.data.id);
    expect(copy.bookingCount).toBe(0);
    expect(copy.status).toBe('draft');
    expect(copy.sessions).toHaveLength(3);
  });

  it('공연 제목이 일치하지 않으면 삭제하지 않는다', async () => {
    const admin = await loginAdmin();
    const result = await api('/api/admin/events/legacy-2026', {
      method: 'DELETE',
      cookie: admin.cookie,
      body: { confirmation: '다른 제목' },
    });
    expect(result.status).toBe(400);

    const stillThere = await api('/api/event');
    expect(stillThere.data.event.id).toBe('legacy-2026');
  });

  it('공연을 삭제하면 그 공연의 예약도 함께 사라진다', async () => {
    const created = await createBooking({ phone: '01035353535', seats: ['F05'] });
    const admin = await loginAdmin();
    const deleted = await api('/api/admin/events/legacy-2026', {
      method: 'DELETE',
      cookie: admin.cookie,
      body: { confirmation: '즉흥적 새벽 2시' },
    });
    expect(deleted.status).toBe(200);

    const lookup = await api('/api/booking-lookup', {
      method: 'POST',
      body: { id: created.data.id, phone: '01035353535' },
    });
    expect(lookup.status).toBe(404);

    const event = await api('/api/event');
    expect(event.data.event).toBeNull();
  });

  it('예약이 있어도 날짜와 시간은 고칠 수 있고 회차 ID는 유지된다', async () => {
    await seedBooking({ phone: '01036363636', seats: ['F06'], status: 'pending' });
    const admin = await loginAdmin();
    const before = (await api('/api/event')).data.event;
    const updated = await api('/api/admin/events/legacy-2026', {
      method: 'PUT',
      cookie: admin.cookie,
      body: {
        title: before.title,
        subtitle: before.subtitle,
        description: before.description,
        venue: before.venue,
        ticketPrice: before.ticketPrice,
        sessions: before.sessions.map(() => ({
          dateLabel: '2026년 11월 21일 토요일',
          timeLabel: '오후 9시',
          startsAt: '2026-11-21T21:00:00+09:00',
        })),
      },
    });
    expect(updated.status).toBe(200);
    const after = (await api('/api/event')).data.event;
    expect(after.sessions.map(s => s.id)).toEqual(before.sessions.map(s => s.id));
    expect(after.sessions[0].timeLabel).toBe('오후 9시');
  });

  it('예약이 있는 공연은 티켓 가격과 회차 수를 바꿀 수 없다', async () => {
    await seedBooking({ phone: '01037373737', seats: ['F07'], status: 'pending' });
    const admin = await loginAdmin();
    const before = (await api('/api/event')).data.event;
    const priceChanged = await api('/api/admin/events/legacy-2026', {
      method: 'PUT',
      cookie: admin.cookie,
      body: {
        ...draftEvent,
        ticketPrice: before.ticketPrice + 1000,
        sessions: before.sessions.map(s => ({ dateLabel: s.dateLabel, timeLabel: s.timeLabel, startsAt: s.startsAt })),
      },
    });
    expect(priceChanged.status).toBe(409);
    expect(priceChanged.data.error).toMatch(/티켓 가격/);

    const countChanged = await api('/api/admin/events/legacy-2026', {
      method: 'PUT',
      cookie: admin.cookie,
      body: { ...draftEvent, ticketPrice: before.ticketPrice, sessions: before.sessions.slice(1).map(s => ({ dateLabel: s.dateLabel, timeLabel: s.timeLabel, startsAt: s.startsAt })) },
    });
    expect(countChanged.status).toBe(409);
    expect(countChanged.data.error).toMatch(/회차/);
  });

  it('초안 공연 회차는 관객이 예매할 수 없다', async () => {
    const admin = await loginAdmin();
    const created = await api('/api/admin/events', { method: 'POST', cookie: admin.cookie, body: draftEvent });
    const sessionId = `${created.data.id}-S01`;
    const seats = await api(`/api/seats?show=${encodeURIComponent(sessionId)}`);
    expect(seats.status).toBe(400);

    const booked = await createBooking({ showId: sessionId, seats: ['B01'] });
    expect(booked.status).toBe(400);
  });

  it('새로 게시한 공연의 티켓 가격이 예매 금액에 반영된다', async () => {
    const admin = await loginAdmin();
    const archived = await api('/api/admin/events/legacy-2026/archive', {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(archived.status).toBe(200);

    const created = await api('/api/admin/events', { method: 'POST', cookie: admin.cookie, body: draftEvent });
    const published = await api(`/api/admin/events/${created.data.id}/publish`, {
      method: 'POST',
      cookie: admin.cookie,
      body: {},
    });
    expect(published.status).toBe(200);

    const sessionId = `${created.data.id}-S01`;
    await api('/api/admin/settings', {
      method: 'POST',
      cookie: admin.cookie,
      body: { showId: sessionId, bookingOpen: true },
    });

    const booked = await createBooking({ showId: sessionId, seats: ['B01'] });
    expect(booked.status).toBe(201);
    expect(booked.data.amount).toBe(8000);
  });

  it('전체 초기화 API는 비활성화되어 있다', async () => {
    const admin = await loginAdmin();
    const result = await api('/api/admin/reset', { method: 'POST', cookie: admin.cookie, body: {} });
    expect(result.status).toBe(410);
  });
});
