import { Response } from "express";
import * as MenuItem from "../models/MenuItem";
import * as MenuCategory from "../models/MenuCategory";
import * as Restaurant from "../models/Restaurant";
import { AuthRequest } from "../middleware/auth";
import { cache, cacheKeys } from "../utils/redis";
import { getFileUrl } from "../utils/fileUpload";

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

async function resolveCategoryAndSubcategory(
  restaurantId: string,
  categoryIdInput: unknown,
  subcategoryIdInput: unknown
): Promise<{ category_id: string | null; subcategory_id: string | null; error?: string }> {
  const category_id = categoryIdInput == null ? null : String(categoryIdInput);
  const subcategory_id = subcategoryIdInput == null ? null : String(subcategoryIdInput);

  if (!category_id && !subcategory_id) {
    return { category_id: null, subcategory_id: null };
  }

  let category: MenuCategory.MenuCategoryRow | null = null;
  if (category_id) {
    category = await MenuCategory.findById(category_id);
    if (!category || category.restaurant_id !== restaurantId) {
      return {
        category_id: null,
        subcategory_id: null,
        error: "Menu category not found or does not belong to this restaurant",
      };
    }
    if (category.parent_id !== null) {
      return {
        category_id: null,
        subcategory_id: null,
        error: "category_id must be a parent category, not a subcategory",
      };
    }
  }

  if (subcategory_id) {
    const subcategory = await MenuCategory.findById(subcategory_id);
    if (!subcategory || subcategory.restaurant_id !== restaurantId) {
      return {
        category_id: null,
        subcategory_id: null,
        error: "Subcategory not found or does not belong to this restaurant",
      };
    }
    if (subcategory.parent_id == null) {
      return {
        category_id: null,
        subcategory_id: null,
        error: "subcategory_id must reference a child category",
      };
    }
    if (category_id && subcategory.parent_id !== category_id) {
      return {
        category_id: null,
        subcategory_id: null,
        error: "subcategory_id does not belong to category_id",
      };
    }
    return {
      category_id: subcategory.parent_id,
      subcategory_id: subcategory.id,
    };
  }

  return {
    category_id: category?.id ?? null,
    subcategory_id: null,
  };
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
    const resolved = await resolveCategoryAndSubcategory(
      restaurant_id,
      req.body.category_id,
      req.body.subcategory_id
    );
    if (resolved.error) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: resolved.error,
        data: null,
      });
      return;
    }
    const item = await MenuItem.create({
      restaurant_id,
      category_id: resolved.category_id,
      subcategory_id: resolved.subcategory_id,
      name: name.trim(),
      description: (req.body.description as string) ?? null,
      price,
      image_url: (req.body.image_url as string) ?? null,
      nutrition:
        typeof req.body.nutrition === "object" && req.body.nutrition != null
          ? (req.body.nutrition as Record<string, unknown>)
          : null,
      search_tags: Array.isArray(req.body.search_tags)
        ? (req.body.search_tags as unknown[]).map((v) => String(v))
        : null,
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
    const subcategory_id = (req.query.subcategory_id as string) || undefined;
    const items = await MenuItem.findByRestaurantId(restaurant_id, { category_id, subcategory_id, limit, offset });
    const total = await MenuItem.countByRestaurantId(restaurant_id, category_id || null, subcategory_id || null);
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
    if (body.name !== undefined) params.name = String(body.name);
    if (body.description !== undefined) params.description = body.description == null ? null : String(body.description);
    if (typeof body.price === "number") params.price = body.price;
    if (body.image_url !== undefined) params.image_url = body.image_url == null ? null : String(body.image_url);
    if (body.nutrition !== undefined) {
      params.nutrition =
        body.nutrition == null
          ? null
          : (typeof body.nutrition === "object" ? (body.nutrition as Record<string, unknown>) : null);
    }
    if (body.search_tags !== undefined) {
      params.search_tags = Array.isArray(body.search_tags)
        ? (body.search_tags as unknown[]).map((v) => String(v))
        : null;
    }
    if (body.is_available !== undefined) params.is_available = Boolean(body.is_available);
    if (typeof body.display_order === "number") params.display_order = body.display_order;
    if (body.category_id !== undefined || body.subcategory_id !== undefined) {
      const resolved = await resolveCategoryAndSubcategory(
        item.restaurant_id,
        body.category_id !== undefined ? body.category_id : item.category_id,
        body.subcategory_id !== undefined ? body.subcategory_id : item.subcategory_id
      );
      if (resolved.error) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: resolved.error,
          data: null,
        });
        return;
      }
      params.category_id = resolved.category_id;
      params.subcategory_id = resolved.subcategory_id;
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

export async function uploadMenuItemImage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "item_image file is required",
        data: null,
      });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu item image uploaded successfully",
      data: {
        image_url: getFileUrl(file.filename, file.fieldname),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to upload menu item image",
      data: null,
    });
  }
}
