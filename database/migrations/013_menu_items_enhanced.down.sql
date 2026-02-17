-- Remove enhanced menu items features
DROP INDEX IF EXISTS idx_menu_item_choice_groups_choice_group_id;
DROP INDEX IF EXISTS idx_menu_item_choice_groups_menu_item_id;
DROP INDEX IF EXISTS idx_choices_choice_group_id;
DROP INDEX IF EXISTS idx_choice_groups_restaurant_id;
DROP INDEX IF EXISTS idx_variation_groups_variation_id;
DROP INDEX IF EXISTS idx_item_variations_menu_item_id;
DROP INDEX IF EXISTS idx_menu_items_available_time;
DROP INDEX IF EXISTS idx_menu_items_stock_type;
DROP INDEX IF EXISTS idx_menu_items_food_type;

DROP TABLE IF EXISTS restaurant.menu_item_choice_groups;
DROP TABLE IF EXISTS restaurant.choices;
DROP TABLE IF EXISTS restaurant.choice_groups;
DROP TABLE IF EXISTS restaurant.variation_groups;
DROP TABLE IF EXISTS restaurant.item_variations;

ALTER TABLE restaurant.menu_items
DROP CONSTRAINT IF EXISTS chk_stock,
DROP CONSTRAINT IF EXISTS chk_max_purchase_qty,
DROP CONSTRAINT IF EXISTS chk_discount_value,
DROP CONSTRAINT IF EXISTS chk_prep_time,
DROP CONSTRAINT IF EXISTS chk_food_type,
DROP CONSTRAINT IF EXISTS chk_stock_type,
DROP CONSTRAINT IF EXISTS chk_discount_type;

ALTER TABLE restaurant.menu_items
DROP COLUMN IF EXISTS food_type,
DROP COLUMN IF EXISTS available_end_time,
DROP COLUMN IF EXISTS available_start_time,
DROP COLUMN IF EXISTS search_tags,
DROP COLUMN IF EXISTS stock,
DROP COLUMN IF EXISTS stock_type,
DROP COLUMN IF EXISTS max_purchase_quantity,
DROP COLUMN IF EXISTS discount_value,
DROP COLUMN IF EXISTS discount_type,
DROP COLUMN IF EXISTS prep_time_minutes;
