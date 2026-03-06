import pool from "../db/connection";

export interface EmployeeRoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, unknown>;
  is_active: boolean;
  created_by_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmployeeRow {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  image_url: string | null;
  role: string;
  employee_role_id: string | null;
  employee_role_name: string | null;
  employee_permissions: Record<string, unknown> | null;
  employee_is_active: boolean | null;
  created_at: Date;
  updated_at: Date | null;
}

export async function createRole(params: {
  name: string;
  description?: string | null;
  permissions?: Record<string, unknown>;
  created_by_admin_id?: string | null;
}): Promise<EmployeeRoleRow> {
  const r = await pool.query(
    `INSERT INTO auth.employee_roles (name, description, permissions, created_by_admin_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.name,
      params.description ?? null,
      JSON.stringify(params.permissions ?? {}),
      params.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0] as EmployeeRoleRow;
}

export async function findRoleById(id: string): Promise<EmployeeRoleRow | null> {
  const r = await pool.query("SELECT * FROM auth.employee_roles WHERE id = $1", [id]);
  return (r.rows[0] as EmployeeRoleRow | undefined) ?? null;
}

export async function findRoleByName(name: string): Promise<EmployeeRoleRow | null> {
  const r = await pool.query("SELECT * FROM auth.employee_roles WHERE LOWER(name) = LOWER($1)", [name]);
  return (r.rows[0] as EmployeeRoleRow | undefined) ?? null;
}

export async function listRoles(opts?: { is_active?: boolean; limit?: number; offset?: number }): Promise<EmployeeRoleRow[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const values: unknown[] = [];
  let q = "SELECT * FROM auth.employee_roles";
  if (opts?.is_active !== undefined) {
    q += " WHERE is_active = $1";
    values.push(opts.is_active);
    values.push(limit, offset);
    q += " ORDER BY created_at DESC LIMIT $2 OFFSET $3";
  } else {
    values.push(limit, offset);
    q += " ORDER BY created_at DESC LIMIT $1 OFFSET $2";
  }
  const r = await pool.query(q, values);
  return r.rows as EmployeeRoleRow[];
}

export async function countRoles(opts?: { is_active?: boolean }): Promise<number> {
  const values: unknown[] = [];
  let q = "SELECT COUNT(*)::int AS total FROM auth.employee_roles";
  if (opts?.is_active !== undefined) {
    q += " WHERE is_active = $1";
    values.push(opts.is_active);
  }
  const r = await pool.query(q, values);
  return r.rows[0]?.total ?? 0;
}

export async function updateRole(
  id: string,
  params: {
    name?: string;
    description?: string | null;
    permissions?: Record<string, unknown>;
    is_active?: boolean;
  }
): Promise<EmployeeRoleRow | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (params.name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(params.name);
  }
  if (params.description !== undefined) {
    updates.push(`description = $${i++}`);
    values.push(params.description);
  }
  if (params.permissions !== undefined) {
    updates.push(`permissions = $${i++}`);
    values.push(JSON.stringify(params.permissions));
  }
  if (params.is_active !== undefined) {
    updates.push(`is_active = $${i++}`);
    values.push(params.is_active);
  }
  if (updates.length === 0) return findRoleById(id);
  values.push(id);
  const r = await pool.query(
    `UPDATE auth.employee_roles
     SET ${updates.join(", ")}
     WHERE id = $${i}
     RETURNING *`,
    values
  );
  return (r.rows[0] as EmployeeRoleRow | undefined) ?? null;
}

export async function assignRoleToEmployee(params: {
  user_id: string;
  employee_role_id: string;
  assigned_by_admin_id?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auth.employee_user_roles (user_id, employee_role_id, assigned_by_admin_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id)
     DO UPDATE SET
       employee_role_id = EXCLUDED.employee_role_id,
       assigned_by_admin_id = EXCLUDED.assigned_by_admin_id`,
    [params.user_id, params.employee_role_id, params.assigned_by_admin_id ?? null]
  );
}

export async function createEmployeeProfile(params: {
  user_id: string;
  is_active?: boolean;
  created_by_admin_id?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auth.employee_profiles (user_id, is_active, created_by_admin_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id)
     DO UPDATE SET
       is_active = EXCLUDED.is_active,
       created_by_admin_id = EXCLUDED.created_by_admin_id`,
    [params.user_id, params.is_active ?? true, params.created_by_admin_id ?? null]
  );
}

export async function updateEmployeeProfile(
  user_id: string,
  params: { is_active?: boolean }
): Promise<void> {
  if (params.is_active === undefined) return;
  await pool.query(
    `UPDATE auth.employee_profiles
     SET is_active = $1
     WHERE user_id = $2`,
    [params.is_active, user_id]
  );
}

export async function listEmployees(opts?: {
  search?: string;
  employee_role_id?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<EmployeeRow[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const conditions: string[] = ["r.name = 'employee'"];
  const values: unknown[] = [];
  let i = 1;
  if (opts?.search) {
    conditions.push(`(u.email ILIKE $${i} OR u.phone ILIKE $${i} OR u.full_name ILIKE $${i})`);
    values.push(`%${opts.search}%`);
    i += 1;
  }
  if (opts?.employee_role_id) {
    conditions.push(`eur.employee_role_id = $${i++}`);
    values.push(opts.employee_role_id);
  }
  if (opts?.is_active !== undefined) {
    conditions.push(`ep.is_active = $${i++}`);
    values.push(opts.is_active);
  }
  values.push(limit, offset);
  const limitPlaceholder = `$${i++}`;
  const offsetPlaceholder = `$${i++}`;

  const r = await pool.query(
    `SELECT
       u.id, u.email, u.phone, u.full_name, u.profile_picture_url AS image_url, u.created_at, u.updated_at,
       r.name AS role,
       eur.employee_role_id,
       er.name AS employee_role_name,
       er.permissions AS employee_permissions,
       ep.is_active AS employee_is_active
     FROM auth.users u
     JOIN auth.roles r ON r.id = u.role_id
     LEFT JOIN auth.employee_user_roles eur ON eur.user_id = u.id
     LEFT JOIN auth.employee_roles er ON er.id = eur.employee_role_id
     LEFT JOIN auth.employee_profiles ep ON ep.user_id = u.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return r.rows as EmployeeRow[];
}

export async function countEmployees(opts?: {
  search?: string;
  employee_role_id?: string;
  is_active?: boolean;
}): Promise<number> {
  const conditions: string[] = ["r.name = 'employee'"];
  const values: unknown[] = [];
  let i = 1;
  if (opts?.search) {
    conditions.push(`(u.email ILIKE $${i} OR u.phone ILIKE $${i} OR u.full_name ILIKE $${i})`);
    values.push(`%${opts.search}%`);
    i += 1;
  }
  if (opts?.employee_role_id) {
    conditions.push(`eur.employee_role_id = $${i++}`);
    values.push(opts.employee_role_id);
  }
  if (opts?.is_active !== undefined) {
    conditions.push(`ep.is_active = $${i++}`);
    values.push(opts.is_active);
  }

  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM auth.users u
     JOIN auth.roles r ON r.id = u.role_id
     LEFT JOIN auth.employee_user_roles eur ON eur.user_id = u.id
     LEFT JOIN auth.employee_profiles ep ON ep.user_id = u.id
     WHERE ${conditions.join(" AND ")}`,
    values
  );
  return r.rows[0]?.total ?? 0;
}

export async function findEmployeeById(user_id: string): Promise<EmployeeRow | null> {
  const r = await pool.query(
    `SELECT
       u.id, u.email, u.phone, u.full_name, u.profile_picture_url AS image_url, u.created_at, u.updated_at,
       r.name AS role,
       eur.employee_role_id,
       er.name AS employee_role_name,
       er.permissions AS employee_permissions,
       ep.is_active AS employee_is_active
     FROM auth.users u
     JOIN auth.roles r ON r.id = u.role_id
     LEFT JOIN auth.employee_user_roles eur ON eur.user_id = u.id
     LEFT JOIN auth.employee_roles er ON er.id = eur.employee_role_id
     LEFT JOIN auth.employee_profiles ep ON ep.user_id = u.id
     WHERE u.id = $1 AND r.name = 'employee'`,
    [user_id]
  );
  return (r.rows[0] as EmployeeRow | undefined) ?? null;
}

export async function findEmployeeRoleForUser(user_id: string): Promise<{
  employee_role_id: string | null;
  employee_role_name: string | null;
  employee_permissions: Record<string, unknown> | null;
  employee_is_active: boolean | null;
} | null> {
  const r = await pool.query(
    `SELECT
       eur.employee_role_id,
       er.name AS employee_role_name,
       er.permissions AS employee_permissions,
       ep.is_active AS employee_is_active
     FROM auth.users u
     JOIN auth.roles r ON r.id = u.role_id
     LEFT JOIN auth.employee_user_roles eur ON eur.user_id = u.id
     LEFT JOIN auth.employee_roles er ON er.id = eur.employee_role_id
     LEFT JOIN auth.employee_profiles ep ON ep.user_id = u.id
     WHERE u.id = $1 AND r.name = 'employee'`,
    [user_id]
  );
  return r.rows[0] ?? null;
}

