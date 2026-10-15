ALTER TABLE bookings ADD COLUMN show_id TEXT NOT NULL DEFAULT '1';

CREATE TABLE IF NOT EXISTS performance_seat_locks (
  show_id TEXT NOT NULL,
  seat TEXT NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (show_id, seat),
  UNIQUE (booking_id, seat)
);

INSERT OR IGNORE INTO performance_seat_locks(show_id, seat, booking_id)
SELECT b.show_id, s.seat, s.booking_id
FROM booking_seats s
JOIN bookings b ON b.id = s.booking_id
WHERE b.status IN ('pending', 'paid', 'refund_pending');

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO site_settings(key, value) VALUES ('booking_open', 'open');
