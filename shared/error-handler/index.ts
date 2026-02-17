import { Request, Response, NextFunction } from "express";
import { sendError, HTTP_STATUS, FieldError } from "../api-response/index";
import type { Logger } from "pino";

/**
 * Base application error class
 */
export class AppError extends Error {
  statusCode: number;
  errorCode: string;
  details: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = "INTERNAL_ERROR",
    details: unknown = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Checks if this error contains field-wise errors
   */
  hasFieldErrors(): this is AppError & { details: FieldError[] } {
    return (
      Array.isArray(this.details) &&
      this.details.length > 0 &&
      this.details.every(
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
   * Gets field errors if this error contains them
   */
  getFieldErrors(): FieldError[] | null {
    return this.hasFieldErrors() ? this.details : null;
  }
}

/**
 * Validation error
 * 
 * @example
 * // Single field error
 * throw new ValidationError("Validation failed", [
 *   { field: "email", message: "Email is required" }
 * ]);
 * 
 * @example
 * // Multiple field errors
 * throw new ValidationError("Validation failed", [
 *   { field: "email", message: "Email is required" },
 *   { field: "password", message: "Password must be at least 8 characters" }
 * ]);
 */
export class ValidationError extends AppError {
  constructor(message: string = "Validation failed", details: FieldError[] | unknown = null) {
    super(message, HTTP_STATUS.VALIDATION_ERROR, "VALIDATION_ERROR", details);
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found", details: unknown = null) {
    super(message, HTTP_STATUS.NOT_FOUND, "NOT_FOUND", details);
  }
}

/**
 * Unauthorized error
 * 
 * @example
 * // With field error
 * throw new UnauthorizedError("Authentication failed", [
 *   { field: "token", message: "Token has expired" }
 * ]);
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", details: FieldError[] | unknown = null) {
    super(message, HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED", details);
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", details: unknown = null) {
    super(message, HTTP_STATUS.FORBIDDEN, "FORBIDDEN", details);
  }
}

/**
 * Conflict error
 * 
 * @example
 * // With field errors
 * throw new ConflictError("Registration failed", [
 *   { field: "email", message: "Email is already registered" },
 *   { field: "phone", message: "Phone number is already registered" }
 * ]);
 */
export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict", details: FieldError[] | unknown = null) {
    super(message, HTTP_STATUS.CONFLICT, "CONFLICT", details);
  }
}

/**
 * Bad request error
 * 
 * @example
 * // With field errors
 * throw new BadRequestError("Invalid request", [
 *   { field: "email", message: "Email is already in use" },
 *   { field: "username", message: "Username must be at least 3 characters" }
 * ]);
 */
export class BadRequestError extends AppError {
  constructor(message: string = "Bad request", details: FieldError[] | unknown = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST", details);
  }
}

/**
 * Extended Express Request with logger
 * Uses Pino logger interface - all methods (info, warn, error, debug) are always available
 */
export interface RequestWithLogger extends Request {
  logger?: Logger;
  user?: {
    id: string;
    role: string;
    email?: string;
  };
}

/**
 * Global error handler middleware for Express
 */
export function errorHandler(
  err: Error | AppError,
  req: RequestWithLogger,
  res: Response,
  _next: NextFunction
): Response | void {
  // Log error with comprehensive details
  if (req.logger) {
    const errorInfo: {
      name: string;
      message: string;
      stack?: string;
      errorCode?: string;
      details?: unknown;
    } = {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    };

    // Add error code and details for AppError
    if (err instanceof AppError) {
      errorInfo.errorCode = err.errorCode;
      if (err.details) {
        errorInfo.details = err.details;
      }
    }

    const errorDetails: Record<string, unknown> = {
      error: errorInfo,
      request: {
        method: req.method,
        url: req.url,
        path: req.path,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent"),
      },
      statusCode: err instanceof AppError ? err.statusCode : 500,
    };

    // Add user info if available
    if (req.user) {
      errorDetails.user = {
        id: req.user.id,
        role: req.user.role,
      };
    }

    req.logger.error(errorDetails, "Request error");
  }

  // Handle known application errors
  if (err instanceof AppError) {
    return sendError(
      res,
      err.message,
      err.errorCode,
      err.details,
      err.statusCode
    );
  }

  // Handle validation errors from express-validator
  if (err.name === "ValidationError" || err.name === "MulterError") {
    const validationErr = err as Error & { errors?: unknown; details?: unknown };
    return sendError(
      res,
      err.message || "Validation error",
      "VALIDATION_ERROR",
      validationErr.errors || validationErr.details || null,
      HTTP_STATUS.VALIDATION_ERROR
    );
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return sendError(
      res,
      "Invalid token",
      "INVALID_TOKEN",
      null,
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  if (err.name === "TokenExpiredError") {
    return sendError(
      res,
      "Token expired",
      "TOKEN_EXPIRED",
      null,
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  // Handle database errors
  const dbError = err as Error & { code?: string };
  if (dbError.code === "23505") {
    // PostgreSQL unique violation
    return sendError(
      res,
      "Resource already exists",
      "DUPLICATE_ENTRY",
      null,
      HTTP_STATUS.CONFLICT
    );
  }

  // Default error response
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

  return sendError(
    res,
    message,
    "INTERNAL_ERROR",
    process.env.NODE_ENV === "development" ? { stack: err.stack } : null,
    HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (
    req: RequestWithLogger,
    res: Response,
    next: NextFunction
  ) => Promise<unknown>
) {
  return (req: RequestWithLogger, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Helper function to create a single field error
 */
export function createFieldError(field: string, message: string): FieldError {
  return { field, message };
}

/**
 * Helper function to create multiple field errors
 */
export function createFieldErrors(...errors: Array<{ field: string; message: string }>): FieldError[] {
  return errors;
}

export default {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  errorHandler,
  asyncHandler,
  createFieldError,
  createFieldErrors,
};
