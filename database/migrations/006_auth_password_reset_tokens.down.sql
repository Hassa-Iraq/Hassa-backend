-- Drop indexes (indexes are in the same schema as the table)
DROP INDEX IF EXISTS auth.idx_password_reset_tokens_expires_at;
DROP INDEX IF EXISTS auth.idx_password_reset_tokens_user_id;
DROP INDEX IF EXISTS auth.idx_password_reset_tokens_token;

-- Drop password_reset_tokens table
DROP TABLE IF EXISTS auth.password_reset_tokens;
