import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  AUTH_SERVICE_URL: { type: 'string' as const, default: 'http://auth-service:3001' },
  ORDER_SERVICE_URL: { type: 'string' as const, default: 'http://order-service:3003' },
  RESTAURANT_SERVICE_URL: { type: 'string' as const, default: 'http://restaurant-service:3002' },
  WALLET_SERVICE_URL: { type: 'string' as const, default: 'http://wallet-service:3009' },
  INTERNAL_SERVICE_TOKEN: { type: 'string' as const, required: false },
  PLATFORM_COMMISSION_RATE: { type: 'number' as const, default: 0.15 },
  AUTO_ASSIGN_SWEEP_INTERVAL_MS: { type: 'number' as const, default: 15000 },
};

const config = loadConfig(schema);

export default config;
