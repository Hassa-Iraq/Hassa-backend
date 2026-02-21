import express, { Express } from "express";
import cors from "cors";
import { createLogger } from "shared/logger/index";
import { requestLogger } from "shared/logger/request-logger";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import errorHandler from "./middleware/errorHandler";
import config from "./config/index";
import { UPLOAD_DIR } from "./utils/fileUpload";

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

const app: Express = express();

app.use(
  cors({
    origin: true,
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

app.use(requestLogger);

app.use("/uploads/profile", express.static(UPLOAD_DIR));
app.use("/", healthRoutes);
app.use("/auth", authRoutes);
app.use(errorHandler);

export default app;
