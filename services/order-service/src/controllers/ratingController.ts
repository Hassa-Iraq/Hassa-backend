import { Response } from "express";
import config from "../config/index";
import * as Order from "../models/Order";
import { AuthRequest } from "../middleware/auth";

function internalHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.INTERNAL_SERVICE_TOKEN ? { "X-Internal-Token": config.INTERNAL_SERVICE_TOKEN } : {}),
  };
}

const restaurantServiceUrl = () => config.RESTAURANT_SERVICE_URL || "http://restaurant-service:3002";

export async function submitRating(req: AuthRequest, res: Response): Promise<void> {
  try {
    const orderId = req.params.id as string;
    const userId = req.user!.id;
    const { rating, review } = req.body as { rating: unknown; review?: unknown };

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Rating must be an integer between 1 and 5",
        data: null,
      });
      return;
    }

    const order = await Order.findById(orderId);
    if (!order || order.user_id !== userId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Order not found", data: null });
      return;
    }
    if (order.status !== "delivered") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "You can only rate an order after it has been delivered",
        data: null,
      });
      return;
    }

    const checkResp = await fetch(
      `${restaurantServiceUrl()}/internal/ratings/order/${orderId}`,
      { method: "GET", headers: internalHeaders() }
    );
    const checkJson = (await checkResp.json()) as { success?: boolean; data?: { rating: unknown } };
    if (checkJson.success && checkJson.data?.rating) {
      res.status(409).json({
        success: false,
        status: "ERROR",
        message: "This order has already been rated",
        data: null,
      });
      return;
    }

    const submitResp = await fetch(`${restaurantServiceUrl()}/internal/ratings`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({
        restaurant_id: order.restaurant_id,
        user_id: userId,
        order_id: orderId,
        rating: ratingNum,
        review: typeof review === "string" && review.trim() ? review.trim() : null,
      }),
    });

    const submitJson = (await submitResp.json()) as { success?: boolean; message?: string; data?: unknown };
    if (!submitResp.ok || !submitJson.success) {
      res.status(submitResp.status || 500).json({
        success: false,
        status: "ERROR",
        message: submitJson.message || "Failed to submit rating",
        data: null,
      });
      return;
    }

    res.status(201).json({
      success: true,
      status: "OK",
      message: "Rating submitted successfully",
      data: submitJson.data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to submit rating",
      data: null,
    });
  }
}

export async function getOrderRating(req: AuthRequest, res: Response): Promise<void> {
  try {
    const orderId = req.params.id as string;
    const userId = req.user!.id;

    const order = await Order.findById(orderId);
    if (!order || order.user_id !== userId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Order not found", data: null });
      return;
    }

    const resp = await fetch(
      `${restaurantServiceUrl()}/internal/ratings/order/${orderId}`,
      { method: "GET", headers: internalHeaders() }
    );
    const json = (await resp.json()) as { success?: boolean; data?: unknown };

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Rating fetched",
      data: (json as { data?: unknown }).data ?? { rating: null },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch rating",
      data: null,
    });
  }
}
