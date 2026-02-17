-- Create banners schema
CREATE SCHEMA IF NOT EXISTS banners;

-- Create banners table
CREATE TABLE IF NOT EXISTS banners.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
    banner_name VARCHAR(255) NOT NULL,
    banner_image_url VARCHAR(500) NOT NULL,
    description TEXT,
    quote_amount DECIMAL(10, 2),
    quote_currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    requested_by_user_id UUID NOT NULL, -- Reference to auth.users.id (no FK due to schema isolation)
    approved_by_user_id UUID, -- Reference to auth.users.id (nullable, set when super admin approves)
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_banner_status CHECK (status IN ('requested', 'quoted', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT chk_quote_amount CHECK (quote_amount IS NULL OR quote_amount >= 0),
    CONSTRAINT chk_valid_dates CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from < valid_to)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_banners_restaurant_id ON banners.banners(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_banners_status ON banners.banners(status);
CREATE INDEX IF NOT EXISTS idx_banners_requested_by ON banners.banners(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_banners_approved_by ON banners.banners(approved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_banners_valid_dates ON banners.banners(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_banners_created_at ON banners.banners(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION banners.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_banners_updated_at BEFORE UPDATE ON banners.banners
    FOR EACH ROW EXECUTE FUNCTION banners.update_updated_at_column();
