import { ValidationError } from "shared/error-handler/index";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OTP_6_REGEX = /^[0-9]{6}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function msg(field: string, text: string): string {
  return `${field} ${text}`.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Throws ValidationError if value is missing or empty string. Returns trimmed string. */
export function required(value: unknown, field: string): string {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    throw new ValidationError(msg(field, "is required"));
  }
  return String(value).trim();
}

/** Throws ValidationError if value is not a valid email. */
export function email(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(s)) throw new ValidationError("Invalid email address");
  return s;
}

/** Throws ValidationError if password doesn't meet rules (min length, upper, lower, number). */
export function password(value: unknown, fieldName: string = "Password", minLength: number = 8): string {
  const s = String(value ?? "");
  if (s.length < minLength) {
    throw new ValidationError(msg(fieldName, `must be at least ${minLength} characters`));
  }
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) {
    throw new ValidationError(
      msg(fieldName, "must contain at least one uppercase letter, one lowercase letter, and one number")
    );
  }
  return s;
}

/** Throws ValidationError if value is not a non-empty string. */
export function string(value: unknown, field: string): string {
  if (value == null || typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(msg(field, "is required"));
  }
  return value.trim();
}

/** Throws ValidationError if value is not a valid UUID. */
export function uuid(value: unknown, field: string): string {
  const s = String(value ?? "").trim();
  if (!UUID_REGEX.test(s)) throw new ValidationError(msg(field, "must be a valid UUID"));
  return s;
}

/** Throws ValidationError if value is not a 6-digit OTP. */
export function otp6(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!OTP_6_REGEX.test(s)) throw new ValidationError("OTP must be a 6-digit number");
  return s;
}

/** Throws ValidationError if value is not one of the allowed options. */
export function oneOf<T extends string>(value: unknown, options: T[], field: string): T {
  const s = String(value ?? "").trim();
  if (!options.includes(s as T)) throw new ValidationError(msg(field, `must be one of: ${options.join(", ")}`));
  return s as T;
}

/** Throws ValidationError if value is not exactly true (for accept_terms). */
export function acceptTerms(value: unknown): void {
  if (value !== true) throw new ValidationError("You must accept the terms and conditions");
}

/** Optional string; if provided, must be string and not longer than maxLen. Returns trimmed or null. */
export function optionalString(value: unknown, field: string, maxLen?: number): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (s === "") return null;
  if (maxLen != null && s.length > maxLen) {
    throw new ValidationError(msg(field, `must not exceed ${maxLen} characters`));
  }
  return s;
}

/** Optional ISO date string. Throws if provided and invalid. Returns value or null. */
export function optionalDate(value: unknown, field: string): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (s === "") return null;
  if (!ISO_DATE_REGEX.test(s)) throw new ValidationError(msg(field, "must be a valid ISO 8601 date"));
  return s;
}

/** Optional string with max length; for body fields that can be omitted. */
export function optionalStringMax(value: unknown, field: string, maxLen: number): string | null {
  return optionalString(value, field, maxLen);
}

export default {
  required,
  email,
  password,
  string,
  uuid,
  otp6,
  oneOf,
  acceptTerms,
  optionalString,
  optionalDate,
  optionalStringMax,
};
