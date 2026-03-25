import pool from "../db/connection";

export interface BannerRow {
  id: string;
  restaurant_id: string;
  banner_name: string;
  banner_image_url: string;
  description: string | null;
  status: string;
  approved_at: Date | null;
  is_public: boolean;
  valid_from: Date | null;
  valid_to: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface BannerWithRestaurantRow extends BannerRow {
  restaurant_name: string;
}

export interface ListOwnerBannersParams {
  owner_user_id: string;
  limit: number;
  offset: number;
  restaurant_id?: string;
  status?: string;
}

export async function findRestaurantOwnerId(restaurantId: string): Promise<string | null> {
  const result = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM restaurant.restaurants WHERE id = $1",
    [restaurantId]
  );
  return result.rows[0]?.user_id ?? null;
}

export async function findBannerOwnerId(bannerId: string): Promise<string | null> {
  const result = await pool.query<{ user_id: string }>(
    `SELECT r.user_id
     FROM banners.banners b
     JOIN restaurant.restaurants r ON b.restaurant_id = r.id
     WHERE b.id = $1`,
    [bannerId]
  );
  return result.rows[0]?.user_id ?? null;
}

export async function create(params: {
  restaurant_id: string;
  banner_name: string;
  banner_image_url: string;
  description?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}): Promise<BannerRow> {
  const result = await pool.query<BannerRow>(
    `INSERT INTO banners.banners
     (restaurant_id, banner_name, banner_image_url, description, status, valid_from, valid_to)
     VALUES ($1, $2, $3, $4, 'requested', $5, $6)
     RETURNING *`,
    [
      params.restaurant_id,
      params.banner_name,
      params.banner_image_url,
      params.description ?? null,
      params.valid_from ?? null,
      params.valid_to ?? null,
    ]
  );
  return result.rows[0];
}

export async function listByOwner(params: ListOwnerBannersParams): Promise<BannerWithRestaurantRow[]> {
  const values: unknown[] = [params.owner_user_id];
  let i = 2;
  let query = `SELECT b.*, r.name AS restaurant_name
               FROM banners.banners b
               JOIN restaurant.restaurants r ON b.restaurant_id = r.id
               WHERE r.user_id = $1`;

  if (params.restaurant_id) {
    query += ` AND b.restaurant_id = $${i++}`;
    values.push(params.restaurant_id);
  }
  if (params.status) {
    query += ` AND b.status = $${i++}`;
    values.push(params.status);
  }

  query += ` ORDER BY b.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
  values.push(params.limit, params.offset);

  const result = await pool.query<BannerWithRestaurantRow>(query, values);
  return result.rows;
}

export async function countByOwner(params: {
  owner_user_id: string;
  restaurant_id?: string;
  status?: string;
}): Promise<number> {
  const values: unknown[] = [params.owner_user_id];
  let i = 2;
  let query = `SELECT COUNT(*)::int AS total
               FROM banners.banners b
               JOIN restaurant.restaurants r ON b.restaurant_id = r.id
               WHERE r.user_id = $1`;

  if (params.restaurant_id) {
    query += ` AND b.restaurant_id = $${i++}`;
    values.push(params.restaurant_id);
  }
  if (params.status) {
    query += ` AND b.status = $${i}`;
    values.push(params.status);
  }

  const result = await pool.query<{ total: number }>(query, values);
  return result.rows[0]?.total ?? 0;
}

export async function findByIdForOwner(
  id: string,
  owner_user_id: string
): Promise<BannerWithRestaurantRow | null> {
  const result = await pool.query<BannerWithRestaurantRow>(
    `SELECT b.*, r.name AS restaurant_name
     FROM banners.banners b
     JOIN restaurant.restaurants r ON b.restaurant_id = r.id
     WHERE b.id = $1 AND r.user_id = $2`,
    [id, owner_user_id]
  );
  return result.rows[0] ?? null;
}

export async function listPublic(params: {
  now: Date;
  limit: number;
  offset: number;
}): Promise<BannerWithRestaurantRow[]> {
  const result = await pool.query<BannerWithRestaurantRow>(
    `SELECT b.*, r.name AS restaurant_name
     FROM banners.banners b
     JOIN restaurant.restaurants r ON b.restaurant_id = r.id
     WHERE b.status = 'approved' AND (b.is_public = true OR b.is_public IS NULL)
       AND (b.valid_from IS NULL OR b.valid_from <= $1)
       AND (b.valid_to IS NULL OR b.valid_to >= $1)
     ORDER BY b.approved_at DESC NULLS LAST, b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [params.now, params.limit, params.offset]
  );
  return result.rows;
}

export async function countPublic(now: Date): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM banners.banners b
     WHERE b.status = 'approved' AND (b.is_public = true OR b.is_public IS NULL)
       AND (b.valid_from IS NULL OR b.valid_from <= $1)
       AND (b.valid_to IS NULL OR b.valid_to >= $1)`,
    [now]
  );
  return result.rows[0]?.total ?? 0;
}
