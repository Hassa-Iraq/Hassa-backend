-- Add profile fields to auth.users for user profile (full name, date of birth, bio)
ALTER TABLE IF EXISTS auth.users
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS bio TEXT;
