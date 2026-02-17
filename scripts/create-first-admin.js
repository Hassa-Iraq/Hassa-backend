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

import { createDbPool } from 'shared/db-connection/index';
import { hashPassword } from '../services/auth-service/src/utils/password';
import config from '../services/auth-service/src/config/index';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/create-first-admin.js <email> <password>');
  console.error('Example: node scripts/create-first-admin.js admin@example.com SecurePass123!');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Error: Password must be at least 8 characters long');
  process.exit(1);
}

const pool = createDbPool(config);

async function createAdminUser() {
  try {
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
