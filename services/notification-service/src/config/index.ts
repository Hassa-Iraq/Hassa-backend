import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  SMTP_HOST: { type: 'string' as const, default: '' },
  SMTP_PORT: { type: 'string' as const, default: '587' },
  SMTP_USER: { type: 'string' as const, default: '' },
  SMTP_PASSWORD: { type: 'string' as const, default: '' },
  SMTP_SECURE: { type: 'string' as const, default: 'false' },
  SMTP_FROM: { type: 'string' as const, default: '' },
  JWT_SECRET: { type: 'string' as const, default: 'your-super-secret-jwt-key-change-in-production' },
  INTERNAL_SERVICE_TOKEN: { type: 'string' as const, required: false },
  FIREBASE_PROJECT_ID: { type: 'string' as const, default: '' },
  FIREBASE_CLIENT_EMAIL: { type: 'string' as const, default: '' },
  FIREBASE_PRIVATE_KEY: { type: 'string' as const, default: '' },
};

const config = loadConfig(schema);

export default config;
