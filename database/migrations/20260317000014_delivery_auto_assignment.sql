-- Enable automatic driver assignment with timeout/retry
-- 1) Allow unassigned deliveries (driver_user_id nullable) for pending_assignment state
-- 2) Track assignment expiry and attempted drivers to support reassignments

ALTER TABLE delivery.deliveries
  ALTER COLUMN driver_user_id DROP NOT NULL;

ALTER TABLE delivery.deliveries
  ADD COLUMN IF NOT EXISTS assignment_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempted_driver_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_deliveries_assignment_expires_at
  ON delivery.deliveries(assignment_expires_at)
  WHERE status = 'assigned';