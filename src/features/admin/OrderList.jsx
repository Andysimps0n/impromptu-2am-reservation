import React, { useState } from 'react';
import { SearchIcon } from '../../components/icons.jsx';
import { ORDER_FILTERS } from './labels.js';
import { OrderCard } from './OrderCard.jsx';
import { OrderSearchDialog } from './OrderSearchDialog.jsx';
import { ShowSelect } from './ShowSelect.jsx';

export function OrderList({ sessions, showId, onSelectShow, data, loading, hasCursor, onPage, onAction }) {
  const [filters, setFilters] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  // 입금 대기는 확인 버튼이 필요해서 목록 위에 둔다. 같은 상태끼리는 기존 최신순을 유지한다.
  const orders = [...(data?.bookings || [])].sort(
    (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')
  );
  const visible = filters.length ? orders.filter(order => filters.includes(order.status)) : orders;
  const toggleFilter = status => {
    setFilters(current =>
      current.includes(status) ? current.filter(item => item !== status) : [...current, status]
    );
  };

  return (
    <section className="panel orders">
      <div className="orders-top">
        <div className="orders-heading">
          <h2>회차 예매 목록</h2>
          <div className="orders-heading-tools">
            <button
              type="button"
              className="orders-search"
              aria-label="이름으로 예약 검색"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </button>
            <ShowSelect sessions={sessions} value={showId} onChange={onSelectShow} label="예매 목록을 볼 회차" />
          </div>
        </div>
        <div className="order-filters" role="group" aria-label="예약 상태 필터">
          {ORDER_FILTERS.map(filter => {
            const selected = filters.includes(filter.status);
            return (
              <button
                type="button"
                key={filter.status}
                className={`order-filter is-${filter.status}${selected ? ' is-on' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleFilter(filter.status)}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>
      {loading ? (
        <p className="orders-message">예매 내역을 불러오는 중입니다.</p>
      ) : orders.length ? (
        visible.length ? (
          visible.map(order => <OrderCard order={order} onAction={onAction} key={order.id} />)
        ) : (
          <div className="empty-admin">선택한 상태의 예약이 없습니다.</div>
        )
      ) : (
        <div className="empty-admin">이 회차에는 예매 내역이 없습니다.</div>
      )}
      {searchOpen && <OrderSearchDialog orders={orders} onClose={() => setSearchOpen(false)} />}
      <div className="booking-pagination">
        <button className="admin-action" hidden={!hasCursor} onClick={() => onPage(false)}>
          최신 예약
        </button>
        <button className="admin-action" hidden={!data?.nextCursor} onClick={() => onPage(true)}>
          이전 예약 50건
        </button>
      </div>
    </section>
  );
}
