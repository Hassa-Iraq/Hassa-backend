import { Request, Response } from "express";
import pool from "../db/connection";

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

function buildPattern(q: string): string {
  return `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

export async function globalSearch(req: Request, res: Response): Promise<void> {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Search query (q) is required",
        data: null,
      });
      return;
    }

    const lat = parseCoordinate(req.query.lat ?? req.query.latitude);
    const lng = parseCoordinate(req.query.lng ?? req.query.longitude);
    const hasLocation = lat != null && lng != null;
    const restaurantLimit = Math.min(20, Math.max(1, parseInt(String(req.query.restaurant_limit)) || 5));
    const itemLimit = Math.min(50, Math.max(1, parseInt(String(req.query.item_limit)) || 10));
    const pattern = buildPattern(q);

    const distanceSql = hasLocation
      ? `(6371 * acos(LEAST(1, GREATEST(-1,
           cos(radians($2)) * cos(radians(r.latitude)) *
           cos(radians(r.longitude) - radians($3)) +
           sin(radians($2)) * sin(radians(r.latitude))
         ))))`
      : "NULL";

    const [restaurantResult, menuItemResult] = await Promise.all([
      pool.query(
        `SELECT
           r.id, r.name, r.description, r.address, r.cuisine,
           r.logo_url, r.cover_image_url,
           r.delivery_time_min, r.delivery_time_max,
           r.is_open, r.free_delivery_enabled,
           COALESCE((r.additional_data ->> 'rating')::numeric, 0) AS rating,
           COALESCE((r.additional_data ->> 'rating_count')::int, 0) AS rating_count,
           ${distanceSql} AS distance_km
         FROM restaurant.restaurants r
         WHERE r.parent_id IS NULL
           AND r.is_active = true
           AND r.is_blocked = false
           AND r.is_open = true
           AND (r.name ILIKE $1 OR r.description ILIKE $1 OR r.cuisine ILIKE $1 OR r.address ILIKE $1)
         ORDER BY ${hasLocation ? "distance_km ASC," : ""} r.name ASC
         LIMIT $${hasLocation ? 4 : 2}`,
        hasLocation ? [pattern, lat, lng, restaurantLimit] : [pattern, restaurantLimit]
      ),
      pool.query(
        `SELECT
           mi.id, mi.name, mi.description, mi.price, mi.image_url,
           mi.is_available, mi.category_id, mi.restaurant_id,
           r.name AS restaurant_name,
           r.logo_url AS restaurant_logo_url,
           r.delivery_time_min AS restaurant_delivery_time_min,
           r.delivery_time_max AS restaurant_delivery_time_max
         FROM restaurant.menu_items mi
         JOIN restaurant.restaurants r
           ON r.id = mi.restaurant_id
          AND r.is_active = true
          AND r.is_blocked = false
          AND r.is_open = true
          AND r.parent_id IS NULL
         WHERE mi.is_available = true
           AND (
             mi.name ILIKE $1
             OR mi.description ILIKE $1
             OR array_to_string(COALESCE(mi.search_tags, ARRAY[]::text[]), ' ') ILIKE $1
           )
         ORDER BY mi.name ASC
         LIMIT $2`,
        [pattern, itemLimit]
      ),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Search completed",
      data: {
        query: q,
        restaurants: restaurantResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          address: r.address,
          cuisine: r.cuisine,
          logo_url: normalizeImageUrl(r.logo_url),
          cover_image_url: normalizeImageUrl(r.cover_image_url),
          delivery_time_min: r.delivery_time_min,
          delivery_time_max: r.delivery_time_max,
          is_open: r.is_open,
          free_delivery_enabled: r.free_delivery_enabled,
          rating: r.rating != null ? parseFloat(String(r.rating)) : 0,
          rating_count: r.rating_count ?? 0,
          distance_km: r.distance_km != null ? parseFloat(String(r.distance_km)) : null,
        })),
        menu_items: menuItemResult.rows.map((mi) => ({
          id: mi.id,
          name: mi.name,
          description: mi.description,
          price: parseFloat(String(mi.price)),
          image_url: normalizeImageUrl(mi.image_url),
          is_available: mi.is_available,
          category_id: mi.category_id,
          restaurant_id: mi.restaurant_id,
          restaurant_name: mi.restaurant_name,
          restaurant_logo_url: normalizeImageUrl(mi.restaurant_logo_url),
          restaurant_delivery_time_min: mi.restaurant_delivery_time_min,
          restaurant_delivery_time_max: mi.restaurant_delivery_time_max,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Search failed",
      data: null,
    });
  }
}

// GET /search/restaurants  — dedicated restaurant search with lat/lng support
export async function searchRestaurants(req: Request, res: Response): Promise<void> {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ success: false, status: "ERROR", message: "Search query (q) is required", data: null });
      return;
    }

    const lat = parseCoordinate(req.query.lat ?? req.query.latitude);
    const lng = parseCoordinate(req.query.lng ?? req.query.longitude);
    const hasLocation = lat != null && lng != null;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const pattern = buildPattern(q);

    const distanceSql = hasLocation
      ? `(6371 * acos(LEAST(1, GREATEST(-1,
           cos(radians($2)) * cos(radians(r.latitude)) *
           cos(radians(r.longitude) - radians($3)) +
           sin(radians($2)) * sin(radians(r.latitude))
         ))))`
      : "NULL";

    const baseParams = hasLocation ? [pattern, lat, lng] : [pattern];
    const limitIdx = baseParams.length + 1;
    const offsetIdx = baseParams.length + 2;

    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT
           r.id, r.name, r.description, r.address, r.cuisine,
           r.logo_url, r.cover_image_url,
           r.delivery_time_min, r.delivery_time_max,
           r.is_open, r.free_delivery_enabled,
           COALESCE((r.additional_data ->> 'rating')::numeric, 0) AS rating,
           ${distanceSql} AS distance_km
         FROM restaurant.restaurants r
         WHERE r.parent_id IS NULL AND r.is_active = true AND r.is_blocked = false AND r.is_open = true
           AND (r.name ILIKE $1 OR r.description ILIKE $1 OR r.cuisine ILIKE $1 OR r.address ILIKE $1)
         ORDER BY ${hasLocation ? "distance_km ASC," : ""} r.name ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...baseParams, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM restaurant.restaurants r
         WHERE r.parent_id IS NULL AND r.is_active = true AND r.is_blocked = false AND r.is_open = true
           AND (r.name ILIKE $1 OR r.description ILIKE $1 OR r.cuisine ILIKE $1 OR r.address ILIKE $1)`,
        [pattern]
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Search completed",
      data: {
        query: q,
        restaurants: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          address: r.address,
          cuisine: r.cuisine,
          logo_url: normalizeImageUrl(r.logo_url),
          cover_image_url: normalizeImageUrl(r.cover_image_url),
          delivery_time_min: r.delivery_time_min,
          delivery_time_max: r.delivery_time_max,
          is_open: r.is_open,
          free_delivery_enabled: r.free_delivery_enabled,
          rating: r.rating != null ? parseFloat(String(r.rating)) : 0,
          distance_km: r.distance_km != null ? parseFloat(String(r.distance_km)) : null,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Search failed",
      data: null,
    });
  }
}

// GET /search/menu-items  — dedicated menu item search
export async function searchMenuItems(req: Request, res: Response): Promise<void> {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ success: false, status: "ERROR", message: "Search query (q) is required", data: null });
      return;
    }

    const restaurant_id = typeof req.query.restaurant_id === "string" ? req.query.restaurant_id.trim() : undefined;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const pattern = buildPattern(q);

    const params: unknown[] = [pattern];
    let restaurantFilter = "";
    if (restaurant_id) {
      restaurantFilter = ` AND mi.restaurant_id = $${params.length + 1}`;
      params.push(restaurant_id);
    }
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT
           mi.id, mi.name, mi.description, mi.price, mi.image_url,
           mi.is_available, mi.category_id, mi.restaurant_id,
           r.name AS restaurant_name,
           r.logo_url AS restaurant_logo_url
         FROM restaurant.menu_items mi
         JOIN restaurant.restaurants r
           ON r.id = mi.restaurant_id
          AND r.is_active = true AND r.is_blocked = false AND r.is_open = true AND r.parent_id IS NULL
         WHERE mi.is_available = true
           AND (mi.name ILIKE $1 OR mi.description ILIKE $1
                OR array_to_string(COALESCE(mi.search_tags, ARRAY[]::text[]), ' ') ILIKE $1)
           ${restaurantFilter}
         ORDER BY mi.name ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM restaurant.menu_items mi
         JOIN restaurant.restaurants r
           ON r.id = mi.restaurant_id
          AND r.is_active = true AND r.is_blocked = false AND r.is_open = true AND r.parent_id IS NULL
         WHERE mi.is_available = true
           AND (mi.name ILIKE $1 OR mi.description ILIKE $1
                OR array_to_string(COALESCE(mi.search_tags, ARRAY[]::text[]), ' ') ILIKE $1)
           ${restaurant_id ? " AND mi.restaurant_id = $2" : ""}`,
        restaurant_id ? [pattern, restaurant_id] : [pattern]
      ),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Search completed",
      data: {
        query: q,
        menu_items: result.rows.map((mi) => ({
          id: mi.id,
          name: mi.name,
          description: mi.description,
          price: parseFloat(String(mi.price)),
          image_url: normalizeImageUrl(mi.image_url),
          is_available: mi.is_available,
          category_id: mi.category_id,
          restaurant_id: mi.restaurant_id,
          restaurant_name: mi.restaurant_name,
          restaurant_logo_url: normalizeImageUrl(mi.restaurant_logo_url),
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Search failed",
      data: null,
    });
  }
}
