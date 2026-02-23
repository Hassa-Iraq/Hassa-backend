import pool from "../db/connection";

export interface TokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used: boolean;
  otp?: string | null;
}

export async function create(
  userId: string,
  token: string,
  expiresAt: Date,
  otp?: string | null
): Promise<void> {
  await pool.query(
    `INSERT INTO auth.password_reset_tokens (user_id, token, expires_at, otp)
     VALUES ($1, $2, $3, $4)`,
    [userId, token, expiresAt, otp ?? null]
  );
}

export async function findByToken(token: string): Promise<TokenRow | null> {
  const result = await pool.query<TokenRow>(
    `SELECT id, user_id, token, expires_at, used, otp
     FROM auth.password_reset_tokens WHERE token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function invalidateUnusedByUserId(userId: string): Promise<void> {
  await pool.query(
    `UPDATE auth.password_reset_tokens SET used = TRUE
     WHERE user_id = $1 AND used = FALSE`,
    [userId]
  );
}

export async function markUsed(id: string): Promise<void> {
  await pool.query(
    `UPDATE auth.password_reset_tokens SET used = TRUE WHERE id = $1`,
    [id]
  );
}

export async function findLatestOtpByUser(
  userId: string,
  otp: string
): Promise<{ id: string; user_id: string; expires_at: Date; used: boolean } | null> {
  const result = await pool.query(
    `SELECT id, user_id, expires_at, used
     FROM auth.password_reset_tokens
     WHERE user_id = $1 AND otp = $2 AND otp IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, otp]
  );
  return result.rows[0] ?? null;
}

export default {
  create,
  findByToken,
  invalidateUnusedByUserId,
  markUsed,
  findLatestOtpByUser,
};
