-- Add is_open field to restaurants table
ALTER TABLE restaurant.restaurants 
ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;

-- Create index for filtering open restaurants
CREATE INDEX IF NOT EXISTS idx_restaurants_is_open ON restaurant.restaurants(is_open);
CREATE INDEX IF NOT EXISTS idx_restaurants_active_open ON restaurant.restaurants(is_active, is_open);
