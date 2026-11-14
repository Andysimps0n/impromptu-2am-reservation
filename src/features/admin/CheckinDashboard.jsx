import React from 'react';
import { ShowSelect } from './ShowSelect.jsx';

export function CheckinDashboard({ sessions, showId, onSelectShow, checkin }) {
  return (
    <section className="panel checkin-dashboard">
      <div className="checkin-heading">
        <h2>입장 현황</h2>
        <ShowSelect
          sessions={sessions}
          value={showId}
          onChange={onSelectShow}
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
  );
}
