import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text || '{}'); } catch { throw new Error('예매 서버가 응답하지 않았습니다. 잠시 후 다시 시도해주세요.'); }
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
};

const rows = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
const statusText = { paid: '입금 확인 · 예매 확정', pending: '입금 대기', expired: '예약 만료', cancelled: '취소됨 · 입금 전 예약', refund_pending: '취소 접수 · 환불 처리 중', refunded: '환불 완료' };

export function PublicApp() {
  const [event, setEvent] = useState(undefined);
  const [selectedShow, setSelectedShow] = useState('');
  const [seatData, setSeatData] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatError, setSeatError] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const activeEventId = useRef('');
  const session = event?.sessions?.find(item => item.id === selectedShow) || null;
  const price = Number(event?.ticketPrice || seatData?.price || 0);
  const bookingOpen = Boolean(seatData?.bookingOpen);

  const refreshEvent = useCallback(async () => {
    try {
      const result = await api('/api/event');
      const next = result.event;
      const changed = activeEventId.current !== (next?.id || '');
      activeEventId.current = next?.id || '';
      setEvent(next || null);
      if (!next) { setSelectedShow(''); setSelectedSeats([]); setSeatData(null); return; }
      setSelectedShow(current => changed || !next.sessions.some(item => item.id === current) ? next.sessions[0]?.id || '' : current);
      if (changed) { setSelectedSeats([]); setSeatData(null); }
      setSeatError('');
    } catch (problem) { setSeatError(problem.message); setEvent(current => current === undefined ? null : current); }
  }, []);

  const refreshSeats = useCallback(async (show = selectedShow) => {
    if (!show) { setSeatData(null); return; }
    try {
      const result = await api(`/api/seats?show=${encodeURIComponent(show)}`);
      if (show !== selectedShow) return;
      setSeatData(result);
      setSeatError('');
      setSelectedSeats(current => current.filter(seat => result.seats[seat] === 'available'));
    } catch (problem) {
      if (show !== selectedShow) return;
      setSeatData(null);
      setSeatError(problem.message);
    }
  }, [selectedShow]);

  useEffect(() => { refreshEvent(); const timer = setInterval(refreshEvent, 12000); return () => clearInterval(timer); }, [refreshEvent]);
  useEffect(() => { setSeatData(null); setSelectedSeats([]); refreshSeats(selectedShow); const timer = setInterval(() => refreshSeats(selectedShow), 12000); return () => clearInterval(timer); }, [selectedShow, refreshSeats]);
  useEffect(() => { document.title = event ? `${event.title} — ${event.subtitle || '공연 예매'}` : '공연 일정 준비 중'; }, [event]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const match = /^#t=([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.exec(location.hash);
    if (!match) return;
    api('/api/ticket-link', { method: 'POST', body: JSON.stringify({ token: match[1] }) })
      .then(data => setModal({ type: 'linked-ticket', data }))
      .catch(error => setModal({ type: 'ticket-error', error: error.message }));
  }, []);

  const chooseSession = id => { if (id === selectedShow) return; setSelectedShow(id); setSeatData(null); setSelectedSeats([]); };
  const toggleSeat = seat => setSelectedSeats(current => current.includes(seat) ? current.filter(item => item !== seat) : current.length >= 2 ? current : [...current, seat].sort());
  const openBooking = () => {
    if (!bookingOpen) { setToast('현재 예매 접수 기간이 아닙니다.'); return; }
    if (selectedSeats.length) setModal({ type: 'booking' });
  };
  const submitBooking = async payload => {
    const booking = await api('/api/bookings', { method: 'POST', body: JSON.stringify({ ...payload, seats: selectedSeats, showId: selectedShow }) });
    setSelectedSeats([]); setModal({ type: 'booking-success', booking, session });
    refreshSeats(selectedShow);
  };
  const openLookup = prefill => setModal({ type: 'lookup', prefill: prefill || '' });
  const submitLookup = async (id, phone) => api('/api/booking-lookup', { method: 'POST', body: JSON.stringify({ id, phone }) });

  const dates = useMemo(() => [...new Set(event?.sessions?.map(item => item.dateLabel) || [])], [event]);
  const seats = <div className="seat-grid">{rows.map(letter => { const count = letter === 'L' ? 8 : 12; return <div className={`seat-row ${letter === 'L' ? 'short-row' : ''}`} key={letter}><span className="row-label">{letter}</span>{Array.from({ length: count }, (_, index) => { const seat = `${letter}${String(index + 1).padStart(2, '0')}`; const state = seatData?.seats?.[seat] || 'available'; const picked = state === 'available' && selectedSeats.includes(seat); const label = { available: picked ? '선택됨' : '선택 가능', sold: '예매 완료', held: '입금 대기', refund_pending: '환불 처리 중', reserved: '운영진 보유석, 예매 불가' }[state] || '예매 불가'; return <React.Fragment key={seat}>{index + 1 === (count === 8 ? 5 : 7) && <span className="aisle" aria-hidden="true" />}<button type="button" className={`seat ${picked ? 'selected' : state === 'available' ? '' : state}`} disabled={!bookingOpen || state !== 'available'} title={`좌석 ${letter}열 ${index + 1}번`} aria-label={`좌석 ${letter}열 ${index + 1}번 ${label}`} onClick={() => toggleSeat(seat)}>{String(index + 1).padStart(2, '0')}</button></React.Fragment>; })}</div>; })}</div>;

  return <>
    <section className="hero">
      <div className="hero-banner"><div className="hero-copy">
        <h1>{event?.title || (event === null ? '현재 공개된 공연이 없습니다' : '공연 일정 확인 중')}</h1>
        {event?.subtitle && <p>{event.subtitle}</p>}{event?.description && <p>{event.description}</p>}
        <div className="hero-meta"><span>{dates.length > 1 ? `${dates[0]} – ${dates[dates.length - 1]}` : dates[0] || '공연 일정 준비 중'}</span><span>{event ? `총 ${event.sessions.length}회 공연 · 회차 선택` : '회차 미정'}</span><span>{event?.venue || '공연 일정 준비 중'}</span><span>{event ? `전석 ${price.toLocaleString()}원` : '티켓 가격 미정'}</span></div>
        <button className="hero-cta" type="button" onClick={() => document.querySelector('.seat-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>좌석 예매하기 →</button>
      </div><img className="hero-logo" src="즉새두로고1.png" alt="즉새두 2AM 로고" /></div>
    </section>
    <section className="content">
      <div className="panel seat-panel"><div className="section-head"><div><h2>좌석을 선택해주세요</h2><p>1열은 운영진석 · 2–11열은 6석씩 · 마지막 열은 좌우 4석 · 회차별 선착순</p></div><div className="price-tag">{event ? `전석 ${price.toLocaleString()}원` : '공연 일정 준비 중'}</div></div>
        {(seatError || !event || !bookingOpen) && <div className="booking-closed" role="status"><strong>{seatError ? '좌석 정보를 불러오지 못했습니다.' : !event ? '현재 공개된 공연이 없습니다.' : '현재 예매 접수를 받고 있지 않습니다.'}</strong><span>{seatError ? `${seatError} 인터넷 연결을 확인하고 다시 시도해주세요.` : !event ? '새 공연 일정이 등록되면 예매를 시작할 수 있습니다.' : '예매 기간에 다시 방문해주세요. 운영진이 접수를 열면 좌석을 선택할 수 있습니다.'}</span>{seatError && <button className="admin-action" type="button" onClick={() => { refreshEvent(); refreshSeats(); }}>다시 시도</button>}</div>}
        <div className="show-picker" role="group" aria-label="공연 회차 선택">{event?.sessions.map(item => <button type="button" className={`show-option ${item.id === selectedShow ? 'active' : ''}`} key={item.id} onClick={() => chooseSession(item.id)}>{item.sortOrder}공 · {item.dateLabel} {item.timeLabel}</button>)}</div>
        <div className="stage">S T A G E</div>{seats}<div className="legend"><span><i className="dot" /> 선택 가능</span><span><i className="dot sel" /> 선택됨</span><span><i className="dot sold" /> 예매 완료</span><span><i className="dot held" /> 입금 대기</span><span><i className="dot reserved" /> 운영진 보유석</span></div>
      </div>
      <div className="side-column"><aside className="panel sidebar"><h3>예매 정보</h3><div className="info-row"><span>공연 일시</span><strong>{session?.dateLabel || '공연 일정 준비 중'}</strong></div><div className="info-row"><span>공연 시간</span><strong>{session?.timeLabel || ''}</strong></div><div className="info-row"><span>공연 장소</span><strong>{event?.venue || ''}</strong></div><div className={selectedSeats.length ? '' : 'summary-empty'}>{selectedSeats.length ? selectedSeats.map(seat => <div className="summary-seat" key={seat}><span>좌석 {seat}</span><span>{price.toLocaleString()}원</span></div>) : <>좌석을 선택하면<br />예매 정보가 여기에 표시돼요.</>}</div><div className="total"><span>총 예매 금액</span><strong>{(selectedSeats.length * price).toLocaleString()}원</strong></div><button className="primary" disabled={!selectedSeats.length || !bookingOpen} onClick={openBooking}>{seatError ? '좌석 정보를 확인할 수 없습니다' : !bookingOpen ? '현재 예매가 마감되었습니다' : selectedSeats.length ? `${selectedSeats.length}석 예매 신청하기` : '좌석을 선택해주세요'}</button><button className="secondary" onClick={() => openLookup('')}>내 예약 조회</button></aside>
        <section className="panel guide" aria-labelledby="guide-title"><h2 id="guide-title">안내 사항</h2><div className="notice"><strong>입금 계좌</strong><p>카카오뱅크 <b>3333376900284</b><br />예약 코드와 예매자 이름을 입금 메모에 적어주세요.</p></div><div className="notice"><strong>문의</strong><p>예매와 환불 문의는 인스타그램 <a className="instagram-link" href="https://instagram.com/impromptu__2am" target="_blank" rel="noopener">@impromptu__2am</a> DM으로 보내주세요.</p></div></section>
      </div>
    </section>
    {toast && <div className="toast" role="status">{toast}</div>}
    {modal?.type === 'booking' && <BookingDialog event={event} session={session} seats={selectedSeats} price={price} onClose={() => setModal(null)} onSubmit={submitBooking} />}
    {modal?.type === 'booking-success' && <BookingSuccess booking={modal.booking} session={modal.session} onClose={() => setModal(null)} onLookup={() => openLookup(modal.booking.id)} />}
    {modal?.type === 'lookup' && <LookupDialog prefill={modal.prefill} onClose={() => setModal(null)} onLookup={submitLookup} onResult={booking => setModal({ type: 'booking-result', booking })} />}
    {modal?.type === 'booking-result' && <BookingResult booking={modal.booking} onClose={() => setModal(null)} />}
    {modal?.type === 'linked-ticket' && <LinkedTicket data={modal.data} onClose={() => { setModal(null); location.hash = ''; }} />}
    {modal?.type === 'ticket-error' && <TicketError message={modal.error} onClose={() => { setModal(null); location.hash = ''; }} />}
  </>;
}

function Dialog({ children, onClose, className = '' }) { return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className={`modal ${className}`} role="dialog" aria-modal="true"> <button className="close" type="button" aria-label="닫기" onClick={onClose}>×</button>{children}</section></div>; }

function BookingDialog({ event, session, seats, price, onClose, onSubmit }) {
  const [values, setValues] = useState({ name: '', phone: '', payer: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const validate = (field, value) => {
    const text = value.trim();
    if (field === 'name' && !text) return '예매자 이름을 입력해주세요.';
    if (field === 'name' && text.length > 40) return '이름은 40자 이내로 입력해주세요.';
    if (field === 'payer' && !text) return '실제 입금할 분의 이름을 입력해주세요.';
    if (field === 'payer' && text.length > 40) return '입금자명은 40자 이내로 입력해주세요.';
    if (field === 'phone' && !text) return '연락처를 입력해주세요. 예: 010-1234-5678';
    if (field === 'phone' && (text.replace(/\D/g, '').length < 10 || text.replace(/\D/g, '').length > 11)) return '연락처 숫자를 10~11자리로 입력해주세요. 예: 010-1234-5678';
    return '';
  };
  const change = (field, value) => { setValues(current => ({ ...current, [field]: value })); if (errors[field]) setErrors(current => ({ ...current, [field]: validate(field, value) })); };
  const submit = async e => { e.preventDefault(); const next = Object.fromEntries(Object.entries(values).map(([field, value]) => [field, validate(field, value)])); setErrors(next); if (Object.values(next).some(Boolean)) return; setBusy(true); setServerError(''); try { await onSubmit(values); } catch (problem) { setServerError(problem.message); setBusy(false); } };
  return <Dialog onClose={onClose}><div className="eyebrow">BOOK YOUR SEAT</div><h2>예매 정보를 입력해주세요</h2><p className="sub">{session?.sortOrder}공 · {session?.dateLabel} {session?.timeLabel}<br />{seats.join(', ')} · {(seats.length * price).toLocaleString()}원</p><div className="form-guidance"><strong>입력을 마치고 ‘입금 대기 예약하기’를 눌러주세요.</strong><span>이름과 입금자명을 적고, 연락처는 숫자 10~11자리로 입력하면 됩니다. 입력이 잘못된 칸은 아래에 안내해드려요.</span></div><form className="booking-form" noValidate onSubmit={submit}><div className="form-grid">{[['name','예매자 이름','예: 홍길동','예매할 분의 이름을 입력해주세요.'],['phone','연락처','예: 010-1234-5678','예약 조회에 사용하며, 예매가 확정되면 안내 문자를 한 번 보내드립니다.'],['payer','입금자명','예: 홍길동','계좌에 실제로 송금할 분의 이름을 적어주세요.']].map(([key,label,placeholder,help]) => <div className="field" key={key}><label htmlFor={`book-${key}`}>{label} <span>필수</span></label><input id={`book-${key}`} name={key} autoComplete={key === 'phone' ? 'tel' : 'name'} type={key === 'phone' ? 'tel' : 'text'} inputMode={key === 'phone' ? 'tel' : undefined} maxLength={key === 'phone' ? 20 : 40} placeholder={placeholder} value={values[key]} aria-invalid={Boolean(errors[key])} onChange={e => change(key, e.target.value)} onBlur={e => setErrors(current => ({ ...current, [key]: validate(key, e.target.value) }))} /><small className="field-help">{help}</small>{errors[key] && <small className="field-error" aria-live="polite">{errors[key]}</small>}</div>)}</div><div className="bank-box"><strong>입금 계좌 안내</strong><br />카카오뱅크 <strong>3333376900284</strong><br />입금 기한: 예약 후 30분 이내</div><p className="hint">예매자의 이름·연락처·입금자명은 공연 종료 후 90일간 보관한 뒤 자동 삭제합니다. 환불 처리 중인 예약은 환불 완료 후 90일간 보관합니다. <a href="/privacy" target="_blank" rel="noopener">개인정보 처리방침</a></p>{serverError && <div className="form-error-summary" role="alert">{serverError}</div>}<button className="primary" disabled={busy}>{busy ? '예약 처리 중…' : '입금 대기 예약하기'}</button><p className="hint">회차별 연락처 하나당 최대 2석입니다. 입력한 연락처로 예약을 다시 조회할 수 있어요.</p></form></Dialog>;
}

function BookingSuccess({ booking, session, onClose, onLookup }) { return <Dialog onClose={onClose}><div className="success"><div className="check">✓</div><div className="eyebrow">REQUEST RECEIVED</div><h2>입금 대기 예약이 등록됐어요</h2><p>{session?.sortOrder}공 · {session?.dateLabel} {session?.timeLabel}<br />아래 예약 코드를 입금 메모에 적어주세요.<br />입금 확인 전까지 좌석은 30분간 확보됩니다.</p><div className="code">{booking.id}</div><div style={{ margin: '0 0 12px' }}><span className="badge">● 입금 대기</span></div><div className="bank-box" style={{ textAlign: 'left' }}><strong>입금 계좌 안내</strong><br />카카오뱅크 <strong>3333376900284</strong><br />입금액 {Number(booking.amount).toLocaleString()}원 · 입금자명은 신청 내용과 동일하게</div><p className="hint">예약이 확정되면 입력한 연락처로 문자 안내를 한 번 보내드립니다.</p><button className="primary" onClick={onLookup}>예약 정보 보기</button></div></Dialog>; }

function LookupDialog({ prefill, onClose, onLookup, onResult }) {
  const [id, setId] = useState(prefill || ''); const [phone, setPhone] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async e => { e.preventDefault(); setBusy(true); setError(''); try { onResult(await onLookup(id, phone)); } catch (problem) { setError(problem.message); setBusy(false); } };
  return <Dialog onClose={onClose}><div className="eyebrow">FIND YOUR BOOKING</div><h2>내 예약 조회</h2><p className="sub">예매할 때 입력한 연락처를 입력해주세요.</p><form onSubmit={submit}><div className="form-grid"><div className="field"><label htmlFor="lookup-code">예약 코드</label><input id="lookup-code" required placeholder="STG-ABC123" value={id} onChange={e => setId(e.target.value)} /></div><div className="field"><label htmlFor="lookup-phone">연락처</label><input id="lookup-phone" type="tel" required placeholder="010-1234-5678" value={phone} onChange={e => setPhone(e.target.value)} /></div></div>{error && <div className="error-text" role="alert">{error}</div>}<button className="primary" disabled={busy}>{busy ? '조회 중…' : '예약 조회하기'}</button></form></Dialog>;
}

function BookingResult({ booking, onClose }) {
  const status = statusText[booking.status] || '상태 확인 필요';
  const paid = booking.status === 'paid';
  return <Dialog onClose={onClose}><div className="eyebrow">BOOKING LOOKUP</div><h2>예약 내역</h2><p className="sub">예약 코드 {booking.id}</p><div className="bank-box"><strong>{booking.showNumber}공 · {booking.dateLabel} {booking.timeLabel}</strong><br /><strong>{booking.name} · 좌석 {booking.seats.join(', ')}</strong><br />{Number(booking.amount).toLocaleString()}원 · 입금자 {booking.payer}<br /><span className={`badge ${paid || booking.status === 'refunded' ? 'paid' : ['expired','cancelled'].includes(booking.status) ? 'expired' : ''}`}>{status}</span></div>{paid && booking.tickets?.length ? <section className="ticket-list"><h3>입장 QR 티켓</h3><p>입장할 때 좌석별 QR을 운영진에게 보여주세요.</p>{booking.tickets.map(ticket => <article className="ticket-card" key={ticket.id}><TicketQr ticket={ticket} size={180} /><div><strong>{ticket.seat} 좌석</strong><span className={`ticket-state ${ticket.status === 'checked_in' ? 'used' : ''}`}>{ticket.status === 'checked_in' ? '입장 완료' : '입장 전'}</span><small>{booking.showNumber}공 · {booking.dateLabel} {booking.timeLabel}</small></div></article>)}</section> : paid ? <p className="hint">티켓을 준비하고 있습니다. 잠시 후 예약을 다시 조회해주세요.</p> : null}<p className="hint">예약 코드와 연락처로 언제든 다시 조회할 수 있어요.</p></Dialog>;
}

function TicketQr({ ticket, size }) { const canvas = useRef(null); useEffect(() => { if (canvas.current) QRCode.toCanvas(canvas.current, `TKT:${ticket.id}`, { width: size, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {}); }, [ticket.id, size]); return <canvas ref={canvas} aria-label={`${ticket.seat} 입장 QR`} />; }

function LinkedTicket({ data, onClose }) {
  const [index, setIndex] = useState(0); const tickets = data.tickets || []; const ticket = tickets[index];
  if (!ticket) return <TicketError message="이 예약의 QR 티켓을 찾지 못했습니다." onClose={onClose} />;
  return <Dialog onClose={onClose} className="linked-ticket-dialog"><div className="eyebrow">OFFICIAL ENTRY TICKET</div><h2>공연 입장 QR</h2><section className="event-ticket-info"><strong>{data.eventTitle || '공연 입장'}</strong><b>{data.subtitle || ''}</b><span>{data.showNumber || data.showId}공 · {data.dateLabel} {data.timeLabel}</span><span>{data.venue || ''}</span></section><p className="sub">입장할 때 현재 화면의 좌석별 QR을 운영진에게 보여주세요.</p><section className="ticket-list linked-ticket-list"><article className="ticket-card linked-ticket-card"><TicketQr ticket={ticket} size={220} /><div><strong>{ticket.seat} 좌석</strong><span className={`ticket-state ${ticket.status === 'checked_in' ? 'used' : ''}`}>{ticket.status === 'checked_in' ? '입장 완료' : '입장 전'}</span></div></article><div className="ticket-nav"><button className="admin-action" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>← 이전 좌석</button><span>{index + 1} / {tickets.length}</span><button className="admin-action" disabled={index === tickets.length - 1} onClick={() => setIndex(i => i + 1)}>다음 좌석 →</button></div></section><p className="hint">이 페이지는 공연 입장 티켓입니다. 티켓 링크는 예매자만 보관해주세요.</p></Dialog>;
}

function TicketError({ message, onClose }) { return <Dialog onClose={onClose}><div className="eyebrow">ENTRY TICKET</div><h2>QR 링크를 열 수 없습니다</h2><p className="sub">{message}</p><p className="hint">예약이 취소됐거나 링크에 문제가 있다면 공연 계정으로 문의해주세요.</p></Dialog>; }
