import React, { useState } from 'react';
import { AdminModal } from '../../components/Dialog.jsx';
import { objectParticle } from '../../lib/format.js';

export function DeleteEventDialog({ event, onClose, onDelete }) {
  const [value, setValue] = useState('');
  const title = event?.title || '';
  return (
    <AdminModal onClose={onClose}>
      <h2>공연 및 기록 영구 삭제</h2>
      <p>{title}와 연결된 예약·티켓 기록을 삭제합니다. 복구할 수 없습니다.</p>
      <p>
        삭제하려면 &quot;{title}&quot;{objectParticle(title)} 입력하세요.
      </p>
      <input value={value} onChange={e => setValue(e.target.value)} />
      <button
        className="admin-action danger"
        disabled={value !== event?.title}
        onClick={() => onDelete(event.id, value)}
      >
        영구 삭제
      </button>
    </AdminModal>
  );
}
