import React from 'react';
import { SEAT_ROWS, seatCount } from '../../lib/seats.js';
import { withoutYear } from '../../lib/format.js';

const SEAT_STATE_LABEL = {
  sold: '예매 완료',
  held: '입금 대기',
  refund_pending: '환불 처리 중',
  reserved: '운영진 보유석, 예매 불가',
};

export function SeatMap({
  sessions,
  selectedShow,
  onChooseSession,
  seatData,
  selectedSeats,
  bookingOpen,
  onToggleSeat,
}) {
  const selected = sessions.find(item => item.id === selectedShow);

  return (
    <div className="seat-map">
      <div className="stage-line">
        <div className="show-guide" aria-label="공연 일정">
          {sessions.map(item => (
            <div key={item.id} className="show-guide-item">
              <span>{item.sortOrder}공</span>
              <strong>
                {withoutYear(item.dateLabel)} {item.timeLabel}
              </strong>
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
      <p className="seat-map-caption">
        {selected ? `${selected.sortOrder}공 좌석` : '회차를 먼저 선택해주세요'}
      </p>
      <div className={`seat-grid ${selected ? '' : 'is-locked'}`}>
        {SEAT_ROWS.map(letter => {
          const count = seatCount(letter);
          return (
            <div className={`seat-row ${letter === 'L' ? 'short-row' : ''}`} key={letter}>
              <span className="row-label">{letter}</span>
              {Array.from({ length: count }, (_, index) => {
                const seat = `${letter}${String(index + 1).padStart(2, '0')}`;
                const state = seatData?.seats?.[seat] || 'available';
                const picked = state === 'available' && selectedSeats.includes(seat);
                const label =
                  state === 'available'
                    ? picked
                      ? '선택됨'
                      : '선택 가능'
                    : SEAT_STATE_LABEL[state] || '예매 불가';
                return (
                  <React.Fragment key={seat}>
                    {index + 1 === (count === 8 ? 5 : 7) && (
                      <span className="aisle" aria-hidden="true" />
                    )}
                    <button
                      type="button"
                      className={`seat ${picked ? 'selected' : state === 'available' ? '' : state}`}
                      disabled={!selected || !bookingOpen || state !== 'available'}
                      title={`좌석 ${letter}열 ${index + 1}번`}
                      aria-label={`좌석 ${letter}열 ${index + 1}번 ${label}`}
                      onClick={() => onToggleSeat(seat)}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span>
          <i className="dot" /> 선택 가능
        </span>
        <span>
          <i className="dot sel" /> 선택됨
        </span>
        <span>
          <i className="dot sold" /> 예매 완료
        </span>
        <span>
          <i className="dot held" /> 입금 대기
        </span>
        <span>
          <i className="dot reserved" /> 운영진 보유석
        </span>
      </div>
    </div>
  );
}
