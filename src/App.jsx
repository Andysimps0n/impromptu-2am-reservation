import React, { useEffect, useState } from 'react';
import { PublicApp, pageFromHash } from './public/PublicApp.jsx';
import { AdminApp } from './admin/AdminApp.jsx';
import { PrivacySheet } from './public/PrivacySheet.jsx';

// 고객센터 카카오톡 오픈채팅 링크: 아래 따옴표 안에 오픈채팅 주소를 붙여 넣으세요. 비어 있으면 버튼이 비활성화됩니다.
const OPEN_CHAT_URL = '';

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
            {OPEN_CHAT_URL ? (
              <a
                className="footer-openchat"
                href={OPEN_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                카카오톡 문의
              </a>
            ) : (
              <button className="footer-openchat" type="button" disabled title="오픈채팅 링크 준비 중">
                카카오톡 문의
              </button>
            )}
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
