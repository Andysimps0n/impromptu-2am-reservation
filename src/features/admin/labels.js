export const EVENT_STATUS_LABEL = {
  draft: '초안',
  published: '게시 중',
  archived: '보관',
  cancelled: '취소됨',
};

export const BOOKING_STATUS_LABEL = {
  pending: '입금 대기',
  paid: '입금 확인',
  refund_pending: '환불 대기',
  refunded: '환불 완료',
  cancelled: '취소됨',
  expired: '만료',
};

export const SMS_STATUS_LABEL = {
  sending: '처리 중',
  accepted: '발송 접수',
  failed: '실패',
  uncertain: '확인 필요',
  not_configured: '설정 필요',
  untracked: '기록 없음',
};

// 목록 위 칩. 켜진 칩의 상태만 보여주고, 모두 꺼져 있으면 전체를 보여 준다.
export const ORDER_FILTERS = [
  { status: 'pending', label: '입금 대기' },
  { status: 'paid', label: '입금 완료' },
  { status: 'refund_pending', label: '환불 대기' },
  { status: 'expired', label: '만료' },
];

export function orderMeta(order) {
  const smsLabel = SMS_STATUS_LABEL[order.notificationStatus] || '—';
  const codeLabel = order.code && order.code !== order.id ? `${order.code} (${order.id})` : order.id;
  return `${codeLabel} · ${new Date(order.createdAt).toLocaleString('ko-KR')} · 입금자 ${order.payer} · 문자: ${smsLabel}`;
}
