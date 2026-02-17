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
    await initializeFirstUser({
      pool,
      roleName: 'admin',
      defaultEmail: process.env.FIRST_ADMIN_EMAIL || 'admin@foodapp.com',
      defaultPassword: process.env.FIRST_ADMIN_PASSWORD || 'Admin123!',
      hashPassword,
      logger,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to initialize admin user');
    // Don't exit - allow service to start even if admin creation fails
  }
}

const PORT = config.PORT || 3001;

// Initialize admin before starting server
initializeAdmin().then(() => {
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: config.NODE_ENV }, 'Auth service started');
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
