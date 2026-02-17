-- Remove tax system settings from restaurants table
DROP INDEX IF EXISTS idx_restaurants_tax_type;
ALTER TABLE restaurant.restaurants DROP CONSTRAINT IF EXISTS chk_tax_rate;
ALTER TABLE restaurant.restaurants DROP CONSTRAINT IF EXISTS chk_tax_type;
ALTER TABLE restaurant.restaurants DROP COLUMN IF EXISTS tax_rate;
ALTER TABLE restaurant.restaurants DROP COLUMN IF EXISTS tax_type;
