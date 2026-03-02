import { Response } from "express";
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

export async function createCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const restaurant_id = req.body.restaurant_id as string;
    const name = req.body.name as string;
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
        message: "Category name is required",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, restaurant_id);
    if (!ok) return;
    const parent_id = req.body.parent_id == null ? null : String(req.body.parent_id);
    if (parent_id) {
      const parent = await MenuCategory.findById(parent_id);
      if (!parent || parent.restaurant_id !== restaurant_id) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: "parent_id is invalid or does not belong to this restaurant",
          data: null,
        });
        return;
      }
      if (parent.parent_id !== null) {
        res.status(400).json({
          success: false,
          status: "ERROR",
          message: "Subcategory nesting beyond one level is not allowed",
          data: null,
        });
        return;
      }
    }
    const category = await MenuCategory.create({
      restaurant_id,
      parent_id,
      name: name.trim(),
      description: (req.body.description as string) ?? null,
      image_url: (req.body.image_url as string) ?? null,
      display_order: typeof req.body.display_order === "number" ? req.body.display_order : undefined,
    });
    await cache.del(cacheKeys.restaurantMenu(restaurant_id));
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Menu category created successfully",
      data: { category },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to create category",
      data: null,
    });
  }
}

export async function listCategories(req: AuthRequest, res: Response): Promise<void> {
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
    const categories = await MenuCategory.findByRestaurantId(restaurant_id, { limit, offset });
    const total = await MenuCategory.countByRestaurantId(restaurant_id);
    const byParent = new Map<string, MenuCategory.MenuCategoryRow[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const list = byParent.get(c.parent_id) ?? [];
      list.push(c);
      byParent.set(c.parent_id, list);
    }
    const hierarchy = categories
      .filter((c) => c.parent_id == null)
      .map((c) => ({
        ...c,
        subcategories: byParent.get(c.id) ?? [],
      }));
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Categories listed",
      data: {
        categories: hierarchy,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to list categories",
      data: null,
    });
  }
}

export async function getCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const category = await MenuCategory.findById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu category not found",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, category.restaurant_id);
    if (!ok) return;
    const subcategories = await MenuCategory.findSubcategories(category.id);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Category retrieved",
      data: { category: { ...category, subcategories } },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to get category",
      data: null,
    });
  }
}

export async function updateCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const category = await MenuCategory.findById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu category not found",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, category.restaurant_id);
    if (!ok) return;
    const body = req.body as Record<string, unknown>;
    const params: MenuCategory.UpdateMenuCategoryParams = {};
    if (body.name !== undefined) params.name = String(body.name);
    if (body.description !== undefined) params.description = body.description == null ? null : String(body.description);
    if (body.image_url !== undefined) params.image_url = body.image_url == null ? null : String(body.image_url);
    if (typeof body.display_order === "number") params.display_order = body.display_order;
    if (body.is_active !== undefined) params.is_active = Boolean(body.is_active);
    if (body.parent_id !== undefined) {
      params.parent_id = body.parent_id == null ? null : String(body.parent_id);
      if (params.parent_id) {
        if (params.parent_id === id) {
          res.status(400).json({
            success: false,
            status: "ERROR",
            message: "A category cannot be its own parent",
            data: null,
          });
          return;
        }
        const parent = await MenuCategory.findById(params.parent_id);
        if (!parent || parent.restaurant_id !== category.restaurant_id) {
          res.status(400).json({
            success: false,
            status: "ERROR",
            message: "parent_id is invalid or does not belong to this restaurant",
            data: null,
          });
          return;
        }
        if (parent.parent_id !== null) {
          res.status(400).json({
            success: false,
            status: "ERROR",
            message: "Subcategory nesting beyond one level is not allowed",
            data: null,
          });
          return;
        }
      }
    }
    const updated = await MenuCategory.update(id, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Menu category not found", data: null });
      return;
    }
    await cache.del(cacheKeys.restaurantMenu(category.restaurant_id));
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu category updated successfully",
      data: { category: updated },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to update category",
      data: null,
    });
  }
}

export async function uploadCategoryImage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "category_image file is required",
        data: null,
      });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Category image uploaded successfully",
      data: {
        image_url: getFileUrl(file.filename, file.fieldname),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to upload category image",
      data: null,
    });
  }
}

export async function deleteCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const category = await MenuCategory.findById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        status: "ERROR",
        message: "Menu category not found",
        data: null,
      });
      return;
    }
    const ok = await ensureRestaurantOwnership(req, res, category.restaurant_id);
    if (!ok) return;
    const childCount = await MenuCategory.countSubcategories(id);
    if (childCount > 0) {
      res.status(400).json({
        success: false,
        status: "ERROR",
        message: "Cannot delete category with subcategories. Move or delete subcategories first.",
        data: null,
      });
      return;
    }
    await MenuCategory.deleteById(id);
    await cache.del(cacheKeys.restaurantMenu(category.restaurant_id));
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Menu category deleted successfully",
      data: null,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status: "ERROR",
      message: err instanceof Error ? err.message : "Failed to delete category",
      data: null,
    });
  }
}
