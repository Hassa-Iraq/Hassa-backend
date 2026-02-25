import express from "express";
import { authenticate, authorize } from "../middlewares/auth";
import * as authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/login/phone", authController.loginPhone);

router.get("/me", authenticate, authController.me);
router.patch("/profile", authenticate, authController.updateProfile);

router.post("/admin", authenticate, authorize("admin"), authController.addAdmin);
router.post(
  "/admin/restaurant-owner",
  authenticate,
  authorize("admin"),
  authController.addRestaurantOwner
);
router.delete(
  "/admin/restaurant-owner/:id",
  authenticate,
  authorize("admin"),
  authController.deleteRestaurantOwner
);

router.post("/signup/request-otp", authController.signupRequestOtp);
router.post("/signup/email/verify-otp", authController.signupEmailVerifyOtp);

router.post("/forgot-password", authController.forgotPassword);
router.post("/forgot-password/verify-otp", authController.verifyForgotPasswordOtp);
router.post("/reset-password", authController.resetPassword);

export default router;