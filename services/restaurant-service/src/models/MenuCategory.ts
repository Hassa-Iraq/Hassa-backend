import pool from "../db/connection";

export interface MenuCategoryRow {
  id: string;
  restaurant_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMenuCategoryParams {
  restaurant_id: string;
  parent_id?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  display_order?: number;
}

export interface UpdateMenuCategoryParams {
  parent_id?: string | null;
  name?: string;
  description?: string | null;
  image_url?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export async function create(params: CreateMenuCategoryParams): Promise<MenuCategoryRow> {
  let order = params.display_order;
  if (order === undefined) {
    const r = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
       FROM restaurant.menu_categories
       WHERE restaurant_id = $1 AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000') = COALESCE($2, '00000000-0000-0000-0000-000000000000')`,
      [params.restaurant_id, params.parent_id ?? null]
    );
    order = r.rows[0]?.next_order ?? 0;
  }
  const res = await pool.query(
    `INSERT INTO restaurant.menu_categories (restaurant_id, parent_id, name, description, image_url, display_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
    [
      params.restaurant_id,
      params.parent_id ?? null,
      params.name,
      params.description ?? null,
      params.image_url ?? null,
      order,
    ]
  );
  return res.rows[0];
}

export async function findById(id: string): Promise<MenuCategoryRow | null> {
  const r = await pool.query("SELECT * FROM restaurant.menu_categories WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function findByRestaurantId(
  restaurant_id: string,
  opts?: { limit?: number; offset?: number }
): Promise<MenuCategoryRow[]> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const r = await pool.query(
    `SELECT * FROM restaurant.menu_categories WHERE restaurant_id = $1 ORDER BY display_order ASC, created_at ASC LIMIT $2 OFFSET $3`,
    [restaurant_id, limit, offset]
  );
  return r.rows;
}

export async function countByRestaurantId(restaurant_id: string): Promise<number> {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS total FROM restaurant.menu_categories WHERE restaurant_id = $1",
    [restaurant_id]
  );
  return r.rows[0]?.total ?? 0;
}

export async function update(id: string, params: UpdateMenuCategoryParams): Promise<MenuCategoryRow | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (params.name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(params.name);
  }
  if (params.description !== undefined) {
    updates.push(`description = $${i++}`);
    values.push(params.description);
  }
  if (params.image_url !== undefined) {
    updates.push(`image_url = $${i++}`);
    values.push(params.image_url);
  }
  if (params.display_order !== undefined) {
    updates.push(`display_order = $${i++}`);
    values.push(params.display_order);
  }
  if (params.is_active !== undefined) {
    updates.push(`is_active = $${i++}`);
    values.push(params.is_active);
  }
  if (params.parent_id !== undefined) {
    updates.push(`parent_id = $${i++}`);
    values.push(params.parent_id);
  }
  if (updates.length === 0) return findById(id);
  values.push(id);
  const r = await pool.query(
    `UPDATE restaurant.menu_categories SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ?? null;
}

export async function findSubcategories(parent_id: string): Promise<MenuCategoryRow[]> {
  const r = await pool.query(
    `SELECT * FROM restaurant.menu_categories
     WHERE parent_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [parent_id]
  );
  return r.rows;
}

export async function countSubcategories(parent_id: string): Promise<number> {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS total FROM restaurant.menu_categories WHERE parent_id = $1",
    [parent_id]
  );
  return r.rows[0]?.total ?? 0;
}

export async function deleteById(id: string): Promise<boolean> {
  const r = await pool.query("DELETE FROM restaurant.menu_categories WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}
