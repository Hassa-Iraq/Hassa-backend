import express, { Response } from 'express';
import { query } from 'express-validator';
import { sendSuccess } from 'shared/api-response/index';
import { validateRequest, commonValidators } from 'shared/validation/index';
import {
  asyncHandler,
  NotFoundError,
  RequestWithLogger,
} from 'shared/error-handler/index';
import pool from '../db/connection';
import { cache, cacheKeys } from '../utils/redis';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PublicRestaurant:
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
 *         is_open:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 * tags:
 *   - name: Discovery
 *     description: Public restaurant discovery endpoints (no authentication required)
 */

/**
 * @swagger
 * /discover/restaurants:
 *   get:
 *     summary: List active and open restaurants
 *     description: Returns a paginated list of active and open restaurants. No authentication required.
 *     tags: [Discovery]
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
 *         description: List of restaurants
 */
router.get(
  '/restaurants',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Check cache
    const cacheKey = cacheKeys.restaurantList(page, limit);
    const cached = await cache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    // Query only approved (active), not blocked, and open restaurants
    const result = await pool.query(
      `SELECT id, name, description, address, phone, email, is_open, created_at
       FROM restaurant.restaurants 
       WHERE is_active = true AND is_blocked = false AND is_open = true
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM restaurant.restaurants WHERE is_active = true AND is_blocked = false AND is_open = true'
    );

    const total = parseInt(countResult.rows[0].total);

    // Map email to contact_email in API response
    const restaurants = result.rows.map((restaurant: any) => {
      const { email, ...rest } = restaurant;
      return {
        ...rest,
        contact_email: email || null,
      };
    });

    const response = {
      restaurants,
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

/**
 * @swagger
 * /discover/restaurants/{id}:
 *   get:
 *     summary: Get restaurant details
 *     description: Returns details of an active and open restaurant. No authentication required.
 *     tags: [Discovery]
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
 *         description: Restaurant not found or not available
 */
router.get(
  '/restaurants/:id',
  [commonValidators.uuid('id')],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check cache
    const cacheKey = cacheKeys.restaurant(id);
    const cached = await cache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    // Query only approved (active), not blocked, and open restaurants
    const result = await pool.query(
      `SELECT id, name, description, address, phone, email, is_open, created_at
       FROM restaurant.restaurants 
       WHERE id = $1 AND is_active = true AND is_blocked = false AND is_open = true`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Restaurant not found or not available');
    }

    // Map email to contact_email in API response
    const { email, ...rest } = result.rows[0];
    const restaurant = {
      ...rest,
      contact_email: email || null,
    };

    const response = { restaurant };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    return sendSuccess(res, response);
  })
);

/**
 * @swagger
 * /discover/restaurants/{id}/menu:
 *   get:
 *     summary: Get restaurant menu
 *     description: Returns the menu (categories and items) of an active and open restaurant. No authentication required.
 *     tags: [Discovery]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Restaurant menu
 *       404:
 *         description: Restaurant not found or not available
 */
router.get(
  '/restaurants/:id/menu',
  [commonValidators.uuid('id')],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;

    // Check cache
    const cacheKey = cacheKeys.restaurantMenu(id);
    const cached = await cache.get(cacheKey);
    if (cached) {
      return sendSuccess(res, cached);
    }

    // Verify restaurant is active, not blocked, and open
    const restaurantResult = await pool.query(
      'SELECT id, name FROM restaurant.restaurants WHERE id = $1 AND is_active = true AND is_blocked = false AND is_open = true',
      [id]
    );

    if (restaurantResult.rows.length === 0) {
      throw new NotFoundError('Restaurant not found or not available');
    }

    // Get categories with items
    const categoriesResult = await pool.query(
      `SELECT c.*, 
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', mi.id,
                    'name', mi.name,
                    'description', mi.description,
                    'price', mi.price,
                    'image_url', mi.image_url,
                    'is_available', mi.is_available,
                    'prep_time_minutes', mi.prep_time_minutes,
                    'discount_type', mi.discount_type,
                    'discount_value', mi.discount_value,
                    'max_purchase_quantity', mi.max_purchase_quantity,
                    'stock_type', mi.stock_type,
                    'stock', mi.stock,
                    'search_tags', mi.search_tags,
                    'available_start_time', mi.available_start_time,
                    'available_end_time', mi.available_end_time,
                    'food_type', mi.food_type
                  ) ORDER BY mi.created_at
                ) FILTER (WHERE mi.id IS NOT NULL),
                '[]'::json
              ) as items
       FROM restaurant.menu_categories c
       LEFT JOIN restaurant.menu_items mi ON c.id = mi.category_id AND mi.is_available = true
       WHERE c.restaurant_id = $1 AND c.is_active = true
       GROUP BY c.id
       ORDER BY c.display_order ASC, c.created_at ASC`,
      [id]
    );

    // Get items without category
    const uncategorizedItemsResult = await pool.query(
      `SELECT id, name, description, price, image_url, is_available,
              prep_time_minutes, discount_type, discount_value, max_purchase_quantity,
              stock_type, stock, search_tags, available_start_time, available_end_time, food_type
       FROM restaurant.menu_items
       WHERE restaurant_id = $1 AND category_id IS NULL AND is_available = true
       ORDER BY created_at ASC`,
      [id]
    );

    const response = {
      restaurant: {
        id: restaurantResult.rows[0].id,
        name: restaurantResult.rows[0].name,
      },
      categories: categoriesResult.rows,
      uncategorizedItems: uncategorizedItemsResult.rows,
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    return sendSuccess(res, response);
  })
);

export default router;
