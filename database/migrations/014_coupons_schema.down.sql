-- Drop triggers
DROP TRIGGER IF EXISTS update_coupons_updated_at ON coupons.coupons;

-- Drop function
DROP FUNCTION IF EXISTS coupons.update_updated_at_column();

-- Drop indexes
DROP INDEX IF EXISTS coupons.idx_coupon_usage_order_id;
DROP INDEX IF EXISTS coupons.idx_coupon_usage_user_id;
DROP INDEX IF EXISTS coupons.idx_coupon_usage_coupon_id;
DROP INDEX IF EXISTS coupons.idx_coupons_coupon_type;
DROP INDEX IF EXISTS coupons.idx_coupons_dates;
DROP INDEX IF EXISTS coupons.idx_coupons_is_active;
DROP INDEX IF EXISTS coupons.idx_coupons_code;

-- Drop tables
DROP TABLE IF EXISTS coupons.coupon_usage;
DROP TABLE IF EXISTS coupons.coupons;

-- Drop schema
DROP SCHEMA IF EXISTS coupons;
