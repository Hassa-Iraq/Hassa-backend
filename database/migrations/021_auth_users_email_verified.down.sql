-- Remove email_verified column from auth.users
ALTER TABLE IF EXISTS auth.users
DROP COLUMN IF EXISTS email_verified;
