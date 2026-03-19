import express from "express";
import { asyncHandler } from "shared/error-handler/index";
import { query, validateRequest } from "shared/validation/index";
import { authenticate, authorize } from "../middleware/auth";
import * as analyticsController from "../controllers/analyticsController";

const router = express.Router();

const FILTER_VALUES = ["overall", "today", "this_month", "this_year"];

const filterValidator = query("filter")
  .optional()
  .isIn(FILTER_VALUES)
  .withMessage("filter must be one of: overall, today, this_month, this_year");

const limitValidator = query("limit")
  .optional()
  .isInt({ min: 1, max: 50 })
  .withMessage("limit must be an integer between 1 and 50");

const authChain = [authenticate, authorize("admin")] as const;

router.get(
  "/popular-restaurants",
  ...authChain,
  [filterValidator, limitValidator],
  validateRequest,
  asyncHandler(analyticsController.popularRestaurants)
);

router.get(
  "/statistics",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.statistics)
);

router.get(
  "/customers-registered",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.customersRegistered)
);

router.get(
  "/restaurants-registered",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.restaurantsRegistered)
);

router.get(
  "/delivery-men-registered",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.deliveryMenRegistered)
);

router.get(
  "/order-statistics",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.orderStatistics)
);

router.get(
  "/order-statistics/delivered",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.delivered)
);

router.get(
  "/order-statistics/cancelled",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.cancelled)
);

router.get(
  "/order-statistics/refunded",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.refunded)
);

router.get(
  "/order-statistics/payment-failed",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.paymentFailed)
);

router.get(
  "/order-statistics/unassigned",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.unassigned)
);

router.get(
  "/order-statistics/accepted-by-rider",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.acceptedByRider)
);

router.get(
  "/order-statistics/cooking-in-restaurants",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.cookingInRestaurants)
);

router.get(
  "/order-statistics/picked-up-by-rider",
  ...authChain,
  [filterValidator],
  validateRequest,
  asyncHandler(analyticsController.pickedUpByRider)
);

router.get(
  "/top-delivery-men",
  ...authChain,
  [filterValidator, limitValidator],
  validateRequest,
  asyncHandler(analyticsController.topDeliveryMen)
);

router.get(
  "/top-restaurants",
  ...authChain,
  [filterValidator, limitValidator],
  validateRequest,
  asyncHandler(analyticsController.topRestaurants)
);

router.get(
  "/top-rated-food",
  ...authChain,
  [filterValidator, limitValidator],
  validateRequest,
  asyncHandler(analyticsController.topRatedFood)
);

router.get(
  "/top-selling-food",
  ...authChain,
  [filterValidator, limitValidator],
  validateRequest,
  asyncHandler(analyticsController.topSellingFood)
);

export default router;
