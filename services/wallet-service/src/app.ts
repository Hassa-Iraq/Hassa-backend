import express, { Express, Request, Response } from "express";
import cors from "cors";
import walletRoutes from "./routes/wallet";
import adminRoutes from "./routes/admin";
import internalRoutes from "./routes/internal";

const app: Express = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "X-Internal-Token"],
    exposedHeaders: ["Content-Length", "Content-Range"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: "OK", message: "Wallet service is healthy" });
});

app.use("/wallet", walletRoutes);
app.use("/admin", adminRoutes);
app.use("/internal", internalRoutes);

export default app;
