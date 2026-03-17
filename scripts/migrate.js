/**
 * Migration script that loads .env and constructs DATABASE_URL
 * for node-pg-migrate
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const { execSync } = require("child_process");
const rootDir = join(__dirname, "..");

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

function getDatabaseUrl(env) {
  let host = env.POSTGRES_HOST || "localhost";
  if (host === "postgres") {
    host = "localhost";
  }

  const port = env.POSTGRES_PORT || (host === "localhost" ? "5433" : "5432");
  const database = env.POSTGRES_DB || "hassa";
  const user = env.POSTGRES_USER || "postgres";
  const password = env.POSTGRES_PASSWORD || "postgres";

  const passwordStr = String(password);

  const encode = (s) => encodeURIComponent(s);
  return `postgres://${encode(user)}:${encode(passwordStr)}@${host}:${port}/${database}`;
}

const env = loadEnv();
const databaseUrl = getDatabaseUrl(env);

if (!databaseUrl || typeof databaseUrl !== "string") {
  console.error("Error: Could not build DATABASE_URL from .env or environment.");
  console.error("Ensure .env exists in the project root with POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD.");
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0] || "up";

const migrationsDir = join(rootDir, "database", "migrations");

const childEnv = { ...process.env, DATABASE_URL: databaseUrl };

try {
  const migrateConfig = `--migrations-dir "${migrationsDir}"`;
  const fullCommand = `node-pg-migrate ${command} ${migrateConfig} ${args
    .slice(1)
    .join(" ")}`.trim();

  execSync(fullCommand, {
    stdio: "inherit",
    env: childEnv,
    cwd: rootDir,
    shell: true,
  });
} catch (error) {
  process.exit(1);
}