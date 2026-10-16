CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL,
  ticket_price INTEGER NOT NULL CHECK (ticket_price > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived','cancelled')),
  booking_open INTEGER NOT NULL DEFAULT 0 CHECK (booking_open IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  date_label TEXT NOT NULL,
  time_label TEXT NOT NULL,
  starts_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  UNIQUE (event_id, sort_order)
);

CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER PRIMARY KEY CHECK (id=1),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS events_single_published
  ON events(status) WHERE status='published';
CREATE INDEX IF NOT EXISTS event_sessions_by_event
  ON event_sessions(event_id, sort_order);

INSERT OR IGNORE INTO events(id,title,subtitle,description,venue,ticket_price,status,booking_open,created_at,updated_at)
VALUES('legacy-2026','즉흥적 새벽 2시','How’d you feel?','그날 밤, 우리가 느낀 모든 감정을 무대 위로. 당신은 어떻게 느꼈나요?','학관 104호',6500,'published',
  CASE WHEN (SELECT value FROM site_settings WHERE key='booking_open')='closed' THEN 0 ELSE 1 END,0,0);

INSERT OR IGNORE INTO event_sessions(id,event_id,sort_order,date_label,time_label,starts_at)
VALUES
  ('1','legacy-2026',1,'2026년 11월 21일 토요일','오후 8시','2026-11-21T20:00:00+09:00'),
  ('2','legacy-2026',2,'2026년 11월 22일 일요일','오후 3시','2026-11-22T15:00:00+09:00'),
  ('3','legacy-2026',3,'2026년 11월 22일 일요일','오후 9시','2026-11-22T21:00:00+09:00');
