-- Add tax system settings to restaurants table
ALTER TABLE restaurant.restaurants
ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20) DEFAULT 'exclusive',
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0.00;

-- Add check constraint to ensure tax_type is either 'inclusive' or 'exclusive'
ALTER TABLE restaurant.restaurants
ADD CONSTRAINT chk_tax_type CHECK (tax_type IN ('inclusive', 'exclusive'));

-- Add check constraint to ensure tax_rate is between 0 and 100
ALTER TABLE restaurant.restaurants
ADD CONSTRAINT chk_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100);

-- Create index for tax_type filtering
CREATE INDEX IF NOT EXISTS idx_restaurants_tax_type ON restaurant.restaurants(tax_type);
