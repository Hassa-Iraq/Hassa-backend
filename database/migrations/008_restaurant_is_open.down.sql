-- Drop indexes
DROP INDEX IF EXISTS restaurant.idx_restaurants_active_open;
DROP INDEX IF EXISTS restaurant.idx_restaurants_is_open;

-- Remove is_open column
ALTER TABLE restaurant.restaurants 
DROP COLUMN IF EXISTS is_open;
