-- Drop triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON auth.users;
DROP TRIGGER IF EXISTS update_roles_updated_at ON auth.roles;

-- Drop function
DROP FUNCTION IF EXISTS auth.update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS auth.users;
DROP TABLE IF EXISTS auth.roles;

-- Drop schema
DROP SCHEMA IF EXISTS auth CASCADE;
