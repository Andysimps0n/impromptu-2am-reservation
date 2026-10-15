ALTER TABLE bookings ADD COLUMN notification_status TEXT NOT NULL DEFAULT 'untracked';
ALTER TABLE bookings ADD COLUMN notification_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN notification_error_code TEXT;
ALTER TABLE bookings ADD COLUMN notification_updated_at INTEGER;
