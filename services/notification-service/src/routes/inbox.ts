import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/index';
import * as inboxController from '../controllers/inboxController';

const router = express.Router();

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, status: 'ERROR', message: 'Unauthorized', data: null });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET) as { id: string; role: string };
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, status: 'ERROR', message: 'Invalid token', data: null });
  }
}

router.get('/notifications', authenticate, inboxController.listNotifications);
router.patch('/notifications/:id/read', authenticate, inboxController.markRead);
router.patch('/notifications/read-all', authenticate, inboxController.markAllRead);

export default router;
