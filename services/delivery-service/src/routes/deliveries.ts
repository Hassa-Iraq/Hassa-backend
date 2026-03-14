import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as deliveryController from "../controllers/deliveryController";

const router = express.Router();

router.post("/assignments", authenticate, authorize("admin"), deliveryController.assignDriver);
router.patch(
  "/drivers/:driverId/availability",
  authenticate,
  authorize("admin", "driver"),
  deliveryController.setDriverAvailability
);
router.get("/drivers/availability", authenticate, authorize("admin"), deliveryController.listDriverAvailability);
router.get("/", authenticate, authorize("admin", "driver", "restaurant", "customer"), deliveryController.listDeliveries);
router.get("/:id", authenticate, authorize("admin", "driver", "restaurant", "customer"), deliveryController.getDeliveryById);
router.patch("/:id/status", authenticate, authorize("admin", "driver"), deliveryController.updateDeliveryStatus);

export default router;
