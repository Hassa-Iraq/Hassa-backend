import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { createLogger } from "shared/logger/index";
import { requestLogger } from "shared/logger/request-logger";
import { createSwaggerSpec } from "shared/swagger-config/index";
import config from "./config/index";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import errorHandler from "./middleware/errorHandler";
import { UPLOAD_DIR } from "./utils/fileUpload";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Initialize logger
const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

const app: Express = express();

// CORS configuration - Allow requests from Swagger UI and API Gateway
app.use(
  cors({
    origin: true, // Allow all origins (can be restricted in production)
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Length", "Content-Range"],
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add logger to request object
app.use((req, _res, next) => {
  (req as any).logger = logger;
  next();
});

// Request/Response logging middleware (logs requests and responses with status codes and duration)
app.use(requestLogger);

// Swagger/OpenAPI Documentation
// Create base spec that will be customized per request
// Get current directory for absolute paths (works in both local and Docker)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use absolute paths for swagger-jsdoc to reliably find files
const routesDir = join(__dirname, "routes");

const baseSwaggerSpec = createSwaggerSpec({
  serviceName: "Auth Service",
  version: "1.0.0",
  description: "Authentication and authorization service API",
  apiPaths: [join(routesDir, "auth.ts"), join(routesDir, "health.ts")],
  servers: [], // Will be set dynamically
});

// Serve Swagger spec JSON
app.get("/api-docs/swagger.json", (req: Request, res: Response) => {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ||
    (req.secure ? "https" : "http");
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  let apiBasePath: string;
  if (host && host.includes("localhost") && host.includes(":")) {
    apiBasePath = `http://localhost:${config.PORT || 3001}`;
  } else if (host) {
    apiBasePath = `${protocol}://${host}/api`;
  } else {
    apiBasePath = `http://localhost:${config.PORT || 3001}`;
  }

  const swaggerSpec = {
    ...baseSwaggerSpec,
    servers: [
      {
        url: apiBasePath,
        description: "API Server",
      },
    ],
  };

  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Swagger UI with dynamic server URL detection
app.use(
  "/api-docs",
  swaggerUi.serve,
  (req: Request, res: Response, next: NextFunction) => {
    // Detect server URL from request headers (set by nginx)
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol =
      (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ||
      (req.secure ? "https" : "http");
    const hostHeader = req.headers.host;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

    // Determine API base path
    // Swagger paths are /auth/login, /auth/register, /auth/health, etc.
    // Server URL should be base URL so Swagger combines correctly:
    // - Local: http://localhost:3001 + /auth/login = http://localhost:3001/auth/login
    // - Gateway: http://domain/api + /auth/health = http://domain/api/auth/health ✓
    // - Gateway: http://domain/api + /auth/login = http://domain/api/auth/login ✓
    let apiBasePath: string;
    if (host && host.includes("localhost") && host.includes(":")) {
      // Direct service access (development): http://localhost:3001
      apiBasePath = `http://localhost:${config.PORT || 3001}`;
    } else if (host) {
      // Gateway access (production): http://domain/api
      // All Swagger paths include /auth prefix, so combining with /api gives /api/auth/*
      apiBasePath = `${protocol}://${host}/api`;
    } else {
      // Fallback
      apiBasePath = `http://localhost:${config.PORT || 3001}`;
    }

    const swaggerSpec = {
      ...baseSwaggerSpec,
      servers: [
        {
          url: apiBasePath,
          description: "API Server",
        },
      ],
    };

    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Auth Service API Documentation",
    })(req, res, next);
  }
);

// Serve uploaded profile pictures
app.use("/uploads/profile", express.static(UPLOAD_DIR));

// Routes
app.use("/", healthRoutes);
app.use("/auth", authRoutes);

// Error handler (must be last)
app.use(errorHandler);

export default app;
