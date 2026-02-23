import { Request, Response } from "express";
import pool from "../db/connection";

export async function check(_req: Request, res: Response) {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Service healthy",
      data: {
        status: "healthy",
        service: "notification-service",
        timestamp: new Date().toISOString(),
        database: "connected",
      },
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: "ERROR",
      message: "Service unhealthy",
      data: {
        status: "unhealthy",
        service: "notification-service",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: (err as Error).message,
      },
    });
  }
}
