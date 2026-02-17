import express, { Response } from "express";
import { body, query } from "express-validator";
import { sendSuccess, HTTP_STATUS } from "shared/api-response/index";
import { validateRequest } from "shared/validation/index";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  RequestWithLogger,
  createFieldError,
} from "shared/error-handler/index";
import pool from "../db/connection";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

/**
 * Generate a random coupon code
 */
function generateCouponCode(length: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Coupon:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         code:
 *           type: string
 *         coupon_type:
 *           type: string
 *           enum: [default, first_order]
 *         discount_type:
 *           type: string
 *           enum: [percent, fixed, value]
 *         discount_value:
 *           type: number
 *           format: decimal
 *         minimum_purchase:
 *           type: number
 *           format: decimal
 *           nullable: true
 *         maximum_discount:
 *           type: number
 *           format: decimal
 *           nullable: true
 *         limit_same_user:
 *           type: boolean
 *         start_date:
 *           type: string
 *           format: date-time
 *         end_date:
 *           type: string
 *           format: date-time
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /coupons:
 *   post:
 *     summary: Create a new coupon
 *     description: Create a new coupon with the specified settings. Admin role required.
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - discount_type
 *               - discount_value
 *               - start_date
 *               - end_date
 *             properties:
 *               title:
 *                 type: string
 *               code:
 *                 type: string
 *                 description: Optional. If not provided, a code will be generated automatically
 *               coupon_type:
 *                 type: string
 *                 enum: [default, first_order]
 *                 default: default
 *               discount_type:
 *                 type: string
 *                 enum: [percent, fixed, value]
 *               discount_value:
 *                 type: number
 *               minimum_purchase:
 *                 type: number
 *               maximum_discount:
 *                 type: number
 *                 description: Maximum discount amount (only for percent type)
 *               limit_same_user:
 *                 type: boolean
 *                 default: false
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Coupon created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     coupon:
 *                       $ref: '#/components/schemas/Coupon'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/",
  authenticate,
  authorize("admin"),
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Title is required")
      .isLength({ max: 255 })
      .withMessage("Title must be at most 255 characters"),
    body("code")
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("Code must be between 3 and 50 characters")
      .matches(/^[A-Z0-9]+$/)
      .withMessage("Code must contain only uppercase letters and numbers"),
    body("coupon_type")
      .optional()
      .isIn(["default", "first_order"])
      .withMessage("coupon_type must be either 'default' or 'first_order'"),
    body("discount_type")
      .notEmpty()
      .withMessage("discount_type is required")
      .isIn(["percent", "fixed", "value"])
      .withMessage("discount_type must be 'percent', 'fixed', or 'value'"),
    body("discount_value")
      .notEmpty()
      .withMessage("discount_value is required")
      .isFloat({ min: 0.01 })
      .withMessage("discount_value must be a positive number"),
    body("minimum_purchase")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("minimum_purchase must be a non-negative number"),
    body("maximum_discount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("maximum_discount must be a non-negative number"),
    body("limit_same_user")
      .optional()
      .isBoolean()
      .withMessage("limit_same_user must be a boolean"),
    body("start_date")
      .notEmpty()
      .withMessage("start_date is required")
      .isISO8601()
      .withMessage("start_date must be a valid ISO 8601 date"),
    body("end_date")
      .notEmpty()
      .withMessage("end_date is required")
      .isISO8601()
      .withMessage("end_date must be a valid ISO 8601 date"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const {
      title,
      code,
      coupon_type = "default",
      discount_type,
      discount_value,
      minimum_purchase,
      maximum_discount,
      limit_same_user = false,
      start_date,
      end_date,
    } = req.body;

    // Validate date range
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (startDate >= endDate) {
      throw new ValidationError("Validation failed", [
        createFieldError("start_date", "start_date must be before end_date"),
        createFieldError("end_date", "end_date must be after start_date"),
      ]);
    }

    // Validate maximum_discount for percent type
    if (discount_type === "percent" && maximum_discount === undefined) {
      throw new ValidationError("Validation failed", [
        createFieldError("maximum_discount", "maximum_discount is required for percent discount type"),
      ]);
    }

    // Generate code if not provided
    let finalCode = code;
    if (!finalCode) {
      let attempts = 0;
      let isUnique = false;
      while (!isUnique && attempts < 10) {
        finalCode = generateCouponCode();
        const checkResult = await pool.query(
          "SELECT id FROM coupons.coupons WHERE code = $1",
          [finalCode]
        );
        if (checkResult.rows.length === 0) {
          isUnique = true;
        }
        attempts++;
      }
      if (!isUnique) {
        throw new ValidationError("Validation failed", [
          createFieldError("code", "Failed to generate unique coupon code. Please provide a code manually."),
        ]);
      }
    } else {
      // Check if code already exists
      const checkResult = await pool.query(
        "SELECT id FROM coupons.coupons WHERE code = $1",
        [finalCode.toUpperCase()]
      );
      if (checkResult.rows.length > 0) {
        throw new ValidationError("Validation failed", [
          createFieldError("code", "Coupon code already exists"),
        ]);
      }
    }

    // Insert coupon
    const result = await pool.query(
      `INSERT INTO coupons.coupons (
        title, code, coupon_type, discount_type, discount_value,
        minimum_purchase, maximum_discount, limit_same_user,
        start_date, end_date, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        title,
        finalCode.toUpperCase(),
        coupon_type,
        discount_type,
        discount_value,
        minimum_purchase || null,
        maximum_discount || null,
        limit_same_user,
        startDate,
        endDate,
        true, // is_active
      ]
    );

    return sendSuccess(
      res,
      { coupon: result.rows[0] },
      "Coupon created successfully",
      HTTP_STATUS.CREATED
    );
  })
);

/**
 * @swagger
 * /coupons:
 *   get:
 *     summary: List all coupons
 *     description: Get a paginated list of all coupons. Admin role required.
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of coupons
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     coupons:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Coupon'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/",
  authenticate,
  authorize("admin"),
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit must be between 1 and 100"),
    query("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be a boolean"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const isActive =
      req.query.is_active !== undefined
        ? req.query.is_active === "true"
        : undefined;

    let queryText = "SELECT * FROM coupons.coupons";
    const queryParams: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      queryParams.push(isActive);
    }

    if (conditions.length > 0) {
      queryText += " WHERE " + conditions.join(" AND ");
    }

    queryText +=
      " ORDER BY created_at DESC LIMIT $" +
      paramIndex++ +
      " OFFSET $" +
      paramIndex++;
    queryParams.push(limit, offset);

    const result = await pool.query(queryText, queryParams);

    // Get total count
    let countQuery = "SELECT COUNT(*) FROM coupons.coupons";
    if (conditions.length > 0) {
      countQuery += " WHERE " + conditions.join(" AND ");
    }
    const countResult = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].count);

    return sendSuccess(res, {
      coupons: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * @swagger
 * /coupons/{id}:
 *   get:
 *     summary: Get coupon by ID
 *     description: Get details of a specific coupon. Admin role required.
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Coupon details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     coupon:
 *                       $ref: '#/components/schemas/Coupon'
 *       404:
 *         description: Coupon not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  "/:id",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM coupons.coupons WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Coupon not found");
    }

    return sendSuccess(res, { coupon: result.rows[0] });
  })
);

/**
 * @swagger
 * /coupons/{id}:
 *   put:
 *     summary: Update coupon
 *     description: Update an existing coupon. Admin role required.
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               code:
 *                 type: string
 *               coupon_type:
 *                 type: string
 *                 enum: [default, first_order]
 *               discount_type:
 *                 type: string
 *                 enum: [percent, fixed, value]
 *               discount_value:
 *                 type: number
 *               minimum_purchase:
 *                 type: number
 *               maximum_discount:
 *                 type: number
 *               limit_same_user:
 *                 type: boolean
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Coupon updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     coupon:
 *                       $ref: '#/components/schemas/Coupon'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       404:
 *         description: Coupon not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  [
    body("title")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Title cannot be empty")
      .isLength({ max: 255 })
      .withMessage("Title must be at most 255 characters"),
    body("code")
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("Code must be between 3 and 50 characters")
      .matches(/^[A-Z0-9]+$/)
      .withMessage("Code must contain only uppercase letters and numbers"),
    body("coupon_type")
      .optional()
      .isIn(["default", "first_order"])
      .withMessage("coupon_type must be either 'default' or 'first_order'"),
    body("discount_type")
      .optional()
      .isIn(["percent", "fixed", "value"])
      .withMessage("discount_type must be 'percent', 'fixed', or 'value'"),
    body("discount_value")
      .optional()
      .isFloat({ min: 0.01 })
      .withMessage("discount_value must be a positive number"),
    body("minimum_purchase")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("minimum_purchase must be a non-negative number"),
    body("maximum_discount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("maximum_discount must be a non-negative number"),
    body("limit_same_user")
      .optional()
      .isBoolean()
      .withMessage("limit_same_user must be a boolean"),
    body("start_date")
      .optional()
      .isISO8601()
      .withMessage("start_date must be a valid ISO 8601 date"),
    body("end_date")
      .optional()
      .isISO8601()
      .withMessage("end_date must be a valid ISO 8601 date"),
    body("is_active")
      .optional()
      .isBoolean()
      .withMessage("is_active must be a boolean"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const {
      title,
      code,
      coupon_type,
      discount_type,
      discount_value,
      minimum_purchase,
      maximum_discount,
      limit_same_user,
      start_date,
      end_date,
      is_active,
    } = req.body;

    // Check if coupon exists
    const existingResult = await pool.query(
      "SELECT * FROM coupons.coupons WHERE id = $1",
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new NotFoundError("Coupon not found");
    }

    const existing = existingResult.rows[0];

    // Validate code uniqueness if changed
    if (code && code.toUpperCase() !== existing.code) {
      const checkResult = await pool.query(
        "SELECT id FROM coupons.coupons WHERE code = $1 AND id != $2",
        [code.toUpperCase(), id]
      );
      if (checkResult.rows.length > 0) {
        throw new ValidationError("Validation failed", [
          createFieldError("code", "Coupon code already exists"),
        ]);
      }
    }

    // Validate date range if dates are provided
    const startDate = start_date
      ? new Date(start_date)
      : new Date(existing.start_date);
    const endDate = end_date ? new Date(end_date) : new Date(existing.end_date);
    if (startDate >= endDate) {
      throw new ValidationError("Validation failed", [
        createFieldError("start_date", "start_date must be before end_date"),
        createFieldError("end_date", "end_date must be after start_date"),
      ]);
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      values.push(code.toUpperCase());
    }
    if (coupon_type !== undefined) {
      updates.push(`coupon_type = $${paramIndex++}`);
      values.push(coupon_type);
    }
    if (discount_type !== undefined) {
      updates.push(`discount_type = $${paramIndex++}`);
      values.push(discount_type);
    }
    if (discount_value !== undefined) {
      updates.push(`discount_value = $${paramIndex++}`);
      values.push(discount_value);
    }
    if (minimum_purchase !== undefined) {
      updates.push(`minimum_purchase = $${paramIndex++}`);
      values.push(minimum_purchase || null);
    }
    if (maximum_discount !== undefined) {
      updates.push(`maximum_discount = $${paramIndex++}`);
      values.push(maximum_discount || null);
    }
    if (limit_same_user !== undefined) {
      updates.push(`limit_same_user = $${paramIndex++}`);
      values.push(limit_same_user);
    }
    if (start_date !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(startDate);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(endDate);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      throw new ValidationError("No fields to update");
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE coupons.coupons SET ${updates.join(
        ", "
      )} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return sendSuccess(
      res,
      { coupon: result.rows[0] },
      "Coupon updated successfully"
    );
  })
);

/**
 * @swagger
 * /coupons/{id}:
 *   delete:
 *     summary: Delete coupon
 *     description: Delete a coupon. Admin role required.
 *     tags: [Coupons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Coupon deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     coupon:
 *                       $ref: '#/components/schemas/Coupon'
 *       404:
 *         description: Coupon not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM coupons.coupons WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Coupon not found");
    }

    return sendSuccess(
      res,
      { coupon: result.rows[0] },
      "Coupon deleted successfully"
    );
  })
);

export default router;
