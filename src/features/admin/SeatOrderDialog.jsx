import React from 'react';
import { AdminModal } from '../../components/Dialog.jsx';

export function SeatOrderDialog({ seat, order, onClose }) {
  return (
    <AdminModal onClose={onClose}>
      <h2>{seat} 좌석 예약 정보</h2>
      <p>
        <strong>{order.name}</strong>
        <br />
        예약 코드 {order.code || order.id}
        {order.code && order.code !== order.id ? ` (관리번호 ${order.id})` : ''}
        <br />
        연락처 {order.phone}
        <br />
        입금자명 {order.payer}
        <br />
        {Number(order.amount).toLocaleString()}원 · {order.seats.length}석
      </p>
    </AdminModal>
  );
}
