import express, { Express } from "express";
import cors from "cors";
import healthRoutes from "./routes/health";
import internalRoutes from "./routes/internal";
import restaurantRoutes from "./routes/restaurants";
import menuCategoryRoutes from "./routes/menu-categories";
import menuItemRoutes from "./routes/menu-items";
import discoveryRoutes from "./routes/discovery";
import searchRoutes from "./routes/search";
import bannerRoutes from "./routes/banners";
import cuisineCategoryRoutes from "./routes/cuisine-categories";
import { BASE_UPLOAD_DIR } from "./utils/fileUpload";

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

app.use("/uploads", express.static(BASE_UPLOAD_DIR));
app.use("/", healthRoutes);
app.use("/", internalRoutes);
app.use("/menu-categories", menuCategoryRoutes);
app.use("/menu-items", menuItemRoutes);
app.use("/discover", discoveryRoutes);
app.use("/search", searchRoutes);
app.use("/", bannerRoutes);
app.use("/", cuisineCategoryRoutes);
app.use("/", restaurantRoutes);

export default app;