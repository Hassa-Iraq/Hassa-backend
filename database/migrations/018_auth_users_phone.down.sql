-- Remove phone fields from auth.users
ALTER TABLE IF EXISTS auth.users
DROP COLUMN IF EXISTS phone,
DROP COLUMN IF EXISTS phone_verified;

DROP INDEX IF EXISTS idx_users_phone_unique;

