import multer from "multer";
import { Request } from "express";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export const BASE_UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
export const PROFILE_UPLOAD_DIR = join(BASE_UPLOAD_DIR, "profile");
export const DRIVERS_UPLOAD_DIR = join(BASE_UPLOAD_DIR, "drivers");

for (const dir of [PROFILE_UPLOAD_DIR, DRIVERS_UPLOAD_DIR]) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function subdirForField(fieldname: string): "profile" | "drivers" {
  if (
    fieldname === "delivery_man_picture" ||
    fieldname === "vehicle_image" ||
    fieldname === "driving_license_picture" ||
    fieldname === "profile_picture"
  ) {
    return fieldname === "profile_picture" ? "profile" : "drivers";
  }
  return "profile";
}

function filenamePrefixForField(fieldname: string): string {
  if (fieldname === "delivery_man_picture") return "driver";
  if (fieldname === "vehicle_image") return "vehicle";
  if (fieldname === "driving_license_picture") return "license";
  return "avatar";
}

const storage = multer.diskStorage({
  destination: (_req: Request, file: Express.Multer.File, cb) => {
    const subdir = subdirForField(file.fieldname);
    cb(null, subdir === "drivers" ? DRIVERS_UPLOAD_DIR : PROFILE_UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = file.originalname.split(".").pop() || "jpg";
    const filename = `${filenamePrefixForField(file.fieldname)}-${uniqueSuffix}.${ext}`;
    cb(null, filename);
  },
});

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
    fileSize: 10 * 1024 * 1024,
  },
});

export function getFileUrl(filename: string, fieldname?: string): string {
  const baseUrl = process.env.FILE_BASE_URL || "/uploads";
  const subdir = fieldname ? subdirForField(fieldname) : "profile";
  return `${baseUrl}/${subdir}/${filename}`;
}

export default {
  upload,
  getFileUrl,
  PROFILE_UPLOAD_DIR,
  DRIVERS_UPLOAD_DIR,
  BASE_UPLOAD_DIR,
};
