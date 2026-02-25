import pool from "../db/connection";

export interface RestaurantRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  address: string | null;
  zone: string | null;
  cuisine: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  delivery_time_min: number | null;
  delivery_time_max: number | null;
  tags: string[] | null;
  tin: string | null;
  tin_expiry_date: string | null;
  certificate_url: string | null;
  additional_data: Record<string, unknown> | null;
  is_active: boolean;
  is_open: boolean;
  is_blocked: boolean;
  contact_email: string | null;
  phone: string | null;
  tax_type: string;
  tax_rate: string;
  free_delivery_enabled: boolean;
  free_delivery_max_amount: string | null;
  free_delivery_min_distance_km: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRestaurantParams {
  user_id: string;
  parent_id?: string | null;
  name: string;
  address?: string | null;
  zone?: string | null;
  cuisine?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  delivery_time_min?: number | null;
  delivery_time_max?: number | null;
  tags?: string[] | null;
  tin?: string | null;
  tin_expiry_date?: string | null;
  certificate_url?: string | null;
  additional_data?: Record<string, unknown> | null;
  contact_email?: string | null;
  phone?: string | null;
  tax_type?: string;
  tax_rate?: number;
  free_delivery_enabled?: boolean;
  free_delivery_max_amount?: number | null;
  free_delivery_min_distance_km?: number | null;
  description?: string | null;
}

export interface UpdateRestaurantParams {
  name?: string;
  address?: string | null;
  zone?: string | null;
  cuisine?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  delivery_time_min?: number | null;
  delivery_time_max?: number | null;
  tags?: string[] | null;
  tin?: string | null;
  tin_expiry_date?: string | null;
  certificate_url?: string | null;
  additional_data?: Record<string, unknown> | null;
  contact_email?: string | null;
  phone?: string | null;
  tax_type?: string;
  tax_rate?: number;
  free_delivery_enabled?: boolean;
  free_delivery_max_amount?: number | null;
  free_delivery_min_distance_km?: number | null;
  description?: string | null;
  is_active?: boolean;
  is_open?: boolean;
  is_blocked?: boolean;
}

export async function create(params: CreateRestaurantParams): Promise<RestaurantRow> {
  const r = await pool.query(
    `INSERT INTO restaurant.restaurants (
      user_id, parent_id, name, address, zone, cuisine, logo_url, cover_image_url,
      delivery_time_min, delivery_time_max, tags, tin, tin_expiry_date, certificate_url,
      additional_data, contact_email, phone, tax_type, tax_rate,
      free_delivery_enabled, free_delivery_max_amount, free_delivery_min_distance_km,
      description, is_active, is_open, is_blocked
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    RETURNING *`,
    [
      params.user_id,
      params.parent_id ?? null,
      params.name,
      params.address ?? null,
      params.zone ?? null,
      params.cuisine ?? null,
      params.logo_url ?? null,
      params.cover_image_url ?? null,
      params.delivery_time_min ?? null,
      params.delivery_time_max ?? null,
      params.tags ?? null,
      params.tin ?? null,
      params.tin_expiry_date ?? null,
      params.certificate_url ?? null,
      params.additional_data ? JSON.stringify(params.additional_data) : null,
      params.contact_email ?? null,
      params.phone ?? null,
      params.tax_type ?? "exclusive",
      params.tax_rate ?? 0,
      params.free_delivery_enabled ?? false,
      params.free_delivery_max_amount ?? null,
      params.free_delivery_min_distance_km ?? null,
      params.description ?? null,
      false,
      false,
      false,
    ]
  );
  return r.rows[0];
}

export async function findById(id: string): Promise<RestaurantRow | null> {
  const r = await pool.query("SELECT * FROM restaurant.restaurants WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function findByUserId(
  user_id: string,
  opts?: { limit?: number; offset?: number }
): Promise<RestaurantRow[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const r = await pool.query(
    `SELECT * FROM restaurant.restaurants WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [user_id, limit, offset]
  );
  return r.rows;
}

export async function countByUserId(user_id: string): Promise<number> {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS total FROM restaurant.restaurants WHERE user_id = $1",
    [user_id]
  );
  return r.rows[0]?.total ?? 0;
}

export async function findBranches(parent_id: string): Promise<RestaurantRow[]> {
  const r = await pool.query(
    "SELECT * FROM restaurant.restaurants WHERE parent_id = $1 ORDER BY created_at ASC",
    [parent_id]
  );
  return r.rows;
}

export async function listPublic(opts: {
  limit: number;
  offset: number;
}): Promise<RestaurantRow[]> {
  const r = await pool.query(
    `SELECT * FROM restaurant.restaurants
     WHERE parent_id IS NULL AND is_active = true AND is_blocked = false AND is_open = true
     ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [opts.limit, opts.offset]
  );
  return r.rows;
}

export async function countPublic(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total FROM restaurant.restaurants
     WHERE parent_id IS NULL AND is_active = true AND is_blocked = false AND is_open = true`
  );
  return r.rows[0]?.total ?? 0;
}

export async function update(id: string, params: UpdateRestaurantParams): Promise<RestaurantRow | null> {
  const allowed: (keyof UpdateRestaurantParams)[] = [
    "name", "address", "zone", "cuisine", "logo_url", "cover_image_url",
    "delivery_time_min", "delivery_time_max", "tags", "tin", "tin_expiry_date",
    "certificate_url", "additional_data", "contact_email", "phone", "tax_type", "tax_rate",
    "free_delivery_enabled", "free_delivery_max_amount", "free_delivery_min_distance_km",
    "description", "is_active", "is_open", "is_blocked",
  ];
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const key of allowed) {
    const v = (params as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (key === "additional_data" && v != null) {
      updates.push(`${key} = $${i++}`);
      values.push(JSON.stringify(v));
    } else if (key === "tags" && Array.isArray(v)) {
      updates.push(`${key} = $${i++}`);
      values.push(v);
    } else {
      updates.push(`${key} = $${i++}`);
      values.push(v);
    }
  }
  if (updates.length === 0) return findById(id);
  values.push(id);
  const r = await pool.query(
    `UPDATE restaurant.restaurants SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ?? null;
}

export function toResponse(row: RestaurantRow): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    name: row.name,
    address: row.address,
    zone: row.zone,
    cuisine: row.cuisine,
    logo_url: row.logo_url,
    cover_image_url: row.cover_image_url,
    delivery_time_min: row.delivery_time_min,
    delivery_time_max: row.delivery_time_max,
    tags: row.tags,
    tin: row.tin,
    tin_expiry_date: row.tin_expiry_date,
    certificate_url: row.certificate_url,
    additional_data: row.additional_data,
    is_active: row.is_active,
    is_open: row.is_open,
    is_blocked: row.is_blocked,
    contact_email: row.contact_email,
    phone: row.phone,
    tax_type: row.tax_type,
    tax_rate: parseFloat(String(row.tax_rate)),
    free_delivery_enabled: row.free_delivery_enabled,
    free_delivery_max_amount: row.free_delivery_max_amount != null ? parseFloat(String(row.free_delivery_max_amount)) : null,
    free_delivery_min_distance_km: row.free_delivery_min_distance_km != null ? parseFloat(String(row.free_delivery_min_distance_km)) : null,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
