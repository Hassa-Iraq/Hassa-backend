-- Remove is_blocked field and related indexes
DROP INDEX IF EXISTS idx_restaurants_active_not_blocked_open;
DROP INDEX IF EXISTS idx_restaurants_is_blocked;
ALTER TABLE restaurant.restaurants DROP COLUMN IF EXISTS is_blocked;
