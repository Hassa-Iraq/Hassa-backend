import pool from "../db/connection";

export interface CuisineCategoryRow {
  id: string;
  name: string;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function listPublic(): Promise<CuisineCategoryRow[]> {
  const result = await pool.query<CuisineCategoryRow>(
    `SELECT * FROM restaurant.cuisine_categories
     WHERE is_active = true
     ORDER BY display_order ASC, name ASC`
  );
  return result.rows;
}

export async function listForAdmin(opts: {
  limit: number;
  offset: number;
}): Promise<CuisineCategoryRow[]> {
  const result = await pool.query<CuisineCategoryRow>(
    `SELECT * FROM restaurant.cuisine_categories
     ORDER BY display_order ASC, name ASC
     LIMIT $1 OFFSET $2`,
    [opts.limit, opts.offset]
  );
  return result.rows;
}

export async function countForAdmin(): Promise<number> {
  const result = await pool.query<{ total: number }>(
    "SELECT COUNT(*)::int AS total FROM restaurant.cuisine_categories"
  );
  return result.rows[0]?.total ?? 0;
}

export async function findById(id: string): Promise<CuisineCategoryRow | null> {
  const result = await pool.query<CuisineCategoryRow>(
    "SELECT * FROM restaurant.cuisine_categories WHERE id = $1",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function create(params: {
  name: string;
  image_url?: string | null;
  display_order?: number;
  is_active?: boolean;
}): Promise<CuisineCategoryRow> {
  const result = await pool.query<CuisineCategoryRow>(
    `INSERT INTO restaurant.cuisine_categories (name, image_url, display_order, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.name.trim(),
      params.image_url ?? null,
      params.display_order ?? 0,
      params.is_active ?? true,
    ]
  );
  return result.rows[0];
}

export async function update(
  id: string,
  params: {
    name?: string;
    image_url?: string | null;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<CuisineCategoryRow | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.name !== undefined) {
    updates.push(`name = $${i++}`);
    values.push(params.name.trim());
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

  if (updates.length === 0) return findById(id);

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query<CuisineCategoryRow>(
    `UPDATE restaurant.cuisine_categories SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function deleteById(id: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM restaurant.cuisine_categories WHERE id = $1",
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}
