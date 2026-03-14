import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as orderController from "../controllers/orderController";

const router = express.Router();

router.post("/", authenticate, authorize("customer", "admin"), orderController.createOrder);
router.get("/", authenticate, authorize("admin", "restaurant", "customer"), orderController.listOrders);
router.get("/customers", authenticate, authorize("admin", "restaurant"), orderController.listCustomers);
router.get("/:id", authenticate, authorize("admin", "restaurant", "customer"), orderController.getOrderById);
router.patch("/:id/status", authenticate, authorize("admin", "restaurant"), orderController.updateOrderStatus);

export default router;
