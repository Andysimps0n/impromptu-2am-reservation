CREATE TABLE IF NOT EXISTS phone_seat_locks (
  show_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 2),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  PRIMARY KEY (show_id, phone, slot),
  UNIQUE (show_id, phone, seat),
  UNIQUE (booking_id, seat)
);

WITH ranked AS (
  SELECT b.show_id, b.phone, b.id AS booking_id, s.seat,
    ROW_NUMBER() OVER (PARTITION BY b.show_id, b.phone ORDER BY b.created_at, b.id, s.seat) AS slot
  FROM bookings b
  JOIN booking_seats s ON s.booking_id = b.id
  WHERE b.status IN ('pending', 'paid', 'refund_pending')
)
INSERT OR IGNORE INTO phone_seat_locks(show_id, phone, slot, booking_id, seat)
SELECT show_id, phone, slot, booking_id, seat
FROM ranked
WHERE slot <= 2;

CREATE INDEX IF NOT EXISTS bookings_status_created ON bookings(status, created_at);
CREATE INDEX IF NOT EXISTS bookings_show_created ON bookings(show_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_phone_show_status ON bookings(phone, show_id, status);
CREATE INDEX IF NOT EXISTS booking_seats_by_booking ON booking_seats(booking_id);
