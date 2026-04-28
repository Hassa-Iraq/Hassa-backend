CREATE TABLE IF NOT EXISTS wallet.driver_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id      UUID NOT NULL,
  amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method              VARCHAR(100) NOT NULL,
  reference           TEXT,
  note                TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_by_admin_id UUID NOT NULL,
  paid_by_admin_id    UUID,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_payments_driver ON wallet.driver_payments (driver_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_payments_status ON wallet.driver_payments (status);
CREATE INDEX IF NOT EXISTS idx_driver_payments_created ON wallet.driver_payments (created_at DESC);
