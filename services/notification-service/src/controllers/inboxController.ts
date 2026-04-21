import { Request, Response } from 'express';
import * as Notification from '../models/Notification';

interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export async function listNotifications(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const [rows, unread] = await Promise.all([
      Notification.list(userId, { limit, offset }),
      Notification.countUnread(userId),
    ]);

    res.status(200).json({
      success: true,
      status: 'OK',
      message: 'Notifications fetched',
      data: {
        notifications: rows,
        unread_count: unread,
        pagination: { page, limit },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: 'ERROR', message: err instanceof Error ? err.message : 'Failed', data: null });
  }
}

export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ok = await Notification.markRead(req.params.id as string, req.user!.id);
    if (!ok) {
      res.status(404).json({ success: false, status: 'ERROR', message: 'Notification not found', data: null });
      return;
    }
    res.status(200).json({ success: true, status: 'OK', message: 'Marked as read', data: null });
  } catch (err) {
    res.status(500).json({ success: false, status: 'ERROR', message: err instanceof Error ? err.message : 'Failed', data: null });
  }
}

export async function markAllRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    await Notification.markAllRead(req.user!.id);
    res.status(200).json({ success: true, status: 'OK', message: 'All notifications marked as read', data: null });
  } catch (err) {
    res.status(500).json({ success: false, status: 'ERROR', message: err instanceof Error ? err.message : 'Failed', data: null });
  }
}
