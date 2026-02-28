import { Request, Response } from "express";
import pool from "../db/connection";
import * as Restaurant from "../models/Restaurant";
import { cache, cacheKeys } from "../utils/redis";

export async function listRestaurants(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const cacheKey = cacheKeys.restaurantList(page, limit);
    const cached = await cache.get<{ restaurants: unknown[]; pagination: unknown }>(cacheKey);
    if (cached) {
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Restaurants listed",
        data: cached,
      });
      return;
    }
    const rows = await Restaurant.listPublic({ limit, offset });
    const total = await Restaurant.countPublic();
    const restaurants = rows.map(Restaurant.toResponse);
    const data = {
      restaurants,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
    await cache.set(cacheKey, data, 300);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurants listed",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list restaurants",
      data: null,
    });
  }
}

export async function getRestaurantPublic(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const cacheKey = cacheKeys.restaurant(id);
    const cached = await cache.get<{ restaurant: unknown }>(cacheKey);
    if (cached) {
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Restaurant retrieved",
        data: cached,
      });
      return;
    }
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Restaurant not found or not available",
        data: null,
      });
      return;
    }
    if (row.parent_id !== null || !row.is_active || row.is_blocked || !row.is_open) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Restaurant not found or not available",
        data: null,
      });
      return;
    }
    const data = { restaurant: Restaurant.toResponse(row) };
    await cache.set(cacheKey, data, 300);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant retrieved",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get restaurant",
      data: null,
    });
  }
}

export async function getRestaurantMenu(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const cacheKey = cacheKeys.restaurantMenu(id);
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Menu retrieved",
        data: cached,
      });
      return;
    }
    const restaurantResult = await pool.query(
      "SELECT id, name FROM restaurant.restaurants WHERE id = $1 AND parent_id IS NULL AND is_active = true AND is_blocked = false AND is_open = true",
      [id]
    );
    if (restaurantResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Restaurant not found or not available",
        data: null,
      });
      return;
    }
    const categoriesResult = await pool.query(
      `SELECT c.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', mi.id, 'name', mi.name, 'description', mi.description, 'price', mi.price,
            'image_url', mi.image_url, 'is_available', mi.is_available, 'display_order', mi.display_order,
            'category_id', mi.category_id, 'subcategory_id', mi.subcategory_id,
            'nutrition', mi.nutrition, 'search_tags', mi.search_tags
          ) ORDER BY mi.display_order, mi.created_at)
          FROM restaurant.menu_items mi
          WHERE (mi.subcategory_id = c.id OR (mi.subcategory_id IS NULL AND mi.category_id = c.id))
            AND mi.is_available = true),
          '[]'::json
        ) AS items
       FROM restaurant.menu_categories c
       WHERE c.restaurant_id = $1 AND c.is_active = true
       ORDER BY c.display_order ASC, c.created_at ASC`,
      [id]
    );
    const uncategorizedResult = await pool.query(
      `SELECT id, name, description, price, image_url, is_available, display_order, nutrition, search_tags, category_id, subcategory_id
       FROM restaurant.menu_items
       WHERE restaurant_id = $1 AND category_id IS NULL AND subcategory_id IS NULL AND is_available = true
       ORDER BY display_order ASC, created_at ASC`,
      [id]
    );
    const data = {
      restaurant: { id: restaurantResult.rows[0].id, name: restaurantResult.rows[0].name },
      categories: categoriesResult.rows.map((r: { items?: unknown }) => ({
        ...r,
        items: r.items ?? [],
      })),
      uncategorizedItems: uncategorizedResult.rows,
    };
    await cache.set(cacheKey, data, 300);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu retrieved",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get menu",
      data: null,
    });
  }
}