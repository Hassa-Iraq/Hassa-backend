/**
 * Shared constants and validation helpers for auth controller.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const OTP_6_REGEX = /^[0-9]{6}$/;

export const ROLES = ["customer", "restaurant", "driver"] as const;

export function trim(value: unknown): string {
  return String(value ?? "").trim();
}

export function isValidEmail(value: unknown): boolean {
  return EMAIL_REGEX.test(trim(value).toLowerCase());
}

export function isValidPassword(value: unknown, minLength = 8): boolean {
  const s = String(value ?? "");
  if (s.length < minLength) return false;
  return /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);
}

export function isValidUuid(value: unknown): boolean {
  return UUID_REGEX.test(trim(value));
}

export function isValidOtp6(value: unknown): boolean {
  return OTP_6_REGEX.test(trim(value));
}
