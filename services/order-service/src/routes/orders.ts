import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as orderController from "../controllers/orderController";
import * as ratingController from "../controllers/ratingController";

const router = express.Router();

router.post("/", authenticate, authorize("customer", "admin"), orderController.createOrder);
router.get("/", authenticate, authorize("admin", "restaurant", "customer"), orderController.listOrders);
router.get("/analytics", authenticate, authorize("admin", "restaurant"), orderController.getRestaurantAnalytics);
router.get("/customers", authenticate, authorize("admin", "restaurant"), orderController.listCustomers);
router.get("/:id", authenticate, authorize("admin", "restaurant", "customer"), orderController.getOrderById);
router.patch("/:id/status", authenticate, authorize("admin", "restaurant"), orderController.updateOrderStatus);
router.post("/:id/rating", authenticate, authorize("customer"), ratingController.submitRating);
router.get("/:id/rating", authenticate, authorize("customer", "admin"), ratingController.getOrderRating);

export default router;
