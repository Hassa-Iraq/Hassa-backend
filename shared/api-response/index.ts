import { Response } from "express";

/**
 * Standardized API response helpers
 */

/**
 * Represents a field-specific error
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Type guard to check if details contains field-wise errors
 */
function isFieldErrors(details: unknown): details is FieldError[] {
  return (
    Array.isArray(details) &&
    details.length > 0 &&
    details.every(
      (err): err is FieldError =>
        typeof err === "object" &&
        err !== null &&
        "field" in err &&
        "message" in err &&
        typeof (err as FieldError).field === "string" &&
        typeof (err as FieldError).message === "string"
    )
  );
}

/**
 * Type guard for field errors with optional meta (e.g. user_id)
 */
function isFieldErrorsWithMeta(details: unknown): details is FieldErrorsWithMeta {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return false;
  }
  const d = details as Record<string, unknown>;
  if (!Array.isArray(d.errors) || d.errors.length === 0) {
    return false;
  }
  if (!d.errors.every(
    (err: unknown): err is FieldError =>
      typeof err === "object" &&
      err !== null &&
      "field" in err &&
      "message" in err &&
      typeof (err as FieldError).field === "string" &&
      typeof (err as FieldError).message === "string"
  )) {
    return false;
  }
  return true;
}

/**
 * Optional metadata for field error responses (e.g. user_id for verification errors)
 */
export interface FieldErrorResponseMeta {
  user_id?: string;
}

/**
 * Details shape when field errors include metadata (e.g. user_id for "not verified" errors)
 */
export interface FieldErrorsWithMeta {
  errors: FieldError[];
  user_id?: string;
}

/**
 * Response type for field-wise errors
 */
export interface FieldErrorResponse {
  success: false;
  message: string;
  errors: FieldError[];
  user_id?: string;
}

/**
 * Response type for standard errors
 */
export interface StandardErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
}

/**
 * Creates a success response
 */
export function sendSuccess(
  res: Response,
  data: unknown = null,
  message: string = "Success",
  statusCode: number = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Creates an error response with field-wise errors
 * 
 * @example
 * sendError(res, "Validation failed", "VALIDATION_ERROR", [
 *   { field: "email", message: "Email is required" },
 *   { field: "password", message: "Password is too short" }
 * ], 422);
 */
export function sendError(
  res: Response,
  message: string,
  errorCode: string,
  details: FieldError[],
  statusCode: number
): Response<FieldErrorResponse>;

/**
 * Creates an error response with standard error details
 * 
 * @example
 * sendError(res, "Resource not found", "NOT_FOUND", null, 404);
 */
export function sendError(
  res: Response,
  message: string,
  errorCode?: string,
  details?: unknown,
  statusCode?: number
): Response<StandardErrorResponse>;

/**
 * Implementation of sendError with overloads for type safety
 */
export function sendError(
  res: Response,
  message: string,
  errorCode: string = "INTERNAL_ERROR",
  details: FieldError[] | unknown = null,
  statusCode: number = 500
): Response<FieldErrorResponse | StandardErrorResponse> {
  // Handle field-wise errors with optional meta (e.g. user_id for "not verified" errors)
  if (isFieldErrorsWithMeta(details)) {
    const response: FieldErrorResponse = {
      success: false,
      message,
      errors: details.errors.map((err) => ({
        field: err.field,
        message: err.message,
      })),
    };
    if (details.user_id) {
      response.user_id = details.user_id;
    }
    return res.status(statusCode).json(response);
  }

  // Handle field-wise errors (plain array)
  if (isFieldErrors(details)) {
    const response: FieldErrorResponse = {
      success: false,
      message,
      errors: details.map((err) => ({
        field: err.field,
        message: err.message,
      })),
    };
    return res.status(statusCode).json(response);
  }

  // Standard error response
  const response: StandardErrorResponse = {
    success: false,
    message,
    error: {
      code: errorCode,
    },
  };

  if (details !== null && details !== undefined) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
}

/**
 * HTTP status code mappings for common errors
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export default {
  sendSuccess,
  sendError,
  HTTP_STATUS,
};
