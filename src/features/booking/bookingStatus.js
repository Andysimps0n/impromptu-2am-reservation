export const STATUS_TEXT = {
  paid: '입금 확인 · 예매 확정',
  pending: '입금 대기',
  expired: '예약 만료',
  cancelled: '취소됨 · 입금 전 예약',
  refund_pending: '취소 접수 · 환불 처리 중',
  refunded: '환불 완료',
};

export const ROADMAP_STEPS = [
  { step: 1, title: '좌석 선택' },
  { step: 2, title: '입금' },
  { step: 3, title: '입금 확인' },
  { step: 4, title: '입장권 발급' },
  { step: 5, title: 'QR 스캔 후 입장' },
];

export function roadmapProgress(status) {
  if (status === 'pending')
    return {
      current: 2,
      doneUntil: 1,
      halted: false,
      hint: '좌석은 잡아 두었어요. 입금 메모에 예약 코드와 이름을 적어주세요. 이미 입금했다면 운영진 확인을 기다려 주세요.',
    };
  if (status === 'paid')
    return {
      current: 5,
      doneUntil: 4,
      halted: false,
      hint: '입금이 확인되고 입장권이 준비되었어요. 공연 당일 QR을 보여주면 입장할 수 있어요.',
    };
  if (status === 'expired')
    return {
      current: 0,
      doneUntil: 1,
      halted: true,
      hint: '입금 시간이 지나 예약이 만료되었어요. 이 예약으로는 입장할 수 없어요.',
    };
  if (status === 'cancelled')
    return {
      current: 0,
      doneUntil: 1,
      halted: true,
      hint: '입금 전에 취소된 예약이에요. 이 예약으로는 입장할 수 없어요.',
    };
  if (status === 'refund_pending')
    return {
      current: 0,
      doneUntil: 3,
      halted: true,
      hint: '환불을 처리하고 있어요. 이 예약으로는 입장할 수 없어요.',
    };
  if (status === 'refunded')
    return {
      current: 0,
      doneUntil: 3,
      halted: true,
      hint: '환불이 완료되었어요. 이 예약으로는 입장할 수 없어요.',
    };
  return {
    current: 0,
    doneUntil: 0,
    halted: false,
    hint: '예약을 조회하면 지금 어느 단계인지, 다음에 무엇을 하면 되는지 알려드려요.',
  };
}
