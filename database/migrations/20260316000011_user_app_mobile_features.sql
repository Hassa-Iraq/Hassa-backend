-- User app mobile features: favorites and customer addresses
CREATE TABLE IF NOT EXISTS restaurant.customer_favorite_restaurants (
  user_id UUID NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_restaurants_user_id
  ON restaurant.customer_favorite_restaurants(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_restaurants_restaurant_id
  ON restaurant.customer_favorite_restaurants(restaurant_id);

CREATE TABLE IF NOT EXISTS auth.user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  complete_address TEXT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'Other',
  landmark TEXT,
  location_details TEXT,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id
  ON auth.user_addresses(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id_default
  ON auth.user_addresses(user_id, is_default);

CREATE OR REPLACE FUNCTION auth.set_user_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_addresses_updated_at ON auth.user_addresses;
CREATE TRIGGER user_addresses_updated_at
  BEFORE UPDATE ON auth.user_addresses
  FOR EACH ROW
  EXECUTE PROCEDURE auth.set_user_addresses_updated_at();
