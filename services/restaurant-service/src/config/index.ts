import { loadConfig, commonSchemas } from 'shared/config-loader/index';

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  AUTH_SERVICE_URL: { type: 'string' as const, default: 'http://auth-service:3001' },
  ELASTICSEARCH_URL: { type: 'string' as const, default: 'http://localhost:9200' },
  ELASTICSEARCH_USERNAME: { type: 'string' as const, required: false },
  ELASTICSEARCH_PASSWORD: { type: 'string' as const, required: false },
  // File storage configuration
  STORAGE_TYPE: { type: 'string' as const, default: 'local' }, // 'local' or 's3' or 'gcs' or 'azure'
  UPLOAD_DIR: { type: 'string' as const, required: false },
  FILE_BASE_URL: { type: 'string' as const, required: false },
  // S3 Configuration (if using S3)
  S3_BUCKET_NAME: { type: 'string' as const, required: false },
  S3_REGION: { type: 'string' as const, required: false },
  S3_ACCESS_KEY_ID: { type: 'string' as const, required: false },
  S3_SECRET_ACCESS_KEY: { type: 'string' as const, required: false },
  S3_ENDPOINT: { type: 'string' as const, required: false }, // For S3-compatible services like MinIO
};

const config = loadConfig(schema);

export default config;
