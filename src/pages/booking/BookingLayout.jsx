import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { BackArrowIcon } from '../../components/icons.jsx';
import { Footer } from '../../components/Footer.jsx';

export function BookingLayout() {
  const navigate = useNavigate();
  return (
    <>
      <section className="booking-app">
        <header className="booking-header">
          <button
            className="login-back booking-back"
            type="button"
            aria-label="배너로 돌아가기"
            onClick={() => navigate('/')}
          >
            <BackArrowIcon />
          </button>
          <nav className="booking-nav" aria-label="예매 페이지">
            <NavLink to="/booking/seats">예약</NavLink>
            <NavLink to="/booking/guide">예약 안내</NavLink>
            <NavLink to="/booking/lookup">예약 조회</NavLink>
          </nav>
        </header>
        <Outlet />
      </section>
      <Footer />
    </>
  );
}
