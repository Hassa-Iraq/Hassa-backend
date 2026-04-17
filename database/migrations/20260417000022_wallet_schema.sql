CREATE SCHEMA IF NOT EXISTS wallet;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'transaction_type' AND n.nspname = 'wallet') THEN
    CREATE TYPE wallet.transaction_type AS ENUM (
      'topup', 'order_payment', 'order_refund',
      'order_earning', 'delivery_earning',
      'payout_request', 'payout_reversal',
      'adjustment', 'bonus'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'transaction_direction' AND n.nspname = 'wallet') THEN
    CREATE TYPE wallet.transaction_direction AS ENUM ('credit', 'debit');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'transaction_status' AND n.nspname = 'wallet') THEN
    CREATE TYPE wallet.transaction_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'payout_status' AND n.nspname = 'wallet') THEN
    CREATE TYPE wallet.payout_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

-- One wallet per user
CREATE TABLE IF NOT EXISTS wallet.wallets (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL UNIQUE,
  balance     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  currency    VARCHAR(8)    NOT NULL DEFAULT 'IQD',
  is_frozen   BOOLEAN       NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallet.wallets (user_id);

-- Immutable ledger — every balance change recorded here
CREATE TABLE IF NOT EXISTS wallet.transactions (
  id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID                       NOT NULL REFERENCES wallet.wallets(id),
  type            wallet.transaction_type    NOT NULL,
  direction       wallet.transaction_direction NOT NULL,
  amount          NUMERIC(12,2)              NOT NULL CHECK (amount > 0),
  balance_before  NUMERIC(12,2)              NOT NULL,
  balance_after   NUMERIC(12,2)              NOT NULL,
  reference_type  VARCHAR(50),
  reference_id    UUID,
  note            TEXT,
  status          wallet.transaction_status  NOT NULL DEFAULT 'completed',
  created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

-- Idempotency: same event cannot be processed twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency
  ON wallet.transactions (reference_type, reference_id, type)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id
  ON wallet.transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at
  ON wallet.transactions (created_at DESC);

-- Payout requests (restaurant owners / riders withdrawing earnings)
CREATE TABLE IF NOT EXISTS wallet.payouts (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID                 NOT NULL REFERENCES wallet.wallets(id),
  user_id         UUID                 NOT NULL,
  amount          NUMERIC(12,2)        NOT NULL CHECK (amount > 0),
  bank_details    JSONB,
  status          wallet.payout_status NOT NULL DEFAULT 'pending',
  note            TEXT,
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  transaction_id  UUID                 REFERENCES wallet.transactions(id),
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_payouts_user_id   ON wallet.payouts (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_payouts_status    ON wallet.payouts (status);
CREATE INDEX IF NOT EXISTS idx_wallet_payouts_wallet_id ON wallet.payouts (wallet_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION wallet.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallets_updated_at ON wallet.wallets;
CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON wallet.wallets
  FOR EACH ROW EXECUTE PROCEDURE wallet.set_updated_at();

DROP TRIGGER IF EXISTS payouts_updated_at ON wallet.payouts;
CREATE TRIGGER payouts_updated_at
  BEFORE UPDATE ON wallet.payouts
  FOR EACH ROW EXECUTE PROCEDURE wallet.set_updated_at();
