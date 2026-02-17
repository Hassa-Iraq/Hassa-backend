import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  AUTH_SERVICE_URL: { type: 'string' as const, default: 'http://auth-service:3001' },
  SMTP_HOST: { type: 'string' as const, default: '' },
  SMTP_PORT: { type: 'string' as const, default: '587' },
  SMTP_USER: { type: 'string' as const, default: '' },
  SMTP_PASSWORD: { type: 'string' as const, default: '' },
  SMTP_SECURE: { type: 'string' as const, default: 'false' },
  SMTP_FROM: { type: 'string' as const, default: '' },
};

const config = loadConfig(schema);

export default config;
