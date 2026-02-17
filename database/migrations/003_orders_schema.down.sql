-- Drop triggers
DROP TRIGGER IF EXISTS update_order_items_updated_at ON orders.order_items;
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders.orders;

-- Drop function
DROP FUNCTION IF EXISTS orders.update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS orders.order_items;
DROP TABLE IF EXISTS orders.orders;

-- Drop schema
DROP SCHEMA IF EXISTS orders CASCADE;
