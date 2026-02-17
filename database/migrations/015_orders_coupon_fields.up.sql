-- Add coupon fields to orders table
ALTER TABLE orders.orders
ADD COLUMN IF NOT EXISTS coupon_id UUID, -- Reference to coupons.coupons.id (no FK)
ADD COLUMN IF NOT EXISTS coupon_discount_amount DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS subtotal_before_coupon DECIMAL(10, 2) DEFAULT NULL;

-- Add constraint
ALTER TABLE orders.orders
ADD CONSTRAINT chk_coupon_discount_amount CHECK (coupon_discount_amount >= 0);

-- Create index
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id ON orders.orders(coupon_id);
