import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePublicBooking } from '../../features/booking/PublicBookingContext.jsx';
import { SeatMap } from '../../features/booking/SeatMap.jsx';
import { BookingButton, BookingSidebar } from '../../features/booking/BookingSidebar.jsx';
import { BookingDialog } from '../../features/booking/BookingDialog.jsx';
import { BookingSuccess } from '../../features/booking/BookingSuccess.jsx';
import { CycleIcon } from '../../components/icons.jsx';

function SeatNotice({ seatError, event, onRetry }) {
  return (
    <div className="booking-closed" role="status">
      <strong>
        {seatError
          ? '좌석 정보를 불러오지 못했습니다.'
          : !event
            ? '현재 공개된 공연이 없습니다.'
            : '현재 예매 접수를 받고 있지 않습니다.'}
      </strong>
      <span>
        {seatError
          ? `${seatError} 인터넷 연결을 확인하고 다시 시도해주세요.`
          : !event
            ? '새 공연 일정이 등록되면 예매를 시작할 수 있습니다.'
            : '예매 기간에 다시 방문해주세요. 운영진이 접수를 열면 좌석을 선택할 수 있습니다.'}
      </span>
      {seatError && (
        <button className="admin-action" type="button" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

export function SeatsPage() {
  const booking = usePublicBooking();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const { event, session, selectedShow, selectedSeats, seatError, bookingOpen } = booking;

  const openBooking = () => {
    if (booking.needsKakaoLogin) {
      location.assign('/auth/kakao/login?next=booking');
      return;
    }
    if (!bookingOpen) {
      booking.showToast('현재 예매 접수 기간이 아닙니다.');
      return;
    }
    if (selectedSeats.length) setModal({ type: 'booking' });
  };
  const submitBooking = async payload => {
    const result = await booking.submitBooking(payload);
    setModal({ type: 'success', booking: result, session });
  };

  return (
    <>
    <div className="content" id="booking-seats">
      <div className="panel seat-panel">
        <div className="section-head">
          <h2>좌석을 선택해주세요</h2>
          <button
            className={`seat-refresh${booking.seatsRefreshing ? ' is-spinning' : ''}`}
            type="button"
            aria-label="현황 조회"
            title="현황 조회"
            disabled={!selectedShow || booking.seatsRefreshing}
            onClick={booking.reloadSeats}
          >
            <CycleIcon />
          </button>
        </div>
        {(seatError || !event || !bookingOpen) && (
          <SeatNotice
            seatError={seatError}
            event={event}
            onRetry={() => {
              booking.refreshEvent();
              booking.refreshSeats();
            }}
          />
        )}
        <SeatMap
          sessions={event?.sessions || []}
          selectedShow={selectedShow}
          onChooseSession={booking.chooseSession}
          seatData={booking.seatData}
          selectedSeats={selectedSeats}
          bookingOpen={bookingOpen}
          onToggleSeat={booking.toggleSeat}
        />
      </div>
      <div className="side-column">
        <BookingSidebar
          event={event}
          session={session}
          selectedSeats={selectedSeats}
          price={booking.price}
          authSession={booking.authSession}
          onLogout={booking.logoutAudience}
          seatError={seatError}
          bookingOpen={bookingOpen}
          needsKakaoLogin={booking.needsKakaoLogin}
          onBook={openBooking}
        />
      </div>
    </div>
      {selectedSeats.length > 0 && (
      <div className="mobile-cta">
        <p className="mobile-cta-total">
          <span>{selectedSeats.length}석</span>
          <strong>{(selectedSeats.length * booking.price).toLocaleString()}원</strong>
        </p>
        <BookingButton
          selectedSeats={selectedSeats}
          bookingOpen={bookingOpen}
          needsKakaoLogin={booking.needsKakaoLogin}
          seatError={seatError}
          onBook={openBooking}
        />
      </div>
      )}
      {modal?.type === 'booking' && (
        <BookingDialog
          session={session}
          seats={selectedSeats}
          price={booking.price}
          onClose={() => setModal(null)}
          onSubmit={submitBooking}
        />
      )}
      {modal?.type === 'success' && (
        <BookingSuccess
          booking={modal.booking}
          session={modal.session}
          onClose={() => setModal(null)}
          onLookup={() =>
            navigate('/booking/lookup', {
              state: { prefill: modal.booking.code || modal.booking.id },
            })
          }
        />
      )}
    </>
  );
}
