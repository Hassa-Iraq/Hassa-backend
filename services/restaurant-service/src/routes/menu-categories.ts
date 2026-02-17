import express, { Response } from 'express';
import { body, query } from 'express-validator';
import { sendSuccess, HTTP_STATUS } from 'shared/api-response/index';
import { validateRequest, commonValidators } from 'shared/validation/index';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  RequestWithLogger,
} from 'shared/error-handler/index';
import pool from '../db/connection';
import { authenticate, authorize } from '../middleware/auth';
import { cache, cacheKeys } from '../utils/redis';
import { ForbiddenError } from 'shared/error-handler/index';

const router = express.Router();

/**
 * Helper function to validate restaurant ownership
 */
async function validateRestaurantOwnership(restaurantId: string, userId: string): Promise<void> {
  const result = await pool.query(
    'SELECT user_id FROM restaurant.restaurants WHERE id = $1',
    [restaurantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Restaurant not found');
  }

  if (result.rows[0].user_id !== userId) {
    throw new ForbiddenError('You do not have permission to manage this restaurant');
  }
}

/**
 * @swagger
 * components:
 *   schemas:
 *     MenuCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         restaurant_id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         display_order:
 *           type: integer
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateMenuCategoryRequest:
 *       type: object
 *       required:
 *         - restaurant_id
 *         - name
 *       properties:
 *         restaurant_id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *         display_order:
 *           type: integer
 *           minimum: 0
 *     UpdateMenuCategoryRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *         display_order:
 *           type: integer
 *           minimum: 0
 *         is_active:
 *           type: boolean
 * tags:
 *   - name: Menu Categories
 *     description: Menu category management endpoints
 */

/**
 * @swagger
 * /menu-categories:
 *   post:
 *     summary: Create menu category
 *     description: Creates a new menu category for a restaurant
 *     tags: [Menu Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMenuCategoryRequest'
 *     responses:
 *       201:
 *         description: Menu category created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Restaurant not found
 */
router.post(
  '/',
  authenticate,
  authorize('restaurant'),
  [
    body('restaurant_id').isUUID().withMessage('restaurant_id must be a valid UUID'),
    commonValidators.requiredString('name', 1, 255),
    commonValidators.optionalString('description'),
    body('display_order').optional().isInt({ min: 0 }).withMessage('display_order must be a non-negative integer'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { restaurant_id, name, description, display_order } = req.body;
    const userId = req.user!.id;

    // Validate restaurant ownership
    await validateRestaurantOwnership(restaurant_id, userId);

    // Get max display_order if not provided
    let order = display_order;
    if (order === undefined) {
      const maxOrderResult = await pool.query(
        'SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM restaurant.menu_categories WHERE restaurant_id = $1',
        [restaurant_id]
      );
      order = maxOrderResult.rows[0].next_order;
    }

    const result = await pool.query(
      `INSERT INTO restaurant.menu_categories (restaurant_id, name, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [restaurant_id, name, description || null, order, true]
    );

    const category = result.rows[0];

    // Invalidate cache
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));

    req.logger?.info({ categoryId: category.id, restaurantId: restaurant_id }, 'Menu category created');

    return sendSuccess(
      res,
      { category },
      'Menu category created successfully',
      HTTP_STATUS.CREATED
    );
  })
);

/**
 * @swagger
 * /menu-categories:
 *   get:
 *     summary: List menu categories
 *     description: Lists menu categories for a restaurant with pagination
 *     tags: [Menu Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: restaurant_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *         description: List of menu categories
 */
router.get(
  '/',
  authenticate,
  authorize('restaurant'),
  [
    query('restaurant_id').isUUID().withMessage('restaurant_id must be a valid UUID'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const restaurant_id = req.query.restaurant_id as string;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Validate restaurant ownership
    await validateRestaurantOwnership(restaurant_id, userId);

    const result = await pool.query(
      `SELECT * FROM restaurant.menu_categories 
       WHERE restaurant_id = $1 
       ORDER BY display_order ASC, created_at ASC
       LIMIT $2 OFFSET $3`,
      [restaurant_id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM restaurant.menu_categories WHERE restaurant_id = $1',
      [restaurant_id]
    );

    const total = parseInt(countResult.rows[0].total);

    return sendSuccess(res, {
      categories: result.rows,
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
 * /menu-categories/{id}:
 *   get:
 *     summary: Get menu category by ID
 *     description: Returns menu category details by ID
 *     tags: [Menu Categories]
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
 *         description: Menu category details
 *       404:
 *         description: Menu category not found
 */
router.get(
  '/:id',
  authenticate,
  authorize('restaurant'),
  [commonValidators.uuid('id')],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get category and validate restaurant ownership
    const categoryResult = await pool.query(
      'SELECT * FROM restaurant.menu_categories WHERE id = $1',
      [id]
    );

    if (categoryResult.rows.length === 0) {
      throw new NotFoundError('Menu category not found');
    }

    await validateRestaurantOwnership(categoryResult.rows[0].restaurant_id, userId);

    return sendSuccess(res, { category: categoryResult.rows[0] });
  })
);

/**
 * @swagger
 * /menu-categories/{id}:
 *   put:
 *     summary: Update menu category
 *     description: Updates menu category details
 *     tags: [Menu Categories]
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
 *             $ref: '#/components/schemas/UpdateMenuCategoryRequest'
 *     responses:
 *       200:
 *         description: Menu category updated successfully
 *       404:
 *         description: Menu category not found
 */
router.put(
  '/:id',
  authenticate,
  authorize('restaurant'),
  [
    commonValidators.uuid('id'),
    commonValidators.optionalString('name', 255),
    commonValidators.optionalString('description'),
    body('display_order').optional().isInt({ min: 0 }).withMessage('display_order must be a non-negative integer'),
    commonValidators.boolean('is_active'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const { name, description, display_order, is_active } = req.body;
    const userId = req.user!.id;

    // Check if category exists and validate ownership
    const existingResult = await pool.query(
      'SELECT restaurant_id FROM restaurant.menu_categories WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Menu category not found');
    }

    const restaurant_id = existingResult.rows[0].restaurant_id;
    await validateRestaurantOwnership(restaurant_id, userId);

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (display_order !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(display_order);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE restaurant.menu_categories 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    const category = result.rows[0];

    // Invalidate cache
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));

    req.logger?.info({ categoryId: id }, 'Menu category updated');

    return sendSuccess(res, { category }, 'Menu category updated successfully');
  })
);

/**
 * @swagger
 * /menu-categories/{id}:
 *   delete:
 *     summary: Delete menu category
 *     description: Deletes a menu category. Menu items in this category will have category_id set to NULL.
 *     tags: [Menu Categories]
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
 *         description: Menu category deleted successfully
 *       404:
 *         description: Menu category not found
 */
router.delete(
  '/:id',
  authenticate,
  authorize('restaurant'),
  [commonValidators.uuid('id')],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get restaurant_id before deleting and validate ownership
    const existingResult = await pool.query(
      'SELECT restaurant_id FROM restaurant.menu_categories WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Menu category not found');
    }

    const restaurant_id = existingResult.rows[0].restaurant_id;
    await validateRestaurantOwnership(restaurant_id, userId);

    await pool.query(
      'DELETE FROM restaurant.menu_categories WHERE id = $1',
      [id]
    );

    // Invalidate cache
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));

    req.logger?.info({ categoryId: id }, 'Menu category deleted');

    return sendSuccess(res, {}, 'Menu category deleted successfully');
  })
);

export default router;
