import multer from "multer";
import { Request } from "express";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const BASE_UPLOAD = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
const SUBDIRS = ["banners", "restaurants", "menu-items", "menu-categories", "cuisine-categories"] as const;

for (const sub of SUBDIRS) {
  const dir = join(BASE_UPLOAD, sub);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export const UPLOAD_DIR = join(BASE_UPLOAD, "banners");

function subdirForField(fieldname: string): string {
  if (fieldname === "banner_image") return "banners";
  if (
    fieldname === "logo" ||
    fieldname === "cover_image" ||
    fieldname === "certificate" ||
    fieldname === "additional_certificate"
  ) return "restaurants";
  if (fieldname === "item_image") return "menu-items";
  if (fieldname === "category_image") return "menu-categories";
  if (fieldname === "cuisine_category_image") return "cuisine-categories";
  return "banners";
}

function prefixForField(fieldname: string): string {
  if (fieldname === "banner_image") return "banner";
  if (fieldname === "logo") return "logo";
  if (fieldname === "cover_image") return "cover";
  if (fieldname === "certificate") return "cert";
  if (fieldname === "additional_certificate") return "additional-cert";
  if (fieldname === "item_image") return "item";
  if (fieldname === "category_image") return "category";
  if (fieldname === "cuisine_category_image") return "cuisine-category";
  return "file";
}

const storage = multer.diskStorage({
  destination: (_req: Request, file: Express.Multer.File, cb) => {
    const sub = subdirForField(file.fieldname);
    cb(null, join(BASE_UPLOAD, sub));
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const ext = (file.originalname.split(".").pop() || "jpg").replace(/\s/g, "");
    const name = `${prefixForField(file.fieldname)}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    cb(null, name);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only image or PDF files are allowed"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function getFileUrl(filename: string, fieldname?: string): string {
  const sub = fieldname ? subdirForField(fieldname) : "banners";
  const baseUrl = process.env.FILE_BASE_URL || "/uploads";
  return `${baseUrl}/${sub}/${filename}`;
}

export async function deleteFile(filename: string, subdir: string = "banners"): Promise<void> {
  const { unlink } = await import("fs/promises");
  const filePath = join(BASE_UPLOAD, subdir, filename);
  try {
    await unlink(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export const BASE_UPLOAD_DIR = BASE_UPLOAD;
export default { upload, getFileUrl, deleteFile, UPLOAD_DIR, BASE_UPLOAD_DIR };