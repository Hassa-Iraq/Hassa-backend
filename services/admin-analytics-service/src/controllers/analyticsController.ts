import { Request, Response } from "express";
import * as AnalyticsModel from "../models/analyticsModel";

const FILTER_VALUES: AnalyticsModel.AnalyticsFilter[] = [
  "overall",
  "today",
  "this_month",
  "this_year",
];

type OrderMetricKey = keyof AnalyticsModel.OrderStatistics;

function normalizeFilter(value: unknown): AnalyticsModel.AnalyticsFilter {
  if (typeof value !== "string") return "overall";
  const normalized = value.trim().toLowerCase();
  if (FILTER_VALUES.includes(normalized as AnalyticsModel.AnalyticsFilter)) {
    return normalized as AnalyticsModel.AnalyticsFilter;
  }
  return "overall";
}

function parseLimit(value: unknown, fallback: number = 10): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(parsed)));
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value || 0);
}

function sendOk(res: Response, message: string, data: Record<string, unknown>): Response {
  return res.status(200).json({
    success: true,
    status: "OK",
    message,
    data,
  });
}

async function sendOrderMetric(
  req: Request,
  res: Response,
  metric: OrderMetricKey,
  message: string
): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const stats = await AnalyticsModel.getOrderStatistics(filter);

  return sendOk(res, message, {
    filter,
    [metric]: stats[metric],
  });
}

export async function popularRestaurants(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const limit = parseLimit(req.query.limit, 10);
  const rows = await AnalyticsModel.getPopularRestaurants(filter, limit);

  return sendOk(res, "Popular restaurants retrieved", {
    filter,
    limit,
    restaurants: rows.map((row, index) => ({
      rank: index + 1,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      logo_url: row.logo_url,
      total_orders: row.total_orders,
      total_revenue: toNumber(row.total_revenue),
    })),
  });
}

export async function statistics(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const stats = await AnalyticsModel.getPlatformStatistics(filter);

  return sendOk(res, "Platform statistics retrieved", {
    filter,
    ...stats,
  });
}

export async function customersRegistered(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const total = await AnalyticsModel.getCustomersRegistered(filter);
  return sendOk(res, "Customers registered retrieved", {
    filter,
    customers_registered: total,
  });
}

export async function restaurantsRegistered(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const total = await AnalyticsModel.getRestaurantsRegistered(filter);
  return sendOk(res, "Restaurants registered retrieved", {
    filter,
    restaurants_registered: total,
  });
}

export async function deliveryMenRegistered(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const total = await AnalyticsModel.getDeliveryMenRegistered(filter);
  return sendOk(res, "Delivery men registered retrieved", {
    filter,
    delivery_men_registered: total,
  });
}

export async function orderStatistics(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const stats = await AnalyticsModel.getOrderStatistics(filter);

  return sendOk(res, "Order statistics retrieved", {
    filter,
    ...stats,
    notes: {
      refunded: "Placeholder metric until payments/refunds module is integrated.",
      payment_failed: "Placeholder metric until payments module is integrated.",
    },
  });
}

export async function delivered(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "delivered", "Delivered orders retrieved");
}

export async function cancelled(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "cancelled", "Cancelled orders retrieved");
}

export async function refunded(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "refunded", "Refunded orders retrieved");
}

export async function paymentFailed(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "payment_failed", "Payment failed orders retrieved");
}

export async function unassigned(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "unassigned", "Unassigned orders retrieved");
}

export async function acceptedByRider(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "accepted_by_rider", "Accepted by rider orders retrieved");
}

export async function cookingInRestaurants(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(
    req,
    res,
    "cooking_in_restaurants",
    "Cooking in restaurants orders retrieved"
  );
}

export async function pickedUpByRider(req: Request, res: Response): Promise<Response> {
  return sendOrderMetric(req, res, "picked_up_by_rider", "Picked up by rider orders retrieved");
}

export async function topDeliveryMen(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const limit = parseLimit(req.query.limit, 10);
  const rows = await AnalyticsModel.getTopDeliveryMen(filter, limit);

  return sendOk(res, "Top delivery men retrieved", {
    filter,
    limit,
    delivery_men: rows.map((row, index) => ({
      rank: index + 1,
      ...row,
    })),
  });
}

export async function topRestaurants(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const limit = parseLimit(req.query.limit, 10);
  const rows = await AnalyticsModel.getTopRestaurants(filter, limit);

  return sendOk(res, "Top restaurants retrieved", {
    filter,
    limit,
    restaurants: rows.map((row, index) => ({
      rank: index + 1,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      logo_url: row.logo_url,
      delivered_orders: row.delivered_orders,
      total_orders: row.total_orders,
      total_revenue: toNumber(row.total_revenue),
    })),
  });
}

export async function topRatedFood(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const limit = parseLimit(req.query.limit, 10);
  const rows = await AnalyticsModel.getTopRatedFood(filter, limit);

  return sendOk(res, "Top rated food retrieved", {
    filter,
    limit,
    items: rows.map((row, index) => ({
      rank: index + 1,
      menu_item_id: row.menu_item_id,
      menu_item_name: row.menu_item_name,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      rating_score: toNumber(row.rating_score),
      quantity_sold: row.quantity_sold,
      order_items_count: row.order_items_count,
    })),
  });
}

export async function topSellingFood(req: Request, res: Response): Promise<Response> {
  const filter = normalizeFilter(req.query.filter);
  const limit = parseLimit(req.query.limit, 10);
  const rows = await AnalyticsModel.getTopSellingFood(filter, limit);

  return sendOk(res, "Top selling food retrieved", {
    filter,
    limit,
    items: rows.map((row, index) => ({
      rank: index + 1,
      menu_item_id: row.menu_item_id,
      menu_item_name: row.menu_item_name,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      quantity_sold: row.quantity_sold,
      total_revenue: toNumber(row.total_revenue),
      order_items_count: row.order_items_count,
    })),
  });
}
