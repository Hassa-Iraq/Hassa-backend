-- Add purpose column to password_reset_tokens table for better OTP type differentiation
ALTER TABLE IF EXISTS auth.password_reset_tokens
ADD COLUMN IF NOT EXISTS purpose VARCHAR(50);

-- Update existing records with inferred purposes
UPDATE auth.password_reset_tokens
SET purpose = CASE
  WHEN token IS NULL AND otp IS NOT NULL THEN 'verify_phone'
  WHEN token IS NOT NULL AND otp IS NOT NULL THEN 'password_reset'
  WHEN token IS NOT NULL AND otp IS NULL THEN 'password_reset'
  ELSE 'password_reset'
END
WHERE purpose IS NULL;

-- Create index on purpose for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_purpose 
ON auth.password_reset_tokens(purpose) 
WHERE purpose IS NOT NULL;

-- Add attempts column for OTP verification attempts tracking
ALTER TABLE IF EXISTS auth.password_reset_tokens
ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0;
