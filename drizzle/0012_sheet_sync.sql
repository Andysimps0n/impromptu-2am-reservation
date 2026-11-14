-- 구글 스프레드시트 동기화 상태. 탭마다 마지막으로 시트에 쓴 내용의 해시를 보관해서, 바뀐 탭만 다시 쓴다.
-- 여기 있는 탭 이름이 이 프로젝트가 관리하는 탭의 목록이며, 공연이 사라지면 그 탭만 시트에서 지운다.
CREATE TABLE IF NOT EXISTS sheet_sync_state (
  tab TEXT PRIMARY KEY,
  sheet_id INTEGER,
  content_hash TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);
