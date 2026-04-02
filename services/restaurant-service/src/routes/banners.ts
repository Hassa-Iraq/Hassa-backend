import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../utils/fileUpload";
import * as bannerController from "../controllers/bannerController";

const router = express.Router();

router.post(
  "/banners/upload-image",
  authenticate,
  authorize("admin", "restaurant"),
  upload.single("banner_image"),
  bannerController.uploadBannerImage
);
router.post(
  "/banners",
  authenticate,
  authorize("restaurant"),
  bannerController.createBanner
);
router.get("/banners", authenticate, authorize("restaurant"), bannerController.listBanners);
router.get("/banners/:id", authenticate, authorize("restaurant"), bannerController.getBanner);
router.delete("/banners/:id", authenticate, authorize("restaurant"), bannerController.deleteBanner);
router.patch(
  "/admin/banners/:id/status",
  authenticate,
  authorize("admin"),
  bannerController.adminUpdateBannerStatus
);
router.get("/admin/banners", authenticate, authorize("admin"), bannerController.listAdminBanners);
router.get("/admin/banners/:id", authenticate, authorize("admin"), bannerController.getAdminBanner);
router.get("/public/banners", bannerController.listPublicBanners);

export default router;
