import express, { Express } from "express";
import cors from "cors";
import errorHandler from "./middleware/errorHandler";
import analyticsRoutes from "./routes/analytics";
import healthRoutes from "./routes/health";

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

app.use("/", healthRoutes);
app.use("/analytics", analyticsRoutes);

app.use(errorHandler);

export default app;
