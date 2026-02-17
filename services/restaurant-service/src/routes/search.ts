import express, { Response } from 'express';
import { query } from 'express-validator';
import { sendSuccess } from 'shared/api-response/index';
import { validateRequest } from 'shared/validation/index';
import {
  asyncHandler,
  ValidationError,
  RequestWithLogger,
  createFieldError,
} from 'shared/error-handler/index';
import { searchRestaurants, searchMenuItems } from '../utils/elasticsearch';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     SearchResult:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             type: object
 *         total:
 *           type: integer
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         totalPages:
 *           type: integer
 * tags:
 *   - name: Search
 *     description: Search endpoints using Elasticsearch (no authentication required)
 */

/**
 * @swagger
 * /search/restaurants:
 *   get:
 *     summary: Search restaurants
 *     description: Searches for active and open restaurants using Elasticsearch. No authentication required.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
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
 *         description: Search results
 *       400:
 *         description: Validation error
 */
router.get(
  '/restaurants',
  [
    query('q').notEmpty().withMessage('Search query (q) is required'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const queryText = req.query.q as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!queryText || queryText.trim().length === 0) {
      throw new ValidationError('Validation failed', [
        createFieldError('query', 'Search query cannot be empty'),
      ]);
    }

    const result = await searchRestaurants(queryText.trim(), limit, offset);

    return sendSuccess(res, {
      restaurants: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
      query: queryText,
    });
  })
);

/**
 * @swagger
 * /search/menu-items:
 *   get:
 *     summary: Search menu items
 *     description: Searches for available menu items using Elasticsearch. No authentication required.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: restaurant_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by restaurant ID (optional)
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
 *         description: Search results
 *       400:
 *         description: Validation error
 */
router.get(
  '/menu-items',
  [
    query('q').notEmpty().withMessage('Search query (q) is required'),
    query('restaurant_id').optional().isUUID().withMessage('restaurant_id must be a valid UUID'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  validateRequest,
  asyncHandler(async (req: RequestWithLogger, res: Response) => {
    const queryText = req.query.q as string;
    const restaurantId = req.query.restaurant_id as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!queryText || queryText.trim().length === 0) {
      throw new ValidationError('Validation failed', [
        createFieldError('query', 'Search query cannot be empty'),
      ]);
    }

    const result = await searchMenuItems(queryText.trim(), restaurantId, limit, offset);

    return sendSuccess(res, {
      menuItems: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
      query: queryText,
      restaurantId: restaurantId || null,
    });
  })
);

export default router;
