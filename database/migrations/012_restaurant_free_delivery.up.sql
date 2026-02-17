-- Add free delivery settings to restaurants table
ALTER TABLE restaurant.restaurants
ADD COLUMN IF NOT EXISTS free_delivery_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS free_delivery_max_amount DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS free_delivery_min_distance_km DECIMAL(5, 2) DEFAULT NULL;

-- Add check constraint to ensure free_delivery_max_amount is positive if provided
ALTER TABLE restaurant.restaurants
ADD CONSTRAINT chk_free_delivery_max_amount CHECK (free_delivery_max_amount IS NULL OR free_delivery_max_amount > 0);

-- Add check constraint to ensure free_delivery_min_distance_km is positive if provided
ALTER TABLE restaurant.restaurants
ADD CONSTRAINT chk_free_delivery_min_distance CHECK (free_delivery_min_distance_km IS NULL OR free_delivery_min_distance_km > 0);

-- Create index for free delivery enabled restaurants
CREATE INDEX IF NOT EXISTS idx_restaurants_free_delivery_enabled ON restaurant.restaurants(free_delivery_enabled);
