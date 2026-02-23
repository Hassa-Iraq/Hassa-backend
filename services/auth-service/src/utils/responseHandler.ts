import { Response } from "express";

/**
 * Standard API response format (all lowercase).
 * Every API must return this shape.
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  status: "OK";
  message: string;
  data: T | null;
}

export interface ApiErrorResponse {
  success: false;
  status: "ERROR";
  message: string;
  data: null;
}

/**
 * Send success response.
 * @param res Express response
 * @param message Success message
 * @param data Response data (use null for no payload)
 * @param statusCode HTTP status (default 200)
 */
export function success(
  res: Response,
  message: string,
  data: unknown = null,
  statusCode: number = 200
): Response {
  const body: ApiSuccessResponse = {
    success: true,
    status: "OK",
    message,
    data: data as ApiSuccessResponse["data"],
  };
  return res.status(statusCode).json(body);
}

/**
 * Send error response (used by error handler middleware).
 * @param res Express response
 * @param message Error message
 * @param statusCode HTTP status (default 500)
 */
export function error(
  res: Response,
  message: string,
  statusCode: number = 500
): Response {
  const body: ApiErrorResponse = {
    success: false,
    status: "ERROR",
    message,
    data: null,
  };
  return res.status(statusCode).json(body);
}

export const sendSuccess = success;
export const sendError = error;

export default { success, error, sendSuccess, sendError };
