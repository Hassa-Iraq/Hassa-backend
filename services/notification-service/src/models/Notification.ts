import pool from '../db/connection';

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, unknown>;
  is_read: boolean;
  sent_at: Date;
  read_at: Date | null;
}

export async function create(input: {
  user_id: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}): Promise<NotificationRow> {
  const r = await pool.query(
    `INSERT INTO notification.notifications (user_id, title, body, type, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.user_id, input.title, input.body, input.type, JSON.stringify(input.data ?? {})]
  );
  return r.rows[0] as NotificationRow;
}

export async function list(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<NotificationRow[]> {
  const r = await pool.query(
    `SELECT * FROM notification.notifications
     WHERE user_id = $1
     ORDER BY sent_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, opts.limit, opts.offset]
  );
  return r.rows as NotificationRow[];
}

export async function countUnread(userId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total FROM notification.notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return r.rows[0]?.total ?? 0;
}

export async function markRead(id: string, userId: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE notification.notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function markAllRead(userId: string): Promise<void> {
  await pool.query(
    `UPDATE notification.notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
}

export async function getUserPushToken(userId: string): Promise<string | null> {
  const r = await pool.query(
    `SELECT push_token FROM auth.users WHERE id = $1`,
    [userId]
  );
  return (r.rows[0]?.push_token as string | null) ?? null;
}
