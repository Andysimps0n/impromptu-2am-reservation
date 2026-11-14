const INDEX_HTML = __INDEX_HTML__;
const PRIVACY_HTML = __PRIVACY_HTML__;
const APP_JS = __APP_JS__;
const SITE_CSS = __SITE_CSS__;
const LOGO_PNG = __LOGO_PNG__;
const HERO_LOGO_PNG = __HERO_LOGO_PNG__;
const INSTRUMENTS_PNG = __INSTRUMENTS_PNG__;
const POSTER_BACKGROUND_JPG = __POSTER_BACKGROUND_JPG__;
const PRICE = 6500;
const HOLD_MS = 30 * 60 * 1000;
const BOOKING_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ROWS = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
const ALL_SEATS = ROWS.flatMap(row => Array.from({ length: row === 'L' ? 8 : 12 }, (_, i) => `${row}${String(i + 1).padStart(2, '0')}`));
const RESERVED = new Set(ALL_SEATS.filter(seat => seat.startsWith('A')));
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(self)',
};

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
const readCookie = (request, name) => new RegExp(`(?:^|; )${name}=([^;]*)`).exec(request.headers.get('cookie') || '')?.[1] || '';
const cookieToken = request => readCookie(request, 'stage_admin');
const normalizePhone = value => String(value || '').replace(/\D/g, '');
const maskPhone = phone => phone.replace(/^(\d{3})\d+(\d{4})$/, '$1-****-$2');
const formatPhone = phone => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits || String(phone || '');
};
const safeEqual = (a, b) => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};
// Cloudflare Workers currently limits WebCrypto PBKDF2 to 100,000 iterations.
const PASSWORD_ITERATIONS = 100000;
const bytesToHex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const derivePasswordHash = async (password, salt, iterations = PASSWORD_ITERATIONS) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(salt.match(/.{2}/g), byte => parseInt(byte, 16)), iterations, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
};
const setAdminPassword = async (db, password) => {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePasswordHash(password, salt);
  await db.prepare(`INSERT INTO admin_credentials(id,salt,password_hash,iterations,updated_at) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,iterations=excluded.iterations,updated_at=excluded.updated_at`)
    .bind(salt,hash,PASSWORD_ITERATIONS,Date.now()).run();
};
const verifyAdminPassword = async (db, env, password) => {
  const credential = await db.prepare('SELECT salt,password_hash,iterations FROM admin_credentials WHERE id=1').first();
  if (!credential) return Boolean(env.ADMIN_PASSWORD) && safeEqual(password, String(env.ADMIN_PASSWORD));
  const hash = await derivePasswordHash(password, credential.salt, credential.iterations);
  return safeEqual(hash, credential.password_hash);
};
const tokenHash = async token => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
const requestKeyHash = async (action, request) => tokenHash(`${action}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
const consumeRateLimit = async (db, request, action, limit, windowMs) => {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const keyHash = await requestKeyHash(action, request);
  const row = await db.prepare(`INSERT INTO request_rate_limits(action,key_hash,window_start,request_count)
    VALUES(?,?,?,1) ON CONFLICT(action,key_hash,window_start)
    DO UPDATE SET request_count=MIN(request_count+1,?) RETURNING request_count`).bind(action,keyHash,windowStart,limit + 1).first();
  return Number(row?.request_count || 0) <= limit;
};
const LOOKUP_WORDS = ['든든', '따스', '맘스', '라운지', '에인트'];
const randomInt = max => {
  // Rejection sampling keeps crypto.getRandomValues uniform over 0..max-1.
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
};
// 예: 든든919, 맘스471. 단어 5개 × 1~999.
const createLookupCode = () => `${LOOKUP_WORDS[randomInt(LOOKUP_WORDS.length)]}${1 + randomInt(999)}`;
const normalizeLookupCode = value => {
  const compact = String(value || '').replace(/\s+/g, '');
  const word = compact.match(/^(든든|따스|맘스|라운지|에인트)0*(\d{1,3})$/);
  if (word) {
    const number = Number(word[2]);
    if (number >= 1 && number <= 999) return { lookupCode: `${word[1]}${number}` };
  }
  // 예전 기숙사 호실 코드(장기려 402호)로 받은 예약도 그대로 찾는다.
  const dorm = compact.match(/^(장기려|카이퍼|로뎀|벧엘)(\d{3})호?$/);
  if (dorm) return { lookupCode: `${dorm[1]} ${dorm[2]}호` };
  return { id: compact.toUpperCase() };
};
const createTicketAccessToken = () => {
  // 96-bit random bearer token keeps the branded link within the 90-byte SMS limit.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const readBody = async request => {
  const text = await request.text();
  if (text.length > 12000) { const error = new Error('요청이 너무 큽니다.'); error.status = 413; throw error; }
  try { return JSON.parse(text || '{}'); }
  catch { const error = new Error('요청 형식을 확인해주세요.'); error.status = 400; throw error; }
};
const bookingRow = async (db, row) => {
  const session = await db.prepare(`SELECT e.title,e.subtitle,e.venue,s.sort_order,s.date_label,s.time_label
    FROM event_sessions s JOIN events e ON e.id=s.event_id WHERE s.id=?`).bind(row.show_id || '1').first();
  return ({
  id: row.id, code: row.lookup_code || row.id, showId: row.show_id || '1', name: row.name, phone: maskPhone(row.phone), payer: row.payer,
  eventTitle: session?.title || '', subtitle: session?.subtitle || '', venue: session?.venue || '',
  showNumber: session?.sort_order || 1, dateLabel: session?.date_label || '', timeLabel: session?.time_label || '',
  seats: (await db.prepare('SELECT seat FROM booking_seats WHERE booking_id=? ORDER BY seat').bind(row.id).all()).results.map(x => x.seat),
  tickets: row.status === 'paid' ? (await db.prepare('SELECT id,seat,status,checked_in_at FROM tickets WHERE booking_id=? ORDER BY seat').bind(row.id).all()).results.map(ticket => ({ id: ticket.id, seat: ticket.seat, status: ticket.status, checkedInAt: ticket.checked_in_at })) : [],
  amount: row.amount, status: row.status, createdAt: row.created_at,
  notificationStatus: row.notification_status || 'untracked',
  notificationAttempts: row.notification_attempts || 0,
  notificationErrorCode: row.notification_error_code || '',
  notificationUpdatedAt: row.notification_updated_at || null,
  });
};
const adminBookingRows = async (db, rows, showId) => {
  const [seatResult, ticketResult, session] = await Promise.all([
    db.prepare(`SELECT s.booking_id,s.seat FROM booking_seats s JOIN bookings b ON b.id=s.booking_id
      WHERE b.show_id=? ORDER BY s.seat`).bind(showId).all(),
    db.prepare(`SELECT t.booking_id,t.id,t.seat,t.status,t.checked_in_at FROM tickets t
      JOIN bookings b ON b.id=t.booking_id WHERE b.show_id=? AND b.status='paid' ORDER BY t.seat`).bind(showId).all(),
    getEventForSession(db, showId),
  ]);
  const seatsByBooking = new Map();
  for (const item of seatResult.results) {
    if (!seatsByBooking.has(item.booking_id)) seatsByBooking.set(item.booking_id, []);
    seatsByBooking.get(item.booking_id).push(item.seat);
  }
  const ticketsByBooking = new Map();
  for (const item of ticketResult.results) {
    if (!ticketsByBooking.has(item.booking_id)) ticketsByBooking.set(item.booking_id, []);
    ticketsByBooking.get(item.booking_id).push({ id: item.id, seat: item.seat, status: item.status, checkedInAt: item.checked_in_at });
  }
  return rows.map(row => ({
    id: row.id, code: row.lookup_code || row.id, showId: row.show_id || '1', name: row.name, phone: formatPhone(row.phone), payer: row.payer,
    eventTitle: session?.title || '', venue: session?.venue || '', showNumber: session?.sort_order || 1,
    dateLabel: session?.date_label || '', timeLabel: session?.time_label || '',
    seats: seatsByBooking.get(row.id) || [], tickets: row.status === 'paid' ? ticketsByBooking.get(row.id) || [] : [],
    amount: row.amount, status: row.status, createdAt: row.created_at,
    notificationStatus: row.notification_status || 'untracked', notificationAttempts: row.notification_attempts || 0,
    notificationErrorCode: row.notification_error_code || '', notificationUpdatedAt: row.notification_updated_at || null,
  }));
};
const LOCAL_PASSWORD_USER = 'local-password-admin';
const LOCAL_PASSWORD_KAKAO_ID = 'local:password';
const SESSION_SECONDS = 8 * 60 * 60;

const flagOn = value => value === '1' || value === 'true';
const kakaoAdminIds = env => new Set(String(env.ADMIN_KAKAO_IDS || '').split(',').map(item => item.trim()).filter(item => /^\d+$/.test(item)));
const sessionCookie = (token, maxAge = SESSION_SECONDS) => `stage_admin=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
const clearSessionCookie = () => sessionCookie('', 0);
const stateCookie = value => `kakao_oauth_state=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
const clearStateCookie = () => 'kakao_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
const authNext = value => (value === 'booking' ? 'booking' : 'admin');
const wantsPage = request => (request.headers.get('accept') || '').includes('text/html');
const cleanNickname = value => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);

const kakaoSettings = env => {
  const restKey = String(env.KAKAO_REST_API_KEY || '').trim();
  const redirectUri = String(env.KAKAO_REDIRECT_URI || '').trim();
  const clientSecret = String(env.KAKAO_CLIENT_SECRET || '').trim();
  const redirectOk = /^https:\/\/[^/\s]+\/auth\/kakao\/callback$/.test(redirectUri)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/auth\/kakao\/callback$/.test(redirectUri);
  return { restKey, redirectUri, clientSecret, ready: Boolean(restKey && redirectOk) };
};

// 화면 라우팅은 브라우저(react-router)가 맡는다. 이 경로들은 모두 같은 index.html을 돌려준다.
const SPA_PATH = /^\/(?:booking(?:\/(?:seats|guide|lookup))?|admin(?:\/events\/[^/]+)?|ticket)?\/?$/;

const redirectTo = (location, cookies = []) => {
  const headers = new Headers({ ...SECURITY_HEADERS, location, 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
};

const authErrorLocation = (next, code) => (
  authNext(next) === 'booking' ? `/booking/seats?auth_error=${code}` : `/admin?auth_error=${code}`
);

const kakaoFailure = (request, next, status, message, code) => (
  wantsPage(request)
    ? redirectTo(authErrorLocation(next, code), [clearStateCookie()])
    : json({ error: message }, status, { 'set-cookie': clearStateCookie() })
);

// Kakao returns the member number as a JSON number. Parsing the whole body with
// JSON.parse can round integers past 2^53, so the id is read from the raw text.
const readKakaoMemberId = text => /"id"\s*:\s*(\d+)/.exec(String(text))?.[1] || '';

const loadSession = async (request, env) => {
  const token = cookieToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT s.expires_at, s.user_id, u.kakao_id, u.nickname, u.role
    FROM admin_sessions s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).bind(await tokenHash(token)).first();
  if (!row || row.expires_at <= Date.now()) return null;
  return row;
};

const sessionIsAdmin = (session, env) => {
  if (!session?.user_id || session.role !== 'admin') return false;
  if (session.user_id === LOCAL_PASSWORD_USER) return flagOn(env.ADMIN_PASSWORD_LOGIN);
  return kakaoAdminIds(env).has(String(session.kakao_id || ''));
};

const requireAdmin = async (request, env) => {
  const session = await loadSession(request, env);
  if (!session?.user_id) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
  if (!sessionIsAdmin(session, env)) return json({ error: '운영진 권한이 없습니다.' }, 403);
  return null;
};

const startSession = async (db, userId) => {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + SESSION_SECONDS * 1000;
  await db.prepare('INSERT INTO admin_sessions(token_hash, expires_at, user_id) VALUES(?,?,?)')
    .bind(await tokenHash(token), expires, userId).run();
  return token;
};

const ensurePasswordAdmin = db => db.prepare(`INSERT INTO users(id, kakao_id, nickname, role, created_at)
  VALUES(?, ?, '', 'admin', ?)
  ON CONFLICT(id) DO UPDATE SET role = 'admin'`).bind(LOCAL_PASSWORD_USER, LOCAL_PASSWORD_KAKAO_ID, Date.now()).run();

const upsertKakaoUser = async (db, env, kakaoId, nickname) => {
  const role = kakaoAdminIds(env).has(kakaoId) ? 'admin' : 'user';
  await db.prepare(`INSERT INTO users(id, kakao_id, nickname, role, created_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(kakao_id) DO UPDATE SET nickname = excluded.nickname, role = excluded.role`)
    .bind(crypto.randomUUID(), kakaoId, nickname, role, Date.now()).run();
  return db.prepare('SELECT id, role, nickname FROM users WHERE kakao_id = ?').bind(kakaoId).first();
};

const exchangeKakaoCode = async (settings, code) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: settings.restKey,
    redirect_uri: settings.redirectUri,
    code,
  });
  if (settings.clientSecret) body.set('client_secret', settings.clientSecret);
  const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenResponse.ok) return null;
  const tokenPayload = await tokenResponse.json().catch(() => null);
  const accessToken = String(tokenPayload?.access_token || '');
  if (!accessToken) return null;
  const meResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const meText = await meResponse.text();
  if (!meResponse.ok) return null;
  const kakaoId = readKakaoMemberId(meText);
  if (!/^\d+$/.test(kakaoId)) return null;
  let nickname = '';
  try {
    const profile = JSON.parse(meText);
    nickname = cleanNickname(profile?.kakao_account?.profile?.nickname || profile?.properties?.nickname);
  } catch {
    nickname = '';
  }
  return { kakaoId, nickname };
};
// 좌석을 차지하는 기록은 bookings 상태와 별도다. 취소·환불 대기로 넘어가면 이 잠금을 지워야 다음 사람이 그 좌석을 고를 수 있다.
const releaseSeatLocks = (db, bookingId) => [
  db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(bookingId),
  db.prepare('DELETE FROM performance_seat_locks WHERE booking_id=?').bind(bookingId),
  db.prepare('DELETE FROM phone_seat_locks WHERE booking_id=?').bind(bookingId),
  db.prepare('DELETE FROM kakao_seat_locks WHERE booking_id=?').bind(bookingId),
];
const cleanExpired = async (db, showId) => {
  const cutoff = Date.now() - HOLD_MS;
  const ids = (await db.prepare("SELECT id FROM bookings WHERE show_id=? AND status='pending' AND created_at<? ORDER BY created_at LIMIT 256").bind(showId,cutoff).all()).results;
  for (let offset = 0; offset < ids.length; offset += 20) {
    const statements = ids.slice(offset, offset + 20).flatMap(({ id }) => [
      db.prepare("UPDATE bookings SET status='expired' WHERE id=? AND status='pending'").bind(id),
      ...releaseSeatLocks(db, id),
    ]);
    await db.batch(statements);
  }
};
const purgeOldBookings = async db => {
  const cutoff = Date.now() - BOOKING_RETENTION_MS;
  const ids = (await db.prepare(`SELECT b.id FROM bookings b
    WHERE b.status IN ('expired','cancelled','paid','refunded')
      AND COALESCE(b.privacy_delete_after,(SELECT MAX(CAST(strftime('%s',s.starts_at) AS INTEGER)*1000)
        FROM event_sessions s WHERE s.id=b.show_id),b.created_at)<?
    ORDER BY b.created_at LIMIT 50`).bind(cutoff).all()).results.map(row => row.id);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  await db.batch([
    db.prepare(`DELETE FROM seat_locks WHERE booking_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM performance_seat_locks WHERE booking_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM phone_seat_locks WHERE booking_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM kakao_seat_locks WHERE booking_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM tickets WHERE booking_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM booking_seats WHERE booking_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM bookings WHERE id IN (${placeholders})`).bind(...ids),
  ]);
  return ids.length;
};
const runScheduledCleanup = async db => {
  const now = Date.now();
  await Promise.all([
    db.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(now).run(),
    db.prepare('DELETE FROM admin_login_failures WHERE until_at<?').bind(now).run(),
    db.prepare('DELETE FROM request_rate_limits WHERE window_start<?').bind(now - 24 * 60 * 60 * 1000).run(),
  ]);
  for (let count = 0; count < 20; count += 1) {
    const removed = await purgeOldBookings(db);
    if (removed < 50) break;
  }
};
const getEventForSession = (db, sessionId) => db.prepare(`SELECT e.id AS event_id,e.title,e.subtitle,e.description,e.venue,e.ticket_price,e.status AS event_status,
  e.booking_open,s.id AS session_id,s.sort_order,s.date_label,s.time_label,s.starts_at,s.status AS session_status
  FROM event_sessions s JOIN events e ON e.id=s.event_id WHERE s.id=?`).bind(sessionId).first();
const getActiveEvent = async db => db.prepare(`SELECT id,title,subtitle,description,venue,ticket_price,status,booking_open
  FROM events WHERE status='published' LIMIT 1`).first();
const getBookingOpen = async (db, eventId) => {
  const event = eventId ? await db.prepare('SELECT booking_open FROM events WHERE id=?').bind(eventId).first() : await getActiveEvent(db);
  return Boolean(event && event.booking_open === 1);
};
const makeEventId = () => `EVT-${Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const normalizeEventInput = input => {
  const title = String(input.title || '').trim();
  const subtitle = String(input.subtitle || '').trim();
  const description = String(input.description || '').trim();
  const venue = String(input.venue || '').trim();
  const price = Number(input.ticketPrice);
  const sessions = Array.isArray(input.sessions) ? input.sessions : [];
  if (!title || title.length > 80) throw Object.assign(new Error('공연 제목을 1~80자로 입력해주세요.'), { status: 400 });
  if (subtitle.length > 120) throw Object.assign(new Error('부제는 120자 이내로 입력해주세요.'), { status: 400 });
  if (description.length > 240) throw Object.assign(new Error('공연 소개는 240자 이내로 입력해주세요.'), { status: 400 });
  if (!venue || venue.length > 120) throw Object.assign(new Error('공연 장소를 1~120자로 입력해주세요.'), { status: 400 });
  if (!Number.isSafeInteger(price) || price < 1 || price > 1000000) throw Object.assign(new Error('티켓 가격을 1~1,000,000원 사이로 입력해주세요.'), { status: 400 });
  if (sessions.length < 1 || sessions.length > 20) throw Object.assign(new Error('회차는 1~20회로 설정해주세요.'), { status: 400 });
  const cleanSessions = sessions.map((session, index) => {
    const dateLabel = String(session.dateLabel || '').trim();
    const timeLabel = String(session.timeLabel || '').trim();
    const startsAt = String(session.startsAt || '').trim();
    if (!dateLabel || dateLabel.length > 80 || !timeLabel || timeLabel.length > 40) throw Object.assign(new Error(`${index + 1}회차 날짜와 시간을 확인해주세요.`), { status: 400 });
    if (startsAt && (startsAt.length > 40 || !Number.isFinite(Date.parse(startsAt)))) throw Object.assign(new Error(`${index + 1}회차 시작 시각을 확인해주세요.`), { status: 400 });
    return { dateLabel, timeLabel, startsAt: startsAt || null };
  });
  return { title, subtitle, description, venue, price, sessions: cleanSessions };
};
const sendBookingConfirmationSms = async (env, row, ticketUrl) => {
  if (!env.SOLAPI_API_KEY || !env.SOLAPI_API_SECRET || !env.SOLAPI_FROM_NUMBER) return { status: 'not_configured' };

  try {
    const date = new Date().toISOString();
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SOLAPI_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt)));
    const signature = Array.from(signatureBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const auth = `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
    const text = `즉새두 QR ${ticketUrl}`;
    const smsBytes = Array.from(text).reduce((total, character) => total + (character.codePointAt(0) > 0x7f ? 2 : 1), 0);
    if (smsBytes > 90) return { status: 'failed', errorCode: 'SMS_LENGTH_OVER_90_BYTES' };
    const response = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ to: row.phone, from: env.SOLAPI_FROM_NUMBER.replace(/\D/g, ''), text, type: 'SMS', autoTypeDetect: false }], strict: true }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    const failedMessage = result.failedMessageList?.[0] || {};
    const errorCode = String(result.errorCode || result.code || failedMessage.statusCode || '').slice(0, 80);
    if (!response.ok) {
      console.error('confirmation_sms_send_failed', { httpStatus: response.status, errorCode });
      return { status: response.status >= 500 ? 'uncertain' : 'failed', errorCode };
    }
    if (result.failedMessageList?.length || Number(result.count?.registeredFailed || 0) > 0 || Number(result.count?.registeredSuccess ?? 1) < 1) {
      console.error('confirmation_sms_send_failed', { errorCode, rejected: result.failedMessageList?.length || result.count?.registeredFailed || 0 });
      return { status: 'failed', errorCode };
    }
    return { status: 'accepted' };
  } catch (error) {
    console.error('confirmation_sms_send_failed', { errorType: String(error?.name || 'Error').slice(0, 40) });
    return { status: 'uncertain', errorCode: 'NETWORK_OR_TIMEOUT' };
  }
};
const recordSmsResult = (db, bookingId, result) => db.prepare(`UPDATE bookings
  SET notification_status=?,notification_error_code=?,notification_updated_at=?
  WHERE id=? AND notification_status='sending'`).bind(result.status, result.errorCode || null, Date.now(), bookingId).run();
// 구글 스프레드시트 동기화: 3분마다 D1 전체를 읽고, 내용이 바뀐 탭만 다시 쓴다. DB → 시트 단방향.
const SHEET_SYNC_CRON = '*/3 * * * *';
const SHEET_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_USERS_TAB = '유저';
const SHEET_HEADERS = {
  bookings: ['예약ID', '조회코드', '회차', '상태', '이름', '연락처', '입금자명', '좌석', '금액', '예약시각', '카카오 닉네임', '문자상태'],
  tickets: ['티켓ID', '예약ID', '회차', '좌석', '티켓 상태', '체크인 시각', '예약자 이름'],
  users: ['카카오 회원번호', '닉네임', '역할', '가입시각', '예약 건수', '확정 좌석 수', '확정 금액', '참여 공연'],
};
let googleToken = { value: '', expiresAt: 0 };

const base64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jsonBase64Url = value => base64Url(new TextEncoder().encode(JSON.stringify(value)));
const pemToDer = pem => Uint8Array.from(atob(pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), char => char.charCodeAt(0));
const quoteSheet = title => `'${title.replace(/'/g, "''")}'`;
const kstText = ms => (ms ? new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '');
// 사용자가 입력한 값이 =, +, -, @로 시작하면 수식으로 해석되지 않도록 앞에 작은따옴표를 붙인다.
const sheetCell = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const getGoogleAccessToken = async env => {
  if (googleToken.value && Date.now() < googleToken.expiresAt - 60000) return googleToken.value;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${jsonBase64Url({ alg: 'RS256', typ: 'JWT' })}.${jsonBase64Url({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: SHEET_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.GOOGLE_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64Url(signature)}` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error('google_token_failed'), { status: response.status });
  const data = await response.json();
  googleToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return googleToken.value;
};
const sheetsRequest = async (env, path, options = {}) => {
  const response = await fetch(`${SHEETS_API}/${env.GOOGLE_SHEET_ID}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${await getGoogleAccessToken(env)}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error('google_sheets_failed'), { status: response.status });
  return response.json();
};

// 시트에 올릴 탭 목록을 만든다. 탭 이름은 "{공연ID} 예약", "{공연ID} 티켓", 공용 "유저".
const buildSheetTabs = async db => {
  const events = (await db.prepare("SELECT id,title FROM events WHERE status!='draft' ORDER BY created_at").all()).results;
  const bookings = (await db.prepare(`SELECT b.id,b.lookup_code,b.name,b.phone,b.payer,b.amount,b.status,b.created_at,b.user_id,b.notification_status,
      s.date_label,s.time_label,e.id AS event_id,u.nickname
    FROM bookings b JOIN event_sessions s ON s.id=b.show_id JOIN events e ON e.id=s.event_id
    LEFT JOIN users u ON u.id=b.user_id ORDER BY b.created_at,b.id`).all()).results;
  const seatRows = (await db.prepare('SELECT booking_id,seat FROM booking_seats ORDER BY seat').all()).results;
  const tickets = (await db.prepare(`SELECT t.id,t.booking_id,t.seat,t.status,t.checked_in_at,s.date_label,s.time_label,b.name,e.id AS event_id
    FROM tickets t JOIN bookings b ON b.id=t.booking_id JOIN event_sessions s ON s.id=t.show_id JOIN events e ON e.id=s.event_id
    ORDER BY t.show_id,t.seat`).all()).results;
  const users = (await db.prepare('SELECT id,kakao_id,nickname,role,created_at FROM users WHERE kakao_id!=? ORDER BY created_at').bind(LOCAL_PASSWORD_KAKAO_ID).all()).results;

  const seatsByBooking = new Map();
  for (const row of seatRows) seatsByBooking.set(row.booking_id, [...(seatsByBooking.get(row.booking_id) || []), row.seat]);
  const titleByEvent = new Map(events.map(event => [event.id, event.title]));

  const tabs = new Map();
  for (const event of events) {
    const eventBookings = bookings.filter(row => row.event_id === event.id);
    tabs.set(`${event.id} 예약`, [SHEET_HEADERS.bookings, ...eventBookings.map(row => {
      const seats = seatsByBooking.get(row.id) || [];
      return [row.id, row.lookup_code || '', `${row.date_label} ${row.time_label}`, row.status, row.name, row.phone, row.payer,
        seats.join(', '), row.amount, kstText(row.created_at), row.nickname || '', row.notification_status];
    })]);
    const eventTickets = tickets.filter(row => row.event_id === event.id);
    tabs.set(`${event.id} 티켓`, [SHEET_HEADERS.tickets, ...eventTickets.map(row => [
      row.id, row.booking_id, `${row.date_label} ${row.time_label}`, row.seat, row.status, kstText(row.checked_in_at), row.name,
    ])]);
  }

  // 유저별 요약은 카카오 로그인으로 예약한 건만 집계한다.
  const statByUser = new Map();
  for (const row of bookings) {
    if (!row.user_id) continue;
    const stat = statByUser.get(row.user_id) || { count: 0, seats: 0, amount: 0, events: new Set() };
    stat.count += 1;
    if (row.status === 'paid') {
      stat.seats += (seatsByBooking.get(row.id) || []).length;
      stat.amount += row.amount;
    }
    stat.events.add(titleByEvent.get(row.event_id) || row.event_id);
    statByUser.set(row.user_id, stat);
  }
  tabs.set(SHEET_USERS_TAB, [SHEET_HEADERS.users, ...users.map(user => {
    const stat = statByUser.get(user.id) || { count: 0, seats: 0, amount: 0, events: new Set() };
    return [user.kakao_id, user.nickname, user.role, kstText(user.created_at), stat.count, stat.seats, stat.amount, [...stat.events].join(', ')];
  })]);
  return tabs;
};

// 시트 상태를 DB 기준으로 맞춘다. 내용 해시가 같은 탭은 건너뛰고, 쓰기가 끝난 탭만 상태를 저장한다.
const runSheetSync = async env => {
  if (!env.GOOGLE_SHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) return 0;
  const db = env.DB;
  const tabs = await buildSheetTabs(db);
  const state = new Map((await db.prepare('SELECT tab,sheet_id,content_hash FROM sheet_sync_state').all()).results.map(row => [row.tab, row]));
  const meta = await sheetsRequest(env, '?fields=sheets.properties(sheetId,title)');
  const sheetIds = new Map((meta.sheets || []).map(sheet => [sheet.properties.title, sheet.properties.sheetId]));

  // 이전에 관리하던 탭 중 DB에 더 이상 없는 탭(공연 삭제 등)만 지운다. 직접 만든 다른 탭은 건드리지 않는다.
  for (const tab of state.keys()) {
    if (tabs.has(tab)) continue;
    if (sheetIds.has(tab)) {
      await sheetsRequest(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: sheetIds.get(tab) } }] }) });
    }
    await db.prepare('DELETE FROM sheet_sync_state WHERE tab=?').bind(tab).run();
  }

  let written = 0;
  for (const [tab, rows] of tabs) {
    const hash = await sha256Hex(JSON.stringify(rows));
    if (state.get(tab)?.content_hash === hash && sheetIds.has(tab)) continue;
    let sheetId = sheetIds.get(tab);
    if (sheetId === undefined) {
      const reply = await sheetsRequest(env, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
      sheetId = reply.replies[0].addSheet.properties.sheetId;
    }
    const range = quoteSheet(tab);
    await sheetsRequest(env, '/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: [range] }) });
    await sheetsRequest(env, '/values:batchUpdate', { method: 'POST', body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [{ range: `${range}!A1`, values: rows.map(row => row.map(sheetCell)) }],
    }) });
    await db.prepare(`INSERT INTO sheet_sync_state(tab,sheet_id,content_hash,synced_at) VALUES(?,?,?,?)
      ON CONFLICT(tab) DO UPDATE SET sheet_id=excluded.sheet_id,content_hash=excluded.content_hash,synced_at=excluded.synced_at`)
      .bind(tab, sheetId, hash, Date.now()).run();
    written += 1;
  }
  return written;
};
const sha256Hex = async text => bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

export default {
  async scheduled(controller, env, ctx) {
    if (controller.cron === SHEET_SYNC_CRON) {
      ctx.waitUntil(runSheetSync(env).catch(error => {
        console.error('sheet_sync_failed', { errorType: String(error?.name || 'Error').slice(0, 40), status: error?.status || null });
      }));
      return;
    }
    ctx.waitUntil(runScheduledCleanup(env.DB).catch(error => {
      console.error('scheduled_cleanup_failed', { errorType: String(error?.name || 'Error').slice(0, 40) });
    }));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = env.DB;
    try {
      const headRequest = request.method === 'HEAD';
      if ((request.method === 'GET' || headRequest) && SPA_PATH.test(url.pathname)) return new Response(headRequest ? null : INDEX_HTML, { headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      if ((request.method === 'GET' || headRequest) && url.pathname === '/privacy') return new Response(headRequest ? null : PRIVACY_HTML, { headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      if ((request.method === 'GET' || headRequest) && url.pathname === '/app.js') return new Response(headRequest ? null : APP_JS, { headers: { ...SECURITY_HEADERS, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
      if ((request.method === 'GET' || headRequest) && url.pathname === '/styles.css') return new Response(headRequest ? null : SITE_CSS, { headers: { ...SECURITY_HEADERS, 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' } });
      if (request.method === 'GET' && decodeURIComponent(url.pathname) === '/즉새두로고2.png') {
        const bytes = Uint8Array.from(atob(LOGO_PNG), char => char.charCodeAt(0));
        return new Response(bytes, { headers: { ...SECURITY_HEADERS, 'content-type': 'image/png', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && decodeURIComponent(url.pathname) === '/즉새두로고1.png') {
        const bytes = Uint8Array.from(atob(HERO_LOGO_PNG), char => char.charCodeAt(0));
        return new Response(bytes, { headers: { ...SECURITY_HEADERS, 'content-type': 'image/png', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/poster-background.jpg') {
        const bytes = Uint8Array.from(atob(POSTER_BACKGROUND_JPG), char => char.charCodeAt(0));
        return new Response(bytes, { headers: { ...SECURITY_HEADERS, 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/poster-instruments.png') {
        const bytes = Uint8Array.from(atob(INSTRUMENTS_PNG), char => char.charCodeAt(0));
        return new Response(bytes, { headers: { ...SECURITY_HEADERS, 'content-type': 'image/png', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/api/event') {
        const event = await getActiveEvent(db);
        if (!event) return json({ event: null });
        const rows = (await db.prepare(`SELECT id,sort_order,date_label,time_label,starts_at
          FROM event_sessions WHERE event_id=? AND status='scheduled' ORDER BY sort_order`).bind(event.id).all()).results;
        const sessions = rows.map(session => ({ id: session.id, sortOrder: session.sort_order,
          dateLabel: session.date_label, timeLabel: session.time_label, startsAt: session.starts_at }));
        return json({ event: { id: event.id, title: event.title, subtitle: event.subtitle, description: event.description, venue: event.venue,
          ticketPrice: event.ticket_price, bookingOpen: event.booking_open === 1, sessions } });
      }
      if (request.method === 'GET' && url.pathname === '/api/seats') {
        const showId = url.searchParams.get('show') || '1';
        const session = await getEventForSession(db, showId);
        if (!session || session.event_status !== 'published' || session.session_status !== 'scheduled') return json({ error: '공연 회차를 확인해주세요.' }, 400);
        await cleanExpired(db, showId);
        const states = Object.fromEntries(ALL_SEATS.map(seat => [seat, RESERVED.has(seat) ? 'reserved' : 'available']));
        const booked = (await db.prepare("SELECT l.seat,b.status FROM performance_seat_locks l JOIN bookings b ON b.id=l.booking_id WHERE l.show_id=? AND b.status IN ('pending','paid')").bind(showId).all()).results;
        for (const row of booked) states[row.seat] = row.status === 'paid' ? 'sold' : 'held';
        return json({ seats: states, price: session.ticket_price, bookingOpen: await getBookingOpen(db, session.event_id) });
      }
      if (request.method === 'POST' && url.pathname === '/api/bookings') {
        if (!await consumeRateLimit(db, request, 'booking', 20, 10 * 60 * 1000)) return json({ error: '요청이 많습니다. 잠시 기다린 뒤 다시 예매해주세요.' }, 429);
        const input = await readBody(request);
        const showId = String(input.showId || '1');
        const session = await getEventForSession(db, showId);
        if (!session || session.event_status !== 'published' || session.session_status !== 'scheduled') return json({ error: '공연 회차를 확인해주세요.' }, 400);
        if (!await getBookingOpen(db, session.event_id)) return json({ error: '현재는 예매 접수 기간이 아닙니다. 공지된 예매 기간에 다시 방문해주세요.' }, 423);
        await cleanExpired(db, showId);
        const seats = [...new Set(Array.isArray(input.seats) ? input.seats : [])].sort();
        const phone = normalizePhone(input.phone);
        const name = String(input.name || '').trim();
        const payer = String(input.payer || '').trim();
        if (!name || name.length > 40) return json({ error: '예매자 이름을 입력해주세요. (최대 40자)' }, 400);
        if (!payer || payer.length > 40) return json({ error: '입금자명을 입력해주세요. 실제 송금하실 이름을 적어주세요. (최대 40자)' }, 400);
        if (phone.length < 10 || phone.length > 11) return json({ error: '연락처는 숫자 10~11자리로 입력해주세요. 예: 010-1234-5678' }, 400);
        if (seats.length < 1 || seats.length > 4 || seats.some(seat => !ALL_SEATS.includes(seat))) return json({ error: '선택한 좌석 정보를 확인해주세요. 좌석은 한 번에 최대 4석까지 신청할 수 있습니다.' }, 400);
        if (seats.some(seat => RESERVED.has(seat))) return json({ error: 'A열은 운영진 보유석으로 예매할 수 없습니다.' }, 400);
        let bookingUser = null;
        if (flagOn(env.REQUIRE_KAKAO_BOOKING)) {
          bookingUser = await loadSession(request, env);
          if (!bookingUser?.kakao_id || bookingUser.kakao_id === LOCAL_PASSWORD_KAKAO_ID) return json({ error: '예매하려면 카카오 로그인이 필요합니다.' }, 401);
          const heldByKakao = await db.prepare('SELECT COUNT(*) AS count FROM kakao_seat_locks WHERE show_id=? AND kakao_id=?').bind(showId, bookingUser.kakao_id).first();
          if (heldByKakao.count + seats.length > 4) return json({ error: '카카오 계정 하나당 회차별 최대 4석까지 예매할 수 있습니다.' }, 429);
        }
        const existing = await db.prepare('SELECT COUNT(*) AS count FROM phone_seat_locks WHERE show_id=? AND phone=?').bind(showId, phone).first();
        if (existing.count + seats.length > 4) return json({ error: '연락처 하나당 최대 4석까지 예매할 수 있습니다.' }, 429);
        const id = `STG-${Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        const code = createLookupCode();
        const createdAt = Date.now();
        const statements = [db.prepare(`INSERT INTO bookings(id,name,phone,payer,amount,status,created_at,show_id,user_id,lookup_code)
          SELECT ?,?,?,?,?,'pending',?,?,?,? WHERE EXISTS (
            SELECT 1 FROM event_sessions s JOIN events e ON e.id=s.event_id
            WHERE s.id=? AND s.event_id=? AND s.status='scheduled' AND e.status='published' AND e.booking_open=1
          )`).bind(id, name, phone, payer, seats.length * session.ticket_price, createdAt, showId, bookingUser?.id || null, code, showId, session.event_id)];
        for (const seat of seats) {
          statements.push(db.prepare('INSERT INTO booking_seats(seat,booking_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)').bind(seat, id, id));
          statements.push(db.prepare('INSERT INTO performance_seat_locks(show_id,seat,booking_id) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)').bind(showId, seat, id, id));
          statements.push(db.prepare(`INSERT INTO phone_seat_locks(show_id,phone,slot,booking_id,seat)
            SELECT ?,?,(
              SELECT MIN(candidate) FROM (
                SELECT 1 AS candidate UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
              ) WHERE candidate NOT IN (SELECT slot FROM phone_seat_locks WHERE show_id=? AND phone=?)
            ),?,?
            WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)`)
            .bind(showId, phone, showId, phone, id, seat, id));
          if (bookingUser) {
            statements.push(db.prepare(`INSERT INTO kakao_seat_locks(show_id,kakao_id,slot,booking_id,seat)
              SELECT ?,?,(
                SELECT MIN(candidate) FROM (
                  SELECT 1 AS candidate UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
                ) WHERE candidate NOT IN (SELECT slot FROM kakao_seat_locks WHERE show_id=? AND kakao_id=?)
              ),?,?
              WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)`)
              .bind(showId, bookingUser.kakao_id, showId, bookingUser.kakao_id, id, seat, id));
          }
        }
        try {
          const results = await db.batch(statements);
          if (!results[0]?.meta?.changes) return json({ error: '공연 접수가 마감되었거나 회차가 삭제되었습니다. 새로고침 후 다시 확인해주세요.' }, 423);
        }
        catch (error) {
          console.error('booking_write_failed', { message: String(error?.message || error).slice(0, 240) });
          if (/kakao_seat_locks/i.test(String(error?.message || error))) return json({ error: '카카오 계정 하나당 회차별 최대 4석까지 예매할 수 있습니다.' }, 429);
          if (/CHECK constraint failed: slot/i.test(String(error?.message || error))) return json({ error: '연락처 하나당 회차별 최대 4석까지 예매할 수 있습니다.' }, 429);
          if (/UNIQUE constraint failed: phone_seat_locks\./i.test(String(error?.message || error))) return json({ error: '연락처 하나당 회차별 최대 4석까지 예매할 수 있습니다.' }, 429);
          if (/unique constraint|primary key|constraint failed/i.test(String(error?.message || error))) return json({ error: '선택한 좌석 중 이미 예약된 좌석이 있습니다. 좌석을 다시 선택해주세요.' }, 409);
          return json({ error: '예약 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.' }, 503);
        }
        return json({ id, code, seats, showId, amount: seats.length * session.ticket_price }, 201);
      }
      if (request.method === 'POST' && url.pathname === '/api/booking-lookup') {
        if (!await consumeRateLimit(db, request, 'booking_lookup', 8, 10 * 60 * 1000)) return json({ error: '조회 시도가 많습니다. 10분 뒤 다시 확인해주세요.' }, 429);
        const input = await readBody(request);
        const { id, lookupCode } = normalizeLookupCode(input.id);
        const phone = normalizePhone(input.phone);
        const row = lookupCode
          ? await db.prepare('SELECT * FROM bookings WHERE lookup_code=? AND phone=? ORDER BY created_at DESC LIMIT 1').bind(lookupCode, phone).first()
          : await db.prepare('SELECT * FROM bookings WHERE id=? AND phone=?').bind(id, phone).first();
        if (!row) return json({ error: '예약 정보가 일치하지 않습니다. 예약 코드와 연락처를 확인해주세요.' }, 404);
        await cleanExpired(db, row.show_id || '1');
        return json(await bookingRow(db, row));
      }
      if (request.method === 'POST' && url.pathname === '/api/ticket-link') {
        const input = await readBody(request);
        const token = String(input.token || '').trim();
        if (!/^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.test(token)) return json({ error: '입장 QR 링크가 올바르지 않습니다.' }, 404);
        const access = await db.prepare("SELECT id,show_id FROM bookings WHERE ticket_access_hash=? AND status='paid'").bind(await tokenHash(token)).first();
        if (!access) return json({ error: '입장 QR 링크가 유효하지 않거나 취소된 예약입니다.' }, 404);
        const session = await getEventForSession(db, access.show_id || '1');
        const tickets = (await db.prepare('SELECT id,seat,status,checked_in_at FROM tickets WHERE booking_id=? ORDER BY seat').bind(access.id).all()).results;
        if (!tickets.length) return json({ error: '이 예약의 QR 티켓을 찾지 못했습니다.' }, 404);
        return json({ showId: access.show_id || '1', eventTitle: session?.title || '', subtitle: session?.subtitle || '', venue: session?.venue || '',
          showNumber: session?.sort_order || 1, dateLabel: session?.date_label || '', timeLabel: session?.time_label || '', tickets });
      }
      if (request.method === 'GET' && url.pathname === '/api/auth/session') {
        const session = await loadSession(request, env);
        const signedIn = Boolean(session?.kakao_id && session.kakao_id !== LOCAL_PASSWORD_KAKAO_ID);
        return json({
          kakaoConfigured: kakaoSettings(env).ready,
          passwordLogin: flagOn(env.ADMIN_PASSWORD_LOGIN),
          bookingRequiresKakao: flagOn(env.REQUIRE_KAKAO_BOOKING),
          user: signedIn ? { nickname: session.nickname || '', role: session.role } : null,
        });
      }
      if (request.method === 'GET' && url.pathname === '/auth/kakao/login') {
        const next = authNext(url.searchParams.get('next'));
        const settings = kakaoSettings(env);
        if (!settings.ready) return kakaoFailure(request, next, 503, '카카오 로그인 키가 설정되지 않았습니다. KAKAO_REST_API_KEY와 KAKAO_REDIRECT_URI를 확인해주세요.', 'kakao_not_configured');
        if (!await consumeRateLimit(db, request, 'kakao_login', 30, 10 * 60 * 1000)) return kakaoFailure(request, next, 429, '로그인 시도가 많습니다. 10분 뒤 다시 시도해주세요.', 'rate_limited');
        const state = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
        const authorize = new URL('https://kauth.kakao.com/oauth/authorize');
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('client_id', settings.restKey);
        authorize.searchParams.set('redirect_uri', settings.redirectUri);
        authorize.searchParams.set('state', state);
        return redirectTo(authorize.toString(), [stateCookie(`${state}.${next}`)]);
      }
      if (request.method === 'GET' && url.pathname === '/auth/kakao/callback') {
        const settings = kakaoSettings(env);
        const [expectedState, nextRaw] = readCookie(request, 'kakao_oauth_state').split('.');
        const next = authNext(nextRaw);
        if (!settings.ready) return kakaoFailure(request, next, 503, '카카오 로그인 키가 설정되지 않았습니다. KAKAO_REST_API_KEY와 KAKAO_REDIRECT_URI를 확인해주세요.', 'kakao_not_configured');
        if (url.searchParams.get('error')) {
          const denied = url.searchParams.get('error') === 'access_denied';
          return kakaoFailure(request, next, 401, denied ? '카카오 로그인이 취소되었습니다.' : '카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.', denied ? 'kakao_denied' : 'kakao_failed');
        }
        const returnedState = url.searchParams.get('state') || '';
        if (!expectedState || !returnedState || !safeEqual(expectedState, returnedState)) {
          return kakaoFailure(request, next, 400, '로그인 상태값이 일치하지 않습니다. 다시 시도해주세요.', 'state_mismatch');
        }
        const code = url.searchParams.get('code') || '';
        if (!code || code.length > 1024) return kakaoFailure(request, next, 400, '카카오 인가 코드가 없습니다. 다시 시도해주세요.', 'kakao_failed');
        try {
          const profile = await exchangeKakaoCode(settings, code);
          if (!profile) return kakaoFailure(request, next, 502, '카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.', 'kakao_failed');
          const user = await upsertKakaoUser(db, env, profile.kakaoId, profile.nickname);
          const token = await startSession(db, user.id);
          const destination = next === 'booking'
            ? '/booking/seats'
            : (user.role === 'admin' ? '/admin' : '/admin?auth_error=not_admin');
          return redirectTo(destination, [sessionCookie(token), clearStateCookie()]);
        } catch (error) {
          console.error('kakao_login_failed', { message: String(error?.message || error).slice(0, 180) });
          return kakaoFailure(request, next, 502, '카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.', 'kakao_failed');
        }
      }
      if (request.method === 'POST' && (url.pathname === '/api/auth/logout' || url.pathname === '/api/admin/logout')) {
        const token = cookieToken(request);
        if (token) await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
        return json({ authenticated: false }, 200, { 'set-cookie': clearSessionCookie() });
      }
      if (request.method === 'POST' && (url.pathname === '/api/auth/logout-all' || url.pathname === '/api/admin/logout-all')) {
        const session = await loadSession(request, env);
        if (session?.user_id) await db.prepare('DELETE FROM admin_sessions WHERE user_id=?').bind(session.user_id).run();
        return json({ authenticated: false }, 200, { 'set-cookie': clearSessionCookie() });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/session') {
        const session = await loadSession(request, env);
        const admin = sessionIsAdmin(session, env);
        return json({
          authenticated: admin,
          nickname: admin ? (session.nickname || '') : '',
          forbidden: Boolean(session?.user_id && !admin),
          kakaoConfigured: kakaoSettings(env).ready,
          passwordLogin: flagOn(env.ADMIN_PASSWORD_LOGIN),
          bookingRequiresKakao: flagOn(env.REQUIRE_KAKAO_BOOKING),
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/login') {
        if (!flagOn(env.ADMIN_PASSWORD_LOGIN)) return json({ error: '비밀번호 로그인은 꺼져 있습니다. 카카오 로그인을 이용해주세요.' }, 403);
        if (!env.ADMIN_USERNAME) return json({ error: '관리자 아이디가 서버에 설정되지 않았습니다.' }, 503);
        if (!await consumeRateLimit(db, request, 'admin_login', 5, 10 * 60 * 1000)) return json({ error: '로그인 시도가 많습니다. 10분 뒤 다시 시도해주세요.' }, 429);
        const input = await readBody(request);
        const usernameValid = safeEqual(String(input.username || ''), String(env.ADMIN_USERNAME));
        const password = String(input.password || '');
        const passwordValid = usernameValid && password.length <= 128 && await verifyAdminPassword(db, env, password);
        if (!passwordValid) return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
        if (!await db.prepare('SELECT id FROM admin_credentials WHERE id=1').first()) await setAdminPassword(db, password);
        await ensurePasswordAdmin(db);
        const token = await startSession(db, LOCAL_PASSWORD_USER);
        return json({ authenticated: true }, 200, { 'set-cookie': sessionCookie(token) });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/password') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const input = await readBody(request);
        const currentPassword = String(input.currentPassword || '');
        const newPassword = String(input.newPassword || '');
        if (!await verifyAdminPassword(db, env, currentPassword)) return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401);
        if (newPassword.length < 12 || newPassword.length > 128) return json({ error: '새 비밀번호는 12~128자로 입력해주세요.' }, 400);
        if (safeEqual(currentPassword, newPassword)) return json({ error: '현재와 다른 비밀번호를 입력해주세요.' }, 400);
        await setAdminPassword(db, newPassword);
        await db.prepare('DELETE FROM admin_sessions WHERE user_id = ? OR user_id IS NULL').bind(LOCAL_PASSWORD_USER).run();
        return json({ changed: true }, 200, { 'set-cookie': clearSessionCookie() });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/events') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const events = (await db.prepare(`SELECT e.*,
          (SELECT COUNT(*) FROM bookings b JOIN event_sessions s ON s.id=b.show_id WHERE s.event_id=e.id) AS booking_count
          FROM events e ORDER BY CASE e.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'cancelled' THEN 2 ELSE 3 END,e.created_at DESC`).all()).results;
        const result = await Promise.all(events.map(async event => {
          const sessions = (await db.prepare(`SELECT s.id,s.sort_order,s.date_label,s.time_label,s.starts_at,s.status,
            (SELECT COUNT(*) FROM bookings b WHERE b.show_id=s.id) AS booking_count,
            (SELECT COUNT(*) FROM booking_seats bs JOIN bookings b ON b.id=bs.booking_id
              WHERE b.show_id=s.id AND b.status IN ('pending','paid')) AS occupied_seats,
            (SELECT COUNT(*) FROM booking_seats bs JOIN bookings b ON b.id=bs.booking_id
              WHERE b.show_id=s.id AND b.status='pending') AS pending_seats
            FROM event_sessions s WHERE s.event_id=? ORDER BY s.sort_order`).bind(event.id).all()).results;
          return { id: event.id, title: event.title, subtitle: event.subtitle, description: event.description, venue: event.venue,
            ticketPrice: event.ticket_price, status: event.status, bookingOpen: event.booking_open === 1,
            bookingCount: event.booking_count, createdAt: event.created_at,
            sessions: sessions.map(session => ({ id: session.id, sortOrder: session.sort_order, dateLabel: session.date_label,
              timeLabel: session.time_label, startsAt: session.starts_at, status: session.status, bookingCount: session.booking_count,
              occupiedSeats: session.occupied_seats || 0, pendingSeats: session.pending_seats || 0 })) };
        }));
        return json({ events: result });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/events') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const draft = normalizeEventInput(await readBody(request));
        const id = makeEventId();
        const now = Date.now();
        const statements = [db.prepare(`INSERT INTO events(id,title,subtitle,description,venue,ticket_price,status,booking_open,created_at,updated_at)
          VALUES(?,?,?,?,?,?,'draft',0,?,?)`).bind(id,draft.title,draft.subtitle,draft.description,draft.venue,draft.price,now,now)];
        draft.sessions.forEach((session,index) => statements.push(db.prepare(`INSERT INTO event_sessions(id,event_id,sort_order,date_label,time_label,starts_at)
          VALUES(?,?,?,?,?,?)`).bind(`${id}-S${String(index + 1).padStart(2,'0')}`,id,index + 1,session.dateLabel,session.timeLabel,session.startsAt)));
        await db.batch(statements);
        return json({ id, status: 'draft' }, 201);
      }
      const eventEdit = /^\/api\/admin\/events\/([A-Z0-9-]+)$/i.exec(url.pathname);
      if (request.method === 'PUT' && eventEdit) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const eventId = eventEdit[1];
        const current = await db.prepare('SELECT status,ticket_price FROM events WHERE id=?').bind(eventId).first();
        if (!current) return json({ error: '공연을 찾지 못했습니다.' }, 404);
        if (current.status === 'archived') return json({ error: '보관된 공연은 수정할 수 없습니다.' }, 409);
        const draft = normalizeEventInput(await readBody(request));
        const booked = await db.prepare('SELECT COUNT(*) AS count FROM bookings b JOIN event_sessions s ON s.id=b.show_id WHERE s.event_id=?').bind(eventId).first();
        const now = Date.now();
        const sessionRows = (await db.prepare('SELECT id FROM event_sessions WHERE event_id=? ORDER BY sort_order').bind(eventId).all()).results;
        if (booked?.count) {
          // 예약이 있으면 예약이 가리키는 회차 ID를 그대로 두고, 날짜·시간만 바꾼다.
          if (draft.price !== current.ticket_price) return json({ error: '예약이 있는 공연은 티켓 가격을 바꿀 수 없습니다.' }, 409);
          if (draft.sessions.length !== sessionRows.length) return json({ error: '예약이 있는 공연은 회차를 추가하거나 삭제할 수 없습니다.' }, 409);
          const statements = [db.prepare('UPDATE events SET title=?,subtitle=?,description=?,venue=?,updated_at=? WHERE id=?')
            .bind(draft.title,draft.subtitle,draft.description,draft.venue,now,eventId)];
          draft.sessions.forEach((session,index) => statements.push(db.prepare('UPDATE event_sessions SET date_label=?,time_label=?,starts_at=? WHERE id=?')
            .bind(session.dateLabel,session.timeLabel,session.startsAt,sessionRows[index].id)));
          await db.batch(statements);
          return json({ updated: true });
        }
        const statements = [db.prepare('UPDATE events SET title=?,subtitle=?,description=?,venue=?,ticket_price=?,updated_at=? WHERE id=?')
          .bind(draft.title,draft.subtitle,draft.description,draft.venue,draft.price,now,eventId),db.prepare('DELETE FROM event_sessions WHERE event_id=?').bind(eventId)];
        draft.sessions.forEach((session,index) => statements.push(db.prepare(`INSERT INTO event_sessions(id,event_id,sort_order,date_label,time_label,starts_at)
          VALUES(?,?,?,?,?,?)`).bind(`${eventId}-S${String(index + 1).padStart(2,'0')}`,eventId,index + 1,session.dateLabel,session.timeLabel,session.startsAt)));
        await db.batch(statements);
        return json({ updated: true });
      }
      const eventAction = /^\/api\/admin\/events\/([A-Z0-9-]+)\/(publish|archive|duplicate)$/i.exec(url.pathname);
      if (request.method === 'POST' && eventAction) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const [, eventId, action] = eventAction;
        const source = await db.prepare('SELECT * FROM events WHERE id=?').bind(eventId).first();
        if (!source) return json({ error: '공연을 찾지 못했습니다.' }, 404);
        if (action === 'publish') {
          if (source.status !== 'draft') return json({ error: '초안 공연만 게시할 수 있습니다.' }, 409);
          const active = await db.prepare("SELECT id FROM events WHERE status='published' LIMIT 1").first();
          if (active) return json({ error: '이미 게시된 공연이 있습니다. 기존 공연을 먼저 보관한 뒤 새 공연을 게시해주세요.' }, 409);
          const count = await db.prepare('SELECT COUNT(*) AS count FROM event_sessions WHERE event_id=? AND status=\'scheduled\'').bind(eventId).first();
          if (!count?.count) return json({ error: '게시할 회차를 하나 이상 추가해주세요.' }, 400);
          await db.prepare("UPDATE events SET status='published',updated_at=? WHERE id=? AND status='draft'").bind(Date.now(),eventId).run();
          return json({ status: 'published' });
        }
        if (action === 'archive') {
          if (source.status !== 'published' && source.status !== 'cancelled') return json({ error: '게시 또는 취소된 공연만 보관할 수 있습니다.' }, 409);
          await db.prepare("UPDATE events SET status='archived',booking_open=0,updated_at=? WHERE id=?").bind(Date.now(),eventId).run();
          return json({ status: 'archived' });
        }
        const sessions = (await db.prepare('SELECT * FROM event_sessions WHERE event_id=? ORDER BY sort_order').bind(eventId).all()).results;
        const duplicateId = makeEventId();
        const now = Date.now();
        const statements = [db.prepare(`INSERT INTO events(id,title,subtitle,description,venue,ticket_price,status,booking_open,created_at,updated_at)
          VALUES(?,?,?,?,?,?,'draft',0,?,?)`).bind(duplicateId,source.title,source.subtitle,source.description,source.venue,source.ticket_price,now,now)];
        sessions.forEach((session,index) => statements.push(db.prepare(`INSERT INTO event_sessions(id,event_id,sort_order,date_label,time_label,starts_at)
          VALUES(?,?,?,?,?,?)`).bind(`${duplicateId}-S${String(index + 1).padStart(2,'0')}`,duplicateId,index + 1,session.date_label,session.time_label,session.starts_at)));
        await db.batch(statements);
        return json({ id: duplicateId, status: 'draft' }, 201);
      }
      const eventDelete = /^\/api\/admin\/events\/([A-Z0-9-]+)$/i.exec(url.pathname);
      if (request.method === 'DELETE' && eventDelete) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const eventId = eventDelete[1];
        const event = await db.prepare('SELECT title FROM events WHERE id=?').bind(eventId).first();
        if (!event) return json({ error: '공연을 찾지 못했습니다.' }, 404);
        const input = await readBody(request);
        if (String(input.confirmation || '') !== event.title) return json({ error: '공연 제목이 일치하지 않아 삭제하지 않았습니다.' }, 400);
        const results = await db.batch([
          db.prepare('DELETE FROM bookings WHERE show_id IN (SELECT id FROM event_sessions WHERE event_id=?)').bind(eventId),
          db.prepare('DELETE FROM events WHERE id=?').bind(eventId),
        ]);
        if (!results[1]?.meta?.changes) return json({ error: '공연을 찾지 못했습니다.' }, 404);
        return json({ deleted: true });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/checkin-summary') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const showId = url.searchParams.get('show') || '1';
        if (!await getEventForSession(db, showId)) return json({ error: '공연 회차를 확인해주세요.' }, 400);
        const totals = await db.prepare(`SELECT COUNT(*) AS total,
          SUM(CASE WHEN t.status='checked_in' THEN 1 ELSE 0 END) AS checked_in
          FROM tickets t JOIN bookings b ON b.id=t.booking_id
          WHERE t.show_id=? AND b.status='paid'`).bind(showId).first();
        const rows = (await db.prepare(`SELECT substr(t.seat,1,1) AS row,
          COUNT(*) AS total, SUM(CASE WHEN t.status='checked_in' THEN 1 ELSE 0 END) AS checked_in
          FROM tickets t JOIN bookings b ON b.id=t.booking_id
          WHERE t.show_id=? AND b.status='paid' GROUP BY substr(t.seat,1,1) ORDER BY row`).bind(showId).all()).results;
        const recent = (await db.prepare(`SELECT t.seat,t.checked_in_at
          FROM tickets t JOIN bookings b ON b.id=t.booking_id
          WHERE t.show_id=? AND b.status='paid' AND t.status='checked_in'
          ORDER BY t.checked_in_at DESC LIMIT 8`).bind(showId).all()).results;
        return json({ total: totals?.total || 0, checkedIn: totals?.checked_in || 0, rows, recent });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/bookings') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const showId = url.searchParams.get('show') || '1';
        const session = await getEventForSession(db, showId);
        if (!session) return json({ error: '공연 회차를 확인해주세요.' }, 400);
        await cleanExpired(db, showId);
        await db.prepare(`UPDATE bookings SET notification_status='uncertain',notification_error_code='DELIVERY_TIMEOUT',notification_updated_at=?
          WHERE show_id=? AND notification_status='sending' AND notification_updated_at<?`).bind(Date.now(),showId,Date.now() - 2 * 60 * 1000).run();
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
        const before = Number(url.searchParams.get('before'));
        const beforeId = String(url.searchParams.get('beforeId') || '');
        const paged = Number.isSafeInteger(before) && before > 0 && /^[A-Z0-9-]{1,40}$/.test(beforeId);
        const query = paged
          ? db.prepare(`SELECT * FROM bookings WHERE show_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?`).bind(showId,before,before,beforeId,limit + 1)
          : db.prepare('SELECT * FROM bookings WHERE show_id=? ORDER BY created_at DESC,id DESC LIMIT ?').bind(showId,limit + 1);
        const pageRows = (await query.all()).results;
        const hasMore = pageRows.length > limit;
        const rows = pageRows.slice(0,limit);
        const activeRows = (await db.prepare("SELECT * FROM bookings WHERE show_id=? AND status IN ('pending','paid') ORDER BY created_at DESC LIMIT 128").bind(showId).all()).results;
        const summary = await db.prepare(`SELECT COUNT(*) AS total_bookings,
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_bookings,
          (SELECT COUNT(*) FROM booking_seats s JOIN bookings b ON b.id=s.booking_id WHERE b.show_id=? AND b.status='paid') AS confirmed_seats
          FROM bookings WHERE show_id=?`).bind(showId,showId).first();
        const last = rows[rows.length - 1];
        return json({ bookings: await adminBookingRows(db, rows, showId), activeBookings: await adminBookingRows(db, activeRows, showId),
          summary: { totalBookings: summary?.total_bookings || 0, pendingBookings: summary?.pending_bookings || 0, confirmedSeats: summary?.confirmed_seats || 0 },
          nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
          bookingOpen: await getBookingOpen(db, session.event_id) });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/settings') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const input = await readBody(request);
        if (typeof input.bookingOpen !== 'boolean') return json({ error: '예매 접수 설정을 확인해주세요.' }, 400);
        const session = await getEventForSession(db, String(input.showId || '1'));
        if (!session || session.event_status !== 'published') return json({ error: '게시된 공연의 회차를 선택해주세요.' }, 400);
        await db.prepare('UPDATE events SET booking_open=?,updated_at=? WHERE id=?').bind(input.bookingOpen ? 1 : 0,Date.now(),session.event_id).run();
        return json({ bookingOpen: input.bookingOpen });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/reset') {
        return json({ error: '전체 초기화는 비활성화되었습니다. 공연별 보관 기능을 이용해주세요.' }, 410);
      }
      const confirm = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/confirm$/.exec(url.pathname);
      if (request.method === 'POST' && confirm) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const row = await db.prepare("SELECT * FROM bookings WHERE id=? AND status='pending'").bind(confirm[1]).first();
        if (!row) return json({ error: '입금 대기 중인 예약을 찾지 못했습니다.' }, 404);
        const ticketAccessToken = createTicketAccessToken();
        const ticketAccessHash = await tokenHash(ticketAccessToken);
        const seats = (await db.prepare('SELECT seat FROM booking_seats WHERE booking_id=? ORDER BY seat').bind(confirm[1]).all()).results.map(item => item.seat);
        const ticketRows = seats.map(seat => ({ id: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''), seat }));
        const statements = [db.prepare(`UPDATE bookings SET status='paid',notification_status='sending',notification_attempts=notification_attempts+1,notification_error_code=NULL,notification_updated_at=?,ticket_access_hash=?
          WHERE id=? AND status='pending'`).bind(Date.now(), ticketAccessHash, confirm[1])];
        for (const ticket of ticketRows) statements.push(db.prepare(`INSERT INTO tickets(id,booking_id,show_id,seat)
          SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND status='paid')
          AND NOT EXISTS (SELECT 1 FROM tickets WHERE booking_id=? AND seat=?)`).bind(ticket.id, row.id, row.show_id || '1', ticket.seat, row.id, row.id, ticket.seat));
        const results = await db.batch(statements);
        if (!results[0]?.meta?.changes) return json({ error: '입금 대기 중인 예약을 찾지 못했습니다.' }, 404);
        const ticketUrl = `${url.origin}/#t=${ticketAccessToken}`;
        ctx.waitUntil(sendBookingConfirmationSms(env, row, ticketUrl)
          .then(notification => recordSmsResult(db, row.id, notification))
          .catch(error => recordSmsResult(db, row.id, { status: 'uncertain', errorCode: String(error?.name || 'BACKGROUND_FAILURE').slice(0, 80) })));
        return json({ confirmed: true, notification: 'sending' });
      }
      const retrySms = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/retry-sms$/.exec(url.pathname);
      if (request.method === 'POST' && retrySms) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const bookingId = retrySms[1];
        const ticketAccessToken = createTicketAccessToken();
        const ticketAccessHash = await tokenHash(ticketAccessToken);
        const claim = await db.prepare(`UPDATE bookings SET notification_status='sending',notification_attempts=notification_attempts+1,
          notification_error_code=NULL,notification_updated_at=?,ticket_access_hash=?
          WHERE id=? AND status='paid' AND notification_status IN ('failed','not_configured','untracked')`).bind(Date.now(), ticketAccessHash, bookingId).run();
        if (!claim.meta?.changes) {
          const row = await db.prepare('SELECT status,notification_status FROM bookings WHERE id=?').bind(bookingId).first();
          if (!row) return json({ error: '예약을 찾지 못했습니다.' }, 404);
          if (row.status !== 'paid') return json({ error: '입금 확인된 예약만 문자를 재전송할 수 있습니다.' }, 409);
          return json({ error: '현재 재전송할 수 없는 상태입니다. 새로고침 후 문자 상태를 확인해주세요.' }, 409);
        }
        const row = await db.prepare("SELECT * FROM bookings WHERE id=? AND status='paid'").bind(bookingId).first();
        const ticketUrl = `${url.origin}/#t=${ticketAccessToken}`;
        ctx.waitUntil(sendBookingConfirmationSms(env, row, ticketUrl)
          .then(notification => recordSmsResult(db, bookingId, notification))
          .catch(error => recordSmsResult(db, bookingId, { status: 'uncertain', errorCode: String(error?.name || 'BACKGROUND_FAILURE').slice(0, 80) })));
        return json({ notification: 'sending' });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/tickets/check-in') {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const input = await readBody(request);
        const ticketId = String(input.ticketId || '').trim().toLowerCase();
        const bookingId = String(input.bookingId || '').trim().toUpperCase();
        const seat = String(input.seat || '').trim().toUpperCase();
        let ticket;
        if (/^[a-f0-9]{32}$/.test(ticketId)) {
          ticket = await db.prepare(`SELECT t.id,t.seat,t.show_id,t.status,t.checked_in_at,b.id AS booking_id,b.name,b.status AS booking_status
            FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE t.id=?`).bind(ticketId).first();
        } else if (/^STG-[A-Z0-9]+$/.test(bookingId) && /^[A-L](?:0[1-9]|1[0-2])$/.test(seat)) {
          ticket = await db.prepare(`SELECT t.id,t.seat,t.show_id,t.status,t.checked_in_at,b.id AS booking_id,b.name,b.status AS booking_status
            FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.id=? AND t.seat=?`).bind(bookingId, seat).first();
        }
        if (!ticket) return json({ error: '해당 티켓을 찾지 못했습니다. 예약 코드와 좌석을 확인해주세요.' }, 404);
        if (input.showId && ticket.show_id !== String(input.showId)) return json({ error: '선택한 회차와 다른 공연의 티켓입니다. 회차를 확인해주세요.' }, 409);
        if (ticket.booking_status !== 'paid') return json({ error: '취소되었거나 확정되지 않은 예약의 티켓입니다.' }, 409);
        if (ticket.status === 'checked_in') return json({ error: '이미 입장 처리된 티켓입니다.', alreadyCheckedIn: true, ticket: { name: ticket.name, showId: ticket.show_id, seat: ticket.seat, checkedInAt: ticket.checked_in_at } }, 409);
        const checkedInAt = Date.now();
        const result = await db.prepare("UPDATE tickets SET status='checked_in',checked_in_at=? WHERE id=? AND status='valid'").bind(checkedInAt, ticket.id).run();
        if (!result.meta.changes) {
          const latest = await db.prepare('SELECT status,checked_in_at FROM tickets WHERE id=?').bind(ticket.id).first();
          if (latest?.status === 'checked_in') return json({ error: '이미 입장 처리된 티켓입니다.', alreadyCheckedIn: true, ticket: { name: ticket.name, showId: ticket.show_id, seat: ticket.seat, checkedInAt: latest.checked_in_at } }, 409);
          return json({ error: '입장 처리 상태가 변경되었습니다. 티켓을 다시 확인해주세요.' }, 409);
        }
        return json({ checkedIn: true, ticket: { name: ticket.name, showId: ticket.show_id, seat: ticket.seat, checkedInAt } });
      }
      const cancel = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/cancel$/.exec(url.pathname);
      if (request.method === 'POST' && cancel) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const row = await db.prepare('SELECT status FROM bookings WHERE id=?').bind(cancel[1]).first();
        if (!row || !['pending', 'paid'].includes(row.status)) return json({ error: '취소할 수 있는 예약을 찾지 못했습니다.' }, 404);
        const next = row.status === 'paid' ? 'refund_pending' : 'cancelled';
        // 환불 대기여도 좌석은 바로 연다. 예약 행은 환불 완료를 누를 때까지 남긴다.
        await db.batch([
          db.prepare('UPDATE bookings SET status=? WHERE id=?').bind(next, cancel[1]),
          ...releaseSeatLocks(db, cancel[1]),
        ]);
        return json({ status: next });
      }
      const refund = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/refund-complete$/.exec(url.pathname);
      if (request.method === 'POST' && refund) {
        const denied = await requireAdmin(request, env);
        if (denied) return denied;
        const results = await db.batch([
          db.prepare("UPDATE bookings SET status='refunded',privacy_delete_after=? WHERE id=? AND status='refund_pending'").bind(Date.now() + BOOKING_RETENTION_MS,refund[1]),
          ...releaseSeatLocks(db, refund[1]),
        ]);
        if (!results[0]?.meta?.changes) return json({ error: '환불 처리 중인 예약을 찾지 못했습니다.' }, 404);
        return json({ status: 'refunded' });
      }
      if (request.method === 'GET') return new Response('페이지를 찾지 못했습니다.', { status: 404, headers: SECURITY_HEADERS });
      return json({ error: '요청을 처리할 수 없습니다.' }, 404);
    } catch (error) {
      if (String(error?.message || '').includes('no such table')) return json({ error: '데이터베이스가 아직 준비되지 않았습니다.' }, 503);
      console.error('request_failed', { path: url.pathname, message: String(error?.message || error).slice(0, 240) });
      return json({ error: error?.status ? error.message : '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }, error?.status || 500);
    }
  },
};
