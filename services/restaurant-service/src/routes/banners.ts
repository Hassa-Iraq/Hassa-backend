import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import { upload } from "../utils/fileUpload";
import * as bannerController from "../controllers/bannerController";

const router = express.Router();

router.post(
  "/banners",
  authenticate,
  authorize("restaurant"),
  upload.single("banner_image"),
  bannerController.createBanner
);
router.get("/banners", authenticate, authorize("restaurant"), bannerController.listBanners);
router.get("/banners/:id", authenticate, authorize("restaurant"), bannerController.getBanner);
router.post("/banners/:id/accept", authenticate, authorize("restaurant"), bannerController.acceptBannerQuote);
router.post("/banners/:id/reject", authenticate, authorize("restaurant"), bannerController.rejectBannerQuote);
router.get("/public/banners", bannerController.listPublicBanners);

export default router;
