import React from 'react';

// Query values are codes, never free-form text, so a crafted link cannot inject a message.
export const AUTH_ERROR_TEXT = {
  kakao_not_configured:
    '카카오 로그인 키가 설정되지 않았습니다. KAKAO_REST_API_KEY와 KAKAO_REDIRECT_URI를 확인해주세요.',
  state_mismatch: '로그인 요청을 확인할 수 없습니다. 다시 시도해주세요.',
  kakao_denied: '카카오 로그인이 취소되었습니다.',
  kakao_failed: '카카오 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.',
  not_admin: '이 카카오 계정은 운영진으로 등록되어 있지 않습니다.',
  rate_limited: '로그인 시도가 많습니다. 10분 뒤 다시 시도해주세요.',
};

export const authErrorText = code => AUTH_ERROR_TEXT[code] || '';

export function KakaoLoginButton({ href, children = '카카오 로그인', disabled = false }) {
  const content = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3C6.477 3 2 6.463 2 10.691c0 2.676 1.78 5.023 4.46 6.352l-1.136 4.152c-.1.366.32.662.65.45l4.96-3.284c.34.033.686.05 1.066.05 5.523 0 10-3.463 10-7.72C22 6.463 17.523 3 12 3z"
        />
      </svg>
      {children}
    </>
  );
  if (disabled) {
    return (
      <button className="kakao-login" type="button" disabled>
        {content}
      </button>
    );
  }
  return (
    <a className="kakao-login" href={href}>
      {content}
    </a>
  );
}
