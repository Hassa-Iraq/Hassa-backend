-- Add order_type and payment_type to orders

ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) NOT NULL DEFAULT 'cash';

-- Constraints
ALTER TABLE orders.orders
  ADD CONSTRAINT chk_order_type CHECK (order_type IN ('delivery', 'pickup')),
  ADD CONSTRAINT chk_payment_type CHECK (payment_type IN ('cash', 'card', 'wallet'));
