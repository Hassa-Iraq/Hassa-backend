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
}): Promise<PayoutRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`status = $${i++}`);
    values.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(opts.limit, opts.offset);
  const r = await pool.query<PayoutRow>(
    `SELECT * FROM wallet.payouts ${where}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    values
  );
  return r.rows;
}

export async function countAll(status?: PayoutStatus): Promise<number> {
  const r = status
    ? await pool.query<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM wallet.payouts WHERE status = $1",
        [status]
      )
    : await pool.query<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM wallet.payouts"
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
    amount: parseFloat(payout.amount),
    bank_details: payout.bank_details,
    status: payout.status,
    note: payout.note,
    reviewed_by: payout.reviewed_by,
    reviewed_at: payout.reviewed_at,
    created_at: payout.created_at,
    updated_at: payout.updated_at,
  };
}
