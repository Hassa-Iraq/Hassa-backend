-- Remove is_public flag from banners table
ALTER TABLE banners.banners
DROP COLUMN IF EXISTS public_at,
DROP COLUMN IF EXISTS is_public;

DROP INDEX IF EXISTS banners.idx_banners_is_public;
