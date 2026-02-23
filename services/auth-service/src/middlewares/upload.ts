import { Request, Response, NextFunction } from "express";
import { upload } from "../utils/fileUpload";

/**
 * Optional profile picture upload. If request is multipart/form-data, run multer; otherwise skip.
 */
export function optionalProfileUpload(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    upload.single("profile_picture")(req, res, next);
  } else {
    next();
  }
}

export default optionalProfileUpload;
