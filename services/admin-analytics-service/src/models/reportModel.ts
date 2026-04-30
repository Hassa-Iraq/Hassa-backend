import pool from "../db/connection";

const COMMISSION = parseFloat(process.env.PLATFORM_COMMISSION_RATE || "0.15");

function buildDateFilter(
  params: unknown[],
  dateFrom?: string,
  dateTo?: string,
  col = "o.placed_at"
): string {
  const parts: string[] = [];
  if (dateFrom) parts.push(`${col} >= $${params.push(dateFrom)}`);
  if (dateTo) parts.push(`${col} <= $${params.push(dateTo + " 23:59:59")}`);
  return parts.length ? parts.join(" AND ") : "";
}

export interface TransactionSummary {
  completed_total: number;
  refunded_total: number;
  admin_earning: number;
  restaurant_earning: number;
  deliveryman_earning: number;
}

export interface TransactionRow {
  order_id: string;
  order_number: string;
  restaurant_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  delivery_fee: number;
  total_amount: number;
  admin_commission: number;
  restaurant_net_income: number;
  admin_net_income: number;
  amount_received_by: string;
  payment_method: string;
  order_type: string;
  status: string;
  placed_at: string;
}

export async function getTransactionSummary(params: {
  restaurantId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<TransactionSummary> {
  const values: unknown[] = [];
  const conditions: string[] = ["o.status IN ('delivered', 'cancelled')"];
  if (params.restaurantId) conditions.push(`o.restaurant_id = $${values.push(params.restaurantId)}`);
  const dateFilter = buildDateFilter(values, params.dateFrom, params.dateTo);
  if (dateFilter) conditions.push(dateFilter);
  const where = `WHERE ${conditions.join(" AND ")}`;

  const r = await pool.query<{
    completed_total: string;
    refunded_total: string;
    admin_earning: string;
    restaurant_earning: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount ELSE 0 END), 0) AS completed_total,
       COALESCE(SUM(CASE WHEN o.status = 'cancelled' AND o.payment_type = 'wallet' THEN o.total_amount ELSE 0 END), 0) AS refunded_total,
       COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount * $${values.push(COMMISSION)} ELSE 0 END), 0) AS admin_earning,
       COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount * $${values.push(1 - COMMISSION)} ELSE 0 END), 0) AS restaurant_earning
     FROM orders.orders o
     ${where}`,
    values
  );

  // Driver earning = sum of delivery_fee for delivered cash orders
  const driverValues: unknown[] = [];
  const driverConditions: string[] = ["o.status = 'delivered'", "o.payment_type = 'cash'"];
  if (params.restaurantId) driverConditions.push(`o.restaurant_id = $${driverValues.push(params.restaurantId)}`);
  const df = buildDateFilter(driverValues, params.dateFrom, params.dateTo);
  if (df) driverConditions.push(df);

  const driverR = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(o.delivery_fee), 0) AS total
     FROM orders.orders o
     WHERE ${driverConditions.join(" AND ")}`,
    driverValues
  );

  const row = r.rows[0];
  return {
    completed_total: parseFloat(row.completed_total),
    refunded_total: parseFloat(row.refunded_total),
    admin_earning: parseFloat(row.admin_earning),
    restaurant_earning: parseFloat(row.restaurant_earning),
    deliveryman_earning: parseFloat(driverR.rows[0].total),
  };
}

export async function getTransactions(params: {
  restaurantId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}): Promise<TransactionRow[]> {
  const values: unknown[] = [COMMISSION, 1 - COMMISSION];
  const conditions: string[] = [];
  if (params.restaurantId) conditions.push(`o.restaurant_id = $${values.push(params.restaurantId)}`);
  const dateFilter = buildDateFilter(values, params.dateFrom, params.dateTo);
  if (dateFilter) conditions.push(dateFilter);
  const where = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

  const r = await pool.query<TransactionRow>(
    `SELECT
       o.id                                          AS order_id,
       o.order_number,
       r.name                                        AS restaurant_name,
       u.full_name                                   AS customer_name,
       u.phone                                       AS customer_phone,
       o.subtotal::float                             AS subtotal,
       o.discount_amount::float                      AS discount_amount,
       o.tax_amount::float                           AS tax_amount,
       o.delivery_fee::float                         AS delivery_fee,
       o.total_amount::float                         AS total_amount,
       ROUND((o.total_amount * $1)::numeric, 2)::float AS admin_commission,
       ROUND((o.total_amount * $2)::numeric, 2)::float AS restaurant_net_income,
       ROUND((o.total_amount * $1)::numeric, 2)::float AS admin_net_income,
       CASE WHEN o.payment_type = 'cash' THEN 'Delivery Man' ELSE 'Admin' END AS amount_received_by,
       o.payment_type                                AS payment_method,
       o.order_type,
       o.status,
       o.placed_at
     FROM orders.orders o
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     JOIN auth.users u ON u.id = o.user_id
     WHERE o.status NOT IN ('pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery')
     ${where}
     ORDER BY o.placed_at DESC
     LIMIT $${values.push(params.limit)} OFFSET $${values.push(params.offset)}`,
    values
  );
  return r.rows;
}

export async function countTransactions(params: {
  restaurantId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<number> {
  const values: unknown[] = [];
  const conditions: string[] = ["o.status NOT IN ('pending','confirmed','preparing','ready_for_pickup','out_for_delivery')"];
  if (params.restaurantId) conditions.push(`o.restaurant_id = $${values.push(params.restaurantId)}`);
  const df = buildDateFilter(values, params.dateFrom, params.dateTo);
  if (df) conditions.push(df);
  const r = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM orders.orders o WHERE ${conditions.join(" AND ")}`,
    values
  );
  return parseInt(r.rows[0].total);
}

// ─────────────────────────────────────────────────────────────
// FOOD REPORT
// ─────────────────────────────────────────────────────────────
export interface FoodReportRow {
  menu_item_id: string;
  name: string;
  image_url: string | null;
  restaurant_name: string;
  order_count: number;
  price: number;
  total_amount_sold: number;
  total_discount_given: number;
  average_sale_value: number;
  average_rating: number;
}

export async function getFoodReport(params: {
  restaurantId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}): Promise<FoodReportRow[]> {
  const values: unknown[] = [];

  const joinConditions: string[] = ["o.status = 'delivered'"];
  const df = buildDateFilter(values, params.dateFrom, params.dateTo);
  if (df) joinConditions.push(df);
  const joinExtra = joinConditions.map(c => `AND ${c}`).join(" ");

  const whereConditions: string[] = [];
  if (params.restaurantId) whereConditions.push(`r.id = $${values.push(params.restaurantId)}`);
  if (params.categoryId) whereConditions.push(`mi.category_id = $${values.push(params.categoryId)}`);
  const where = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const r = await pool.query<FoodReportRow>(
    `SELECT
       mi.id                                                       AS menu_item_id,
       mi.name,
       mi.image_url,
       r.name                                                      AS restaurant_name,
       COUNT(DISTINCT oi.order_id)::int                           AS order_count,
       mi.price::float                                            AS price,
       COALESCE(SUM(oi.line_total), 0)::float                    AS total_amount_sold,
       COALESCE(SUM(o.discount_amount), 0)::float                AS total_discount_given,
       CASE WHEN COUNT(oi.id) > 0
            THEN ROUND((SUM(oi.line_total) / COUNT(oi.id))::numeric, 2)::float
            ELSE 0 END                                            AS average_sale_value,
       COALESCE(
         (SELECT ROUND(AVG(rr.rating)::numeric, 1)
          FROM restaurant.restaurant_ratings rr
          WHERE rr.restaurant_id = r.id AND rr.is_visible = true), 0
       )::float                                                   AS average_rating
     FROM restaurant.menu_items mi
     JOIN restaurant.restaurants r ON r.id = mi.restaurant_id
     LEFT JOIN orders.order_items oi ON oi.menu_item_id = mi.id
     LEFT JOIN orders.orders o ON o.id = oi.order_id ${joinExtra}
     ${where}
     GROUP BY mi.id, mi.name, mi.image_url, mi.price, r.id, r.name
     ORDER BY total_amount_sold DESC
     LIMIT $${values.push(params.limit)} OFFSET $${values.push(params.offset)}`,
    values
  );
  return r.rows;
}

export async function getFoodReportChart(params: {
  restaurantId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Array<{ year: string; total_amount_sold: number }>> {
  const values: unknown[] = [];
  const conditions: string[] = ["o.status = 'delivered'"];
  if (params.restaurantId) conditions.push(`o.restaurant_id = $${values.push(params.restaurantId)}`);
  const df = buildDateFilter(values, params.dateFrom, params.dateTo);
  if (df) conditions.push(df);

  const r = await pool.query<{ year: string; total_amount_sold: string }>(
    `SELECT
       TO_CHAR(DATE_TRUNC('year', o.placed_at), 'YYYY') AS year,
       COALESCE(SUM(oi.line_total), 0)                  AS total_amount_sold
     FROM orders.order_items oi
     JOIN orders.orders o ON o.id = oi.order_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY DATE_TRUNC('year', o.placed_at)
     ORDER BY year ASC`,
    values
  );
  return r.rows.map(row => ({ year: row.year, total_amount_sold: parseFloat(row.total_amount_sold) }));
}

export async function countFoodReport(params: {
  restaurantId?: string;
  categoryId?: string;
}): Promise<number> {
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (params.restaurantId) conditions.push(`mi.restaurant_id = $${values.push(params.restaurantId)}`);
  if (params.categoryId) conditions.push(`mi.category_id = $${values.push(params.categoryId)}`);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const r = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM restaurant.menu_items mi
     JOIN restaurant.restaurants r ON r.id = mi.restaurant_id
     ${where}`,
    values
  );
  return parseInt(r.rows[0].total);
}

export interface RestaurantReportRow {
  restaurant_id: string;
  restaurant_name: string;
  logo_url: string | null;
  zone: string | null;
  total_food: number;
  total_orders: number;
  total_order_amount: number;
  total_discount_given: number;
  total_admin_commission: number;
  total_vat_tax: number;
  average_rating: number;
}

export async function getRestaurantReport(params: {
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}): Promise<RestaurantReportRow[]> {
  const values: unknown[] = [COMMISSION];
  const conditions: string[] = ["r.parent_id IS NULL", "r.is_active = true"];
  if (params.zone) conditions.push(`r.zone ILIKE $${values.push(`%${params.zone}%`)}`);
  const df = buildDateFilter(values, params.dateFrom, params.dateTo, "o.placed_at");
  const orderFilter = df ? `AND ${df}` : "";

  const r = await pool.query<RestaurantReportRow>(
    `SELECT
       r.id                                                              AS restaurant_id,
       r.name                                                            AS restaurant_name,
       r.logo_url,
       r.zone,
       (SELECT COUNT(*)::int FROM restaurant.menu_items mi WHERE mi.restaurant_id = r.id AND mi.is_available = true) AS total_food,
       COUNT(CASE WHEN o.status = 'delivered' THEN 1 END)::int          AS total_orders,
       COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount ELSE 0 END), 0)::float AS total_order_amount,
       COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.discount_amount ELSE 0 END), 0)::float AS total_discount_given,
       COALESCE(ROUND((SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount ELSE 0 END) * $1)::numeric, 2), 0)::float AS total_admin_commission,
       COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.tax_amount ELSE 0 END), 0)::float AS total_vat_tax,
       COALESCE(r.rating_avg, 0)::float                                 AS average_rating
     FROM restaurant.restaurants r
     LEFT JOIN orders.orders o ON o.restaurant_id = r.id ${orderFilter}
     WHERE ${conditions.join(" AND ")}
     GROUP BY r.id, r.name, r.logo_url, r.zone, r.rating_avg
     ORDER BY total_order_amount DESC
     LIMIT $${values.push(params.limit)} OFFSET $${values.push(params.offset)}`,
    values
  );
  return r.rows;
}

export async function getRestaurantReportChart(params: {
  zone?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Array<{ year: string; total_order_amount: number }>> {
  const values: unknown[] = [];
  const conditions: string[] = ["o.status = 'delivered'"];
  if (params.zone) conditions.push(`r.zone ILIKE $${values.push(`%${params.zone}%`)}`);
  const df = buildDateFilter(values, params.dateFrom, params.dateTo);
  if (df) conditions.push(df);

  const r = await pool.query<{ year: string; total_order_amount: string }>(
    `SELECT
       TO_CHAR(DATE_TRUNC('year', o.placed_at), 'YYYY') AS year,
       COALESCE(SUM(o.total_amount), 0)                 AS total_order_amount
     FROM orders.orders o
     JOIN restaurant.restaurants r ON r.id = o.restaurant_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY DATE_TRUNC('year', o.placed_at)
     ORDER BY year ASC`,
    values
  );
  return r.rows.map(row => ({ year: row.year, total_order_amount: parseFloat(row.total_order_amount) }));
}

export async function countRestaurantReport(params: { zone?: string }): Promise<number> {
  const values: unknown[] = [];
  const conditions: string[] = ["parent_id IS NULL", "is_active = true"];
  if (params.zone) conditions.push(`zone ILIKE $${values.push(`%${params.zone}%`)}`);
  const r = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM restaurant.restaurants WHERE ${conditions.join(" AND ")}`,
    values
  );
  return parseInt(r.rows[0].total);
}
