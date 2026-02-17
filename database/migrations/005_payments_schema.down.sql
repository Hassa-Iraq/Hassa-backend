-- Drop triggers
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments.payments;
DROP TRIGGER IF EXISTS update_wallets_updated_at ON payments.wallets;

-- Drop function
DROP FUNCTION IF EXISTS payments.update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS payments.payments;
DROP TABLE IF EXISTS payments.wallets;

-- Drop schema
DROP SCHEMA IF EXISTS payments CASCADE;
