import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  ...commonSchemas.jwt,
  INTERNAL_SERVICE_TOKEN: { type: 'string' as const, required: false },
  NOTIFICATION_SERVICE_URL: { type: 'string' as const, default: 'http://notification-service:3006' },
  UPLOAD_DIR: { type: 'string' as const, required: false },
  FILE_BASE_URL: { type: 'string' as const, required: false },
};

const config = loadConfig(schema);

export default config;
