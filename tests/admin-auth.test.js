import { describe, expect, it } from 'vitest';
import { api, loginAdmin, TEST_ADMIN } from './helpers.js';

describe('관리자 인증', () => {
  it('로그인하지 않으면 관리자 API를 쓸 수 없다', async () => {
    const result = await api('/api/admin/bookings?show=1');
    expect(result.status).toBe(401);
  });

  it('틀린 비밀번호는 401이다', async () => {
    const result = await loginAdmin({ password: 'wrong-password' });
    expect(result.status).toBe(401);
    expect(result.cookie).toBe('');
  });

  it('맞는 계정으로 로그인하면 세션 쿠키가 생긴다', async () => {
    const result = await loginAdmin();
    expect(result.status).toBe(200);
    expect(result.data.authenticated).toBe(true);
    expect(result.cookie).toMatch(/^stage_admin=/);

    const session = await api('/api/admin/session', { cookie: result.cookie });
    expect(session.data.authenticated).toBe(true);
  });

  it('비밀번호를 바꾸면 기존 세션이 끊기고 새 비밀번호로만 로그인된다', async () => {
    const first = await loginAdmin();
    const changed = await api('/api/admin/password', {
      method: 'POST',
      cookie: first.cookie,
      body: { currentPassword: TEST_ADMIN.password, newPassword: 'new-admin-pass-1' },
    });
    expect(changed.status).toBe(200);

    const oldSession = await api('/api/admin/session', { cookie: first.cookie });
    expect(oldSession.data.authenticated).toBe(false);

    const oldPassword = await loginAdmin();
    expect(oldPassword.status).toBe(401);

    const next = await loginAdmin({ password: 'new-admin-pass-1' });
    expect(next.status).toBe(200);
  });

  it('같은 IP에서 로그인을 6번 시도하면 429가 난다', async () => {
    const ip = '192.0.2.80';
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await loginAdmin({ username: 'not-the-admin', password: 'nope', ip });
    }
    expect(last.status).toBe(429);
    expect(last.data.error).toMatch(/10분/);
  });

  it('로그아웃하면 그 세션으로는 관리자 API를 쓸 수 없다', async () => {
    const admin = await loginAdmin();
    const logout = await api('/api/admin/logout', { method: 'POST', cookie: admin.cookie, body: {} });
    expect(logout.status).toBe(200);

    const bookings = await api('/api/admin/bookings?show=1', { cookie: admin.cookie });
    expect(bookings.status).toBe(401);
  });
});
