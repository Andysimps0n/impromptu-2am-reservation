ALTER TABLE bookings ADD COLUMN ticket_access_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_ticket_access_hash_unique
  ON bookings(ticket_access_hash)
  WHERE ticket_access_hash IS NOT NULL;
