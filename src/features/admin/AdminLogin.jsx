import React from 'react';
import { Link } from 'react-router';
import { KakaoLoginButton } from '../../components/KakaoLoginButton.jsx';

export function AdminLogin({ loginOptions, notice, error, busy, onPasswordLogin }) {
  return (
    <section className="admin-login">
      <Link className="login-back" to="/">
        ← 공연 예매로 돌아가기
      </Link>
      <h2>운영진 로그인</h2>
      <p>공연 예매와 입금 확인은 등록된 카카오 계정만 볼 수 있습니다.</p>
      <KakaoLoginButton href="/auth/kakao/login?next=admin" disabled={!loginOptions.kakaoConfigured} />
      {notice && (
        <div className="error-text" role="alert">
          {notice}
        </div>
      )}
      {loginOptions.passwordLogin && (
        <>
          <p className="password-login-note">또는 기존 비밀번호로 로그인</p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              onPasswordLogin(form.get('username'), form.get('password'));
            }}
          >
            <label>
              아이디
              <input name="username" autoComplete="username" required />
            </label>
            <label>
              비밀번호
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="primary" disabled={busy}>
              로그인
            </button>
          </form>
        </>
      )}
      {error && <div className="error-text">{error}</div>}
    </section>
  );
}
