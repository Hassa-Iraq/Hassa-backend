import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as restaurantController from "../controllers/restaurantController";

const router = express.Router();

router.post("/admin/create", authenticate, authorize("admin"), restaurantController.createRestaurantByAdmin);
router.post("/admin/onboard", authenticate, authorize("admin"), restaurantController.onboardRestaurantByAdmin);
router.post("/admin/branches", authenticate, authorize("admin"), restaurantController.createBranchByAdmin);
router.post("/branches", authenticate, authorize("restaurant"), restaurantController.createBranch);
router.get("/", authenticate, authorize("restaurant"), restaurantController.listMyRestaurants);
router.get("/:id", authenticate, authorize("restaurant"), restaurantController.getRestaurant);
router.put("/:id", authenticate, authorize("restaurant"), restaurantController.updateRestaurant);
router.patch("/:id/approve", authenticate, authorize("admin"), restaurantController.approveRestaurant);
router.patch("/:id/block", authenticate, authorize("admin"), restaurantController.blockRestaurant);
router.patch("/:id/unblock", authenticate, authorize("admin"), restaurantController.unblockRestaurant);
router.patch("/:id/open", authenticate, authorize("restaurant"), restaurantController.openRestaurant);
router.patch("/:id/close", authenticate, authorize("restaurant"), restaurantController.closeRestaurant);

export default router;
