import React from 'react';
import { EVENT_STATUS_LABEL } from './labels.js';

// 카드 안 버튼을 눌렀을 때 카드 클릭(공연 상세 이동)까지 번지지 않게 한다.
const stop = handler => e => {
  e.stopPropagation();
  handler();
};

export function EventCard({ event, busy, onOpen, onEdit, onPublish, onDuplicate, onArchive, onDelete }) {
  const editable = event.status !== 'archived';
  return (
    <article
      className="event-admin-card"
      onClick={onOpen}
      role="button"
      tabIndex="0"
      onKeyDown={e => e.key === 'Enter' && onOpen()}
    >
      <div className="event-admin-main">
        <div>
          <span className={`badge ${event.status === 'published' ? 'paid' : ''}`}>
            {EVENT_STATUS_LABEL[event.status] || event.status}
          </span>
          <h3>{event.title}</h3>
          <p className="event-admin-place">{Number(event.ticketPrice).toLocaleString()}원</p>
          <p className="event-admin-count">{event.bookingCount}건 예약</p>
          {event.sessions.length > 0 && (
            <ul className="event-admin-sessions">
              {event.sessions.map(session => (
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
          {editable && (
            <button className="admin-action" onClick={stop(onEdit)}>
              수정
            </button>
          )}
          {event.status === 'draft' && (
            <button className="admin-action" disabled={busy} onClick={stop(onPublish)}>
              게시
            </button>
          )}
          <button className="admin-action" onClick={stop(onDuplicate)}>
            복제
          </button>
          {['published', 'cancelled'].includes(event.status) && (
            <button className="admin-action" onClick={stop(onArchive)}>
              보관
            </button>
          )}
          <button className="admin-action danger" onClick={stop(onDelete)}>
            영구 삭제
          </button>
        </div>
      </div>
    </article>
  );
}
