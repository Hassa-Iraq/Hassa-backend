import { Request, Response, NextFunction } from "express";
import config from "../config/index";

export interface AuthUser {
  id: string;
  role: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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
    const authServiceUrl = config.AUTH_SERVICE_URL || "http://auth-service:3001";
    const response = await fetch(`${authServiceUrl}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid or expired token",
        data: null,
      });
      return;
    }
    const data = (await response.json()) as {
      success?: boolean;
      data?: { user?: { id: string; role?: string; email?: string } };
    };
    const user = data?.data?.user;
    if (!data.success || !user?.id) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Invalid token",
        data: null,
      });
      return;
    }
    req.user = {
      id: user.id,
      role: user.role ?? "customer",
      email: user.email ?? "",
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      status: "ERROR",
      message: "Authentication failed",
      data: null,
    });
  }
}

export async function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next();
      return;
    }
    const token = authHeader.substring(7);
    const authServiceUrl = config.AUTH_SERVICE_URL || "http://auth-service:3001";
    const response = await fetch(`${authServiceUrl}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const data = (await response.json()) as {
        success?: boolean;
        data?: { user?: { id: string; role?: string; email?: string } };
      };
      const user = data?.data?.user;
      if (data.success && user?.id) {
        req.user = { id: user.id, role: user.role ?? "customer", email: user.email ?? "" };
      }
    }
  } catch {
  }
  next();
}

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
