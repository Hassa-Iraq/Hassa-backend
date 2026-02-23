/**
 * OTP codes for registration (auth.otp_codes table – email and phone, same idea as your other app).
 */
import { Pool } from "pg";

export interface OtpCodeRecord {
  id: string;
  email: string | null;
  phone: string | null;
  code: string;
  expires_at: Date;
  is_used: boolean;
  attempts: number;
  created_at: Date;
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Store OTP for email (invalidates previous unused for this email) */
export async function storeOtpForEmail(
  pool: Pool,
  email: string,
  expiresInMinutes: number = 10
): Promise<string> {
  const code = generateOtpCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);
  await pool.query(
    `UPDATE auth.otp_codes SET is_used = true WHERE email = $1 AND is_used = false`,
    [email]
  );
  await pool.query(
    `INSERT INTO auth.otp_codes (email, phone, code, expires_at, is_used, attempts) VALUES ($1, NULL, $2, $3, false, 0)`,
    [email, code, expiresAt]
  );
  return code;
}

/** Store OTP for phone (invalidates previous unused for this phone) */
export async function storeOtpForPhone(
  pool: Pool,
  phone: string,
  expiresInMinutes: number = 10
): Promise<string> {
  const code = generateOtpCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);
  await pool.query(
    `UPDATE auth.otp_codes SET is_used = true WHERE phone = $1 AND is_used = false`,
    [phone]
  );
  await pool.query(
    `INSERT INTO auth.otp_codes (email, phone, code, expires_at, is_used, attempts) VALUES (NULL, $1, $2, $3, false, 0)`,
    [phone, code, expiresAt]
  );
  return code;
}

/** Validate OTP for email; returns record if valid so caller can mark used */
export async function validateOtpForEmail(
  pool: Pool,
  email: string,
  code: string
): Promise<{ valid: boolean; record?: OtpCodeRecord; error?: string }> {
  const result = await pool.query<OtpCodeRecord>(
    `SELECT id, email, phone, code, expires_at, is_used, attempts, created_at
     FROM auth.otp_codes
     WHERE email = $1 AND is_used = false
     ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  if (result.rows.length === 0) {
    return { valid: false, error: "No valid OTP found. Please request a new one." };
  }
  const record = result.rows[0];
  if (new Date() > new Date(record.expires_at)) {
    return { valid: false, error: "OTP has expired." };
  }
  if (record.attempts >= 5) {
    await pool.query(`UPDATE auth.otp_codes SET is_used = true WHERE id = $1`, [record.id]);
    return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
  }
  if (record.code !== code) {
    await pool.query(`UPDATE auth.otp_codes SET attempts = attempts + 1 WHERE id = $1`, [record.id]);
    const updated = await pool.query<{ attempts: number }>(`SELECT attempts FROM auth.otp_codes WHERE id = $1`, [record.id]);
    if (updated.rows[0]?.attempts >= 5) {
      await pool.query(`UPDATE auth.otp_codes SET is_used = true WHERE id = $1`, [record.id]);
      return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
    }
    return { valid: false, error: "Invalid OTP." };
  }
  return { valid: true, record };
}

/** Validate OTP for phone; returns record if valid so caller can mark used */
export async function validateOtpForPhone(
  pool: Pool,
  phone: string,
  code: string
): Promise<{ valid: boolean; record?: OtpCodeRecord; error?: string }> {
  const result = await pool.query<OtpCodeRecord>(
    `SELECT id, email, phone, code, expires_at, is_used, attempts, created_at
     FROM auth.otp_codes
     WHERE phone = $1 AND is_used = false
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  if (result.rows.length === 0) {
    return { valid: false, error: "No valid OTP found. Please request a new one." };
  }
  const record = result.rows[0];
  if (new Date() > new Date(record.expires_at)) {
    return { valid: false, error: "OTP has expired." };
  }
  if (record.attempts >= 5) {
    await pool.query(`UPDATE auth.otp_codes SET is_used = true WHERE id = $1`, [record.id]);
    return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
  }
  if (record.code !== code) {
    await pool.query(`UPDATE auth.otp_codes SET attempts = attempts + 1 WHERE id = $1`, [record.id]);
    const updated = await pool.query<{ attempts: number }>(`SELECT attempts FROM auth.otp_codes WHERE id = $1`, [record.id]);
    if (updated.rows[0]?.attempts >= 5) {
      await pool.query(`UPDATE auth.otp_codes SET is_used = true WHERE id = $1`, [record.id]);
      return { valid: false, error: "Too many failed attempts. Please request a new OTP." };
    }
    return { valid: false, error: "Invalid OTP." };
  }
  return { valid: true, record };
}

export async function markOtpCodeUsed(pool: Pool, id: string): Promise<void> {
  await pool.query(`UPDATE auth.otp_codes SET is_used = true WHERE id = $1`, [id]);
}

/** Check if email was recently verified (used OTP within last N minutes) – for register step */
export async function wasEmailRecentlyVerified(
  pool: Pool,
  email: string,
  withinMinutes: number = 15
): Promise<boolean> {
  const since = new Date();
  since.setMinutes(since.getMinutes() - withinMinutes);
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM auth.otp_codes WHERE email = $1 AND is_used = true AND created_at >= $2 ORDER BY created_at DESC LIMIT 1`,
    [email, since]
  );
  return result.rows.length > 0;
}

/** Check if phone was recently verified (used OTP within last N minutes) – for register step */
export async function wasPhoneRecentlyVerified(
  pool: Pool,
  phone: string,
  withinMinutes: number = 15
): Promise<boolean> {
  const since = new Date();
  since.setMinutes(since.getMinutes() - withinMinutes);
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM auth.otp_codes WHERE phone = $1 AND is_used = true AND created_at >= $2 ORDER BY created_at DESC LIMIT 1`,
    [phone, since]
  );
  return result.rows.length > 0;
}
