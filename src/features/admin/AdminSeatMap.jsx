import React, { useMemo } from 'react';
import { SEAT_ROWS, seatCells, seatCount } from '../../lib/seats.js';

const seatStateFor = (order, ticket) =>
  order.status === 'pending'
    ? 'held'
    : ticket?.status === 'checked_in'
      ? 'checked_in'
      : order.status === 'paid'
        ? 'sold'
        : 'available';

export function AdminSeatMap({ sessions, showId, onSelectShow, orders, onSeat, onRefresh, refreshing }) {
  const states = useMemo(() => {
    const map = new Map();
    for (const order of orders)
      for (const seat of order.seats || []) {
        const ticket = order.tickets?.find(item => item.seat === seat);
        map.set(seat, seatStateFor(order, ticket));
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
            {SEAT_ROWS.map(letter => (
              <div className="seat-row" key={letter}>
                <span className="row-label">{letter}</span>
                {seatCells(seatCount(letter)).map(cell => {
                  if (cell.kind !== 'seat') {
                    return <span className="aisle" aria-hidden="true" key={`${letter}-${cell.key}`} />;
                  }
                  const seat = `${letter}${String(cell.col + 1).padStart(2, '0')}`;
                  const state = letter === 'A' ? 'reserved' : states.get(seat) || 'available';
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
            ))}
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
