/**
 * Applies the initial schema (database/migrations) to the current database.
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const { Client } = require("pg");

const rootDir = join(__dirname, "..");
const migrationsInitialDir = join(rootDir, "database", "migrations");
const initialSchemaFile = join(migrationsDir, "20250213000001_initial_schema.sql");

function loadEnvFile() {
  try {
    const envPath = join(rootDir, ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const env = {};
    envContent.split("\n").forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, "");
          env[key.trim()] = value;
        }
      }
    });
    return env;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error loading .env file", error.message);
    }
    return {};
  }
}

function loadEnv() {
  const envFile = loadEnvFile();
  const merged = { ...envFile };
  Object.keys(process.env).forEach((key) => {
    if (process.env[key] !== undefined) {
      merged[key] = process.env[key];
    }
  });
  return merged;
}

function getDbConfig(env) {
  let host = env.POSTGRES_HOST || "localhost";
  if (host === "postgres") {
    host = "localhost";
  }
  const port = parseInt(env.POSTGRES_PORT || (host === "localhost" ? "5433" : "5432"), 10);
  const database = env.POSTGRES_DB || "hassa";
  const user = env.POSTGRES_USER || "postgres";
  const password = env.POSTGRES_PASSWORD || "postgres";
  return { host, port, database, user, password };
}

async function run() {
  const env = loadEnv();
  const config = getDbConfig(env);

  let sql;
  try {
    sql = readFileSync(initialSchemaFile, "utf-8");
  } catch (error) {
    console.error("Error: Initial schema file not found", initialSchemaFile);
    process.exit(1);
  }

  const client = new Client(config);
  try {
    await client.connect();
    console.log("Applying initial schema to database", config.database);
    await client.query(sql);
    console.log("Done. Initial schema applied.");
  } catch (error) {
    console.error("Migration failed", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
