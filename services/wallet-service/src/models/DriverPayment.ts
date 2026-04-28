import pool from "../db/connection";

export interface DriverPaymentRow {
  id: string;
  driver_user_id: string;
  amount: string;
  method: string;
  reference: string | null;
  note: string | null;
  status: string;
  created_by_admin_id: string;
  paid_by_admin_id: string | null;
  paid_at: Date | null;
  created_at: Date;
  driver_name: string | null;
  driver_phone: string | null;
}

export async function create(params: {
  driver_user_id: string;
  amount: number;
  method: string;
  reference?: string | null;
  note?: string | null;
  created_by_admin_id: string;
}): Promise<DriverPaymentRow> {
  const { rows } = await pool.query<DriverPaymentRow>(
    `INSERT INTO wallet.driver_payments
       (driver_user_id, amount, method, reference, note, created_by_admin_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      params.driver_user_id,
      params.amount,
      params.method,
      params.reference ?? null,
      params.note ?? null,
      params.created_by_admin_id,
    ]
  );
  return enrich(rows[0].id);
}

export async function findById(id: string): Promise<DriverPaymentRow | null> {
  return enrich(id);
}

async function enrich(id: string): Promise<DriverPaymentRow> {
  const { rows } = await pool.query<DriverPaymentRow>(
    `SELECT dp.*,
       COALESCE(u.full_name, u.phone) AS driver_name,
       u.phone                        AS driver_phone
     FROM wallet.driver_payments dp
     JOIN auth.users u ON u.id = dp.driver_user_id
     WHERE dp.id = $1`,
    [id]
  );
  return rows[0];
}

export async function markPaid(
  id: string,
  paidByAdminId: string
): Promise<DriverPaymentRow | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE wallet.driver_payments
     SET status = 'paid', paid_by_admin_id = $1, paid_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING id`,
    [paidByAdminId, id]
  );
  if (!rows[0]) return null;
  return enrich(rows[0].id);
}

export async function list(params: {
  limit: number;
  offset: number;
  status?: string;
  driver_user_id?: string;
  search?: string;
}): Promise<DriverPaymentRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`dp.status = $${values.push(params.status)}`);
  if (params.driver_user_id) conditions.push(`dp.driver_user_id = $${values.push(params.driver_user_id)}`);
  if (params.search) conditions.push(`(dp.reference ILIKE $${values.push(`%${params.search}%`)} OR dp.method ILIKE $${values.length})`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<DriverPaymentRow>(
    `SELECT dp.*,
       COALESCE(u.full_name, u.phone) AS driver_name,
       u.phone                        AS driver_phone
     FROM wallet.driver_payments dp
     JOIN auth.users u ON u.id = dp.driver_user_id
     ${where}
     ORDER BY dp.created_at DESC
     LIMIT $${values.push(params.limit)} OFFSET $${values.push(params.offset)}`,
    values
  );
  return rows;
}

export async function count(params: {
  status?: string;
  driver_user_id?: string;
  search?: string;
}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.status) conditions.push(`status = $${values.push(params.status)}`);
  if (params.driver_user_id) conditions.push(`driver_user_id = $${values.push(params.driver_user_id)}`);
  if (params.search) conditions.push(`reference ILIKE $${values.push(`%${params.search}%`)}`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM wallet.driver_payments ${where}`,
    values
  );
  return parseInt(rows[0].total);
}

export function toResponse(row: DriverPaymentRow) {
  return {
    id: row.id,
    driver_user_id: row.driver_user_id,
    driver_name: row.driver_name ?? null,
    driver_phone: row.driver_phone ?? null,
    amount: parseFloat(row.amount),
    method: row.method,
    reference: row.reference ?? null,
    note: row.note ?? null,
    status: row.status,
    created_by_admin_id: row.created_by_admin_id,
    paid_by_admin_id: row.paid_by_admin_id ?? null,
    paid_at: row.paid_at ?? null,
    created_at: row.created_at,
  };
}
