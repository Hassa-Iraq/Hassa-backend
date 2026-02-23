-- Initial schema for auth: registration flow (email OTP -> verify -> register)
-- Run this in a fresh database. Uses auth schema + otp_codes like your other app.

-- Schema
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO auth.roles (name) VALUES
  ('customer'),
  ('restaurant'),
  ('driver'),
  ('admin')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(32),
  password_hash VARCHAR(255) NOT NULL,
  role_id UUID NOT NULL REFERENCES auth.roles(id),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  full_name VARCHAR(255),
  date_of_birth DATE,
  bio TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON auth.users (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON auth.users (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_id ON auth.users (role_id);

CREATE TABLE IF NOT EXISTS auth.otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  phone VARCHAR(32),
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT otp_codes_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON auth.otp_codes (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON auth.otp_codes (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON auth.otp_codes (expires_at);

CREATE OR REPLACE FUNCTION auth.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON auth.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE auth.set_updated_at();

DROP TRIGGER IF EXISTS roles_updated_at ON auth.roles;
CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON auth.roles
  FOR EACH ROW EXECUTE PROCEDURE auth.set_updated_at();