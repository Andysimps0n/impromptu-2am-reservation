import React, { useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { Toast } from '../components/Toast.jsx';
import { authErrorText } from '../components/KakaoLoginButton.jsx';
import { PublicBookingProvider, usePublicBooking } from '../features/booking/PublicBookingContext.jsx';

// 카카오 로그인에 실패하면 서버가 ?auth_error=코드 로 돌려보낸다.
// 메시지를 띄운 뒤 주소에서 지워서 새로고침해도 다시 뜨지 않게 한다.
function AuthErrorToast() {
  const [params, setParams] = useSearchParams();
  const { showToast } = usePublicBooking();
  const code = params.get('auth_error');
  useEffect(() => {
    if (!code) return;
    const message = authErrorText(code);
    if (message) showToast(message);
    setParams(
      current => {
        current.delete('auth_error');
        return current;
      },
      { replace: true }
    );
  }, [code, setParams, showToast]);
  return null;
}

function PublicToast() {
  return <Toast message={usePublicBooking().toast} />;
}

export function PublicLayout() {
  return (
    <PublicBookingProvider>
      <main>
        <AuthErrorToast />
        <Outlet />
        <PublicToast />
      </main>
    </PublicBookingProvider>
  );
}
