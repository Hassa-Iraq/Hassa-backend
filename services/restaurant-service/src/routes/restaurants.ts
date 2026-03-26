import express from "express";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import * as restaurantController from "../controllers/restaurantController";
import { upload } from "../utils/fileUpload";

const router = express.Router();

router.post("/admin/create", authenticate, authorize("admin"), restaurantController.createRestaurantByAdmin);
router.post("/admin/onboard", authenticate, authorize("admin"), restaurantController.onboardRestaurantByAdmin);
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
    { name: "additional_certificate", maxCount: 1 },
  ]),
  restaurantController.uploadRestaurantAssets
);
router.post("/branches", authenticate, authorize("admin", "restaurant"), (req: AuthRequest, res) => {
  if (req.user?.role === "admin") {
    return restaurantController.createBranchByAdmin(req, res);
  }
  return restaurantController.createBranch(req, res);
});
router.get("/", authenticate, authorize("admin", "restaurant"), restaurantController.listMyRestaurants);
router.get("/:id", authenticate, authorize("admin", "restaurant"), restaurantController.getRestaurant);
router.put("/:id", authenticate, authorize("admin", "restaurant"), restaurantController.updateRestaurant);
router.patch("/:id/approve", authenticate, authorize("admin"), restaurantController.approveRestaurant);
router.patch("/:id/block", authenticate, authorize("admin", "restaurant"), restaurantController.blockRestaurant);
router.patch("/:id/unblock", authenticate, authorize("admin", "restaurant"), restaurantController.unblockRestaurant);
router.patch("/:id/open", authenticate, authorize("restaurant"), restaurantController.openRestaurant);
router.patch("/:id/close", authenticate, authorize("restaurant"), restaurantController.closeRestaurant);

export default router;
