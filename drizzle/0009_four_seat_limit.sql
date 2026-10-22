CREATE TABLE phone_seat_locks_next (
  show_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 4),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat TEXT NOT NULL,
  PRIMARY KEY (show_id, phone, slot),
  UNIQUE (show_id, phone, seat),
  UNIQUE (booking_id, seat)
);

INSERT INTO phone_seat_locks_next(show_id, phone, slot, booking_id, seat)
SELECT show_id, phone, slot, booking_id, seat FROM phone_seat_locks;

DROP TABLE phone_seat_locks;
ALTER TABLE phone_seat_locks_next RENAME TO phone_seat_locks;
