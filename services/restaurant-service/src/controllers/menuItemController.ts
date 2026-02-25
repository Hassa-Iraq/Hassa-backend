import { Response } from "express";
import * as MenuItem from "../models/MenuItem";
import * as MenuCategory from "../models/MenuCategory";
import * as Restaurant from "../models/Restaurant";
import { AuthRequest } from "../middleware/auth";
import { cache, cacheKeys } from "../utils/redis";

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

export async function createMenuItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const restaurant_id = req.body.restaurant_id as string;
    const name = req.body.name as string;
    const price = req.body.price as number;
    if (!restaurant_id || typeof restaurant_id !== "string") {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant_id is required",
        data: null,
      });
      return;
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Item name is required",
        data: null,
      });
      return;
    }
    if (typeof price !== "number" || price < 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "price must be a non-negative number",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, restaurant_id);
    if (!ok) return;
    const category_id = (req.body.category_id as string) ?? null;
    if (category_id) {
      const cat = await MenuCategory.findById(category_id);
      if (!cat || cat.restaurant_id !== restaurant_id) {
        res.status(404).json({
          success: false,
          status: "ERROR",
          message: "Menu category not found or does not belong to this restaurant",
          data: null,
        });
        return;
      }
    }
    const item = await MenuItem.create({
      restaurant_id,
      category_id: category_id || null,
      name: name.trim(),
      description: (req.body.description as string) ?? null,
      price,
      image_url: (req.body.image_url as string) ?? null,
      is_available: req.body.is_available !== undefined ? Boolean(req.body.is_available) : true,
      display_order: typeof req.body.display_order === "number" ? req.body.display_order : 0,
    });
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Menu item created successfully",
      data: { menuItem: MenuItem.toResponse(item) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create menu item",
      data: null,
    });
  }
}

export async function listMenuItems(req: AuthRequest, res: Response): Promise<void> {
  try {
    const restaurant_id = req.query.restaurant_id as string;
    if (!restaurant_id) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "restaurant_id is required",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, restaurant_id);
    if (!ok) return;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;
    const category_id = (req.query.category_id as string) || undefined;
    const items = await MenuItem.findByRestaurantId(restaurant_id, { category_id, limit, offset });
    const total = await MenuItem.countByRestaurantId(restaurant_id, category_id || null);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu items listed",
      data: {
        menuItems: items.map(MenuItem.toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list menu items",
      data: null,
    });
  }
}

export async function getMenuItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const item = await MenuItem.findById(id);
    if (!item) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu item not found",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, item.restaurant_id);
    if (!ok) return;
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu item retrieved",
      data: { menuItem: MenuItem.toResponse(item) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get menu item",
      data: null,
    });
  }
}

export async function updateMenuItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const item = await MenuItem.findById(id);
    if (!item) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu item not found",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, item.restaurant_id);
    if (!ok) return;
    const body = req.body as Record<string, unknown>;
    const params: MenuItem.UpdateMenuItemParams = {};
    if (body.category_id !== undefined) params.category_id = body.category_id == null ? null : String(body.category_id);
    if (body.name !== undefined) params.name = String(body.name);
    if (body.description !== undefined) params.description = body.description == null ? null : String(body.description);
    if (typeof body.price === "number") params.price = body.price;
    if (body.image_url !== undefined) params.image_url = body.image_url == null ? null : String(body.image_url);
    if (body.is_available !== undefined) params.is_available = Boolean(body.is_available);
    if (typeof body.display_order === "number") params.display_order = body.display_order;
    if (params.category_id) {
      const cat = await MenuCategory.findById(params.category_id);
      if (!cat || cat.restaurant_id !== item.restaurant_id) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Category not found or does not belong to this restaurant",
          data: null,
        });
        return;
      }
    }
    const updated = await MenuItem.update(id, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Menu item not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurantMenu(item.restaurant_id));
    await cache.del(cacheKeys.menuItem(id));
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu item updated successfully",
      data: { menuItem: MenuItem.toResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update menu item",
      data: null,
    });
  }
}

export async function deleteMenuItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const item = await MenuItem.findById(id);
    if (!item) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu item not found",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, item.restaurant_id);
    if (!ok) return;
    await MenuItem.deleteById(id);
    await cache.del(cacheKeys.restaurantMenu(item.restaurant_id));
    await cache.del(cacheKeys.menuItem(id));
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu item deleted successfully",
      data: null,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to delete menu item",
      data: null,
    });
  }
}
