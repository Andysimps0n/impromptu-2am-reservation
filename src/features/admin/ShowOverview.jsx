import React from 'react';
import { BOOKABLE_SEATS } from '../../lib/seats.js';
import { showOverviewWhen } from '../../lib/format.js';

export function ShowOverview({ sessions }) {
  return (
    <section className="panel show-overview">
      <h2>예매 현황</h2>
      <div className="show-overview-list">
        {sessions.map(item => {
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
  );
}
