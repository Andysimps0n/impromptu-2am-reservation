import React, { useState } from 'react';
import { AdminModal } from '../../components/Dialog.jsx';

export function PasswordDialog({ onClose, onChange }) {
  const [error, setError] = useState('');
  return (
    <AdminModal onClose={onClose}>
      <h2>비밀번호 변경</h2>
      <form
        onSubmit={async e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (f.get('next') !== f.get('confirm')) {
            setError('새 비밀번호가 일치하지 않습니다.');
            return;
          }
          try {
            await onChange({ currentPassword: f.get('current'), newPassword: f.get('next') });
          } catch (problem) {
            setError(problem.message);
          }
        }}
      >
        <label>
          현재 비밀번호
          <input name="current" type="password" required />
        </label>
        <label>
          새 비밀번호
          <input name="next" type="password" minLength="12" required />
        </label>
        <label>
          새 비밀번호 확인
          <input name="confirm" type="password" minLength="12" required />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary">비밀번호 변경</button>
      </form>
    </AdminModal>
  );
}
