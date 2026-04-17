import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  AUTH_SERVICE_URL: { type: 'string' as const, default: 'http://auth-service:3001' },
  INTERNAL_SERVICE_TOKEN: { type: 'string' as const, required: false },
  PLATFORM_COMMISSION_RATE: { type: 'string' as const, default: '0.15' },
};

const config = loadConfig(schema);

export default config;
