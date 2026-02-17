-- Remove profile picture URL from auth.users
ALTER TABLE IF EXISTS auth.users
DROP COLUMN IF EXISTS profile_picture_url;
