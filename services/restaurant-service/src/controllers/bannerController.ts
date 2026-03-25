import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { cache } from "../utils/redis";
import { getFileUrl } from "../utils/fileUpload";
import * as Banner from "../models/Banner";

async function ensureRestaurantOwnership(
  req: AuthRequest,
  res: Response,
  restaurantId: string
): Promise<boolean> {
  const ownerId = await Banner.findRestaurantOwnerId(restaurantId);
  if (!ownerId) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Restaurant not found",
      data: null,
    });
    return false;
  }
  if (req.user!.id !== ownerId) {
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
  const ownerId = await Banner.findBannerOwnerId(bannerId);
  if (!ownerId) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Banner not found",
      data: null,
    });
    return false;
  }
  if (ownerId !== req.user!.id) {
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
    const created = await Banner.create({
      restaurant_id,
      banner_name: banner_name.trim(),
      banner_image_url: imageUrl,
      description: (req.body.description as string) ?? null,
      valid_from: (req.body.valid_from as string) ?? null,
      valid_to: (req.body.valid_to as string) ?? null,
    });
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Banner request created",
      data: { banner: created },
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
    if (restaurant_id) {
      const ok = await ensureRestaurantOwnership(req, res, restaurant_id);
      if (!ok) return;
    }

    const [rows, total] = await Promise.all([
      Banner.listByOwner({
        owner_user_id: userId,
        limit,
        offset,
        restaurant_id,
        status,
      }),
      Banner.countByOwner({
        owner_user_id: userId,
        restaurant_id,
        status,
      }),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Banners listed",
      data: {
        banners: rows,
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
    const banner = await Banner.findByIdForOwner(id, req.user!.id);
    if (!banner) {
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
      data: { banner },
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
    const [rows, total] = await Promise.all([
      Banner.listPublic({ now, limit, offset }),
      Banner.countPublic(now),
    ]);
    const data = {
      banners: rows,
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