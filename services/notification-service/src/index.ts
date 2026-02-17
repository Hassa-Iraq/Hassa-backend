import app from './app';
import config from './config/index';
import { createLogger } from 'shared/logger/index';

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

const PORT = config.PORT || 3006;

app.listen(PORT, () => {
  logger.info({ port: PORT, env: config.NODE_ENV }, 'Notification service started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
