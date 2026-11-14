import React from 'react';
import { authErrorText, KakaoLoginButton } from '../../components/KakaoLoginButton.jsx';

export function BookingSidebar({
  event,
  session,
  selectedSeats,
  price,
  authSession,
  onLogout,
  seatError,
  bookingOpen,
  needsKakaoLogin,
  onBook,
}) {
  return (
    <aside className="panel sidebar">
      <h3>예매 정보</h3>
      <div className="info-row">
        <span>공연 일시</span>
        <strong>{session?.dateLabel || '공연 일정 준비 중'}</strong>
      </div>
      <div className="info-row">
        <span>공연 시간</span>
        <strong>{session?.timeLabel || ''}</strong>
      </div>
      <div className="info-row">
        <span>공연 장소</span>
        <strong>{event?.venue || ''}</strong>
      </div>
      <div className={selectedSeats.length ? '' : 'summary-empty'}>
        {selectedSeats.length ? (
          selectedSeats.map(seat => (
            <div className="summary-seat" key={seat}>
              <span>좌석 {seat}</span>
              <span>{price.toLocaleString()}원</span>
            </div>
          ))
        ) : (
          <>
            좌석을 선택하면
            <br />
            예매 정보가 여기에 표시돼요.
          </>
        )}
      </div>
      <div className="total">
        <span>총 예매 금액</span>
        <strong>{(selectedSeats.length * price).toLocaleString()}원</strong>
      </div>
      {authSession?.bookingRequiresKakao && (
        <div className="booking-auth">
          {authSession.user ? (
            <p className="auth-note">
              {authSession.user.nickname || '카카오 회원'}님으로 로그인되어 있습니다. 이 계정은 회차당 4석까지 예매할 수 있습니다.
              <button className="text-link" type="button" onClick={onLogout}>
                로그아웃
              </button>
            </p>
          ) : authSession.kakaoConfigured ? (
            <>
              <KakaoLoginButton href="/auth/kakao/login?next=booking">카카오 로그인 후 예매</KakaoLoginButton>
              <p className="auth-note">예매는 카카오 로그인 후 진행됩니다. 계정마다 회차당 4석까지입니다.</p>
            </>
          ) : (
            <p className="error-text">{authErrorText('kakao_not_configured')}</p>
          )}
        </div>
      )}
      <BookingButton
        className="sidebar-cta"
        selectedSeats={selectedSeats}
        bookingOpen={bookingOpen}
        needsKakaoLogin={needsKakaoLogin}
        seatError={seatError}
        onBook={onBook}
      />
    </aside>
  );
}

// 예매 신청 버튼. 사이드바와 모바일 하단 고정 바가 같은 문구와 비활성 조건을 쓴다.
export function BookingButton({ className = '', selectedSeats, bookingOpen, needsKakaoLogin, seatError, onBook }) {
  return (
    <button
      className={`primary ${className}`.trim()}
      disabled={!selectedSeats.length || !bookingOpen || needsKakaoLogin}
      onClick={onBook}
    >
      {seatError
        ? '좌석 정보를 확인할 수 없습니다'
        : !bookingOpen
          ? '현재 예매가 마감되었습니다'
          : selectedSeats.length
            ? `${selectedSeats.length}석 예매 신청하기`
            : '좌석을 선택해주세요'}
    </button>
  );
}
