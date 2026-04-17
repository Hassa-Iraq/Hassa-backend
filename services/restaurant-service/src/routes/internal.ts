import express, { Request, Response } from "express";
import config from "../config/index";
import * as Restaurant from "../models/Restaurant";

const router = express.Router();

function requireInternalToken(req: Request, res: Response, next: express.NextFunction): void {
  const token = req.headers["x-internal-token"];
  if (!config.INTERNAL_SERVICE_TOKEN || token !== config.INTERNAL_SERVICE_TOKEN) {
    res.status(401).json({ success: false, status: "ERROR", message: "Unauthorized", data: null });
    return;
  }
  next();
}

router.get("/internal/restaurants/:id", requireInternalToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const restaurant = await Restaurant.findById(req.params.id as string);
    if (!restaurant) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant fetched",
      data: {
        restaurant: {
          id: restaurant.id,
          user_id: restaurant.user_id,
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch restaurant",
      data: null,
    });
  }
});

export default router;
