import { Pool } from 'pg';

export interface CouponValidationResult {
  valid: boolean;
  coupon?: {
    id: string;
    title: string;
    code: string;
    discount_type: string;
    discount_value: number;
    minimum_purchase: number | null;
    maximum_discount: number | null;
  };
  discountAmount?: number;
  error?: string;
}

/**
 * Validates a coupon code and calculates discount amount
 * @param pool - Database connection pool
 * @param code - Coupon code to validate
 * @param userId - User ID (for first_order and limit_same_user checks)
 * @param subtotal - Order subtotal before coupon
 * @returns Validation result with discount amount if valid
 */
export async function validateCoupon(
  pool: Pool,
  code: string,
  userId: string,
  subtotal: number
): Promise<CouponValidationResult> {
  try {
    // Find active coupon
    const couponResult = await pool.query(
      `SELECT * FROM coupons.coupons 
       WHERE code = $1 
       AND is_active = true 
       AND start_date <= CURRENT_TIMESTAMP 
       AND end_date >= CURRENT_TIMESTAMP`,
      [code.toUpperCase()]
    );

    if (couponResult.rows.length === 0) {
      return {
        valid: false,
        error: 'Invalid or expired coupon code',
      };
    }

    const coupon = couponResult.rows[0];

    // Check minimum purchase requirement
    if (coupon.minimum_purchase && subtotal < coupon.minimum_purchase) {
      return {
        valid: false,
        error: `Minimum purchase of $${coupon.minimum_purchase} required`,
      };
    }

    // Check if user has already used this coupon (if limit_same_user is true)
    if (coupon.limit_same_user) {
      const usageResult = await pool.query(
        `SELECT id FROM coupons.coupon_usage 
         WHERE coupon_id = $1 AND user_id = $2`,
        [coupon.id, userId]
      );

      if (usageResult.rows.length > 0) {
        return {
          valid: false,
          error: 'You have already used this coupon',
        };
      }
    }

    // Check if this is a first_order coupon and user has previous orders
    if (coupon.coupon_type === 'first_order') {
      const orderResult = await pool.query(
        `SELECT id FROM orders.orders WHERE customer_id = $1 LIMIT 1`,
        [userId]
      );

      if (orderResult.rows.length > 0) {
        return {
          valid: false,
          error: 'This coupon is only valid for first-time customers',
        };
      }
    }

    // Calculate discount amount
    let discountAmount = 0;

    if (coupon.discount_type === 'percent') {
      discountAmount = (subtotal * coupon.discount_value) / 100;
      // Apply maximum discount limit if set
      if (coupon.maximum_discount && discountAmount > coupon.maximum_discount) {
        discountAmount = coupon.maximum_discount;
      }
    } else if (coupon.discount_type === 'fixed' || coupon.discount_type === 'value') {
      discountAmount = coupon.discount_value;
      // Ensure discount doesn't exceed subtotal
      if (discountAmount > subtotal) {
        discountAmount = subtotal;
      }
    }

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        title: coupon.title,
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        minimum_purchase: coupon.minimum_purchase,
        maximum_discount: coupon.maximum_discount,
      },
      discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimal places
    };
  } catch (error: any) {
    return {
      valid: false,
      error: 'Error validating coupon: ' + error.message,
    };
  }
}

/**
 * Records coupon usage in the database
 * @param pool - Database connection pool
 * @param couponId - Coupon ID
 * @param userId - User ID
 * @param orderId - Order ID (optional)
 */
export async function recordCouponUsage(
  pool: Pool,
  couponId: string,
  userId: string,
  orderId?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO coupons.coupon_usage (coupon_id, user_id, order_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (coupon_id, user_id) DO NOTHING`,
      [couponId, userId, orderId || null]
    );
  } catch (error) {
    // Log error but don't throw - coupon usage tracking is not critical
    console.error('Error recording coupon usage:', error);
  }
}
