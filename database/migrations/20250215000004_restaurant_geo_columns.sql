-- Add geo-serviceability fields for restaurants and branches
ALTER TABLE restaurant.restaurants
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
  ADD COLUMN IF NOT EXISTS service_radius_km DECIMAL(6,2);

CREATE INDEX IF NOT EXISTS idx_restaurants_lat_lng
  ON restaurant.restaurants(latitude, longitude);