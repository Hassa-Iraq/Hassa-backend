import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as menuCategoryController from "../controllers/menuCategoryController";
import { upload } from "../utils/fileUpload";

const router = express.Router();

router.post("/", authenticate, authorize("restaurant"), menuCategoryController.createCategory);
router.post(
  "/uploads/image",
  authenticate,
  authorize("admin", "restaurant"),
  upload.single("category_image"),
  menuCategoryController.uploadCategoryImage
);
router.get("/", authenticate, authorize("admin", "restaurant"), menuCategoryController.listCategories);
router.get("/:id", authenticate, authorize("admin", "restaurant"), menuCategoryController.getCategory);
router.put("/:id", authenticate, authorize("restaurant"), menuCategoryController.updateCategory);
router.delete("/:id", authenticate, authorize("restaurant"), menuCategoryController.deleteCategory);

export default router;
