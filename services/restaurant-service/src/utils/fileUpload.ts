import multer from "multer";
import { Request } from "express";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { createLogger } from "shared/logger/index";
import config from "../config/index";

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

// Define upload directory
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads", "banners");

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  logger.info({ uploadDir: UPLOAD_DIR }, "Created upload directory");
}

// Configure storage
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename: timestamp-random-uuid-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = file.originalname.split(".").pop();
    const filename = `banner-${uniqueSuffix}.${ext}`;
    cb(null, filename);
  },
});

// File filter - only allow images
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check if file is an image
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Helper function to get file URL
export function getFileUrl(filename: string): string {
  // In production, this should return a full URL (e.g., from CDN or cloud storage)
  // For now, return relative path that will be served by static file server
  const baseUrl = process.env.FILE_BASE_URL || "/uploads/banners";
  return `${baseUrl}/${filename}`;
}

// Helper function to delete file
export async function deleteFile(filename: string): Promise<void> {
  const { unlink } = await import("fs/promises");
  const filePath = join(UPLOAD_DIR, filename);
  try {
    await unlink(filePath);
    logger.info({ filename }, "File deleted successfully");
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      logger.error({ error: error.message, filename }, "Failed to delete file");
    }
  }
}

export default {
  upload,
  getFileUrl,
  deleteFile,
  UPLOAD_DIR,
};
