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
const RESET_CONFIRMATION = '전체 예매 초기화';

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
function toast(message) {
  const root = document.querySelector('#toast-root');
  root.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  setTimeout(() => { root.innerHTML = ''; }, 2800);
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
  button.textContent = !bookingOpen ? '현재 예매가 마감되었습니다' : seats.length ? `${seats.length}석 예매 신청하기` : '좌석을 선택해주세요';
}
function showLocalSeatMap() {
  seatStates = Object.fromEntries(SEATS.map(seat => [seat, seat.startsWith('A') ? 'reserved' : 'available']));
  bookingOpen = true;
  const closedBanner = document.querySelector('#booking-closed-banner');
  if (closedBanner) closedBanner.hidden = true;
  renderSeats();
  renderSelection();
}
async function refreshSeats() {
  try {
    const result = await api(`/api/seats?show=${selectedShow}`);
    seatStates = result.seats;
    bookingOpen = result.bookingOpen !== false;
    const closedBanner = document.querySelector('#booking-closed-banner');
    if (closedBanner) closedBanner.hidden = bookingOpen;
    for (const seat of selected) if (seatStates[seat] !== 'available') selected.delete(seat);
    renderSeats();
    renderSelection();
  } catch {
    showLocalSeatMap();
  }
}
function closeModal() { document.querySelector('#modal-root').innerHTML = ''; }
function modal(content) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal">${content}</div></div>`;
  root.querySelector('#close-modal')?.addEventListener('click', closeModal);
  root.querySelector('#backdrop').addEventListener('click', event => { if (event.target.id === 'backdrop') closeModal(); });
}
function showBookingSuccess(booking) {
  const details = showDetails(booking.showId || selectedShow);
  modal(`<div class="success"><div class="check">✓</div><div class="eyebrow">REQUEST RECEIVED</div><h2>입금 대기 예약이 등록됐어요</h2><p>${booking.showId || selectedShow}공 · ${details.date} ${details.time}<br>아래 예약 코드를 입금 메모에 적어주세요.<br>입금 확인 전까지 좌석은 30분간 확보됩니다.</p><div class="code">${escapeHtml(booking.id)}</div><div style="margin:0 0 12px"><span class="badge">● 입금 대기</span></div><div class="bank-box" style="text-align:left"><strong>입금 계좌 안내</strong><br>카카오뱅크 <strong>3333376900284</strong><br>입금액 ${booking.amount.toLocaleString()}원 · 입금자명은 신청 내용과 동일하게</div><button class="primary" id="success-close">예약 정보 보기</button></div>`);
  document.querySelector('#success-close').onclick = () => openLookup(booking.id);
}
function openBooking() {
  if (!bookingOpen) return toast('현재 예매 접수 기간이 아닙니다.');
  const seats = [...selected].sort();
  modal(`<button class="close" id="close-modal" aria-label="닫기">×</button><div class="eyebrow">BOOK YOUR SEAT</div><h2>예매 정보를 입력해주세요</h2><p class="sub">${selectedShow}공 · ${showDetails().date} ${showDetails().time}<br>${seats.join(', ')} · ${(seats.length * PRICE).toLocaleString()}원</p><div class="form-guidance"><strong>입력을 마치고 ‘입금 대기 예약하기’를 눌러주세요.</strong><span>이름과 입금자명을 적고, 연락처는 숫자 10~11자리로 입력하면 됩니다. 입력이 잘못된 칸은 아래에 안내해드려요.</span></div><form id="booking-form" novalidate><div class="form-grid"><div class="field"><label for="name">예매자 이름 <span>필수</span></label><input id="name" name="name" autocomplete="name" maxlength="40" placeholder="예: 홍길동" aria-describedby="name-help name-error"><small id="name-help" class="field-help">예매할 분의 이름을 입력해주세요.</small><small id="name-error" class="field-error" aria-live="polite"></small></div><div class="field"><label for="phone">연락처 <span>필수</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="예: 010-1234-5678" aria-describedby="phone-help phone-error"><small id="phone-help" class="field-help">숫자만 또는 하이픈을 넣어 입력해도 됩니다. 예약 조회와 안내에 사용해요.</small><small id="phone-error" class="field-error" aria-live="polite"></small></div><div class="field"><label for="payer">입금자명 <span>필수</span></label><input id="payer" name="payer" autocomplete="name" maxlength="40" placeholder="예: 홍길동" aria-describedby="payer-help payer-error"><small id="payer-help" class="field-help">계좌에 실제로 송금할 분의 이름을 적어주세요.</small><small id="payer-error" class="field-error" aria-live="polite"></small></div></div><div class="bank-box"><strong>입금 계좌 안내</strong><br>카카오뱅크 <strong>3333376900284</strong><br>입금 기한: 예약 후 30분 이내</div><div id="booking-error" class="form-error-summary" role="alert" aria-live="assertive" hidden></div><button class="primary" id="booking-submit" type="submit">입금 대기 예약하기</button><p class="hint">연락처 하나당 최대 2석입니다. 입력한 연락처로 예약을 다시 조회할 수 있어요.</p></form>`);
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
  modal(`<button class="close" id="close-modal">×</button><div class="eyebrow">BOOKING LOOKUP</div><h2>예약 내역</h2><p class="sub">예약 코드 ${escapeHtml(booking.id)}</p><div class="bank-box"><strong>${booking.showId || '1'}공 · ${details.date} ${details.time}</strong><br><strong>${escapeHtml(booking.name)} · 좌석 ${escapeHtml(booking.seats.join(', '))}</strong><br>${booking.amount.toLocaleString()}원 · 입금자 ${escapeHtml(booking.payer)}<br><span class="${badge}">${status}</span></div><p class="hint">예약 코드와 연락처로 언제든 다시 조회할 수 있어요.</p>`);
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
async function renderAdmin() {
  const view = document.querySelector('#admin-view');
  try {
    const session = await api('/api/admin/session');
    if (!session.authenticated) return adminLoginScreen();
    view.dataset.authenticated = 'true';
    const data = await api(`/api/admin/bookings?show=${selectedShow}`);
    const orders = data.bookings;
    bookingOpen = data.bookingOpen !== false;
    const pending = orders.filter(order => order.status === 'pending').length;
    const paid = orders.filter(order => order.status === 'paid').reduce((sum, order) => sum + order.seats.length, 0);
    view.innerHTML = `<div class="admin-head"><div><div class="eyebrow">BACKSTAGE · ADMIN</div><h1>예매 관리</h1><p>입금 확인, 예약 취소와 환불 처리를 관리해주세요.</p></div><button id="admin-logout" class="admin-action">로그아웃</button></div><section class="panel booking-control"><div><div class="eyebrow">SITE STATUS</div><h2>사이트 예매 접수</h2><p>${bookingOpen ? '사이트가 열려 있어 모든 회차 예매를 받고 있습니다.' : '사이트가 닫혀 있어 방문자는 좌석을 선택하거나 예약할 수 없습니다.'}</p></div><div class="control-actions"><span class="site-status ${bookingOpen ? 'is-open' : 'is-closed'}">${bookingOpen ? '접수 중' : '접수 마감'}</span><button id="booking-toggle" class="admin-action ${bookingOpen ? 'danger' : ''}">${bookingOpen ? '예매 접수 닫기' : '예매 접수 열기'}</button></div></section><div class="show-picker admin-show-picker" role="group" aria-label="관리할 공연 선택">${SHOWS.map(show => `<button class="show-option ${selectedShow === show ? 'active' : ''}" data-show="${show}">${show}공</button>`).join('')}</div><div class="metrics"><div class="metric"><span>전체 예매</span><strong>${orders.length} <small>건</small></strong></div><div class="metric"><span>입금 확인 대기</span><strong>${pending} <small>건</small></strong></div><div class="metric"><span>확정된 좌석</span><strong>${paid} <small>석</small></strong></div></div><section class="panel orders"><div class="orders-top"><h2>${selectedShow}공 예매 신청 목록</h2><span>확정 취소 시 실제 환불 송금 후 완료 처리하세요</span></div><div id="orders-list">${orders.length ? orders.map(order => `<div class="order"><div class="order-name">${escapeHtml(order.name)}<small>${escapeHtml(order.id)} · ${new Date(order.createdAt).toLocaleString('ko-KR')}</small></div><div class="order-cell">${escapeHtml(order.seats.join(', '))}<small>${order.amount.toLocaleString()}원 · 입금자 ${escapeHtml(order.payer)}</small></div><div class="order-cell">${escapeHtml(order.phone)}<small>${order.seats.length}석</small></div><div><span class="badge ${({ paid: 'paid', expired: 'expired', cancelled: 'expired', refund_pending: '', refunded: 'expired' })[order.status] || ''}">${({ pending: '● 입금 대기', paid: '● 입금 확인', expired: '예약 만료', cancelled: '취소됨', refund_pending: '환불 처리 중', refunded: '환불 완료' })[order.status] || '상태 확인 필요'}</span></div><div class="order-actions">${order.status === 'pending' ? `<button class="admin-action" data-confirm="${escapeHtml(order.id)}">입금 확인</button>` : ''}${['pending', 'paid'].includes(order.status) ? `<button class="admin-action danger" data-cancel="${escapeHtml(order.id)}" data-status="${order.status}">예약 취소</button>` : ''}${order.status === 'refund_pending' ? `<button class="admin-action" data-refund-complete="${escapeHtml(order.id)}">환불 완료 처리</button>` : ''}</div></div>`).join('') : '<div class="empty-admin">이 공연에는 아직 예매 신청이 없습니다.</div>'}</div></section><section class="panel reset-panel"><div><h2>전체 예매 기록 초기화</h2><p>1·2·3공의 예약, 좌석 선점, 입금 상태를 모두 삭제합니다. 초기화한 데이터는 복구할 수 없습니다.</p></div><button id="reset-all" class="admin-action danger">전체 초기화</button></section>`;
    view.querySelectorAll('[data-show]').forEach(button => button.onclick = async () => { selectedShow = button.dataset.show; await renderAdmin(); });
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
      try { await api(`/api/admin/bookings/${encodeURIComponent(button.dataset.confirm)}/confirm`, { method: 'POST', body: '{}' }); toast('입금 확인을 완료했습니다.'); await renderAdmin(); refreshSeats().catch(() => {}); }
      catch (error) { toast(error.message); }
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
  document.querySelectorAll('[data-booking-show]').forEach(item => item.classList.toggle('active', item === button));
  updateShowDetails();
  await refreshSeats();
}));
updateShowDetails();
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
