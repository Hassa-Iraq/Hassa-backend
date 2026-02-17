/**
 * OTP management utilities
 */
import { Pool } from 'pg';
import crypto from 'crypto';

export type OTPPurpose = 'password_reset' | 'verify_phone' | 'signup_phone' | 'signup_email' | 'login';

interface OTPRecord {
  id: string;
  user_id: string;
  otp: string;
  expires_at: Date;
  used: boolean;
  attempts: number;
  purpose: string;
}

/**
 * Generate a 6-digit OTP
 */
export function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate and store OTP for a user
 */
export async function generateAndStoreOTP(
  pool: Pool,
  userId: string,
  phone: string,
  purpose: OTPPurpose,
  expiresInMinutes: number = 10
): Promise<string> {
  const otp = generateOTPCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);
  
  // Always generate a token to satisfy NOT NULL constraint
  // For signup/verify purposes, token is generated but not used (we use OTP instead)
  // For password reset, token can be used as an alternative to OTP
  const token = crypto.randomBytes(32).toString('hex');
  
  // Invalidate previous unused OTPs for this user and purpose
  await invalidatePreviousOTPs(pool, userId, phone, purpose);
  
  // Store OTP
  await pool.query(
    `INSERT INTO auth.password_reset_tokens (user_id, token, otp, expires_at, purpose, attempts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, token, otp, expiresAt, purpose, 0]
  );
  
  return otp;
}

/**
 * Validate OTP for a user
 */
export async function validateOTP(
  pool: Pool,
  userId: string,
  _phone: string,
  otp: string,
  purpose: OTPPurpose
): Promise<{ valid: boolean; record?: OTPRecord; error?: string }> {
  // Find the latest unused OTP for this user and purpose (don't filter by OTP value yet)
  const result = await pool.query<OTPRecord>(
    `SELECT id, user_id, otp, expires_at, used, attempts, purpose
     FROM auth.password_reset_tokens
     WHERE user_id = $1 AND purpose = $2 AND used = FALSE AND otp IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, purpose]
  );
  
  if (result.rows.length === 0) {
    return { valid: false, error: 'No valid OTP found. Please request a new one.' };
  }
  
  const record = result.rows[0];
  
  // Check if expired
  if (new Date() > new Date(record.expires_at)) {
    return { valid: false, error: 'OTP has expired' };
  }
  
  // Check attempts (max 5 attempts)
  if (record.attempts >= 5) {
    // Mark as used to prevent further attempts
    await pool.query(
      `UPDATE auth.password_reset_tokens SET used = TRUE WHERE id = $1`,
      [record.id]
    );
    return { valid: false, error: 'Too many failed attempts. Please request a new OTP.' };
  }
  
  // Check if OTP matches
  if (record.otp !== otp) {
    // Increment attempts on failure
    await pool.query(
      `UPDATE auth.password_reset_tokens SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );
    
    // Check if max attempts reached after increment
    const updatedRecord = await pool.query<{ attempts: number }>(
      `SELECT attempts FROM auth.password_reset_tokens WHERE id = $1`,
      [record.id]
    );
    
    if (updatedRecord.rows[0]?.attempts >= 5) {
      // Mark as used to prevent further attempts
      await pool.query(
        `UPDATE auth.password_reset_tokens SET used = TRUE WHERE id = $1`,
        [record.id]
      );
      return { valid: false, error: 'Too many failed attempts. Please request a new OTP.' };
    }
    
    return { valid: false, error: 'Invalid OTP' };
  }
  
  // OTP matches - return success
  return { valid: true, record };
}

/**
 * Mark OTP as used
 */
export async function markOTPAsUsed(pool: Pool, otpId: string): Promise<void> {
  await pool.query(
    `UPDATE auth.password_reset_tokens SET used = TRUE WHERE id = $1`,
    [otpId]
  );
}

/**
 * Invalidate previous unused OTPs for a user and purpose
 */
export async function invalidatePreviousOTPs(
  pool: Pool,
  userId: string,
  _phone: string,
  purpose: OTPPurpose
): Promise<void> {
  await pool.query(
    `UPDATE auth.password_reset_tokens 
     SET used = TRUE 
     WHERE user_id = $1 AND purpose = $2 AND used = FALSE AND otp IS NOT NULL`,
    [userId, purpose]
  );
}

/**
 * Find OTP by phone and purpose (for signup flow where we might not have userId yet)
 */
export async function findOTPByPhone(
  pool: Pool,
  phone: string,
  otp: string,
  purpose: OTPPurpose
): Promise<{ valid: boolean; userId?: string; record?: OTPRecord; error?: string }> {
  // First find user by phone
  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE phone = $1`,
    [phone]
  );
  
  if (userResult.rows.length === 0) {
    return { valid: false, error: 'Invalid phone or OTP' };
  }
  
  const userId = userResult.rows[0].id;
  
  // Now validate OTP
  const validation = await validateOTP(pool, userId, phone, otp, purpose);
  
  if (!validation.valid) {
    return validation;
  }
  
  return { valid: true, userId, record: validation.record };
}

export default {
  generateOTPCode,
  generateAndStoreOTP,
  validateOTP,
  markOTPAsUsed,
  invalidatePreviousOTPs,
  findOTPByPhone,
};
