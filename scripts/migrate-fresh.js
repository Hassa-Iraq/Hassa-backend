/**
 * Drop old databases (food_delivery and POSTGRES_DB), create fresh POSTGRES_DB, apply initial schema.
 * Uses Node + pg only (no psql required). Run from project root.
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const { Client } = require("pg");

const rootDir = join(__dirname, "..");
const migrationsInitialDir = join(rootDir, "database", "migrations_initial");
const initialSchemaFile = join(migrationsInitialDir, "20250213000001_initial_schema.sql");

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

function getDbConfig(env, database = null) {
  let host = env.POSTGRES_HOST || "localhost";
  if (host === "postgres") {
    host = "localhost";
  }
  const port = parseInt(env.POSTGRES_PORT || (host === "localhost" ? "5433" : "5432"), 10);
  const db = database ?? env.POSTGRES_DB ?? "hassa";
  const user = env.POSTGRES_USER || "postgres";
  const password = env.POSTGRES_PASSWORD || "postgres";
  return { host, port, database: db, user, password };
}

async function run() {
  const env = loadEnv();
  const dbName = env.POSTGRES_DB || "hassa";

  let sql;
  try {
    sql = readFileSync(initialSchemaFile, "utf-8");
  } catch (error) {
    console.error("Error: Initial schema file not found", initialSchemaFile);
    process.exit(1);
  }

  const adminConfig = getDbConfig(env, "postgres");
  const client = new Client(adminConfig);

  try {
    await client.connect();

    console.log("Terminating connections to food_delivery and", dbName + "...");
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ($1, $2) AND pid <> pg_backend_pid()",
      ["food_delivery", dbName]
    ).catch(() => {});

    console.log("Dropping old databases (food_delivery and", dbName + ")...");
    await client.query("DROP DATABASE IF EXISTS food_delivery");
    await client.query(`DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '""')}"`);

    console.log("Creating database", dbName + "...");
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);

    await client.end();
  } catch (error) {
    await client.end().catch(() => {});
    console.error("Failed to drop/create database:", error.message);
    process.exit(1);
  }

  const appConfig = getDbConfig(env);
  const appClient = new Client(appConfig);
  try {
    await appClient.connect();
    console.log("Running initial schema...");
    await appClient.query(sql);
    console.log("Done. Database", dbName, "is ready.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  } finally {
    await appClient.end();
  }
}

run();
