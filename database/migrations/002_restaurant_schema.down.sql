-- Drop triggers
DROP TRIGGER IF EXISTS update_menu_items_updated_at ON restaurant.menu_items;
DROP TRIGGER IF EXISTS update_menu_categories_updated_at ON restaurant.menu_categories;
DROP TRIGGER IF EXISTS update_restaurants_updated_at ON restaurant.restaurants;

-- Drop function
DROP FUNCTION IF EXISTS restaurant.update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS restaurant.menu_items;
DROP TABLE IF EXISTS restaurant.menu_categories;
DROP TABLE IF EXISTS restaurant.restaurants;

-- Drop schema
DROP SCHEMA IF EXISTS restaurant CASCADE;
