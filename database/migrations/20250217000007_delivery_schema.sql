CREATE SCHEMA IF NOT EXISTS delivery;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'delivery_status' AND n.nspname = 'delivery'
  ) THEN
    CREATE TYPE delivery.delivery_status AS ENUM (
      'pending_assignment',
      'assigned',
      'accepted_by_driver',
      'arrived_at_pickup',
      'picked_up',
      'on_the_way',
      'delivered',
      'cancelled',
      'failed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS delivery.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE,
  customer_user_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  driver_user_id UUID NOT NULL,
  status delivery.delivery_status NOT NULL DEFAULT 'pending_assignment',
  pickup_address TEXT,
  dropoff_address TEXT,
  pickup_latitude NUMERIC(10,8),
  pickup_longitude NUMERIC(11,8),
  dropoff_latitude NUMERIC(10,8),
  dropoff_longitude NUMERIC(11,8),
  delivery_notes TEXT,
  proof_image_url TEXT,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON delivery.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_user_id ON delivery.deliveries(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer_user_id ON delivery.deliveries(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_restaurant_id ON delivery.deliveries(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON delivery.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON delivery.deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS delivery.driver_status (
  driver_user_id UUID PRIMARY KEY,
  is_online BOOLEAN NOT NULL DEFAULT false,
  is_available BOOLEAN NOT NULL DEFAULT false,
  current_latitude NUMERIC(10,8),
  current_longitude NUMERIC(11,8),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_status_online ON delivery.driver_status(is_online);
CREATE INDEX IF NOT EXISTS idx_driver_status_available ON delivery.driver_status(is_available);
CREATE INDEX IF NOT EXISTS idx_driver_status_last_seen ON delivery.driver_status(last_seen_at DESC);

CREATE OR REPLACE FUNCTION delivery.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliveries_updated_at ON delivery.deliveries;
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON delivery.deliveries
  FOR EACH ROW
  EXECUTE PROCEDURE delivery.set_updated_at();

DROP TRIGGER IF EXISTS driver_status_updated_at ON delivery.driver_status;
CREATE TRIGGER driver_status_updated_at
  BEFORE UPDATE ON delivery.driver_status
  FOR EACH ROW
  EXECUTE PROCEDURE delivery.set_updated_at();
