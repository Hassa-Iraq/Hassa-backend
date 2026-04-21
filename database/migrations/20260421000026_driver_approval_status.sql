ALTER TABLE auth.driver_profiles
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE auth.driver_profiles
  SET approval_status = 'approved'
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_profiles_approval_status
  ON auth.driver_profiles(approval_status);
