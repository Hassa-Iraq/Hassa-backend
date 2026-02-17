import express, { Request, Response } from 'express';
import { sendSuccess } from 'shared/api-response/index';
import pool from '../db/connection';

const router = express.Router();

router.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    
    return sendSuccess(res, {
      status: 'healthy',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error: any) {
    return sendSuccess(res, {
      status: 'unhealthy',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    }, 'Service unhealthy', 503);
  }
});

export default router;
