import { Request, Response } from "express";
import pool from "../db/connection";
import * as Banner from "../models/Banner";
import * as Restaurant from "../models/Restaurant";
import { cache, cacheKeys } from "../utils/redis";
import { AuthRequest } from "../middleware/auth";

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{{")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname || null;
    } catch {
      return trimmed;
    }
  }
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getDistanceSql(alias: string): string {
  return `
    (6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians($1)) * cos(radians(${alias}.latitude)) *
        cos(radians(${alias}.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(${alias}.latitude))
      ))
    ))
  `;
}

export async function listRestaurants(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const lat = parseCoordinate(req.query.lat ?? req.query.latitude);
    const lng = parseCoordinate(req.query.lng ?? req.query.longitude);
    const hasLocation = lat != null && lng != null;

    let data: Record<string, unknown>;
    if (!hasLocation) {
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
      data = {
        restaurants: rows.map(Restaurant.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
      await cache.set(cacheKey, data, 300);
    } else {
      const distanceSql = getDistanceSql("r");
      const rowsResult = await pool.query(
        `SELECT r.*,
                ${distanceSql} AS distance_km
         FROM restaurant.restaurants r
         WHERE r.parent_id IS NULL
           AND r.is_active = true
           AND r.is_blocked = false
           AND r.is_open = true
           AND r.latitude IS NOT NULL
           AND r.longitude IS NOT NULL
         ORDER BY distance_km ASC, r.created_at DESC
         LIMIT $3 OFFSET $4`,
        [lat, lng, limit, offset]
      );
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM restaurant.restaurants r
         WHERE r.parent_id IS NULL
           AND r.is_active = true
           AND r.is_blocked = false
           AND r.is_open = true
           AND r.latitude IS NOT NULL
           AND r.longitude IS NOT NULL`
      );
      const total = countResult.rows[0]?.total ?? 0;
      data = {
        restaurants: rowsResult.rows.map((row) => ({
          ...Restaurant.toResponse(row),
          distance_km: row.distance_km != null ? parseFloat(String(row.distance_km)) : null,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

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
    const branchCountResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM restaurant.restaurants
       WHERE parent_id = $1`,
      [id]
    );
    const data = {
      restaurant: {
        ...Restaurant.toResponse(row),
        branches_count: branchCountResult.rows[0]?.total ?? 0,
      },
    };
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

export async function getHomeData(req: Request, res: Response): Promise<void> {
  try {
    const lat = parseCoordinate(req.query.lat ?? req.query.latitude);
    const lng = parseCoordinate(req.query.lng ?? req.query.longitude);
    if (lat == null || lng == null) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "lat and lng (or latitude and longitude) are required",
        data: null,
      });
      return;
    }

    const bannersLimit = Math.min(20, Math.max(1, parseInt(String(req.query.banners_limit)) || 10));
    const recommendedLimit = Math.min(20, Math.max(1, parseInt(String(req.query.recommended_limit)) || 10));
    const now = new Date();

    const bannersRows = await Banner.listPublic({ now, limit: bannersLimit, offset: 0 });

    const categoriesResult = await pool.query(
      `SELECT
         c.id,
         c.name,
         c.image_url,
         COUNT(mi.id)::int AS items_count
       FROM restaurant.menu_categories c
       JOIN restaurant.restaurants r
         ON r.id = c.restaurant_id
        AND r.parent_id IS NULL
        AND r.is_active = true
        AND r.is_blocked = false
        AND r.is_open = true
       LEFT JOIN restaurant.menu_items mi
         ON mi.category_id = c.id
        AND mi.is_available = true
       WHERE c.is_active = true
         AND c.parent_id IS NULL
       GROUP BY c.id, c.name, c.image_url
       ORDER BY items_count DESC, c.name ASC
       LIMIT 20`
    );

    const distanceSql = getDistanceSql("r");
    const recommendedResult = await pool.query(
      `SELECT
         r.*,
         ${distanceSql} AS distance_km,
         COALESCE((r.additional_data ->> 'rating')::numeric, 0) AS rating,
         (
           (COALESCE((r.additional_data ->> 'rating')::numeric, 0) * 2.0) +
           (CASE WHEN r.free_delivery_enabled THEN 1.0 ELSE 0 END) +
           (CASE
             WHEN r.delivery_time_min IS NULL AND r.delivery_time_max IS NULL THEN 0
             ELSE GREATEST(
               0,
               1 - (
                 (
                   COALESCE(r.delivery_time_min, r.delivery_time_max, 45) +
                   COALESCE(r.delivery_time_max, r.delivery_time_min, 45)
                 ) / 2.0
               ) / 120.0
             )
           END) +
           (1.0 / (1.0 + ${distanceSql}))
         ) AS recommendation_score
       FROM restaurant.restaurants r
       WHERE r.parent_id IS NULL
         AND r.is_active = true
         AND r.is_blocked = false
         AND r.is_open = true
         AND r.latitude IS NOT NULL
         AND r.longitude IS NOT NULL
       ORDER BY recommendation_score DESC, distance_km ASC, r.created_at DESC
       LIMIT $3`,
      [lat, lng, recommendedLimit]
    );

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Home data retrieved",
      data: {
        banners: bannersRows.map((row) => ({
          id: row.id,
          restaurant_id: row.restaurant_id,
          banner_name: row.banner_name,
          banner_image_url: normalizeImageUrl(row.banner_image_url),
          description: row.description,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
          restaurant_name: row.restaurant_name,
        })),
        categories: categoriesResult.rows.map((row) => ({
          ...row,
          image_url: normalizeImageUrl(row.image_url),
        })),
        recommended_restaurants: recommendedResult.rows.map((row) => ({
          ...Restaurant.toResponse(row),
          logo_url: normalizeImageUrl(row.logo_url),
          cover_image_url: normalizeImageUrl(row.cover_image_url),
          distance_km: row.distance_km != null ? parseFloat(String(row.distance_km)) : null,
          rating: row.rating != null ? parseFloat(String(row.rating)) : 0,
          recommendation_score:
            row.recommendation_score != null ? parseFloat(String(row.recommendation_score)) : 0,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get home data",
      data: null,
    });
  }
}

export async function favoriteRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const restaurantId = req.params.id as string;
    if (!restaurantId) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant id is required",
        data: null,
      });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
      return;
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || restaurant.parent_id !== null || !restaurant.is_active || restaurant.is_blocked) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Restaurant not found or not available",
        data: null,
      });
      return;
    }

    await pool.query(
      `INSERT INTO restaurant.customer_favorite_restaurants (user_id, restaurant_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, restaurant_id) DO NOTHING`,
      [userId, restaurantId]
    );

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant added to favorites",
      data: { restaurant_id: restaurantId },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to favorite restaurant",
      data: null,
    });
  }
}

export async function unfavoriteRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const restaurantId = req.params.id as string;
    const userId = req.user?.id;
    if (!restaurantId) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant id is required",
        data: null,
      });
      return;
    }
    if (!userId) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
      return;
    }

    await pool.query(
      `DELETE FROM restaurant.customer_favorite_restaurants
       WHERE user_id = $1 AND restaurant_id = $2`,
      [userId, restaurantId]
    );

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant removed from favorites",
      data: { restaurant_id: restaurantId },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to unfavorite restaurant",
      data: null,
    });
  }
}

export async function listFavoriteRestaurants(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        status: "ERROR",
        message: "Authentication required",
        data: null,
      });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const lat = parseCoordinate(req.query.lat ?? req.query.latitude);
    const lng = parseCoordinate(req.query.lng ?? req.query.longitude);

    let rowsResult;
    if (lat != null && lng != null) {
      const distanceSql = getDistanceSql("r");
      rowsResult = await pool.query(
        `SELECT r.*, f.created_at AS favorited_at, ${distanceSql} AS distance_km
         FROM restaurant.customer_favorite_restaurants f
         JOIN restaurant.restaurants r ON r.id = f.restaurant_id
         WHERE f.user_id = $3
           AND r.parent_id IS NULL
           AND r.is_active = true
           AND r.is_blocked = false
         ORDER BY f.created_at DESC
         LIMIT $4 OFFSET $5`,
        [lat, lng, userId, limit, offset]
      );
    } else {
      rowsResult = await pool.query(
        `SELECT r.*, f.created_at AS favorited_at
         FROM restaurant.customer_favorite_restaurants f
         JOIN restaurant.restaurants r ON r.id = f.restaurant_id
         WHERE f.user_id = $1
           AND r.parent_id IS NULL
           AND r.is_active = true
           AND r.is_blocked = false
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM restaurant.customer_favorite_restaurants f
       JOIN restaurant.restaurants r ON r.id = f.restaurant_id
       WHERE f.user_id = $1
         AND r.parent_id IS NULL
         AND r.is_active = true
         AND r.is_blocked = false`,
      [userId]
    );
    const total = countResult.rows[0]?.total ?? 0;

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Favorite restaurants listed",
      data: {
        restaurants: rowsResult.rows.map((row) => ({
          ...Restaurant.toResponse(row),
          favorited_at: row.favorited_at,
          distance_km: row.distance_km != null ? parseFloat(String(row.distance_km)) : null,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list favorite restaurants",
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