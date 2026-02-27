import app from './app';
import config from './config/index';

const PORT = config.PORT || 3003;

app.listen(PORT, () => {
  console.info(`Order service started on port ${PORT} in ${config.NODE_ENV} mode`);
});

process.on('SIGTERM', () => {
  console.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
