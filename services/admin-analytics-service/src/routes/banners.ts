import express, { Response } from "express";
import { body, query } from "express-validator";
import { sendSuccess } from "shared/api-response/index";
import { validateRequest, commonValidators } from "shared/validation/index";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  RequestWithLogger,
} from "shared/error-handler/index";
import pool from "../db/connection";
import { authenticate, authorize } from "../middleware/auth";

const router = express.Router();

// ==================== ADMIN ENDPOINTS ====================
router.get(
  "/banners",
  authenticate,
  authorize("admin"),
  [
    query("status")
      .optional()
      .isIn(["requested", "quoted", "approved", "rejected", "cancelled"])
      .withMessage(
        "status must be one of: requested, quoted, approved, rejected, cancelled"
      ),
    query("restaurant_id")
      .optional()
      .isUUID()
      .withMessage("restaurant_id must be a valid UUID"),
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
    const status = req.query.status as string | undefined;
    const restaurant_id = req.query.restaurant_id as string | undefined;
    const is_public_raw = req.query.is_public as string | undefined;

    // Parse is_public boolean
    let is_public: boolean | undefined;
    if (is_public_raw === "true") {
      is_public = true;
    } else if (is_public_raw === "false") {
      is_public = false;
    }

    // Build query
    let queryText = `
      SELECT b.*, r.name as restaurant_name, r.user_id as restaurant_owner_id
      FROM banners.banners b
      JOIN restaurant.restaurants r ON b.restaurant_id = r.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      queryText += ` AND b.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (restaurant_id) {
      queryText += ` AND b.restaurant_id = $${paramIndex}`;
      params.push(restaurant_id);
      paramIndex++;
    }

    if (typeof is_public === "boolean") {
      queryText += ` AND b.is_public = $${paramIndex}`;
      params.push(is_public);
      paramIndex++;
    }

    queryText += ` ORDER BY b.created_at DESC LIMIT $${paramIndex} OFFSET $${
      paramIndex + 1
    }`;
    params.push(limit, offset);

    const result = await pool.query(queryText, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM banners.banners b
      WHERE 1=1
    `;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (status) {
      countQuery += ` AND b.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (restaurant_id) {
      countQuery += ` AND b.restaurant_id = $${countParamIndex}`;
      countParams.push(restaurant_id);
      countParamIndex++;
    }

    if (typeof is_public === "boolean") {
      countQuery += ` AND b.is_public = $${countParamIndex}`;
      countParams.push(is_public);
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
router.get(
  "/banners/:id",
  authenticate,
  authorize("admin"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, r.name as restaurant_name, r.user_id as restaurant_owner_id
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
router.patch(
  "/banners/:id/quote",
  authenticate,
  authorize("admin"),
  [
    commonValidators.uuid("id"),
    body("quote_amount")
      .isFloat({ min: 0 })
      .withMessage("quote_amount must be a non-negative number"),
    body("quote_currency")
      .optional()
      .trim()
      .isString()
      .isLength({ min: 3, max: 10 })
      .withMessage("quote_currency must be between 3 and 10 characters"),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const { quote_amount, quote_currency = "USD" } = req.body;

    // Check current status
    const bannerResult = await pool.query(
      "SELECT status FROM banners.banners WHERE id = $1",
      [id]
    );

    if (bannerResult.rows.length === 0) {
      throw new NotFoundError("Banner not found");
    }

    if (bannerResult.rows[0].status !== "requested") {
      throw new ValidationError(
        "Banner must be in 'requested' status to set quote. Current status: " +
          bannerResult.rows[0].status
      );
    }

    // Update banner with quote
    const updateResult = await pool.query(
      `UPDATE banners.banners 
       SET quote_amount = $1, quote_currency = $2, status = 'quoted'
       WHERE id = $3
       RETURNING *`,
      [quote_amount, quote_currency, id]
    );

    req.logger?.info(
      {
        bannerId: id,
        quoteAmount: quote_amount,
        quoteCurrency: quote_currency,
      },
      "Banner quote set by admin"
    );

    return sendSuccess(res, { banner: updateResult.rows[0] });
  })
);
router.patch(
  "/banners/:id/public",
  authenticate,
  authorize("admin"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check if banner exists and is approved
    const bannerResult = await pool.query(
      "SELECT status, is_public FROM banners.banners WHERE id = $1",
      [id]
    );

    if (bannerResult.rows.length === 0) {
      throw new NotFoundError("Banner not found");
    }

    const banner = bannerResult.rows[0];

    if (banner.status !== "approved") {
      throw new ValidationError(
        "Only approved banners can be marked public. Current status: " +
          banner.status
      );
    }

    // Update banner to public
    const updateResult = await pool.query(
      `UPDATE banners.banners 
       SET is_public = true, public_at = COALESCE(public_at, CURRENT_TIMESTAMP)
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    req.logger?.info(
      { bannerId: id, adminId: req.user!.id },
      "Banner marked as public by admin"
    );

    return sendSuccess(res, { banner: updateResult.rows[0] });
  })
);
router.patch(
  "/banners/:id/unpublic",
  authenticate,
  authorize("admin"),
  [commonValidators.uuid("id")],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check if banner exists
    const bannerResult = await pool.query(
      "SELECT id FROM banners.banners WHERE id = $1",
      [id]
    );

    if (bannerResult.rows.length === 0) {
      throw new NotFoundError("Banner not found");
    }

    // Update banner to not public
    const updateResult = await pool.query(
      `UPDATE banners.banners 
       SET is_public = false
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    req.logger?.info(
      { bannerId: id, adminId: req.user!.id },
      "Banner marked as not public by admin"
    );

    return sendSuccess(res, { banner: updateResult.rows[0] });
  })
);

export default router;
