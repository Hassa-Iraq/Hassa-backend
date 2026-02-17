-- Add phone fields to auth.users for phone-based auth
ALTER TABLE IF EXISTS auth.users
ADD COLUMN IF NOT EXISTS phone VARCHAR(32),
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure phone is unique when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
ON auth.users(phone)
WHERE phone IS NOT NULL;

