import express, { Response } from 'express';
import { body, query } from 'express-validator';
import { sendSuccess, HTTP_STATUS } from 'shared/api-response/index';
import { validateRequest, commonValidators } from 'shared/validation/index';
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  RequestWithLogger,
  createFieldError,
} from 'shared/error-handler/index';
import pool from '../db/connection';
import { authenticate, authorize } from '../middleware/auth';
import { cache, cacheKeys } from '../utils/redis';
import { indexMenuItem, deleteMenuItemFromIndex } from '../utils/elasticsearch';
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
 *     MenuItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         restaurant_id:
 *           type: string
 *           format: uuid
 *         category_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         price:
 *           type: number
 *           format: decimal
 *         image_url:
 *           type: string
 *         is_available:
 *           type: boolean
 *         prep_time_minutes:
 *           type: integer
 *           description: Item preparation estimated time in minutes
 *         discount_type:
 *           type: string
 *           enum: [fixed, percentage]
 *           description: Discount type - 'fixed' or 'percentage'
 *         discount_value:
 *           type: number
 *           format: decimal
 *           description: Discount value (fixed amount or percentage)
 *         max_purchase_quantity:
 *           type: integer
 *           description: Maximum purchase quantity limit
 *         stock_type:
 *           type: string
 *           enum: [unlimited, limited, daily]
 *           description: Stock management type
 *           default: unlimited
 *         stock:
 *           type: integer
 *           description: Current stock quantity (null for unlimited)
 *         search_tags:
 *           type: string
 *           description: Comma separated search tags
 *         available_start_time:
 *           type: string
 *           format: time
 *           description: Available start time (HH:MM:SS)
 *         available_end_time:
 *           type: string
 *           format: time
 *           description: Available end time (HH:MM:SS)
 *         food_type:
 *           type: string
 *           enum: [veg, non_veg]
 *           description: Food type - 'veg' or 'non_veg'
 *           default: veg
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateMenuItemRequest:
 *       type: object
 *       required:
 *         - restaurant_id
 *         - name
 *         - price
 *       properties:
 *         restaurant_id:
 *           type: string
 *           format: uuid
 *         category_id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *         price:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *         image_url:
 *           type: string
 *           maxLength: 500
 *         is_available:
 *           type: boolean
 *           default: true
 *         prep_time_minutes:
 *           type: integer
 *           minimum: 1
 *           description: Item preparation estimated time in minutes
 *         discount_type:
 *           type: string
 *           enum: [fixed, percentage]
 *           description: Discount type - 'fixed' or 'percentage'
 *         discount_value:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           description: Discount value (fixed amount or percentage)
 *         max_purchase_quantity:
 *           type: integer
 *           minimum: 1
 *           description: Maximum purchase quantity limit
 *         stock_type:
 *           type: string
 *           enum: [unlimited, limited, daily]
 *           description: Stock management type
 *           default: unlimited
 *         stock:
 *           type: integer
 *           minimum: 0
 *           description: Current stock quantity (null for unlimited)
 *         search_tags:
 *           type: string
 *           description: Comma separated search tags
 *         available_start_time:
 *           type: string
 *           format: time
 *           description: Available start time (HH:MM:SS)
 *         available_end_time:
 *           type: string
 *           format: time
 *           description: Available end time (HH:MM:SS)
 *         food_type:
 *           type: string
 *           enum: [veg, non_veg]
 *           description: Food type - 'veg' or 'non_veg'
 *           default: veg
 *     UpdateMenuItemRequest:
 *       type: object
 *       properties:
 *         category_id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *         description:
 *           type: string
 *         price:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *         image_url:
 *           type: string
 *           maxLength: 500
 *         is_available:
 *           type: boolean
 *         prep_time_minutes:
 *           type: integer
 *           minimum: 1
 *         discount_type:
 *           type: string
 *           enum: [fixed, percentage]
 *         discount_value:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *         max_purchase_quantity:
 *           type: integer
 *           minimum: 1
 *         stock_type:
 *           type: string
 *           enum: [unlimited, limited, daily]
 *         stock:
 *           type: integer
 *           minimum: 0
 *         search_tags:
 *           type: string
 *         available_start_time:
 *           type: string
 *           format: time
 *         available_end_time:
 *           type: string
 *           format: time
 *         food_type:
 *           type: string
 *           enum: [veg, non_veg]
 * tags:
 *   - name: Menu Items
 *     description: Menu item management endpoints
 */

/**
 * @swagger
 * /menu-items:
 *   post:
 *     summary: Create menu item
 *     description: Creates a new menu item for a restaurant
 *     tags: [Menu Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMenuItemRequest'
 *     responses:
 *       201:
 *         description: Menu item created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Restaurant or category not found
 */
router.post(
  '/',
  authenticate,
  authorize('restaurant'),
  [
    body('restaurant_id').isUUID().withMessage('restaurant_id must be a valid UUID'),
    body('category_id').optional().isUUID().withMessage('category_id must be a valid UUID'),
    commonValidators.requiredString('name', 1, 255),
    commonValidators.optionalString('description'),
    body('price').isFloat({ min: 0 }).withMessage('price must be a non-negative number'),
    body('image_url').optional().isLength({ max: 500 }).withMessage('image_url must not exceed 500 characters'),
    commonValidators.boolean('is_available'),
    body('prep_time_minutes').optional().isInt({ min: 1 }).withMessage('prep_time_minutes must be a positive integer'),
    body('discount_type').optional().isIn(['fixed', 'percentage']).withMessage('discount_type must be either "fixed" or "percentage"'),
    body('discount_value').optional().isFloat({ min: 0 }).withMessage('discount_value must be a non-negative number'),
    body('max_purchase_quantity').optional().isInt({ min: 1 }).withMessage('max_purchase_quantity must be a positive integer'),
    body('stock_type').optional().isIn(['unlimited', 'limited', 'daily']).withMessage('stock_type must be "unlimited", "limited", or "daily"'),
    body('stock').optional().isInt({ min: 0 }).withMessage('stock must be a non-negative integer'),
    body('search_tags').optional().isString().withMessage('search_tags must be a string'),
    body('available_start_time').optional().matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).withMessage('available_start_time must be in HH:MM:SS format'),
    body('available_end_time').optional().matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).withMessage('available_end_time must be in HH:MM:SS format'),
    body('food_type').optional().isIn(['veg', 'non_veg']).withMessage('food_type must be either "veg" or "non_veg"'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { 
      restaurant_id, category_id, name, description, price, image_url, is_available,
      prep_time_minutes, discount_type, discount_value, max_purchase_quantity,
      stock_type, stock, search_tags, available_start_time, available_end_time, food_type
    } = req.body;
    const userId = req.user!.id;

    // Validate restaurant ownership
    await validateRestaurantOwnership(restaurant_id, userId);

    // Verify category exists if provided
    if (category_id) {
      const categoryResult = await pool.query(
        'SELECT id FROM restaurant.menu_categories WHERE id = $1 AND restaurant_id = $2',
        [category_id, restaurant_id]
      );

      if (categoryResult.rows.length === 0) {
        throw new NotFoundError('Menu category not found or does not belong to this restaurant');
      }
    }

    // Validate discount settings: both type and value must be provided together
    if ((discount_type && !discount_value) || (!discount_type && discount_value)) {
      throw new ValidationError('Validation failed', [
        createFieldError('discount_type', 'Both discount_type and discount_value must be provided together, or both must be omitted'),
        createFieldError('discount_value', 'Both discount_type and discount_value must be provided together, or both must be omitted'),
      ]);
    }

    // Validate available time range: start_time must be before end_time
    if (available_start_time && available_end_time) {
      const startTime = new Date(`2000-01-01T${available_start_time}`);
      const endTime = new Date(`2000-01-01T${available_end_time}`);
      if (startTime >= endTime) {
        throw new ValidationError('Validation failed', [
          createFieldError('available_start_time', 'available_start_time must be before available_end_time'),
          createFieldError('available_end_time', 'available_end_time must be after available_start_time'),
        ]);
      }
    }

    // Handle stock settings: if stock_type is unlimited, stock must be null
    const finalStockType = stock_type || 'unlimited';
    const finalStock = finalStockType === 'unlimited' ? null : (stock || null);

    const result = await pool.query(
      `INSERT INTO restaurant.menu_items (
        restaurant_id, category_id, name, description, price, image_url, is_available,
        prep_time_minutes, discount_type, discount_value, max_purchase_quantity,
        stock_type, stock, search_tags, available_start_time, available_end_time, food_type
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        restaurant_id,
        category_id || null,
        name,
        description || null,
        price,
        image_url || null,
        is_available !== undefined ? is_available : true,
        prep_time_minutes || null,
        discount_type || null,
        discount_value || null,
        max_purchase_quantity || null,
        finalStockType,
        finalStock,
        search_tags || null,
        available_start_time || null,
        available_end_time || null,
        food_type || 'veg'
      ]
    );

    const menuItem = result.rows[0];

    // Index in Elasticsearch
    await indexMenuItem(menuItem);

    // Invalidate cache
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));

    req.logger?.info({ menuItemId: menuItem.id, restaurantId: restaurant_id }, 'Menu item created');

    return sendSuccess(
      res,
      { menuItem },
      'Menu item created successfully',
      HTTP_STATUS.CREATED
    );
  })
);

/**
 * @swagger
 * /menu-items:
 *   get:
 *     summary: List menu items
 *     description: Lists menu items for a restaurant with pagination
 *     tags: [Menu Items]
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
 *         name: category_id
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
 *         description: List of menu items
 */
router.get(
  '/',
  authenticate,
  authorize('restaurant'),
  [
    query('restaurant_id').isUUID().withMessage('restaurant_id must be a valid UUID'),
    query('category_id').optional().isUUID().withMessage('category_id must be a valid UUID'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const restaurant_id = req.query.restaurant_id as string;
    const category_id = req.query.category_id as string | undefined;
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Validate restaurant ownership
    await validateRestaurantOwnership(restaurant_id, userId);

    let queryText = 'SELECT * FROM restaurant.menu_items WHERE restaurant_id = $1';
    const values: any[] = [restaurant_id];
    let paramIndex = 2;

    if (category_id) {
      queryText += ` AND category_id = $${paramIndex++}`;
      values.push(category_id);
    }

    queryText += ' ORDER BY created_at DESC LIMIT $' + paramIndex++ + ' OFFSET $' + paramIndex;
    values.push(limit, offset);

    const result = await pool.query(queryText, values);

    let countQuery = 'SELECT COUNT(*) as total FROM restaurant.menu_items WHERE restaurant_id = $1';
    const countValues: any[] = [restaurant_id];
    if (category_id) {
      countQuery += ' AND category_id = $2';
      countValues.push(category_id);
    }

    const countResult = await pool.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].total);

    return sendSuccess(res, {
      menuItems: result.rows,
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
 * /menu-items/{id}:
 *   get:
 *     summary: Get menu item by ID
 *     description: Returns menu item details by ID
 *     tags: [Menu Items]
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
 *         description: Menu item details
 *       404:
 *         description: Menu item not found
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

    // Get menu item and validate restaurant ownership
    const result = await pool.query(
      'SELECT * FROM restaurant.menu_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Menu item not found');
    }

    await validateRestaurantOwnership(result.rows[0].restaurant_id, userId);

    return sendSuccess(res, { menuItem: result.rows[0] });
  })
);

/**
 * @swagger
 * /menu-items/{id}:
 *   put:
 *     summary: Update menu item
 *     description: Updates menu item details
 *     tags: [Menu Items]
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
 *             $ref: '#/components/schemas/UpdateMenuItemRequest'
 *     responses:
 *       200:
 *         description: Menu item updated successfully
 *       404:
 *         description: Menu item not found
 */
router.put(
  '/:id',
  authenticate,
  authorize('restaurant'),
  [
    commonValidators.uuid('id'),
    body('category_id').optional().isUUID().withMessage('category_id must be a valid UUID'),
    commonValidators.optionalString('name', 255),
    commonValidators.optionalString('description'),
    body('price').optional().isFloat({ min: 0 }).withMessage('price must be a non-negative number'),
    body('image_url').optional().isLength({ max: 500 }).withMessage('image_url must not exceed 500 characters'),
    commonValidators.boolean('is_available'),
    body('prep_time_minutes').optional().isInt({ min: 1 }).withMessage('prep_time_minutes must be a positive integer'),
    body('discount_type').optional().isIn(['fixed', 'percentage']).withMessage('discount_type must be either "fixed" or "percentage"'),
    body('discount_value').optional().isFloat({ min: 0 }).withMessage('discount_value must be a non-negative number'),
    body('max_purchase_quantity').optional().isInt({ min: 1 }).withMessage('max_purchase_quantity must be a positive integer'),
    body('stock_type').optional().isIn(['unlimited', 'limited', 'daily']).withMessage('stock_type must be "unlimited", "limited", or "daily"'),
    body('stock').optional().isInt({ min: 0 }).withMessage('stock must be a non-negative integer'),
    body('search_tags').optional().isString().withMessage('search_tags must be a string'),
    body('available_start_time').optional().matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).withMessage('available_start_time must be in HH:MM:SS format'),
    body('available_end_time').optional().matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).withMessage('available_end_time must be in HH:MM:SS format'),
    body('food_type').optional().isIn(['veg', 'non_veg']).withMessage('food_type must be either "veg" or "non_veg"'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const { id } = req.params;
    const { 
      category_id, name, description, price, image_url, is_available,
      prep_time_minutes, discount_type, discount_value, max_purchase_quantity,
      stock_type, stock, search_tags, available_start_time, available_end_time, food_type
    } = req.body;
    const userId = req.user!.id;

    // Check if menu item exists and validate ownership
    const existingResult = await pool.query(
      'SELECT restaurant_id FROM restaurant.menu_items WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Menu item not found');
    }

    const restaurant_id = existingResult.rows[0].restaurant_id;
    await validateRestaurantOwnership(restaurant_id, userId);

    // Verify category if provided
    if (category_id) {
      const categoryResult = await pool.query(
        'SELECT id FROM restaurant.menu_categories WHERE id = $1 AND restaurant_id = $2',
        [category_id, restaurant_id]
      );

      if (categoryResult.rows.length === 0) {
        throw new NotFoundError('Menu category not found or does not belong to this restaurant');
      }
    }

    // Get current values for validation
    const currentResult = await pool.query(
      'SELECT discount_type, discount_value, stock_type, available_start_time, available_end_time FROM restaurant.menu_items WHERE id = $1',
      [id]
    );
    const current = currentResult.rows[0];

    // Validate discount settings: both type and value must be provided together
    const finalDiscountType = discount_type !== undefined ? discount_type : current.discount_type;
    const finalDiscountValue = discount_value !== undefined ? discount_value : current.discount_value;
    
    if ((finalDiscountType && !finalDiscountValue) || (!finalDiscountType && finalDiscountValue)) {
      throw new ValidationError('Validation failed', [
        createFieldError('discount_type', 'Both discount_type and discount_value must be provided together, or both must be cleared'),
        createFieldError('discount_value', 'Both discount_type and discount_value must be provided together, or both must be cleared'),
      ]);
    }

    // Validate available time range: start_time must be before end_time
    const finalStartTime = available_start_time !== undefined ? available_start_time : current.available_start_time;
    const finalEndTime = available_end_time !== undefined ? available_end_time : current.available_end_time;
    
    if (finalStartTime && finalEndTime) {
      const startTime = new Date(`2000-01-01T${finalStartTime}`);
      const endTime = new Date(`2000-01-01T${finalEndTime}`);
      if (startTime >= endTime) {
        throw new ValidationError('Validation failed', [
          createFieldError('available_start_time', 'available_start_time must be before available_end_time'),
          createFieldError('available_end_time', 'available_end_time must be after available_start_time'),
        ]);
      }
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (category_id !== undefined) {
      updates.push(`category_id = $${paramIndex++}`);
      values.push(category_id);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(price);
    }
    if (image_url !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(image_url);
    }
    if (is_available !== undefined) {
      updates.push(`is_available = $${paramIndex++}`);
      values.push(is_available);
    }
    if (prep_time_minutes !== undefined) {
      updates.push(`prep_time_minutes = $${paramIndex++}`);
      values.push(prep_time_minutes);
    }
    // Handle discount settings: both must be set together or both cleared
    if (discount_type !== undefined || discount_value !== undefined) {
      // If one is null, both should be null (clearing discount)
      if (discount_type === null || discount_value === null) {
        updates.push(`discount_type = $${paramIndex++}`);
        values.push(null);
        updates.push(`discount_value = $${paramIndex++}`);
        values.push(null);
      } else if (discount_type !== undefined && discount_value !== undefined) {
        // Both provided - update both
        updates.push(`discount_type = $${paramIndex++}`);
        values.push(discount_type);
        updates.push(`discount_value = $${paramIndex++}`);
        values.push(discount_value);
      }
      // If only one is provided (and not null), validation above will catch it
    }
    
    if (max_purchase_quantity !== undefined) {
      updates.push(`max_purchase_quantity = $${paramIndex++}`);
      values.push(max_purchase_quantity);
    }
    
    // Handle stock settings: if stock_type is unlimited, stock must be null
    const finalStockType = stock_type !== undefined ? stock_type : current.stock_type;
    if (stock_type !== undefined) {
      updates.push(`stock_type = $${paramIndex++}`);
      values.push(stock_type);
    }
    if (stock !== undefined) {
      if (finalStockType === 'unlimited') {
        updates.push(`stock = $${paramIndex++}`);
        values.push(null);
      } else {
        updates.push(`stock = $${paramIndex++}`);
        values.push(stock);
      }
    } else if (stock_type === 'unlimited') {
      // If changing to unlimited, clear stock
      updates.push(`stock = $${paramIndex++}`);
      values.push(null);
    }
    if (search_tags !== undefined) {
      updates.push(`search_tags = $${paramIndex++}`);
      values.push(search_tags);
    }
    if (available_start_time !== undefined) {
      updates.push(`available_start_time = $${paramIndex++}`);
      values.push(available_start_time);
    }
    if (available_end_time !== undefined) {
      updates.push(`available_end_time = $${paramIndex++}`);
      values.push(available_end_time);
    }
    if (food_type !== undefined) {
      updates.push(`food_type = $${paramIndex++}`);
      values.push(food_type);
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE restaurant.menu_items 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    const menuItem = result.rows[0];

    // Update Elasticsearch index
    await indexMenuItem(menuItem);

    // Invalidate cache
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));
    await cache.del(cacheKeys.menuItem(id));

    req.logger?.info({ menuItemId: id }, 'Menu item updated');

    return sendSuccess(res, { menuItem }, 'Menu item updated successfully');
  })
);

/**
 * @swagger
 * /menu-items/{id}:
 *   delete:
 *     summary: Delete menu item
 *     description: Deletes a menu item
 *     tags: [Menu Items]
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
 *         description: Menu item deleted successfully
 *       404:
 *         description: Menu item not found
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
      'SELECT restaurant_id FROM restaurant.menu_items WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      throw new NotFoundError('Menu item not found');
    }

    const restaurant_id = existingResult.rows[0].restaurant_id;
    await validateRestaurantOwnership(restaurant_id, userId);

    await pool.query(
      'DELETE FROM restaurant.menu_items WHERE id = $1',
      [id]
    );

    // Delete from Elasticsearch
    await deleteMenuItemFromIndex(id);

    // Invalidate cache
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));
    await cache.del(cacheKeys.menuItem(id));

    req.logger?.info({ menuItemId: id }, 'Menu item deleted');

    return sendSuccess(res, {}, 'Menu item deleted successfully');
  })
);

export default router;
