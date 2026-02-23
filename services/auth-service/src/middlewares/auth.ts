import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    email?: string;
  };
}

/**
 * JWT authentication middleware.
 * Verifies token and attaches user to request; sends 401 in standard format on failure.
 */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      status: "ERROR",
      message: "No token provided",
      data: null,
    });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid or expired token",
        data: null,
      });
      return;
    }
    res.status(401).json({
      success: false,
      status: "ERROR",
      message: (error as Error).message,
      data: null,
    });
  }
}

/**
 * Role-based access control. Call after authenticate.
 */
export function authorize(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        status: "ERROR",
        message: "Insufficient permissions",
        data: null,
      });
      return;
    }
    next();
  };
}

export default { authenticate, authorize };
