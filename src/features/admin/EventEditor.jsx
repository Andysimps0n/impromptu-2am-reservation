import React, { useState } from 'react';
import { AdminModal } from '../../components/Dialog.jsx';
import { dateLabel, timeLabel } from '../../lib/format.js';

const EMPTY_EVENT = {
  title: '',
  subtitle: '',
  description: '',
  venue: '',
  ticketPrice: 6500,
  sessions: [{ startsAt: '' }],
};

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// "2026-11-21T21:00:00+09:00" → { date, period, hour, minute }
const toSessionFields = startsAt => {
  const date = startsAt?.slice(0, 10) || '';
  const time = startsAt?.slice(11, 16);
  if (!time) return { date, period: '오후', hour: '', minute: '' };
  const [h, m] = time.split(':').map(Number);
  return { date, period: h < 12 ? '오전' : '오후', hour: String(h % 12 || 12), minute: String(m).padStart(2, '0') };
};

// { period, hour, minute } → "HH:MM" (24시간제). 값이 덜 채워졌으면 빈 문자열.
const toTime = ({ period, hour, minute }) => {
  if (!hour || minute === '') return '';
  const h = (Number(hour) % 12) + (period === '오후' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${minute}`;
};

export function EventEditor({ event, onClose, onSave }) {
  const initial = event?.sessions ? event : EMPTY_EVENT;
  // 예약이 있으면 서버가 회차 수와 가격 변경을 막으므로, 화면에서도 같은 항목을 잠근다.
  const locked = Number(initial.bookingCount) > 0;
  const [sessions, setSessions] = useState(initial.sessions.map(s => toSessionFields(s.startsAt)));
  const updateSession = (index, field, value) =>
    setSessions(xs => xs.map((x, n) => (n === index ? { ...x, [field]: value } : x)));

  return (
    <AdminModal onClose={onClose}>
      <h2>{event?.id ? '공연 초안 수정' : '새 공연 만들기'}</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            title: f.get('title'),
            subtitle: f.get('subtitle'),
            description: f.get('description'),
            venue: f.get('venue'),
            ticketPrice: Number(f.get('price')),
            sessions: sessions.map(s => {
              const time = toTime(s);
              return {
                startsAt: `${s.date}T${time}:00+09:00`,
                dateLabel: dateLabel(s.date),
                timeLabel: timeLabel(time),
              };
            }),
          });
        }}
      >
        <label>
          공연 제목
          <input name="title" required defaultValue={initial.title} />
        </label>
        <label>
          부제
          <input name="subtitle" defaultValue={initial.subtitle} />
        </label>
        <label>
          공연 소개
          <textarea name="description" defaultValue={initial.description} />
        </label>
        <label>
          장소
          <input name="venue" required defaultValue={initial.venue} />
        </label>
        <label>
          가격
          <input name="price" type="number" min="1" defaultValue={initial.ticketPrice} readOnly={locked} />
        </label>
        <h3>회차 일정</h3>
        {sessions.map((s, i) => (
          <div className="session-card" key={i}>
            <div className="session-card-head">
              <strong>회차 {i + 1}</strong>
              <button
                type="button"
                className="session-remove"
                disabled={locked || sessions.length < 2}
                onClick={() => setSessions(xs => xs.filter((_, n) => n !== i))}
              >
                삭제
              </button>
            </div>
            <div className="session-card-body">
              <label className="session-date">
                <span>날짜</span>
                <input
                  type="date"
                  required
                  value={s.date}
                  onChange={e => updateSession(i, 'date', e.target.value)}
                />
              </label>
              <div className="session-time" role="group" aria-label="시간">
                <span>시간</span>
                <div className="session-time-controls">
                  <div className="session-period" role="radiogroup" aria-label="오전 오후">
                    {['오전', '오후'].map(p => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={s.period === p}
                        className={s.period === p ? 'active' : ''}
                        onClick={() => updateSession(i, 'period', p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <select
                    required
                    aria-label="시"
                    value={s.hour}
                    onChange={e => updateSession(i, 'hour', e.target.value)}
                  >
                    <option value="" disabled>
                      시
                    </option>
                    {HOURS.map(h => (
                      <option key={h} value={h}>
                        {h}시
                      </option>
                    ))}
                  </select>
                  <select
                    required
                    aria-label="분"
                    value={s.minute}
                    onChange={e => updateSession(i, 'minute', e.target.value)}
                  >
                    <option value="" disabled>
                      분
                    </option>
                    {MINUTES.map(m => (
                      <option key={m} value={m}>
                        {m}분
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        ))}
        {locked ? (
          <p className="error-text">예약이 있어 회차 수와 가격은 바꿀 수 없습니다. 날짜·시간과 공연 정보만 수정할 수 있습니다.</p>
        ) : (
          <button
            type="button"
            className="session-add"
            onClick={() => setSessions(xs => [...xs, { date: '', period: '오후', hour: '', minute: '' }])}
          >
            + 회차 추가
          </button>
        )}
        <button className="primary">저장</button>
      </form>
    </AdminModal>
  );
}
