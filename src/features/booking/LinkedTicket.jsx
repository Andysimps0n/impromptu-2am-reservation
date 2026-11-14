import React, { useState } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { TicketQr, TicketState } from './TicketQr.jsx';

export function LinkedTicket({ data, onClose }) {
  const [index, setIndex] = useState(0);
  const tickets = data.tickets || [];
  const ticket = tickets[index];
  if (!ticket)
    return <TicketError message="이 예약의 QR 티켓을 찾지 못했습니다." onClose={onClose} />;
  return (
    <Dialog onClose={onClose} className="linked-ticket-dialog">
      <h2>공연 입장 QR</h2>
      <section className="event-ticket-info">
        <strong>{data.eventTitle || '공연 입장'}</strong>
        <b>{data.subtitle || ''}</b>
        <span>
          {data.showNumber || data.showId}공 · {data.dateLabel} {data.timeLabel}
        </span>
        <span>{data.venue || ''}</span>
      </section>
      <p className="sub">입장할 때 현재 화면의 좌석별 QR을 운영진에게 보여주세요.</p>
      <section className="ticket-list linked-ticket-list">
        <article className="ticket-card linked-ticket-card">
          <TicketQr ticket={ticket} size={220} />
          <div>
            <strong>{ticket.seat} 좌석</strong>
            <TicketState ticket={ticket} />
          </div>
        </article>
        <div className="ticket-nav">
          <button
            className="admin-action"
            disabled={index === 0}
            onClick={() => setIndex(i => i - 1)}
          >
            ← 이전 좌석
          </button>
          <span>
            {index + 1} / {tickets.length}
          </span>
          <button
            className="admin-action"
            disabled={index === tickets.length - 1}
            onClick={() => setIndex(i => i + 1)}
          >
            다음 좌석 →
          </button>
        </div>
      </section>
      <p className="hint">이 페이지는 공연 입장 티켓입니다. 티켓 링크는 예매자만 보관해주세요.</p>
    </Dialog>
  );
}

export function TicketError({ message, onClose }) {
  return (
    <Dialog onClose={onClose}>
      <h2>QR 링크를 열 수 없습니다</h2>
      <p className="sub">{message}</p>
      <p className="hint">예약이 취소됐거나 링크에 문제가 있다면 공연 계정으로 문의해주세요.</p>
    </Dialog>
  );
}
