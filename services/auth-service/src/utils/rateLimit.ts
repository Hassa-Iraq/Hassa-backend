/**
 * Rate limiting utilities for OTP requests
 */
import { Pool } from 'pg';

interface RateLimitConfig {
  maxRequests: number;
  windowMinutes: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  otp_request: {
    maxRequests: 3,
    windowMinutes: 15,
  },
  otp_verify: {
    maxRequests: 5,
    windowMinutes: 15,
  },
};

/**
 * Check rate limit for an identifier (phone or IP)
 */
export async function checkRateLimit(
  pool: Pool,
  identifier: string,
  type: 'phone' | 'ip',
  action: 'otp_request' | 'otp_verify'
): Promise<{ allowed: boolean; remaining: number; resetAt?: Date }> {
  const config = DEFAULT_RATE_LIMITS[action];
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - config.windowMinutes);

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM auth.password_reset_tokens
     WHERE created_at >= $1
     AND (
       (SELECT phone FROM auth.users WHERE id = user_id) = $2
       OR $3 = 'ip'
     )
     AND purpose IN ('signup_phone', 'verify_phone', 'login', 'password_reset')`,
    [windowStart, identifier, type]
  );

  const count = parseInt(result.rows[0]?.count || '0', 10);
  const remaining = Math.max(0, config.maxRequests - count);
  const allowed = count < config.maxRequests;
  const resetAt = new Date();
  resetAt.setMinutes(resetAt.getMinutes() + config.windowMinutes);

  return { allowed, remaining, resetAt };
}

/**
 * Simple in-memory rate limiting (for development/testing)
 * In production, consider using Redis
 */
class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();

  check(identifier: string, maxRequests: number, windowMinutes: number): boolean {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const key = identifier;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const timestamps = this.requests.get(key)!;
    const cutoff = now - windowMs;
    const recentRequests = timestamps.filter(ts => ts > cutoff);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return true;
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }

  clear(): void {
    this.requests.clear();
  }
}

export const memoryRateLimiter = new InMemoryRateLimiter();

export default {
  checkRateLimit,
  memoryRateLimiter,
};
