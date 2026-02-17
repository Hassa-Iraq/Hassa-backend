import { Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError, RequestWithLogger, asyncHandler } from 'shared/error-handler/index';
import config from '../config/index';

/**
 * Validates JWT token by calling Auth Service
 * Attaches user info to request if valid
 */
export const authenticate = asyncHandler(async (
  req: RequestWithLogger,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }

  const token = authHeader.substring(7);

  // Call Auth Service to validate token
  const authServiceUrl = config.AUTH_SERVICE_URL || 'http://auth-service:3001';
  const response = await fetch(`${authServiceUrl}/auth/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    req.logger?.error({ status: response.status, error: errorData }, 'Auth service validation failed');
    throw new UnauthorizedError('Invalid or expired token');
  }

  const data = await response.json() as {
    success?: boolean;
    data?: {
      valid?: boolean;
      user?: {
        id: string;
        role: string;
        email: string;
      };
    };
  };

  if (!data.success || !data.data?.valid || !data.data?.user) {
    throw new UnauthorizedError('Invalid token');
  }

  req.user = {
    id: data.data.user.id,
    role: data.data.user.role,
    email: data.data.user.email,
  };

  next();
});

/**
 * Role-based access control middleware
 */
export function authorize(...allowedRoles: string[]) {
  return (req: RequestWithLogger, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
}

export default {
  authenticate,
  authorize,
};
