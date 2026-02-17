-- Drop triggers
DROP TRIGGER IF EXISTS update_deliveries_updated_at ON delivery.deliveries;
DROP TRIGGER IF EXISTS update_drivers_updated_at ON delivery.drivers;

-- Drop function
DROP FUNCTION IF EXISTS delivery.update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS delivery.deliveries;
DROP TABLE IF EXISTS delivery.drivers;

-- Drop schema
DROP SCHEMA IF EXISTS delivery CASCADE;
