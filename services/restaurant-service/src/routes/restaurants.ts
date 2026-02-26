import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as restaurantController from "../controllers/restaurantController";
import { upload } from "../utils/fileUpload";

const router = express.Router();

router.post("/admin/create", authenticate, authorize("admin"), restaurantController.createRestaurantByAdmin);
router.post("/admin/onboard", authenticate, authorize("admin"), restaurantController.onboardRestaurantByAdmin);
router.post("/admin/branches", authenticate, authorize("admin"), restaurantController.createBranchByAdmin);
router.get("/admin/restaurants/stats", authenticate, authorize("admin"), restaurantController.getRestaurantDashboardStats);
router.get("/admin/restaurants/:id/branches", authenticate, authorize("admin"), restaurantController.listBranchesForAdmin);
router.post(
  "/uploads/restaurant-assets",
  authenticate,
  authorize("admin", "restaurant"),
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "cover_image", maxCount: 1 },
    { name: "certificate", maxCount: 1 },
  ]),
  restaurantController.uploadRestaurantAssets
);
router.post(
  "/uploads/banner-image",
  authenticate,
  authorize("admin", "restaurant"),
  upload.single("banner_image"),
  restaurantController.uploadBannerImage
);
router.post("/branches", authenticate, authorize("restaurant"), restaurantController.createBranch);
router.get("/", authenticate, authorize("admin", "restaurant"), restaurantController.listMyRestaurants);
router.get("/:id", authenticate, authorize("admin", "restaurant"), restaurantController.getRestaurant);
router.put("/:id", authenticate, authorize("admin", "restaurant"), restaurantController.updateRestaurant);
router.patch("/:id/approve", authenticate, authorize("admin"), restaurantController.approveRestaurant);
router.patch("/:id/block", authenticate, authorize("admin"), restaurantController.blockRestaurant);
router.patch("/:id/unblock", authenticate, authorize("admin"), restaurantController.unblockRestaurant);
router.patch("/:id/open", authenticate, authorize("restaurant"), restaurantController.openRestaurant);
router.patch("/:id/close", authenticate, authorize("restaurant"), restaurantController.closeRestaurant);

export default router;
