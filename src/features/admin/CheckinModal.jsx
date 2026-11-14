import React, { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AdminModal } from '../../components/Dialog.jsx';
import { api } from '../../lib/api.js';

export function CheckinModal({ showId, onClose }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState(false);
  useEffect(() => {
    if (!camera) return undefined;
    const scanner = new Html5Qrcode('react-checkin-reader');
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 180 } },
        async decoded => {
          setValue(decoded.replace(/^TKT:/i, ''));
          setCamera(false);
          await scanner.stop().catch(() => {});
        }
      )
      .catch(problem => setError(problem.message || '카메라를 시작하지 못했습니다.'));
    return () => {
      if (scanner.isScanning) scanner.stop().catch(() => {});
    };
  }, [camera]);
  const submit = async e => {
    e.preventDefault();
    setError('');
    try {
      const code = value.trim().replace(/^TKT:/i, '');
      const input = code.includes(':')
        ? { bookingId: code.split(':')[0], seat: code.split(':')[1], showId }
        : { ticketId: code, showId };
      const data = await api('/api/admin/tickets/check-in', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setResult(data.ticket);
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  };
  return (
    <AdminModal onClose={onClose}>
      <h2>입장 확인</h2>
      <p>
        선택한 회차의 QR 티켓을 스캔하세요. 카메라를 쓸 수 없으면 티켓 코드 또는 예약코드:좌석을
        입력할 수 있습니다.
      </p>
      <div id="react-checkin-reader" />
      {!camera && (
        <button
          className="admin-action"
          onClick={() => {
            setError('');
            setCamera(true);
          }}
        >
          카메라로 QR 스캔
        </button>
      )}
      <form onSubmit={submit}>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="티켓 코드 또는 예약코드:B01"
        />
        <button className="primary">입장 처리</button>
      </form>
      {error && <p className="error-text">{error}</p>}
      {result && (
        <p role="status">
          입장 확인 완료 · {result.name} · {result.seat}
        </p>
      )}
    </AdminModal>
  );
}
