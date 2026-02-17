#!/usr/bin/env node

/**
 * Migration script that loads .env and constructs DATABASE_URL
 * for node-pg-migrate
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const { execSync } = require("child_process");

const rootDir = join(__dirname, "..");

// Load .env file manually (if it exists)
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
    // .env file is optional (especially in CI/CD where env vars are set directly)
    // Only log if it's not a "file not found" error
    if (error.code !== "ENOENT") {
      console.error("Error loading .env file:", error.message);
    }
    return {};
  }
}

// Merge environment variables: process.env takes precedence over .env file
function loadEnv() {
  const envFile = loadEnvFile();
  const merged = { ...envFile };

  // Process.env takes precedence (for CI/CD environments)
  Object.keys(process.env).forEach((key) => {
    if (process.env[key] !== undefined) {
      merged[key] = process.env[key];
    }
  });

  return merged;
}

// Construct DATABASE_URL from individual variables
function getDatabaseUrl(env) {
  // If host is 'postgres' (Docker service name), use 'localhost' when running from host
  let host = env.POSTGRES_HOST || "localhost";
  if (host === "postgres") {
    host = "localhost";
  }

  // Default port is 5432 (standard PostgreSQL port)
  // Use 5433 only if explicitly set for Docker-mapped port scenarios
  const port = env.POSTGRES_PORT || "5432";
  const database = env.POSTGRES_DB || "food_delivery";
  const user = env.POSTGRES_USER || "postgres";
  const password = env.POSTGRES_PASSWORD || "postgres";

  // Ensure password is a string
  const passwordStr = String(password);

  return `postgres://${user}:${passwordStr}@${host}:${port}/${database}`;
}

// Main execution
const env = loadEnv();
const databaseUrl = getDatabaseUrl(env);

// Set DATABASE_URL and run node-pg-migrate
process.env.DATABASE_URL = databaseUrl;

// Get the command from process.argv (up, down, create, etc.)
const args = process.argv.slice(2);
const command = args[0] || "up";

// Run node-pg-migrate with explicit migrations directory
const migrationsDir = join(rootDir, "database", "migrations");

// Use migrate.json config file approach instead
// Set the migrations directory via environment variable
process.env.PG_MIGRATIONS_DIR = migrationsDir;

try {
  // Use migrate.json if it exists, otherwise pass dir as arg
  const migrateConfig = `--migrations-dir "${migrationsDir}"`;
  const fullCommand = `node-pg-migrate ${command} ${migrateConfig} ${args
    .slice(1)
    .join(" ")}`.trim();

  execSync(fullCommand, {
    stdio: "inherit",
    env: process.env,
    cwd: rootDir,
    shell: true,
  });
} catch (error) {
  process.exit(1);
}
