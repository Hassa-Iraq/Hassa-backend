import express, { Express } from "express";
import cors from "cors";
import { createLogger } from "shared/logger/index";
import { requestLogger } from "shared/logger/request-logger";
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
app.use("/uploads/banners", express.static(UPLOAD_DIR));
app.use("/", healthRoutes);
app.use("/restaurants", restaurantRoutes);
app.use("/menu-categories", menuCategoryRoutes);
app.use("/menu-items", menuItemRoutes);
app.use("/discover", discoveryRoutes);
app.use("/search", searchRoutes);
app.use("/", bannerRoutes);

app.use(errorHandler);

export default app;
