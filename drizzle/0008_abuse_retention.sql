CREATE TABLE IF NOT EXISTS request_rate_limits (
  action TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (action, key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS request_rate_limits_by_window
  ON request_rate_limits(window_start);

CREATE INDEX IF NOT EXISTS tickets_by_show_status
  ON tickets(show_id, status, checked_in_at);

ALTER TABLE bookings ADD COLUMN privacy_delete_after INTEGER;
