import React from 'react';

// 예약 문의는 카카오 로그인 없이 이 오픈채팅으로 보낸다.
export const OPEN_CHAT_URL = 'https://open.kakao.com/o/sMDbKDUi';

export function OpenChatLink({ className, children, title = '오픈채팅 링크 준비 중' }) {
  if (!OPEN_CHAT_URL) {
    return (
      <button className={className} type="button" disabled title={title}>
        {children}
      </button>
    );
  }

  return (
    <a className={className} href={OPEN_CHAT_URL} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
