-- Pending signups: track email/phone verification before creating user
CREATE TABLE IF NOT EXISTS auth.pending_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_signups_email ON auth.pending_signups(email);
CREATE INDEX IF NOT EXISTS idx_pending_signups_expires ON auth.pending_signups(expires_at);
