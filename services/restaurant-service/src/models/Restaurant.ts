import pool from "../db/connection";

export interface RestaurantRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  address: string | null;
  zone: string | null;
  latitude: string | null;
  longitude: string | null;
  service_radius_km: string | null;
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
  approval_status: string;
  rejection_reason: string | null;
  contact_email: string | null;
  phone: string | null;
  tax_type: string;
  tax_rate: string;
  free_delivery_enabled: boolean;
  free_delivery_max_amount: string | null;
  free_delivery_min_distance_km: string | null;
  description: string | null;
  rating_avg: string;
  rating_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRestaurantParams {
  user_id: string;
  parent_id?: string | null;
  name: string;
  address?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  service_radius_km?: number | null;
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
  approval_status?: string;
  rejection_reason?: string | null;
}

export interface UpdateRestaurantParams {
  name?: string;
  address?: string | null;
  zone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  service_radius_km?: number | null;
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
  approval_status?: string;
  rejection_reason?: string | null;
}

export interface AdminRestaurantListFilters {
  limit: number;
  offset: number;
  user_id?: string;
  search?: string;
  zone?: string;
  cuisine?: string;
  radius_km?: number;
  status?: "active" | "inactive" | "blocked" | "open" | "closed" | "pending" | "approved" | "rejected";
}

export interface AdminRestaurantRow extends RestaurantRow {
  branches_count: number;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
}

export interface RestaurantWithOwnerRow extends RestaurantRow {
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
}

export interface AdminRestaurantStatsRow {
  total_restaurants: number;
  active_restaurants: number;
  inactive_restaurants: number;
  newly_joined_restaurants: number;
}

export async function create(params: CreateRestaurantParams): Promise<RestaurantRow> {
  const r = await pool.query(
    `INSERT INTO restaurant.restaurants (
      user_id, parent_id, name, address, zone, latitude, longitude, service_radius_km, cuisine, logo_url, cover_image_url,
      delivery_time_min, delivery_time_max, tags, tin, tin_expiry_date, certificate_url,
      additional_data, contact_email, phone, tax_type, tax_rate,
      free_delivery_enabled, free_delivery_max_amount, free_delivery_min_distance_km,
      description, is_active, is_open, is_blocked, approval_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
    RETURNING *`,
    [
      params.user_id,
      params.parent_id ?? null,
      params.name,
      params.address ?? null,
      params.zone ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      params.service_radius_km ?? null,
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
      params.is_active ?? false,
      params.is_open ?? false,
      params.is_blocked ?? false,
      params.approval_status ?? "pending",
    ]
  );
  return r.rows[0];
}

export async function findById(id: string): Promise<RestaurantRow | null> {
  const r = await pool.query("SELECT * FROM restaurant.restaurants WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function findByIdWithOwner(id: string): Promise<RestaurantWithOwnerRow | null> {
  const r = await pool.query(
    `SELECT
       rr.*,
       u.full_name AS owner_name,
       u.phone AS owner_phone,
       u.email AS owner_email
     FROM restaurant.restaurants rr
     LEFT JOIN auth.users u ON u.id = rr.user_id
     WHERE rr.id = $1`,
    [id]
  );
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

export async function findBranchesByParentIdForAdmin(
  parent_id: string,
  opts?: { limit?: number; offset?: number }
): Promise<RestaurantRow[]> {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;
  const r = await pool.query(
    `SELECT * FROM restaurant.restaurants
     WHERE parent_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [parent_id, limit, offset]
  );
  return r.rows;
}

export async function countBranchesByParentId(parent_id: string): Promise<number> {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS total FROM restaurant.restaurants WHERE parent_id = $1",
    [parent_id]
  );
  return r.rows[0]?.total ?? 0;
}

export async function findAllForAdmin(filters: AdminRestaurantListFilters): Promise<AdminRestaurantRow[]> {
  const conditions: string[] = ["r.parent_id IS NULL"];
  const values: unknown[] = [];
  let i = 1;

  if (filters.user_id) {
    conditions.push(`r.user_id = $${i}`);
    values.push(filters.user_id);
    i += 1;
  }
  if (filters.search) {
    conditions.push(`(r.name ILIKE $${i} OR r.address ILIKE $${i} OR r.contact_email ILIKE $${i})`);
    values.push(`%${filters.search}%`);
    i += 1;
  }
  if (filters.zone) {
    conditions.push(`r.zone ILIKE $${i}`);
    values.push(`%${filters.zone}%`);
    i += 1;
  }
  if (filters.cuisine) {
    conditions.push(`r.cuisine ILIKE $${i}`);
    values.push(`%${filters.cuisine}%`);
    i += 1;
  }
  if (typeof filters.radius_km === "number" && Number.isFinite(filters.radius_km)) {
    conditions.push(`r.service_radius_km IS NOT NULL AND r.service_radius_km <= $${i}`);
    values.push(filters.radius_km);
    i += 1;
  }
  if (filters.status) {
    if (filters.status === "active") conditions.push("r.is_active = true AND r.is_blocked = false");
    if (filters.status === "inactive") conditions.push("r.is_active = false AND r.is_blocked = false");
    if (filters.status === "blocked") conditions.push("r.is_blocked = true");
    if (filters.status === "open") conditions.push("r.is_open = true AND r.is_blocked = false");
    if (filters.status === "closed") conditions.push("r.is_open = false AND r.is_blocked = false");
    if (filters.status === "pending") conditions.push(`r.approval_status = 'pending'`);
    if (filters.status === "approved") conditions.push(`r.approval_status = 'approved'`);
    if (filters.status === "rejected") conditions.push(`r.approval_status = 'rejected'`);
  }

  values.push(filters.limit);
  const limitPlaceholder = `$${i++}`;
  values.push(filters.offset);
  const offsetPlaceholder = `$${i++}`;

  const r = await pool.query(
    `SELECT
       r.*,
       u.full_name AS owner_name,
       u.phone AS owner_phone,
       u.email AS owner_email,
       (
         SELECT COUNT(*)::int
         FROM restaurant.restaurants b
         WHERE b.parent_id = r.id
       ) AS branches_count
     FROM restaurant.restaurants r
     LEFT JOIN auth.users u ON u.id = r.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY r.created_at DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );

  return r.rows.map((row) => ({
    ...row,
    branches_count: Number(row.branches_count ?? 0),
  }));
}

export async function countAllForAdmin(
  filters: Omit<AdminRestaurantListFilters, "limit" | "offset">
): Promise<number> {
  const conditions: string[] = ["parent_id IS NULL"];
  const values: unknown[] = [];
  let i = 1;

  if (filters.user_id) {
    conditions.push(`user_id = $${i}`);
    values.push(filters.user_id);
    i += 1;
  }

  if (filters.search) {
    conditions.push(`(name ILIKE $${i} OR address ILIKE $${i} OR contact_email ILIKE $${i})`);
    values.push(`%${filters.search}%`);
    i += 1;
  }
  if (filters.zone) {
    conditions.push(`zone ILIKE $${i}`);
    values.push(`%${filters.zone}%`);
    i += 1;
  }
  if (filters.cuisine) {
    conditions.push(`cuisine ILIKE $${i}`);
    values.push(`%${filters.cuisine}%`);
    i += 1;
  }
  if (typeof filters.radius_km === "number" && Number.isFinite(filters.radius_km)) {
    conditions.push(`service_radius_km IS NOT NULL AND service_radius_km <= $${i}`);
    values.push(filters.radius_km);
    i += 1;
  }
  if (filters.status) {
    if (filters.status === "active") conditions.push("is_active = true AND is_blocked = false");
    if (filters.status === "inactive") conditions.push("is_active = false AND is_blocked = false");
    if (filters.status === "blocked") conditions.push("is_blocked = true");
    if (filters.status === "open") conditions.push("is_open = true AND is_blocked = false");
    if (filters.status === "closed") conditions.push("is_open = false AND is_blocked = false");
    if (filters.status === "pending") conditions.push(`approval_status = 'pending'`);
    if (filters.status === "approved") conditions.push(`approval_status = 'approved'`);
    if (filters.status === "rejected") conditions.push(`approval_status = 'rejected'`);
  }

  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM restaurant.restaurants
     WHERE ${conditions.join(" AND ")}`,
    values
  );
  return r.rows[0]?.total ?? 0;
}

export async function getAdminRestaurantStats(): Promise<AdminRestaurantStatsRow> {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS total_restaurants,
       COUNT(*) FILTER (WHERE is_active = true AND is_blocked = false)::int AS active_restaurants,
       COUNT(*) FILTER (WHERE is_active = false AND is_blocked = false)::int AS inactive_restaurants,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS newly_joined_restaurants
     FROM restaurant.restaurants
     WHERE parent_id IS NULL`
  );

  return r.rows[0] as AdminRestaurantStatsRow;
}

export async function listPublic(opts: {
  limit: number;
  offset: number;
  cuisine?: string;
}): Promise<RestaurantRow[]> {
  const conditions = [
    "parent_id IS NULL",
    "is_active = true",
    "is_blocked = false",
    "is_open = true",
  ];
  const values: unknown[] = [];
  let i = 1;

  if (opts.cuisine) {
    conditions.push(`cuisine ILIKE $${i++}`);
    values.push(opts.cuisine);
  }

  values.push(opts.limit, opts.offset);
  const r = await pool.query(
    `SELECT * FROM restaurant.restaurants
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    values
  );
  return r.rows;
}

export async function getTopNearby(params: {
  lat: number;
  lng: number;
  limit: number;
}): Promise<(RestaurantRow & { distance_km: number; rating: number })[]> {
  const distanceSql = `(6371 * acos(LEAST(1, GREATEST(-1,
    cos(radians($1)) * cos(radians(r.latitude::numeric)) *
    cos(radians(r.longitude::numeric) - radians($2)) +
    sin(radians($1)) * sin(radians(r.latitude::numeric))
  ))))`;
  const result = await pool.query(
    `SELECT r.*,
            ${distanceSql} AS distance_km,
            COALESCE((r.additional_data ->> 'rating')::numeric, 0) AS rating
     FROM restaurant.restaurants r
     WHERE r.parent_id IS NULL
       AND r.is_active = true
       AND r.is_blocked = false
       AND r.is_open = true
       AND r.latitude IS NOT NULL
       AND r.longitude IS NOT NULL
     ORDER BY distance_km ASC, r.created_at DESC
     LIMIT $3`,
    [params.lat, params.lng, params.limit]
  );
  return result.rows;
}

export async function countPublic(opts?: { cuisine?: string }): Promise<number> {
  const conditions = [
    "parent_id IS NULL",
    "is_active = true",
    "is_blocked = false",
    "is_open = true",
  ];
  const values: unknown[] = [];
  let i = 1;

  if (opts?.cuisine) {
    conditions.push(`cuisine ILIKE $${i++}`);
    values.push(opts.cuisine);
  }

  const r = await pool.query(
    `SELECT COUNT(*)::int AS total FROM restaurant.restaurants WHERE ${conditions.join(" AND ")}`,
    values
  );
  return r.rows[0]?.total ?? 0;
}

export async function update(id: string, params: UpdateRestaurantParams): Promise<RestaurantRow | null> {
  const allowed: (keyof UpdateRestaurantParams)[] = [
    "name", "address", "zone", "latitude", "longitude", "service_radius_km", "cuisine", "logo_url", "cover_image_url",
    "delivery_time_min", "delivery_time_max", "tags", "tin", "tin_expiry_date",
    "certificate_url", "additional_data", "contact_email", "phone", "tax_type", "tax_rate",
    "free_delivery_enabled", "free_delivery_max_amount", "free_delivery_min_distance_km",
    "description", "is_active", "is_open", "is_blocked", "approval_status", "rejection_reason",
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
    lat: row.latitude != null ? parseFloat(String(row.latitude)) : null,
    lng: row.longitude != null ? parseFloat(String(row.longitude)) : null,
    radius_km: row.service_radius_km != null ? parseFloat(String(row.service_radius_km)) : null,
    latitude: row.latitude != null ? parseFloat(String(row.latitude)) : null,
    longitude: row.longitude != null ? parseFloat(String(row.longitude)) : null,
    service_radius_km: row.service_radius_km != null ? parseFloat(String(row.service_radius_km)) : null,
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
    approval_status: row.approval_status ?? "pending",
    rejection_reason: row.rejection_reason ?? null,
    contact_email: row.contact_email,
    phone: row.phone,
    tax_type: row.tax_type,
    tax_rate: parseFloat(String(row.tax_rate)),
    free_delivery_enabled: row.free_delivery_enabled,
    free_delivery_max_amount: row.free_delivery_max_amount != null ? parseFloat(String(row.free_delivery_max_amount)) : null,
    free_delivery_min_distance_km: row.free_delivery_min_distance_km != null ? parseFloat(String(row.free_delivery_min_distance_km)) : null,
    description: row.description,
    rating_avg: row.rating_avg != null ? parseFloat(String(row.rating_avg)) : 0,
    rating_count: row.rating_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
