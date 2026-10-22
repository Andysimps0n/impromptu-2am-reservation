CREATE TABLE users (
  id TEXT PRIMARY KEY,
  kakao_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  created_at INTEGER NOT NULL
);

ALTER TABLE admin_sessions ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS admin_sessions_by_user ON admin_sessions(user_id);

ALTER TABLE bookings ADD COLUMN user_id TEXT;

CREATE TABLE kakao_seat_locks (
  show_id TEXT NOT NULL,
  kakao_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  PRIMARY KEY (show_id, kakao_id, slot),
  UNIQUE (show_id, kakao_id, seat),
  UNIQUE (booking_id, seat)
);
