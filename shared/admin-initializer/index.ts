import { Pool } from 'pg';

export interface InitializationConfig {
  pool: Pool;
  roleName: string;
  defaultEmail: string;
  defaultPassword: string;
  schema?: string; // e.g., 'auth'
  usersTable?: string; // e.g., 'users'
  rolesTable?: string; // e.g., 'roles'
  emailColumn?: string; // e.g., 'email'
  roleIdColumn?: string; // e.g., 'role_id'
  passwordHashColumn?: string; // e.g., 'password_hash'
  hashPassword: (password: string) => Promise<string>;
  logger?: {
    info: (data: any, message?: string) => void;
    warn: (data: any, message?: string) => void;
    error: (data: any, message?: string) => void;
  };
}

export interface InitializationResult {
  created: boolean;
  user?: {
    id: string;
    email: string;
  };
  message: string;
}

/**
 * Initialize first user with a specific role if none exists
 * Reusable across any application with role-based authentication
 */
export async function initializeFirstUser(
  config: InitializationConfig
): Promise<InitializationResult> {
  const {
    pool,
    roleName,
    defaultEmail,
    defaultPassword,
    schema = 'auth',
    usersTable = 'users',
    rolesTable = 'roles',
    emailColumn = 'email',
    roleIdColumn = 'role_id',
    passwordHashColumn = 'password_hash',
    hashPassword,
    logger = console,
  } = config;

  try {
    // Check if any users with this role exist
    const adminCheck = await pool.query(
      `SELECT COUNT(*) as count 
       FROM ${schema}.${usersTable} u
       JOIN ${schema}.${rolesTable} r ON u.${roleIdColumn} = r.id
       WHERE r.name = $1`,
      [roleName]
    );

    const userCount = parseInt(adminCheck.rows[0].count);

    if (userCount > 0) {
      return {
        created: false,
        message: `${roleName} users already exist, skipping initialization`,
      };
    }

    logger.info({ role: roleName, email: defaultEmail }, `No ${roleName} users found, creating first user...`);

    // Get role ID
    const roleResult = await pool.query(
      `SELECT id FROM ${schema}.${rolesTable} WHERE name = $1`,
      [roleName]
    );

    if (roleResult.rows.length === 0) {
      const error = `Role '${roleName}' not found. Please run migrations first.`;
      logger.error({ role: roleName }, error);
      return {
        created: false,
        message: error,
      };
    }

    const roleId = roleResult.rows[0].id;

    // Check if user with this email already exists
    const existingUser = await pool.query(
      `SELECT id FROM ${schema}.${usersTable} WHERE ${emailColumn} = $1`,
      [defaultEmail]
    );

    if (existingUser.rows.length > 0) {
      const message = `User with email ${defaultEmail} already exists`;
      logger.warn({ email: defaultEmail }, message);
      return {
        created: false,
        message,
      };
    }

    // Hash password and create user
    const passwordHash = await hashPassword(defaultPassword);
    
    const userResult = await pool.query(
      `INSERT INTO ${schema}.${usersTable} (${emailColumn}, ${passwordHashColumn}, ${roleIdColumn})
       VALUES ($1, $2, $3)
       RETURNING id, ${emailColumn}`,
      [defaultEmail, passwordHash, roleId]
    );

    const user = userResult.rows[0];
    
    logger.info(
      { id: user.id, email: user[emailColumn], role: roleName },
      `✅ First ${roleName} user created successfully`
    );
    logger.warn(
      { email: defaultEmail },
      `⚠️  Please change the default password after first login!`
    );

    return {
      created: true,
      user: {
        id: user.id,
        email: user[emailColumn],
      },
      message: `First ${roleName} user created successfully`,
    };
  } catch (error: any) {
    const errorMessage = `Failed to initialize first ${roleName} user: ${error.message}`;
    logger.error({ error: error.message, role: roleName }, errorMessage);
    return {
      created: false,
      message: errorMessage,
    };
  }
}

/**
 * Initialize multiple roles at once
 */
export async function initializeFirstUsers(
  configs: InitializationConfig[]
): Promise<InitializationResult[]> {
  const results: InitializationResult[] = [];
  
  for (const config of configs) {
    const result = await initializeFirstUser(config);
    results.push(result);
  }
  
  return results;
}

export default {
  initializeFirstUser,
  initializeFirstUsers,
};
