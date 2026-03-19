import { Request, Response } from "express";
import pool from "../db/connection";

export async function health(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Service healthy",
      data: {
        status: "healthy",
        service: "admin-analytics-service",
        timestamp: new Date().toISOString(),
        database: "connected",
      },
    });
  } catch (err: unknown) {
    res.status(503).json({
      success: false,
      status: "ERROR",
      message: "Service unhealthy",
      data: {
        status: "unhealthy",
        service: "admin-analytics-service",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
}
