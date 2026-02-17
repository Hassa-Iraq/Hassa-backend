-- Add profile picture URL to auth.users
ALTER TABLE IF EXISTS auth.users
ADD COLUMN IF NOT EXISTS profile_picture_url VARCHAR(2048);
