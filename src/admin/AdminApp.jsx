import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { authErrorText, KakaoLoginButton } from '../KakaoLoginButton.jsx';

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body || '{}');
  } catch {
    throw new Error('예매 서버가 응답하지 않았습니다.');
  }
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
};

const dateLabel = value =>
  value
    ? new Date(`${value}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Seoul',
      })
    : '';
const timeLabel = value => {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m ? ` ${m}분` : ''}`;
};
const statusNames = { draft: '초안', published: '게시 중', archived: '보관', cancelled: '취소됨' };
// A열 12석은 운영진 보유석이다. 관객이 예매할 수 있는 좌석은 140석에서 그 12석을 뺀 수다.
const BOOKABLE_SEATS = 128;

const showChoiceLabel = session => {
  if (!session?.startsAt) return `${session?.sortOrder || ''}공`;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Seoul',
    }).formatToParts(new Date(session.startsAt)).map(part => [part.type, part.value])
  );
  const minute = Number(parts.minute);
  const time = minute ? `${Number(parts.hour)}시 ${minute}분` : `${Number(parts.hour)}시`;
  return `${session.sortOrder}공 · ${Number(parts.month)}월 ${Number(parts.day)}일 ${time}`;
};

const showOverviewWhen = session => {
  if (!session?.startsAt) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Seoul',
    }).formatToParts(new Date(session.startsAt)).map(part => [part.type, part.value])
  );
  return `${Number(parts.month)}월 ${Number(parts.day)}일 · ${parts.hour}:${parts.minute}`;
};

export function AdminApp({ onBackToBooking, authError = '' }) {
  const [auth, setAuth] = useState('loading');
  const [loginOptions, setLoginOptions] = useState({ kakaoConfigured: true, passwordLogin: false });
  const [nickname, setNickname] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [screen, setScreen] = useState('list');
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [showId, setShowId] = useState('');
  const [checkinShowId, setCheckinShowId] = useState('');
  const [bookings, setBookings] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [gridRefreshing, setGridRefreshing] = useState(false);
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
  const refresh = useCallback(
    async (selectedEvent = eventId, selectedShow = showId, nextCursor = cursor, selectedCheckinShow = checkinShowId) => {
      if (!selectedShow) return;
      setError('');
      try {
        const params = new URLSearchParams({ show: selectedShow, limit: '50' });
        if (nextCursor?.showId === selectedShow) {
          params.set('before', String(nextCursor.createdAt));
          params.set('beforeId', nextCursor.id);
        }
        const checkinShow = selectedCheckinShow || selectedShow;
        const [data, entry, eventData] = await Promise.all([
          api(`/api/admin/bookings?${params}`),
          api(`/api/admin/checkin-summary?show=${encodeURIComponent(checkinShow)}`),
          api('/api/admin/events'),
        ]);
        setBookings(data);
        setCheckin(entry);
        setEvents(eventData.events);
      } catch (problem) {
        setError(problem.message);
      }
    },
    [eventId, showId, cursor, checkinShowId]
  );

  useEffect(() => {
    api('/api/admin/session')
      .then(async result => {
        setLoginOptions({
          kakaoConfigured: Boolean(result.kakaoConfigured),
          passwordLogin: Boolean(result.passwordLogin),
        });
        setForbidden(Boolean(result.forbidden));
        setNickname(result.nickname || '');
        if (!result.authenticated) {
          setAuth('logged-out');
          return;
        }
        const items = await loadEvents();
        const preferred =
          items.find(item => item.status === 'published' && item.sessions.length) ||
          items.find(item => item.sessions.length);
        setEventId(preferred?.id || '');
        setShowId(preferred?.sessions[0]?.id || '');
        setCheckinShowId(preferred?.sessions[0]?.id || '');
        setAuth('logged-in');
      })
      .catch(problem => {
        setError(problem.message);
        setAuth('logged-out');
      });
  }, [loadEvents]);

  useEffect(() => {
    if (auth !== 'logged-in' || !showId || screen !== 'detail') return;
    refresh(eventId, showId, cursor, checkinShowId);
    const timer = setInterval(() => refresh(eventId, showId, cursor, checkinShowId), 12000);
    return () => clearInterval(timer);
  }, [auth, screen, eventId, showId, checkinShowId, cursor, refresh]);
  const reloadGrid = async () => {
    if (!showId || gridRefreshing) return;
    setGridRefreshing(true);
    try {
      await refresh(eventId, showId, cursor, checkinShowId);
    } finally {
      setGridRefreshing(false);
    }
  };

  const notify = message => {
    setToast(message);
    window.setTimeout(() => setToast(''), 5000);
  };
  const run = async (action, success) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (success) notify(success);
      await loadEvents();
      if (screen === 'detail') await refresh(eventId, showId, cursor, checkinShowId);
      return true;
    } catch (problem) {
      setError(problem.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const login = async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(async () => {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      setAuth('logged-in');
      await loadEvents();
      setScreen('list');
    }, '로그인했습니다.');
  };
  const selectEvent = item => {
    setEventId(item.id);
    setShowId(item.sessions[0]?.id || '');
    setCheckinShowId(item.sessions[0]?.id || '');
    setCursor(null);
    setBookings(null);
    setScreen('detail');
  };
  const selectSession = id => {
    setShowId(id);
    setCursor(null);
    setBookings(null);
    setSelectedOrder(null);
  };
  const selectCheckinSession = id => {
    setCheckinShowId(id);
    setCheckin(null);
  };
  const back = () => {
    setScreen('list');
    setError('');
    setCursor(null);
  };
  const logout = async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', body: '{}' });
      setAuth('logged-out');
      setNickname('');
      setScreen('list');
      setToast('로그아웃했습니다.');
    } catch (problem) {
      setError(problem.message);
    }
  };
  const logoutAll = async () => {
    if (!window.confirm('이 계정의 모든 기기에서 로그아웃할까요?')) return;
    try {
      await api('/api/auth/logout-all', { method: 'POST', body: '{}' });
      setAuth('logged-out');
      setNickname('');
      setScreen('list');
      setToast('모든 기기에서 로그아웃했습니다.');
    } catch (problem) {
      setError(problem.message);
    }
  };

  if (auth === 'loading')
    return (
      <div className="admin-login">
        <p>운영자 화면을 불러오는 중입니다.</p>
      </div>
    );
  const loginNotice = authErrorText(authError)
    || (forbidden ? authErrorText('not_admin') : '')
    || (!loginOptions.kakaoConfigured ? authErrorText('kakao_not_configured') : '');
  if (auth === 'logged-out')
    return (
      <section className="admin-login">
        <button className="login-back" onClick={() => onBackToBooking?.()}>
          ← 공연 예매로 돌아가기
        </button>
        <h2>운영진 로그인</h2>
        <p>공연 예매와 입금 확인은 등록된 카카오 계정만 볼 수 있습니다.</p>
        <KakaoLoginButton href="/auth/kakao/login?next=admin" disabled={!loginOptions.kakaoConfigured} />
        {loginNotice && (
          <div className="error-text" role="alert">
            {loginNotice}
          </div>
        )}
        {loginOptions.passwordLogin && (
          <>
            <p className="password-login-note">또는 기존 비밀번호로 로그인</p>
            <form onSubmit={login}>
              <label>
                아이디
                <input name="username" autoComplete="username" required />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button className="primary" disabled={busy}>
                로그인
              </button>
            </form>
          </>
        )}
        {error && <div className="error-text">{error}</div>}
      </section>
    );

  const bookingIsOpen = bookings?.bookingOpen ?? event?.bookingOpen ?? false;
  const toggleBooking = () => run(
    () => api('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ bookingOpen: !bookingIsOpen, showId }),
    }),
    bookingIsOpen ? '예매 접수를 닫았습니다.' : '예매 접수를 열었습니다.'
  );
  const openScanner = () => {
    setScanResult(null);
    setScanValue('');
    setScanner(true);
  };
  const header = (
    <header className="admin-head">
      <div>
        {screen === 'detail' ? (
          <button className="login-back" type="button" onClick={back}>
            ← 돌아가기
          </button>
        ) : (
          <button className="login-back" type="button" onClick={() => onBackToBooking?.()}>
            ← 공연 정보로 돌아가기
          </button>
        )}
        <div className="admin-title-line">
          <h1>{screen === 'detail' && event ? event.title : '공연 관리'}</h1>
          {screen === 'detail' && event && (
            <button type="button" className="admin-scan" aria-label="입장 QR 스캔" onClick={openScanner}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M3.2 7.4h2.1l1.1-1.6h7.2l1.1 1.6h2.1c.6 0 1 .4 1 1V15c0 .6-.4 1-1 1H3.2c-.6 0-1-.4-1-1V8.4c0-.6.4-1 1-1Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="10" cy="11.6" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
          )}
          {screen === 'detail' && event && (
            <button
              type="button"
              role="switch"
              aria-checked={bookingIsOpen}
              className={`booking-switch ${bookingIsOpen ? 'is-open' : 'is-closed'}`}
              disabled={busy || event.status !== 'published' || !showId}
              aria-label={bookingIsOpen ? '예매 접수 중. 누르면 대기로 바꿉니다.' : '예매 대기 중. 누르면 접수를 엽니다.'}
              title={event.status !== 'published' ? '공연을 먼저 게시해주세요.' : bookingIsOpen ? '누르면 예매 접수를 닫습니다.' : '누르면 예매 접수를 엽니다.'}
              onClick={toggleBooking}
            >
              <span className="booking-switch-track" aria-hidden="true">
                <span className="booking-switch-knob" />
              </span>
              <span className="booking-switch-label">{bookingIsOpen ? '접수중' : '대기중'}</span>
            </button>
          )}
        </div>
      </div>
      {screen !== 'detail' && (
        <div className="admin-head-actions">
          {loginOptions.passwordLogin && (
            <button className="admin-action" onClick={() => setModal('password')}>
              비밀번호 변경
            </button>
          )}
          {nickname && <span className="admin-who">{nickname}</span>}
          <button className="admin-action" type="button" onClick={logout}>
            로그아웃
          </button>
          <button className="admin-action" type="button" onClick={logoutAll}>
            모든 기기에서 로그아웃
          </button>
        </div>
      )}
    </header>
  );
  const eventList = (
    <>
      <section className="panel event-manager">
        <div className="event-manager-head">
          <div>
            <h2>공연 목록</h2>
            <p>공연을 선택해 회차별 예매와 현장 입장을 관리합니다.</p>
          </div>
          <button className="admin-action" onClick={() => setEditor({})}>
            새 공연 만들기
          </button>
        </div>
        <div className="event-admin-list">
          {events.map(item => (
            <article
              className="event-admin-card"
              key={item.id}
              onClick={() => selectEvent(item)}
              role="button"
              tabIndex="0"
              onKeyDown={e => e.key === 'Enter' && selectEvent(item)}
            >
              <div className="event-admin-main">
                <div>
                  <span className={`badge ${item.status === 'published' ? 'paid' : ''}`}>
                    {statusNames[item.status] || item.status}
                  </span>
                  <h3>{item.title}</h3>
                  <p className="event-admin-place">
                    {Number(item.ticketPrice).toLocaleString()}원
                  </p>
                  <p className="event-admin-count">{item.bookingCount}건 예약</p>
                  {item.sessions.length > 0 && (
                    <ul className="event-admin-sessions">
                      {item.sessions.map(session => (
                        <li key={session.id}>
                          <span className="event-admin-show">{session.sortOrder}공</span>
                          <span>{session.dateLabel}</span>
                          <span className="event-admin-time">{session.timeLabel}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="event-admin-actions">
                  {/* <button
                    className="admin-action"
                    onClick={e => {
                      e.stopPropagation();
                      selectEvent(item);
                    }}
                  >
                    공연 관리
                  </button> */}
                  {(item.status === 'draft' ||
                    (item.status === 'published' &&
                      !Number(item.bookingCount) &&
                      !item.bookingOpen)) && (
                    <button
                      className="admin-action"
                      onClick={e => {
                        e.stopPropagation();
                        setEditor(item);
                      }}
                    >
                      수정
                    </button>
                  )}
                  {item.status === 'draft' && (
                    <button
                      className="admin-action"
                      disabled={busy}
                      onClick={e => {
                        e.stopPropagation();
                        run(
                          () =>
                            api(`/api/admin/events/${encodeURIComponent(item.id)}/publish`, {
                              method: 'POST',
                              body: '{}',
                            }),
                          '공연을 게시했습니다.'
                        );
                      }}
                    >
                      게시
                    </button>
                  )}
                  <button
                    className="admin-action"
                    onClick={e => {
                      e.stopPropagation();
                      run(
                        () =>
                          api(`/api/admin/events/${encodeURIComponent(item.id)}/duplicate`, {
                            method: 'POST',
                            body: '{}',
                          }),
                        '공연 초안을 복제했습니다.'
                      );
                    }}
                  >
                    복제
                  </button>
                  {['published', 'cancelled'].includes(item.status) && (
                    <button
                      className="admin-action"
                      onClick={e => {
                        e.stopPropagation();
                        run(
                          () =>
                            api(`/api/admin/events/${encodeURIComponent(item.id)}/archive`, {
                              method: 'POST',
                              body: '{}',
                            }),
                          '공연을 보관했습니다.'
                        );
                      }}
                    >
                      보관
                    </button>
                  )}
                  <button
                    className="admin-action danger"
                    onClick={e => {
                      e.stopPropagation();
                      setModal(`delete:${item.id}`);
                    }}
                  >
                    영구 삭제
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!events.length && (
            <p className="checkin-empty">
              등록된 공연이 없습니다. 새 공연을 만들면 이곳에서 관리할 수 있습니다.
            </p>
          )}
        </div>
      </section>
    </>
  );

  const activeOrders = bookings?.activeBookings || [];
  const seatMap = (
    <AdminSeatMap
      sessions={event?.sessions || []}
      showId={showId}
      onSelectShow={selectSession}
      orders={activeOrders}
      onSeat={setSelectedOrder}
      onRefresh={reloadGrid}
      refreshing={gridRefreshing}
    />
  );
  const detail = event && (
    <>
      <section className="panel event-context">
        <div className="event-context-summary">
          <h2>{event.venue}</h2>
          <p>
            {statusNames[event.status]} · {Number(event.ticketPrice).toLocaleString()}원 · 전체{' '}
            {event.bookingCount}건 예약
          </p>
        </div>
      </section>
      <section className="panel show-overview">
        <h2>예매 현황</h2>
        <div className="show-overview-list">
          {event.sessions.map(item => {
            const occupied = item.occupiedSeats || 0;
            const pending = item.pendingSeats || 0;
            const filled = Math.min(100, (occupied / BOOKABLE_SEATS) * 100);
            return (
              <article className="show-overview-card" key={item.id}>
                <div className="show-overview-title">
                  <strong>{item.sortOrder}공</strong>
                  <span>{showOverviewWhen(item)}</span>
                </div>
                <div className="show-overview-stats">
                  <p>
                    <span>좌석</span>
                    <b>
                      {occupied} / {BOOKABLE_SEATS}
                    </b>
                  </p>
                  <p>
                    <span>입금 대기</span>
                    <b>{pending}석</b>
                  </p>
                </div>
                <div
                  className="show-overview-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={BOOKABLE_SEATS}
                  aria-valuenow={occupied}
                  aria-label={`${item.sortOrder}공 좌석 ${occupied}/${BOOKABLE_SEATS}`}
                >
                  <span style={{ width: `${filled}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {/* <section className="panel metric-board">
        <div className="metric-board-head">
          <h2>예매 현황</h2>
          <ShowSelect sessions={event.sessions} value={session?.id || ''} onChange={selectSession} label="집계를 볼 회차" />
        </div>
        <div className="metric-board-stats">
          <div>
            <span>전체 예매</span>
            <strong>
              {session?.occupiedSeats || 0} <small>/ {BOOKABLE_SEATS}석</small>
            </strong>
          </div>
          <div>
            <span>입금 대기</span>
            <strong>
              {session?.pendingSeats || 0} <small>석</small>
            </strong>
          </div>
        </div>
      </section> */}
      {seatMap}
      <section className="panel checkin-dashboard">
        <div className="checkin-heading">
          <h2>입장 현황</h2>
          <ShowSelect
            sessions={event.sessions}
            value={checkinShowId}
            onChange={selectCheckinSession}
            label="입장 현황을 볼 회차"
          />
        </div>
        <div className="checkin-progress">
          <div>
            <strong>{checkin?.checkedIn || 0}</strong>
            <span> / {checkin?.total || 0}석 입장 완료</span>
          </div>
        </div>
        <div className="checkin-columns">
          <div>
            <h3>열별 입장</h3>
            {checkin?.rows?.map(row => (
              <p key={row.row}>
                {row.row}열　{row.checked_in}/{row.total}
              </p>
            ))}
          </div>
          <div>
            <h3>최근 입장 처리</h3>
            {checkin?.recent?.map((ticket, index) => (
              <p key={`${ticket.seat}-${ticket.checked_in_at || index}`}>
                {ticket.seat} · {new Date(ticket.checked_in_at).toLocaleTimeString('ko-KR')}
              </p>
            ))}
          </div>
        </div>
      </section>
      <Bookings
        sessions={event.sessions}
        showId={showId}
        onSelectShow={selectSession}
        data={bookings}
        loading={!bookings}
        hasCursor={Boolean(cursor)}
        onPage={next => {
          setCursor(next ? { showId, ...bookings?.nextCursor } : null);
        }}
        onAction={async (id, action) =>
          run(
            () =>
              api(`/api/admin/bookings/${encodeURIComponent(id)}/${action}`, {
                method: 'POST',
                body: '{}',
              }),
            '예약 상태를 갱신했습니다.'
          )
        }
      />
      <div className="event-end-actions">
        <button className="admin-action danger-solid" type="button" onClick={() => setEditor(event)}>
          공연 수정
        </button>
        <button
          className="admin-action danger-solid"
          type="button"
          onClick={() => setModal(`delete:${event.id}`)}
        >
          공연 삭제
        </button>
      </div>
      {scanner && (
        <CheckinModal
          showId={checkinShowId || showId}
          onClose={() => setScanner(false)}
          onResult={setScanResult}
          result={scanResult}
          value={scanValue}
          setValue={setScanValue}
        />
      )}
    </>
  );

  return (
    <div className="admin-react">
      {header}
      {error && (
        <div className="error-text" role="alert">
          {error}
          <button
            className="admin-action"
            onClick={() =>
              screen === 'list' ? loadEvents().catch(e => setError(e.message)) : refresh()
            }
          >
            다시 시도
          </button>
        </div>
      )}
      {screen === 'list'
        ? eventList
        : detail || (
            <section className="panel">
              <h2>공연을 찾을 수 없습니다.</h2>
              <button className="admin-action" onClick={back}>
                공연 목록
              </button>
            </section>
          )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {editor !== undefined && editor !== false && (
        <EventEditor
          event={editor}
          onClose={() => setEditor(false)}
          onSave={payload =>
            run(async () => {
              await api(
                editor?.id
                  ? `/api/admin/events/${encodeURIComponent(editor.id)}`
                  : '/api/admin/events',
                { method: editor?.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }
              );
              setEditor(false);
            }, '공연 초안을 저장했습니다.')
          }
        />
      )}
      {modal.startsWith('delete:') && (
        <DeleteEvent
          event={events.find(item => item.id === modal.slice(7))}
          onClose={() => setModal('')}
          onDelete={async (id, confirmation) => {
            const ok = await run(
              () =>
                api(`/api/admin/events/${encodeURIComponent(id)}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ confirmation }),
                }),
              '공연과 연결 기록을 삭제했습니다.'
            );
            if (ok) {
              setModal('');
              back();
            }
          }}
        />
      )}
      {modal === 'password' && (
        <PasswordDialog
          onClose={() => setModal('')}
          onChange={async payload => {
            setBusy(true);
            try {
              await api('/api/admin/password', { method: 'POST', body: JSON.stringify(payload) });
              setAuth('logged-out');
              setModal('');
              notify('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
            } catch (problem) {
              throw problem;
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {selectedOrder && (
        <div className="modal-backdrop">
          <section className="modal">
            <button className="close" onClick={() => setSelectedOrder(null)}>
              ×
            </button>
            <h2>{selectedOrder.seat} 좌석 예약 정보</h2>
            <p>
              <strong>{selectedOrder.order.name}</strong>
              <br />
              예약 코드 {selectedOrder.order.code || selectedOrder.order.id}
              {selectedOrder.order.code && selectedOrder.order.code !== selectedOrder.order.id
                ? ` (관리번호 ${selectedOrder.order.id})`
                : ''}
              <br />
              연락처 {selectedOrder.order.phone}
              <br />
              입금자명 {selectedOrder.order.payer}
              <br />
              {Number(selectedOrder.order.amount).toLocaleString()}원 ·{' '}
              {selectedOrder.order.seats.length}석
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function AdminSeatMap({ sessions, showId, onSelectShow, orders, onSeat, onRefresh, refreshing }) {
  const states = useMemo(() => {
    const map = new Map();
    for (const order of orders)
      for (const seat of order.seats || []) {
        const ticket = order.tickets?.find(item => item.seat === seat);
        map.set(seat, {
          state:
            order.status === 'pending'
              ? 'held'
              : ticket?.status === 'checked_in'
                ? 'checked_in'
                : order.status === 'paid'
                  ? 'sold'
                  : 'available',
        });
      }
    return map;
  }, [orders]);
  return (
    <section className="panel admin-seat-panel">
      <div className="admin-seat-heading">
        <div>
          <h2>선택 회차 좌석 배치도</h2>
          <p>예약된 좌석을 누르면 예약 상세를 확인할 수 있습니다.</p>
        </div>
        <div className="admin-seat-tools">
          <div className="show-chips admin-show-switch" role="radiogroup" aria-label="좌석을 볼 회차">
            {sessions.map(item => {
              const active = item.id === showId;
              return (
                <button
                  key={item.id}
                  className={`show-chip ${active ? 'active' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    if (item.id !== showId) onSelectShow(item.id);
                  }}
                >
                  {item.sortOrder}공
                </button>
              );
            })}
          </div>
          <button className="admin-action" type="button" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? '조회 중' : '현황 조회'}
          </button>
        </div>
      </div>
      <div className="admin-seat-scroll">
        <div className="admin-seat-board">
          <div className="seat-grid admin-seat-grid">
            {Array.from({ length: 12 }, (_, row) => {
              const letter = String.fromCharCode(65 + row);
              const count = letter === 'L' ? 8 : 12;
              return (
                <div className="seat-row" key={letter}>
                  <span className="row-label">{letter}</span>
                  {seatCells(count).map(cell => {
                    if (cell.kind !== 'seat') {
                      return <span className="aisle" aria-hidden="true" key={`${letter}-${cell.key}`} />;
                    }
                    const seat = `${letter}${String(cell.col + 1).padStart(2, '0')}`;
                    const state = letter === 'A' ? 'reserved' : states.get(seat)?.state || 'available';
                    const order = orders.find(item => item.seats?.includes(seat));
                    return (
                      <button
                        type="button"
                        className={`seat ${state}`}
                        title={`${seat} · ${state}`}
                        aria-label={`${seat} ${state}${order ? ', 예약 상세 보기' : ''}`}
                        key={seat}
                        disabled={!order}
                        onClick={() => onSeat({ seat, order })}
                      >
                        {String(cell.col + 1).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="legend admin-seat-legend">
        <span>
          <i className="dot held" />
          입금 대기
        </span>
        <span>
          <i className="dot sold" />
          예매 완료
        </span>
        <span>
          <i className="dot checked-in" />
          입장 완료
        </span>
      </div>
    </section>
  );
}

// 12석 열은 6석, 통로, 6석이다. L열은 8석이라 양옆에 빈칸을 넣어 통로 위치를 맞춘다.
function seatCells(count) {
  const cells = [];
  let pad = 0;
  const pushPad = () => {
    pad += 1;
    cells.push({ kind: 'pad', key: `pad-${pad}` });
  };
  if (count === 8) pushPad();
  for (let col = 0; col < count; col += 1) {
    if (count === 8 && col === 4) {
      pushPad();
      cells.push({ kind: 'aisle', key: 'aisle' });
      pushPad();
    }
    if (count === 12 && col === 6) cells.push({ kind: 'aisle', key: 'aisle' });
    cells.push({ kind: 'seat', col, key: `seat-${col}` });
  }
  if (count === 8) pushPad();
  return cells;
}

const BOOKING_STATUS_LABEL = {
  pending: '입금 대기',
  paid: '입금 확인',
  refund_pending: '환불 대기',
  refunded: '환불 완료',
  cancelled: '취소됨',
  expired: '만료',
};

const SMS_STATUS_LABEL = {
  sending: '처리 중',
  accepted: '발송 접수',
  failed: '실패',
  uncertain: '확인 필요',
  not_configured: '설정 필요',
  untracked: '기록 없음',
};

// 목록 위 칩. 켜진 칩의 상태만 보여주고, 모두 꺼져 있으면 전체를 보여 준다.
const ORDER_FILTERS = [
  { status: 'pending', label: '입금 대기' },
  { status: 'paid', label: '입금 완료' },
  { status: 'refund_pending', label: '환불 대기' },
  { status: 'expired', label: '만료' },
];

function ShowSelect({ sessions, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const selectedIndex = sessions?.findIndex(item => item.id === value) ?? -1;
  const selected = selectedIndex >= 0 ? sessions[selectedIndex] : sessions?.[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [open]);

  if (!sessions?.length || !selected) return null;

  const choose = index => {
    const item = sessions[index];
    if (!item) return;
    onChange(item.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(index => (index + direction + sessions.length) % sessions.length);
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(activeIndex);
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`show-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="show-select-button"
        ref={buttonRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${sessions[activeIndex]?.id}` : undefined}
        aria-label={label}
        onClick={() => {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen(current => !current);
        }}
        onKeyDown={onButtonKeyDown}
      >
        {showChoiceLabel(selected)}
      </button>
      {open && (
        <ul className="show-select-menu" id={listId} role="listbox" aria-label={label}>
          {sessions.map((item, index) => (
            <li
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={item.id === selected.id}
              className={index === activeIndex ? 'is-active' : ''}
              key={item.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              {showChoiceLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function orderMeta(order) {
  const smsLabel = SMS_STATUS_LABEL[order.notificationStatus] || '—';
  const codeLabel = order.code && order.code !== order.id ? `${order.code} (${order.id})` : order.id;
  return `${codeLabel} · ${new Date(order.createdAt).toLocaleString('ko-KR')} · 입금자 ${order.payer} · 문자: ${smsLabel}`;
}

function OrderCard({ order, onAction }) {
  const [open, setOpen] = useState(false);
  const canCancel = ['pending', 'paid'].includes(order.status);
  const canRetrySms =
    order.status === 'paid' &&
    ['failed', 'not_configured', 'untracked'].includes(order.notificationStatus);

  return (
    <article className={`order is-${order.status}`}>
      <div className="order-headline">
        <div className="order-main">
          <span className={`order-badge is-${order.status}`}>
            {BOOKING_STATUS_LABEL[order.status] || order.status}
          </span>
          <div className="order-fields">
            <strong className="order-name">{order.name}</strong>
            <span className="order-seat">{order.seats.join(', ')}</span>
            <span className="order-price">{Number(order.amount).toLocaleString()}원</span>
          </div>
        </div>
        <div className="order-side">
          {order.status === 'pending' && (
            <button
              type="button"
              className="order-primary"
              onClick={() =>
                window.confirm(`예약 ${order.id}의 입금을 확인했나요?`) &&
                onAction(order.id, 'confirm')
              }
            >
              입금 확인
            </button>
          )}
          {order.status === 'refund_pending' && (
            <button
              type="button"
              className="order-primary"
              onClick={() =>
                window.confirm('실제 환불 송금을 완료했나요?') &&
                onAction(order.id, 'refund-complete')
              }
            >
              환불 완료
            </button>
          )}
          {canRetrySms && (
            <button
              type="button"
              className="order-primary is-outline"
              onClick={() =>
                (order.notificationStatus !== 'untracked' ||
                  window.confirm(
                    '이전 문자 발송 이력이 없습니다. 발송 내역에서 중복 문자가 없는지 확인했나요?'
                  )) &&
                onAction(order.id, 'retry-sms')
              }
            >
              문자 재전송
            </button>
          )}
          <button
            type="button"
            className="order-toggle"
            aria-expanded={open}
            aria-label={open ? '예약 상세 닫기' : '예약 상세 열기'}
            onClick={() => setOpen(current => !current)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M5 7.5 10 12.5 15 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="order-meta">
          <p>{orderMeta(order)}</p>
          {canCancel && (
            <button
              type="button"
              className="order-cancel"
              onClick={() =>
                window.confirm(
                  order.status === 'paid'
                    ? '환불 대기로 바꾸고 좌석은 바로 다시 엽니다. 송금한 뒤에는 환불 완료를 눌러주세요.'
                    : '예약을 취소하고 좌석을 즉시 해제할까요?'
                ) && onAction(order.id, 'cancel')
              }
            >
              예약 취소
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Bookings({ sessions, showId, onSelectShow, data, loading, hasCursor, onPage, onAction }) {
  const [filters, setFilters] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // 입금 대기는 확인 버튼이 필요해서 목록 위에 둔다. 같은 상태끼리는 기존 최신순을 유지한다.
  const orders = [...(data?.bookings || [])].sort(
    (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')
  );
  const visible = filters.length
    ? orders.filter(order => filters.includes(order.status))
    : orders;
  const query = searchQuery.trim().toLowerCase();
  const searchResults = query
    ? orders.filter(order => order.name.toLowerCase().includes(query))
    : [];
  const toggleFilter = status => {
    setFilters(current =>
      current.includes(status) ? current.filter(item => item !== status) : [...current, status]
    );
  };

  return (
    <section className="panel orders">
      <div className="orders-top">
        <div className="orders-heading">
          <h2>회차 예매 목록</h2>
          <div className="orders-heading-tools">
            <button
              type="button"
              className="orders-search"
              aria-label="이름으로 예약 검색"
              onClick={() => setSearchOpen(true)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12.4 12.4 17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <ShowSelect sessions={sessions} value={showId} onChange={onSelectShow} label="예매 목록을 볼 회차" />
          </div>
        </div>
        <div className="order-filters" role="group" aria-label="예약 상태 필터">
          {ORDER_FILTERS.map(filter => {
            const selected = filters.includes(filter.status);
            return (
              <button
                type="button"
                key={filter.status}
                className={`order-filter is-${filter.status}${selected ? ' is-on' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleFilter(filter.status)}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <p className="orders-message">예매 내역을 불러오는 중입니다.</p>
      ) : orders.length ? (
        visible.length ? (
          visible.map(order => <OrderCard order={order} onAction={onAction} key={order.id} />)
        ) : (
          <div className="empty-admin">선택한 상태의 예약이 없습니다.</div>
        )
      ) : (
        <div className="empty-admin">이 회차에는 예매 내역이 없습니다.</div>
      )}
      {searchOpen && (
        <div
          className="modal-backdrop"
          onClick={event => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <section className="modal order-search" role="dialog" aria-modal="true" aria-labelledby="order-search-title">
            <button type="button" className="close" onClick={() => setSearchOpen(false)} aria-label="검색 닫기">
              ×
            </button>
            <h2 id="order-search-title">이름 검색</h2>
            <p className="sub">이 회차에서 불러온 예매 기록의 예매자 이름으로 찾습니다.</p>
            <input
              className="order-search-input"
              value={searchQuery}
              autoFocus
              placeholder="예매자 이름"
              onChange={event => setSearchQuery(event.target.value)}
            />
            {query ? (
              searchResults.length ? (
                <ul className="order-search-list">
                  {searchResults.map(order => (
                    <li key={order.id}>
                      <span className={`order-badge is-${order.status}`}>
                        {BOOKING_STATUS_LABEL[order.status] || order.status}
                      </span>
                      <strong>{order.name}</strong>
                      <span>
                        {order.seats.join(', ')} · {Number(order.amount).toLocaleString()}원
                      </span>
                      <small>{orderMeta(order)}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="order-search-empty">일치하는 예약이 없습니다.</p>
              )
            ) : (
              <p className="order-search-empty">이름을 입력하면 예약 기록이 여기에 표시됩니다.</p>
            )}
          </section>
        </div>
      )}
      <div className="booking-pagination">
        <button className="admin-action" hidden={!hasCursor} onClick={() => onPage(false)}>
          최신 예약
        </button>
        <button className="admin-action" hidden={!data?.nextCursor} onClick={() => onPage(true)}>
          이전 예약 50건
        </button>
      </div>
    </section>
  );
}

function EventEditor({ event, onClose, onSave }) {
  const initial = event?.sessions
    ? event
    : {
        title: '',
        subtitle: '',
        description: '',
        venue: '',
        ticketPrice: 6500,
        sessions: [{ startsAt: '' }],
      };
  const [sessions, setSessions] = useState(
    initial.sessions.map(s => ({
      date: s.startsAt?.slice(0, 10) || '',
      time: s.startsAt?.slice(11, 16) || '',
    }))
  );
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>{event?.id ? '공연 초안 수정' : '새 공연 만들기'}</h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            onSave({
              title: f.get('title'),
              subtitle: f.get('subtitle'),
              description: f.get('description'),
              venue: f.get('venue'),
              ticketPrice: Number(f.get('price')),
              sessions: sessions.map(s => ({
                startsAt: `${s.date}T${s.time}:00+09:00`,
                dateLabel: dateLabel(s.date),
                timeLabel: timeLabel(s.time),
              })),
            });
          }}
        >
          <label>
            공연 제목
            <input name="title" required defaultValue={initial.title} />
          </label>
          <label>
            부제
            <input name="subtitle" defaultValue={initial.subtitle} />
          </label>
          <label>
            공연 소개
            <textarea name="description" defaultValue={initial.description} />
          </label>
          <label>
            장소
            <input name="venue" required defaultValue={initial.venue} />
          </label>
          <label>
            가격
            <input name="price" type="number" min="1" defaultValue={initial.ticketPrice} />
          </label>
          <h3>회차 일정</h3>
          {sessions.map((s, i) => (
            <div className="event-session-fields" key={i}>
              <label>
                날짜
                <input
                  type="date"
                  required
                  value={s.date}
                  onChange={e =>
                    setSessions(xs =>
                      xs.map((x, n) => (n === i ? { ...x, date: e.target.value } : x))
                    )
                  }
                />
              </label>
              <label>
                시간
                <input
                  type="time"
                  required
                  value={s.time}
                  onChange={e =>
                    setSessions(xs =>
                      xs.map((x, n) => (n === i ? { ...x, time: e.target.value } : x))
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="admin-action danger"
                disabled={sessions.length < 2}
                onClick={() => setSessions(xs => xs.filter((_, n) => n !== i))}
              >
                회차 삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-action"
            onClick={() => setSessions(xs => [...xs, { date: '', time: '' }])}
          >
            회차 추가
          </button>
          <button className="primary">초안 저장</button>
        </form>
      </section>
    </div>
  );
}

function objectParticle(text) {
  const last = Array.from(text || '').at(-1) || '';
  const code = last.charCodeAt(0);
  const hasFinalConsonant = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return hasFinalConsonant ? '을' : '를';
}

function DeleteEvent({ event, onClose, onDelete }) {
  const [value, setValue] = useState('');
  const title = event?.title || '';
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>공연 및 기록 영구 삭제</h2>
        <p>{title}와 연결된 예약·티켓 기록을 삭제합니다. 복구할 수 없습니다.</p>
        <p>
          삭제하려면 &quot;{title}&quot;{objectParticle(title)} 입력하세요.
        </p>
        <input value={value} onChange={e => setValue(e.target.value)} />
        <button
          className="admin-action danger"
          disabled={value !== event?.title}
          onClick={() => onDelete(event.id, value)}
        >
          영구 삭제
        </button>
      </section>
    </div>
  );
}

function PasswordDialog({ onClose, onChange }) {
  const [error, setError] = useState('');
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>비밀번호 변경</h2>
        <form
          onSubmit={async e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get('next') !== f.get('confirm')) {
              setError('새 비밀번호가 일치하지 않습니다.');
              return;
            }
            try {
              await onChange({ currentPassword: f.get('current'), newPassword: f.get('next') });
            } catch (problem) {
              setError(problem.message);
            }
          }}
        >
          <label>
            현재 비밀번호
            <input name="current" type="password" required />
          </label>
          <label>
            새 비밀번호
            <input name="next" type="password" minLength="12" required />
          </label>
          <label>
            새 비밀번호 확인
            <input name="confirm" type="password" minLength="12" required />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="primary">비밀번호 변경</button>
        </form>
      </section>
    </div>
  );
}

function CheckinModal({ showId, onClose, onResult, result, value, setValue }) {
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  useEffect(() => {
    if (!camera) return;
    const scanner = new Html5Qrcode('react-checkin-reader');
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 180 } },
        async decoded => {
          setValue(decoded.replace(/^TKT:/i, ''));
          setCamera(false);
          await scanner.stop().catch(() => {});
        }
      )
      .catch(problem => setError(problem.message || '카메라를 시작하지 못했습니다.'));
    return () => {
      if (scanner.isScanning) scanner.stop().catch(() => {});
    };
  }, [camera, setValue]);
  const submit = async e => {
    e.preventDefault();
    setError('');
    try {
      const code = value.trim().replace(/^TKT:/i, '');
      const input = code.includes(':')
        ? { bookingId: code.split(':')[0], seat: code.split(':')[1], showId }
        : { ticketId: code, showId };
      const data = await api('/api/admin/tickets/check-in', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      onResult(data.ticket);
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  };
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="close" onClick={onClose}>
          ×
        </button>
        <h2>입장 확인</h2>
        <p>
          선택한 회차의 QR 티켓을 스캔하세요. 카메라를 쓸 수 없으면 티켓 코드 또는 예약코드:좌석을
          입력할 수 있습니다.
        </p>
        <div id="react-checkin-reader" />
        {!camera && (
          <button
            className="admin-action"
            onClick={() => {
              setError('');
              setCamera(true);
            }}
          >
            카메라로 QR 스캔
          </button>
        )}
        <form onSubmit={submit}>
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="티켓 코드 또는 예약코드:B01"
          />
          <button className="primary">입장 처리</button>
        </form>
        {error && <p className="error-text">{error}</p>}
        {result && (
          <p role="status">
            입장 확인 완료 · {result.name} · {result.seat}
          </p>
        )}
      </section>
    </div>
  );
}
