import express, { Request, Response } from "express";
import config from "../config/index";
import * as Order from "../models/Order";

const router = express.Router();

function requireInternalToken(req: Request, res: Response, next: express.NextFunction): void {
  const token = req.headers["x-internal-token"];
  if (!config.INTERNAL_SERVICE_TOKEN || token !== config.INTERNAL_SERVICE_TOKEN) {
    res.status(401).json({ success: false, status: "ERROR", message: "Unauthorized", data: null });
    return;
  }
  next();
}

router.get("/internal/orders/:id", requireInternalToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id as string);
    if (!order) {
      res.status(404).json({ success: false, status: "ERROR", message: "Order not found", data: null });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Order fetched",
      data: {
        order: {
          id: order.id,
          user_id: order.user_id,
          restaurant_id: order.restaurant_id,
          status: order.status,
          subtotal: parseFloat(order.subtotal),
          delivery_fee: parseFloat(order.delivery_fee),
          tax_amount: parseFloat(order.tax_amount),
          discount_amount: parseFloat(order.discount_amount),
          total_amount: parseFloat(order.total_amount),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch order",
      data: null,
    });
  }
});

export default router;
