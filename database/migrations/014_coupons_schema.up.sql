-- Create coupons schema
CREATE SCHEMA IF NOT EXISTS coupons;

-- Create coupons table
CREATE TABLE IF NOT EXISTS coupons.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    coupon_type VARCHAR(20) NOT NULL DEFAULT 'default',
    discount_type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    minimum_purchase DECIMAL(10, 2) DEFAULT NULL,
    maximum_discount DECIMAL(10, 2) DEFAULT NULL,
    limit_same_user BOOLEAN DEFAULT false,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_coupon_type CHECK (coupon_type IN ('default', 'first_order')),
    CONSTRAINT chk_discount_type CHECK (discount_type IN ('percent', 'fixed', 'value')),
    CONSTRAINT chk_discount_value CHECK (discount_value > 0),
    CONSTRAINT chk_minimum_purchase CHECK (minimum_purchase IS NULL OR minimum_purchase >= 0),
    CONSTRAINT chk_maximum_discount CHECK (maximum_discount IS NULL OR maximum_discount >= 0),
    CONSTRAINT chk_date_range CHECK (start_date < end_date)
);

-- Create coupon_usage table to track coupon usage by users
CREATE TABLE IF NOT EXISTS coupons.coupon_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons.coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Reference to auth.users.id (no FK due to schema isolation)
    order_id UUID, -- Reference to orders.orders.id (no FK)
    used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(coupon_id, user_id) -- Ensures one user can only use a coupon once if limit_same_user is true
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons.coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_dates ON coupons.coupons(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_coupons_coupon_type ON coupons.coupons(coupon_type);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_id ON coupons.coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id ON coupons.coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id ON coupons.coupon_usage(order_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION coupons.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons.coupons
    FOR EACH ROW EXECUTE FUNCTION coupons.update_updated_at_column();
