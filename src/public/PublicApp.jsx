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
function withoutYear(label) {
  return String(label || '').replace(/^\d{4}년\s*/, '');
}

const ROADMAP_STEPS = [
  { step: 1, title: '좌석 선택' },
  { step: 2, title: '입금' },
  { step: 3, title: '입금 확인' },
  { step: 4, title: '입장권 발급' },
  { step: 5, title: 'QR 스캔 후 입장' },
];

export function pageFromHash(hash) {
  const ticket = /^#t=([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.exec(hash);
  if (ticket) return { name: 'ticket', token: ticket[1] };
  if (hash === '#booking-guide') return { name: 'guide' };
  if (hash === '#booking-lookup') return { name: 'lookup' };
  if (hash === '#booking-seats') return { name: 'seats' };
  return { name: 'home' };
}

function roadmapProgress(status) {
  if (status === 'pending') return { current: 2, doneUntil: 1, halted: false, hint: '좌석은 잡아 두었어요. 입금 메모에 예약 코드와 이름을 적어주세요. 이미 입금했다면 운영진 확인을 기다려 주세요.' };
  if (status === 'paid') return { current: 5, doneUntil: 4, halted: false, hint: '입금이 확인되고 입장권이 준비되었어요. 공연 당일 QR을 보여주면 입장할 수 있어요.' };
  if (status === 'expired') return { current: 0, doneUntil: 1, halted: true, hint: '입금 시간이 지나 예약이 만료되었어요. 이 예약으로는 입장할 수 없어요.' };
  if (status === 'cancelled') return { current: 0, doneUntil: 1, halted: true, hint: '입금 전에 취소된 예약이에요. 이 예약으로는 입장할 수 없어요.' };
  if (status === 'refund_pending') return { current: 0, doneUntil: 3, halted: true, hint: '환불을 처리하고 있어요. 이 예약으로는 입장할 수 없어요.' };
  if (status === 'refunded') return { current: 0, doneUntil: 3, halted: true, hint: '환불이 완료되었어요. 이 예약으로는 입장할 수 없어요.' };
  return { current: 0, doneUntil: 0, halted: false, hint: '예약을 조회하면 지금 어느 단계인지, 다음에 무엇을 하면 되는지 알려드려요.' };
}

function goHome() {
  history.pushState(null, '', location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function PublicApp() {
  const [hash, setHash] = useState(location.hash);
  const [event, setEvent] = useState(undefined);
  const [selectedShow, setSelectedShow] = useState('');
  const [seatData, setSeatData] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatError, setSeatError] = useState('');
  const [lookupPrefill, setLookupPrefill] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const activeEventId = useRef('');
  const page = pageFromHash(hash);
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

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => { refreshEvent(); const timer = setInterval(refreshEvent, 12000); return () => clearInterval(timer); }, [refreshEvent]);
  useEffect(() => { setSeatData(null); setSelectedSeats([]); refreshSeats(selectedShow); const timer = setInterval(() => refreshSeats(selectedShow), 12000); return () => clearInterval(timer); }, [selectedShow, refreshSeats]);
  useEffect(() => { document.title = event ? `${event.title} — ${event.subtitle || 'How’d you feel?'}` : '즉흥적 새벽 두 시 — How’d you feel?'; }, [event]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (page.name !== 'ticket') return;
    api('/api/ticket-link', { method: 'POST', body: JSON.stringify({ token: page.token }) })
      .then(data => setModal({ type: 'linked-ticket', data }))
      .catch(error => setModal({ type: 'ticket-error', error: error.message }));
  }, [page.name, page.token]);

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
  const openLookup = prefill => {
    setLookupPrefill(prefill || '');
    location.hash = '#booking-lookup';
  };
  const submitLookup = async (id, phone) => api('/api/booking-lookup', { method: 'POST', body: JSON.stringify({ id, phone }) });

  const seatMap = (
    <SeatMap
      sessions={event?.sessions || []}
      selectedShow={selectedShow}
      onChooseSession={chooseSession}
      seatData={seatData}
      selectedSeats={selectedSeats}
      bookingOpen={bookingOpen}
      onToggleSeat={toggleSeat}
    />
  );

  return <>
    {page.name === 'home' && <Poster />}
    {page.name !== 'home' && page.name !== 'ticket' && (
      <section className="booking-app">
        <header className="booking-header">
          <button className="login-back booking-back" type="button" aria-label="배너로 돌아가기" onClick={goHome}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H6M11 7l-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <nav className="booking-nav" aria-label="예매 페이지">
            <a href="#booking-seats" className={page.name === 'seats' ? 'active' : ''}>예약</a>
            <a href="#booking-guide" className={page.name === 'guide' ? 'active' : ''}>예약 안내</a>
            <a href="#booking-lookup" className={page.name === 'lookup' ? 'active' : ''}>예약 조회</a>
          </nav>
        </header>
        {page.name === 'seats' && (
          <div className="content" id="booking-seats">
            <div className="panel seat-panel">
              <div className="section-head"><h2>좌석을 선택해주세요</h2></div>
              {(seatError || !event || !bookingOpen) && (
                <div className="booking-closed" role="status">
                  <strong>{seatError ? '좌석 정보를 불러오지 못했습니다.' : !event ? '현재 공개된 공연이 없습니다.' : '현재 예매 접수를 받고 있지 않습니다.'}</strong>
                  <span>{seatError ? `${seatError} 인터넷 연결을 확인하고 다시 시도해주세요.` : !event ? '새 공연 일정이 등록되면 예매를 시작할 수 있습니다.' : '예매 기간에 다시 방문해주세요. 운영진이 접수를 열면 좌석을 선택할 수 있습니다.'}</span>
                  {seatError && <button className="admin-action" type="button" onClick={() => { refreshEvent(); refreshSeats(); }}>다시 시도</button>}
                </div>
              )}
              {seatMap}
            </div>
            <div className="side-column">
              <aside className="panel sidebar">
                <h3>예매 정보</h3>
                <div className="info-row"><span>공연 일시</span><strong>{session?.dateLabel || '공연 일정 준비 중'}</strong></div>
                <div className="info-row"><span>공연 시간</span><strong>{session?.timeLabel || ''}</strong></div>
                <div className="info-row"><span>공연 장소</span><strong>{event?.venue || ''}</strong></div>
                <div className={selectedSeats.length ? '' : 'summary-empty'}>
                  {selectedSeats.length
                    ? selectedSeats.map(seat => <div className="summary-seat" key={seat}><span>좌석 {seat}</span><span>{price.toLocaleString()}원</span></div>)
                    : <>좌석을 선택하면<br />예매 정보가 여기에 표시돼요.</>}
                </div>
                <div className="total"><span>총 예매 금액</span><strong>{(selectedSeats.length * price).toLocaleString()}원</strong></div>
                <button className="primary" disabled={!selectedSeats.length || !bookingOpen} onClick={openBooking}>
                  {seatError ? '좌석 정보를 확인할 수 없습니다' : !bookingOpen ? '현재 예매가 마감되었습니다' : selectedSeats.length ? `${selectedSeats.length}석 예매 신청하기` : '좌석을 선택해주세요'}
                </button>
              </aside>
            </div>
          </div>
        )}
        {page.name === 'guide' && <GuidePage />}
        {page.name === 'lookup' && <LookupPage prefill={lookupPrefill} onLookup={submitLookup} />}
      </section>
    )}
    {toast && <div className="toast" role="status">{toast}</div>}
    {modal?.type === 'booking' && <BookingDialog event={event} session={session} seats={selectedSeats} price={price} onClose={() => setModal(null)} onSubmit={submitBooking} />}
    {modal?.type === 'booking-success' && <BookingSuccess booking={modal.booking} session={modal.session} onClose={() => setModal(null)} onLookup={() => { setModal(null); openLookup(modal.booking.id); }} />}
    {modal?.type === 'linked-ticket' && <LinkedTicket data={modal.data} onClose={() => { setModal(null); goHome(); }} />}
    {modal?.type === 'ticket-error' && <TicketError message={modal.error} onClose={() => { setModal(null); goHome(); }} />}
  </>;
}

function Poster() {
  return (
    <section className="poster" aria-labelledby="poster-title">
      <svg className="poster-scene" viewBox="0 0 1440 900" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
        <defs>
          <filter id="poster-dust" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/>
            <feColorMatrix type="matrix" values="0 0 0 0 0.98  0 0 0 0 0.84  0 0 0 0 0.09  0 0 0 3.4 -2.55"/>
          </filter>
          <radialGradient id="poster-dust-mask" cx="84%" cy="6%" r="58%">
            <stop offset="0%" stopColor="#fff"/>
            <stop offset="48%" stopColor="#fff" stopOpacity="0.45"/>
            <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
          </radialGradient>
          <mask id="poster-dust-clip">
            <rect width="1440" height="900" fill="url(#poster-dust-mask)"/>
          </mask>
          <filter id="poster-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="4" seed="3"/>
            <feColorMatrix type="saturate" values="0"/>
          </filter>
          <filter id="poster-rough" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="6" result="noise"/>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
          <linearGradient id="poster-face" gradientUnits="userSpaceOnUse" x1="1200" y1="380" x2="700" y2="900">
            <stop offset="0%" stopColor="#fff4a8"/>
            <stop offset="10%" stopColor="#f9d617"/>
            <stop offset="34%" stopColor="#f9d617" stopOpacity="0.45"/>
            <stop offset="70%" stopColor="#1f2059" stopOpacity="0"/>
            <stop offset="100%" stopColor="#1f2059" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="poster-left-fade-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="24%" stopColor="#fff" stopOpacity="0"/>
            <stop offset="42%" stopColor="#fff"/>
          </linearGradient>
          <mask id="poster-left-fade">
            <rect width="1440" height="900" fill="url(#poster-left-fade-grad)"/>
          </mask>
          <clipPath id="poster-band">
            <path d="M470 830 C700 760 980 620 1440 455 L1440 820 L980 900 L470 900 Z"/>
          </clipPath>
        </defs>
        <rect width="1440" height="900" filter="url(#poster-dust)" opacity="0.22"/>
        <rect width="1440" height="520" filter="url(#poster-dust)" mask="url(#poster-dust-clip)" opacity="0.85"/>
        <g mask="url(#poster-left-fade)" filter="url(#poster-rough)">
          <g clipPath="url(#poster-band)">
            <rect width="1440" height="900" fill="url(#poster-face)"/>
            <rect width="1440" height="900" filter="url(#poster-grain)" opacity="0.55" style={{ mixBlendMode: 'overlay' }}/>
            <path fill="none" stroke="#fff6c2" strokeWidth="18" strokeLinecap="round" opacity="0.45" d="M470 830 C700 760 980 620 1440 455"/>
            <path fill="none" stroke="#fffef2" strokeWidth="1.5" strokeLinecap="round" d="M470 830 C700 760 980 620 1440 455"/>
          </g>
        </g>
        <g className="poster-lines">
          <line x1="270" y1="48" x2="600" y2="300" stroke="#f9d617" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
          <line x1="1080" y1="268" x2="1260" y2="455" stroke="#f9d617" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
        </g>
      </svg>
      <img className="poster-instruments" src="poster-instruments.png" alt="" />
      <div className="poster-frame">
        <div className="poster-copy">
          <h2 id="poster-title">
            <span className="poster-line">
              <svg className="poster-star" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.2l2.7 6.5 7 .5-5.35 4.55 1.65 6.85L12 16.05 6 19.6l1.65-6.85L2.3 8.2l7-.5z"/></svg>
              <span className="ink-yellow">즉</span><span className="ink-white">흥</span><span className="ink-yellow">적</span>
              <svg className="poster-moon" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M30 4c-2.2 6.2-2.4 14.2 0 22 1.6 5.2 4.4 9.6 8.2 12.6-8.4 2.2-18.6-1.2-24.2-8.8C8.2 22.6 8.8 12.2 15.4 6.2 19.4 2.6 24.6 1.2 30 4z"/></svg>
            </span>
            <span className="poster-line">
              <span className="ink-yellow">새</span><span className="ink-white">벽</span><span className="ink-yellow">두</span><span className="ink-white">시</span>
            </span>
          </h2>
          <p className="poster-series">26-2학기 정기공연</p>
          <p className="poster-show">How'd You Feel?</p>
        </div>
        <a className="poster-contact" href="#booking-seats">좌석 예매하기</a>
      </div>
    </section>
  );
}

function SeatMap({ sessions, selectedShow, onChooseSession, seatData, selectedSeats, bookingOpen, onToggleSeat }) {
  const selected = sessions.find(item => item.id === selectedShow);

  return (
    <div className="seat-map">
      <div className="stage-line">
        <div className="show-guide" aria-label="공연 일정">
          {sessions.map(item => (
            <div key={item.id} className="show-guide-item">
              <span>{item.sortOrder}공</span>
              <strong>{withoutYear(item.dateLabel)} {item.timeLabel}</strong>
            </div>
          ))}
        </div>
        <div className="show-chips" role="radiogroup" aria-label="공연 회차 선택">
          {sessions.map(item => {
            const active = item.id === selectedShow;
            return (
              <button
                key={item.id}
                className={`show-chip ${active ? 'active' : ''}`}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChooseSession(item.id)}
              >
                {item.sortOrder}공
              </button>
            );
          })}
        </div>
      </div>
      <p className="seat-map-caption">{selected ? `${selected.sortOrder}공 좌석` : '회차를 먼저 선택해주세요'}</p>
      <div className={`seat-grid ${selected ? '' : 'is-locked'}`}>
        {rows.map(letter => {
          const count = letter === 'L' ? 8 : 12;
          return (
            <div className={`seat-row ${letter === 'L' ? 'short-row' : ''}`} key={letter}>
              <span className="row-label">{letter}</span>
              {Array.from({ length: count }, (_, index) => {
                const seat = `${letter}${String(index + 1).padStart(2, '0')}`;
                const state = seatData?.seats?.[seat] || 'available';
                const picked = state === 'available' && selectedSeats.includes(seat);
                const label = { available: picked ? '선택됨' : '선택 가능', sold: '예매 완료', held: '입금 대기', refund_pending: '환불 처리 중', reserved: '운영진 보유석, 예매 불가' }[state] || '예매 불가';
                return (
                  <React.Fragment key={seat}>
                    {index + 1 === (count === 8 ? 5 : 7) && <span className="aisle" aria-hidden="true" />}
                    <button type="button" className={`seat ${picked ? 'selected' : state === 'available' ? '' : state}`} disabled={!selected || !bookingOpen || state !== 'available'} title={`좌석 ${letter}열 ${index + 1}번`} aria-label={`좌석 ${letter}열 ${index + 1}번 ${label}`} onClick={() => onToggleSeat(seat)}>{String(index + 1).padStart(2, '0')}</button>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="dot" /> 선택 가능</span>
        <span><i className="dot sel" /> 선택됨</span>
        <span><i className="dot sold" /> 예매 완료</span>
        <span><i className="dot held" /> 입금 대기</span>
        <span><i className="dot reserved" /> 운영진 보유석</span>
      </div>
    </div>
  );
}

function GuidePage() {
  return (
    <section className="content booking-subpage" aria-labelledby="guide-title">
      <div className="panel guide">
        <h2 id="guide-title">안내 사항</h2>
        <div className="notice">
          <strong>입금 계좌</strong>
          <p>카카오뱅크 <b>3333376900284</b><br />예약 코드와 예매자 이름을 입금 메모에 적어주세요.</p>
        </div>
        <div className="notice">
          <strong>문의</strong>
          <p>예매와 환불 문의는 인스타그램 <a className="instagram-link" href="https://instagram.com/impromptu__2am" target="_blank" rel="noopener">@impromptu__2am</a> DM으로 보내주세요.</p>
        </div>
      </div>
    </section>
  );
}

function LookupPage({ prefill, onLookup }) {
  const [id, setId] = useState(prefill || '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(null);
  const progress = useMemo(() => roadmapProgress(booking?.status || ''), [booking]);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setBooking(await onLookup(id, phone));
    } catch (problem) {
      setBooking(null);
      setError(problem.message);
    }
    setBusy(false);
  };

  return (
    <section className="content booking-subpage">
      <div className="panel lookup-panel">
        <h2>내 예약 조회</h2>
        <p className="sub">예매할 때 입력한 연락처를 입력해주세요.</p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lookup-code">예약 코드</label>
              <input id="lookup-code" required placeholder="STG-ABC123" value={id} onChange={event => setId(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lookup-phone">연락처</label>
              <input id="lookup-phone" type="tel" required placeholder="010-1234-5678" value={phone} onChange={event => setPhone(event.target.value)} />
            </div>
          </div>
          {error && <div className="error-text" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? '조회 중…' : '예약 조회하기'}</button>
        </form>
        {booking && <BookingSummary booking={booking} />}
        <EntryRoadmap progress={progress} />
      </div>
    </section>
  );
}

function BookingSummary({ booking }) {
  const status = statusText[booking.status] || '상태 확인 필요';
  const paid = booking.status === 'paid';
  const badge = paid || booking.status === 'refunded' ? 'badge paid' : ['expired', 'cancelled'].includes(booking.status) ? 'badge expired' : 'badge';
  return (
    <div id="lookup-result">
      <div className="lookup-summary">
        <strong>{booking.showNumber}공 · {booking.dateLabel} {booking.timeLabel}</strong>
        예약 코드 {booking.id} · {booking.name} · 좌석 {booking.seats.join(', ')}<br />
        {Number(booking.amount).toLocaleString()}원 · 입금자 {booking.payer}<br />
        <span className={badge}>{status}</span>
      </div>
      {paid && booking.tickets?.length ? (
        <section className="ticket-list">
          <h3>입장 QR 티켓</h3>
          <p>입장할 때 좌석별 QR을 운영진에게 보여주세요.</p>
          {booking.tickets.map(ticket => (
            <article className="ticket-card" key={ticket.id}>
              <TicketQr ticket={ticket} size={180} />
              <div>
                <strong>{ticket.seat} 좌석</strong>
                <span className={`ticket-state ${ticket.status === 'checked_in' ? 'used' : ''}`}>{ticket.status === 'checked_in' ? '입장 완료' : '입장 전'}</span>
                <small>{booking.showNumber}공 · {booking.dateLabel} {booking.timeLabel}</small>
              </div>
            </article>
          ))}
        </section>
      ) : paid ? <p className="hint">티켓을 준비하고 있습니다. 잠시 후 예약을 다시 조회해주세요.</p> : null}
    </div>
  );
}

function EntryRoadmap({ progress }) {
  return (
    <section className="entry-roadmap" aria-labelledby="roadmap-title">
      <h3 id="roadmap-title">입장까지 과정</h3>
      <ol>
        {ROADMAP_STEPS.map(item => {
          const done = item.step <= progress.doneUntil;
          const current = item.step === progress.current;
          const halted = progress.halted && !done;
          return (
            <li key={item.step} className={`${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${halted ? 'is-halted' : ''}`.trim()} aria-current={current ? 'step' : undefined}>
              <span className="step-index" aria-hidden="true">{item.step}</span>
              <span className="step-copy"><strong>{item.title}</strong></span>
            </li>
          );
        })}
      </ol>
      <p id="roadmap-hint">{progress.hint}</p>
    </section>
  );
}

function Dialog({ children, onClose, className = '' }) {
  return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className={`modal ${className}`} role="dialog" aria-modal="true"><button className="close" type="button" aria-label="닫기" onClick={onClose}>×</button>{children}</section></div>;
}

function BookingDialog({ session, seats, price, onClose, onSubmit }) {
  const [values, setValues] = useState({ name: '', phone: '', payer: '' });
  const [errors, setErrors] = useState({});
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const validate = (field, value) => {
    const text = value.trim();
    if (field === 'name' && !text) return '예매자 이름을 입력해주세요.';
    if (field === 'name' && text.length > 40) return '이름은 40자 이내로 입력해주세요.';
    if (field === 'payer' && !text) return '실제 입금할 분의 이름을 입력해주세요.';
    if (field === 'payer' && text.length > 40) return '입금자명은 40자 이내로 입력해주세요.';
    if (field === 'phone' && !text) return '연락처를 입력해주세요. 예: 010-1234-5678';
    if (field === 'phone' && (text.replace(/\D/g, '').length < 10 || text.replace(/\D/g, '').length > 11)) return '연락처 숫자를 10~11자리로 입력해주세요.';
    return '';
  };
  const change = (field, value) => {
    setValues(current => ({ ...current, [field]: value }));
    if (errors[field]) setErrors(current => ({ ...current, [field]: validate(field, value) }));
  };
  const copyAccount = async () => {
    try { await navigator.clipboard.writeText('3333376900284'); } catch { /* ignore */ }
  };
  const submit = async event => {
    event.preventDefault();
    const next = Object.fromEntries(Object.entries(values).map(([field, value]) => [field, validate(field, value)]));
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (!privacy) { setServerError('개인정보 수집에 동의해주세요.'); return; }
    setBusy(true);
    setServerError('');
    try { await onSubmit(values); } catch (problem) { setServerError(problem.message); setBusy(false); }
  };
  return (
    <Dialog onClose={onClose}>
      <h2>좌석 예매하기</h2>
      <p className="sub">{session?.dateLabel} {session?.timeLabel}<br />{seats.map(seat => `${seat}번`).join(', ')}</p>
      <div className="bank-box">
        {seats.length}석 · {(seats.length * price).toLocaleString()}원<br />
        <span className="account-line">카카오뱅크 3333376900284
          <button className="account-icon" type="button" aria-label="계좌번호 복사" onClick={copyAccount}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="12" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </span><br />
        입금 기한: 예약 후 30분 이내
      </div>
      <form className="booking-form" noValidate onSubmit={submit}>
        <div className="form-grid">
          {[['name', '예매자 이름', '예: 홍길동'], ['phone', '연락처', '예: 010-1234-5678'], ['payer', '입금자명', '예: 홍길동']].map(([key, label, placeholder]) => (
            <div className="field" key={key}>
              <label htmlFor={`book-${key}`}>{label}</label>
              <input id={`book-${key}`} name={key} autoComplete={key === 'phone' ? 'tel' : 'name'} type={key === 'phone' ? 'tel' : 'text'} inputMode={key === 'phone' ? 'tel' : undefined} maxLength={key === 'phone' ? 20 : 40} placeholder={placeholder} value={values[key]} aria-invalid={Boolean(errors[key])} onChange={e => change(key, e.target.value)} onBlur={e => setErrors(current => ({ ...current, [key]: validate(key, e.target.value) }))} />
              {errors[key] && <small className="field-error" aria-live="polite">{errors[key]}</small>}
            </div>
          ))}
        </div>
        {serverError && <div className="form-error-summary" role="alert">{serverError}</div>}
        <button className="primary" disabled={busy}>{busy ? '예약 처리 중…' : '입금 대기 예약하기'}</button>
        <label className="privacy-agree">
          <input type="checkbox" checked={privacy} onChange={event => setPrivacy(event.target.checked)} />
          개인정보 수집에 동의합니다.
        </label>
        <p className="privacy-reason">이름과 연락처는 예약을 찾고 티켓 안내 문자를 보내는 데 씁니다. 입금자명은 입금한 분과 예약을 맞추기 위해 받습니다.</p>
      </form>
    </Dialog>
  );
}

function BookingSuccess({ booking, session, onClose, onLookup }) {
  return <Dialog onClose={onClose}><div className="success"><div className="check">✓</div><div className="eyebrow">REQUEST RECEIVED</div><h2>입금 대기 예약이 등록됐어요</h2><p>{session?.sortOrder}공 · {session?.dateLabel} {session?.timeLabel}<br />아래 예약 코드를 입금 메모에 적어주세요.<br />입금 확인 전까지 좌석은 30분간 확보됩니다.</p><div className="code">{booking.id}</div><div style={{ margin: '0 0 12px' }}><span className="badge">● 입금 대기</span></div><div className="bank-box" style={{ textAlign: 'left' }}><strong>입금 계좌 안내</strong><br />카카오뱅크 <strong>3333376900284</strong><br />입금액 {Number(booking.amount).toLocaleString()}원 · 입금자명은 신청 내용과 동일하게</div><p className="hint">예약이 확정되면 입력한 연락처로 문자 안내를 한 번 보내드립니다.</p><button className="primary" onClick={onLookup}>예약 정보 보기</button></div></Dialog>;
}

function TicketQr({ ticket, size }) {
  const canvas = useRef(null);
  useEffect(() => { if (canvas.current) QRCode.toCanvas(canvas.current, `TKT:${ticket.id}`, { width: size, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {}); }, [ticket.id, size]);
  return <canvas ref={canvas} aria-label={`${ticket.seat} 입장 QR`} />;
}

function LinkedTicket({ data, onClose }) {
  const [index, setIndex] = useState(0);
  const tickets = data.tickets || [];
  const ticket = tickets[index];
  if (!ticket) return <TicketError message="이 예약의 QR 티켓을 찾지 못했습니다." onClose={onClose} />;
  return <Dialog onClose={onClose} className="linked-ticket-dialog"><div className="eyebrow">OFFICIAL ENTRY TICKET</div><h2>공연 입장 QR</h2><section className="event-ticket-info"><strong>{data.eventTitle || '공연 입장'}</strong><b>{data.subtitle || ''}</b><span>{data.showNumber || data.showId}공 · {data.dateLabel} {data.timeLabel}</span><span>{data.venue || ''}</span></section><p className="sub">입장할 때 현재 화면의 좌석별 QR을 운영진에게 보여주세요.</p><section className="ticket-list linked-ticket-list"><article className="ticket-card linked-ticket-card"><TicketQr ticket={ticket} size={220} /><div><strong>{ticket.seat} 좌석</strong><span className={`ticket-state ${ticket.status === 'checked_in' ? 'used' : ''}`}>{ticket.status === 'checked_in' ? '입장 완료' : '입장 전'}</span></div></article><div className="ticket-nav"><button className="admin-action" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>← 이전 좌석</button><span>{index + 1} / {tickets.length}</span><button className="admin-action" disabled={index === tickets.length - 1} onClick={() => setIndex(i => i + 1)}>다음 좌석 →</button></div></section><p className="hint">이 페이지는 공연 입장 티켓입니다. 티켓 링크는 예매자만 보관해주세요.</p></Dialog>;
}

function TicketError({ message, onClose }) {
  return <Dialog onClose={onClose}><div className="eyebrow">ENTRY TICKET</div><h2>QR 링크를 열 수 없습니다</h2><p className="sub">{message}</p><p className="hint">예약이 취소됐거나 링크에 문제가 있다면 공연 계정으로 문의해주세요.</p></Dialog>;
}
