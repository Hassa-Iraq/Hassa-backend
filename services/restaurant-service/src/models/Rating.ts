import pool from "../db/connection";
import { PoolClient } from "pg";

export interface RatingRow {
  id: string;
  restaurant_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  review: string | null;
  is_visible: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRatingInput {
  restaurant_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  review?: string | null;
}

export interface RatingWithCustomer extends RatingRow {
  customer_name: string | null;
  customer_avatar: string | null;
}

export interface RatingSummary {
  average: number;
  total: number;
  breakdown: Record<string, number>;
}

export async function findByOrderId(order_id: string): Promise<RatingRow | null> {
  const r = await pool.query(
    `SELECT * FROM restaurant.restaurant_ratings WHERE order_id = $1`,
    [order_id]
  );
  return (r.rows[0] as RatingRow | undefined) ?? null;
}

export async function create(input: CreateRatingInput): Promise<RatingRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `INSERT INTO restaurant.restaurant_ratings
         (restaurant_id, user_id, order_id, rating, review)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.restaurant_id,
        input.user_id,
        input.order_id,
        input.rating,
        input.review ?? null,
      ]
    );
    const row = r.rows[0] as RatingRow;

    await recalculateAvg(client, input.restaurant_id);

    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setVisibility(id: string, is_visible: boolean): Promise<RatingRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `UPDATE restaurant.restaurant_ratings
       SET is_visible = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_visible, id]
    );
    const row = (r.rows[0] as RatingRow | undefined) ?? null;

    if (row) {
      await recalculateAvg(client, row.restaurant_id);
    }

    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function list(
  restaurant_id: string,
  opts: { limit: number; offset: number }
): Promise<RatingWithCustomer[]> {
  const r = await pool.query(
    `SELECT
       rr.*,
       u.full_name AS customer_name,
       u.profile_picture_url AS customer_avatar
     FROM restaurant.restaurant_ratings rr
     LEFT JOIN auth.users u ON u.id = rr.user_id
     WHERE rr.restaurant_id = $1 AND rr.is_visible = true
     ORDER BY rr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [restaurant_id, opts.limit, opts.offset]
  );
  return r.rows as RatingWithCustomer[];
}

export async function count(restaurant_id: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM restaurant.restaurant_ratings
     WHERE restaurant_id = $1 AND is_visible = true`,
    [restaurant_id]
  );
  return r.rows[0]?.total ?? 0;
}

export async function getSummary(restaurant_id: string): Promise<RatingSummary> {
  const r = await pool.query(
    `SELECT
       ROUND(AVG(rating)::numeric, 2) AS average,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE rating = 5)::int AS five,
       COUNT(*) FILTER (WHERE rating = 4)::int AS four,
       COUNT(*) FILTER (WHERE rating = 3)::int AS three,
       COUNT(*) FILTER (WHERE rating = 2)::int AS two,
       COUNT(*) FILTER (WHERE rating = 1)::int AS one
     FROM restaurant.restaurant_ratings
     WHERE restaurant_id = $1 AND is_visible = true`,
    [restaurant_id]
  );
  const row = r.rows[0];
  return {
    average: row?.average != null ? parseFloat(row.average) : 0,
    total: row?.total ?? 0,
    breakdown: {
      "5": row?.five ?? 0,
      "4": row?.four ?? 0,
      "3": row?.three ?? 0,
      "2": row?.two ?? 0,
      "1": row?.one ?? 0,
    },
  };
}

async function recalculateAvg(client: PoolClient, restaurant_id: string): Promise<void> {
  await client.query(
    `UPDATE restaurant.restaurants
     SET
       rating_avg = COALESCE((
         SELECT ROUND(AVG(rating)::numeric, 2)
         FROM restaurant.restaurant_ratings
         WHERE restaurant_id = $1 AND is_visible = true
       ), 0),
       rating_count = COALESCE((
         SELECT COUNT(*)::int
         FROM restaurant.restaurant_ratings
         WHERE restaurant_id = $1 AND is_visible = true
       ), 0),
       updated_at = NOW()
     WHERE id = $1`,
    [restaurant_id]
  );
}

export function toResponse(row: RatingWithCustomer | RatingRow): Record<string, unknown> {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    order_id: row.order_id,
    rating: row.rating,
    review: row.review,
    customer_name: "customer_name" in row ? maskName(row.customer_name) : null,
    customer_avatar: "customer_avatar" in row ? (row as RatingWithCustomer).customer_avatar : null,
    created_at: row.created_at,
  };
}

function maskName(name: string | null): string {
  if (!name || !name.trim()) return "Customer";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
