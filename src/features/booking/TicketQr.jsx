import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export function TicketQr({ ticket, size }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (canvas.current)
      QRCode.toCanvas(canvas.current, `TKT:${ticket.id}`, {
        width: size,
        margin: 1,
        errorCorrectionLevel: 'M',
      }).catch(() => {});
  }, [ticket.id, size]);
  return <canvas ref={canvas} aria-label={`${ticket.seat} 입장 QR`} />;
}

export function TicketState({ ticket }) {
  const used = ticket.status === 'checked_in';
  return (
    <span className={`ticket-state ${used ? 'used' : ''}`}>{used ? '입장 완료' : '입장 전'}</span>
  );
}
