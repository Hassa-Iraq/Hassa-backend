import { Request, Response } from "express";
import pool from "../db/connection";

/**
 * GET /health
 * Returns service and database health status.
 */
export const check = async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      success: true,
      status: "OK",
      message: "Service healthy",
      data: {
        status: "healthy",
        service: "auth-service",
        timestamp: new Date().toISOString(),
        database: "connected",
      },
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: "ERROR",
      message: "Service unhealthy " + (err as Error).message,
      data: null,
    });
  }
};

export default { check };
