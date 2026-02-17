-- Drop triggers
DROP TRIGGER IF EXISTS update_banners_updated_at ON banners.banners;

-- Drop function
DROP FUNCTION IF EXISTS banners.update_updated_at_column();

-- Drop indexes
DROP INDEX IF EXISTS banners.idx_banners_created_at;
DROP INDEX IF EXISTS banners.idx_banners_valid_dates;
DROP INDEX IF EXISTS banners.idx_banners_approved_by;
DROP INDEX IF EXISTS banners.idx_banners_requested_by;
DROP INDEX IF EXISTS banners.idx_banners_status;
DROP INDEX IF EXISTS banners.idx_banners_restaurant_id;

-- Drop tables
DROP TABLE IF EXISTS banners.banners;

-- Drop schema
DROP SCHEMA IF EXISTS banners;
