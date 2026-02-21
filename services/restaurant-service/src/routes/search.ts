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
