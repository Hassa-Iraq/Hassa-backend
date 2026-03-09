CREATE TABLE IF NOT EXISTS auth.driver_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_type VARCHAR(20) NOT NULL DEFAULT 'platform',
  owner_restaurant_id UUID NULL,
  vehicle_type VARCHAR(120),
  vehicle_number VARCHAR(120),
  vehicle_image_url TEXT,
  driving_license_image_url TEXT,
  additional_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT driver_profiles_owner_type_check CHECK (owner_type IN ('platform', 'restaurant')),
  CONSTRAINT driver_profiles_restaurant_owner_check CHECK (
    (owner_type = 'platform' AND owner_restaurant_id IS NULL) OR
    (owner_type = 'restaurant' AND owner_restaurant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_vehicle_number
  ON auth.driver_profiles(vehicle_number)
  WHERE vehicle_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_profiles_owner_type ON auth.driver_profiles(owner_type);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_owner_restaurant_id ON auth.driver_profiles(owner_restaurant_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_is_active ON auth.driver_profiles(is_active);

DROP TRIGGER IF EXISTS driver_profiles_updated_at ON auth.driver_profiles;
CREATE TRIGGER driver_profiles_updated_at
  BEFORE UPDATE ON auth.driver_profiles
  FOR EACH ROW EXECUTE PROCEDURE auth.set_updated_at();
