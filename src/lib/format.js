// 입력값을 010-1234-5678처럼 보여 준다.
// 숫자만 남기고, 앞 3자리 다음, 그다음 4자리 다음에 하이픈을 넣는다.
export const formatPhoneInput = value => {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

export function withoutYear(label) {
  return String(label || '').replace(/^\d{4}년\s*/, '');
}

export const dateLabel = value =>
  value
    ? new Date(`${value}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Seoul',
      })
    : '';

export const timeLabel = value => {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m ? ` ${m}분` : ''}`;
};

const seoulParts = (startsAt, timeFormat) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: timeFormat,
      minute: timeFormat,
      hourCycle: 'h23',
      timeZone: 'Asia/Seoul',
    })
      .formatToParts(new Date(startsAt))
      .map(part => [part.type, part.value])
  );

export const showChoiceLabel = session => {
  if (!session?.startsAt) return `${session?.sortOrder || ''}공`;
  const parts = seoulParts(session.startsAt, 'numeric');
  const minute = Number(parts.minute);
  const time = minute ? `${Number(parts.hour)}시 ${minute}분` : `${Number(parts.hour)}시`;
  return `${session.sortOrder}공 · ${Number(parts.month)}월 ${Number(parts.day)}일 ${time}`;
};

export const showOverviewWhen = session => {
  if (!session?.startsAt) return '';
  const parts = seoulParts(session.startsAt, '2-digit');
  return `${Number(parts.month)}월 ${Number(parts.day)}일 · ${parts.hour}:${parts.minute}`;
};

export function objectParticle(text) {
  const last = Array.from(text || '').at(-1) || '';
  const code = last.charCodeAt(0);
  const hasFinalConsonant = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return hasFinalConsonant ? '을' : '를';
}
