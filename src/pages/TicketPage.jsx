import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { LinkedTicket, TicketError } from '../features/booking/LinkedTicket.jsx';

// 티켓 토큰은 주소의 # 뒤(/ticket#t=토큰)에 둔다. # 뒤는 서버로 보내지지 않는다.
export const ticketTokenFromHash = hash =>
  /^#t=([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22})$/.exec(hash)?.[1] || '';

export function TicketPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const token = ticketTokenFromHash(hash);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) {
      setResult({ error: '티켓 링크 형식이 올바르지 않습니다.' });
      return;
    }
    api('/api/ticket-link', { method: 'POST', body: JSON.stringify({ token }) })
      .then(data => setResult({ data }))
      .catch(error => setResult({ error: error.message }));
  }, [token]);

  const close = () => navigate('/', { replace: true });
  if (!result) return null;
  return result.data ? (
    <LinkedTicket data={result.data} onClose={close} />
  ) : (
    <TicketError message={result.error} onClose={close} />
  );
}
