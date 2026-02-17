-- Drop index
DROP INDEX IF EXISTS orders.idx_orders_coupon_id;

-- Drop constraint
ALTER TABLE orders.orders
DROP CONSTRAINT IF EXISTS chk_coupon_discount_amount;

-- Drop columns
ALTER TABLE orders.orders
DROP COLUMN IF EXISTS subtotal_before_coupon,
DROP COLUMN IF EXISTS coupon_discount_amount,
DROP COLUMN IF EXISTS coupon_id;
