-- Add OTP column to password_reset_tokens table for OTP-based password reset
ALTER TABLE IF EXISTS auth.password_reset_tokens 
ADD COLUMN IF NOT EXISTS otp VARCHAR(6);

-- Create index on OTP for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_otp ON auth.password_reset_tokens(otp) 
WHERE otp IS NOT NULL;
