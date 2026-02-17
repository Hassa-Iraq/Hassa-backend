import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { createLogger } from "shared/logger/index";
import { requestLogger } from "shared/logger/request-logger";
import { createSwaggerSpec } from "shared/swagger-config/index";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import config from "./config/index";
import healthRoutes from "./routes/health";
import restaurantRoutes from "./routes/restaurants";
import menuCategoryRoutes from "./routes/menu-categories";
import menuItemRoutes from "./routes/menu-items";
import discoveryRoutes from "./routes/discovery";
import searchRoutes from "./routes/search";
import bannerRoutes from "./routes/banners";
import errorHandler from "./middleware/errorHandler";
import { UPLOAD_DIR } from "./utils/fileUpload";

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  (req as any).logger = logger;
  next();
});

// Request/Response logging middleware (logs requests and responses with status codes and duration)
app.use(requestLogger);

// Serve uploaded files statically
app.use("/uploads/banners", express.static(UPLOAD_DIR));

// Swagger/OpenAPI Documentation
// Get current directory for absolute paths (works in both local and Docker)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use absolute paths for swagger-jsdoc to reliably find files
const routesDir = join(__dirname, "routes");

const baseSwaggerSpec = createSwaggerSpec({
  serviceName: "Restaurant Service",
  version: "1.0.0",
  description: "Restaurant and menu management service API",
  apiPaths: [
    join(routesDir, "health.ts"),
    join(routesDir, "restaurants.ts"),
    join(routesDir, "menu-categories.ts"),
    join(routesDir, "menu-items.ts"),
    join(routesDir, "discovery.ts"),
    join(routesDir, "search.ts"),
    join(routesDir, "banners.ts"),
  ],
  servers: [],
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
    apiBasePath = `http://localhost:${config.PORT || 3002}`;
  } else if (host) {
    apiBasePath = `${protocol}://${host}/api/restaurants`;
  } else {
    apiBasePath = `http://localhost:${config.PORT || 3002}`;
  }

  const swaggerSpec = {
    ...baseSwaggerSpec,
    servers: [{ url: apiBasePath, description: "API Server" }],
  };

  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  (req: Request, res: Response, next: NextFunction) => {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol =
      (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ||
      (req.secure ? "https" : "http");
    const hostHeader = req.headers.host;
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

    // Swagger paths are defined relative to service root
    // Server URL should include the service prefix when accessed via gateway
    let apiBasePath: string;
    if (host && host.includes("localhost") && host.includes(":")) {
      // Direct service access (development): http://localhost:3002
      apiBasePath = `http://localhost:${config.PORT || 3002}`;
    } else if (host) {
      // Gateway access: http://domain/api/restaurants
      // Routes are mounted at root in service, but gateway adds /api/restaurants prefix
      apiBasePath = `${protocol}://${host}/api/restaurants`;
    } else {
      apiBasePath = `http://localhost:${config.PORT || 3002}`;
    }

    const swaggerSpec = {
      ...baseSwaggerSpec,
      servers: [{ url: apiBasePath, description: "API Server" }],
    };

    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Restaurant Service API Documentation",
    })(req, res, next);
  }
);

// Routes
app.use("/", healthRoutes);
app.use("/restaurants", restaurantRoutes);
app.use("/menu-categories", menuCategoryRoutes);
app.use("/menu-items", menuItemRoutes);
app.use("/discover", discoveryRoutes);
app.use("/search", searchRoutes);
app.use("/", bannerRoutes);

app.use(errorHandler);

export default app;
