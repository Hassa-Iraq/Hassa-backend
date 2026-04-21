import pool from "../db/connection";

export type DriverOwnerType = "platform" | "restaurant";

export interface DriverProfileRow {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  image_url: string | null;
  role: string;
  owner_type: DriverOwnerType;
  owner_restaurant_id: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  vehicle_image_url: string | null;
  driving_license_image_url: string | null;
  additional_data: Record<string, unknown>;
  is_active: boolean;
  approval_status: string;
  rejection_reason: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function createDriverProfile(input: {
  user_id: string;
  owner_type: DriverOwnerType;
  owner_restaurant_id?: string | null;
  vehicle_type?: string | null;
  vehicle_number?: string | null;
  vehicle_image_url?: string | null;
  driving_license_image_url?: string | null;
  additional_data?: Record<string, unknown>;
  is_active?: boolean;
  approval_status?: string;
  rejection_reason?: string | null;
  created_by_user_id?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auth.driver_profiles (
       user_id,
       owner_type,
       owner_restaurant_id,
       vehicle_type,
       vehicle_number,
       vehicle_image_url,
       driving_license_image_url,
       additional_data,
       is_active,
       approval_status,
       created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
    [
      input.user_id,
      input.owner_type,
      input.owner_restaurant_id ?? null,
      input.vehicle_type ?? null,
      input.vehicle_number ?? null,
      input.vehicle_image_url ?? null,
      input.driving_license_image_url ?? null,
      JSON.stringify(input.additional_data ?? {}),
      input.is_active ?? true,
      input.approval_status ?? "pending",
      input.created_by_user_id ?? null,
    ]
  );
}

export async function findDriverById(userId: string): Promise<DriverProfileRow | null> {
  const r = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.phone,
       u.full_name,
       u.profile_picture_url AS image_url,
       ro.name AS role,
       dp.owner_type,
       dp.owner_restaurant_id,
       dp.vehicle_type,
       dp.vehicle_number,
       dp.vehicle_image_url,
       dp.driving_license_image_url,
       dp.additional_data,
       dp.is_active,
       dp.approval_status,
       dp.rejection_reason,
       dp.created_by_user_id,
       dp.created_at,
       dp.updated_at
     FROM auth.users u
     JOIN auth.roles ro ON ro.id = u.role_id
     JOIN auth.driver_profiles dp ON dp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return (r.rows[0] as DriverProfileRow | undefined) ?? null;
}

export async function updateDriverProfile(
  userId: string,
  input: {
    owner_type?: DriverOwnerType;
    owner_restaurant_id?: string | null;
    vehicle_type?: string | null;
    vehicle_number?: string | null;
    vehicle_image_url?: string | null;
    driving_license_image_url?: string | null;
    additional_data?: Record<string, unknown>;
    is_active?: boolean;
    approval_status?: string;
    rejection_reason?: string | null;
  }
): Promise<void> {
  const set: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.owner_type !== undefined) {
    set.push(`owner_type = $${i++}`);
    values.push(input.owner_type);
  }
  if (input.owner_restaurant_id !== undefined) {
    set.push(`owner_restaurant_id = $${i++}`);
    values.push(input.owner_restaurant_id);
  }
  if (input.vehicle_type !== undefined) {
    set.push(`vehicle_type = $${i++}`);
    values.push(input.vehicle_type);
  }
  if (input.vehicle_number !== undefined) {
    set.push(`vehicle_number = $${i++}`);
    values.push(input.vehicle_number);
  }
  if (input.vehicle_image_url !== undefined) {
    set.push(`vehicle_image_url = $${i++}`);
    values.push(input.vehicle_image_url);
  }
  if (input.driving_license_image_url !== undefined) {
    set.push(`driving_license_image_url = $${i++}`);
    values.push(input.driving_license_image_url);
  }
  if (input.additional_data !== undefined) {
    set.push(`additional_data = $${i++}::jsonb`);
    values.push(JSON.stringify(input.additional_data));
  }
  if (input.is_active !== undefined) {
    set.push(`is_active = $${i++}`);
    values.push(input.is_active);
  }
  if (input.approval_status !== undefined) {
    set.push(`approval_status = $${i++}`);
    values.push(input.approval_status);
  }
  if (input.rejection_reason !== undefined) {
    set.push(`rejection_reason = $${i++}`);
    values.push(input.rejection_reason);
  }
  if (set.length === 0) return;

  values.push(userId);
  await pool.query(`UPDATE auth.driver_profiles SET ${set.join(", ")} WHERE user_id = $${i}`, values);
}

function buildWhere(opts?: {
  search?: string;
  owner_type?: DriverOwnerType;
  owner_restaurant_id?: string;
  owner_restaurant_ids?: string[];
  is_active?: boolean;
  approval_status?: string;
}): { where: string; values: unknown[] } {
  const conditions = ["ro.name = 'driver'"];
  const values: unknown[] = [];
  let i = 1;

  if (opts?.search) {
    conditions.push(`(u.email ILIKE $${i} OR u.phone ILIKE $${i} OR u.full_name ILIKE $${i} OR dp.vehicle_number ILIKE $${i})`);
    values.push(`%${opts.search}%`);
    i += 1;
  }
  if (opts?.owner_type) {
    conditions.push(`dp.owner_type = $${i++}`);
    values.push(opts.owner_type);
  }
  if (opts?.owner_restaurant_id) {
    conditions.push(`dp.owner_restaurant_id = $${i++}`);
    values.push(opts.owner_restaurant_id);
  }
  if (opts?.owner_restaurant_ids && opts.owner_restaurant_ids.length > 0) {
    conditions.push(`dp.owner_restaurant_id = ANY($${i++})`);
    values.push(opts.owner_restaurant_ids);
  }
  if (opts?.is_active !== undefined) {
    conditions.push(`dp.is_active = $${i++}`);
    values.push(opts.is_active);
  }
  if (opts?.approval_status !== undefined) {
    conditions.push(`dp.approval_status = $${i++}`);
    values.push(opts.approval_status);
  }
  return { where: `WHERE ${conditions.join(" AND ")}`, values };
}

export async function listDrivers(opts?: {
  search?: string;
  owner_type?: DriverOwnerType;
  owner_restaurant_id?: string;
  owner_restaurant_ids?: string[];
  is_active?: boolean;
  approval_status?: string;
  limit?: number;
  offset?: number;
}): Promise<DriverProfileRow[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const where = buildWhere(opts);
  const values = [...where.values, limit, offset];
  const limitPlaceholder = `$${where.values.length + 1}`;
  const offsetPlaceholder = `$${where.values.length + 2}`;

  const r = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.phone,
       u.full_name,
       u.profile_picture_url AS image_url,
       ro.name AS role,
       dp.owner_type,
       dp.owner_restaurant_id,
       dp.vehicle_type,
       dp.vehicle_number,
       dp.vehicle_image_url,
       dp.driving_license_image_url,
       dp.additional_data,
       dp.is_active,
       dp.approval_status,
       dp.rejection_reason,
       dp.created_by_user_id,
       dp.created_at,
       dp.updated_at
     FROM auth.users u
     JOIN auth.roles ro ON ro.id = u.role_id
     JOIN auth.driver_profiles dp ON dp.user_id = u.id
     ${where.where}
     ORDER BY dp.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return r.rows as DriverProfileRow[];
}

export async function countDrivers(opts?: {
  search?: string;
  owner_type?: DriverOwnerType;
  owner_restaurant_id?: string;
  owner_restaurant_ids?: string[];
  is_active?: boolean;
  approval_status?: string;
}): Promise<number> {
  const where = buildWhere(opts);
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM auth.users u
     JOIN auth.roles ro ON ro.id = u.role_id
     JOIN auth.driver_profiles dp ON dp.user_id = u.id
     ${where.where}`,
    where.values
  );
  return r.rows[0]?.total ?? 0;
}
