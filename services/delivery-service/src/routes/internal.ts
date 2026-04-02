import express from "express";
import config from "../config/index";
import * as deliveryController from "../controllers/deliveryController";

const router = express.Router();

router.use((req, res, next) => {
  const token = req.headers["x-internal-token"];
  if (!config.INTERNAL_SERVICE_TOKEN || token !== config.INTERNAL_SERVICE_TOKEN) {
    res.status(403).json({ success: false, status: "ERROR", message: "Forbidden", data: null });
    return;
  }
  next();
});

router.post("/deliveries/assignments/auto", deliveryController.autoAssignForOrder);

export default router;