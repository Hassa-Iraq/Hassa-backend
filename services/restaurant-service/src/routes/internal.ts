import express, { Request, Response } from "express";
import config from "../config/index";
import * as Restaurant from "../models/Restaurant";
import * as Rating from "../models/Rating";

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
      data: { restaurant: { id: restaurant.id, user_id: restaurant.user_id } },
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

router.post("/internal/ratings", requireInternalToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { restaurant_id, user_id, order_id, rating, review } = req.body as {
      restaurant_id: string;
      user_id: string;
      order_id: string;
      rating: number;
      review?: string | null;
    };

    if (!restaurant_id || !user_id || !order_id || !rating) {
      res.status(400).json({ success: false, status: "ERROR", message: "Missing required fields", data: null });
      return;
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      res.status(400).json({ success: false, status: "ERROR", message: "Rating must be between 1 and 5", data: null });
      return;
    }

    const existing = await Rating.findByOrderId(order_id);
    if (existing) {
      res.status(409).json({ success: false, status: "ERROR", message: "This order has already been rated", data: null });
      return;
    }

    const row = await Rating.create({ restaurant_id, user_id, order_id, rating, review });

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Rating submitted",
      data: { rating: Rating.toResponse(row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to submit rating",
      data: null,
    });
  }
});

router.get("/internal/ratings/order/:orderId", requireInternalToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await Rating.findByOrderId(req.params.orderId as string);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Rating fetched",
      data: { rating: row ? Rating.toResponse(row) : null },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch rating",
      data: null,
    });
  }
});

export default router;
