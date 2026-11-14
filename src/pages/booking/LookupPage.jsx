import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../../lib/api.js';
import { formatPhoneInput } from '../../lib/format.js';
import { roadmapProgress } from '../../features/booking/bookingStatus.js';
import { BookingSummary } from '../../features/booking/BookingSummary.jsx';
import { EntryRoadmap } from '../../features/booking/EntryRoadmap.jsx';

export function LookupPage() {
  // 예약 완료 모달에서 넘어오면 예약 코드를 미리 채운다.
  const prefill = useLocation().state?.prefill || '';
  const [id, setId] = useState(prefill);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(null);
  const progress = useMemo(() => roadmapProgress(booking?.status || ''), [booking]);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setBooking(
        await api('/api/booking-lookup', { method: 'POST', body: JSON.stringify({ id, phone }) })
      );
    } catch (problem) {
      setBooking(null);
      setError(problem.message);
    }
    setBusy(false);
  };

  return (
    <section className="content booking-subpage">
      <div className="panel lookup-panel">
        <h2>내 예약 조회</h2>
        <p className="sub">예매할 때 입력한 연락처를 입력해주세요.</p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lookup-code">예약 코드</label>
              <input
                id="lookup-code"
                required
                placeholder="예: 든든919"
                value={id}
                onChange={event => setId(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="lookup-phone">연락처</label>
              <input
                id="lookup-phone"
                type="tel"
                required
                placeholder="010-1234-5678"
                inputMode="numeric"
                maxLength={13}
                value={phone}
                onChange={event => setPhone(formatPhoneInput(event.target.value))}
              />
            </div>
          </div>
          {error && (
            <div className="error-text" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? '조회 중…' : '예약 조회하기'}
          </button>
        </form>
        {booking && <BookingSummary booking={booking} />}
        <EntryRoadmap progress={progress} />
      </div>
    </section>
  );
}
