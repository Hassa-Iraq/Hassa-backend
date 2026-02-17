import express, { Response } from "express";
import { body, query } from "express-validator";
import { sendSuccess, HTTP_STATUS } from "shared/api-response/index";
import { validateRequest, commonValidators } from "shared/validation/index";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  RequestWithLogger,
  createFieldError,
} from "shared/error-handler/index";
import pool from "../db/connection";
import { authenticate, authorize } from "../middleware/auth";
import { cache, cacheKeys } from "../utils/redis";
import { indexRestaurant } from "../utils/elasticsearch";
import { ForbiddenError } from "shared/error-handler/index";

const router = express.Router();

/**
 * Helper function to validate restaurant ownership
 */
async function validateRestaurantOwnership(
  restaurantId: string,
  userId: string
): Promise<void> {
  const result = await pool.query(
    "SELECT user_id FROM restaurant.restaurants WHERE id = $1",
    [restaurantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Restaurant not found");
  }

  if (result.rows[0].user_id !== userId) {
    throw new ForbiddenError(
      "You do not have permission to manage this restaurant"
    );
  }
}

/**
 * Helper function to map database email field to contact_email in API response
 */
function mapRestaurantResponse(
  restaurant: Record<string, unknown>
): Record<string, unknown> {
  const { email, ...rest } = restaurant;
  return {
    ...rest,
    contact_email: email || null,
  };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Restaurant:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         address:
 *           type: string
 *         phone:
 *           type: string
 *         contact_email:
 *           type: string
 *           format: email
 *           description: Restaurant business contact email
 *         is_active:
 *           type: boolean
 *           description: Restaurant approval status (true = approved by admin, false = pending)
 *         is_blocked:
 *           type: boolean
 *           description: Restaurant block status (true = blocked by admin)
 *         is_open:
 *           type: boolean
 *           description: Restaurant open/closed status (controlled by restaurant owner)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateRestaurantRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *         address:
 *           type: string
 *         phone:
 *           type: string
 *           maxLength: 50
 *         contact_email:
 *           type: string
 *           format: email
 *           description: Restaurant business contact email (optional, different from user login email)
 *           example: info@restaurant.com
 *         tax_type:
 *           type: string
 *           enum: [inclusive, exclusive]
 *           description: Tax system type - 'inclusive' (tax deducted from restaurant earning) or 'exclusive' (tax added to customer, applied after discounts/coupons)
 *           default: exclusive
 *         tax_rate:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           maximum: 100
 *           description: Tax rate percentage (0-100)
 *           default: 0.00
 *         free_delivery_enabled:
 *           type: boolean
 *           description: Enable/disable free delivery
 *           default: false
 *         free_delivery_max_amount:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           nullable: true
 *           description: Maximum order amount for free delivery (null = no limit)
 *         free_delivery_min_distance_km:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           nullable: true
 *           description: Minimum distance in kilometers for free delivery (null = no minimum)
 *     UpdateRestaurantRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *         address:
 *           type: string
 *         phone:
 *           type: string
 *           maxLength: 50
 *         contact_email:
 *           type: string
 *           format: email
 *           description: Restaurant business contact email (optional, different from user login email)
 *         tax_type:
 *           type: string
 *           enum: [inclusive, exclusive]
 *           description: Tax system type - 'inclusive' (tax deducted from restaurant earning) or 'exclusive' (tax added to customer, applied after discounts/coupons)
 *         tax_rate:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           maximum: 100
 *           description: Tax rate percentage (0-100)
 *         free_delivery_enabled:
 *           type: boolean
 *           description: Enable/disable free delivery
 *         free_delivery_max_amount:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           nullable: true
 *           description: Maximum order amount for free delivery (null = no limit)
 *         free_delivery_min_distance_km:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           nullable: true
 *           description: Minimum distance in kilometers for free delivery (null = no minimum)
 * tags:
 *   - name: Restaurants
 *     description: Restaurant management endpoints
 */

/**
 * @swagger
 * /restaurants:
 *   post:
 *     summary: Create restaurant
 *     description: Creates a new restaurant profile. Only users with restaurant role can create restaurants.
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRestaurantRequest'
 *     responses:
 *       201:
 *         description: Restaurant created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only restaurant role allowed
 */
router.post(
  "/",
  authenticate,
  authorize("restaurant"),
  [
    commonValidators.requiredString("name", 1, 255),
    commonValidators.optionalString("description"),
    commonValidators.optionalString("address"),
    body("phone")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Phone must not exceed 50 characters"),
    commonValidators.email("contact_email").optional(),
    body("tax_type")
      .optional()
      .isIn(["inclusive", "exclusive"])
      .withMessage("tax_type must be either 'inclusive' or 'exclusive'"),
    body("tax_rate")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("tax_rate must be between 0 and 100"),
    body("free_delivery_enabled")
      .optional()
      .isBoolean()
      .withMessage("free_delivery_enabled must be a boolean"),
    body("free_delivery_max_amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("free_delivery_max_amount must be a positive number"),
    body("free_delivery_min_distance_km")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("free_delivery_min_distance_km must be a positive number"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { name, description, address, phone, contact_email, tax_type, tax_rate, free_delivery_enabled, free_delivery_max_amount, free_delivery_min_distance_km } = req.body;
    const userId = req.user!.id;

    // Check by contact_email if provided (for uniqueness)
    if (contact_email) {
      const emailCheck = await pool.query(
        "SELECT id FROM restaurant.restaurants WHERE email = $1",
        [contact_email]
      );
      if (emailCheck.rows.length > 0) {
        throw new ValidationError("Validation failed", [
          createFieldError("contact_email", "Restaurant with this contact email already exists"),
        ]);
      }
    }

    // Validate free delivery settings
    // If free_delivery_enabled is false, clear delivery amount and distance
    const finalFreeDeliveryEnabled = free_delivery_enabled || false;
    const finalFreeDeliveryMaxAmount = finalFreeDeliveryEnabled ? (free_delivery_max_amount || null) : null;
    const finalFreeDeliveryMinDistance = finalFreeDeliveryEnabled ? (free_delivery_min_distance_km || null) : null;

    // Create restaurant with user_id for ownership
    // New restaurants are created as inactive (pending admin approval)
    // Default tax settings: exclusive tax with 0% rate (can be overridden)
    // Default free delivery: disabled
    const result = await pool.query(
      `INSERT INTO restaurant.restaurants (name, description, address, phone, email, is_active, is_open, is_blocked, tax_type, tax_rate, free_delivery_enabled, free_delivery_max_amount, free_delivery_min_distance_km, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        name,
        description || null,
        address || null,
        phone || null,
        contact_email || null,
        false, // is_active = false (pending admin approval)
        false, // is_open = false
        false, // is_blocked = false
        tax_type || 'exclusive', // tax_type (default: 'exclusive')
        tax_rate !== undefined ? tax_rate : 0.00, // tax_rate (default: 0.00)
        finalFreeDeliveryEnabled,
        finalFreeDeliveryMaxAmount,
        finalFreeDeliveryMinDistance,
        userId,
      ]
    );

    const dbRestaurant = result.rows[0];

    // Index in Elasticsearch
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    req.logger?.info(
      { restaurantId: restaurant.id, userId },
      "Restaurant created"
    );

    return sendSuccess(
      res,
      { restaurant },
      "Restaurant created successfully",
      HTTP_STATUS.CREATED
    );
  })
);

/**
 * @swagger
 * /restaurants:
 *   get:
 *     summary: List all restaurants owned by the authenticated user
 *     description: Returns a paginated list of all restaurants owned by the authenticated user
 *     tags: [Restaurants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: List of restaurants owned by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 restaurants:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Restaurant'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get(
  "/",
  authenticate,
  authorize("restaurant"),
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit must be between 1 and 100"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const userId = req.user!.id;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    // Query all restaurants owned by the user
    const result = await pool.query(
      `SELECT * FROM restaurant.restaurants 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      "SELECT COUNT(*) as total FROM restaurant.restaurants WHERE user_id = $1",
      [userId]
    );

    const total = parseInt(countResult.rows[0].total);

    // Map email to contact_email in API response
    const restaurants = result.rows.map((restaurant) =>
      mapRestaurantResponse(restaurant)
    );

    const response = {
      restaurants,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    req.logger?.info(
      { userId, count: restaurants.length },
      "Listed user restaurants"
    );

    return sendSuccess(res, response);
  })
);

/**
 * @swagger
 * /restaurants/{id}:
 *   get:
 *     summary: Get restaurant by ID
 *     description: Returns restaurant details by ID
 *     tags: [Restaurants]
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
 *         description: Restaurant details
 *       404:
 *         description: Restaurant not found
 */
router.get(
  "/:id",
  authenticate,
  authorize("restaurant"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Validate ownership
    await validateRestaurantOwnership(id, userId);

    const result = await pool.query(
      "SELECT * FROM restaurant.restaurants WHERE id = $1",
      [id]
    );

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(result.rows[0]);

    return sendSuccess(res, { restaurant });
  })
);

/**
 * @swagger
 * /restaurants/{id}:
 *   put:
 *     summary: Update restaurant
 *     description: Updates restaurant details. Only restaurant owners can update their restaurant.
 *     tags: [Restaurants]
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
 *             $ref: '#/components/schemas/UpdateRestaurantRequest'
 *     responses:
 *       200:
 *         description: Restaurant updated successfully
 *       404:
 *         description: Restaurant not found
 */
router.put(
  "/:id",
  authenticate,
  authorize("restaurant"),
  [
    commonValidators.uuid("id"),
    commonValidators.optionalString("name", 255),
    commonValidators.optionalString("description"),
    commonValidators.optionalString("address"),
    body("phone")
      .optional()
      .isLength({ max: 50 })
      .withMessage("Phone must not exceed 50 characters"),
    body("contact_email")
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage("contact_email must be a valid email address"),
    body("tax_type")
      .optional()
      .isIn(["inclusive", "exclusive"])
      .withMessage("tax_type must be either 'inclusive' or 'exclusive'"),
    body("tax_rate")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("tax_rate must be between 0 and 100"),
    body("free_delivery_enabled")
      .optional()
      .isBoolean()
      .withMessage("free_delivery_enabled must be a boolean"),
    body("free_delivery_max_amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("free_delivery_max_amount must be a positive number"),
    body("free_delivery_min_distance_km")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("free_delivery_min_distance_km must be a positive number"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const { name, description, address, phone, contact_email, tax_type, tax_rate, free_delivery_enabled, free_delivery_max_amount, free_delivery_min_distance_km } = req.body;
    const userId = req.user!.id;

    // Validate ownership
    await validateRestaurantOwnership(id, userId);

    // Check contact_email uniqueness if being updated
    if (contact_email !== undefined) {
      const emailCheck = await pool.query(
        "SELECT id FROM restaurant.restaurants WHERE email = $1 AND id != $2",
        [contact_email, id]
      );
      if (emailCheck.rows.length > 0) {
        throw new ValidationError("Validation failed", [
          createFieldError("contact_email", "Restaurant with this contact email already exists"),
        ]);
      }
    }

    // Get current free_delivery_enabled status if not being updated
    let currentFreeDeliveryEnabled: boolean | undefined;
    if (free_delivery_enabled === undefined) {
      const currentResult = await pool.query(
        "SELECT free_delivery_enabled FROM restaurant.restaurants WHERE id = $1",
        [id]
      );
      if (currentResult.rows.length > 0) {
        currentFreeDeliveryEnabled = currentResult.rows[0].free_delivery_enabled;
      }
    }

    // Determine final free_delivery_enabled value
    const finalFreeDeliveryEnabled = free_delivery_enabled !== undefined 
      ? free_delivery_enabled 
      : currentFreeDeliveryEnabled;

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(address);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(phone);
    }
    if (contact_email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(contact_email);
    }
    if (tax_type !== undefined) {
      updates.push(`tax_type = $${paramIndex++}`);
      values.push(tax_type);
    }
    if (tax_rate !== undefined) {
      updates.push(`tax_rate = $${paramIndex++}`);
      values.push(tax_rate);
    }
    if (free_delivery_enabled !== undefined) {
      updates.push(`free_delivery_enabled = $${paramIndex++}`);
      values.push(free_delivery_enabled);
    }
    
    // Handle free delivery settings: clear amount/distance if disabled
    if (free_delivery_max_amount !== undefined) {
      if (finalFreeDeliveryEnabled) {
        updates.push(`free_delivery_max_amount = $${paramIndex++}`);
        values.push(free_delivery_max_amount);
      } else {
        updates.push(`free_delivery_max_amount = $${paramIndex++}`);
        values.push(null);
      }
    } else if (free_delivery_enabled === false) {
      // If disabling free delivery, clear the amount
      updates.push(`free_delivery_max_amount = $${paramIndex++}`);
      values.push(null);
    }
    
    if (free_delivery_min_distance_km !== undefined) {
      if (finalFreeDeliveryEnabled) {
        updates.push(`free_delivery_min_distance_km = $${paramIndex++}`);
        values.push(free_delivery_min_distance_km);
      } else {
        updates.push(`free_delivery_min_distance_km = $${paramIndex++}`);
        values.push(null);
      }
    } else if (free_delivery_enabled === false) {
      // If disabling free delivery, clear the distance
      updates.push(`free_delivery_min_distance_km = $${paramIndex++}`);
      values.push(null);
    }

    if (updates.length === 0) {
      throw new ValidationError("No fields to update");
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE restaurant.restaurants 
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    const dbRestaurant = result.rows[0];

    // Update Elasticsearch index
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    // Invalidate cache
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");

    req.logger?.info({ restaurantId: id }, "Restaurant updated");

    return sendSuccess(res, { restaurant }, "Restaurant updated successfully");
  })
);

/**
 * @swagger
 * /restaurants/{id}/approve:
 *   patch:
 *     summary: Approve restaurant (Admin only)
 *     description: Approves a restaurant for use. Only admins can approve restaurants.
 *     tags: [Restaurants]
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
 *         description: Restaurant approved successfully
 *       404:
 *         description: Restaurant not found
 *       403:
 *         description: Forbidden - Only admin role allowed
 */
router.patch(
  "/:id/approve",
  authenticate,
  authorize("admin"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check if restaurant exists
    const checkResult = await pool.query(
      "SELECT id, is_blocked FROM restaurant.restaurants WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      throw new NotFoundError("Restaurant not found");
    }

    if (checkResult.rows[0].is_blocked) {
      throw new ValidationError("Cannot approve a blocked restaurant. Unblock it first.");
    }

    const result = await pool.query(
      `UPDATE restaurant.restaurants 
       SET is_active = true, is_blocked = false
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const dbRestaurant = result.rows[0];

    // Update Elasticsearch index
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    // Invalidate cache
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");

    req.logger?.info({ restaurantId: id, adminId: req.user!.id }, "Restaurant approved by admin");

    return sendSuccess(
      res,
      { restaurant },
      "Restaurant approved successfully"
    );
  })
);

/**
 * @swagger
 * /restaurants/{id}/block:
 *   patch:
 *     summary: Block restaurant (Admin only)
 *     description: Blocks a restaurant from being used. Only admins can block restaurants.
 *     tags: [Restaurants]
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
 *         description: Restaurant blocked successfully
 *       404:
 *         description: Restaurant not found
 *       403:
 *         description: Forbidden - Only admin role allowed
 */
router.patch(
  "/:id/block",
  authenticate,
  authorize("admin"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check if restaurant exists
    const checkResult = await pool.query(
      "SELECT id FROM restaurant.restaurants WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      throw new NotFoundError("Restaurant not found");
    }

    const result = await pool.query(
      `UPDATE restaurant.restaurants 
       SET is_blocked = true, is_active = false, is_open = false
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const dbRestaurant = result.rows[0];

    // Update Elasticsearch index
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    // Invalidate cache
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");

    req.logger?.info({ restaurantId: id, adminId: req.user!.id }, "Restaurant blocked by admin");

    return sendSuccess(
      res,
      { restaurant },
      "Restaurant blocked successfully"
    );
  })
);

/**
 * @swagger
 * /restaurants/{id}/unblock:
 *   patch:
 *     summary: Unblock restaurant (Admin only)
 *     description: Unblocks a restaurant. Only admins can unblock restaurants. Note that unblocking does not automatically approve the restaurant.
 *     tags: [Restaurants]
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
 *         description: Restaurant unblocked successfully
 *       404:
 *         description: Restaurant not found
 *       403:
 *         description: Forbidden - Only admin role allowed
 */
router.patch(
  "/:id/unblock",
  authenticate,
  authorize("admin"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check if restaurant exists
    const checkResult = await pool.query(
      "SELECT id FROM restaurant.restaurants WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      throw new NotFoundError("Restaurant not found");
    }

    const result = await pool.query(
      `UPDATE restaurant.restaurants 
       SET is_blocked = false
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const dbRestaurant = result.rows[0];

    // Update Elasticsearch index
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    // Invalidate cache
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");

    req.logger?.info({ restaurantId: id, adminId: req.user!.id }, "Restaurant unblocked by admin");

    return sendSuccess(
      res,
      { restaurant },
      "Restaurant unblocked successfully"
    );
  })
);

/**
 * @swagger
 * /restaurants/{id}/open:
 *   patch:
 *     summary: Open restaurant
 *     description: Opens a restaurant (sets is_open to true). Only restaurant owners can open their restaurant.
 *     tags: [Restaurants]
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
 *         description: Restaurant opened successfully
 *       404:
 *         description: Restaurant not found
 */
router.patch(
  "/:id/open",
  authenticate,
  authorize("restaurant"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Validate ownership and check if restaurant is active and not blocked
    const checkResult = await pool.query(
      "SELECT is_active, is_blocked, user_id FROM restaurant.restaurants WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      throw new NotFoundError("Restaurant not found");
    }

    if (checkResult.rows[0].user_id !== userId) {
      throw new ForbiddenError(
        "You do not have permission to manage this restaurant"
      );
    }

    if (checkResult.rows[0].is_blocked) {
      throw new ValidationError("Cannot open a blocked restaurant");
    }

    if (!checkResult.rows[0].is_active) {
      throw new ValidationError("Cannot open an inactive restaurant. Please wait for admin approval.");
    }

    const result = await pool.query(
      `UPDATE restaurant.restaurants 
       SET is_open = true
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const dbRestaurant = result.rows[0];

    // Update Elasticsearch index
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    // Invalidate cache
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");

    req.logger?.info({ restaurantId: id }, "Restaurant opened");

    return sendSuccess(res, { restaurant }, "Restaurant opened successfully");
  })
);

/**
 * @swagger
 * /restaurants/{id}/close:
 *   patch:
 *     summary: Close restaurant
 *     description: Closes a restaurant (sets is_open to false). Only restaurant owners can close their restaurant.
 *     tags: [Restaurants]
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
 *         description: Restaurant closed successfully
 *       404:
 *         description: Restaurant not found
 */
router.patch(
  "/:id/close",
  authenticate,
  authorize("restaurant"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Validate ownership
    await validateRestaurantOwnership(id, userId);

    const result = await pool.query(
      `UPDATE restaurant.restaurants 
       SET is_open = false
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const dbRestaurant = result.rows[0];

    // Update Elasticsearch index
    await indexRestaurant(dbRestaurant);

    // Map email to contact_email in API response
    const restaurant = mapRestaurantResponse(dbRestaurant);

    // Invalidate cache
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");

    req.logger?.info({ restaurantId: id }, "Restaurant closed");

    return sendSuccess(res, { restaurant }, "Restaurant closed successfully");
  })
);

export default router;
