-- Add is_public flag to banners table
ALTER TABLE banners.banners
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS public_at TIMESTAMP WITH TIME ZONE;

-- Index to quickly find public banners
CREATE INDEX IF NOT EXISTS idx_banners_is_public ON banners.banners(is_public);
