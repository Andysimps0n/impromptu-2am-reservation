const INDEX_HTML = __INDEX_HTML__;
const PRIVACY_HTML = __PRIVACY_HTML__;
const APP_JS = __APP_JS__;
const SITE_CSS = __SITE_CSS__;
const LOGO_PNG = __LOGO_PNG__;
const HERO_LOGO_PNG = __HERO_LOGO_PNG__;
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
const cookieToken = request => /(?:^|; )stage_admin=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
const normalizePhone = value => String(value || '').replace(/\D/g, '');
const maskPhone = phone => phone.replace(/^(\d{3})\d+(\d{4})$/, '$1-****-$2');
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
  id: row.id, showId: row.show_id || '1', name: row.name, phone: maskPhone(row.phone), payer: row.payer,
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
    id: row.id, showId: row.show_id || '1', name: row.name, phone: maskPhone(row.phone), payer: row.payer,
    eventTitle: session?.title || '', venue: session?.venue || '', showNumber: session?.sort_order || 1,
    dateLabel: session?.date_label || '', timeLabel: session?.time_label || '',
    seats: seatsByBooking.get(row.id) || [], tickets: row.status === 'paid' ? ticketsByBooking.get(row.id) || [] : [],
    amount: row.amount, status: row.status, createdAt: row.created_at,
    notificationStatus: row.notification_status || 'untracked', notificationAttempts: row.notification_attempts || 0,
    notificationErrorCode: row.notification_error_code || '', notificationUpdatedAt: row.notification_updated_at || null,
  }));
};
const requireAdmin = async (request, env) => {
  const token = cookieToken(request);
  if (!token) return false;
  const hash = await tokenHash(token);
  const session = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash=?').bind(hash).first();
  return Boolean(session && session.expires_at > Date.now());
};
const cleanExpired = async (db, showId) => {
  const cutoff = Date.now() - HOLD_MS;
  const ids = (await db.prepare("SELECT id FROM bookings WHERE show_id=? AND status='pending' AND created_at<? ORDER BY created_at LIMIT 256").bind(showId,cutoff).all()).results;
  for (let offset = 0; offset < ids.length; offset += 20) {
    const statements = ids.slice(offset, offset + 20).flatMap(({ id }) => [
      db.prepare("UPDATE bookings SET status='expired' WHERE id=? AND status='pending'").bind(id),
      db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(id),
      db.prepare('DELETE FROM performance_seat_locks WHERE booking_id=?').bind(id),
      db.prepare('DELETE FROM phone_seat_locks WHERE booking_id=?').bind(id),
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
export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledCleanup(env.DB).catch(error => {
      console.error('scheduled_cleanup_failed', { errorType: String(error?.name || 'Error').slice(0, 40) });
    }));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = env.DB;
    try {
      const headRequest = request.method === 'HEAD';
      if ((request.method === 'GET' || headRequest) && url.pathname === '/') return new Response(headRequest ? null : INDEX_HTML, { headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
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
        const booked = (await db.prepare("SELECT l.seat,b.status FROM performance_seat_locks l JOIN bookings b ON b.id=l.booking_id WHERE l.show_id=? AND b.status IN ('pending','paid','refund_pending')").bind(showId).all()).results;
        for (const row of booked) states[row.seat] = row.status === 'paid' ? 'sold' : row.status === 'refund_pending' ? 'refund_pending' : 'held';
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
        if (seats.length < 1 || seats.length > 2 || seats.some(seat => !ALL_SEATS.includes(seat))) return json({ error: '선택한 좌석 정보를 확인해주세요. 좌석은 한 번에 최대 2석까지 신청할 수 있습니다.' }, 400);
        if (seats.some(seat => RESERVED.has(seat))) return json({ error: 'A열은 운영진 보유석으로 예매할 수 없습니다.' }, 400);
        const existing = await db.prepare('SELECT COUNT(*) AS count FROM phone_seat_locks WHERE show_id=? AND phone=?').bind(showId, phone).first();
        if (existing.count + seats.length > 2) return json({ error: '연락처 하나당 최대 2석까지 예매할 수 있습니다.' }, 429);
        const id = `STG-${Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        const createdAt = Date.now();
        const statements = [db.prepare(`INSERT INTO bookings(id,name,phone,payer,amount,status,created_at,show_id)
          SELECT ?,?,?,?,?,'pending',?,? WHERE EXISTS (
            SELECT 1 FROM event_sessions s JOIN events e ON e.id=s.event_id
            WHERE s.id=? AND s.event_id=? AND s.status='scheduled' AND e.status='published' AND e.booking_open=1
          )`).bind(id, name, phone, payer, seats.length * session.ticket_price, createdAt, showId, showId, session.event_id)];
        for (const seat of seats) {
          statements.push(db.prepare('INSERT INTO booking_seats(seat,booking_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)').bind(seat, id, id));
          statements.push(db.prepare('INSERT INTO performance_seat_locks(show_id,seat,booking_id) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)').bind(showId, seat, id, id));
          statements.push(db.prepare(`INSERT INTO phone_seat_locks(show_id,phone,slot,booking_id,seat)
            SELECT ?,?,CASE WHEN EXISTS (SELECT 1 FROM phone_seat_locks WHERE show_id=? AND phone=? AND slot=1) THEN 2 ELSE 1 END,?,?
            WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)`)
            .bind(showId, phone, showId, phone, id, seat, id));
        }
        try {
          const results = await db.batch(statements);
          if (!results[0]?.meta?.changes) return json({ error: '공연 접수가 마감되었거나 회차가 삭제되었습니다. 새로고침 후 다시 확인해주세요.' }, 423);
        }
        catch (error) {
          console.error('booking_write_failed', { message: String(error?.message || error).slice(0, 240) });
          if (/CHECK constraint failed: slot/i.test(String(error?.message || error))) return json({ error: '연락처 하나당 회차별 최대 2석까지 예매할 수 있습니다.' }, 429);
          if (/UNIQUE constraint failed: phone_seat_locks\./i.test(String(error?.message || error))) return json({ error: '연락처 하나당 회차별 최대 2석까지 예매할 수 있습니다.' }, 429);
          if (/unique constraint|primary key|constraint failed/i.test(String(error?.message || error))) return json({ error: '선택한 좌석 중 이미 예약된 좌석이 있습니다. 좌석을 다시 선택해주세요.' }, 409);
          return json({ error: '예약 저장 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.' }, 503);
        }
        return json({ id, seats, showId, amount: seats.length * session.ticket_price }, 201);
      }
      if (request.method === 'POST' && url.pathname === '/api/booking-lookup') {
        if (!await consumeRateLimit(db, request, 'booking_lookup', 8, 10 * 60 * 1000)) return json({ error: '조회 시도가 많습니다. 10분 뒤 다시 확인해주세요.' }, 429);
        const input = await readBody(request);
        const id = String(input.id || '').trim().toUpperCase();
        const phone = normalizePhone(input.phone);
        const row = await db.prepare('SELECT * FROM bookings WHERE id=? AND phone=?').bind(id, phone).first();
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
      if (request.method === 'GET' && url.pathname === '/api/admin/session') return json({ authenticated: await requireAdmin(request, env) });
      if (request.method === 'POST' && url.pathname === '/api/admin/login') {
        if (!env.ADMIN_USERNAME) return json({ error: '관리자 아이디가 서버에 설정되지 않았습니다.' }, 503);
        if (!await consumeRateLimit(db, request, 'admin_login', 5, 10 * 60 * 1000)) return json({ error: '로그인 시도가 많습니다. 10분 뒤 다시 시도해주세요.' }, 429);
        const input = await readBody(request);
        const usernameValid = safeEqual(String(input.username || ''), String(env.ADMIN_USERNAME));
        const password = String(input.password || '');
        const passwordValid = usernameValid && password.length <= 128 && await verifyAdminPassword(db, env, password);
        if (!passwordValid) return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
        if (!await db.prepare('SELECT id FROM admin_credentials WHERE id=1').first()) await setAdminPassword(db, password);
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        const hash = await tokenHash(token);
        const expires = Date.now() + 8 * 60 * 60 * 1000;
        await db.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)').bind(hash, expires).run();
        return json({ authenticated: true }, 200, { 'set-cookie': `stage_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/password') {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const input = await readBody(request);
        const currentPassword = String(input.currentPassword || '');
        const newPassword = String(input.newPassword || '');
        if (!await verifyAdminPassword(db, env, currentPassword)) return json({ error: '현재 비밀번호가 올바르지 않습니다.' }, 401);
        if (newPassword.length < 12 || newPassword.length > 128) return json({ error: '새 비밀번호는 12~128자로 입력해주세요.' }, 400);
        if (safeEqual(currentPassword, newPassword)) return json({ error: '현재와 다른 비밀번호를 입력해주세요.' }, 400);
        await setAdminPassword(db, newPassword);
        await db.prepare('DELETE FROM admin_sessions').run();
        return json({ changed: true }, 200, { 'set-cookie': 'stage_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
        const token = cookieToken(request);
        if (token) await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
        return json({ authenticated: false }, 200, { 'set-cookie': 'stage_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/events') {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const events = (await db.prepare(`SELECT e.*,
          (SELECT COUNT(*) FROM bookings b JOIN event_sessions s ON s.id=b.show_id WHERE s.event_id=e.id) AS booking_count
          FROM events e ORDER BY CASE e.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'cancelled' THEN 2 ELSE 3 END,e.created_at DESC`).all()).results;
        const result = await Promise.all(events.map(async event => {
          const sessions = (await db.prepare(`SELECT s.id,s.sort_order,s.date_label,s.time_label,s.starts_at,s.status,
            (SELECT COUNT(*) FROM bookings b WHERE b.show_id=s.id) AS booking_count
            FROM event_sessions s WHERE s.event_id=? ORDER BY s.sort_order`).bind(event.id).all()).results;
          return { id: event.id, title: event.title, subtitle: event.subtitle, description: event.description, venue: event.venue,
            ticketPrice: event.ticket_price, status: event.status, bookingOpen: event.booking_open === 1,
            bookingCount: event.booking_count, createdAt: event.created_at,
            sessions: sessions.map(session => ({ id: session.id, sortOrder: session.sort_order, dateLabel: session.date_label,
              timeLabel: session.time_label, startsAt: session.starts_at, status: session.status, bookingCount: session.booking_count })) };
        }));
        return json({ events: result });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/events') {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const eventId = eventEdit[1];
        const current = await db.prepare('SELECT status,booking_open FROM events WHERE id=?').bind(eventId).first();
        if (!current) return json({ error: '공연을 찾지 못했습니다.' }, 404);
        if (current.status !== 'draft' && !(current.status === 'published' && current.booking_open === 0)) return json({ error: '초안 또는 예매 접수가 닫힌 공연만 수정할 수 있습니다.' }, 409);
        const hasBookings = await db.prepare('SELECT COUNT(*) AS count FROM bookings b JOIN event_sessions s ON s.id=b.show_id WHERE s.event_id=?').bind(eventId).first();
        if (hasBookings?.count) return json({ error: '예약 기록이 있는 공연은 수정할 수 없습니다.' }, 409);
        const draft = normalizeEventInput(await readBody(request));
        const now = Date.now();
        const statements = [db.prepare('UPDATE events SET title=?,subtitle=?,description=?,venue=?,ticket_price=?,updated_at=? WHERE id=?')
          .bind(draft.title,draft.subtitle,draft.description,draft.venue,draft.price,now,eventId),db.prepare('DELETE FROM event_sessions WHERE event_id=?').bind(eventId)];
        draft.sessions.forEach((session,index) => statements.push(db.prepare(`INSERT INTO event_sessions(id,event_id,sort_order,date_label,time_label,starts_at)
          VALUES(?,?,?,?,?,?)`).bind(`${eventId}-S${String(index + 1).padStart(2,'0')}`,eventId,index + 1,session.dateLabel,session.timeLabel,session.startsAt)));
        await db.batch(statements);
        return json({ updated: true });
      }
      const eventAction = /^\/api\/admin\/events\/([A-Z0-9-]+)\/(publish|archive|duplicate)$/i.exec(url.pathname);
      if (request.method === 'POST' && eventAction) {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        const activeRows = (await db.prepare("SELECT * FROM bookings WHERE show_id=? AND status IN ('pending','paid','refund_pending') ORDER BY created_at DESC LIMIT 128").bind(showId).all()).results;
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
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
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const row = await db.prepare('SELECT status FROM bookings WHERE id=?').bind(cancel[1]).first();
        if (!row || !['pending', 'paid'].includes(row.status)) return json({ error: '취소할 수 있는 예약을 찾지 못했습니다.' }, 404);
        const next = row.status === 'paid' ? 'refund_pending' : 'cancelled';
        const statements = [db.prepare('UPDATE bookings SET status=? WHERE id=?').bind(next, cancel[1])];
        if (next === 'cancelled') {
          statements.push(db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(cancel[1]));
          statements.push(db.prepare('DELETE FROM performance_seat_locks WHERE booking_id=?').bind(cancel[1]));
          statements.push(db.prepare('DELETE FROM phone_seat_locks WHERE booking_id=?').bind(cancel[1]));
        }
        await db.batch(statements);
        return json({ status: next });
      }
      const refund = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/refund-complete$/.exec(url.pathname);
      if (request.method === 'POST' && refund) {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const results = await db.batch([
          db.prepare("UPDATE bookings SET status='refunded',privacy_delete_after=? WHERE id=? AND status='refund_pending'").bind(Date.now() + BOOKING_RETENTION_MS,refund[1]),
          db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(refund[1]),
          db.prepare('DELETE FROM performance_seat_locks WHERE booking_id=?').bind(refund[1]),
          db.prepare('DELETE FROM phone_seat_locks WHERE booking_id=?').bind(refund[1]),
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
