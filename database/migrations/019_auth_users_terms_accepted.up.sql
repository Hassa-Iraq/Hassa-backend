-- Add terms_accepted_at column to auth.users for tracking Terms & Conditions acceptance
ALTER TABLE IF EXISTS auth.users
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE NULL;
