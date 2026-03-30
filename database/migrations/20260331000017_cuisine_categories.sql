-- Cuisine categories for the customer app home screen.
-- Admin manages these via the admin panel.
-- When a customer taps a category, the app calls
-- GET /discover/restaurants?cuisine=<name> to filter results.

CREATE TABLE IF NOT EXISTS restaurant.cuisine_categories (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL UNIQUE,
  image_url      TEXT,
  display_order  INT          NOT NULL DEFAULT 0,
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cuisine_categories_is_active     ON restaurant.cuisine_categories (is_active);
CREATE INDEX IF NOT EXISTS idx_cuisine_categories_display_order ON restaurant.cuisine_categories (display_order ASC);