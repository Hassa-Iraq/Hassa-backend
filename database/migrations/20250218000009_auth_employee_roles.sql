INSERT INTO auth.roles (name)
VALUES ('employee')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth.employee_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.employee_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.employee_user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_role_id UUID NOT NULL REFERENCES auth.employee_roles(id) ON DELETE RESTRICT,
  assigned_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_roles_active ON auth.employee_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_employee_user_roles_role_id ON auth.employee_user_roles(employee_role_id);
CREATE INDEX IF NOT EXISTS idx_employee_profiles_active ON auth.employee_profiles(is_active);

DROP TRIGGER IF EXISTS employee_roles_updated_at ON auth.employee_roles;
CREATE TRIGGER employee_roles_updated_at
  BEFORE UPDATE ON auth.employee_roles
  FOR EACH ROW EXECUTE PROCEDURE auth.set_updated_at();

DROP TRIGGER IF EXISTS employee_profiles_updated_at ON auth.employee_profiles;
CREATE TRIGGER employee_profiles_updated_at
  BEFORE UPDATE ON auth.employee_profiles
  FOR EACH ROW EXECUTE PROCEDURE auth.set_updated_at();

DROP TRIGGER IF EXISTS employee_user_roles_updated_at ON auth.employee_user_roles;
CREATE TRIGGER employee_user_roles_updated_at
  BEFORE UPDATE ON auth.employee_user_roles
  FOR EACH ROW EXECUTE PROCEDURE auth.set_updated_at();
