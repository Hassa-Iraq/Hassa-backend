ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS delivery_address_id UUID NULL REFERENCES auth.user_addresses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_address_id ON orders.orders (delivery_address_id);

ALTER TABLE orders.orders
  DROP COLUMN IF EXISTS delivery_address;