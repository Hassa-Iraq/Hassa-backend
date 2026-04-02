import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { getFileUrl } from "../utils/fileUpload";
import { cache } from "../utils/redis";
import * as CuisineCategory from "../models/CuisineCategory";

const CACHE_KEY = "cuisine_categories:public";

export async function listPublic(_req: Request, res: Response): Promise<void> {
  try {
    const cached = await cache.get<unknown>(CACHE_KEY);
    if (cached) {
      res.status(200).json({ success: true, status: "OK", message: "Cuisine categories listed", data: cached });
      return;
    }

    const rows = await CuisineCategory.listPublic();
    const data = { cuisine_categories: rows };
    await cache.set(CACHE_KEY, data, 300);
    res.status(200).json({ success: true, status: "OK", message: "Cuisine categories listed", data });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to list cuisine categories", data: null });
  }
}

export async function listAdmin(_req: Request, res: Response): Promise<void> {
  try {
    const req = _req as AuthRequest;
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      CuisineCategory.listForAdmin({ limit, offset }),
      CuisineCategory.countForAdmin(),
    ]);

    res.status(200).json({
      success: true,
      status: "OK",
      message: "Cuisine categories listed",
      data: {
        cuisine_categories: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to list cuisine categories", data: null });
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      res.status(400).json({ success: false, status: "ERROR", message: "name is required", data: null });
      return;
    }

    const category = await CuisineCategory.create({
      name,
      image_url: (req.body.image_url as string) ?? null,
      display_order: req.body.display_order !== undefined ? parseInt(String(req.body.display_order)) : 0,
      is_active: req.body.is_active !== undefined ? Boolean(req.body.is_active) : true,
    });

    await cache.del(CACHE_KEY);
    res.status(201).json({ success: true, status: "OK", message: "Cuisine category created", data: { cuisine_category: category } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create cuisine category";
    const status = msg.includes("unique") ? 409 : 500;
    res.status(status).json({ success: false, status: "ERROR", message: status === 409 ? "A category with this name already exists" : msg, data: null });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const params: Parameters<typeof CuisineCategory.update>[1] = {};

    if (req.body.name !== undefined) params.name = String(req.body.name);
    if (req.body.image_url !== undefined) params.image_url = req.body.image_url as string | null;
    if (req.body.display_order !== undefined) params.display_order = parseInt(String(req.body.display_order));
    if (req.body.is_active !== undefined) params.is_active = Boolean(req.body.is_active);

    const updated = await CuisineCategory.update(id, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Cuisine category not found", data: null });
      return;
    }

    await cache.del(CACHE_KEY);
    res.status(200).json({ success: true, status: "OK", message: "Cuisine category updated", data: { cuisine_category: updated } });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to update cuisine category", data: null });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const deleted = await CuisineCategory.deleteById(id);
    if (!deleted) {
      res.status(404).json({ success: false, status: "ERROR", message: "Cuisine category not found", data: null });
      return;
    }

    await cache.del(CACHE_KEY);
    res.status(200).json({ success: true, status: "OK", message: "Cuisine category deleted", data: null });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to delete cuisine category", data: null });
  }
}

export async function uploadImage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, status: "ERROR", message: "cuisine_category_image file is required", data: null });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Image uploaded successfully",
      data: { image_url: getFileUrl(file.filename, file.fieldname) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to upload image", data: null });
  }
}