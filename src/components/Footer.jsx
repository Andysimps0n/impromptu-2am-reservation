import React, { useState } from 'react';
import { Link } from 'react-router';
import { OpenChatLink } from './OpenChatLink.jsx';
import { PrivacySheet } from './PrivacySheet.jsx';
import { InstagramIcon } from './icons.jsx';

export function Footer() {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <>
      <footer className="footer">
        <span>2026 즉흥적 새벽 두 시 · How’d you feel?</span>
        <span className="footer-links">
          <button className="footer-privacy" type="button" onClick={() => setPrivacyOpen(true)}>
            개인정보 처리방침
          </button>
          <span aria-hidden="true">·</span>
          <Link className="footer-admin" to="/admin">
            운영자 로그인
          </Link>
          <span aria-hidden="true">·</span>
          <OpenChatLink className="footer-openchat">카카오톡 문의</OpenChatLink>
          <span aria-hidden="true">·</span>
          <a
            className="footer-instagram"
            href="https://instagram.com/impromptu__2am"
            target="_blank"
            rel="noopener"
            aria-label="인스타그램"
          >
            <InstagramIcon />
          </a>
        </span>
      </footer>
      {privacyOpen && <PrivacySheet onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
