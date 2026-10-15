import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

const PRICE = 6500;
const ROWS = Array.from({ length: 12 }, (_, row) => String.fromCharCode(65 + row));
const SHOWS = ['1', '2', '3'];
const SHOW_DETAILS = {
  '1': { date: '2026년 11월 21일 토요일', time: '오후 8시' },
  '2': { date: '2026년 11월 22일 일요일', time: '오후 3시' },
  '3': { date: '2026년 11월 22일 일요일', time: '오후 9시' },
};
const SEATS = ROWS.flatMap(row => Array.from({ length: row === 'L' ? 8 : 12 }, (_, index) => `${row}${String(index + 1).padStart(2, '0')}`));
let selected = new Set();
let seatStates = {};
let selectedShow = '1';
let bookingOpen = false;
let bookingUnavailable = false;
const RESET_CONFIRMATION = '전체 예매 초기화';
let activeQrScanner = null;
let toastTimer = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text || '{}');
  } catch {
    throw new Error('예매 서버가 응답하지 않았습니다. 운영진 화면은 이 컴퓨터의 파일 미리보기에서는 열 수 없어요.');
  }
  if (!response.ok) throw new Error(payload.error || '요청을 처리하지 못했습니다.');
  return payload;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function toast(message, { duration = 6500, copyable = false } = {}) {
  const root = document.querySelector('#toast-root');
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast">${escapeHtml(message)}${copyable ? '<button class="toast-copy" type="button">오류 내용 복사</button>' : ''}</div>`;
  if (copyable) root.querySelector('.toast-copy').onclick = async event => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const field = document.createElement('textarea');
      field.value = message;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    button.textContent = '복사했습니다';
  };
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, duration);
}
function showDetails(show = selectedShow) { return SHOW_DETAILS[show]; }
function updateShowDetails() {
  const details = showDetails();
  const date = document.querySelector('#show-date');
  const time = document.querySelector('#show-time');
  if (date) date.textContent = details.date;
  if (time) time.textContent = details.time;
  const eventTime = document.querySelector('#event-time');
  if (eventTime) eventTime.textContent = `${selectedShow}공 · ${details.date} ${details.time}`;
}
function renderSeats() {
  const grid = document.querySelector('#seat-grid');
  grid.innerHTML = '';
  ROWS.forEach(rowLetter => {
    const row = document.createElement('div');
    row.className = `seat-row ${rowLetter === 'L' ? 'short-row' : ''}`;
    const label = document.createElement('span');
    label.className = 'row-label';
    label.textContent = rowLetter;
    row.append(label);
    const count = rowLetter === 'L' ? 8 : 12;
    for (let column = 1; column <= count; column += 1) {
      if (column === (count === 8 ? 5 : 7)) {
        const aisle = document.createElement('span');
        aisle.className = 'aisle';
        aisle.setAttribute('aria-hidden', 'true');
        row.append(aisle);
      }
      const seat = `${rowLetter}${String(column).padStart(2, '0')}`;
      const state = seatStates[seat] || 'available';
      const button = document.createElement('button');
      button.className = `seat ${state === 'available' && selected.has(seat) ? 'selected' : state === 'available' ? '' : state}`;
      button.textContent = String(column).padStart(2, '0');
      button.title = `좌석 ${rowLetter}열 ${column}번`;
      const seatStatus = { available: '선택 가능', sold: '예매 완료', held: '입금 대기', refund_pending: '환불 처리 중', reserved: '운영진 보유석, 예매 불가' }[state] || '예매 불가';
      button.setAttribute('aria-label', `좌석 ${rowLetter}열 ${column}번 ${seatStatus}`);
      button.disabled = state !== 'available' || !bookingOpen;
      button.onclick = () => {
        if (!selected.has(seat) && selected.size >= 2) return toast('한 번에 최대 2석까지 선택할 수 있어요.');
        selected.has(seat) ? selected.delete(seat) : selected.add(seat);
        renderSeats();
        renderSelection();
      };
      row.append(button);
    }
    grid.append(row);
  });
}
function renderSelection() {
  const box = document.querySelector('#selection');
  const seats = [...selected].sort();
  if (!seats.length) {
    box.className = 'summary-empty';
    box.innerHTML = '좌석을 선택하면<br>예매 정보가 여기에 표시돼요.';
  } else {
    box.className = '';
    box.innerHTML = seats.map(seat => `<div class="summary-seat"><span>좌석 ${seat}</span><span>${PRICE.toLocaleString()}원</span></div>`).join('');
  }
  document.querySelector('#total').textContent = (seats.length * PRICE).toLocaleString() + '원';
  const button = document.querySelector('#book-button');
  button.disabled = !seats.length || !bookingOpen;
  button.textContent = bookingUnavailable ? '좌석 정보를 확인할 수 없습니다' : !bookingOpen ? '현재 예매가 마감되었습니다' : seats.length ? `${seats.length}석 예매 신청하기` : '좌석을 선택해주세요';
}
async function refreshSeats(showId = selectedShow) {
  try {
    const result = await api(`/api/seats?show=${showId}`);
    if (showId !== selectedShow) return;
    seatStates = result.seats;
    bookingOpen = result.bookingOpen !== false;
    bookingUnavailable = false;
    const closedBanner = document.querySelector('#booking-closed-banner');
    if (closedBanner) {
      closedBanner.querySelector('strong').textContent = '현재 예매 접수를 받고 있지 않습니다.';
      closedBanner.querySelector('span').textContent = '예매 기간에 다시 방문해주세요. 운영진이 접수를 열면 좌석을 선택할 수 있습니다.';
      closedBanner.hidden = bookingOpen;
    }
    for (const seat of selected) if (seatStates[seat] !== 'available') selected.delete(seat);
    renderSeats();
    renderSelection();
  } catch {
    if (showId !== selectedShow) return;
    bookingOpen = false;
    bookingUnavailable = true;
    const closedBanner = document.querySelector('#booking-closed-banner');
    if (closedBanner) {
      closedBanner.querySelector('strong').textContent = '좌석 정보를 불러오지 못했습니다.';
      closedBanner.querySelector('span').textContent = '서버 연결을 확인할 수 없어 예매를 잠시 막았습니다. 인터넷 연결을 확인하고 다시 시도해주세요.';
      closedBanner.hidden = false;
    }
    renderSeats();
    renderSelection();
  }
}
function closeModal() {
  stopQrScanner().catch(() => {});
  document.querySelector('#modal-root').innerHTML = '';
}
function modal(content) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal">${content}</div></div>`;
  root.querySelector('#close-modal')?.addEventListener('click', closeModal);
  root.querySelector('#backdrop').addEventListener('click', event => { if (event.target.id === 'backdrop') closeModal(); });
}
function showBookingSuccess(booking) {
  const details = showDetails(booking.showId || selectedShow);
  modal(`<div class="success"><div class="check">✓</div><div class="eyebrow">REQUEST RECEIVED</div><h2>입금 대기 예약이 등록됐어요</h2><p>${booking.showId || selectedShow}공 · ${details.date} ${details.time}<br>아래 예약 코드를 입금 메모에 적어주세요.<br>입금 확인 전까지 좌석은 30분간 확보됩니다.</p><div class="code">${escapeHtml(booking.id)}</div><div style="margin:0 0 12px"><span class="badge">● 입금 대기</span></div><div class="bank-box" style="text-align:left"><strong>입금 계좌 안내</strong><br>카카오뱅크 <strong>3333376900284</strong><br>입금액 ${booking.amount.toLocaleString()}원 · 입금자명은 신청 내용과 동일하게</div><p class="hint">예약이 확정되면 입력한 연락처로 문자 안내를 한 번 보내드립니다.</p><button class="primary" id="success-close">예약 정보 보기</button></div>`);
  document.querySelector('#success-close').onclick = () => openLookup(booking.id);
}
function openBooking() {
  if (!bookingOpen) return toast('현재 예매 접수 기간이 아닙니다.');
  const seats = [...selected].sort();
  modal(`<button class="close" id="close-modal" aria-label="닫기">×</button><div class="eyebrow">BOOK YOUR SEAT</div><h2>예매 정보를 입력해주세요</h2><p class="sub">${selectedShow}공 · ${showDetails().date} ${showDetails().time}<br>${seats.join(', ')} · ${(seats.length * PRICE).toLocaleString()}원</p><div class="form-guidance"><strong>입력을 마치고 ‘입금 대기 예약하기’를 눌러주세요.</strong><span>이름과 입금자명을 적고, 연락처는 숫자 10~11자리로 입력하면 됩니다. 입력이 잘못된 칸은 아래에 안내해드려요.</span></div><form id="booking-form" novalidate><div class="form-grid"><div class="field"><label for="name">예매자 이름 <span>필수</span></label><input id="name" name="name" autocomplete="name" maxlength="40" placeholder="예: 홍길동" aria-describedby="name-help name-error"><small id="name-help" class="field-help">예매할 분의 이름을 입력해주세요.</small><small id="name-error" class="field-error" aria-live="polite"></small></div><div class="field"><label for="phone">연락처 <span>필수</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="예: 010-1234-5678" aria-describedby="phone-help phone-error"><small id="phone-help" class="field-help">예약 조회에 사용하며, 예매가 확정되면 안내 문자를 한 번 보내드립니다.</small><small id="phone-error" class="field-error" aria-live="polite"></small></div><div class="field"><label for="payer">입금자명 <span>필수</span></label><input id="payer" name="payer" autocomplete="name" maxlength="40" placeholder="예: 홍길동" aria-describedby="payer-help payer-error"><small id="payer-help" class="field-help">계좌에 실제로 송금할 분의 이름을 적어주세요.</small><small id="payer-error" class="field-error" aria-live="polite"></small></div></div><div class="bank-box"><strong>입금 계좌 안내</strong><br>카카오뱅크 <strong>3333376900284</strong><br>입금 기한: 예약 후 30분 이내</div><p class="hint">입력한 이름·연락처·입금자명은 예매 운영과 입장 안내에 사용하며, 전체 예매 기록 초기화 전까지 보관합니다.</p><div id="booking-error" class="form-error-summary" role="alert" aria-live="assertive" hidden></div><button class="primary" id="booking-submit" type="submit">입금 대기 예약하기</button><p class="hint">회차별 연락처 하나당 최대 2석입니다. 입력한 연락처로 예약을 다시 조회할 수 있어요.</p></form>`);
  const formElement = document.querySelector('#booking-form');
  const errorText = field => {
    const value = formElement.elements[field].value.trim();
    if (field === 'name' && !value) return '예매자 이름을 입력해주세요.';
    if (field === 'name' && value.length > 40) return '이름은 40자 이내로 입력해주세요.';
    if (field === 'payer' && !value) return '실제 입금할 분의 이름을 입력해주세요.';
    if (field === 'payer' && value.length > 40) return '입금자명은 40자 이내로 입력해주세요.';
    if (field === 'phone') {
      const digits = value.replace(/\D/g, '');
      if (!value) return '연락처를 입력해주세요. 예: 010-1234-5678';
      if (digits.length < 10 || digits.length > 11) return '연락처 숫자를 10~11자리로 입력해주세요. 예: 010-1234-5678';
    }
    return '';
  };
  const validateField = (field, show = true) => {
    const input = formElement.elements[field];
    const error = errorText(field);
    input.setAttribute('aria-invalid', error ? 'true' : 'false');
    document.querySelector(`#${field}-error`).textContent = show ? error : '';
    return !error;
  };
  ['name', 'phone', 'payer'].forEach(field => {
    const input = formElement.elements[field];
    input.addEventListener('blur', () => validateField(field));
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validateField(field);
    });
  });
  formElement.onsubmit = async event => {
    event.preventDefault();
    const submit = document.querySelector('#booking-submit');
    const errorMessage = document.querySelector('#booking-error');
    const fields = ['name', 'phone', 'payer'];
    const valid = fields.map(field => validateField(field)).every(Boolean);
    if (!valid) {
      errorMessage.hidden = false;
      errorMessage.textContent = '입력란 아래 안내를 확인하고 정보를 수정해주세요.';
      formElement.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = '예약 처리 중…';
    errorMessage.textContent = '';
    errorMessage.hidden = true;
    const form = new FormData(event.currentTarget);
    try {
      const booking = await api('/api/bookings', { method: 'POST', body: JSON.stringify({ name: form.get('name'), phone: form.get('phone'), payer: form.get('payer'), seats, showId: selectedShow }) });
      selected.clear();
      refreshSeats().catch(() => {});
      showBookingSuccess(booking);
    } catch (error) {
      refreshSeats().catch(() => {});
      errorMessage.hidden = false;
      errorMessage.textContent = error.message;
      submit.disabled = false;
      submit.textContent = '입금 대기 예약하기';
    }
  };
}
function showBookingResult(booking) {
  const status = ({ paid: '입금 확인 · 예매 확정', pending: '입금 대기', expired: '예약 만료', cancelled: '취소됨 · 입금 전 예약', refund_pending: '취소 접수 · 환불 처리 중', refunded: '환불 완료' })[booking.status] || '상태 확인 필요';
  const badge = ['paid', 'refunded'].includes(booking.status) ? 'badge paid' : ['expired', 'cancelled'].includes(booking.status) ? 'badge expired' : 'badge';
  const details = showDetails(booking.showId || '1');
  const tickets = booking.status === 'paid' ? (booking.tickets || []) : [];
  const ticketMarkup = tickets.length ? `<section class="ticket-list"><h3>입장 QR 티켓</h3><p>입장할 때 좌석별 QR을 운영진에게 보여주세요.</p>${tickets.map((ticket, index) => `<article class="ticket-card"><canvas id="ticket-qr-${index}" aria-label="${escapeHtml(ticket.seat)} 입장 QR"></canvas><div><strong>${escapeHtml(ticket.seat)} 좌석</strong><span class="ticket-state ${ticket.status === 'checked_in' ? 'used' : ''}">${ticket.status === 'checked_in' ? '입장 완료' : '입장 전'}</span><small>${booking.showId || '1'}공 · ${details.date} ${details.time}</small></div></article>`).join('')}</section>` : booking.status === 'paid' ? '<p class="hint">티켓을 준비하고 있습니다. 잠시 후 예약을 다시 조회해주세요.</p>' : '';
  modal(`<button class="close" id="close-modal">×</button><div class="eyebrow">BOOKING LOOKUP</div><h2>예약 내역</h2><p class="sub">예약 코드 ${escapeHtml(booking.id)}</p><div class="bank-box"><strong>${booking.showId || '1'}공 · ${details.date} ${details.time}</strong><br><strong>${escapeHtml(booking.name)} · 좌석 ${escapeHtml(booking.seats.join(', '))}</strong><br>${booking.amount.toLocaleString()}원 · 입금자 ${escapeHtml(booking.payer)}<br><span class="${badge}">${status}</span></div>${ticketMarkup}<p class="hint">예약 코드와 연락처로 언제든 다시 조회할 수 있어요.</p>`);
  tickets.forEach((ticket, index) => {
    const canvas = document.querySelector(`#ticket-qr-${index}`);
    if (canvas) QRCode.toCanvas(canvas, `TKT:${ticket.id}`, { width: 180, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
  });
}
function showLinkedTicketResult(data) {
  const details = showDetails(data.showId || '1');
  const tickets = data.tickets || [];
  if (!tickets.length) throw new Error('이 예약의 QR 티켓을 찾지 못했습니다.');
  modal(`<button class="close" id="close-modal" aria-label="닫기">×</button><div class="eyebrow">OFFICIAL ENTRY TICKET</div><h2>공연 입장 QR</h2><section class="event-ticket-info"><strong>즉흥적 새벽 2시</strong><b>How’d you feel?</b><span>${escapeHtml(data.showId || '1')}공 · ${details.date} ${details.time}</span><span>학관 104호</span></section><p class="sub">입장할 때 현재 화면의 좌석별 QR을 운영진에게 보여주세요.</p><section class="ticket-list linked-ticket-list"><div id="linked-ticket-current" aria-live="polite"></div><div class="ticket-nav"><button type="button" id="ticket-prev" class="admin-action">← 이전 좌석</button><span id="ticket-position"></span><button type="button" id="ticket-next" class="admin-action">다음 좌석 →</button></div></section><p class="hint">이 페이지는 즉흥적 새벽 2시 공연의 공식 입장 티켓입니다. 티켓 링크는 예매자만 보관해주세요.</p>`);
  let current = 0;
  const drawTicket = () => {
    const ticket = tickets[current];
    const container = document.querySelector('#linked-ticket-current');
    container.innerHTML = `<article class="ticket-card linked-ticket-card"><canvas id="linked-ticket-qr" aria-label="${escapeHtml(ticket.seat)} 입장 QR"></canvas><div><strong>${escapeHtml(ticket.seat)} 좌석</strong><span class="ticket-state ${ticket.status === 'checked_in' ? 'used' : ''}">${ticket.status === 'checked_in' ? '입장 완료' : '입장 전'}</span></div></article>`;
    const canvas = container.querySelector('#linked-ticket-qr');
    QRCode.toCanvas(canvas, `TKT:${ticket.id}`, { width: 220, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
    document.querySelector('#ticket-position').textContent = `${current + 1} / ${tickets.length}`;
    document.querySelector('#ticket-prev').disabled = current === 0;
    document.querySelector('#ticket-next').disabled = current === tickets.length - 1;
  };
  document.querySelector('#ticket-prev').onclick = () => { if (current > 0) { current -= 1; drawTicket(); } };
  document.querySelector('#ticket-next').onclick = () => { if (current < tickets.length - 1) { current += 1; drawTicket(); } };
  drawTicket();
}
async function openTicketLinkFromHash() {
  const match = /^#t=([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.exec(location.hash);
  if (!match) return;
  try {
    const result = await api('/api/ticket-link', { method: 'POST', body: JSON.stringify({ token: match[1] }) });
    showLinkedTicketResult(result);
  } catch (error) {
    modal(`<button class="close" id="close-modal" aria-label="닫기">×</button><div class="eyebrow">ENTRY TICKET</div><h2>QR 링크를 열 수 없습니다</h2><p class="sub">${escapeHtml(error.message)}</p><p class="hint">예약이 취소됐거나 링크에 문제가 있다면 공연 계정으로 문의해주세요.</p>`);
  }
}

async function stopQrScanner() {
  const scanner = activeQrScanner;
  activeQrScanner = null;
  if (!scanner) return;
  try { if (scanner.isScanning) await scanner.stop(); } catch {}
  try { scanner.clear(); } catch {}
}

function showCheckinResult(container, result, error = '') {
  if (error) {
    container.className = 'checkin-result invalid';
    container.textContent = error;
    return;
  }
  const ticket = result.ticket;
  container.className = `checkin-result ${result.checkedIn ? 'valid' : 'invalid'}`;
  container.textContent = `${result.checkedIn ? '입장 확인 완료' : '이미 입장 처리됨'} · ${ticket.showId}공 · ${ticket.seat} · ${ticket.name}`;
}

async function checkinTicket(input, container) {
  try {
    const result = await api('/api/admin/tickets/check-in', { method: 'POST', body: JSON.stringify(input) });
    showCheckinResult(container, result);
  } catch (error) {
    showCheckinResult(container, null, error.message);
  }
}

async function openCheckinScanner() {
  await stopQrScanner();
  modal(`<button class="close" id="close-modal" aria-label="닫기">×</button><div class="eyebrow">ENTRY CHECK</div><h2>입장 확인</h2><p class="sub">확정된 예약의 좌석별 QR을 스캔해주세요. 입장 처리는 한 번만 됩니다.</p><div id="qr-reader" class="qr-reader"></div><button class="admin-action scanner-start" id="scanner-start" type="button">카메라 스캔 시작</button><div id="checkin-result" class="checkin-result" role="status">카메라를 사용할 수 없으면 예약 코드와 좌석으로 확인할 수 있어요.</div><form id="manual-checkin" class="manual-checkin"><label for="manual-booking">수동 확인</label><div class="manual-checkin-row"><input id="manual-booking" autocomplete="off" placeholder="예약 코드 (예: STG-ABC1234567)" required><input id="manual-seat" autocomplete="off" placeholder="좌석 (예: B01)" required></div><button class="primary" type="submit">입장 확인 처리</button></form>`);
  const result = document.querySelector('#checkin-result');
  const button = document.querySelector('#scanner-start');
  button.onclick = async () => {
    if (activeQrScanner) {
      await stopQrScanner();
      button.textContent = '카메라 스캔 시작';
      return;
    }
    button.disabled = true;
    button.textContent = '카메라 연결 중…';
    try {
      const scanner = new Html5Qrcode('qr-reader', { verbose: false });
      activeQrScanner = scanner;
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, async decoded => {
        const id = /^TKT:([a-f0-9]{32})$/i.exec(decoded.trim())?.[1];
        await stopQrScanner();
        if (!id) showCheckinResult(result, null, '즉흥적 새벽 2시 티켓 QR이 아닙니다.');
        else await checkinTicket({ ticketId: id }, result);
        button.disabled = false;
        button.textContent = '다시 스캔';
      });
      button.textContent = '스캔 중 · 카메라 중지';
      button.disabled = false;
    } catch {
      await stopQrScanner();
      button.disabled = false;
      button.textContent = '카메라 스캔 다시 시도';
      showCheckinResult(result, null, '카메라를 열 수 없습니다. HTTPS 연결과 브라우저 카메라 권한을 확인해주세요. 아래 수동 확인도 이용할 수 있습니다.');
    }
  };
  document.querySelector('#manual-checkin').onsubmit = async event => {
    event.preventDefault();
    await checkinTicket({ bookingId: document.querySelector('#manual-booking').value, seat: document.querySelector('#manual-seat').value }, result);
  };
}
function openLookup(prefill = '') {
  modal(`<button class="close" id="close-modal">×</button><div class="eyebrow">FIND YOUR BOOKING</div><h2>내 예약 조회</h2><p class="sub">예매할 때 입력한 연락처를 입력해주세요.</p><form id="lookup-form"><div class="form-grid"><div class="field"><label for="booking-code">예약 코드</label><input id="booking-code" name="id" required placeholder="STG-ABC123" value="${escapeHtml(prefill)}"></div><div class="field"><label for="lookup-phone">연락처</label><input id="lookup-phone" name="phone" required type="tel" placeholder="010-1234-5678"></div></div><button class="primary" type="submit">예약 조회하기</button><div id="lookup-error" class="error-text"></div></form>`);
  document.querySelector('#lookup-form').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = document.querySelector('#lookup-error');
    try {
      const booking = await api('/api/booking-lookup', { method: 'POST', body: JSON.stringify({ id: form.get('id'), phone: form.get('phone') }) });
      showBookingResult(booking);
    } catch (problem) { error.textContent = problem.message; }
  };
}
function showBookingView() {
  document.querySelector('#booking-view').classList.remove('hidden');
  document.querySelector('#admin-view').classList.add('hidden');
  document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item.dataset.view === 'booking'));
  updateShowDetails();
  refreshSeats();
}
async function adminLoginScreen(message = '') {
  document.querySelector('#admin-view').dataset.authenticated = 'false';
  document.querySelector('#admin-view').innerHTML = `<div class="admin-login"><button class="login-back" type="button" id="admin-back">← 공연 예매로 돌아가기</button><div class="eyebrow">BACKSTAGE · ADMIN</div><h2>운영진 로그인</h2><p>공연 예매와 입금 확인은 운영진만 볼 수 있습니다.</p><form id="admin-login-form"><label for="admin-username">아이디</label><input id="admin-username" autocomplete="username" required><label for="admin-password">비밀번호</label><input id="admin-password" type="password" autocomplete="current-password" required><button class="primary" type="submit">로그인</button><div class="error-text" id="admin-login-error">${escapeHtml(message)}</div></form></div>`;
  document.querySelector('#admin-back').onclick = showBookingView;
  document.querySelector('#admin-login-form').onsubmit = async event => {
    event.preventDefault();
    const error = document.querySelector('#admin-login-error');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: document.querySelector('#admin-username').value, password: document.querySelector('#admin-password').value }) });
      await renderAdmin();
    } catch (problem) { error.textContent = problem.message; }
  };
}
function bookingNotificationHtml(order) {
  const status = order.notificationStatus || 'untracked';
  const attempts = Number(order.notificationAttempts || 0);
  const views = {
    untracked: ['이전 예약 · 발송 이력 없음', 'sms-uncertain'],
    sending: ['문자 처리 중', 'sms-pending'],
    accepted: [`문자 발송 접수 완료 · ${attempts}회`, 'sms-ok'],
    failed: [`문자 발송 실패 · ${attempts}회${order.notificationErrorCode ? ` · ${escapeHtml(order.notificationErrorCode)}` : ''}`, 'sms-failed'],
    not_configured: [`문자 설정 필요 · ${attempts}회`, 'sms-failed'],
    uncertain: [`발송 여부 확인 필요 · ${attempts}회${order.notificationErrorCode ? ` · ${escapeHtml(order.notificationErrorCode)}` : ''}`, 'sms-uncertain'],
  };
  const view = views[status];
  return view ? `<small class="sms-status ${view[1]}">${view[0]}</small>` : '';
}
async function renderAdmin() {
  const view = document.querySelector('#admin-view');
  const requestedShow = selectedShow;
  try {
    const session = await api('/api/admin/session');
    if (view.classList.contains('hidden')) return;
    if (!session.authenticated) return adminLoginScreen();
    view.dataset.authenticated = 'true';
    const [data, checkin] = await Promise.all([
      api(`/api/admin/bookings?show=${requestedShow}`),
      api(`/api/admin/checkin-summary?show=${requestedShow}`),
    ]);
    if (requestedShow !== selectedShow || view.classList.contains('hidden')) return;
    const orders = data.bookings;
    bookingOpen = data.bookingOpen !== false;
    const pending = orders.filter(order => order.status === 'pending').length;
    const paid = orders.filter(order => order.status === 'paid').reduce((sum, order) => sum + order.seats.length, 0);
    const checkinPercent = checkin.total ? Math.round(checkin.checkedIn / checkin.total * 100) : 0;
    const rowStatus = checkin.rows.length ? checkin.rows.map(row => `<div class="checkin-row"><span>${escapeHtml(row.row)}열</span><div class="checkin-row-track"><i style="width:${row.total ? Math.round(row.checked_in / row.total * 100) : 0}%"></i></div><strong>${row.checked_in}/${row.total}</strong></div>`).join('') : '<p class="checkin-empty">확정된 티켓이 아직 없습니다.</p>';
    const recentStatus = checkin.recent.length ? checkin.recent.map(ticket => `<div class="checkin-recent-item"><strong>${escapeHtml(ticket.seat)}</strong><time>${new Date(ticket.checked_in_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('') : '<p class="checkin-empty">아직 입장 처리된 티켓이 없습니다.</p>';
    view.innerHTML = `<div class="admin-head"><div><div class="eyebrow">BACKSTAGE · ADMIN</div><h1>예매 관리</h1><p>입금 확인, 예약 취소와 환불 처리를 관리해주세요.</p></div><button id="admin-logout" class="admin-action">로그아웃</button></div><section class="panel booking-control"><div><div class="eyebrow">SITE STATUS</div><h2>사이트 예매 접수</h2><p>${bookingOpen ? '사이트가 열려 있어 모든 회차 예매를 받고 있습니다.' : '사이트가 닫혀 있어 방문자는 좌석을 선택하거나 예약할 수 없습니다.'}</p></div><div class="control-actions"><span class="site-status ${bookingOpen ? 'is-open' : 'is-closed'}">${bookingOpen ? '접수 중' : '접수 마감'}</span><button id="booking-toggle" class="admin-action ${bookingOpen ? 'danger' : ''}">${bookingOpen ? '예매 접수 닫기' : '예매 접수 열기'}</button></div></section><div class="show-picker admin-show-picker" role="group" aria-label="관리할 공연 선택">${SHOWS.map(show => `<button class="show-option ${requestedShow === show ? 'active' : ''}" data-show="${show}">${show}공</button>`).join('')}</div><div class="metrics"><div class="metric"><span>전체 예매</span><strong>${orders.length} <small>건</small></strong></div><div class="metric"><span>입금 확인 대기</span><strong>${pending} <small>건</small></strong></div><div class="metric"><span>확정된 좌석</span><strong>${paid} <small>석</small></strong></div></div><section class="panel checkin-dashboard"><div class="checkin-heading"><div><div class="eyebrow">LIVE ENTRY STATUS</div><h2>${requestedShow}공 현장 입장 현황</h2></div><button id="checkin-refresh" class="admin-action">새로고침</button></div><div class="checkin-progress"><div><strong>${checkin.checkedIn}</strong><span> / ${checkin.total}석 입장 완료</span><b>${checkinPercent}%</b></div><div class="checkin-track"><i style="width:${checkinPercent}%"></i></div></div><div class="checkin-columns"><div><h3>열별 입장</h3>${rowStatus}</div><div><h3>최근 입장 처리</h3><div class="checkin-recent">${recentStatus}</div></div></div><p class="checkin-note">확정된 티켓 기준이며, 이 화면은 12초마다 자동 갱신됩니다.</p></section><section class="panel orders"><div class="orders-top"><h2>${requestedShow}공 예매 신청 목록</h2><span>문자 발송 실패 시 재전송할 수 있습니다. ‘발송 여부 확인 필요’는 Solapi 내역을 먼저 확인하세요.</span></div><div id="orders-list">${orders.length ? orders.map(order => `<div class="order"><div class="order-name">${escapeHtml(order.name)}<small>${escapeHtml(order.id)} · ${new Date(order.createdAt).toLocaleString('ko-KR')}</small></div><div class="order-cell">${escapeHtml(order.seats.join(', '))}<small>${order.amount.toLocaleString()}원 · 입금자 ${escapeHtml(order.payer)}</small></div><div class="order-cell">${escapeHtml(order.phone)}<small>${order.seats.length}석</small></div><div><span class="badge ${({ paid: 'paid', expired: 'expired', cancelled: 'expired', refund_pending: '', refunded: 'expired' })[order.status] || ''}">${({ pending: '● 입금 대기', paid: '● 입금 확인', expired: '예약 만료', cancelled: '취소됨', refund_pending: '환불 처리 중', refunded: '환불 완료' })[order.status] || '상태 확인 필요'}</span>${bookingNotificationHtml(order)}</div><div class="order-actions">${order.status === 'pending' ? `<button class="admin-action" data-confirm="${escapeHtml(order.id)}">입금 확인</button>` : ''}${order.status === 'paid' && ['failed', 'not_configured', 'untracked'].includes(order.notificationStatus) ? `<button class="admin-action" data-retry-sms="${escapeHtml(order.id)}" data-untracked="${order.notificationStatus === 'untracked'}">${order.notificationStatus === 'untracked' ? '이력 확인 후 재전송' : '문자 재전송'}</button>` : ''}${['pending', 'paid'].includes(order.status) ? `<button class="admin-action danger" data-cancel="${escapeHtml(order.id)}" data-status="${order.status}">예약 취소</button>` : ''}${order.status === 'refund_pending' ? `<button class="admin-action" data-refund-complete="${escapeHtml(order.id)}">환불 완료 처리</button>` : ''}</div></div>`).join('') : '<div class="empty-admin">이 공연에는 아직 예매 신청이 없습니다.</div>'}</div></section><section class="panel reset-panel"><div><h2>전체 예매 기록 초기화</h2><p>1·2·3공의 예약, 좌석 선점, 입금 상태를 모두 삭제합니다. 초기화한 데이터는 복구할 수 없습니다.</p></div><button id="reset-all" class="admin-action danger">전체 초기화</button></section>`;
    const adminActions = view.querySelector('#admin-logout').parentElement;
    adminActions.classList.add('admin-head-actions');
    const checkinButton = document.createElement('button');
    checkinButton.id = 'checkin-open';
    checkinButton.className = 'admin-action';
    checkinButton.textContent = '입장 확인 QR 스캔';
    checkinButton.onclick = openCheckinScanner;
    adminActions.prepend(checkinButton);
    view.querySelectorAll('[data-show]').forEach(button => button.onclick = async () => { selectedShow = button.dataset.show; await renderAdmin(); });
    view.querySelector('#checkin-refresh').onclick = async () => { await renderAdmin(); };
    document.querySelector('#admin-logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST', body: '{}' }); await adminLoginScreen(); };
    document.querySelector('#booking-toggle').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ bookingOpen: !bookingOpen }) });
        toast(result.bookingOpen ? '예매 접수를 열었습니다.' : '예매 접수를 닫았습니다.');
        await renderAdmin();
        refreshSeats().catch(() => {});
      } catch (error) { button.disabled = false; toast(error.message); }
    };
    document.querySelector('#reset-all').onclick = () => openResetConfirmation();
    view.querySelectorAll('[data-confirm]').forEach(button => button.onclick = async () => {
      try {
        const result = await api(`/api/admin/bookings/${encodeURIComponent(button.dataset.confirm)}/confirm`, { method: 'POST', body: '{}' });
        const notification = result.notification === 'accepted'
          ? ' 확정 안내 문자를 발송 요청했습니다.'
          : result.notification === 'not_configured'
            ? ' 문자 발송 설정이 빠져 있습니다.'
            : result.notification === 'uncertain'
              ? ' 문자 요청의 접수 여부를 확인할 수 없습니다. 중복 발송을 막기 위해 재전송 버튼은 표시하지 않습니다. Solapi 발송 내역을 확인해주세요.'
              : ` 문자 발송에 실패했습니다${result.notificationCode ? ` (오류 코드: ${escapeHtml(result.notificationCode)})` : ''}.`;
        const message = `입금 확인을 완료했습니다.${notification}`;
        toast(message, ['failed', 'uncertain'].includes(result.notification) ? { duration: 30000, copyable: true } : {});
        await renderAdmin(); refreshSeats().catch(() => {});
      }
      catch (error) { toast(error.message); }
    });
    view.querySelectorAll('[data-retry-sms]').forEach(button => button.onclick = async () => {
      if (button.dataset.untracked === 'true' && !window.confirm('이 예약은 이전 버전에서 문자 발송 기록을 저장하지 않았습니다. Solapi 발송 내역에서 이미 발송되지 않은 것을 확인했나요? 확인하면 문자가 발송되어 비용이 발생할 수 있습니다.')) return;
      button.disabled = true;
      try {
        const result = await api(`/api/admin/bookings/${encodeURIComponent(button.dataset.retrySms)}/retry-sms`, { method: 'POST', body: '{}' });
        if (result.notification === 'accepted') toast('확정 문자를 Solapi에 접수했습니다.');
        else {
          const message = result.notification === 'uncertain'
            ? 'Solapi가 요청을 접수했는지 확인할 수 없습니다. 중복 발송 방지를 위해 재전송하지 않았습니다. Solapi 발송 내역을 확인해주세요.'
            : `문자 재전송에 실패했습니다${result.notificationCode ? ` (오류 코드: ${escapeHtml(result.notificationCode)})` : ''}.`;
          toast(message, { duration: 30000, copyable: true });
        }
        await renderAdmin();
      } catch (error) {
        button.disabled = false;
        toast(error.message, { duration: 12000 });
      }
    });
    view.querySelectorAll('[data-cancel]').forEach(button => button.onclick = async () => {
      const paid = button.dataset.status === 'paid';
      const message = paid
        ? '예약을 취소하고 환불 대기로 전환할까요? 실제 환불 송금은 별도로 진행해야 하며, 완료 처리 전까지 좌석은 잠겨 있습니다.'
        : '입금 대기 예약을 취소할까요? 예약이 취소되고 좌석은 즉시 다시 예매할 수 있습니다.';
      if (!window.confirm(message)) return;
      try {
        const result = await api(`/api/admin/bookings/${encodeURIComponent(button.dataset.cancel)}/cancel`, { method: 'POST', body: '{}' });
        toast(result.status === 'refund_pending' ? '환불 대기로 전환했습니다. 송금 후 환불 완료 처리해주세요.' : '예약을 취소하고 좌석을 해제했습니다.');
        await renderAdmin(); refreshSeats().catch(() => {});
      } catch (error) { toast(error.message); }
    });
    view.querySelectorAll('[data-refund-complete]').forEach(button => button.onclick = async () => {
      if (!window.confirm('실제 환불 송금을 완료했나요? 완료 처리하면 좌석이 다시 예매 가능해집니다.')) return;
      try {
        await api(`/api/admin/bookings/${encodeURIComponent(button.dataset.refundComplete)}/refund-complete`, { method: 'POST', body: '{}' });
        toast('환불 완료로 기록하고 좌석을 해제했습니다.');
        await renderAdmin(); refreshSeats().catch(() => {});
      } catch (error) { toast(error.message); }
    });
  } catch (error) {
    if (view.classList.contains('hidden')) return;
    view.dataset.authenticated = 'false';
    view.innerHTML = `<div class="admin-login"><button class="login-back" type="button" id="admin-back">← 공연 예매로 돌아가기</button><h2>운영자 화면을 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p></div>`;
    document.querySelector('#admin-back').onclick = showBookingView;
  }
}

function openResetConfirmation() {
  modal(`<button class="close" id="close-modal" aria-label="닫기">×</button><div class="eyebrow">DANGER ZONE</div><h2>전체 예매 기록 초기화</h2><p class="sub">세 공연의 모든 예매 기록과 좌석 선점을 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p><div class="reset-warning"><strong>삭제되는 항목</strong><span>예약자 정보, 예약 코드, 좌석 상태, 입금 확인 상태</span><strong>유지되는 항목</strong><span>관리자 계정과 현재 사이트 접수 설정</span></div><form id="reset-form" novalidate><label class="reset-label" for="reset-confirmation">계속하려면 <b>${RESET_CONFIRMATION}</b>을 입력하세요.</label><input id="reset-confirmation" autocomplete="off" spellcheck="false" placeholder="확인 문구를 정확히 입력"><div id="reset-error" class="form-error-summary" role="alert" hidden></div><button id="reset-submit" class="primary danger-primary" type="submit" disabled>전체 예매 기록 영구 삭제</button></form>`);
  const form = document.querySelector('#reset-form');
  const input = document.querySelector('#reset-confirmation');
  const submit = document.querySelector('#reset-submit');
  const error = document.querySelector('#reset-error');
  input.addEventListener('input', () => { submit.disabled = input.value !== RESET_CONFIRMATION; error.hidden = true; });
  form.onsubmit = async event => {
    event.preventDefault();
    if (input.value !== RESET_CONFIRMATION) return;
    submit.disabled = true;
    submit.textContent = '초기화 중…';
    try {
      const result = await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirmation: input.value }) });
      closeModal();
      toast(`${result.deletedBookings}건의 예매 기록을 초기화했습니다.`);
      await renderAdmin();
      refreshSeats().catch(() => {});
    } catch (problem) {
      error.hidden = false;
      error.textContent = problem.message;
      submit.disabled = false;
      submit.textContent = '전체 예매 기록 영구 삭제';
    }
  };
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  if (tab.dataset.view === 'booking') showBookingView();
}));
document.querySelector('#staff-link').addEventListener('click', async () => {
  document.querySelector('#booking-view').classList.add('hidden');
  document.querySelector('#admin-view').classList.remove('hidden');
  await renderAdmin();
});
document.querySelector('#book-button').onclick = openBooking;
document.querySelectorAll('[data-booking-show]').forEach(button => button.addEventListener('click', async () => {
  selectedShow = button.dataset.bookingShow;
  selected.clear();
  bookingOpen = false;
  bookingUnavailable = true;
  document.querySelectorAll('[data-booking-show]').forEach(item => item.classList.toggle('active', item === button));
  updateShowDetails();
  const banner = document.querySelector('#booking-closed-banner');
  if (banner) {
    banner.querySelector('strong').textContent = '좌석 정보를 확인하고 있습니다.';
    banner.querySelector('span').textContent = `${selectedShow}공 좌석 현황을 불러오는 동안 잠시 기다려주세요.`;
    banner.hidden = false;
  }
  renderSeats();
  renderSelection();
  await refreshSeats(selectedShow);
}));
updateShowDetails();
openTicketLinkFromHash();
document.querySelector('#lookup-open').onclick = () => openLookup();
document.querySelector('#hero-book')?.addEventListener('click', () => {
  document.querySelector('.seat-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
refreshSeats();
setInterval(() => { if (!document.querySelector('#booking-view').classList.contains('hidden')) refreshSeats().catch(() => {}); }, 12000);
setInterval(() => {
  const admin = document.querySelector('#admin-view');
  if (!admin.classList.contains('hidden') && admin.dataset.authenticated === 'true') renderAdmin();
}, 12000);
