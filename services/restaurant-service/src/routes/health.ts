import express, { Request, Response } from 'express';
import { sendSuccess } from 'shared/api-response/index';
import pool from '../db/connection';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     HealthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Success
 *         data:
 *           type: object
 *           properties:
 *             status:
 *               type: string
 *               example: healthy
 *             service:
 *               type: string
 *               example: restaurant-service
 *             timestamp:
 *               type: string
 *               format: date-time
 *             database:
 *               type: string
 *               example: connected
 * tags:
 *   - name: Health
 *     description: Service health check endpoints
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the service and database connection
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    
    return sendSuccess(res, {
      status: 'healthy',
      service: 'restaurant-service',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error: any) {
    return sendSuccess(res, {
      status: 'unhealthy',
      service: 'restaurant-service',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    }, 'Service unhealthy', 503);
  }
});

export default router;
