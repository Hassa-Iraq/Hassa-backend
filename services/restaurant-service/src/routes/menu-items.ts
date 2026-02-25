import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as menuItemController from "../controllers/menuItemController";

const router = express.Router();

router.post("/", authenticate, authorize("restaurant"), menuItemController.createMenuItem);
router.get("/", authenticate, authorize("restaurant"), menuItemController.listMenuItems);
router.get("/:id", authenticate, authorize("restaurant"), menuItemController.getMenuItem);
router.put("/:id", authenticate, authorize("restaurant"), menuItemController.updateMenuItem);
router.delete("/:id", authenticate, authorize("restaurant"), menuItemController.deleteMenuItem);

export default router;
