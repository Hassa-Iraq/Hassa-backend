-- Drop indexes
DROP INDEX IF EXISTS restaurant.idx_restaurants_user_active_open;
DROP INDEX IF EXISTS restaurant.idx_restaurants_user_id;

-- Remove user_id column
ALTER TABLE restaurant.restaurants 
DROP COLUMN IF EXISTS user_id;
