-- Remove terms_accepted_at column from auth.users
ALTER TABLE IF EXISTS auth.users
DROP COLUMN IF EXISTS terms_accepted_at;
