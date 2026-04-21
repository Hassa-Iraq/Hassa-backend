ALTER TABLE restaurant.restaurants
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE restaurant.restaurants
  SET approval_status = 'approved'
  WHERE is_active = true AND is_blocked = false;
