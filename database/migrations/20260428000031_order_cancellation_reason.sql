ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
