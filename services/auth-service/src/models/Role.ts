import pool from "../db/connection";

export interface RoleRow {
  id: string;
  name: string;
}

export async function findByName(name: string): Promise<RoleRow | null> {
  const result = await pool.query<RoleRow>(
    "SELECT id, name FROM auth.roles WHERE name = $1",
    [name]
  );
  return result.rows[0] ?? null;
}

export default { findByName };
