import React from 'react';
import { Link } from 'react-router';

export function AdminHeader({ backTo, backLabel, title, titleExtras, actions }) {
  return (
    <header className="admin-head">
      <div>
        <Link className="login-back" to={backTo}>
          {backLabel}
        </Link>
        <div className="admin-title-line">
          <h1>{title}</h1>
          {titleExtras}
        </div>
      </div>
      {actions && <div className="admin-head-actions">{actions}</div>}
    </header>
  );
}

export function AdminError({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="error-text" role="alert">
      {message}
      <button className="admin-action" onClick={onRetry}>
        다시 시도
      </button>
    </div>
  );
}
