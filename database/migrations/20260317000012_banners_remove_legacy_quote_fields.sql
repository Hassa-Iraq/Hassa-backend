-- Remove legacy quote-related fields from banners.
-- Keep approved_at for current ranking/order logic on home/public banners.

ALTER TABLE IF EXISTS banners.banners
  DROP COLUMN IF EXISTS quote_amount,
  DROP COLUMN IF EXISTS approved_by_user_id;
