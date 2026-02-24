-- Add device and push fields to auth.users for profile/device binding
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS udid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS device_info JSONB,
  ADD COLUMN IF NOT EXISTS push_token TEXT;
