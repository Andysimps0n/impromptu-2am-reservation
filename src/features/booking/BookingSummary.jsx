import React from 'react';
import { STATUS_TEXT } from './bookingStatus.js';
import { TicketQr, TicketState } from './TicketQr.jsx';

export function BookingSummary({ booking }) {
  const status = STATUS_TEXT[booking.status] || '상태 확인 필요';
  const paid = booking.status === 'paid';
  const badge =
    paid || booking.status === 'refunded'
      ? 'badge paid'
      : ['expired', 'cancelled'].includes(booking.status)
        ? 'badge expired'
        : 'badge';
  return (
    <div id="lookup-result">
      <div className="lookup-summary">
        <strong>
          {booking.showNumber}공 · {booking.dateLabel} {booking.timeLabel}
        </strong>
        예약 코드 {booking.code || booking.id} · {booking.name} · 좌석 {booking.seats.join(', ')}
        <br />
        {Number(booking.amount).toLocaleString()}원 · 입금자 {booking.payer}
        <br />
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
                <TicketState ticket={ticket} />
                <small>
                  {booking.showNumber}공 · {booking.dateLabel} {booking.timeLabel}
                </small>
              </div>
            </article>
          ))}
        </section>
      ) : paid ? (
        <p className="hint">티켓을 준비하고 있습니다. 잠시 후 예약을 다시 조회해주세요.</p>
      ) : null}
    </div>
  );
}
