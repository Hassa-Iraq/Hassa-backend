import pool from "../db/connection";

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  nutrition: Record<string, unknown> | null;
  search_tags: string[] | null;
  is_available: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMenuItemParams {
  restaurant_id: string;
  category_id?: string | null;
  subcategory_id?: string | null;
  name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  nutrition?: Record<string, unknown> | null;
  search_tags?: string[] | null;
  is_available?: boolean;
  display_order?: number;
}

export interface UpdateMenuItemParams {
  category_id?: string | null;
  subcategory_id?: string | null;
  name?: string;
  description?: string | null;
  price?: number;
  image_url?: string | null;
  nutrition?: Record<string, unknown> | null;
  search_tags?: string[] | null;
  is_available?: boolean;
  display_order?: number;
}

export async function create(params: CreateMenuItemParams): Promise<MenuItemRow> {
  const r = await pool.query(
    `INSERT INTO restaurant.menu_items (
      restaurant_id, category_id, subcategory_id, name, description, price, image_url, nutrition, search_tags, is_available, display_order
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      params.restaurant_id,
      params.category_id ?? null,
      params.subcategory_id ?? null,
      params.name,
      params.description ?? null,
      params.price,
      params.image_url ?? null,
      params.nutrition ? JSON.stringify(params.nutrition) : null,
      params.search_tags ?? null,
      params.is_available !== undefined ? params.is_available : true,
      params.display_order ?? 0,
    ]
  );
  return r.rows[0];
}

export async function findById(id: string): Promise<MenuItemRow | null> {
  const r = await pool.query("SELECT * FROM restaurant.menu_items WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function findByRestaurantId(
  restaurant_id: string,
  opts?: { category_id?: string; subcategory_id?: string; limit?: number; offset?: number }
): Promise<MenuItemRow[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  let q = "SELECT * FROM restaurant.menu_items WHERE restaurant_id = $1";
  const vals: unknown[] = [restaurant_id];
  let i = 2;
  if (opts?.category_id) {
    q += ` AND category_id = $${i++}`;
    vals.push(opts.category_id);
  }
  if (opts?.subcategory_id) {
    q += ` AND subcategory_id = $${i++}`;
    vals.push(opts.subcategory_id);
  }
  vals.push(limit, offset);
  q += ` ORDER BY display_order ASC, created_at ASC LIMIT $${i++} OFFSET $${i}`;
  const r = await pool.query(q, vals);
  return r.rows;
}

export async function countByRestaurantId(
  restaurant_id: string,
  category_id?: string | null,
  subcategory_id?: string | null
): Promise<number> {
  let q = "SELECT COUNT(*)::int AS total FROM restaurant.menu_items WHERE restaurant_id = $1";
  const vals: unknown[] = [restaurant_id];
  let i = 2;
  if (category_id) {
    q += ` AND category_id = $${i++}`;
    vals.push(category_id);
  }
  if (subcategory_id) {
    q += ` AND subcategory_id = $${i++}`;
    vals.push(subcategory_id);
  }
  const r = await pool.query(q, vals);
  return r.rows[0]?.total ?? 0;
}

export async function update(id: string, params: UpdateMenuItemParams): Promise<MenuItemRow | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (params.category_id !== undefined) {
    updates.push(`category_id = $${i++}`);
    values.push(params.category_id);
  }
  if (params.subcategory_id !== undefined) {
    updates.push(`subcategory_id = $${i++}`);
    values.push(params.subcategory_id);
  }
  if (params.name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(params.name);
  }
  if (params.description !== undefined) {
    updates.push(`description = $${i++}`);
    values.push(params.description);
  }
  if (params.price !== undefined) {
    updates.push(`price = $${i++}`);
    values.push(params.price);
  }
  if (params.image_url !== undefined) {
    updates.push(`image_url = $${i++}`);
    values.push(params.image_url);
  }
  if (params.nutrition !== undefined) {
    updates.push(`nutrition = $${i++}`);
    values.push(params.nutrition == null ? null : JSON.stringify(params.nutrition));
  }
  if (params.search_tags !== undefined) {
    updates.push(`search_tags = $${i++}`);
    values.push(params.search_tags);
  }
  if (params.is_available !== undefined) {
    updates.push(`is_available = $${i++}`);
    values.push(params.is_available);
  }
  if (params.display_order !== undefined) {
    updates.push(`display_order = $${i++}`);
    values.push(params.display_order);
  }
  if (updates.length === 0) return findById(id);
  values.push(id);
  const r = await pool.query(
    `UPDATE restaurant.menu_items SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ?? null;
}

export async function getRecommendedDishes(
  restaurantIds: string[],
  limit: number
): Promise<(MenuItemRow & { restaurant_name: string })[]> {
  if (restaurantIds.length === 0) return [];
  const placeholders = restaurantIds.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `SELECT mi.*, r.name AS restaurant_name
     FROM restaurant.menu_items mi
     JOIN restaurant.restaurants r ON r.id = mi.restaurant_id
     WHERE mi.restaurant_id IN (${placeholders})
       AND mi.is_available = true
     ORDER BY mi.display_order ASC, mi.created_at ASC
     LIMIT $${restaurantIds.length + 1}`,
    [...restaurantIds, limit]
  );
  return result.rows;
}

export async function deleteById(id: string): Promise<boolean> {
  const r = await pool.query("DELETE FROM restaurant.menu_items WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export function toResponse(row: MenuItemRow): Record<string, unknown> {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    category_id: row.category_id,
    subcategory_id: row.subcategory_id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price),
    image_url: row.image_url,
    nutrition: row.nutrition,
    search_tags: row.search_tags,
    is_available: row.is_available,
    display_order: row.display_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
