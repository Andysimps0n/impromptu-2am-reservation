import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { PublicLayout } from './pages/PublicLayout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { TicketPage } from './pages/TicketPage.jsx';
import { BookingLayout } from './pages/booking/BookingLayout.jsx';
import { SeatsPage } from './pages/booking/SeatsPage.jsx';
import { GuidePage } from './pages/booking/GuidePage.jsx';
import { LookupPage } from './pages/booking/LookupPage.jsx';
import { AdminLayout } from './pages/admin/AdminLayout.jsx';
import { EventListPage } from './pages/admin/EventListPage.jsx';
import { EventDetailPage } from './pages/admin/EventDetailPage.jsx';

const LEGACY_HASH_PAGES = {
  '#booking-seats': '/booking/seats',
  '#booking-guide': '/booking/guide',
  '#booking-lookup': '/booking/lookup',
};

// 예전 주소(/#booking-seats, /?admin=1, 문자로 보낸 /#t=토큰)를 새 경로로 옮긴다.
// 이미 발송된 문자의 티켓 링크가 계속 열리도록 남겨 둔다.
export function legacyRedirect(search, hash) {
  const params = new URLSearchParams(search);
  const authError = params.get('auth_error');
  const query = authError ? `?auth_error=${encodeURIComponent(authError)}` : '';
  if (hash.startsWith('#t=')) return `/ticket${hash}`;
  if (params.get('admin') === '1') return `/admin${query}`;
  if (LEGACY_HASH_PAGES[hash]) return `${LEGACY_HASH_PAGES[hash]}${query}`;
  if (params.get('booking') === '1') return `/booking/seats${query}`;
  return '';
}

function HomeRoute() {
  const { search, hash } = useLocation();
  const target = legacyRedirect(search, hash);
  return target ? <Navigate to={target} replace /> : <HomePage />;
}

export function App() {
  return (
    <div className="shell">
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomeRoute />} />
          <Route path="ticket" element={<TicketPage />} />
          <Route path="booking" element={<BookingLayout />}>
            <Route index element={<Navigate to="seats" replace />} />
            <Route path="seats" element={<SeatsPage />} />
            <Route path="guide" element={<GuidePage />} />
            <Route path="lookup" element={<LookupPage />} />
          </Route>
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<EventListPage />} />
          <Route path="events/:eventId" element={<EventDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
