-- Add user_id field to restaurants table for ownership tracking
ALTER TABLE restaurant.restaurants 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for efficient ownership queries
CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurant.restaurants(user_id);

-- Create composite index for active/open restaurants by owner
CREATE INDEX IF NOT EXISTS idx_restaurants_user_active_open ON restaurant.restaurants(user_id, is_active, is_open);
