CREATE SCHEMA IF NOT EXISTS orders;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'order_status' AND n.nspname = 'orders'
  ) THEN
    CREATE TYPE orders.order_status AS ENUM (
      'pending',
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'rejected'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orders.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  status orders.order_status NOT NULL DEFAULT 'pending',
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'PKR',
  notes TEXT,
  delivery_address JSONB,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_for_pickup_at TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity INT NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  special_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON orders.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON orders.order_items(menu_item_id);

CREATE OR REPLACE FUNCTION orders.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders.orders
  FOR EACH ROW
  EXECUTE PROCEDURE orders.set_updated_at();
