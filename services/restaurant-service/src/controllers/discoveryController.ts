import { Request, Response } from "express";
import pool from "../db/connection";
import * as Banner from "../models/Banner";
import * as Restaurant from "../models/Restaurant";
import * as MenuItem from "../models/MenuItem";
import * as CuisineCategory from "../models/CuisineCategory";
import * as MenuItemOption from "../models/MenuItemOption";
import * as Rating from "../models/Rating";
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

async function getFavoriteSet(userId: string | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const r = await pool.query(
    `SELECT restaurant_id FROM restaurant.customer_favorite_restaurants WHERE user_id = $1`,
    [userId]
  );
  return new Set(r.rows.map((row: { restaurant_id: string }) => row.restaurant_id));
}

export async function listRestaurants(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const lat = parseCoordinate(req.query.lat ?? req.query.latitude);
    const lng = parseCoordinate(req.query.lng ?? req.query.longitude);
    const cuisine = typeof req.query.cuisine === "string" ? req.query.cuisine.trim() : undefined;
    const hasLocation = lat != null && lng != null;
    const userId = req.user?.id;

    let data: Record<string, unknown>;
    if (!hasLocation) {
      const rows = await Restaurant.listPublic({ limit, offset, cuisine });
      const total = await Restaurant.countPublic({ cuisine });
      const favSet = await getFavoriteSet(userId);
      data = {
        restaurants: rows.map((row) => ({ ...Restaurant.toResponse(row), is_favorite: favSet.has(row.id) })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } else {
      const distanceSql = getDistanceSql("r");
      const cuisineCondition = cuisine ? `AND r.cuisine ILIKE $5` : "";
      const cuisineValue = cuisine ? [cuisine] : [];
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
           ${cuisineCondition}
         ORDER BY distance_km ASC, r.created_at DESC
         LIMIT $3 OFFSET $4`,
        [lat, lng, limit, offset, ...cuisineValue]
      );
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM restaurant.restaurants r
         WHERE r.parent_id IS NULL
           AND r.is_active = true
           AND r.is_blocked = false
           AND r.is_open = true
           AND r.latitude IS NOT NULL
           AND r.longitude IS NOT NULL
           ${cuisine ? `AND r.cuisine ILIKE $1` : ""}`,
        cuisine ? [cuisine] : []
      );
      const total = countResult.rows[0]?.total ?? 0;
      const favSet = await getFavoriteSet(userId);
      data = {
        restaurants: rowsResult.rows.map((row) => ({
          ...Restaurant.toResponse(row),
          distance_km: row.distance_km != null ? parseFloat(String(row.distance_km)) : null,
          is_favorite: favSet.has(row.id as string),
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

export async function getRestaurantPublic(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const userId = req.user?.id;
    const cacheKey = cacheKeys.restaurant(id);

    let restaurantData: { restaurant: Record<string, unknown> } | null =
      await cache.get<{ restaurant: Record<string, unknown> }>(cacheKey);

    if (!restaurantData) {
      const row = await Restaurant.findById(id);
      if (!row) {
        res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found or not available", data: null });
        return;
      }
      if (row.parent_id !== null || !row.is_active || row.is_blocked || !row.is_open) {
        res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found or not available", data: null });
        return;
      }
      const branchCountResult = await pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM restaurant.restaurants WHERE parent_id = $1`,
        [id]
      );
      restaurantData = {
        restaurant: { ...Restaurant.toResponse(row), branches_count: branchCountResult.rows[0]?.total ?? 0 },
      };
      await cache.set(cacheKey, restaurantData, 300);
    }

    const isFavorite = userId
      ? (await pool.query(
        `SELECT 1 FROM restaurant.customer_favorite_restaurants WHERE user_id = $1 AND restaurant_id = $2`,
        [userId, id]
      )).rowCount! > 0
      : false;

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant retrieved",
      data: { restaurant: { ...restaurantData.restaurant, is_favorite: isFavorite } },
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

export async function getHomeData(req: AuthRequest, res: Response): Promise<void> {
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
    const topLimit = Math.min(20, Math.max(1, parseInt(String(req.query.top_limit)) || 10));
    const dishesLimit = Math.min(50, Math.max(1, parseInt(String(req.query.dishes_limit)) || 10));
    const now = new Date();

    const bannersRows = await Banner.listPublic({ now, limit: bannersLimit, offset: 0 });
    const cuisineCategoriesRows = await CuisineCategory.listPublic();
    const topRestaurantsRows = await Restaurant.getTopNearby({ lat, lng, limit: topLimit });
    const topRestaurantIds = topRestaurantsRows.map((r) => r.id);
    const [recommendedDishesRows, favSet] = await Promise.all([
      MenuItem.getRecommendedDishes(topRestaurantIds, dishesLimit),
      getFavoriteSet(req.user?.id),
    ]);

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
        cuisine_categories: cuisineCategoriesRows.map((row) => ({
          id: row.id,
          name: row.name,
          image_url: normalizeImageUrl(row.image_url),
          display_order: row.display_order,
        })),
        recommended_restaurants: recommendedResult.rows.map((row) => ({
          ...Restaurant.toResponse(row),
          logo_url: normalizeImageUrl(row.logo_url),
          cover_image_url: normalizeImageUrl(row.cover_image_url),
          distance_km: row.distance_km != null ? parseFloat(String(row.distance_km)) : null,
          rating: row.rating != null ? parseFloat(String(row.rating)) : 0,
          recommendation_score:
            row.recommendation_score != null ? parseFloat(String(row.recommendation_score)) : 0,
          is_favorite: favSet.has(row.id as string),
        })),
        top_restaurants: topRestaurantsRows.map((row) => ({
          ...Restaurant.toResponse(row),
          logo_url: normalizeImageUrl(row.logo_url),
          cover_image_url: normalizeImageUrl(row.cover_image_url),
          distance_km: parseFloat(String(row.distance_km)),
          rating: parseFloat(String(row.rating)),
          is_favorite: favSet.has(row.id as string),
        })),
        recommended_dishes: recommendedDishesRows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          price: parseFloat(row.price),
          image_url: normalizeImageUrl(row.image_url),
          restaurant_id: row.restaurant_id,
          restaurant_name: row.restaurant_name,
          restaurant_logo_url: normalizeImageUrl(row.restaurant_logo_url),
          restaurant_delivery_time_min: row.restaurant_delivery_time_min,
          restaurant_delivery_time_max: row.restaurant_delivery_time_max,
          restaurant_rating: row.restaurant_rating != null ? parseFloat(String(row.restaurant_rating)) : 0,
          category_id: row.category_id,
          is_available: row.is_available,
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

async function getPopularItems(
  restaurantId: string,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  const r = await pool.query(
    `SELECT
       mi.id, mi.name, mi.description, mi.price, mi.image_url,
       mi.is_available, mi.display_order, mi.nutrition,
       mi.search_tags, mi.category_id, mi.subcategory_id,
       COALESCE(COUNT(oi.id), 0)::int AS order_count
     FROM restaurant.menu_items mi
     LEFT JOIN orders.order_items oi
       ON oi.menu_item_id = mi.id
      AND oi.created_at >= NOW() - INTERVAL '90 days'
     WHERE mi.restaurant_id = $1
       AND mi.is_available = true
     GROUP BY mi.id
     ORDER BY order_count DESC, mi.display_order ASC
     LIMIT $2`,
    [restaurantId, limit]
  );
  return r.rows as Array<Record<string, unknown>>;
}

export async function getRestaurantWithMenu(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const userId = req.user?.id;
    const cacheKey = `restaurant:${id}:details`;
    const cached = await cache.get<{ restaurant: Record<string, unknown>; menu: unknown }>(cacheKey);
    if (cached) {
      const [isFavorite, popularRows] = await Promise.all([
        userId
          ? pool.query(
              `SELECT 1 FROM restaurant.customer_favorite_restaurants WHERE user_id = $1 AND restaurant_id = $2`,
              [userId, id]
            ).then((r) => r.rowCount! > 0)
          : Promise.resolve(false),
        getPopularItems(id, 10),
      ]);
      const popularIds = popularRows.map((r) => r.id as string);
      const popularOptions = await MenuItemOption.listGroupsByItemIds(popularIds);
      const popular_items = popularRows.map((item) => ({
        ...item,
        price: parseFloat(String(item.price)),
        image_url: normalizeImageUrl(item.image_url),
        option_groups: (popularOptions.get(item.id as string) ?? []).map(MenuItemOption.groupToResponse),
      }));
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Restaurant with menu retrieved",
        data: { ...cached, restaurant: { ...cached.restaurant, is_favorite: isFavorite }, popular_items },
      });
      return;
    }

    const [restaurantRow, branchCountResult, categoriesResult, uncategorizedResult] = await Promise.all([
      Restaurant.findById(id),
      pool.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM restaurant.restaurants WHERE parent_id = $1`,
        [id]
      ),
      pool.query(
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
      ),
      pool.query(
        `SELECT id, name, description, price, image_url, is_available, display_order, nutrition, search_tags, category_id, subcategory_id
         FROM restaurant.menu_items
         WHERE restaurant_id = $1 AND category_id IS NULL AND subcategory_id IS NULL AND is_available = true
         ORDER BY display_order ASC, created_at ASC`,
        [id]
      ),
    ]);

    if (!restaurantRow || restaurantRow.parent_id !== null || !restaurantRow.is_active || restaurantRow.is_blocked || !restaurantRow.is_open) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Restaurant not found or not available",
        data: null,
      });
      return;
    }

    const allItemIds: string[] = [];
    for (const cat of categoriesResult.rows) {
      for (const item of (cat.items as Array<{ id: string }> | null) ?? []) {
        allItemIds.push(item.id);
      }
    }
    for (const item of uncategorizedResult.rows as Array<{ id: string }>) {
      allItemIds.push(item.id);
    }

    const [optionGroupsByItem, popularRows, isFavorite] = await Promise.all([
      MenuItemOption.listGroupsByItemIds(allItemIds),
      getPopularItems(id, 10),
      userId
        ? pool.query(
            `SELECT 1 FROM restaurant.customer_favorite_restaurants WHERE user_id = $1 AND restaurant_id = $2`,
            [userId, id]
          ).then((r) => r.rowCount! > 0)
        : Promise.resolve(false),
    ]);

    const attachOptions = (item: Record<string, unknown>) => ({
      ...item,
      option_groups: (optionGroupsByItem.get(item.id as string) ?? []).map(MenuItemOption.groupToResponse),
    });

    const popularIds = popularRows.map((r) => r.id as string);
    const popularOptions = await MenuItemOption.listGroupsByItemIds(popularIds);
    const popular_items = popularRows.map((item) => ({
      ...item,
      price: parseFloat(String(item.price)),
      image_url: normalizeImageUrl(item.image_url),
      option_groups: (popularOptions.get(item.id as string) ?? []).map(MenuItemOption.groupToResponse),
    }));

    const cacheableData = {
      restaurant: {
        ...Restaurant.toResponse(restaurantRow),
        branches_count: branchCountResult.rows[0]?.total ?? 0,
      },
      menu: {
        categories: categoriesResult.rows.map((r: { items?: Array<Record<string, unknown>> }) => ({
          ...r,
          items: (r.items ?? []).map(attachOptions),
        })),
        uncategorized_items: (uncategorizedResult.rows as Array<Record<string, unknown>>).map(attachOptions),
      },
    };
    await cache.set(cacheKey, cacheableData, 300);

    const data = { ...cacheableData, restaurant: { ...cacheableData.restaurant, is_favorite: isFavorite }, popular_items };
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant with menu retrieved",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get restaurant with menu",
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

    const allItemIds: string[] = [];
    for (const cat of categoriesResult.rows) {
      for (const item of (cat.items as Array<{ id: string }> | null) ?? []) {
        allItemIds.push(item.id);
      }
    }
    for (const item of uncategorizedResult.rows as Array<{ id: string }>) {
      allItemIds.push(item.id);
    }
    const optionGroupsByItem = await MenuItemOption.listGroupsByItemIds(allItemIds);

    const attachOptions = (item: Record<string, unknown>) => ({
      ...item,
      option_groups: (optionGroupsByItem.get(item.id as string) ?? []).map(MenuItemOption.groupToResponse),
    });

    const data = {
      restaurant: { id: restaurantResult.rows[0].id, name: restaurantResult.rows[0].name },
      categories: categoriesResult.rows.map((r: { items?: Array<Record<string, unknown>> }) => ({
        ...r,
        items: (r.items ?? []).map(attachOptions),
      })),
      uncategorizedItems: (uncategorizedResult.rows as Array<Record<string, unknown>>).map(attachOptions),
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

interface CartItemInput {
  menu_item_id: string;
  item_name?: string;
  unit_price: number;
  selected_option_ids?: string[];
}

interface OptionChange {
  option_id: string;
  option_name: string;
  change_type: "unavailable" | "price_changed";
  old_price?: number;
  new_price?: number;
}

interface CartItemResult {
  menu_item_id: string;
  item_name: string;
  change_type: "unavailable" | "price_changed" | "ok";
  old_base_price?: number;
  new_base_price?: number;
  option_changes: OptionChange[];
}

export async function validateCart(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const restaurantId = body.restaurant_id;
    const incomingItems = body.items as CartItemInput[] | undefined;

    if (!restaurantId || typeof restaurantId !== "string") {
      res.status(400).json({ success: false, status: "ERROR", message: "restaurant_id is required", data: null });
      return;
    }
    if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
      res.status(400).json({ success: false, status: "ERROR", message: "items must be a non-empty array", data: null });
      return;
    }

    for (const item of incomingItems) {
      if (!item.menu_item_id || typeof item.menu_item_id !== "string") {
        res.status(400).json({ success: false, status: "ERROR", message: "Each item requires menu_item_id", data: null });
        return;
      }
      if (typeof item.unit_price !== "number") {
        res.status(400).json({ success: false, status: "ERROR", message: "Each item requires unit_price", data: null });
        return;
      }
    }

    const itemIds = incomingItems.map((i) => i.menu_item_id);
    const freshItemsResult = await pool.query<{
      id: string; name: string; price: string; is_available: boolean; restaurant_id: string;
    }>(
      `SELECT id, name, price, is_available, restaurant_id
       FROM restaurant.menu_items
       WHERE id = ANY($1::uuid[])`,
      [itemIds]
    );

    const freshItemMap = new Map(freshItemsResult.rows.map((r) => [r.id, r]));
    const allSelectedOptionIds = incomingItems.flatMap((i) =>
      Array.isArray(i.selected_option_ids) ? i.selected_option_ids : []
    );

    const freshOptionsResult = allSelectedOptionIds.length > 0
      ? await pool.query<{ id: string; group_id: string; name: string; additional_price: string; is_available: boolean }>(
        `SELECT id, group_id, name, additional_price, is_available
           FROM restaurant.menu_item_options
           WHERE id = ANY($1::uuid[])`,
        [allSelectedOptionIds]
      )
      : { rows: [] };

    const freshOptionMap = new Map(freshOptionsResult.rows.map((o) => [o.id, o]));

    const changes: CartItemResult[] = [];
    let hasAnyChange = false;

    for (const cartItem of incomingItems) {
      const freshItem = freshItemMap.get(cartItem.menu_item_id);
      const selectedOptionIds = Array.isArray(cartItem.selected_option_ids) ? cartItem.selected_option_ids : [];

      if (!freshItem || !freshItem.is_available || freshItem.restaurant_id !== restaurantId) {
        hasAnyChange = true;
        changes.push({
          menu_item_id: cartItem.menu_item_id,
          item_name: cartItem.item_name ?? "Unknown item",
          change_type: "unavailable",
          option_changes: [],
        });
        continue;
      }

      const freshBasePrice = parseFloat(freshItem.price);
      const optionChanges: OptionChange[] = [];

      for (const optId of selectedOptionIds) {
        const freshOpt = freshOptionMap.get(optId);
        if (!freshOpt || !freshOpt.is_available) {
          hasAnyChange = true;
          optionChanges.push({
            option_id: optId,
            option_name: freshOpt?.name ?? "Unknown option",
            change_type: "unavailable",
          });
        }
      }

      const freshOptionsTotal = selectedOptionIds.reduce((sum, optId) => {
        const opt = freshOptionMap.get(optId);
        return sum + (opt && opt.is_available ? parseFloat(opt.additional_price) : 0);
      }, 0);
      const freshUnitPrice = Number((freshBasePrice + freshOptionsTotal).toFixed(2));
      const oldUnitPrice = Number(cartItem.unit_price.toFixed(2));

      const priceChanged = Math.abs(freshUnitPrice - oldUnitPrice) > 0.01;
      if (priceChanged) {
        hasAnyChange = true;
      }

      if (priceChanged || optionChanges.length > 0) {
        changes.push({
          menu_item_id: cartItem.menu_item_id,
          item_name: freshItem.name,
          change_type: priceChanged ? "price_changed" : "ok",
          old_base_price: priceChanged ? oldUnitPrice : undefined,
          new_base_price: priceChanged ? freshUnitPrice : undefined,
          option_changes: optionChanges,
        });
      }
    }

    res.status(200).json({
      success: true,
      status: "OK",
      message: hasAnyChange ? "Cart has changes" : "Cart is up to date",
      data: {
        valid: !hasAnyChange,
        changes,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to validate cart",
      data: null,
    });
  }
}

export async function getMenuItemDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };

    const item = await MenuItem.findById(id);
    if (!item || !item.is_available) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu item not found",
        data: null,
      });
      return;
    }

    const [optionGroups, restaurant] = await Promise.all([
      MenuItemOption.listGroupsByItemId(id),
      Restaurant.findById(item.restaurant_id),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu item retrieved",
      data: {
        item: {
          id: item.id,
          restaurant_id: item.restaurant_id,
          restaurant_name: restaurant?.name ?? null,
          restaurant_logo_url: restaurant?.logo_url ? normalizeImageUrl(restaurant.logo_url) : null,
          category_id: item.category_id,
          name: item.name,
          description: item.description,
          price: parseFloat(item.price),
          image_url: normalizeImageUrl(item.image_url),
          nutrition: item.nutrition,
          search_tags: item.search_tags,
          is_available: item.is_available,
          option_groups: optionGroups.map(MenuItemOption.groupToResponse),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch menu item",
      data: null,
    });
  }
}

export async function listRestaurantRatings(req: Request, res: Response): Promise<void> {
  try {
    const restaurantId = req.params.id as string;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant || !restaurant.is_active || restaurant.is_blocked) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }

    const [rows, summary] = await Promise.all([
      Rating.list(restaurantId, { limit, offset }),
      Rating.getSummary(restaurantId),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Ratings retrieved",
      data: {
        summary,
        ratings: rows.map(Rating.toResponse),
        pagination: {
          page,
          limit,
          total: summary.total,
          totalPages: Math.ceil(summary.total / limit),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to fetch ratings",
      data: null,
    });
  }
}

export async function adminDeleteRating(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ratingId } = req.params as { ratingId: string };
    const updated = await Rating.setVisibility(ratingId, false);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Rating not found", data: null });
      return;
    }
    res.status(200).json({ success: true, status: "OK", message: "Rating hidden", data: { rating_id: ratingId } });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to hide rating",
      data: null,
    });
  }
}
