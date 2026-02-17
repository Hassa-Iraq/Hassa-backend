/**
 * Script to create the first admin user
 * 
 * Usage:
 *   tsx scripts/create-first-admin.ts <email> <password>
 * 
 * Example:
 *   tsx scripts/create-first-admin.ts admin@example.com SecurePass123!
 * 
 * This script creates the first admin user in the database.
 * After running this, you can use the /auth/admin/create-admin endpoint
 * to create additional admin users.
 */

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load .env file manually
function loadEnvFile() {
  try {
    const envPath = join(rootDir, '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const env: Record<string, string> = {};

    envContent.split('\n').forEach((line) => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          env[key.trim()] = value;
        }
      }
    });

    return env;
  } catch (error) {
    console.warn('Warning: .env file not found, using environment variables');
    return {};
  }
}

const env = loadEnvFile();

// Create database config from environment
// Default to localhost for local development (when not in Docker)
const dbConfig = {
  POSTGRES_HOST: process.env.POSTGRES_HOST || env.POSTGRES_HOST || 'localhost',
  POSTGRES_PORT: parseInt(process.env.POSTGRES_PORT || env.POSTGRES_PORT || '5432'),
  POSTGRES_DB: process.env.POSTGRES_DB || env.POSTGRES_DB || 'food_delivery',
  POSTGRES_USER: process.env.POSTGRES_USER || env.POSTGRES_USER || 'postgres',
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || env.POSTGRES_PASSWORD || 'postgres',
};

// If host is 'postgres' (Docker service name), change to localhost for local script execution
// This allows the script to work both in Docker and locally
if (dbConfig.POSTGRES_HOST === 'postgres') {
  dbConfig.POSTGRES_HOST = 'localhost';
  console.log('⚠️  Detected Docker hostname "postgres", using "localhost" for local execution');
}

// Create database pool
function createDbPool() {
  return new Pool({
    host: dbConfig.POSTGRES_HOST,
    port: dbConfig.POSTGRES_PORT,
    database: dbConfig.POSTGRES_DB,
    user: dbConfig.POSTGRES_USER,
    password: dbConfig.POSTGRES_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

// Hash password using bcrypt
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: npm run create-admin <email> <password>');
  console.error('Example: npm run create-admin admin@example.com SecurePass123!');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Error: Password must be at least 8 characters long');
  process.exit(1);
}

const pool = createDbPool();

async function createAdminUser() {
  try {
    // Test connection first
    console.log(`Connecting to database at ${dbConfig.POSTGRES_HOST}:${dbConfig.POSTGRES_PORT}...`);
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful!\n');
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM auth.users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.error(`Error: User with email ${email} already exists`);
      process.exit(1);
    }

    // Get admin role ID
    const roleResult = await pool.query(
      "SELECT id FROM auth.roles WHERE name = $1",
      ['admin']
    );

    if (roleResult.rows.length === 0) {
      console.error('Error: Admin role not found. Please run migrations first.');
      process.exit(1);
    }

    const roleId = roleResult.rows[0].id;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin user
    const userResult = await pool.query(
      `INSERT INTO auth.users (email, password_hash, role_id)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [email, passwordHash, roleId]
    );

    const user = userResult.rows[0];

    console.log('✅ Admin user created successfully!');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: admin`);
    console.log(`   Created at: ${user.created_at}`);
    console.log('\nYou can now login with this account and use /auth/admin/create-admin to create more admin users.');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    await pool.end();
    process.exit(1);
  }
}

createAdminUser();
