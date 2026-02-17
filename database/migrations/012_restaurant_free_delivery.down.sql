-- Remove free delivery settings from restaurants table
DROP INDEX IF EXISTS idx_restaurants_free_delivery_enabled;
ALTER TABLE restaurant.restaurants DROP CONSTRAINT IF EXISTS chk_free_delivery_min_distance;
ALTER TABLE restaurant.restaurants DROP CONSTRAINT IF EXISTS chk_free_delivery_max_amount;
ALTER TABLE restaurant.restaurants DROP COLUMN IF EXISTS free_delivery_min_distance_km;
ALTER TABLE restaurant.restaurants DROP COLUMN IF EXISTS free_delivery_max_amount;
ALTER TABLE restaurant.restaurants DROP COLUMN IF EXISTS free_delivery_enabled;
