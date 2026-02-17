import multer from "multer";
import { Request } from "express";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { createLogger } from "shared/logger/index";
import config from "../config/index";

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

// Define upload directory for profile pictures
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads", "profile");

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
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = file.originalname.split(".").pop() || "jpg";
    const filename = `avatar-${uniqueSuffix}.${ext}`;
    cb(null, filename);
  },
});

// File filter - only allow images
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB for profile pictures
  },
});

export function getFileUrl(filename: string): string {
  const baseUrl = process.env.FILE_BASE_URL || "/uploads/profile";
  return `${baseUrl}/${filename}`;
}

export default {
  upload,
  getFileUrl,
  UPLOAD_DIR,
};
