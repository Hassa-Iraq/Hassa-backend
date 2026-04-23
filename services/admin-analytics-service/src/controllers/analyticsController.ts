import { Request, Response } from "express";
import * as AnalyticsModel from "../models/analyticsModel";

const FILTER_VALUES: AnalyticsModel.AnalyticsFilter[] = ["overall", "today", "this_month", "this_year"];

function parseFilter(req: Request, res: Response): AnalyticsModel.AnalyticsFilter | null {
  const rawValue = req.query.filter;
  if (rawValue === undefined) return "overall";
  if (typeof rawValue !== "string") {
    res.status(400).json({
      success: false,
      status: "ERROR",
      message: "filter must be a string",
      data: null,
    });
    return null;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (FILTER_VALUES.includes(normalized as AnalyticsModel.AnalyticsFilter)) {
    return normalized as AnalyticsModel.AnalyticsFilter;
  }
  res.status(400).json({
    success: false,
    status: "ERROR",
    message: "Invalid filter. Use one of overall, today, this_month, this_year",
    data: null,
  });
  return null;
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value || 0);
}

export async function popularRestaurants(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const rows = await AnalyticsModel.getPopularRestaurants(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Popular restaurants retrieved",
      data: {
        filter,
        restaurants: rows.map((row, index) => ({
          rank: index + 1,
          restaurant_id: row.restaurant_id,
          restaurant_name: row.restaurant_name,
          logo_url: row.logo_url,
          total_orders: row.total_orders,
          total_revenue: toNumber(row.total_revenue),
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get popular restaurants",
      data: null,
    });
  }
}

export async function statistics(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const stats = await AnalyticsModel.getPlatformStatistics(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Platform statistics retrieved",
      data: {
        filter,
        ...stats,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get platform statistics",
      data: null,
    });
  }
}

export async function orderStatistics(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const stats = await AnalyticsModel.getOrderStatistics(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Order statistics retrieved",
      data: {
        filter,
        ...stats,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get order statistics",
      data: null,
    });
  }
}

export async function topDeliveryMen(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const rows = await AnalyticsModel.getTopDeliveryMen(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Top delivery men retrieved",
      data: {
        filter,
        delivery_men: rows.map((row, index) => ({
          rank: index + 1,
          ...row,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get top delivery men",
      data: null,
    });
  }
}

export async function topRestaurants(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const rows = await AnalyticsModel.getTopRestaurants(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Top restaurants retrieved",
      data: {
        filter,
        restaurants: rows.map((row, index) => ({
          rank: index + 1,
          restaurant_id: row.restaurant_id,
          restaurant_name: row.restaurant_name,
          logo_url: row.logo_url,
          delivered_orders: row.delivered_orders,
          total_orders: row.total_orders,
          total_revenue: toNumber(row.total_revenue),
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get top restaurants",
      data: null,
    });
  }
}

export async function topRatedFood(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const rows = await AnalyticsModel.getTopRatedFood(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Top rated food retrieved",
      data: {
        filter,
        items: rows.map((row, index) => ({
          rank: index + 1,
          menu_item_id: row.menu_item_id,
          menu_item_name: row.menu_item_name,
          menu_item_image_url: row.menu_item_image_url,
          restaurant_id: row.restaurant_id,
          restaurant_name: row.restaurant_name,
          restaurant_logo_url: row.restaurant_logo_url,
          rating_score: toNumber(row.rating_score),
          quantity_sold: row.quantity_sold,
          order_items_count: row.order_items_count,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get top rated food",
      data: null,
    });
  }
}

export async function topSellingFood(req: Request, res: Response): Promise<void> {
  try {
    const filter = parseFilter(req, res);
    if (!filter) return;
    const rows = await AnalyticsModel.getTopSellingFood(filter);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Top selling food retrieved",
      data: {
        filter,
        items: rows.map((row, index) => ({
          rank: index + 1,
          menu_item_id: row.menu_item_id,
          menu_item_name: row.menu_item_name,
          menu_item_image_url: row.menu_item_image_url,
          restaurant_id: row.restaurant_id,
          restaurant_name: row.restaurant_name,
          restaurant_logo_url: row.restaurant_logo_url,
          quantity_sold: row.quantity_sold,
          total_revenue: toNumber(row.total_revenue),
          order_items_count: row.order_items_count,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get top selling food",
      data: null,
    });
  }
}
