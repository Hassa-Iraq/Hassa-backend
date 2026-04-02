import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  AUTH_SERVICE_URL: { type: 'string' as const, default: 'http://auth-service:3001' },
  ORDER_SERVICE_URL: { type: 'string' as const, default: 'http://order-service:3003' },
  INTERNAL_SERVICE_TOKEN: { type: 'string' as const, required: false },
  AUTO_ASSIGN_SWEEP_INTERVAL_MS: { type: 'number' as const, default: 15000 },
};

const config = loadConfig(schema);

export default config;
