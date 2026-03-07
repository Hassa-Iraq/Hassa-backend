import pool from "../db/connection";

export const USER_SELECT =
  "u.id, u.email, u.phone, u.full_name, u.date_of_birth, u.bio, u.profile_picture_url, u.udid, u.device_info, u.push_token, r.name as role, u.created_at, u.updated_at";

export interface UserRow {
  id: string;
  email: string;
  phone?: string | null;
  full_name?: string | null;
  date_of_birth?: string | Date | null;
  bio?: string | null;
  profile_picture_url?: string | null;
  udid?: string | null;
  device_info?: Record<string, unknown> | null;
  push_token?: string | null;
  role?: string;
  role_name?: string;
  created_at?: Date;
  updated_at?: Date | null;
  password_hash?: string;
  role_id?: string;
  phone_verified?: boolean;
  email_verified?: boolean;
}

export interface UserResponse {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  bio: string | null;
  profile_picture_url: string | null;
  udid: string | null;
  device_info: Record<string, unknown> | null;
  push_token: string | null;
  role: string;
  created_at: Date;
  updated_at: Date | null;
  phone_verified?: boolean;
  email_verified?: boolean;
}

export function toUserResponse(
  user: UserRow,
  opts?: { phone_verified?: boolean; email_verified?: boolean }
): UserResponse {
  const dateOfBirth = user.date_of_birth
    ? (user.date_of_birth instanceof Date
        ? user.date_of_birth.toISOString().slice(0, 10)
        : String(user.date_of_birth).slice(0, 10))
    : null;
  const roleName =
    (user as UserRow & { role?: string }).role ?? user.role_name ?? "customer";
  const deviceInfo =
    user.device_info != null && typeof user.device_info === "object"
      ? (user.device_info as Record<string, unknown>)
      : null;
  return {
    id: user.id,
    email: user.email,
    phone: user.phone ?? null,
    full_name: user.full_name ?? null,
    date_of_birth: dateOfBirth,
    bio: user.bio ?? null,
    profile_picture_url: user.profile_picture_url ?? null,
    udid: user.udid ?? null,
    device_info: deviceInfo,
    push_token: user.push_token ?? null,
    role: roleName,
    created_at: user.created_at!,
    updated_at: user.updated_at ?? null,
    ...(opts?.phone_verified !== undefined && {
      phone_verified: opts.phone_verified,
    }),
    ...(opts?.email_verified !== undefined && {
      email_verified: opts.email_verified,
    }),
  };
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.phone, u.password_hash, u.role_id, u.phone_verified, u.email_verified,
            u.full_name, u.date_of_birth, u.bio, u.profile_picture_url, u.created_at, u.updated_at,
            r.name as role_name
     FROM auth.users u
     JOIN auth.roles r ON u.role_id = r.id
     WHERE u.email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function findByPhone(phone: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.phone, u.password_hash, u.role_id, u.phone_verified, u.email_verified,
            u.full_name, u.date_of_birth, u.bio, u.profile_picture_url, u.created_at, u.updated_at,
            r.name as role_name
     FROM auth.users u
     JOIN auth.roles r ON u.role_id = r.id
     WHERE u.phone = $1`,
    [phone]
  );
  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByIdWithPassword(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT u.id, u.email, u.password_hash FROM auth.users u WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByIdForProfile(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_SELECT} FROM auth.users u JOIN auth.roles r ON u.role_id = r.id WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function existsByEmail(email: string): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM auth.users WHERE email = $1",
    [email]
  );
  return result.rows.length > 0;
}

export async function existsByEmailExcludingId(
  email: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM auth.users WHERE email = $1 AND id <> $2",
    [email, userId]
  );
  return result.rows.length > 0;
}

export async function existsByPhone(phone: string): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM auth.users WHERE phone = $1",
    [phone]
  );
  return result.rows.length > 0;
}

export async function existsByPhoneExcludingId(
  phone: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM auth.users WHERE phone = $1 AND id <> $2",
    [phone, userId]
  );
  return result.rows.length > 0;
}

export async function create(params: {
  email: string;
  phone?: string | null;
  full_name?: string | null;
  password_hash: string;
  role_id: string;
  email_verified?: boolean;
  phone_verified?: boolean;
}): Promise<UserRow> {
  const emailVerified = params.email_verified ?? false;
  const phoneVerified = params.phone_verified ?? false;
  const result = await pool.query<UserRow>(
    `INSERT INTO auth.users (email, phone, full_name, password_hash, role_id, email_verified, phone_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, phone, password_hash, role_id, email_verified, phone_verified,
       full_name, date_of_birth, bio, profile_picture_url, created_at, updated_at`,
    [
      params.email,
      params.phone ?? null,
      params.full_name ?? null,
      params.password_hash,
      params.role_id,
      emailVerified,
      phoneVerified,
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("User create returned no row");
  }
  return row;
}

export async function createAdmin(params: {
  email: string;
  password_hash: string;
  role_id: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auth.users (email, password_hash, role_id, phone_verified)
     VALUES ($1, $2, $3, TRUE)`,
    [params.email, params.password_hash, params.role_id]
  );
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string
): Promise<void> {
  await pool.query(
    `UPDATE auth.users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [passwordHash, userId]
  );
}

export async function updateProfile(
  userId: string,
  updates: {
    full_name?: string | null;
    date_of_birth?: string | null;
    bio?: string | null;
    profile_picture_url?: string | null;
    udid?: string | null;
    device_info?: Record<string, unknown> | null;
    push_token?: string | null;
  }
): Promise<void> {
  const set: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (updates.full_name !== undefined) {
    set.push(`full_name = $${i++}`);
    values.push(updates.full_name);
  }
  if (updates.date_of_birth !== undefined) {
    set.push(`date_of_birth = $${i++}`);
    values.push(updates.date_of_birth);
  }
  if (updates.bio !== undefined) {
    set.push(`bio = $${i++}`);
    values.push(updates.bio);
  }
  if (updates.profile_picture_url !== undefined) {
    set.push(`profile_picture_url = $${i++}`);
    values.push(updates.profile_picture_url);
  }
  if (updates.udid !== undefined) {
    set.push(`udid = $${i++}`);
    values.push(updates.udid);
  }
  if (updates.device_info !== undefined) {
    set.push(`device_info = $${i++}`);
    values.push(updates.device_info);
  }
  if (updates.push_token !== undefined) {
    set.push(`push_token = $${i++}`);
    values.push(updates.push_token);
  }
  if (set.length === 0) return;
  values.push(userId);
  await pool.query(
    `UPDATE auth.users SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i}`,
    values
  );
}

export async function updateAdminManagedFields(
  userId: string,
  updates: {
    email?: string;
    phone?: string | null;
    full_name?: string | null;
    profile_picture_url?: string | null;
  }
): Promise<void> {
  const set: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.email !== undefined) {
    set.push(`email = $${i++}`);
    values.push(updates.email);
  }
  if (updates.phone !== undefined) {
    set.push(`phone = $${i++}`);
    values.push(updates.phone);
  }
  if (updates.full_name !== undefined) {
    set.push(`full_name = $${i++}`);
    values.push(updates.full_name);
  }
  if (updates.profile_picture_url !== undefined) {
    set.push(`profile_picture_url = $${i++}`);
    values.push(updates.profile_picture_url);
  }
  if (set.length === 0) return;

  values.push(userId);
  await pool.query(
    `UPDATE auth.users SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i}`,
    values
  );
}

export async function setPhoneVerified(userId: string, verified: boolean): Promise<void> {
  await pool.query(
    `UPDATE auth.users SET phone_verified = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [verified, userId]
  );
}

export async function setEmailVerified(userId: string, verified: boolean): Promise<void> {
  await pool.query(
    `UPDATE auth.users SET email_verified = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [verified, userId]
  );
}

export async function deleteById(userId: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
}

export default {
  USER_SELECT,
  toUserResponse,
  findByEmail,
  findByPhone,
  findById,
  findByIdWithPassword,
  findByIdForProfile,
  existsByEmail,
  existsByEmailExcludingId,
  existsByPhone,
  existsByPhoneExcludingId,
  create,
  createAdmin,
  updatePasswordHash,
  updateProfile,
  updateAdminManagedFields,
  setPhoneVerified,
  setEmailVerified,
  deleteById,
};
