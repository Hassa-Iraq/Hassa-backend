import express from "express";
import { asyncHandler } from "shared/error-handler/index";
import { authenticate, authorize } from "../middleware/auth";
import * as analyticsController from "../controllers/analyticsController";

const router = express.Router();

router.get(
  "/popular-restaurants",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.popularRestaurants)
);

router.get(
  "/statistics",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.statistics)
);

router.get(
  "/customers-registered",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.customersRegistered)
);

router.get(
  "/restaurants-registered",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.restaurantsRegistered)
);

router.get(
  "/delivery-men-registered",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.deliveryMenRegistered)
);

router.get(
  "/order-statistics",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.orderStatistics)
);

router.get(
  "/order-statistics/delivered",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.delivered)
);

router.get(
  "/order-statistics/cancelled",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.cancelled)
);

router.get(
  "/order-statistics/refunded",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.refunded)
);

router.get(
  "/order-statistics/payment-failed",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.paymentFailed)
);

router.get(
  "/order-statistics/unassigned",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.unassigned)
);

router.get(
  "/order-statistics/accepted-by-rider",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.acceptedByRider)
);

router.get(
  "/order-statistics/cooking-in-restaurants",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.cookingInRestaurants)
);

router.get(
  "/order-statistics/picked-up-by-rider",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.pickedUpByRider)
);

router.get(
  "/top-delivery-men",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.topDeliveryMen)
);

router.get(
  "/top-restaurants",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.topRestaurants)
);

router.get(
  "/top-rated-food",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.topRatedFood)
);

router.get(
  "/top-selling-food",
  authenticate,
  authorize("admin"),
  asyncHandler(analyticsController.topSellingFood)
);

export default router;
