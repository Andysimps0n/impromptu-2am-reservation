export const SEAT_ROWS = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i));
export const seatCount = letter => (letter === 'L' ? 8 : 12);
export const MAX_SELECTED_SEATS = 4;
// A열 12석은 운영진 보유석이다. 관객이 예매할 수 있는 좌석은 140석에서 그 12석을 뺀 수다.
export const BOOKABLE_SEATS = 128;
export const ACCOUNT_BANK = '카카오뱅크';
export const ACCOUNT_NUMBER = '3333376900284';

// 12석 열은 6석, 통로, 6석이다. L열은 8석이라 양옆에 빈칸을 넣어 통로 위치를 맞춘다.
export function seatCells(count) {
  const cells = [];
  let pad = 0;
  const pushPad = () => {
    pad += 1;
    cells.push({ kind: 'pad', key: `pad-${pad}` });
  };
  if (count === 8) pushPad();
  for (let col = 0; col < count; col += 1) {
    if (count === 8 && col === 4) {
      pushPad();
      cells.push({ kind: 'aisle', key: 'aisle' });
      pushPad();
    }
    if (count === 12 && col === 6) cells.push({ kind: 'aisle', key: 'aisle' });
    cells.push({ kind: 'seat', col, key: `seat-${col}` });
  }
  if (count === 8) pushPad();
  return cells;
}
