-- Restaurant ratings system

-- Add proper rating columns to restaurants table
ALTER TABLE restaurant.restaurants
  ADD COLUMN IF NOT EXISTS rating_avg  NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

-- Ratings table
CREATE TABLE IF NOT EXISTS restaurant.restaurant_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  order_id        UUID NOT NULL,
  rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review          TEXT NULL,
  is_visible      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One rating per order
  CONSTRAINT uq_rating_order_id UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_restaurant_id ON restaurant.restaurant_ratings (restaurant_id, is_visible);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id       ON restaurant.restaurant_ratings (user_id);
