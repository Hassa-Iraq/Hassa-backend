-- Drop requested_by_user_id from banners (not needed for current flow)
ALTER TABLE banners.banners
  DROP COLUMN IF EXISTS requested_by_user_id;
