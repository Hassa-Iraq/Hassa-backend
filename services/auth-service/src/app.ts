import express, { Express } from "express";
import cors from "cors";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import { UPLOAD_DIR } from "./utils/fileUpload";

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

app.use("/uploads/profile", express.static(UPLOAD_DIR));
app.use("/", healthRoutes);
app.use("/auth", authRoutes);

export default app;
