-- Remove profile fields from auth.users
ALTER TABLE IF EXISTS auth.users
DROP COLUMN IF EXISTS full_name,
DROP COLUMN IF EXISTS date_of_birth,
DROP COLUMN IF EXISTS bio;
