import express, { Response } from "express";
import { body, query } from "express-validator";
import { sendSuccess, HTTP_STATUS } from "shared/api-response/index";
import { validateRequest, commonValidators } from "shared/validation/index";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  RequestWithLogger,
  createFieldError,
} from "shared/error-handler/index";
import pool from "../db/connection";
import { authenticate, authorize } from "../middleware/auth";
import { cache } from "../utils/redis";
import { upload, getFileUrl } from "../utils/fileUpload";

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
 * Helper function to validate banner ownership (for restaurant admin)
 */
async function validateBannerOwnership(
  bannerId: string,
  userId: string
): Promise<void> {
  const result = await pool.query(
    `SELECT b.restaurant_id, r.user_id 
     FROM banners.banners b
     JOIN restaurant.restaurants r ON b.restaurant_id = r.id
     WHERE b.id = $1`,
    [bannerId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError("Banner not found");
  }

  if (result.rows[0].user_id !== userId) {
    throw new ForbiddenError(
      "You do not have permission to manage this banner"
    );
  }
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Banner:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         restaurant_id:
 *           type: string
 *           format: uuid
 *         banner_name:
 *           type: string
 *         banner_image_url:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         quote_amount:
 *           type: number
 *           format: decimal
 *           nullable: true
 *         quote_currency:
 *           type: string
 *           default: USD
 *         status:
 *           type: string
 *           enum: [requested, quoted, approved, rejected, cancelled]
 *         requested_by_user_id:
 *           type: string
 *           format: uuid
 *         approved_by_user_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         requested_at:
 *           type: string
 *           format: date-time
 *         approved_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         valid_from:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         valid_to:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * tags:
 *   - name: Banners
 *     description: Banner management endpoints
 */

// ==================== RESTAURANT ADMIN ENDPOINTS ====================

/**
 * @swagger
 * /banners:
 *   post:
 *     summary: Create a banner request
 *     description: Restaurant owner creates a banner request for their restaurant. Can upload an image file or provide an image URL.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - restaurant_id
 *               - banner_name
 *             properties:
 *               restaurant_id:
 *                 type: string
 *                 format: uuid
 *               banner_name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *               banner_image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload (optional if banner_image_url is provided)
 *               banner_image_url:
 *                 type: string
 *                 format: uri
 *                 description: Image URL (optional if banner_image is uploaded)
 *               description:
 *                 type: string
 *               valid_from:
 *                 type: string
 *                 format: date-time
 *               valid_to:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Banner request created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden - Not restaurant owner
 *       404:
 *         description: Restaurant not found
 */
router.post(
  "/banners",
  authenticate,
  authorize("restaurant"),
  upload.single("banner_image"),
  [
    body("restaurant_id")
      .isUUID()
      .withMessage("restaurant_id must be a valid UUID"),
    body("banner_name")
      .trim()
      .notEmpty()
      .withMessage("banner_name is required")
      .isLength({ min: 1, max: 255 })
      .withMessage("banner_name must be between 1 and 255 characters"),
    body("banner_image_url")
      .optional()
      .custom((value, { req }) => {
        // If a file was uploaded, skip URL validation
        if (req.file) {
          return true;
        }
        // If no file, URL must be provided and valid
        if (!value || value.trim() === "" || value === "string") {
          throw new Error("banner_image_url is required when no file is uploaded");
        }
        // Validate URL format
        try {
          new URL(value.trim());
          return true;
        } catch {
          throw new Error("banner_image_url must be a valid URL");
        }
      }),
    body("description").optional().trim().isString(),
    body("valid_from")
      .optional()
      .isISO8601()
      .withMessage("valid_from must be a valid ISO 8601 date"),
    body("valid_to")
      .optional()
      .isISO8601()
      .withMessage("valid_to must be a valid ISO 8601 date"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const userId = req.user!.id;
    const { restaurant_id, banner_name, banner_image_url, description, valid_from, valid_to } = req.body;
    const file = req.file;

    // Validate that either file or URL is provided
    const urlValue = banner_image_url?.trim();
    const hasValidUrl = urlValue && urlValue !== "" && urlValue !== "string";
    
    if (!file && !hasValidUrl) {
      throw new ValidationError("Validation failed", [
        createFieldError("banner_image", "Either banner_image (file) or banner_image_url must be provided"),
        createFieldError("banner_image_url", "Either banner_image (file) or banner_image_url must be provided"),
      ]);
    }

    // If both are provided, prefer the uploaded file
    let finalImageUrl: string;
    if (file) {
      // Generate URL for uploaded file
      finalImageUrl = getFileUrl(file.filename);
    } else {
      // Use provided URL (already validated by custom validator)
      finalImageUrl = urlValue!;
    }

    // Validate restaurant ownership
    await validateRestaurantOwnership(restaurant_id, userId);

    // Validate date range if both dates are provided
    if (valid_from && valid_to) {
      const fromDate = new Date(valid_from);
      const toDate = new Date(valid_to);
      if (fromDate >= toDate) {
        throw new ValidationError("Validation failed", [
          createFieldError("valid_from", "valid_from must be before valid_to"),
          createFieldError("valid_to", "valid_to must be after valid_from"),
        ]);
      }
    }

    // Create banner request
    const result = await pool.query(
      `INSERT INTO banners.banners 
       (restaurant_id, banner_name, banner_image_url, description, status, requested_by_user_id, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, 'requested', $5, $6, $7)
       RETURNING *`,
      [restaurant_id, banner_name, finalImageUrl, description || null, userId, valid_from || null, valid_to || null]
    );

    const banner = result.rows[0];

    req.logger?.info(
      { bannerId: banner.id, restaurantId: restaurant_id, userId, imageSource: file ? "upload" : "url" },
      "Banner request created"
    );

    return sendSuccess(res, { banner }, "Created", HTTP_STATUS.CREATED);
  })
);

/**
 * @swagger
 * /banners:
 *   get:
 *     summary: List banner requests for authenticated restaurant owner
 *     description: Returns all banner requests for restaurants owned by the authenticated user
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: restaurant_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by restaurant ID (optional)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [requested, quoted, approved, rejected, cancelled]
 *         description: Filter by status (optional)
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
 *         description: List of banner requests
 */
router.get(
  "/banners",
  authenticate,
  authorize("restaurant"),
  [
    query("restaurant_id").optional().isUUID().withMessage("restaurant_id must be a valid UUID"),
    query("status")
      .optional()
      .isIn(["requested", "quoted", "approved", "rejected", "cancelled"])
      .withMessage("status must be one of: requested, quoted, approved, rejected, cancelled"),
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
    const restaurant_id = req.query.restaurant_id as string | undefined;
    const status = req.query.status as string | undefined;

    // Build query
    let queryText = `
      SELECT b.*, r.name as restaurant_name
      FROM banners.banners b
      JOIN restaurant.restaurants r ON b.restaurant_id = r.id
      WHERE r.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (restaurant_id) {
      // Validate ownership of this restaurant
      await validateRestaurantOwnership(restaurant_id, userId);
      queryText += ` AND b.restaurant_id = $${paramIndex}`;
      params.push(restaurant_id);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ` ORDER BY b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(queryText, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM banners.banners b
      JOIN restaurant.restaurants r ON b.restaurant_id = r.id
      WHERE r.user_id = $1
    `;
    const countParams: any[] = [userId];
    let countParamIndex = 2;

    if (restaurant_id) {
      countQuery += ` AND b.restaurant_id = $${countParamIndex}`;
      countParams.push(restaurant_id);
      countParamIndex++;
    }

    if (status) {
      countQuery += ` AND b.status = $${countParamIndex}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    return sendSuccess(res, {
      banners: result.rows,
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
 * /banners/{id}:
 *   get:
 *     summary: Get banner details
 *     description: Get details of a specific banner request (restaurant owner can only see their own)
 *     tags: [Banners]
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
 *         description: Banner details
 *       403:
 *         description: Forbidden - Not banner owner
 *       404:
 *         description: Banner not found
 */
router.get(
  "/banners/:id",
  authenticate,
  authorize("restaurant"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate banner ownership
    await validateBannerOwnership(id, userId);

    const result = await pool.query(
      `SELECT b.*, r.name as restaurant_name
       FROM banners.banners b
       JOIN restaurant.restaurants r ON b.restaurant_id = r.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Banner not found");
    }

    return sendSuccess(res, { banner: result.rows[0] });
  })
);

/**
 * @swagger
 * /banners/{id}/accept:
 *   post:
 *     summary: Accept banner quote
 *     description: Restaurant owner accepts the quote provided by admin. Banner status changes to 'approved'
 *     tags: [Banners]
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
 *         description: Quote accepted, banner approved
 *       400:
 *         description: Banner is not in 'quoted' status or quote not set
 *       403:
 *         description: Forbidden - Not banner owner
 *       404:
 *         description: Banner not found
 */
router.post(
  "/banners/:id/accept",
  authenticate,
  authorize("restaurant"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate banner ownership
    await validateBannerOwnership(id, userId);

    // Check current status and quote
    const bannerResult = await pool.query(
      "SELECT status, quote_amount FROM banners.banners WHERE id = $1",
      [id]
    );

    if (bannerResult.rows.length === 0) {
      throw new NotFoundError("Banner not found");
    }

    const banner = bannerResult.rows[0];

    if (banner.status !== "quoted") {
      throw new ValidationError(
        "Banner must be in 'quoted' status to accept. Current status: " + banner.status
      );
    }

    if (!banner.quote_amount) {
      throw new ValidationError("Quote amount is not set for this banner");
    }

    // Update banner to approved status
    const updateResult = await pool.query(
      `UPDATE banners.banners 
       SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by_user_id = $1
       WHERE id = $2
       RETURNING *`,
      [userId, id]
    );

    // Invalidate cache for public banners (all paginated results)
    await cache.delPattern("banners:public:approved:*");

    req.logger?.info(
      { bannerId: id, userId },
      "Banner quote accepted, banner approved"
    );

    return sendSuccess(res, { banner: updateResult.rows[0] });
  })
);

/**
 * @swagger
 * /banners/{id}/reject:
 *   post:
 *     summary: Reject banner quote
 *     description: Restaurant owner rejects the quote provided by admin. Banner status changes to 'rejected'
 *     tags: [Banners]
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
 *         description: Quote rejected
 *       400:
 *         description: Banner is not in 'quoted' status
 *       403:
 *         description: Forbidden - Not banner owner
 *       404:
 *         description: Banner not found
 */
router.post(
  "/banners/:id/reject",
  authenticate,
  authorize("restaurant"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    // Validate banner ownership
    await validateBannerOwnership(id, userId);

    // Check current status
    const bannerResult = await pool.query(
      "SELECT status FROM banners.banners WHERE id = $1",
      [id]
    );

    if (bannerResult.rows.length === 0) {
      throw new NotFoundError("Banner not found");
    }

    if (bannerResult.rows[0].status !== "quoted") {
      throw new ValidationError(
        "Banner must be in 'quoted' status to reject. Current status: " + bannerResult.rows[0].status
      );
    }

    // Update banner to rejected status
    const updateResult = await pool.query(
      `UPDATE banners.banners 
       SET status = 'rejected'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    req.logger?.info(
      { bannerId: id, userId },
      "Banner quote rejected"
    );

    return sendSuccess(res, { banner: updateResult.rows[0] });
  })
);

// ==================== PUBLIC ENDPOINTS ====================

/**
 * @swagger
 * /public/banners:
 *   get:
 *     summary: Get approved and public banners (Public)
 *     description: Returns all approved banners that are marked as public by admin and are currently valid. Banners are shown regardless of restaurant status. No authentication required.
 *     tags: [Banners]
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
 *         description: List of approved banners
 */
router.get(
  "/public/banners",
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
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    // Check cache
    const cacheKey = `banners:public:approved:${page}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    // Query approved and public banners that are currently valid
    // Note: Banners are shown regardless of restaurant status (not restaurant binding)
    // Only banners marked as public by admin are shown
    const now = new Date();
    const result = await pool.query(
      `SELECT b.*, r.name as restaurant_name
       FROM banners.banners b
       JOIN restaurant.restaurants r ON b.restaurant_id = r.id
       WHERE b.status = 'approved'
         AND b.is_public = true
         AND (b.valid_from IS NULL OR b.valid_from <= $1)
         AND (b.valid_to IS NULL OR b.valid_to >= $1)
       ORDER BY b.approved_at DESC, b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [now, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total
       FROM banners.banners b
       WHERE b.status = 'approved'
         AND b.is_public = true
         AND (b.valid_from IS NULL OR b.valid_from <= $1)
         AND (b.valid_to IS NULL OR b.valid_to >= $1)`,
      [now]
    );

    const total = parseInt(countResult.rows[0].total);

    const response = {
      banners: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    return sendSuccess(res, response);
  })
);

export default router;
