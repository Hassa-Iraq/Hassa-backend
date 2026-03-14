import express, { Request, Response } from "express";
import pool from "../db/connection";

const router = express.Router();

router.get("/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Service healthy",
      data: {
        status: "healthy",
        service: "delivery-service",
        timestamp: new Date().toISOString(),
        database: "connected",
      },
    });
    return;
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "ERROR",
      message: "Service unhealthy",
      data: {
        status: "unhealthy",
        service: "delivery-service",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return;
  }
});

export default router;
