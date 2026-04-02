import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  AUTH_SERVICE_URL: { type: 'string' as const, default: 'http://auth-service:3001' },
  RESTAURANT_SERVICE_URL: { type: 'string' as const, default: 'http://restaurant-service:3002' },
  DELIVERY_SERVICE_URL: { type: 'string' as const, default: 'http://delivery-service:3004' },
  INTERNAL_SERVICE_TOKEN: { type: 'string' as const, required: false },
};

const config = loadConfig(schema);

export default config;
