import pool from "../db/connection";

export interface PendingSummaryRow {
  entity_id: string;
  entity_name: string;
  entity_phone: string | null;
  entity_type: string;
  total_earned: string;
  total_collected: string;
  pending_balance: string;
}

export interface CashCollectionRow {
  id: string;
  collected_from_type: string;
  collected_from_user_id: string;
  amount: string;
  method: string;
  reference: string | null;
  note: string | null;
  collected_by_admin_id: string;
  created_at: string;
  entity_name: string | null;
  entity_phone: string | null;
}

// Pending balance for all drivers:
// total cash delivered - total already collected
export async function driverPendingSummary(): Promise<PendingSummaryRow[]> {
  const result = await pool.query<PendingSummaryRow>(
    `SELECT
       d.driver_user_id                                          AS entity_id,
       COALESCE(u.full_name, u.phone, 'Unknown')                AS entity_name,
       u.phone                                                   AS entity_phone,
       'driver'                                                  AS entity_type,
       COALESCE(SUM(o.total_amount), 0)                         AS total_earned,
       COALESCE((
         SELECT SUM(cc.amount)
         FROM wallet.cash_collections cc
         WHERE cc.collected_from_user_id = d.driver_user_id
           AND cc.collected_from_type = 'driver'
       ), 0)                                                     AS total_collected,
       COALESCE(SUM(o.total_amount), 0) - COALESCE((
         SELECT SUM(cc.amount)
         FROM wallet.cash_collections cc
         WHERE cc.collected_from_user_id = d.driver_user_id
           AND cc.collected_from_type = 'driver'
       ), 0)                                                     AS pending_balance
     FROM delivery.deliveries d
     JOIN orders.orders o ON o.id = d.order_id
     JOIN auth.users u ON u.id = d.driver_user_id
     WHERE o.status        = 'delivered'
       AND o.payment_type  = 'cash'
     GROUP BY d.driver_user_id, u.full_name, u.phone
     HAVING COALESCE(SUM(o.total_amount), 0) - COALESCE((
       SELECT SUM(cc.amount)
       FROM wallet.cash_collections cc
       WHERE cc.collected_from_user_id = d.driver_user_id
         AND cc.collected_from_type = 'driver'
     ), 0) > 0
     ORDER BY pending_balance DESC`
  );
  return result.rows;
}

// Pending balance for all restaurants (cash pickup orders)
export async function restaurantPendingSummary(): Promise<PendingSummaryRow[]> {
  const result = await pool.query<PendingSummaryRow>(
    `SELECT
       r.user_id                                                 AS entity_id,
       r.name                                                    AS entity_name,
       r.phone                                                   AS entity_phone,
       'restaurant'                                             AS entity_type,
       COALESCE(SUM(o.total_amount), 0)                         AS total_earned,
       COALESCE((
         SELECT SUM(cc.amount)
         FROM wallet.cash_collections cc
         WHERE cc.collected_from_user_id = r.user_id
           AND cc.collected_from_type = 'restaurant'
       ), 0)                                                     AS total_collected,
       COALESCE(SUM(o.total_amount), 0) - COALESCE((
         SELECT SUM(cc.amount)
         FROM wallet.cash_collections cc
         WHERE cc.collected_from_user_id = r.user_id
           AND cc.collected_from_type = 'restaurant'
       ), 0)                                                     AS pending_balance
     FROM orders.orders o
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     WHERE o.status        = 'delivered'
       AND o.payment_type  = 'cash'
       AND o.order_type    = 'pickup'
     GROUP BY r.user_id, r.name, r.phone
     HAVING COALESCE(SUM(o.total_amount), 0) - COALESCE((
       SELECT SUM(cc.amount)
       FROM wallet.cash_collections cc
       WHERE cc.collected_from_user_id = r.user_id
         AND cc.collected_from_type = 'restaurant'
     ), 0) > 0
     ORDER BY pending_balance DESC`
  );
  return result.rows;
}

// Balance for a single driver or restaurant
export async function pendingBalanceFor(
  type: string,
  entityUserId: string
): Promise<{ total_earned: number; total_collected: number; pending_balance: number }> {
  if (type === "driver") {
    const earned = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(o.total_amount), 0) AS total
       FROM delivery.deliveries d
       JOIN orders.orders o ON o.id = d.order_id
       WHERE d.driver_user_id = $1
         AND o.status = 'delivered'
         AND o.payment_type = 'cash'`,
      [entityUserId]
    );
    const collected = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM wallet.cash_collections
       WHERE collected_from_user_id = $1 AND collected_from_type = 'driver'`,
      [entityUserId]
    );
    const e = parseFloat(earned.rows[0].total);
    const c = parseFloat(collected.rows[0].total);
    return { total_earned: e, total_collected: c, pending_balance: parseFloat((e - c).toFixed(2)) };
  }

  // restaurant
  const earned = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(o.total_amount), 0) AS total
     FROM orders.orders o
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     WHERE r.user_id = $1
       AND o.status = 'delivered'
       AND o.payment_type = 'cash'
       AND o.order_type = 'pickup'`,
    [entityUserId]
  );
  const collected = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM wallet.cash_collections
     WHERE collected_from_user_id = $1 AND collected_from_type = 'restaurant'`,
    [entityUserId]
  );
  const e = parseFloat(earned.rows[0].total);
  const c = parseFloat(collected.rows[0].total);
  return { total_earned: e, total_collected: c, pending_balance: parseFloat((e - c).toFixed(2)) };
}

export async function create(params: {
  collected_from_type: string;
  collected_from_user_id: string;
  amount: number;
  method: string;
  reference?: string | null;
  note?: string | null;
  collected_by_admin_id: string;
}): Promise<CashCollectionRow> {
  const { rows } = await pool.query<CashCollectionRow>(
    `INSERT INTO wallet.cash_collections
       (collected_from_type, collected_from_user_id, amount, method, reference, note, collected_by_admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      params.collected_from_type,
      params.collected_from_user_id,
      params.amount,
      params.method,
      params.reference ?? null,
      params.note ?? null,
      params.collected_by_admin_id,
    ]
  );
  const row = rows[0];

  const enriched = await pool.query<CashCollectionRow>(
    `SELECT cc.*,
       COALESCE(u.full_name, u.phone) AS entity_name,
       u.phone                        AS entity_phone
     FROM wallet.cash_collections cc
     LEFT JOIN auth.users u ON u.id = cc.collected_from_user_id
     WHERE cc.id = $1`,
    [row.id]
  );
  return enriched.rows[0];
}

export async function list(params: {
  limit: number;
  offset: number;
  type?: string;
  entity_id?: string;
  search?: string;
}): Promise<CashCollectionRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.type) conditions.push(`cc.collected_from_type = $${values.push(params.type)}`);
  if (params.entity_id) conditions.push(`cc.collected_from_user_id = $${values.push(params.entity_id)}`);
  if (params.search) conditions.push(`(cc.reference ILIKE $${values.push(`%${params.search}%`)} OR cc.method ILIKE $${values.length})`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<CashCollectionRow>(
    `SELECT cc.*,
       COALESCE(u.full_name, r.name) AS entity_name,
       COALESCE(u.phone, r.phone)    AS entity_phone
     FROM wallet.cash_collections cc
     LEFT JOIN auth.users u ON u.id = cc.collected_from_user_id AND cc.collected_from_type = 'driver'
     LEFT JOIN restaurant.restaurants r ON r.user_id = cc.collected_from_user_id AND cc.collected_from_type = 'restaurant'
     ${where}
     ORDER BY cc.created_at DESC
     LIMIT $${values.push(params.limit)} OFFSET $${values.push(params.offset)}`,
    values
  );
  return result.rows;
}

export async function count(params: { type?: string; entity_id?: string; search?: string }): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (params.type) conditions.push(`collected_from_type = $${values.push(params.type)}`);
  if (params.entity_id) conditions.push(`collected_from_user_id = $${values.push(params.entity_id)}`);
  if (params.search) conditions.push(`reference ILIKE $${values.push(`%${params.search}%`)}`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM wallet.cash_collections ${where}`, values
  );
  return parseInt(result.rows[0].total);
}

export function toResponse(row: CashCollectionRow) {
  return {
    id: row.id,
    collected_from_type: row.collected_from_type,
    collected_from_user_id: row.collected_from_user_id,
    collected_from_name: row.entity_name ?? null,
    collected_from_phone: row.entity_phone ?? null,
    amount: parseFloat(row.amount),
    method: row.method,
    reference: row.reference ?? null,
    note: row.note ?? null,
    collected_by_admin_id: row.collected_by_admin_id,
    collected_at: row.created_at,
  };
}
