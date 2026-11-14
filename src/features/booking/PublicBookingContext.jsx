import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { MAX_SELECTED_SEATS } from '../../lib/seats.js';
import { useToast } from '../../lib/useToast.js';

const PublicBookingContext = createContext(null);

export const usePublicBooking = () => useContext(PublicBookingContext);

// 관객 화면 전체(배너, 예매 하위 페이지, 티켓)가 함께 쓰는 상태.
// 페이지를 옮겨 다녀도 선택한 좌석이 유지되도록 레이아웃 위에서 들고 있는다.
export function PublicBookingProvider({ children }) {
  const [authSession, setAuthSession] = useState(null);
  const [event, setEvent] = useState(undefined);
  const [selectedShow, setSelectedShow] = useState('');
  const [seatData, setSeatData] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatError, setSeatError] = useState('');
  const [seatsRefreshing, setSeatsRefreshing] = useState(false);
  const [toast, showToast] = useToast(6000);
  const activeEventId = useRef('');
  const session = event?.sessions?.find(item => item.id === selectedShow) || null;
  const price = Number(event?.ticketPrice || seatData?.price || 0);
  const bookingOpen = Boolean(seatData?.bookingOpen);
  const needsKakaoLogin = Boolean(authSession?.bookingRequiresKakao && !authSession?.user);

  const refreshEvent = useCallback(async () => {
    try {
      const result = await api('/api/event');
      const next = result.event;
      const changed = activeEventId.current !== (next?.id || '');
      activeEventId.current = next?.id || '';
      setEvent(next || null);
      if (!next) {
        setSelectedShow('');
        setSelectedSeats([]);
        setSeatData(null);
        return;
      }
      setSelectedShow(current =>
        changed || !next.sessions.some(item => item.id === current)
          ? next.sessions[0]?.id || ''
          : current
      );
      if (changed) {
        setSelectedSeats([]);
        setSeatData(null);
      }
      setSeatError('');
    } catch (problem) {
      setSeatError(problem.message);
      setEvent(current => (current === undefined ? null : current));
    }
  }, []);

  const refreshSeats = useCallback(
    async (show = selectedShow) => {
      if (!show) {
        setSeatData(null);
        return;
      }
      try {
        const result = await api(`/api/seats?show=${encodeURIComponent(show)}`);
        if (show !== selectedShow) return;
        setSeatData(result);
        setSeatError('');
        setSelectedSeats(current => current.filter(seat => result.seats[seat] === 'available'));
      } catch (problem) {
        if (show !== selectedShow) return;
        setSeatData(null);
        setSeatError(problem.message);
      }
    },
    [selectedShow]
  );

  const reloadSeats = async () => {
    if (!selectedShow || seatsRefreshing) return;
    setSeatsRefreshing(true);
    try {
      await refreshSeats(selectedShow);
    } finally {
      setSeatsRefreshing(false);
    }
  };

  useEffect(() => {
    api('/api/auth/session')
      .then(setAuthSession)
      .catch(() => setAuthSession({ user: null, bookingRequiresKakao: false, kakaoConfigured: false }));
  }, []);
  useEffect(() => {
    refreshEvent();
    const timer = setInterval(refreshEvent, 12000);
    return () => clearInterval(timer);
  }, [refreshEvent]);
  useEffect(() => {
    setSeatData(null);
    setSelectedSeats([]);
    refreshSeats(selectedShow);
    const timer = setInterval(() => refreshSeats(selectedShow), 12000);
    return () => clearInterval(timer);
  }, [selectedShow, refreshSeats]);
  useEffect(() => {
    document.title = event
      ? `${event.title} — ${event.subtitle || 'How’d you feel?'}`
      : '즉흥적 새벽 두 시 — How’d you feel?';
  }, [event]);

  const chooseSession = id => {
    if (id === selectedShow) return;
    setSelectedShow(id);
    setSeatData(null);
    setSelectedSeats([]);
  };
  const toggleSeat = seat => {
    if (selectedSeats.includes(seat)) {
      setSelectedSeats(current => current.filter(item => item !== seat));
      return;
    }
    if (selectedSeats.length >= MAX_SELECTED_SEATS) {
      showToast(`한 번에 최대 ${MAX_SELECTED_SEATS}석까지 선택할 수 있어요.`);
      return;
    }
    setSelectedSeats(current => [...current, seat].sort());
  };
  const logoutAudience = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      setAuthSession(current => ({ ...current, user: null }));
    } catch (problem) {
      showToast(problem.message);
    }
  };
  const submitBooking = async payload => {
    const booking = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ ...payload, seats: selectedSeats, showId: selectedShow }),
    });
    setSelectedSeats([]);
    refreshSeats(selectedShow);
    return booking;
  };

  const value = {
    authSession,
    logoutAudience,
    needsKakaoLogin,
    event,
    refreshEvent,
    session,
    price,
    bookingOpen,
    selectedShow,
    chooseSession,
    seatData,
    seatError,
    refreshSeats,
    reloadSeats,
    seatsRefreshing,
    selectedSeats,
    toggleSeat,
    submitBooking,
    toast,
    showToast,
  };
  return <PublicBookingContext.Provider value={value}>{children}</PublicBookingContext.Provider>;
}
