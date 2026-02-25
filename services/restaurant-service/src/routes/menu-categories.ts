import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as menuCategoryController from "../controllers/menuCategoryController";

const router = express.Router();

router.post("/", authenticate, authorize("restaurant"), menuCategoryController.createCategory);
router.get("/", authenticate, authorize("restaurant"), menuCategoryController.listCategories);
router.get("/:id", authenticate, authorize("restaurant"), menuCategoryController.getCategory);
router.put("/:id", authenticate, authorize("restaurant"), menuCategoryController.updateCategory);
router.delete("/:id", authenticate, authorize("restaurant"), menuCategoryController.deleteCategory);

export default router;
