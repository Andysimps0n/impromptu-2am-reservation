import React from 'react';

// 관객 화면 모달. 바깥을 누르면 닫힌다.
export function Dialog({ children, onClose, className = '' }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <section className={`modal ${className}`} role="dialog" aria-modal="true">
        <button className="close" type="button" aria-label="닫기" onClick={onClose}>
          ×
        </button>
        {children}
      </section>
    </div>
  );
}

// 운영진 화면 모달. 입력 중 실수로 닫히지 않도록 바깥 클릭으로는 닫지 않는다.
export function AdminModal({ children, onClose, className = '' }) {
  return (
    <div className="modal-backdrop">
      <section className={`modal ${className}`}>
        <button className="close" onClick={onClose}>
          ×
        </button>
        {children}
      </section>
    </div>
  );
}
