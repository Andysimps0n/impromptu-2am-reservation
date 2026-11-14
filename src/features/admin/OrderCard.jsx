import React, { useState } from 'react';
import { ChevronDownIcon } from '../../components/icons.jsx';
import { BOOKING_STATUS_LABEL, orderMeta } from './labels.js';

export function OrderCard({ order, onAction }) {
  const [open, setOpen] = useState(false);
  const canCancel = ['pending', 'paid'].includes(order.status);
  const canRetrySms =
    order.status === 'paid' &&
    ['failed', 'not_configured', 'untracked'].includes(order.notificationStatus);

  return (
    <article className={`order is-${order.status}`}>
      <div className="order-headline">
        <div className="order-main">
          <span className={`order-badge is-${order.status}`}>
            {BOOKING_STATUS_LABEL[order.status] || order.status}
          </span>
          <div className="order-fields">
            <strong className="order-name">{order.name}</strong>
            <span className="order-seat">{order.seats.join(', ')}</span>
            <span className="order-price">{Number(order.amount).toLocaleString()}원</span>
          </div>
        </div>
        <div className="order-side">
          {order.status === 'pending' && (
            <button
              type="button"
              className="order-primary"
              onClick={() =>
                window.confirm(`예약 ${order.id}의 입금을 확인했나요?`) &&
                onAction(order.id, 'confirm')
              }
            >
              입금 확인
            </button>
          )}
          {order.status === 'refund_pending' && (
            <button
              type="button"
              className="order-primary"
              onClick={() =>
                window.confirm('실제 환불 송금을 완료했나요?') &&
                onAction(order.id, 'refund-complete')
              }
            >
              환불 완료
            </button>
          )}
          {canRetrySms && (
            <button
              type="button"
              className="order-primary is-outline"
              onClick={() =>
                (order.notificationStatus !== 'untracked' ||
                  window.confirm(
                    '이전 문자 발송 이력이 없습니다. 발송 내역에서 중복 문자가 없는지 확인했나요?'
                  )) &&
                onAction(order.id, 'retry-sms')
              }
            >
              문자 재전송
            </button>
          )}
          <button
            type="button"
            className="order-toggle"
            aria-expanded={open}
            aria-label={open ? '예약 상세 닫기' : '예약 상세 열기'}
            onClick={() => setOpen(current => !current)}
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>
      {open && (
        <div className="order-meta">
          <p>{orderMeta(order)}</p>
          {canCancel && (
            <button
              type="button"
              className="order-cancel"
              onClick={() =>
                window.confirm(
                  order.status === 'paid'
                    ? '환불 대기로 바꾸고 좌석은 바로 다시 엽니다. 송금한 뒤에는 환불 완료를 눌러주세요.'
                    : '예약을 취소하고 좌석을 즉시 해제할까요?'
                ) && onAction(order.id, 'cancel')
              }
            >
              예약 취소
            </button>
          )}
        </div>
      )}
    </article>
  );
}
