import { Response } from "express";
import * as Restaurant from "../models/Restaurant";
import { AuthRequest } from "../middleware/auth";
import { cache, cacheKeys } from "../utils/redis";

async function ensureOwnership(
  req: AuthRequest,
  res: Response,
  restaurantId: string
): Promise<Restaurant.RestaurantRow | null> {
  const row = await Restaurant.findById(restaurantId);
  if (!row) {
    res.status(404).json({
      success: false,
      status: "ERROR",
      message: "Restaurant not found",
      data: null,
    });
    return null;
  }
  if (req.user!.id !== row.user_id) {
    res.status(403).json({
      success: false,
      status: "ERROR",
      message: "You do not have permission to manage this restaurant",
      data: null,
    });
    return null;
  }
  return row;
}

export async function createRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const name = body.name as string;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Restaurant name is required",
        data: null,
      });
      return;
    }
    const row = await Restaurant.create({
      user_id: req.user!.id,
      name: name.trim(),
      parent_id: null,
      address: (body.address as string) ?? null,
      zone: (body.zone as string) ?? null,
      cuisine: (body.cuisine as string) ?? null,
      logo_url: (body.logo_url as string) ?? null,
      cover_image_url: (body.cover_image_url as string) ?? null,
      delivery_time_min: typeof body.delivery_time_min === "number" ? body.delivery_time_min : null,
      delivery_time_max: typeof body.delivery_time_max === "number" ? body.delivery_time_max : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      tin: (body.tin as string) ?? null,
      tin_expiry_date: (body.tin_expiry_date as string) ?? null,
      certificate_url: (body.certificate_url as string) ?? null,
      additional_data: typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null,
      contact_email: (body.contact_email as string) ?? null,
      phone: (body.phone as string) ?? null,
      tax_type: (body.tax_type as string) ?? "exclusive",
      tax_rate: typeof body.tax_rate === "number" ? body.tax_rate : 0,
      free_delivery_enabled: Boolean(body.free_delivery_enabled),
      free_delivery_max_amount: typeof body.free_delivery_max_amount === "number" ? body.free_delivery_max_amount : null,
      free_delivery_min_distance_km: typeof body.free_delivery_min_distance_km === "number" ? body.free_delivery_min_distance_km : null,
      description: (body.description as string) ?? null,
    });
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Restaurant created successfully",
      data: { restaurant: Restaurant.toResponse(row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create restaurant",
      data: null,
    });
  }
}

export async function createBranch(req: AuthRequest, res: Response): Promise<void> {
  try {
    const parentId = req.body.parent_id ?? req.body.parent_restaurant_id;
    if (!parentId || typeof parentId !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "parent_id (or parent_restaurant_id) is required",
        data: null,
      });
      return;
    }
    const parent = await ensureOwnership(req, res, parentId);
    if (!parent) return;
    const body = req.body as Record<string, unknown>;
    const name = (body.name as string) ?? `${parent.name} (Branch)`;
    const row = await Restaurant.create({
      user_id: req.user!.id,
      parent_id: parentId,
      name: typeof name === "string" ? name.trim() : name,
      address: (body.address as string) ?? null,
      zone: (body.zone as string) ?? null,
      cuisine: (body.cuisine as string) ?? null,
      logo_url: (body.logo_url as string) ?? null,
      cover_image_url: (body.cover_image_url as string) ?? null,
      delivery_time_min: typeof body.delivery_time_min === "number" ? body.delivery_time_min : null,
      delivery_time_max: typeof body.delivery_time_max === "number" ? body.delivery_time_max : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : null,
      tin: (body.tin as string) ?? null,
      tin_expiry_date: (body.tin_expiry_date as string) ?? null,
      certificate_url: (body.certificate_url as string) ?? null,
      additional_data: typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null,
      contact_email: (body.contact_email as string) ?? null,
      phone: (body.phone as string) ?? null,
      tax_type: (body.tax_type as string) ?? "exclusive",
      tax_rate: typeof body.tax_rate === "number" ? body.tax_rate : 0,
      free_delivery_enabled: Boolean(body.free_delivery_enabled),
      free_delivery_max_amount: typeof body.free_delivery_max_amount === "number" ? body.free_delivery_max_amount : null,
      free_delivery_min_distance_km: typeof body.free_delivery_min_distance_km === "number" ? body.free_delivery_min_distance_km : null,
      description: (body.description as string) ?? null,
    });
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Branch created successfully",
      data: { restaurant: Restaurant.toResponse(row) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create branch",
      data: null,
    });
  }
}

export async function listMyRestaurants(req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const rows = await Restaurant.findByUserId(req.user!.id, { limit, offset });
    const total = await Restaurant.countByUserId(req.user!.id);
    const restaurants = rows.map(Restaurant.toResponse);
    const withBranches = await Promise.all(
      restaurants.map(async (r) => {
        const id = r.id as string;
        if (r.parent_id == null) {
          const branches = await Restaurant.findBranches(id);
          return { ...r, branches: branches.map(Restaurant.toResponse) };
        }
        return { ...r, branches: [] };
      })
    );
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurants listed",
      data: {
        restaurants: withBranches,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
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

export async function getRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id);
    if (!row) return;
    const branches = row.parent_id == null ? await Restaurant.findBranches(row.id) : [];
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant retrieved",
      data: {
        restaurant: Restaurant.toResponse(row),
        branches: branches.map(Restaurant.toResponse),
      },
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

export async function updateRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id);
    if (!row) return;
    const body = req.body as Record<string, unknown>;
    const params: Restaurant.UpdateRestaurantParams = {};
    if (body.name !== undefined) params.name = String(body.name);
    if (body.address !== undefined) params.address = body.address == null ? null : String(body.address);
    if (body.zone !== undefined) params.zone = body.zone == null ? null : String(body.zone);
    if (body.cuisine !== undefined) params.cuisine = body.cuisine == null ? null : String(body.cuisine);
    if (body.logo_url !== undefined) params.logo_url = body.logo_url == null ? null : String(body.logo_url);
    if (body.cover_image_url !== undefined) params.cover_image_url = body.cover_image_url == null ? null : String(body.cover_image_url);
    if (body.delivery_time_min !== undefined) params.delivery_time_min = typeof body.delivery_time_min === "number" ? body.delivery_time_min : null;
    if (body.delivery_time_max !== undefined) params.delivery_time_max = typeof body.delivery_time_max === "number" ? body.delivery_time_max : null;
    if (body.tags !== undefined) params.tags = Array.isArray(body.tags) ? (body.tags as string[]) : null;
    if (body.tin !== undefined) params.tin = body.tin == null ? null : String(body.tin);
    if (body.tin_expiry_date !== undefined) params.tin_expiry_date = body.tin_expiry_date == null ? null : String(body.tin_expiry_date);
    if (body.certificate_url !== undefined) params.certificate_url = body.certificate_url == null ? null : String(body.certificate_url);
    if (body.additional_data !== undefined) params.additional_data = typeof body.additional_data === "object" && body.additional_data != null ? (body.additional_data as Record<string, unknown>) : null;
    if (body.contact_email !== undefined) params.contact_email = body.contact_email == null ? null : String(body.contact_email);
    if (body.phone !== undefined) params.phone = body.phone == null ? null : String(body.phone);
    if (body.tax_type !== undefined) params.tax_type = String(body.tax_type);
    if (typeof body.tax_rate === "number") params.tax_rate = body.tax_rate;
    if (body.free_delivery_enabled !== undefined) params.free_delivery_enabled = Boolean(body.free_delivery_enabled);
    if (typeof body.free_delivery_max_amount === "number") params.free_delivery_max_amount = body.free_delivery_max_amount;
    if (typeof body.free_delivery_min_distance_km === "number") params.free_delivery_min_distance_km = body.free_delivery_min_distance_km;
    if (body.description !== undefined) params.description = body.description == null ? null : String(body.description);
    const updated = await Restaurant.update(id, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant updated successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update restaurant",
      data: null,
    });
  }
}

export async function approveRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    if (row.is_blocked) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot approve a blocked restaurant. Unblock it first.",
        data: null,
      });
      return;
    }
    const updated = await Restaurant.update(id, { is_active: true, is_blocked: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant approved successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to approve restaurant",
      data: null,
    });
  }
}

export async function blockRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    const updated = await Restaurant.update(id, { is_blocked: true, is_active: false, is_open: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant blocked successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to block restaurant",
      data: null,
    });
  }
}

export async function unblockRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await Restaurant.findById(id);
    if (!row) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    const updated = await Restaurant.update(id, { is_blocked: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant unblocked successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to unblock restaurant",
      data: null,
    });
  }
}

export async function openRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id);
    if (!row) return;
    if (row.is_blocked) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot open a blocked restaurant",
        data: null,
      });
      return;
    }
    if (!row.is_active) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot open an inactive restaurant. Please wait for admin approval.",
        data: null,
      });
      return;
    }
    const updated = await Restaurant.update(id, { is_open: true });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant opened successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to open restaurant",
      data: null,
    });
  }
}

export async function closeRestaurant(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const row = await ensureOwnership(req, res, id);
    if (!row) return;
    const updated = await Restaurant.update(id, { is_open: false });
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Restaurant not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurant(id));
    await cache.delPattern("restaurants:list:*");
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Restaurant closed successfully",
      data: { restaurant: Restaurant.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to close restaurant",
      data: null,
    });
  }
}
