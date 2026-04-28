CREATE TABLE IF NOT EXISTS wallet.cash_collections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collected_from_type     VARCHAR(20) NOT NULL CHECK (collected_from_type IN ('driver', 'restaurant')),
  collected_from_user_id  UUID NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method                  VARCHAR(100) NOT NULL,
  reference               TEXT,
  note                    TEXT,
  collected_by_admin_id   UUID NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_collections_type_user
  ON wallet.cash_collections (collected_from_type, collected_from_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_collections_created_at
  ON wallet.cash_collections (created_at DESC);
