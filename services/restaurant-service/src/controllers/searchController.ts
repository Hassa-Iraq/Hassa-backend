import { Request, Response } from "express";
import pool from "../db/connection";

export async function searchRestaurants(req: Request, res: Response): Promise<void> {
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
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const result = await pool.query(
      `SELECT id, name, description, address, contact_email, phone, is_open, created_at
       FROM restaurant.restaurants
       WHERE parent_id IS NULL AND is_active = true AND is_blocked = false AND is_open = true
         AND (name ILIKE $1 OR description ILIKE $1 OR address ILIKE $1)
       ORDER BY name
       LIMIT $2 OFFSET $3`,
      [pattern, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM restaurant.restaurants
       WHERE parent_id IS NULL AND is_active = true AND is_blocked = false AND is_open = true
         AND (name ILIKE $1 OR description ILIKE $1 OR address ILIKE $1)`,
      [pattern]
    );
    const total = countResult.rows[0]?.total ?? 0;
    const restaurants = result.rows.map((r: { contact_email?: string; email?: string }) => ({
      ...r,
      contact_email: r.contact_email ?? (r as { email?: string }).email ?? null,
    }));
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Search completed",
      data: {
        restaurants,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        query: q,
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

export async function searchMenuItems(req: Request, res: Response): Promise<void> {
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
    const restaurant_id = req.query.restaurant_id as string | undefined;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    let whereClause =
      "mi.is_available = true AND (mi.name ILIKE $1 OR mi.description ILIKE $1 OR array_to_string(COALESCE(mi.search_tags, ARRAY[]::text[]), ' ') ILIKE $1)";
    const params: unknown[] = [pattern];
    if (restaurant_id) {
      whereClause += " AND mi.restaurant_id = $2";
      params.push(restaurant_id);
    }
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    params.push(limit, offset);
    const result = await pool.query(
      `SELECT mi.id, mi.restaurant_id, mi.category_id, mi.subcategory_id, mi.name, mi.description, mi.price, mi.image_url, mi.nutrition, mi.search_tags, mi.is_available,
              r.name AS restaurant_name
       FROM restaurant.menu_items mi
       JOIN restaurant.restaurants r ON r.id = mi.restaurant_id AND r.is_active = true AND r.is_blocked = false AND r.is_open = true AND r.parent_id IS NULL
       WHERE ${whereClause}
       ORDER BY mi.name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    let countQuery =
      "SELECT COUNT(*)::int AS total FROM restaurant.menu_items mi JOIN restaurant.restaurants r ON r.id = mi.restaurant_id AND r.is_active = true AND r.is_blocked = false AND r.is_open = true AND r.parent_id IS NULL WHERE mi.is_available = true AND (mi.name ILIKE $1 OR mi.description ILIKE $1 OR array_to_string(COALESCE(mi.search_tags, ARRAY[]::text[]), ' ') ILIKE $1)";
    const countParams: unknown[] = [pattern];
    if (restaurant_id) {
      countQuery += " AND mi.restaurant_id = $2";
      countParams.push(restaurant_id);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = countResult.rows[0]?.total ?? 0;
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Search completed",
      data: {
        menuItems: result.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        query: q,
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
