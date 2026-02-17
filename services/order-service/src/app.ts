import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { createLogger } from "shared/logger/index";
import { requestLogger } from "shared/logger/request-logger";
import { createSwaggerSpec } from "shared/swagger-config/index";
import config from "./config/index";
import healthRoutes from "./routes/health";
import errorHandler from "./middleware/errorHandler";

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

const baseSwaggerSpec = createSwaggerSpec({
  serviceName: "Order Service",
  version: "1.0.0",
  description: "Order processing service API",
  apiPaths: ["./src/routes/*.ts"],
  servers: [],
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

    let apiBasePath: string;
    if (host && host.includes("localhost") && host.includes(":")) {
      apiBasePath = `http://localhost:${config.PORT || 3003}`;
    } else if (host) {
      apiBasePath = `${protocol}://${host}/api`;
    } else {
      apiBasePath = `http://localhost:${config.PORT || 3003}`;
    }

    const swaggerSpec = {
      ...baseSwaggerSpec,
      servers: [{ url: apiBasePath, description: "API Server" }],
    };

    swaggerUi.setup(swaggerSpec, {
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "Order Service API Documentation",
    })(req, res, next);
  }
);

app.use("/", healthRoutes);

app.use(errorHandler);

export default app;
