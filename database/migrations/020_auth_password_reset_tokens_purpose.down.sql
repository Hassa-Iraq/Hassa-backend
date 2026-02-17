-- Remove purpose and attempts columns from password_reset_tokens table
DROP INDEX IF EXISTS auth.idx_password_reset_tokens_purpose;

ALTER TABLE IF EXISTS auth.password_reset_tokens
DROP COLUMN IF EXISTS purpose,
DROP COLUMN IF EXISTS attempts;
