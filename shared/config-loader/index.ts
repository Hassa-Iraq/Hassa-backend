/**
 * Configuration loader with validation
 */

export interface ConfigDefinition {
  type?: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  default?: any;
}

export interface ConfigSchema {
  [key: string]: ConfigDefinition;
}

/**
 * Loads and validates configuration from environment variables
 */
export function loadConfig(schema: ConfigSchema): Record<string, any> {
  const config: Record<string, any> = {};
  const missing: string[] = [];

  for (const [key, definition] of Object.entries(schema)) {
    const envValue = process.env[key];

    if (envValue !== undefined) {
      if (definition.type === 'number') {
        config[key] = Number(envValue);
      } else if (definition.type === 'boolean') {
        config[key] = envValue === 'true' || envValue === '1';
      } else if (definition.type === 'array') {
        config[key] = envValue.split(',').map(item => item.trim());
      } else {
        config[key] = envValue;
      }
    } else if (definition.required) {
      missing.push(key);
    } else if (definition.default !== undefined) {
      config[key] = definition.default;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return config;
}

/**
 * Common configuration schemas
 */
export const commonSchemas = {
  database: {
    POSTGRES_HOST: { type: 'string' as const, default: 'localhost' },
    POSTGRES_PORT: { type: 'number' as const, default: 5432 },
    POSTGRES_DB: { type: 'string' as const, required: true },
    POSTGRES_USER: { type: 'string' as const, default: 'postgres' },
    POSTGRES_PASSWORD: { type: 'string' as const, required: true },
  },

  redis: {
    REDIS_HOST: { type: 'string' as const, default: 'localhost' },
    REDIS_PORT: { type: 'number' as const, default: 6379 },
  },

  server: {
    PORT: { type: 'number' as const, default: 3000 },
    NODE_ENV: { type: 'string' as const, default: 'development' },
    LOG_LEVEL: { type: 'string' as const, default: 'info' },
    SERVICE_NAME: { type: 'string' as const, required: true },
  },

  jwt: {
    JWT_SECRET: { type: 'string' as const, required: true },
    JWT_EXPIRES_IN: { type: 'string' as const, default: '24h' },
  },
};

export default {
  loadConfig,
  commonSchemas,
};
