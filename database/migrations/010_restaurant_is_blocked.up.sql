-- Add is_blocked field to restaurants table for admin blocking functionality
ALTER TABLE restaurant.restaurants
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- Create index for efficient filtering of blocked restaurants
CREATE INDEX IF NOT EXISTS idx_restaurants_is_blocked ON restaurant.restaurants(is_blocked);

-- Create composite index for active, not blocked, and open restaurants
CREATE INDEX IF NOT EXISTS idx_restaurants_active_not_blocked_open ON restaurant.restaurants(is_active, is_blocked, is_open);
