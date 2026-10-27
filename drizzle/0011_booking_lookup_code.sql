-- 기숙사 호실 형식 예약 코드(예: 장기려 402호). 고유하지 않아도 되며, 조회는 항상 연락처와 함께 합니다.
-- 기존 예약은 이 값이 NULL이고, 기존 STG- 코드(bookings.id)로 계속 조회됩니다.
ALTER TABLE bookings ADD COLUMN lookup_code TEXT;
CREATE INDEX IF NOT EXISTS bookings_phone_lookup_code
  ON bookings(phone, lookup_code);
