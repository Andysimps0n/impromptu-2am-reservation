import React, { useEffect, useState } from 'react';
import { PublicApp, pageFromHash } from './public/PublicApp.jsx';
import { AdminApp } from './admin/AdminApp.jsx';
import { PrivacySheet } from './public/PrivacySheet.jsx';

export function App() {
  const initialParams = new URLSearchParams(location.search);
  const adminEntry = initialParams.get('admin') === '1';
  const [authError] = useState(initialParams.get('auth_error') || '');
  const [view, setView] = useState(adminEntry ? 'admin' : 'booking');
  const [hash, setHash] = useState(location.hash);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const page = pageFromHash(hash);
  const showFooter = view === 'booking' && page.name !== 'home' && page.name !== 'ticket';

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('auth_error') && !params.has('booking')) return;
    params.delete('auth_error');
    params.delete('booking');
    const search = params.toString();
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  }, []);

  return (
    <div className="shell">
      <header className="topbar hidden">
        <div className="brand">
          <div className="brand-mark">
            <img src="즉새두로고2.png" alt="즉새두 로고" />
          </div>
          <div>
            즉흥적 새벽 두 시
            <small>IMPROMPTU__2AM</small>
          </div>
        </div>
        <nav className="tabs">
          <button className="staff-link" type="button" onClick={() => setView('admin')}>
            운영진
          </button>
        </nav>
      </header>
      <main className={view === 'booking' ? '' : 'hidden'}>
        <PublicApp authError={adminEntry ? '' : authError} />
      </main>
      <main className={`admin ${view === 'admin' ? '' : 'hidden'}`}>
        <AdminApp onBackToBooking={() => setView('booking')} authError={adminEntry ? authError : ''} />
      </main>
      {showFooter && (
        <footer className="footer">
          <span>2026 즉흥적 새벽 두 시 · How’d you feel?</span>
          <span className="footer-links">
            <button className="footer-privacy" type="button" onClick={() => setPrivacyOpen(true)}>
              개인정보 처리방침
            </button>
            <span aria-hidden="true">·</span>
            <button className="footer-admin" type="button" onClick={() => setView('admin')}>
              운영자 로그인
            </button>
            <span aria-hidden="true">·</span>
            <a
              className="footer-instagram"
              href="https://instagram.com/impromptu__2am"
              target="_blank"
              rel="noopener"
              aria-label="인스타그램"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
              </svg>
            </a>
          </span>
        </footer>
      )}
      {privacyOpen && <PrivacySheet onClose={() => setPrivacyOpen(false)} />}
    </div>
  );
}
