-- Add email_verified column to auth.users for email verification tracking
ALTER TABLE IF EXISTS auth.users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
