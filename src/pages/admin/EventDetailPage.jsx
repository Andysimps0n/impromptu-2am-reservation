import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../lib/api.js';
import { CameraIcon } from '../../components/icons.jsx';
import { useAdmin } from '../../features/admin/AdminContext.jsx';
import { AdminError, AdminHeader } from '../../features/admin/AdminHeader.jsx';
import { EVENT_STATUS_LABEL } from '../../features/admin/labels.js';
import { ShowOverview } from '../../features/admin/ShowOverview.jsx';
import { AdminSeatMap } from '../../features/admin/AdminSeatMap.jsx';
import { CheckinDashboard } from '../../features/admin/CheckinDashboard.jsx';
import { OrderList } from '../../features/admin/OrderList.jsx';
import { CheckinModal } from '../../features/admin/CheckinModal.jsx';
import { SeatOrderDialog } from '../../features/admin/SeatOrderDialog.jsx';

// 고른 회차가 공연에 없으면(처음 열었거나 회차가 지워진 경우) 첫 회차를 쓴다.
const pickShow = (event, id) =>
  event?.sessions.some(item => item.id === id) ? id : event?.sessions[0]?.id || '';

function BookingSwitch({ open, disabled, published, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      className={`booking-switch ${open ? 'is-open' : 'is-closed'}`}
      disabled={disabled}
      aria-label={open ? '예매 접수 중. 누르면 대기로 바꿉니다.' : '예매 대기 중. 누르면 접수를 엽니다.'}
      title={!published ? '공연을 먼저 게시해주세요.' : open ? '누르면 예매 접수를 닫습니다.' : '누르면 예매 접수를 엽니다.'}
      onClick={onToggle}
    >
      <span className="booking-switch-track" aria-hidden="true">
        <span className="booking-switch-knob" />
      </span>
      <span className="booking-switch-label">{open ? '접수중' : '대기중'}</span>
    </button>
  );
}

function EventDetail({ eventId }) {
  const admin = useAdmin();
  const { events, loadEvents, setError, busy } = admin;
  const event = events.find(item => item.id === eventId) || null;
  const [pickedShowId, setPickedShowId] = useState('');
  const [pickedCheckinShowId, setPickedCheckinShowId] = useState('');
  const [bookings, setBookings] = useState(null);
  const [checkin, setCheckin] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [gridRefreshing, setGridRefreshing] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const showId = pickShow(event, pickedShowId);
  const checkinShowId = pickShow(event, pickedCheckinShowId) || showId;

  const refresh = useCallback(async () => {
    if (!showId) return;
    setError('');
    try {
      const params = new URLSearchParams({ show: showId, limit: '50' });
      if (cursor?.showId === showId) {
        params.set('before', String(cursor.createdAt));
        params.set('beforeId', cursor.id);
      }
      const [data, entry] = await Promise.all([
        api(`/api/admin/bookings?${params}`),
        api(`/api/admin/checkin-summary?show=${encodeURIComponent(checkinShowId)}`),
        loadEvents(),
      ]);
      setBookings(data);
      setCheckin(entry);
    } catch (problem) {
      setError(problem.message);
    }
  }, [showId, checkinShowId, cursor, loadEvents, setError]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 12000);
    return () => clearInterval(timer);
  }, [refresh]);
  // 목록으로 돌아갈 때 이 화면의 오류 문구를 남기지 않는다.
  useEffect(() => () => setError(''), [setError]);

  // 공통 작업 실행 뒤 이 화면의 예매·입장 현황도 바로 새로 고친다.
  const run = async (action, success) => {
    const ok = await admin.run(action, success);
    if (ok) await refresh();
    return ok;
  };
  const reloadGrid = async () => {
    if (!showId || gridRefreshing) return;
    setGridRefreshing(true);
    try {
      await refresh();
    } finally {
      setGridRefreshing(false);
    }
  };
  const selectSession = id => {
    setPickedShowId(id);
    setCursor(null);
    setBookings(null);
    setSelectedOrder(null);
  };
  const selectCheckinSession = id => {
    setPickedCheckinShowId(id);
    setCheckin(null);
  };

  if (!event)
    return (
      <>
        <AdminHeader backTo="/admin" backLabel="← 돌아가기" title="공연 관리" />
        <section className="panel">
          <h2>공연을 찾을 수 없습니다.</h2>
          <Link className="admin-action" to="/admin">
            공연 목록
          </Link>
        </section>
      </>
    );

  const bookingIsOpen = bookings?.bookingOpen ?? event.bookingOpen ?? false;
  const toggleBooking = () =>
    run(
      () =>
        api('/api/admin/settings', {
          method: 'POST',
          body: JSON.stringify({ bookingOpen: !bookingIsOpen, showId }),
        }),
      bookingIsOpen ? '예매 접수를 닫았습니다.' : '예매 접수를 열었습니다.'
    );

  return (
    <>
      <AdminHeader
        backTo="/admin"
        backLabel="← 돌아가기"
        title={event.title}
        titleExtras={
          <>
            <button type="button" className="admin-scan" aria-label="입장 QR 스캔" onClick={() => setScanner(true)}>
              <CameraIcon />
            </button>
            <BookingSwitch
              open={bookingIsOpen}
              published={event.status === 'published'}
              disabled={busy || event.status !== 'published' || !showId}
              onToggle={toggleBooking}
            />
          </>
        }
      />
      <AdminError message={admin.error} onRetry={refresh} />
      <section className="panel event-context">
        <div className="event-context-summary">
          <h2>{event.venue}</h2>
          <p>
            {EVENT_STATUS_LABEL[event.status]} · {Number(event.ticketPrice).toLocaleString()}원 · 전체{' '}
            {event.bookingCount}건 예약
          </p>
        </div>
      </section>
      <ShowOverview sessions={event.sessions} />
      <AdminSeatMap
        sessions={event.sessions}
        showId={showId}
        onSelectShow={selectSession}
        orders={bookings?.activeBookings || []}
        onSeat={setSelectedOrder}
        onRefresh={reloadGrid}
        refreshing={gridRefreshing}
      />
      <CheckinDashboard
        sessions={event.sessions}
        showId={checkinShowId}
        onSelectShow={selectCheckinSession}
        checkin={checkin}
      />
      <OrderList
        sessions={event.sessions}
        showId={showId}
        onSelectShow={selectSession}
        data={bookings}
        loading={!bookings}
        hasCursor={Boolean(cursor)}
        onPage={next => setCursor(next ? { showId, ...bookings?.nextCursor } : null)}
        onAction={(id, action) =>
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
        <button className="admin-action danger-solid" type="button" onClick={() => admin.openEditor(event)}>
          공연 수정
        </button>
        <button className="admin-action danger-solid" type="button" onClick={() => admin.openDelete(event.id)}>
          공연 삭제
        </button>
      </div>
      {scanner && <CheckinModal showId={checkinShowId} onClose={() => setScanner(false)} />}
      {selectedOrder && (
        <SeatOrderDialog
          seat={selectedOrder.seat}
          order={selectedOrder.order}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </>
  );
}

export function EventDetailPage() {
  const { eventId } = useParams();
  // 다른 공연으로 옮기면 회차 선택·페이지 위치를 처음부터 다시 잡는다.
  return <EventDetail key={eventId} eventId={eventId} />;
}
