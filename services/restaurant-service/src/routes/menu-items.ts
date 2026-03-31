import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as menuItemController from "../controllers/menuItemController";
import * as menuItemOptionController from "../controllers/menuItemOptionController";
import { upload } from "../utils/fileUpload";

const router = express.Router();

router.post("/", authenticate, authorize("restaurant"), menuItemController.createMenuItem);
router.post(
  "/uploads/image",
  authenticate,
  authorize("admin", "restaurant"),
  upload.single("item_image"),
  menuItemController.uploadMenuItemImage
);
router.get("/", authenticate, authorize("restaurant"), menuItemController.listMenuItems);
router.get("/:id", authenticate, authorize("restaurant"), menuItemController.getMenuItem);
router.put("/:id", authenticate, authorize("restaurant"), menuItemController.updateMenuItem);
router.delete("/:id", authenticate, authorize("restaurant"), menuItemController.deleteMenuItem);

router.get("/:itemId/option-groups", authenticate, authorize("admin", "restaurant"), menuItemOptionController.listGroups);
router.post("/:itemId/option-groups", authenticate, authorize("admin", "restaurant"), menuItemOptionController.createGroup);
router.patch("/:itemId/option-groups/:groupId", authenticate, authorize("admin", "restaurant"), menuItemOptionController.updateGroup);
router.delete("/:itemId/option-groups/:groupId", authenticate, authorize("admin", "restaurant"), menuItemOptionController.deleteGroup);
router.post("/:itemId/option-groups/:groupId/options", authenticate, authorize("admin", "restaurant"), menuItemOptionController.createOption);
router.patch("/:itemId/option-groups/:groupId/options/:optionId", authenticate, authorize("admin", "restaurant"), menuItemOptionController.updateOption);
router.delete("/:itemId/option-groups/:groupId/options/:optionId", authenticate, authorize("admin", "restaurant"), menuItemOptionController.deleteOption);

export default router;