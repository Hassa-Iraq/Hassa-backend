import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as analyticsController from "../controllers/analyticsController";

const router = express.Router();

router.get("/popular-restaurants", authenticate, authorize("admin"), analyticsController.popularRestaurants);
router.get("/statistics", authenticate, authorize("admin"), analyticsController.statistics);
router.get("/order-statistics", authenticate, authorize("admin"), analyticsController.orderStatistics);
router.get("/top-delivery-men", authenticate, authorize("admin"), analyticsController.topDeliveryMen);
router.get("/top-restaurants", authenticate, authorize("admin"), analyticsController.topRestaurants);
router.get("/top-rated-food", authenticate, authorize("admin"), analyticsController.topRatedFood);
router.get("/top-selling-food", authenticate, authorize("admin"), analyticsController.topSellingFood);

export default router;
