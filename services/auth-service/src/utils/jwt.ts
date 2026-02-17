import jwt from 'jsonwebtoken';
import config from '../config/index';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Generate JWT token
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
}

export default {
  generateToken,
  verifyToken,
};
