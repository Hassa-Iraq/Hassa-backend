-- Remove OTP column from password_reset_tokens table
ALTER TABLE IF EXISTS auth.password_reset_tokens 
DROP COLUMN IF EXISTS otp;

DROP INDEX IF EXISTS auth.idx_password_reset_tokens_otp;
