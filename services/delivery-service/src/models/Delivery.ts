import pool from "../db/connection";

export type DeliveryStatus =
  | "pending_assignment"
  | "assigned"
  | "accepted_by_driver"
  | "arrived_at_pickup"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled"
  | "failed";

export interface DeliveryRow {
  id: string;
  order_id: string;
  customer_user_id: string;
  restaurant_id: string;
  driver_user_id: string | null;
  status: DeliveryStatus;
  pickup_address: string | null;
  delivery_address: string | null;
  pickup_latitude: string | null;
  pickup_longitude: string | null;
  delivery_latitude: string | null;
  delivery_longitude: string | null;
  delivery_notes: string | null;
  proof_image_url: string | null;
  assigned_at: Date;
  assignment_expires_at?: Date | null;
  attempted_driver_ids?: unknown;
  accepted_at: Date | null;
  picked_up_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DriverStatusRow {
  driver_user_id: string;
  is_online: boolean;
  is_available: boolean;
  current_latitude: string | null;
  current_longitude: string | null;
  last_seen_at: Date;
  updated_at: Date;
}

export interface CreateDeliveryInput {
  order_id: string;
  customer_user_id: string;
  restaurant_id: string;
  driver_user_id?: string | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  delivery_notes?: string | null;
}

export interface DeliveryListFilters {
  limit: number;
  offset: number;
  order_id?: string;
  driver_user_id?: string;
  customer_user_id?: string;
  restaurant_id?: string;
  restaurant_ids?: string[];
  status?: DeliveryStatus;
  date_from?: string;
  date_to?: string;
}

function buildWhere(filters: DeliveryListFilters): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (filters.order_id) {
    conditions.push(`d.order_id = $${i++}`);
    values.push(filters.order_id);
  }
  if (filters.driver_user_id) {
    conditions.push(`d.driver_user_id = $${i++}`);
    values.push(filters.driver_user_id);
  }
  if (filters.customer_user_id) {
    conditions.push(`d.customer_user_id = $${i++}`);
    values.push(filters.customer_user_id);
  }
  if (filters.restaurant_id) {
    conditions.push(`d.restaurant_id = $${i++}`);
    values.push(filters.restaurant_id);
  }
  if (filters.restaurant_ids && filters.restaurant_ids.length > 0) {
    conditions.push(`d.restaurant_id = ANY($${i++})`);
    values.push(filters.restaurant_ids);
  }
  if (filters.status) {
    conditions.push(`d.status = $${i++}`);
    values.push(filters.status);
  }
  if (filters.date_from) {
    conditions.push(`d.created_at >= $${i++}`);
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push(`d.created_at <= $${i++}`);
    values.push(filters.date_to);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
}

export async function create(input: CreateDeliveryInput): Promise<DeliveryRow> {
  const r = await pool.query(
    `INSERT INTO delivery.deliveries (
       order_id, customer_user_id, restaurant_id, driver_user_id, status,
       pickup_address, delivery_address, pickup_latitude, pickup_longitude,
       delivery_latitude, delivery_longitude, delivery_notes, assigned_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      input.order_id,
      input.customer_user_id,
      input.restaurant_id,
      input.driver_user_id ?? null,
      input.driver_user_id ? "assigned" : "pending_assignment",
      input.pickup_address ?? null,
      input.delivery_address ?? null,
      input.pickup_latitude ?? null,
      input.pickup_longitude ?? null,
      input.delivery_latitude ?? null,
      input.delivery_longitude ?? null,
      input.delivery_notes ?? null,
      input.driver_user_id ? new Date() : null,
    ]
  );
  return r.rows[0] as DeliveryRow;
}

export async function setAssignment(params: {
  id: string;
  driver_user_id: string;
  assignment_expires_at: Date;
  attempted_driver_ids: string[];
}): Promise<DeliveryRow | null> {
  const r = await pool.query(
    `UPDATE delivery.deliveries
     SET driver_user_id = $1,
         status = 'assigned',
         assigned_at = NOW(),
         assignment_expires_at = $2,
         attempted_driver_ids = $3::jsonb
     WHERE id = $4
     RETURNING *`,
    [params.driver_user_id, params.assignment_expires_at, JSON.stringify(params.attempted_driver_ids), params.id]
  );
  return (r.rows[0] as DeliveryRow | undefined) ?? null;
}

export async function markPendingAssignment(params: {
  id: string;
  attempted_driver_ids: string[];
}): Promise<DeliveryRow | null> {
  const r = await pool.query(
    `UPDATE delivery.deliveries
     SET driver_user_id = NULL,
         status = 'pending_assignment',
         assignment_expires_at = NULL
     WHERE id = $1
     RETURNING *`,
    [params.id]
  );
  const row = (r.rows[0] as DeliveryRow | undefined) ?? null;
  if (!row) return null;
  await pool.query(
    `UPDATE delivery.deliveries
     SET attempted_driver_ids = $2::jsonb
     WHERE id = $1`,
    [params.id, JSON.stringify(params.attempted_driver_ids)]
  );
  return await findById(params.id);
}

export async function listExpiredAssignments(now: Date, limit = 50): Promise<DeliveryRow[]> {
  const r = await pool.query(
    `SELECT *
     FROM delivery.deliveries
     WHERE status = 'assigned'
       AND accepted_at IS NULL
       AND assignment_expires_at IS NOT NULL
       AND assignment_expires_at <= $1
     ORDER BY assignment_expires_at ASC
     LIMIT $2`,
    [now, limit]
  );
  return r.rows as DeliveryRow[];
}

export async function findById(id: string): Promise<DeliveryRow | null> {
  const r = await pool.query("SELECT * FROM delivery.deliveries WHERE id = $1", [id]);
  return (r.rows[0] as DeliveryRow | undefined) ?? null;
}

export async function findByOrderId(order_id: string): Promise<DeliveryRow | null> {
  const r = await pool.query("SELECT * FROM delivery.deliveries WHERE order_id = $1", [order_id]);
  return (r.rows[0] as DeliveryRow | undefined) ?? null;
}

export async function list(filters: DeliveryListFilters): Promise<DeliveryRow[]> {
  const where = buildWhere(filters);
  const values = [...where.values, filters.limit, filters.offset];
  const limitPlaceholder = `$${where.values.length + 1}`;
  const offsetPlaceholder = `$${where.values.length + 2}`;

  const r = await pool.query(
    `SELECT d.*
     FROM delivery.deliveries d
     ${where.where}
     ORDER BY d.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return r.rows as DeliveryRow[];
}

export async function count(filters: Omit<DeliveryListFilters, "limit" | "offset">): Promise<number> {
  const where = buildWhere({ ...filters, limit: 1, offset: 0 });
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM delivery.deliveries d
     ${where.where}`,
    where.values
  );
  return r.rows[0]?.total ?? 0;
}

export async function updateStatus(
  id: string,
  status: DeliveryStatus,
  extra?: { proof_image_url?: string | null; delivery_notes?: string | null }
): Promise<DeliveryRow | null> {
  const statusToTimeColumn: Partial<Record<DeliveryStatus, string>> = {
    accepted_by_driver: "accepted_at",
    picked_up: "picked_up_at",
    delivered: "delivered_at",
    cancelled: "cancelled_at",
    failed: "failed_at",
  };

  const updates: string[] = ["status = $1"];
  const values: unknown[] = [status];
  let i = 2;

  const timeColumn = statusToTimeColumn[status];
  if (timeColumn) updates.push(`${timeColumn} = NOW()`);
  if (extra?.proof_image_url !== undefined) {
    updates.push(`proof_image_url = $${i++}`);
    values.push(extra.proof_image_url);
  }
  if (extra?.delivery_notes !== undefined) {
    updates.push(`delivery_notes = $${i++}`);
    values.push(extra.delivery_notes);
  }

  values.push(id);
  const r = await pool.query(
    `UPDATE delivery.deliveries
     SET ${updates.join(", ")}
     WHERE id = $${i}
     RETURNING *`,
    values
  );
  return (r.rows[0] as DeliveryRow | undefined) ?? null;
}

export async function upsertDriverAvailability(input: {
  driver_user_id: string;
  is_online?: boolean;
  is_available?: boolean;
  current_latitude?: number | null;
  current_longitude?: number | null;
}): Promise<DriverStatusRow> {
  const r = await pool.query(
    `INSERT INTO delivery.driver_status (
       driver_user_id, is_online, is_available, current_latitude, current_longitude, last_seen_at
     ) VALUES ($1, COALESCE($2, false), COALESCE($3, false), $4, $5, NOW())
     ON CONFLICT (driver_user_id)
     DO UPDATE SET
       is_online = COALESCE(EXCLUDED.is_online, delivery.driver_status.is_online),
       is_available = COALESCE(EXCLUDED.is_available, delivery.driver_status.is_available),
       current_latitude = EXCLUDED.current_latitude,
       current_longitude = EXCLUDED.current_longitude,
       last_seen_at = NOW()
     RETURNING *`,
    [
      input.driver_user_id,
      input.is_online ?? null,
      input.is_available ?? null,
      input.current_latitude ?? null,
      input.current_longitude ?? null,
    ]
  );
  return r.rows[0] as DriverStatusRow;
}

export async function listDriverAvailability(opts?: {
  is_online?: boolean;
  is_available?: boolean;
  limit?: number;
  offset?: number;
}): Promise<DriverStatusRow[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (opts?.is_online !== undefined) {
    conditions.push(`is_online = $${i++}`);
    values.push(opts.is_online);
  }
  if (opts?.is_available !== undefined) {
    conditions.push(`is_available = $${i++}`);
    values.push(opts.is_available);
  }
  values.push(limit, offset);
  const limitPlaceholder = `$${i++}`;
  const offsetPlaceholder = `$${i++}`;

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT *
     FROM delivery.driver_status
     ${where}
     ORDER BY last_seen_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );
  return r.rows as DriverStatusRow[];
}

export async function countDriverAvailability(opts?: {
  is_online?: boolean;
  is_available?: boolean;
}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (opts?.is_online !== undefined) {
    conditions.push(`is_online = $${i++}`);
    values.push(opts.is_online);
  }
  if (opts?.is_available !== undefined) {
    conditions.push(`is_available = $${i++}`);
    values.push(opts.is_available);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM delivery.driver_status
     ${where}`,
    values
  );
  return r.rows[0]?.total ?? 0;
}

export function toResponse(row: DeliveryRow): Record<string, unknown> {
  return {
    id: row.id,
    order_id: row.order_id,
    customer_user_id: row.customer_user_id,
    restaurant_id: row.restaurant_id,
    driver_user_id: row.driver_user_id,
    status: row.status,
    pickup_address: row.pickup_address,
    delivery_address: row.delivery_address,
    pickup_latitude: row.pickup_latitude != null ? parseFloat(String(row.pickup_latitude)) : null,
    pickup_longitude: row.pickup_longitude != null ? parseFloat(String(row.pickup_longitude)) : null,
    delivery_latitude: row.delivery_latitude != null ? parseFloat(String(row.delivery_latitude)) : null,
    delivery_longitude: row.delivery_longitude != null ? parseFloat(String(row.delivery_longitude)) : null,
    delivery_notes: row.delivery_notes,
    proof_image_url: row.proof_image_url,
    assigned_at: row.assigned_at,
    accepted_at: row.accepted_at,
    picked_up_at: row.picked_up_at,
    delivered_at: row.delivered_at,
    cancelled_at: row.cancelled_at,
    failed_at: row.failed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toDriverStatusResponse(row: DriverStatusRow): Record<string, unknown> {
  return {
    driver_user_id: row.driver_user_id,
    is_online: row.is_online,
    is_available: row.is_available,
    current_latitude: row.current_latitude != null ? parseFloat(String(row.current_latitude)) : null,
    current_longitude: row.current_longitude != null ? parseFloat(String(row.current_longitude)) : null,
    last_seen_at: row.last_seen_at,
    updated_at: row.updated_at,
  };
}
