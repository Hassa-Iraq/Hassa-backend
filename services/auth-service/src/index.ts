import app from './app';
import config from './config/index';
import { createLogger } from 'shared/logger/index';
import pool from './db/connection';
import { hashPassword } from './utils/password';
import { initializeFirstUser } from 'shared/admin-initializer/index';
const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

/**
 * Initialize first admin user if none exists
 * This runs automatically on service startup
 */
async function initializeAdmin() {
  try {
    const result = await initializeFirstUser({
      pool,
      roleName: 'admin',
      defaultEmail: process.env.FIRST_ADMIN_EMAIL || 'admin@foodapp.com',
      defaultPassword: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!',
      hashPassword,
      logger,
    });
    if (result.created && result.user?.id) {
      await pool.query(
        'UPDATE auth.users SET phone_verified = TRUE WHERE id = $1',
        [result.user.id]
      );
      logger.info({ userId: result.user.id }, 'First admin phone_verified set to true');
    }
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initialize admin user');
  }
}

const PORT = config.PORT || 3001;

initializeAdmin().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: config.NODE_ENV }, 'Auth service started');
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
