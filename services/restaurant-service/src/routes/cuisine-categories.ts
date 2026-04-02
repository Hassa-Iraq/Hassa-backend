import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../utils/fileUpload";
import * as cuisineCategoryController from "../controllers/cuisineCategoryController";

const router = express.Router();

router.get("/public/cuisine-categories", cuisineCategoryController.listPublic);
router.get("/admin/cuisine-categories", authenticate, authorize("admin"), cuisineCategoryController.listAdmin);
router.post("/admin/cuisine-categories", authenticate, authorize("admin"), cuisineCategoryController.create);
router.patch("/admin/cuisine-categories/:id", authenticate, authorize("admin"), cuisineCategoryController.update);
router.delete("/admin/cuisine-categories/:id", authenticate, authorize("admin"), cuisineCategoryController.remove);
router.post(
  "/admin/cuisine-categories/upload-image",
  authenticate,
  authorize("admin"),
  upload.single("cuisine_category_image"),
  cuisineCategoryController.uploadImage
);

export default router;