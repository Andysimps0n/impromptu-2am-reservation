import React from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api.js';
import { useAdmin } from '../../features/admin/AdminContext.jsx';
import { AdminError, AdminHeader } from '../../features/admin/AdminHeader.jsx';
import { EventCard } from '../../features/admin/EventCard.jsx';

const eventAction = (id, action) =>
  api(`/api/admin/events/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' });

export function EventListPage() {
  const admin = useAdmin();
  const navigate = useNavigate();
  const { events, busy, run } = admin;

  return (
    <>
      <AdminHeader
        backTo="/"
        backLabel="← 공연 정보로 돌아가기"
        title="공연 관리"
        actions={
          <>
            {admin.loginOptions.passwordLogin && (
              <button className="admin-action" onClick={admin.openPassword}>
                비밀번호 변경
              </button>
            )}
            {admin.nickname && <span className="admin-who">{admin.nickname}</span>}
            <button className="admin-action" type="button" onClick={admin.logout}>
              로그아웃
            </button>
            <button className="admin-action" type="button" onClick={admin.logoutAll}>
              모든 기기에서 로그아웃
            </button>
          </>
        }
      />
      <AdminError
        message={admin.error}
        onRetry={() => admin.loadEvents().catch(e => admin.setError(e.message))}
      />
      <section className="panel event-manager">
        <div className="event-manager-head">
          <div>
            <h2>공연 목록</h2>
            <p>공연을 선택해 회차별 예매와 현장 입장을 관리합니다.</p>
          </div>
          <button className="admin-action" onClick={() => admin.openEditor()}>
            새 공연 만들기
          </button>
        </div>
        <div className="event-admin-list">
          {events.map(item => (
            <EventCard
              key={item.id}
              event={item}
              busy={busy}
              onOpen={() => {
                admin.setError('');
                navigate(`/admin/events/${encodeURIComponent(item.id)}`);
              }}
              onEdit={() => admin.openEditor(item)}
              onPublish={() => run(() => eventAction(item.id, 'publish'), '공연을 게시했습니다.')}
              onDuplicate={() => run(() => eventAction(item.id, 'duplicate'), '공연 초안을 복제했습니다.')}
              onArchive={() => run(() => eventAction(item.id, 'archive'), '공연을 보관했습니다.')}
              onDelete={() => admin.openDelete(item.id)}
            />
          ))}
          {!events.length && (
            <p className="checkin-empty">
              등록된 공연이 없습니다. 새 공연을 만들면 이곳에서 관리할 수 있습니다.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
