import { Pool, PoolClient } from "pg";

export interface DbConfig {
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_DB: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
}

/**
 * Creates a PostgreSQL connection pool for a specific schema
 */
export function createDbPool(
  config: DbConfig,
  schema: string | null = null
): Pool {
  const pool = new Pool({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Set default schema if provided
  if (schema) {
    pool.on("connect", async (client: PoolClient) => {
      await client.query(`SET search_path TO ${schema}, public`);
    });
  }

  // Handle pool errors
  pool.on("error", (err: Error) => {
    console.error("Unexpected error on idle client", err);
  });

  return pool;
}

/**
 * Test database connection
 */
export async function testConnection(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query("SELECT NOW()");
    return result.rows.length > 0;
  } catch (error) {
    console.error("Database connection test failed:", error);
    return false;
  }
}

export default {
  createDbPool,
  testConnection,
};
