import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/useToast.js';
import { Toast } from '../../components/Toast.jsx';
import { authErrorText } from '../../components/KakaoLoginButton.jsx';
import { AdminContext } from '../../features/admin/AdminContext.jsx';
import { AdminLogin } from '../../features/admin/AdminLogin.jsx';
import { EventEditor } from '../../features/admin/EventEditor.jsx';
import { DeleteEventDialog } from '../../features/admin/DeleteEventDialog.jsx';
import { PasswordDialog } from '../../features/admin/PasswordDialog.jsx';

// /admin 아래 모든 화면의 공통 틀. 로그인 확인, 공연 목록, 공연 수정·삭제 모달을 맡는다.
export function AdminLayout() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // 카카오 로그인 실패 코드는 한 번 읽어 두고 주소에서는 지운다.
  const [authError] = useState(() => params.get('auth_error') || '');
  const [auth, setAuth] = useState('loading');
  const [loginOptions, setLoginOptions] = useState({ kakaoConfigured: true, passwordLogin: false });
  const [nickname, setNickname] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, notify] = useToast(5000);
  const [editor, setEditor] = useState(null);
  const [deleteId, setDeleteId] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);

  const loadEvents = useCallback(async () => {
    const result = await api('/api/admin/events');
    setEvents(result.events);
    return result.events;
  }, []);

  useEffect(() => {
    if (!params.has('auth_error')) return;
    setParams(
      current => {
        current.delete('auth_error');
        return current;
      },
      { replace: true }
    );
  }, [params, setParams]);

  useEffect(() => {
    api('/api/admin/session')
      .then(async result => {
        setLoginOptions({
          kakaoConfigured: Boolean(result.kakaoConfigured),
          passwordLogin: Boolean(result.passwordLogin),
        });
        setForbidden(Boolean(result.forbidden));
        setNickname(result.nickname || '');
        if (!result.authenticated) {
          setAuth('logged-out');
          return;
        }
        await loadEvents();
        setAuth('logged-in');
      })
      .catch(problem => {
        setError(problem.message);
        setAuth('logged-out');
      });
  }, [loadEvents]);

  // 작업을 실행하고 성공하면 알림을 띄운 뒤 공연 목록을 다시 불러온다. 성공 여부를 돌려준다.
  const run = useCallback(
    async (action, success) => {
      setBusy(true);
      setError('');
      try {
        await action();
        if (success) notify(success);
        await loadEvents();
        return true;
      } catch (problem) {
        setError(problem.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [loadEvents, notify]
  );

  const signedOut = message => {
    setAuth('logged-out');
    setNickname('');
    notify(message);
    navigate('/admin');
  };
  const logout = async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', body: '{}' });
      signedOut('로그아웃했습니다.');
    } catch (problem) {
      setError(problem.message);
    }
  };
  const logoutAll = async () => {
    if (!window.confirm('이 계정의 모든 기기에서 로그아웃할까요?')) return;
    try {
      await api('/api/auth/logout-all', { method: 'POST', body: '{}' });
      signedOut('모든 기기에서 로그아웃했습니다.');
    } catch (problem) {
      setError(problem.message);
    }
  };
  const passwordLogin = (username, password) =>
    run(async () => {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuth('logged-in');
    }, '로그인했습니다.');

  const saveEvent = payload =>
    run(async () => {
      await api(
        editor?.id ? `/api/admin/events/${encodeURIComponent(editor.id)}` : '/api/admin/events',
        { method: editor?.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }
      );
      setEditor(null);
    }, '공연 초안을 저장했습니다.');
  const deleteEvent = async (id, confirmation) => {
    const ok = await run(
      () =>
        api(`/api/admin/events/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          body: JSON.stringify({ confirmation }),
        }),
      '공연과 연결 기록을 삭제했습니다.'
    );
    if (ok) {
      setDeleteId('');
      navigate('/admin');
    }
  };
  const changePassword = async payload => {
    setBusy(true);
    try {
      await api('/api/admin/password', { method: 'POST', body: JSON.stringify(payload) });
      setAuth('logged-out');
      setPasswordOpen(false);
      notify('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
    } finally {
      setBusy(false);
    }
  };

  let content;
  if (auth === 'loading') {
    content = (
      <div className="admin-login">
        <p>운영자 화면을 불러오는 중입니다.</p>
      </div>
    );
  } else if (auth === 'logged-out') {
    const notice =
      authErrorText(authError) ||
      (forbidden ? authErrorText('not_admin') : '') ||
      (!loginOptions.kakaoConfigured ? authErrorText('kakao_not_configured') : '');
    content = (
      <AdminLogin
        loginOptions={loginOptions}
        notice={notice}
        error={error}
        busy={busy}
        onPasswordLogin={passwordLogin}
      />
    );
  } else {
    const value = {
      events,
      loadEvents,
      run,
      busy,
      error,
      setError,
      notify,
      nickname,
      loginOptions,
      logout,
      logoutAll,
      openEditor: event => setEditor(event || {}),
      openDelete: setDeleteId,
      openPassword: () => setPasswordOpen(true),
    };
    content = (
      <AdminContext.Provider value={value}>
        <div className="admin-react">
          <Outlet />
          {editor && <EventEditor event={editor} onClose={() => setEditor(null)} onSave={saveEvent} />}
          {deleteId && (
            <DeleteEventDialog
              event={events.find(item => item.id === deleteId)}
              onClose={() => setDeleteId('')}
              onDelete={deleteEvent}
            />
          )}
          {passwordOpen && (
            <PasswordDialog onClose={() => setPasswordOpen(false)} onChange={changePassword} />
          )}
        </div>
      </AdminContext.Provider>
    );
  }

  return (
    <main className="admin">
      {content}
      <Toast message={toast} />
    </main>
  );
}
