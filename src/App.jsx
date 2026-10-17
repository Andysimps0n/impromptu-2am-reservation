import React, { useEffect, useState } from 'react';
import { PublicApp, pageFromHash } from './public/PublicApp.jsx';
import { AdminApp } from './admin/AdminApp.jsx';

export function App() {
  const [view, setView] = useState('booking');
  const [hash, setHash] = useState(location.hash);
  const page = pageFromHash(hash);
  const showFooter = view === 'booking' && page.name !== 'home' && page.name !== 'ticket';

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
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
          <button className="staff-link" type="button" onClick={() => setView('admin')}>운영진</button>
        </nav>
      </header>
      <main className={view === 'booking' ? '' : 'hidden'}>
        <PublicApp />
      </main>
      <main className={`admin ${view === 'admin' ? '' : 'hidden'}`}>
        <AdminApp onBackToBooking={() => setView('booking')} />
      </main>
      {showFooter && (
        <footer className="footer">
          <span>© 2026 즉흥적 새벽 두 시 · How’d you feel?</span>
          <span><a href="/privacy">개인정보 처리방침</a> · <a className="instagram-link" href="https://instagram.com/impromptu__2am" target="_blank" rel="noopener">@impromptu__2am</a> DM</span>
        </footer>
      )}
    </div>
  );
}
