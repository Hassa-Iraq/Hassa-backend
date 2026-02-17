import app from './app';
import config from './config/index';
import { createLogger } from 'shared/logger/index';
import { initializeIndices } from './utils/elasticsearch';
import { initializeRedis } from './utils/redis';

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

const PORT = config.PORT || 3002;

// Initialize services on startup
async function startService() {
  try {
    // Initialize Redis connection
    await initializeRedis();
    logger.info('Redis initialized');

    // Initialize Elasticsearch indices (non-blocking, will retry on first use)
    initializeIndices().then(() => {
      logger.info('Elasticsearch indices initialized');
    }).catch((error) => {
      logger.warn({ error: error.message }, 'Elasticsearch initialization failed (will retry on first use)');
    });

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info({ port: PORT, env: config.NODE_ENV }, 'Restaurant service started');
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to start service');
    process.exit(1);
  }
}

startService();

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
