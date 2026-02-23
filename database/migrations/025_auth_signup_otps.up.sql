-- OTPs for signup flow (no user_id; keyed by email or phone)
CREATE TABLE IF NOT EXISTS auth.signup_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_otps_identifier_purpose ON auth.signup_otps(identifier, purpose);
CREATE INDEX IF NOT EXISTS idx_signup_otps_expires ON auth.signup_otps(expires_at);
