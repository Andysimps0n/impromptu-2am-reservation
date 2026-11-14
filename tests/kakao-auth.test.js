import { afterEach, describe, expect, it } from 'vitest';
import { api, env } from './helpers.js';

const KAKAO_REDIRECT = 'https://example.com/auth/kakao/callback';

function useKakaoEnv(overrides = {}) {
  env.KAKAO_REST_API_KEY = 'test-rest-api-key';
  env.KAKAO_CLIENT_SECRET = '';
  env.KAKAO_REDIRECT_URI = KAKAO_REDIRECT;
  env.ADMIN_KAKAO_IDS = '1001';
  env.REQUIRE_KAKAO_BOOKING = '';
  Object.assign(env, overrides);
}

function setCookieHeader(response) {
  return response.headers.getSetCookie?.() || [];
}

function cookiePair(response, name) {
  const raw = setCookieHeader(response).find(item => item.startsWith(`${name}=`)) || '';
  const value = new RegExp(`^${name}=([^;]*)`).exec(raw)?.[1] || '';
  return { raw, value, header: value ? `${name}=${value}` : '' };
}

function mockKakao({ kakaoId, nickname = '테스터', accessToken = 'kakao-access-token' }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    if (url.startsWith('https://kauth.kakao.com/oauth/token')) {
      const params = init.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init.body || ''));
      if (params.get('grant_type') !== 'authorization_code' || params.get('code') !== 'test-code') {
        return new Response('{}', { status: 400 });
      }
      if (params.get('client_id') !== env.KAKAO_REST_API_KEY) return new Response('{}', { status: 401 });
      if (env.KAKAO_CLIENT_SECRET && params.get('client_secret') !== env.KAKAO_CLIENT_SECRET) {
        return new Response('{}', { status: 401 });
      }
      return Response.json({ access_token: accessToken, token_type: 'bearer' });
    }
    if (url.startsWith('https://kapi.kakao.com/v2/user/me')) {
      const authorization = new Headers(init.headers || {}).get('authorization');
      if (authorization !== `Bearer ${accessToken}`) return new Response('unauthorized', { status: 401 });
      // Keep the member id as digits in the raw body. JSON.stringify would round big integers.
      const body = `{"id":${kakaoId},"properties":{"nickname":${JSON.stringify(nickname)}},"kakao_account":{"profile":{"nickname":${JSON.stringify(nickname)}}}}`;
      return new Response(body, { headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`테스트가 카카오가 아닌 주소에 접근했습니다: ${url}`);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

async function beginKakaoLogin({ next = 'admin', ip = '198.51.100.40' } = {}) {
  const start = await api(`/auth/kakao/login?next=${next}`, { ip });
  const state = cookiePair(start, 'kakao_oauth_state');
  return { start, state };
}

async function finishKakaoLogin({ kakaoId, nickname, stateValue, ip = '198.51.100.40', code = 'test-code' }) {
  const kakao = mockKakao({ kakaoId, nickname });
  try {
    const callback = await api(`/auth/kakao/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(stateValue.split('.')[0])}`, {
      ip,
      cookie: `kakao_oauth_state=${stateValue}`,
    });
    const session = cookiePair(callback, 'stage_admin');
    return { callback, session, calls: kakao.calls };
  } finally {
    kakao.restore();
  }
}

async function loginWithKakao({ kakaoId = '1001', nickname = '운영자', next = 'admin', ip = '198.51.100.40' } = {}) {
  const { start, state } = await beginKakaoLogin({ next, ip });
  const done = await finishKakaoLogin({ kakaoId, nickname, stateValue: state.value, ip });
  return { ...done, start, state };
}

afterEach(() => {
  env.KAKAO_REST_API_KEY = '';
  env.KAKAO_CLIENT_SECRET = '';
  env.KAKAO_REDIRECT_URI = '';
  env.ADMIN_KAKAO_IDS = '';
  env.REQUIRE_KAKAO_BOOKING = '';
  env.ADMIN_PASSWORD_LOGIN = '1';
});

describe('카카오 로그인', () => {
  it('키가 없으면 어떤 값이 빠져 있는지 알려 주고 로그인 화면으로 보내지 않는다', async () => {
    env.KAKAO_REST_API_KEY = '';
    env.KAKAO_REDIRECT_URI = '';
    const result = await api('/auth/kakao/login?next=admin');
    expect(result.status).toBe(503);
    expect(result.data.error).toMatch(/KAKAO_REST_API_KEY/);
    expect(result.data.error).toMatch(/KAKAO_REDIRECT_URI/);
  });

  it('state가 다르면 카카오에 토큰 요청을 하지 않고 거절한다', async () => {
    useKakaoEnv();
    const { state } = await beginKakaoLogin();
    const kakao = mockKakao({ kakaoId: '1001' });
    try {
      const callback = await api('/auth/kakao/callback?code=test-code&state=not-the-state', {
        cookie: `kakao_oauth_state=${state.value}`,
      });
      expect(callback.status).toBe(400);
      expect(callback.data.error).toMatch(/상태값/);
      expect(cookiePair(callback, 'stage_admin').value).toBe('');
      expect(kakao.calls).toEqual([]);
    } finally {
      kakao.restore();
    }
  });

  it('state 쿠키가 없으면 콜백을 거절한다', async () => {
    useKakaoEnv();
    const kakao = mockKakao({ kakaoId: '1001' });
    try {
      const callback = await api('/auth/kakao/callback?code=test-code&state=abc');
      expect(callback.status).toBe(400);
      expect(kakao.calls).toEqual([]);
    } finally {
      kakao.restore();
    }
  });

  it('화이트리스트에 있는 회원번호만 관리자 API를 쓸 수 있다', async () => {
    useKakaoEnv();
    const admin = await loginWithKakao({ kakaoId: '1001', nickname: '운영자', ip: '198.51.100.41' });
    expect(admin.callback.status).toBe(302);
    expect(admin.callback.headers.get('location')).toBe('/admin');
    expect(admin.session.raw).toMatch(/HttpOnly/);
    expect(admin.session.raw).toMatch(/Secure/);
    expect(admin.session.raw).toMatch(/SameSite=Lax/);
    expect(admin.state.raw).toMatch(/SameSite=Lax/);

    const bookings = await api('/api/admin/bookings?show=1', { cookie: admin.session.header });
    expect(bookings.status).toBe(200);

    const outsider = await loginWithKakao({ kakaoId: '2002', nickname: '관객', ip: '198.51.100.42' });
    expect(outsider.callback.headers.get('location')).toBe('/admin?auth_error=not_admin');
    const denied = await api('/api/admin/bookings?show=1', { cookie: outsider.session.header });
    expect(denied.status).toBe(403);
    const session = await api('/api/admin/session', { cookie: outsider.session.header });
    expect(session.data.authenticated).toBe(false);
    expect(session.data.forbidden).toBe(true);
  });

  it('세션 쿠키가 없으면 관리자 API를 거절한다', async () => {
    const result = await api('/api/admin/events');
    expect(result.status).toBe(401);
  });

  it('로그아웃하면 그 세션만 무효가 되고, 모든 기기 로그아웃은 같은 계정의 세션을 모두 지운다', async () => {
    useKakaoEnv();
    const first = await loginWithKakao({ ip: '198.51.100.51' });
    const second = await loginWithKakao({ ip: '198.51.100.52' });
    const before = await api('/api/admin/bookings?show=1', { cookie: second.session.header });
    expect(before.status).toBe(200);

    const logout = await api('/api/auth/logout', { method: 'POST', cookie: first.session.header, body: {} });
    expect(logout.status).toBe(200);
    expect(cookiePair(logout, 'stage_admin').raw).toMatch(/Max-Age=0/);
    expect((await api('/api/admin/bookings?show=1', { cookie: first.session.header })).status).toBe(401);
    expect((await api('/api/admin/bookings?show=1', { cookie: second.session.header })).status).toBe(200);

    const third = await loginWithKakao({ ip: '198.51.100.53' });
    const logoutAll = await api('/api/auth/logout-all', { method: 'POST', cookie: second.session.header, body: {} });
    expect(logoutAll.status).toBe(200);
    expect((await api('/api/admin/bookings?show=1', { cookie: second.session.header })).status).toBe(401);
    expect((await api('/api/admin/bookings?show=1', { cookie: third.session.header })).status).toBe(401);
  });

  it('회원번호는 JSON 숫자로 파싱하지 않고 원문 그대로 저장한다', async () => {
    const kakaoId = '9007199254740993';
    useKakaoEnv({ ADMIN_KAKAO_IDS: kakaoId });
    const admin = await loginWithKakao({ kakaoId, ip: '198.51.100.61' });
    expect((await api('/api/admin/bookings?show=1', { cookie: admin.session.header })).status).toBe(200);
    const row = await env.DB.prepare('SELECT kakao_id, role FROM users WHERE kakao_id = ?').bind(kakaoId).first();
    expect(row.kakao_id).toBe(kakaoId);
    expect(row.role).toBe('admin');
  });

  it('클라이언트 시크릿은 인가 주소에 넣지 않고 토큰 교환에만 보낸다', async () => {
    useKakaoEnv({ KAKAO_CLIENT_SECRET: 'test-client-secret' });
    const admin = await loginWithKakao({ ip: '198.51.100.62' });
    const location = admin.start.headers.get('location');
    expect(location.startsWith('https://kauth.kakao.com/oauth/authorize?')).toBe(true);
    expect(location).not.toContain('test-client-secret');
    const tokenCall = admin.calls.find(call => call.url.startsWith('https://kauth.kakao.com/oauth/token'));
    expect(tokenCall.init.body.get('client_secret')).toBe('test-client-secret');
  });

  it('비밀번호 로그인 플래그가 꺼지면 기존 로그인 API를 거절한다', async () => {
    env.ADMIN_PASSWORD_LOGIN = '0';
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: { username: 'test-admin', password: 'test-admin-password' },
    });
    expect(result.status).toBe(403);
    expect(result.data.error).toMatch(/카카오 로그인/);
  });

  it('예매 로그인 플래그가 켜지면 카카오 계정마다 회차당 4석까지만 예매된다', async () => {
    useKakaoEnv({ REQUIRE_KAKAO_BOOKING: '1', ADMIN_KAKAO_IDS: '3003,3004' });
    const anonymous = await api('/api/bookings', {
      method: 'POST',
      ip: '203.0.113.70',
      body: { showId: '1', name: '김관객', phone: '01011112222', payer: '김입금', seats: ['C01'] },
    });
    expect(anonymous.status).toBe(401);

    const first = await loginWithKakao({ kakaoId: '3003', next: 'booking', ip: '198.51.100.71' });
    expect(first.callback.headers.get('location')).toBe('/booking/seats');
    const held = await api('/api/bookings', {
      method: 'POST',
      ip: '203.0.113.71',
      cookie: first.session.header,
      body: { showId: '1', name: '김관객', phone: '01033334444', payer: '김입금', seats: ['D01', 'D02', 'D03', 'D04'] },
    });
    expect(held.status).toBe(201);
    const over = await api('/api/bookings', {
      method: 'POST',
      ip: '203.0.113.72',
      cookie: first.session.header,
      body: { showId: '1', name: '김관객', phone: '01033335555', payer: '김입금', seats: ['D05'] },
    });
    expect(over.status).toBe(429);
    expect(over.data.error).toMatch(/카카오 계정/);

    const second = await loginWithKakao({ kakaoId: '3004', next: 'booking', ip: '198.51.100.72' });
    const otherAccount = await api('/api/bookings', {
      method: 'POST',
      ip: '203.0.113.73',
      cookie: second.session.header,
      body: { showId: '1', name: '이관객', phone: '01044445555', payer: '이입금', seats: ['D05'] },
    });
    expect(otherAccount.status).toBe(201);
  });
});
