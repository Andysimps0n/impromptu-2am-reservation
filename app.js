const PRICE = 12000;
const ROWS = Array.from({ length: 12 }, (_, row) => String.fromCharCode(65 + row));
const SEATS = ROWS.flatMap(row => Array.from({ length: 12 }, (_, index) => `${row}${String(index + 1).padStart(2, '0')}`));
let selected = new Set();
let seatStates = {};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json();
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
function renderSeats() {
  const grid = document.querySelector('#seat-grid');
  grid.innerHTML = '';
  ROWS.forEach(rowLetter => {
    const row = document.createElement('div');
    row.className = 'seat-row';
    const label = document.createElement('span');
    label.className = 'row-label';
    label.textContent = rowLetter;
    row.append(label);
    for (let column = 1; column <= 12; column += 1) {
      if (column === 7) {
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
      button.disabled = state !== 'available';
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
  button.disabled = !seats.length;
  button.textContent = seats.length ? `${seats.length}석 예매 신청하기` : '좌석을 선택해주세요';
}
async function refreshSeats() {
  const result = await api('/api/seats');
  seatStates = result.seats;
  for (const seat of selected) if (seatStates[seat] !== 'available') selected.delete(seat);
  renderSeats();
  renderSelection();
}
function closeModal() { document.querySelector('#modal-root').innerHTML = ''; }
function modal(content) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal">${content}</div></div>`;
  root.querySelector('#close-modal')?.addEventListener('click', closeModal);
  root.querySelector('#backdrop').addEventListener('click', event => { if (event.target.id === 'backdrop') closeModal(); });
}
function showBookingSuccess(booking) {
  modal(`<div class="success"><div class="check">✓</div><div class="eyebrow">REQUEST RECEIVED</div><h2>입금 대기 예약이 등록됐어요</h2><p>아래 예약 코드를 입금 메모에 적어주세요.<br>입금 확인 전까지 좌석은 30분간 확보됩니다.</p><div class="code">${escapeHtml(booking.id)}</div><div style="margin:0 0 12px"><span class="badge">● 입금 대기</span></div><div class="bank-box" style="text-align:left"><strong>입금 계좌 안내</strong><br>카카오뱅크 <strong>3333376900284</strong><br>입금액 ${booking.amount.toLocaleString()}원 · 입금자명은 신청 내용과 동일하게</div><button class="primary" id="success-close">예약 정보 보기</button></div>`);
  document.querySelector('#success-close').onclick = () => openLookup(booking.id);
}
function openBooking() {
  const seats = [...selected].sort();
  modal(`<button class="close" id="close-modal">×</button><div class="eyebrow">BOOK YOUR SEAT</div><h2>예매 정보를 입력해주세요</h2><p class="sub">${seats.join(', ')} · ${(seats.length * PRICE).toLocaleString()}원</p><form id="booking-form"><div class="form-grid"><div class="field"><label for="name">예매자 이름</label><input id="name" name="name" required maxlength="40" placeholder="홍길동"></div><div class="field"><label for="phone">연락처</label><input id="phone" name="phone" required type="tel" maxlength="13" placeholder="010-1234-5678"></div><div class="field"><label for="payer">입금자명</label><input id="payer" name="payer" required maxlength="40" placeholder="실제 입금할 이름"></div></div><div class="bank-box"><strong>입금 계좌 안내</strong><br>카카오뱅크 <strong>3333376900284</strong><br>입금 기한: 예약 후 30분 이내</div><button class="primary" id="booking-submit" type="submit">입금 대기 예약하기</button><div id="booking-error" class="error-text"></div><p class="hint">연락처 하나당 최대 2석입니다. 연락처는 예약 조회와 중복 예매 제한에 사용합니다.</p></form>`);
  document.querySelector('#booking-form').onsubmit = async event => {
    event.preventDefault();
    const submit = document.querySelector('#booking-submit');
    const errorMessage = document.querySelector('#booking-error');
    submit.disabled = true;
    submit.textContent = '예약 처리 중…';
    errorMessage.textContent = '';
    const form = new FormData(event.currentTarget);
    try {
      const booking = await api('/api/bookings', { method: 'POST', body: JSON.stringify({ name: form.get('name'), phone: form.get('phone'), payer: form.get('payer'), seats }) });
      selected.clear();
      refreshSeats().catch(() => {});
      showBookingSuccess(booking);
    } catch (error) {
      refreshSeats().catch(() => {});
      errorMessage.textContent = error.message;
      submit.disabled = false;
      submit.textContent = '입금 대기 예약하기';
    }
  };
}
function showBookingResult(booking) {
  const status = ({ paid: '입금 확인 · 예매 확정', pending: '입금 대기', expired: '예약 만료', cancelled: '취소됨 · 입금 전 예약', refund_pending: '취소 접수 · 환불 처리 중', refunded: '환불 완료' })[booking.status] || '상태 확인 필요';
  const badge = ['paid', 'refunded'].includes(booking.status) ? 'badge paid' : ['expired', 'cancelled'].includes(booking.status) ? 'badge expired' : 'badge';
  modal(`<button class="close" id="close-modal">×</button><div class="eyebrow">BOOKING LOOKUP</div><h2>예약 내역</h2><p class="sub">예약 코드 ${escapeHtml(booking.id)}</p><div class="bank-box"><strong>${escapeHtml(booking.name)} · 좌석 ${escapeHtml(booking.seats.join(', '))}</strong><br>${booking.amount.toLocaleString()}원 · 입금자 ${escapeHtml(booking.payer)}<br><span class="${badge}">${status}</span></div><p class="hint">예약 코드와 연락처로 언제든 다시 조회할 수 있어요.</p>`);
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
async function adminLoginScreen(message = '') {
  document.querySelector('#admin-view').dataset.authenticated = 'false';
  document.querySelector('#admin-view').innerHTML = `<div class="admin-login"><div class="eyebrow">BACKSTAGE · ADMIN</div><h2>운영진 로그인</h2><p>공연 예매와 입금 확인은 운영진만 볼 수 있습니다.</p><form id="admin-login-form"><label for="admin-username">아이디</label><input id="admin-username" autocomplete="username" required><label for="admin-password">비밀번호</label><input id="admin-password" type="password" autocomplete="current-password" required><button class="primary" type="submit">로그인</button><div class="error-text" id="admin-login-error">${escapeHtml(message)}</div></form></div>`;
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
    const data = await api('/api/admin/bookings');
    const orders = data.bookings;
    const pending = orders.filter(order => order.status === 'pending').length;
    const paid = orders.filter(order => order.status === 'paid').reduce((sum, order) => sum + order.seats.length, 0);
    view.innerHTML = `<div class="admin-head"><div><div class="eyebrow">BACKSTAGE · ADMIN</div><h1>예매 관리</h1><p>입금 확인, 예약 취소와 환불 처리를 관리해주세요.</p></div><button id="admin-logout" class="admin-action">로그아웃</button></div><div class="metrics"><div class="metric"><span>전체 예매</span><strong>${orders.length} <small>건</small></strong></div><div class="metric"><span>입금 확인 대기</span><strong>${pending} <small>건</small></strong></div><div class="metric"><span>확정된 좌석</span><strong>${paid} <small>석</small></strong></div></div><section class="panel orders"><div class="orders-top"><h2>예매 신청 목록</h2><span>확정 취소 시 실제 환불 송금 후 완료 처리하세요</span></div><div id="orders-list">${orders.length ? orders.map(order => `<div class="order"><div class="order-name">${escapeHtml(order.name)}<small>${escapeHtml(order.id)} · ${new Date(order.createdAt).toLocaleString('ko-KR')}</small></div><div class="order-cell">${escapeHtml(order.seats.join(', '))}<small>${order.amount.toLocaleString()}원 · 입금자 ${escapeHtml(order.payer)}</small></div><div class="order-cell">${escapeHtml(order.phone)}<small>${order.seats.length}석</small></div><div><span class="badge ${({ paid: 'paid', expired: 'expired', cancelled: 'expired', refund_pending: '', refunded: 'expired' })[order.status] || ''}">${({ pending: '● 입금 대기', paid: '● 입금 확인', expired: '예약 만료', cancelled: '취소됨', refund_pending: '환불 처리 중', refunded: '환불 완료' })[order.status] || '상태 확인 필요'}</span></div><div class="order-actions">${order.status === 'pending' ? `<button class="admin-action" data-confirm="${escapeHtml(order.id)}">입금 확인</button>` : ''}${['pending', 'paid'].includes(order.status) ? `<button class="admin-action danger" data-cancel="${escapeHtml(order.id)}" data-status="${order.status}">예약 취소</button>` : ''}${order.status === 'refund_pending' ? `<button class="admin-action" data-refund-complete="${escapeHtml(order.id)}">환불 완료 처리</button>` : ''}</div></div>`).join('') : '<div class="empty-admin">아직 예매 신청이 없습니다.</div>'}</div></section>`;
    document.querySelector('#admin-logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST', body: '{}' }); await adminLoginScreen(); };
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
  } catch (error) { view.innerHTML = `<div class="admin-login"><h2>운영자 화면을 불러오지 못했습니다.</h2><p>${escapeHtml(error.message)}</p></div>`; }
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', async () => {
  document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === tab));
  const isAdmin = tab.dataset.view === 'admin';
  document.querySelector('#booking-view').classList.toggle('hidden', isAdmin);
  document.querySelector('#admin-view').classList.toggle('hidden', !isAdmin);
  if (isAdmin) await renderAdmin();
}));
document.querySelector('#book-button').onclick = openBooking;
document.querySelector('#lookup-open').onclick = () => openLookup();
refreshSeats().catch(error => toast(`좌석 정보를 불러오지 못했습니다: ${error.message}`));
setInterval(() => { if (!document.querySelector('#booking-view').classList.contains('hidden')) refreshSeats().catch(() => {}); }, 12000);
setInterval(() => {
  const admin = document.querySelector('#admin-view');
  if (!admin.classList.contains('hidden') && admin.dataset.authenticated === 'true') renderAdmin();
}, 12000);
