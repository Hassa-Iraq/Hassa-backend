import pool from "../db/connection";

export interface AddressRow {
  id: string;
  user_id: string;
  complete_address: string;
  category: string;
  landmark: string | null;
  location_details: string | null;
  latitude: string | null;
  longitude: string | null;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAddressInput {
  user_id: string;
  complete_address: string;
  category?: string;
  landmark?: string | null;
  location_details?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_default?: boolean;
}

export interface UpdateAddressInput {
  complete_address?: string;
  category?: string;
  landmark?: string | null;
  location_details?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_default?: boolean;
}

export async function listByUserId(userId: string): Promise<AddressRow[]> {
  const result = await pool.query<AddressRow>(
    `SELECT *
     FROM auth.user_addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function findByIdForUser(id: string, userId: string): Promise<AddressRow | null> {
  const result = await pool.query<AddressRow>(
    `SELECT *
     FROM auth.user_addresses
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ?? null;
}

export async function create(input: CreateAddressInput): Promise<AddressRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.is_default === true) {
      await client.query(
        `UPDATE auth.user_addresses
         SET is_default = false
         WHERE user_id = $1`,
        [input.user_id]
      );
    }
    const result = await client.query<AddressRow>(
      `INSERT INTO auth.user_addresses (
         user_id, complete_address, category, landmark, location_details, latitude, longitude, is_default
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.user_id,
        input.complete_address,
        input.category ?? "Other",
        input.landmark ?? null,
        input.location_details ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.is_default === true,
      ]
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateForUser(
  id: string,
  userId: string,
  input: UpdateAddressInput
): Promise<AddressRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.is_default === true) {
      await client.query(
        `UPDATE auth.user_addresses
         SET is_default = false
         WHERE user_id = $1`,
        [userId]
      );
    }

    const set: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (input.complete_address !== undefined) {
      set.push(`complete_address = $${i++}`);
      values.push(input.complete_address);
    }
    if (input.category !== undefined) {
      set.push(`category = $${i++}`);
      values.push(input.category);
    }
    if (input.landmark !== undefined) {
      set.push(`landmark = $${i++}`);
      values.push(input.landmark);
    }
    if (input.location_details !== undefined) {
      set.push(`location_details = $${i++}`);
      values.push(input.location_details);
    }
    if (input.latitude !== undefined) {
      set.push(`latitude = $${i++}`);
      values.push(input.latitude);
    }
    if (input.longitude !== undefined) {
      set.push(`longitude = $${i++}`);
      values.push(input.longitude);
    }
    if (input.is_default !== undefined) {
      set.push(`is_default = $${i++}`);
      values.push(input.is_default);
    }

    if (set.length === 0) {
      await client.query("ROLLBACK");
      return findByIdForUser(id, userId);
    }

    values.push(id, userId);
    const result = await client.query<AddressRow>(
      `UPDATE auth.user_addresses
       SET ${set.join(", ")}
       WHERE id = $${i++} AND user_id = $${i}
       RETURNING *`,
      values
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteForUser(id: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM auth.user_addresses
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export function toResponse(row: AddressRow): Record<string, unknown> {
  return {
    id: row.id,
    user_id: row.user_id,
    complete_address: row.complete_address,
    category: row.category,
    landmark: row.landmark,
    location_details: row.location_details,
    latitude: row.latitude != null ? parseFloat(String(row.latitude)) : null,
    longitude: row.longitude != null ? parseFloat(String(row.longitude)) : null,
    is_default: row.is_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
