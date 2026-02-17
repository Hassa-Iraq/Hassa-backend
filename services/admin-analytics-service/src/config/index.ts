import { loadConfig, commonSchemas } from "shared/config-loader/index";

const schema = {
  ...commonSchemas.server,
  ...commonSchemas.database,
  ...commonSchemas.redis,
  AUTH_SERVICE_URL: {
    type: "string" as const,
    default: "http://auth-service:3001",
  },
};

const config = loadConfig(schema);

export default config;
