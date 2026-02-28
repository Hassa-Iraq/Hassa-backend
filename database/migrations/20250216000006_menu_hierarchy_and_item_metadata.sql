ALTER TABLE restaurant.menu_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES restaurant.menu_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_categories_parent_id
  ON restaurant.menu_categories(parent_id);

ALTER TABLE restaurant.menu_items
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES restaurant.menu_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nutrition JSONB,
  ADD COLUMN IF NOT EXISTS search_tags TEXT[];

CREATE INDEX IF NOT EXISTS idx_menu_items_subcategory_id
  ON restaurant.menu_items(subcategory_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_search_tags_gin
  ON restaurant.menu_items USING GIN (search_tags);
