import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.text();
  let data;
  try { data = JSON.parse(body || '{}'); } catch { throw new Error('예매 서버가 응답하지 않았습니다.'); }
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
};

const dateLabel = value => value ? new Date(`${value}T12:00:00+09:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' }) : '';
const timeLabel = value => { if (!value) return ''; const [h, m] = value.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m ? ` ${m}분` : ''}`; };
const statusNames = { draft: '초안', published: '게시 중', archived: '보관', cancelled: '취소됨' };

export function AdminApp({ onBackToBooking }) {
  const [auth, setAuth] = useState('loading');
  const [screen, setScreen] = useState('list');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [showId, setShowId] = useState('');
  const [bookings, setBookings] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(false);
  const [modal, setModal] = useState('');
  const [scanner, setScanner] = useState(false);
  const [scanValue, setScanValue] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const event = events.find(item => item.id === eventId) || null;
  const session = event?.sessions.find(item => item.id === showId) || null;

  const loadEvents = useCallback(async () => {
    const result = await api('/api/admin/events');
    setEvents(result.events);
    return result.events;
  }, []);
  const refresh = useCallback(async (selectedEvent = eventId, selectedShow = showId, nextCursor = cursor) => {
    if (!selectedShow) return;
    setError('');
    try {
      const params = new URLSearchParams({ show: selectedShow, limit: '50' });
      if (nextCursor?.showId === selectedShow) { params.set('before', String(nextCursor.createdAt)); params.set('beforeId', nextCursor.id); }
      const [data, entry, eventData] = await Promise.all([
        api(`/api/admin/bookings?${params}`), api(`/api/admin/checkin-summary?show=${encodeURIComponent(selectedShow)}`), api('/api/admin/events'),
      ]);
      setBookings(data); setCheckin(entry); setEvents(eventData.events);
    } catch (problem) { setError(problem.message); }
  }, [eventId, showId, cursor]);

  useEffect(() => {
    api('/api/admin/session').then(async result => {
      if (!result.authenticated) { setAuth('logged-out'); return; }
      const items = await loadEvents();
      const preferred = items.find(item => item.status === 'published' && item.sessions.length) || items.find(item => item.sessions.length);
      setEventId(preferred?.id || ''); setShowId(preferred?.sessions[0]?.id || ''); setAuth('logged-in');
    }).catch(problem => { setError(problem.message); setAuth('logged-out'); });
  }, [loadEvents]);

  useEffect(() => {
    if (auth !== 'logged-in' || !showId || screen !== 'detail') return;
    refresh(eventId, showId, cursor);
    const timer = setInterval(() => refresh(eventId, showId, cursor), 12000);
    return () => clearInterval(timer);
  }, [auth, screen, eventId, showId, cursor, refresh]);

  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 5000); };
  const run = async (action, success) => {
    setBusy(true); setError('');
    try { await action(); if (success) notify(success); await loadEvents(); if (screen === 'detail') await refresh(eventId, showId, cursor); return true; }
    catch (problem) { setError(problem.message); return false; }
    finally { setBusy(false); }
  };
  const login = async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    await run(async () => { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) }); setAuth('logged-in'); await loadEvents(); setScreen('list'); }, '로그인했습니다.');
  };
  const selectEvent = item => { setEventId(item.id); setShowId(item.sessions[0]?.id || ''); setCursor(null); setBookings(null); setScreen('detail'); };
  const selectSession = id => { setShowId(id); setCursor(null); setBookings(null); setSelectedOrder(null); };
  const back = () => { setScreen('list'); setError(''); setCursor(null); };
  const logout = async () => { try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); setAuth('logged-out'); setScreen('list'); setToast('로그아웃했습니다.'); } catch (problem) { setError(problem.message); } };

  if (auth === 'loading') return <div className="admin-login"><p>운영자 화면을 불러오는 중입니다.</p></div>;
  if (auth === 'logged-out') return <section className="admin-login"><button className="login-back" onClick={() => onBackToBooking?.()}>← 공연 예매로 돌아가기</button><div className="eyebrow">BACKSTAGE · ADMIN</div><h2>운영진 로그인</h2><p>공연 예매와 입금 확인은 운영진만 볼 수 있습니다.</p><form onSubmit={login}><label>아이디<input name="username" autoComplete="username" required /></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary" disabled={busy}>로그인</button></form>{error && <div className="error-text">{error}</div>}</section>;

  const header = <header className="admin-head"><div><div className="eyebrow">BACKSTAGE · ADMIN</div><h1>{screen === 'detail' && event ? event.title : '공연 관리'}</h1><p>{screen === 'detail' && event ? `${event.venue} · ${statusNames[event.status]} · ${session ? `${session.dateLabel} ${session.timeLabel}` : '회차 미등록'}` : '공연을 선택해 예매, 연락, 좌석과 입장을 관리하세요.'}</p></div><div className="admin-head-actions">{screen === 'detail' && <button className="admin-action" onClick={back}>공연 목록</button>}<button className="admin-action" onClick={() => setModal('password')}>비밀번호 변경</button><button className="admin-action" onClick={logout}>로그아웃</button></div></header>;
  const eventList = <><section className="panel event-manager"><div className="event-manager-head"><div><div className="eyebrow">EVENT SETUP</div><h2>공연 목록</h2><p>공연을 선택해 회차별 예매와 현장 입장을 관리합니다.</p></div><button className="admin-action" onClick={() => setEditor({})}>새 공연 만들기</button></div><div className="event-admin-list">{events.map(item => <article className="event-admin-card" key={item.id} onClick={() => selectEvent(item)} role="button" tabIndex="0" onKeyDown={e => e.key === 'Enter' && selectEvent(item)}><div className="event-admin-main"><div><span className={`badge ${item.status === 'published' ? 'paid' : ''}`}>{statusNames[item.status] || item.status}</span><h3>{item.title}</h3><p>{item.venue} · {item.sessions.length}회 · {Number(item.ticketPrice).toLocaleString()}원</p><small>{item.bookingCount}건 예약 · {item.sessions.map(s => `${s.sortOrder}공 ${s.dateLabel} ${s.timeLabel}`).join(' / ')}</small></div><div className="event-admin-actions"><button className="admin-action" onClick={e => { e.stopPropagation(); selectEvent(item); }}>공연 관리</button>{(item.status === 'draft' || (item.status === 'published' && !Number(item.bookingCount) && !item.bookingOpen)) && <button className="admin-action" onClick={e => { e.stopPropagation(); setEditor(item); }}>수정</button>}{item.status === 'draft' && <button className="admin-action" disabled={busy} onClick={e => { e.stopPropagation(); run(() => api(`/api/admin/events/${encodeURIComponent(item.id)}/publish`, { method: 'POST', body: '{}' }), '공연을 게시했습니다.'); }}>게시</button>}<button className="admin-action" onClick={e => { e.stopPropagation(); run(() => api(`/api/admin/events/${encodeURIComponent(item.id)}/duplicate`, { method: 'POST', body: '{}' }), '공연 초안을 복제했습니다.'); }}>복제</button>{['published', 'cancelled'].includes(item.status) && <button className="admin-action" onClick={e => { e.stopPropagation(); run(() => api(`/api/admin/events/${encodeURIComponent(item.id)}/archive`, { method: 'POST', body: '{}' }), '공연을 보관했습니다.'); }}>보관</button>}<button className="admin-action danger" onClick={e => { e.stopPropagation(); setModal(`delete:${item.id}`); }}>영구 삭제</button></div></div></article>)}{!events.length && <p className="checkin-empty">등록된 공연이 없습니다. 새 공연을 만들면 이곳에서 관리할 수 있습니다.</p>}</div></section></>;

  const summary = bookings?.summary;
  const activeOrders = bookings?.activeBookings || [];
  const seatMap = <AdminSeatMap orders={activeOrders} onSeat={setSelectedOrder} />;
  const bookingIsOpen = bookings?.bookingOpen ?? event?.bookingOpen ?? false;
  const detail = event && <><section className="panel event-context"><div className="eyebrow">{event.title} · {event.venue}</div><h2>{session ? `${session.dateLabel} · ${session.timeLabel}` : '회차가 없습니다'}</h2><p>{statusNames[event.status]} · {Number(event.ticketPrice).toLocaleString()}원 · 전체 {event.bookingCount}건 예약</p><div className="show-picker admin-show-picker">{event.sessions.map(item => <button className={`show-option ${item.id === showId ? 'active' : ''}`} key={item.id} onClick={() => selectSession(item.id)}>{item.sortOrder}공 · {item.dateLabel} {item.timeLabel}</button>)}</div></section><section className="panel booking-control"><div><div className="eyebrow">BOOKING STATUS</div><h2>예매 접수 {bookingIsOpen ? '중' : '마감'}</h2><p>{event.status !== 'published' ? '초안 공연은 게시한 뒤 접수를 열 수 있습니다.' : bookingIsOpen ? '관객이 좌석을 선택하고 예약할 수 있습니다.' : '접수 열기를 누르면 관객 예매가 가능합니다.'}</p></div><div className="control-actions"><span className={`site-status ${bookingIsOpen ? 'is-open' : 'is-closed'}`}>{bookingIsOpen ? '접수 중' : '접수 마감'}</span><button className="admin-action" disabled={busy || event.status !== 'published'} title={event.status !== 'published' ? '공연을 먼저 게시해주세요.' : ''} onClick={() => run(() => api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ bookingOpen: !bookingIsOpen, showId }) }), bookingIsOpen ? '예매 접수를 닫았습니다.' : '예매 접수를 열었습니다.')}>{bookingIsOpen ? '접수 닫기' : event.status === 'published' ? '접수 열기' : '게시 후 접수 가능'}</button></div></section><div className="metrics"><div className="metric"><span>전체 예매</span><strong>{summary?.totalBookings || 0} <small>건</small></strong></div><div className="metric"><span>입금 대기</span><strong>{summary?.pendingBookings || 0} <small>건</small></strong></div><div className="metric"><span>확정 좌석</span><strong>{summary?.confirmedSeats || 0} <small>석</small></strong></div></div>{seatMap}<section className="panel checkin-dashboard"><div className="checkin-heading"><div><div className="eyebrow">LIVE ENTRY STATUS</div><h2>입장 현황</h2></div><button className="admin-action" onClick={() => { setScanResult(null); setScanValue(''); setScanner(true); }}>입장 QR 스캔</button></div><div className="checkin-progress"><div><strong>{checkin?.checkedIn || 0}</strong><span> / {checkin?.total || 0}석 입장 완료</span></div></div><div className="checkin-columns"><div><h3>열별 입장</h3>{checkin?.rows?.map(row => <p key={row.row}>{row.row}열　{row.checked_in}/{row.total}</p>)}</div><div><h3>최근 입장 처리</h3>{checkin?.recent?.map((ticket, index) => <p key={`${ticket.seat}-${ticket.checked_in_at || index}`}>{ticket.seat} · {new Date(ticket.checked_in_at).toLocaleTimeString('ko-KR')}</p>)}</div></div></section><Bookings data={bookings} loading={!bookings} hasCursor={Boolean(cursor)} onPage={next => { setCursor(next ? { showId, ...bookings?.nextCursor } : null); }} onAction={async (id, action) => run(() => api(`/api/admin/bookings/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' }), '예약 상태를 갱신했습니다.')} />{scanner && <CheckinModal showId={showId} onClose={() => setScanner(false)} onResult={setScanResult} result={scanResult} value={scanValue} setValue={setScanValue} />}</>;

  return <div className="admin-react">{header}{error && <div className="error-text" role="alert">{error}<button className="admin-action" onClick={() => screen === 'list' ? loadEvents().catch(e => setError(e.message)) : refresh()}>다시 시도</button></div>}{screen === 'list' ? eventList : detail || <section className="panel"><h2>공연을 찾을 수 없습니다.</h2><button className="admin-action" onClick={back}>공연 목록</button></section>}{toast && <div className="toast" role="status">{toast}</div>}{editor !== undefined && editor !== false && <EventEditor event={editor} onClose={() => setEditor(false)} onSave={payload => run(async () => { await api(editor?.id ? `/api/admin/events/${encodeURIComponent(editor.id)}` : '/api/admin/events', { method: editor?.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); setEditor(false); }, '공연 초안을 저장했습니다.')} />}{modal.startsWith('delete:') && <DeleteEvent event={events.find(item => item.id === modal.slice(7))} onClose={() => setModal('')} onDelete={async (id, confirmation) => { const ok = await run(() => api(`/api/admin/events/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirmation }) }), '공연과 연결 기록을 삭제했습니다.'); if (ok) { setModal(''); back(); } }} />}{modal === 'password' && <PasswordDialog onClose={() => setModal('')} onChange={async payload => { setBusy(true); try { await api('/api/admin/password', { method: 'POST', body: JSON.stringify(payload) }); setAuth('logged-out'); setModal(''); notify('비밀번호가 변경되었습니다. 다시 로그인해주세요.'); } catch (problem) { throw problem; } finally { setBusy(false); } }} />}{selectedOrder && <div className="modal-backdrop"><section className="modal"><button className="close" onClick={() => setSelectedOrder(null)}>×</button><div className="eyebrow">SEAT BOOKING</div><h2>{selectedOrder.seat} 좌석 예약 정보</h2><p><strong>{selectedOrder.order.name}</strong><br />예약 코드 {selectedOrder.order.id}<br />연락처 {selectedOrder.order.phone}<br />입금자명 {selectedOrder.order.payer}<br />{Number(selectedOrder.order.amount).toLocaleString()}원 · {selectedOrder.order.seats.length}석</p></section></div>}</div>;
}

function AdminSeatMap({ orders, onSeat }) {
  const states = useMemo(() => { const map = new Map(); for (const order of orders) for (const seat of order.seats || []) { const ticket = order.tickets?.find(item => item.seat === seat); map.set(seat, { state: order.status === 'pending' ? 'held' : ticket?.status === 'checked_in' ? 'checked_in' : order.status === 'paid' ? 'sold' : order.status === 'refund_pending' ? 'refund_pending' : 'available' }); } return map; }, [orders]);
  return <section className="panel admin-seat-panel"><div className="admin-seat-heading"><div className="eyebrow">SEAT STATUS</div><h2>선택 회차 좌석 배치도</h2><p>예약된 좌석을 누르면 예약 상세를 확인할 수 있습니다.</p></div><div className="stage">S T A G E</div><div className="seat-grid admin-seat-grid">{Array.from({ length: 12 }, (_, row) => { const letter = String.fromCharCode(65 + row); const count = letter === 'L' ? 8 : 12; return <div className={`seat-row ${letter === 'L' ? 'short-row' : ''}`} key={letter}><span className="row-label">{letter}</span>{Array.from({ length: count }, (_, col) => { const seat = `${letter}${String(col + 1).padStart(2, '0')}`; const state = letter === 'A' ? 'reserved' : states.get(seat)?.state || 'available'; const order = orders.find(item => item.seats?.includes(seat)); return <button type="button" className={`seat ${state}`} title={`${seat} · ${state}`} aria-label={`${seat} ${state}${order ? ', 예약 상세 보기' : ''}`} key={seat} disabled={!order} onClick={() => onSeat({ seat, order })}>{String(col + 1).padStart(2, '0')}</button>; })}</div>; })}</div><div className="legend admin-seat-legend"><span><i className="dot held" />입금 대기</span><span><i className="dot sold" />예매 완료</span><span><i className="dot checked-in" />입장 완료</span><span><i className="dot refund_pending" />환불 대기</span></div></section>;
}

function Bookings({ data, loading, hasCursor, onPage, onAction }) {
  return <section className="panel orders"><div className="orders-top"><h2>회차 예매 목록</h2><span>최근 50건</span></div>{loading ? <p>예매 내역을 불러오는 중입니다.</p> : data?.bookings?.length ? data.bookings.map(order => <article className="order" key={order.id}><div className="order-name">{order.name}<small>{order.id} · {new Date(order.createdAt).toLocaleString('ko-KR')}</small></div><div className="order-cell">{order.seats.join(', ')}<small>{Number(order.amount).toLocaleString()}원 · 입금자 {order.payer}</small></div><div className="order-cell">{order.phone}<small>{order.seats.length}석</small></div><div><span className="badge">{({ pending: '입금 대기', paid: '입금 확인', refund_pending: '환불 대기', refunded: '환불 완료', cancelled: '취소됨', expired: '만료' })[order.status] || order.status}</span><small className="sms-status">문자: {({ sending: '처리 중', accepted: '발송 접수', failed: '실패', uncertain: '확인 필요', not_configured: '설정 필요', untracked: '기록 없음' })[order.notificationStatus] || '—'}</small></div><div className="order-actions">{order.status === 'pending' && <button className="admin-action" onClick={() => window.confirm(`예약 ${order.id}의 입금을 확인했나요?`) && onAction(order.id, 'confirm')}>입금 확인</button>}{['pending', 'paid'].includes(order.status) && <button className="admin-action danger" onClick={() => window.confirm(order.status === 'paid' ? '환불 대기로 전환합니다. 실제 송금 후 환불 완료 처리해야 합니다.' : '예약을 취소하고 좌석을 즉시 해제할까요?') && onAction(order.id, 'cancel')}>예약 취소</button>}{order.status === 'refund_pending' && <button className="admin-action" onClick={() => window.confirm('실제 환불 송금을 완료했나요?') && onAction(order.id, 'refund-complete')}>환불 완료</button>}{order.status === 'paid' && ['failed', 'not_configured', 'untracked'].includes(order.notificationStatus) && <button className="admin-action" onClick={() => (order.notificationStatus !== 'untracked' || window.confirm('이전 문자 발송 이력이 없습니다. 발송 내역에서 중복 문자가 없는지 확인했나요?')) && onAction(order.id, 'retry-sms')}>문자 재전송</button>}</div></article>) : <div className="empty-admin">이 회차에는 예매 내역이 없습니다.</div>}<div className="booking-pagination"><button className="admin-action" hidden={!hasCursor} onClick={() => onPage(false)}>최신 예약</button><button className="admin-action" hidden={!data?.nextCursor} onClick={() => onPage(true)}>이전 예약 50건</button></div></section>;
}

function EventEditor({ event, onClose, onSave }) {
  const initial = event?.sessions ? event : { title: '', subtitle: '', description: '', venue: '', ticketPrice: 6500, sessions: [{ startsAt: '' }] };
  const [sessions, setSessions] = useState(initial.sessions.map(s => ({ date: s.startsAt?.slice(0, 10) || '', time: s.startsAt?.slice(11, 16) || '' })));
  return <div className="modal-backdrop"><section className="modal"><button className="close" onClick={onClose}>×</button><h2>{event?.id ? '공연 초안 수정' : '새 공연 만들기'}</h2><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); onSave({ title: f.get('title'), subtitle: f.get('subtitle'), description: f.get('description'), venue: f.get('venue'), ticketPrice: Number(f.get('price')), sessions: sessions.map(s => ({ startsAt: `${s.date}T${s.time}:00+09:00`, dateLabel: dateLabel(s.date), timeLabel: timeLabel(s.time) })) }); }}><label>공연 제목<input name="title" required defaultValue={initial.title} /></label><label>부제<input name="subtitle" defaultValue={initial.subtitle} /></label><label>공연 소개<textarea name="description" defaultValue={initial.description} /></label><label>장소<input name="venue" required defaultValue={initial.venue} /></label><label>가격<input name="price" type="number" min="1" defaultValue={initial.ticketPrice} /></label><h3>회차 일정</h3>{sessions.map((s, i) => <div className="event-session-fields" key={i}><label>날짜<input type="date" required value={s.date} onChange={e => setSessions(xs => xs.map((x, n) => n === i ? { ...x, date: e.target.value } : x))} /></label><label>시간<input type="time" required value={s.time} onChange={e => setSessions(xs => xs.map((x, n) => n === i ? { ...x, time: e.target.value } : x))} /></label><button type="button" className="admin-action danger" disabled={sessions.length < 2} onClick={() => setSessions(xs => xs.filter((_, n) => n !== i))}>회차 삭제</button></div>)}<button type="button" className="admin-action" onClick={() => setSessions(xs => [...xs, { date: '', time: '' }])}>회차 추가</button><button className="primary">초안 저장</button></form></section></div>;
}

function DeleteEvent({ event, onClose, onDelete }) { const [value, setValue] = useState(''); return <div className="modal-backdrop"><section className="modal"><button className="close" onClick={onClose}>×</button><h2>공연 및 기록 영구 삭제</h2><p>{event?.title}와 연결된 예약·티켓 기록을 삭제합니다. 복구할 수 없습니다.</p><p>삭제하려면 공연 제목을 입력하세요.</p><input value={value} onChange={e => setValue(e.target.value)} /><button className="admin-action danger" disabled={value !== event?.title} onClick={() => onDelete(event.id, value)}>영구 삭제</button></section></div>; }
function PasswordDialog({ onClose, onChange }) { const [error, setError] = useState(''); return <div className="modal-backdrop"><section className="modal"><button className="close" onClick={onClose}>×</button><h2>비밀번호 변경</h2><form onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (f.get('next') !== f.get('confirm')) { setError('새 비밀번호가 일치하지 않습니다.'); return; } try { await onChange({ currentPassword: f.get('current'), newPassword: f.get('next') }); } catch (problem) { setError(problem.message); } }}><label>현재 비밀번호<input name="current" type="password" required /></label><label>새 비밀번호<input name="next" type="password" minLength="12" required /></label><label>새 비밀번호 확인<input name="confirm" type="password" minLength="12" required /></label>{error && <p className="error-text">{error}</p>}<button className="primary">비밀번호 변경</button></form></section></div>; }
function CheckinModal({ showId, onClose, onResult, result, value, setValue }) { const [error, setError] = useState(''); const [camera, setCamera] = useState(false); useEffect(() => { if (!camera) return; const scanner = new Html5Qrcode('react-checkin-reader'); scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 180 } }, async decoded => { setValue(decoded.replace(/^TKT:/i, '')); setCamera(false); await scanner.stop().catch(() => {}); }).catch(problem => setError(problem.message || '카메라를 시작하지 못했습니다.')); return () => { if (scanner.isScanning) scanner.stop().catch(() => {}); }; }, [camera, setValue]); const submit = async e => { e.preventDefault(); setError(''); try { const code = value.trim().replace(/^TKT:/i, ''); const input = code.includes(':') ? { bookingId: code.split(':')[0], seat: code.split(':')[1], showId } : { ticketId: code, showId }; const data = await api('/api/admin/tickets/check-in', { method: 'POST', body: JSON.stringify(input) }); onResult(data.ticket); setError(''); } catch (problem) { setError(problem.message); } }; return <div className="modal-backdrop"><section className="modal"><button className="close" onClick={onClose}>×</button><h2>입장 확인</h2><p>선택한 회차의 QR 티켓을 스캔하세요. 카메라를 쓸 수 없으면 티켓 코드 또는 예약코드:좌석을 입력할 수 있습니다.</p><div id="react-checkin-reader" />{!camera && <button className="admin-action" onClick={() => { setError(''); setCamera(true); }}>카메라로 QR 스캔</button>}<form onSubmit={submit}><input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="티켓 코드 또는 예약코드:B01" /><button className="primary">입장 처리</button></form>{error && <p className="error-text">{error}</p>}{result && <p role="status">입장 확인 완료 · {result.name} · {result.seat}</p>}</section></div>; }

