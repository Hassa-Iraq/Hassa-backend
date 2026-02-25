-- Restaurant service schema: restaurants (and branches via parent_id), menu_categories, menu_items, banners
-- One logical database; restaurant schema owned by restaurant-service.
-- If upgrading from a schema that used "email" on restaurants, add: ALTER TABLE restaurant.restaurants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255); UPDATE restaurant.restaurants SET contact_email = email WHERE contact_email IS NULL AND email IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS restaurant;

CREATE TABLE IF NOT EXISTS restaurant.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  zone VARCHAR(255),
  cuisine VARCHAR(255),
  logo_url TEXT,
  cover_image_url TEXT,
  delivery_time_min INT,
  delivery_time_max INT,
  tags TEXT[],
  tin VARCHAR(64),
  tin_expiry_date DATE,
  certificate_url TEXT,
  additional_data JSONB,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_open BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  contact_email VARCHAR(255),
  phone VARCHAR(32),
  tax_type VARCHAR(20) NOT NULL DEFAULT 'exclusive',
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  free_delivery_enabled BOOLEAN NOT NULL DEFAULT false,
  free_delivery_max_amount DECIMAL(10,2),
  free_delivery_min_distance_km DECIMAL(6,2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurant.restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_parent_id ON restaurant.restaurants(parent_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_active ON restaurant.restaurants(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_is_blocked ON restaurant.restaurants(is_blocked) WHERE is_blocked = false;

CREATE TABLE IF NOT EXISTS restaurant.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant_id ON restaurant.menu_categories(restaurant_id);

CREATE TABLE IF NOT EXISTS restaurant.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES restaurant.menu_categories(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON restaurant.menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON restaurant.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON restaurant.menu_items(is_available) WHERE is_available = true;

CREATE OR REPLACE FUNCTION restaurant.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS restaurants_updated_at ON restaurant.restaurants;
CREATE TRIGGER restaurants_updated_at
  BEFORE UPDATE ON restaurant.restaurants
  FOR EACH ROW EXECUTE PROCEDURE restaurant.set_updated_at();

DROP TRIGGER IF EXISTS menu_categories_updated_at ON restaurant.menu_categories;
CREATE TRIGGER menu_categories_updated_at
  BEFORE UPDATE ON restaurant.menu_categories
  FOR EACH ROW EXECUTE PROCEDURE restaurant.set_updated_at();

DROP TRIGGER IF EXISTS menu_items_updated_at ON restaurant.menu_items;
CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON restaurant.menu_items
  FOR EACH ROW EXECUTE PROCEDURE restaurant.set_updated_at();

-- Banners schema (used by restaurant-service for promo banners)
CREATE SCHEMA IF NOT EXISTS banners;

CREATE TABLE IF NOT EXISTS banners.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  banner_name VARCHAR(255) NOT NULL,
  banner_image_url TEXT NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  requested_by_user_id UUID,
  quote_amount DECIMAL(10,2),
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID,
  is_public BOOLEAN NOT NULL DEFAULT false,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banners_restaurant_id ON banners.banners(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_banners_status ON banners.banners(status);