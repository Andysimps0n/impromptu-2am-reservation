const INDEX_HTML = __INDEX_HTML__;
const APP_JS = __APP_JS__;
const PRICE = 12000;
const HOLD_MS = 30 * 60 * 1000;
const ROWS = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
const ALL_SEATS = ROWS.flatMap(row => Array.from({ length: 12 }, (_, i) => `${row}${String(i + 1).padStart(2, '0')}`));
const RESERVED = new Set(ALL_SEATS.filter(seat => seat.startsWith('A')));

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
const cookieToken = request => /(?:^|; )stage_admin=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
const normalizePhone = value => String(value || '').replace(/\D/g, '');
const maskPhone = phone => phone.replace(/^(\d{3})\d+(\d{4})$/, '$1-****-$2');
const safeEqual = (a, b) => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};
const tokenHash = async token => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
const readBody = async request => {
  const text = await request.text();
  if (text.length > 12000) throw new Error('요청이 너무 큽니다.');
  return JSON.parse(text || '{}');
};
const bookingRow = async (db, row) => ({
  id: row.id, name: row.name, phone: maskPhone(row.phone), payer: row.payer,
  seats: (await db.prepare('SELECT seat FROM booking_seats WHERE booking_id=? ORDER BY seat').bind(row.id).all()).results.map(x => x.seat),
  amount: row.amount, status: row.status, createdAt: row.created_at,
});
const requireAdmin = async (request, env) => {
  const token = cookieToken(request);
  if (!token) return false;
  const hash = await tokenHash(token);
  const session = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash=?').bind(hash).first();
  return Boolean(session && session.expires_at > Date.now());
};
const cleanExpired = async db => {
  const cutoff = Date.now() - HOLD_MS;
  const ids = (await db.prepare("SELECT id FROM bookings WHERE status='pending' AND created_at<?").bind(cutoff).all()).results;
  if (ids.length) await db.batch(ids.flatMap(({ id }) => [
    db.prepare("UPDATE bookings SET status='expired' WHERE id=? AND status='pending'").bind(id),
    db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(id),
  ]));
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = env.DB;
    try {
      if (request.method === 'GET' && url.pathname === '/') return new Response(INDEX_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      if (request.method === 'GET' && url.pathname === '/app.js') return new Response(APP_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
      if (request.method === 'GET' && url.pathname === '/api/seats') {
        await cleanExpired(db);
        const states = Object.fromEntries(ALL_SEATS.map(seat => [seat, RESERVED.has(seat) ? 'reserved' : 'available']));
        const booked = (await db.prepare("SELECT l.seat,b.status FROM seat_locks l JOIN bookings b ON b.id=l.booking_id WHERE b.status IN ('pending','paid','refund_pending')").all()).results;
        for (const row of booked) states[row.seat] = row.status === 'paid' ? 'sold' : row.status === 'refund_pending' ? 'refund_pending' : 'held';
        return json({ seats: states, price: PRICE });
      }
      if (request.method === 'POST' && url.pathname === '/api/bookings') {
        await cleanExpired(db);
        const input = await readBody(request);
        const seats = [...new Set(Array.isArray(input.seats) ? input.seats : [])].sort();
        const phone = normalizePhone(input.phone);
        const name = String(input.name || '').trim();
        const payer = String(input.payer || '').trim();
        if (!name || name.length > 40 || !payer || payer.length > 40 || phone.length < 10 || phone.length > 11 || seats.length < 1 || seats.length > 2 || seats.some(seat => !ALL_SEATS.includes(seat))) return json({ error: '입력 정보나 좌석을 확인해주세요.' }, 400);
        if (seats.some(seat => RESERVED.has(seat))) return json({ error: 'A열은 운영진 보유석으로 예매할 수 없습니다.' }, 400);
        const existing = await db.prepare("SELECT COUNT(*) AS count FROM booking_seats s JOIN bookings b ON b.id=s.booking_id WHERE b.phone=? AND b.status IN ('pending','paid','refund_pending')").bind(phone).first();
        if (existing.count + seats.length > 2) return json({ error: '연락처 하나당 최대 2석까지 예매할 수 있습니다.' }, 429);
        const id = `STG-${Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        const createdAt = Date.now();
        const statements = [db.prepare("INSERT INTO bookings(id,name,phone,payer,amount,status,created_at) VALUES(?,?,?,?,?,'pending',?)").bind(id, name, phone, payer, seats.length * PRICE, createdAt)];
        for (const seat of seats) statements.push(db.prepare('INSERT INTO booking_seats(seat,booking_id) VALUES(?,?)').bind(seat, id));
        for (const seat of seats) statements.push(db.prepare('INSERT INTO seat_locks(seat,booking_id) VALUES(?,?)').bind(seat, id));
        try { await db.batch(statements); }
        catch { return json({ error: '선택한 좌석 중 이미 예약된 좌석이 있습니다. 좌석을 다시 선택해주세요.' }, 409); }
        return json({ id, seats, amount: seats.length * PRICE }, 201);
      }
      if (request.method === 'POST' && url.pathname === '/api/booking-lookup') {
        await cleanExpired(db);
        const input = await readBody(request);
        const id = String(input.id || '').trim().toUpperCase();
        const phone = normalizePhone(input.phone);
        const row = await db.prepare('SELECT * FROM bookings WHERE id=? AND phone=?').bind(id, phone).first();
        if (!row) return json({ error: '예약 정보가 일치하지 않습니다. 예약 코드와 연락처를 확인해주세요.' }, 404);
        return json(await bookingRow(db, row));
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/session') return json({ authenticated: await requireAdmin(request, env) });
      if (request.method === 'POST' && url.pathname === '/api/admin/login') {
        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return json({ error: '관리자 계정이 서버에 설정되지 않았습니다.' }, 503);
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const failure = await db.prepare('SELECT count, until_at FROM admin_login_failures WHERE ip=?').bind(ip).first();
        if (failure && failure.until_at > Date.now() && failure.count >= 5) return json({ error: '로그인 시도가 많습니다. 10분 뒤 다시 시도해주세요.' }, 429);
        const input = await readBody(request);
        if (!safeEqual(String(input.username || ''), env.ADMIN_USERNAME) || !safeEqual(String(input.password || ''), env.ADMIN_PASSWORD)) {
          const untilAt = failure && failure.until_at > Date.now() ? failure.until_at : Date.now() + 10 * 60 * 1000;
          const count = failure && failure.until_at > Date.now() ? failure.count + 1 : 1;
          await db.prepare('INSERT INTO admin_login_failures(ip,count,until_at) VALUES(?,?,?) ON CONFLICT(ip) DO UPDATE SET count=excluded.count,until_at=excluded.until_at').bind(ip, count, untilAt).run();
          return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
        }
        await db.prepare('DELETE FROM admin_login_failures WHERE ip=?').bind(ip).run();
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        const hash = await tokenHash(token);
        const expires = Date.now() + 8 * 60 * 60 * 1000;
        await db.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES(?,?)').bind(hash, expires).run();
        return json({ authenticated: true }, 200, { 'set-cookie': `stage_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` });
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
        const token = cookieToken(request);
        if (token) await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
        return json({ authenticated: false }, 200, { 'set-cookie': 'stage_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (request.method === 'GET' && url.pathname === '/api/admin/bookings') {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        await cleanExpired(db);
        const rows = (await db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all()).results;
        return json({ bookings: await Promise.all(rows.map(row => bookingRow(db, row))) });
      }
      const confirm = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/confirm$/.exec(url.pathname);
      if (request.method === 'POST' && confirm) {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const result = await db.prepare("UPDATE bookings SET status='paid' WHERE id=? AND status='pending'").bind(confirm[1]).run();
        return result.meta.changes ? json({ confirmed: true }) : json({ error: '입금 대기 중인 예약을 찾지 못했습니다.' }, 404);
      }
      const cancel = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/cancel$/.exec(url.pathname);
      if (request.method === 'POST' && cancel) {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const row = await db.prepare('SELECT status FROM bookings WHERE id=?').bind(cancel[1]).first();
        if (!row || !['pending', 'paid'].includes(row.status)) return json({ error: '취소할 수 있는 예약을 찾지 못했습니다.' }, 404);
        const next = row.status === 'paid' ? 'refund_pending' : 'cancelled';
        const statements = [db.prepare('UPDATE bookings SET status=? WHERE id=?').bind(next, cancel[1])];
        if (next === 'cancelled') statements.push(db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(cancel[1]));
        await db.batch(statements);
        return json({ status: next });
      }
      const refund = /^\/api\/admin\/bookings\/([A-Z0-9-]+)\/refund-complete$/.exec(url.pathname);
      if (request.method === 'POST' && refund) {
        if (!await requireAdmin(request, env)) return json({ error: '운영진 로그인이 필요합니다.' }, 401);
        const result = await db.prepare("UPDATE bookings SET status='refunded' WHERE id=? AND status='refund_pending'").bind(refund[1]).run();
        if (!result.meta.changes) return json({ error: '환불 처리 중인 예약을 찾지 못했습니다.' }, 404);
        await db.prepare('DELETE FROM seat_locks WHERE booking_id=?').bind(refund[1]).run();
        return json({ status: 'refunded' });
      }
      if (request.method === 'GET') return new Response('페이지를 찾지 못했습니다.', { status: 404 });
      return json({ error: '요청을 처리할 수 없습니다.' }, 404);
    } catch (error) {
      if (String(error?.message || '').includes('no such table')) return json({ error: '데이터베이스가 아직 준비되지 않았습니다.' }, 503);
      return json({ error: '요청을 처리하지 못했습니다.' }, 400);
    }
  },
};
