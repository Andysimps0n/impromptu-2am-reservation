import React, { useState } from 'react';
import { BOOKING_STATUS_LABEL, orderMeta } from './labels.js';

export function OrderSearchDialog({ orders, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const query = searchQuery.trim().toLowerCase();
  const results = query ? orders.filter(order => order.name.toLowerCase().includes(query)) : [];

  return (
    <div
      className="modal-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal order-search" role="dialog" aria-modal="true" aria-labelledby="order-search-title">
        <button type="button" className="close" onClick={onClose} aria-label="검색 닫기">
          ×
        </button>
        <h2 id="order-search-title">이름 검색</h2>
        <p className="sub">이 회차에서 불러온 예매 기록의 예매자 이름으로 찾습니다.</p>
        <input
          className="order-search-input"
          value={searchQuery}
          autoFocus
          placeholder="예매자 이름"
          onChange={event => setSearchQuery(event.target.value)}
        />
        {query ? (
          results.length ? (
            <ul className="order-search-list">
              {results.map(order => (
                <li key={order.id}>
                  <span className={`order-badge is-${order.status}`}>
                    {BOOKING_STATUS_LABEL[order.status] || order.status}
                  </span>
                  <strong>{order.name}</strong>
                  <span>
                    {order.seats.join(', ')} · {Number(order.amount).toLocaleString()}원
                  </span>
                  <small>{orderMeta(order)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="order-search-empty">일치하는 예약이 없습니다.</p>
          )
        ) : (
          <p className="order-search-empty">이름을 입력하면 예약 기록이 여기에 표시됩니다.</p>
        )}
      </section>
    </div>
  );
}
