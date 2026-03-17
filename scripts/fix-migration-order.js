/**
 * One-time fix script for skipped migration 20250217000007_delivery_schema.
 *
 * What it does:
 *   1. Reads DB credentials from .env (same logic as migrate.js)
 *   2. Checks whether the migration is already recorded in pgmigrations
 *   3. Applies the skipped migration SQL (all statements use IF NOT EXISTS — safe to re-run)
 *   4. Inserts a row into pgmigrations so node-pg-migrate treats it as already run
 *   5. Runs `npm run migrate` to apply any remaining pending migrations
 *
 * Usage (on the VPS):
 *   node scripts/fix-migration-order.js
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const { execSync } = require("child_process");
const { Client } = require("pg");

const MIGRATION_NAME = "20250217000007_delivery_schema";
const rootDir = join(__dirname, "..");

function loadEnvFile() {
  try {
    const envContent = readFileSync(join(rootDir, ".env"), "utf-8");
    const env = {};
    envContent.split("\n").forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join("=").replace(/^["']|["']$/g, "");
        }
      }
    });
    return env;
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Warning: could not read .env:", e.message);
    return {};
  }
}

function getDatabaseConfig() {
  const env = { ...loadEnvFile(), ...process.env };
  let host = env.POSTGRES_HOST || "localhost";
  if (host === "postgres") host = "localhost";
  return {
    host,
    port: parseInt(env.POSTGRES_PORT || (host === "localhost" ? "5433" : "5432"), 10),
    database: env.POSTGRES_DB || "hassa",
    user: env.POSTGRES_USER || "postgres",
    password: env.POSTGRES_PASSWORD || "postgres",
  };
}

const MIGRATION_SQL = `
CREATE SCHEMA IF NOT EXISTS delivery;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'delivery_status' AND n.nspname = 'delivery'
  ) THEN
    CREATE TYPE delivery.delivery_status AS ENUM (
      'pending_assignment',
      'assigned',
      'accepted_by_driver',
      'arrived_at_pickup',
      'picked_up',
      'on_the_way',
      'delivered',
      'cancelled',
      'failed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS delivery.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE,
  customer_user_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  driver_user_id UUID NOT NULL,
  status delivery.delivery_status NOT NULL DEFAULT 'pending_assignment',
  pickup_address TEXT,
  dropoff_address TEXT,
  pickup_latitude NUMERIC(10,8),
  pickup_longitude NUMERIC(11,8),
  dropoff_latitude NUMERIC(10,8),
  dropoff_longitude NUMERIC(11,8),
  delivery_notes TEXT,
  proof_image_url TEXT,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON delivery.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_user_id ON delivery.deliveries(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer_user_id ON delivery.deliveries(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_restaurant_id ON delivery.deliveries(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON delivery.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON delivery.deliveries(created_at DESC);

CREATE TABLE IF NOT EXISTS delivery.driver_status (
  driver_user_id UUID PRIMARY KEY,
  is_online BOOLEAN NOT NULL DEFAULT false,
  is_available BOOLEAN NOT NULL DEFAULT false,
  current_latitude NUMERIC(10,8),
  current_longitude NUMERIC(11,8),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_status_online ON delivery.driver_status(is_online);
CREATE INDEX IF NOT EXISTS idx_driver_status_available ON delivery.driver_status(is_available);
CREATE INDEX IF NOT EXISTS idx_driver_status_last_seen ON delivery.driver_status(last_seen_at DESC);

CREATE OR REPLACE FUNCTION delivery.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliveries_updated_at ON delivery.deliveries;
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON delivery.deliveries
  FOR EACH ROW EXECUTE PROCEDURE delivery.set_updated_at();

DROP TRIGGER IF EXISTS driver_status_updated_at ON delivery.driver_status;
CREATE TRIGGER driver_status_updated_at
  BEFORE UPDATE ON delivery.driver_status
  FOR EACH ROW EXECUTE PROCEDURE delivery.set_updated_at();
`;

async function main() {
  const config = getDatabaseConfig();
  const client = new Client(config);

  console.log(`\nConnecting to database "${config.database}" at ${config.host}:${config.port}...`);

  await client.connect();
  console.log("Connected.\n");

  try {
    const { rows } = await client.query(
      "SELECT name FROM pgmigrations WHERE name = $1",
      [MIGRATION_NAME]
    );

    if (rows.length > 0) {
      console.log(`[SKIP] "${MIGRATION_NAME}" is already recorded in pgmigrations. Nothing to fix.`);
      return;
    }

    console.log(`[INFO] "${MIGRATION_NAME}" is missing from pgmigrations. Starting fix...\n`);
    console.log("[STEP 1/2] Applying skipped migration SQL...");
    await client.query(MIGRATION_SQL);
    console.log("[STEP 1/2] Done — delivery schema is in place.\n");

    console.log("[STEP 2/2] Recording migration in pgmigrations table...");
    await client.query(
      "INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())",
      [MIGRATION_NAME]
    );
    console.log("[STEP 2/2] Done — migration marked as run.\n");

    const { rows: allMigrations } = await client.query(
      "SELECT name, run_on FROM pgmigrations ORDER BY run_on ASC"
    );
    console.log("Current pgmigrations table:");
    allMigrations.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));
    console.log();

  } finally {
    await client.end();
  }

  console.log("[FINAL] Running npm run migrate...\n");
  execSync("npm run migrate", { stdio: "inherit", cwd: rootDir });
}

main().catch((err) => {
  console.error("\nFix script failed:", err.message);
  process.exit(1);
});
