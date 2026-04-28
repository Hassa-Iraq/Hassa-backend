import pool from "../db/connection";

export type PayoutStatus = "pending" | "approved" | "rejected";

export interface PayoutRow {
  id: string;
  wallet_id: string;
  user_id: string;
  amount: string;
  bank_details: Record<string, unknown> | null;
  status: PayoutStatus;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  transaction_id: string | null;
  created_at: Date;
  updated_at: Date;
  requester_name: string | null;
  requester_phone: string | null;
  requester_role: string | null;
  restaurant_name: string | null;
}

export async function create(params: {
  walletId: string;
  userId: string;
  amount: number;
  bankDetails?: Record<string, unknown>;
  transactionId: string;
}): Promise<PayoutRow> {
  const r = await pool.query<PayoutRow>(
    `INSERT INTO wallet.payouts
       (wallet_id, user_id, amount, bank_details, transaction_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.walletId,
      params.userId,
      params.amount,
      params.bankDetails ? JSON.stringify(params.bankDetails) : null,
      params.transactionId,
    ]
  );
  return r.rows[0];
}

export async function findById(id: string): Promise<PayoutRow | null> {
  const r = await pool.query<PayoutRow>(
    "SELECT * FROM wallet.payouts WHERE id = $1",
    [id]
  );
  return r.rows[0] ?? null;
}

export async function listByUserId(
  userId: string,
  opts: { limit: number; offset: number }
): Promise<PayoutRow[]> {
  const r = await pool.query<PayoutRow>(
    `SELECT * FROM wallet.payouts WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, opts.limit, opts.offset]
  );
  return r.rows;
}

export async function countByUserId(userId: string): Promise<number> {
  const r = await pool.query<{ total: number }>(
    "SELECT COUNT(*)::int AS total FROM wallet.payouts WHERE user_id = $1",
    [userId]
  );
  return r.rows[0]?.total ?? 0;
}

export async function listAll(opts: {
  limit: number;
  offset: number;
  status?: PayoutStatus;
  role?: string;
}): Promise<PayoutRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`p.status = $${i++}`);
    values.push(opts.status);
  }
  if (opts.role) {
    conditions.push(`ro.name = $${i++}`);
    values.push(opts.role);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(opts.limit, opts.offset);
  const r = await pool.query<PayoutRow>(
    `SELECT p.*,
       u.full_name                AS requester_name,
       u.phone                    AS requester_phone,
       ro.name                    AS requester_role,
       res.name                   AS restaurant_name
     FROM wallet.payouts p
     JOIN auth.users u   ON u.id = p.user_id
     JOIN auth.roles ro  ON ro.id = u.role_id
     LEFT JOIN restaurant.restaurants res ON res.user_id = p.user_id
     ${where}
     ORDER BY p.created_at DESC LIMIT $${i++} OFFSET $${i}`,
    values
  );
  return r.rows;
}

export async function countAll(status?: PayoutStatus, role?: string): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (status) { conditions.push(`p.status = $${i++}`); values.push(status); }
  if (role) { conditions.push(`ro.name = $${i++}`); values.push(role); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const r = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM wallet.payouts p
     JOIN auth.users u  ON u.id = p.user_id
     JOIN auth.roles ro ON ro.id = u.role_id
     ${where}`,
    values
  );
  return r.rows[0]?.total ?? 0;
}

export async function updateStatus(
  id: string,
  status: PayoutStatus,
  reviewedBy: string,
  note?: string
): Promise<PayoutRow | null> {
  const r = await pool.query<PayoutRow>(
    `UPDATE wallet.payouts
     SET status = $1, reviewed_by = $2, reviewed_at = NOW(), note = COALESCE($3, note)
     WHERE id = $4
     RETURNING *`,
    [status, reviewedBy, note ?? null, id]
  );
  return r.rows[0] ?? null;
}

export function toResponse(payout: PayoutRow): Record<string, unknown> {
  return {
    id: payout.id,
    wallet_id: payout.wallet_id,
    user_id: payout.user_id,
    requester_name: payout.requester_name ?? null,
    requester_phone: payout.requester_phone ?? null,
    requester_role: payout.requester_role ?? null,
    restaurant_name: payout.restaurant_name ?? null,
    amount: parseFloat(payout.amount),
    bank_details: payout.bank_details,
    status: payout.status,
    note: payout.note,
    reviewed_by: payout.reviewed_by,
    reviewed_at: payout.reviewed_at,
    requested_at: payout.created_at,
    updated_at: payout.updated_at,
  };
}
