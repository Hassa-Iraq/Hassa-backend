import { Request, Response } from "express";
import pool from "../db/connection";
import { AuthRequest } from "../middleware/auth";
import { cache } from "../utils/redis";
import { getFileUrl } from "../utils/fileUpload";
import * as Restaurant from "../models/Restaurant";

async function ensureRestaurantOwnership(
  req: AuthRequest,
  res: Response,
  restaurantId: string
): Promise<boolean> {
  const row = await Restaurant.findById(restaurantId);
  if (!row) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Restaurant not found",
      data: null,
    });
    return false;
  }
  if (req.user!.id !== row.user_id) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "You do not have permission to manage this restaurant",
      data: null,
    });
    return false;
  }
  return true;
}

async function ensureBannerOwnership(
  req: AuthRequest,
  res: Response,
  bannerId: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT b.restaurant_id, r.user_id FROM banners.banners b
     JOIN restaurant.restaurants r ON b.restaurant_id = r.id WHERE b.id = $1`,
    [bannerId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Banner not found",
      data: null,
    });
    return false;
  }
  if (r.rows[0].user_id !== req.user!.id) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "You do not have permission to manage this banner",
      data: null,
    });
    return false;
  }
  return true;
}

export async function createBanner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const restaurant_id = req.body.restaurant_id as string;
    const banner_name = req.body.banner_name as string;
    const banner_image_url = req.body.banner_image_url as string;
    if (!restaurant_id || !banner_name) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant_id and banner_name are required",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, restaurant_id);
    if (!ok) return;
    const imageUrl =
      banner_image_url?.trim() ||
      (req.file && getFileUrl(req.file.filename, req.file.fieldname));
    if (!imageUrl) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Either banner_image (file) or banner_image_url is required",
        data: null,
      });
      return;
    }
    const result = await pool.query(
      `INSERT INTO banners.banners
       (restaurant_id, banner_name, banner_image_url, description, status, requested_by_user_id, valid_from, valid_to)
       VALUES ($1, $2, $3, $4, 'requested', $5, $6, $7) RETURNING *`,
      [
        restaurant_id,
        banner_name.trim(),
        imageUrl,
        req.body.description ?? null,
        req.user!.id,
        req.body.valid_from ?? null,
        req.body.valid_to ?? null,
      ]
    );
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Banner request created",
      data: { banner: result.rows[0] },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create banner",
      data: null,
    });
  }
}

export async function listBanners(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const restaurant_id = req.query.restaurant_id as string | undefined;
    const status = req.query.status as string | undefined;
    let q = `SELECT b.*, r.name AS restaurant_name
             FROM banners.banners b
             JOIN restaurant.restaurants r ON b.restaurant_id = r.id
             WHERE r.user_id = $1`;
    const params: unknown[] = [userId];
    let i = 2;
    if (restaurant_id) {
      const ok = await ensureRestaurantOwnership(req, res, restaurant_id);
      if (!ok) return;
      q += ` AND b.restaurant_id = $${i++}`;
      params.push(restaurant_id);
    }
    if (status) {
      q += ` AND b.status = $${i++}`;
      params.push(status);
    }
    q += ` ORDER BY b.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(limit, offset);
    const result = await pool.query(q, params);
    let countQ = `SELECT COUNT(*)::int AS total FROM banners.banners b JOIN restaurant.restaurants r ON b.restaurant_id = r.id WHERE r.user_id = $1`;
    const countParams: unknown[] = [userId];
    let j = 2;
    if (restaurant_id) {
      countQ += ` AND b.restaurant_id = $${j++}`;
      countParams.push(restaurant_id);
    }
    if (status) {
      countQ += ` AND b.status = $${j}`;
      countParams.push(status);
    }
    const countResult = await pool.query(countQ, countParams);
    const total = countResult.rows[0]?.total ?? 0;
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banners listed",
      data: {
        banners: result.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list banners",
      data: null,
    });
  }
}

export async function getBanner(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const ok = await ensureBannerOwnership(req, res, id);
    if (!ok) return;
    const result = await pool.query(
      `SELECT b.*, r.name AS restaurant_name FROM banners.banners b
       JOIN restaurant.restaurants r ON b.restaurant_id = r.id WHERE b.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Banner not found",
        data: null,
      });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banner retrieved",
      data: { banner: result.rows[0] },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get banner",
      data: null,
    });
  }
}

export async function acceptBannerQuote(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const ok = await ensureBannerOwnership(req, res, id);
    if (!ok) return;
    const bannerResult = await pool.query(
      "SELECT status, quote_amount FROM banners.banners WHERE id = $1",
      [id]
    );
    if (bannerResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Banner not found",
        data: null,
      });
      return;
    }
    const banner = bannerResult.rows[0];
    if (banner.status !== "quoted") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: `Banner must be in 'quoted' status to accept. Current status ${banner.status}`,
        data: null,
      });
      return;
    }
    if (banner.quote_amount == null) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Quote amount is not set for this banner",
        data: null,
      });
      return;
    }
    const updateResult = await pool.query(
      `UPDATE banners.banners SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by_user_id = $1 WHERE id = $2 RETURNING *`,
      [req.user!.id, id]
    );
    await cache.delPattern("banners:public:approved:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banner quote accepted",
      data: { banner: updateResult.rows[0] },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to accept quote",
      data: null,
    });
  }
}

export async function rejectBannerQuote(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const ok = await ensureBannerOwnership(req, res, id);
    if (!ok) return;
    const bannerResult = await pool.query(
      "SELECT status FROM banners.banners WHERE id = $1",
      [id]
    );
    if (bannerResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Banner not found",
        data: null,
      });
      return;
    }
    if (bannerResult.rows[0].status !== "quoted") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: `Banner must be in 'quoted' status to reject. Current status: ${bannerResult.rows[0].status}`,
        data: null,
      });
      return;
    }
    const updateResult = await pool.query(
      "UPDATE banners.banners SET status = 'rejected' WHERE id = $1 RETURNING *",
      [id]
    );
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banner quote rejected",
      data: { banner: updateResult.rows[0] },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to reject quote",
      data: null,
    });
  }
}

export async function listPublicBanners(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const cacheKey = `banners:public:approved:${page}:${limit}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      res.status(200).json({
        success: true,
        status: "OK",
        message: "Banners listed",
        data: cached,
      });
      return;
    }
    const now = new Date();
    const result = await pool.query(
      `SELECT b.*, r.name AS restaurant_name
       FROM banners.banners b
       JOIN restaurant.restaurants r ON b.restaurant_id = r.id
       WHERE b.status = 'approved' AND (b.is_public = true OR b.is_public IS NULL)
         AND (b.valid_from IS NULL OR b.valid_from <= $1)
         AND (b.valid_to IS NULL OR b.valid_to >= $1)
       ORDER BY b.approved_at DESC NULLS LAST, b.created_at DESC
       LIMIT $2 OFFSET $3`,
      [now, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM banners.banners b
       WHERE b.status = 'approved' AND (b.is_public = true OR b.is_public IS NULL)
         AND (b.valid_from IS NULL OR b.valid_from <= $1)
         AND (b.valid_to IS NULL OR b.valid_to >= $1)`,
      [now]
    );
    const total = countResult.rows[0]?.total ?? 0;
    const data = {
      banners: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
    await cache.set(cacheKey, data, 300);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banners listed successfully",
      data,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list banners",
      data: null,
    });
  }
}