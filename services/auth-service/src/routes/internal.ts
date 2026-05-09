import express from "express";
import * as User from "../models/User";
import * as DriverProfile from "../models/DriverProfile";
import config from "../config/index";

const router = express.Router();

router.use((req, res, next) => {
  const token = req.headers["x-internal-token"];
  if (!config.INTERNAL_SERVICE_TOKEN || token !== config.INTERNAL_SERVICE_TOKEN) {
    res.status(403).json({ success: false, status: "ERROR", message: "Forbidden", data: null });
    return;
  }
  next();
});

router.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ success: false, status: "ERROR", message: "User not found", data: null });
      return;
    }
    res.status(200).json({
      success: true, status: "OK", message: "User retrieved",
      data: { user: User.toUserResponse(user) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
});

router.get("/drivers/:id", async (req, res) => {
  try {
    const profile = await DriverProfile.findDriverById(req.params.id);
    if (!profile) {
      res.status(404).json({ success: false, status: "ERROR", message: "Driver not found", data: null });
      return;
    }
    res.status(200).json({
      success: true, status: "OK", message: "Driver retrieved",
      data: { driver: profile },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed", data: null });
  }
});

export default router;
