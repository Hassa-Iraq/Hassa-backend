import express from "express";
import { authenticate, authorize } from "../middlewares/auth";
import { optionalProfileUpload } from "../middlewares/upload";
import * as authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/login/phone", authController.loginPhone);

router.get("/me", authenticate, authController.me);
router.post("/logout", authenticate, authController.logout);
router.put("/change-password", authenticate, authController.changePassword);

router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/forgot-password-phone", authController.forgotPasswordPhone);
router.post("/reset-password-phone", authController.resetPasswordPhone);

router.post("/signup/phone/request-otp", authController.signupPhoneRequestOtp);
router.post("/signup/phone/verify-otp", authController.signupPhoneVerifyOtp);
router.post("/signup/email/request-otp", authController.signupEmailRequestOtp);
router.post("/signup/email/verify-otp", authController.signupEmailVerifyOtp);

router.post("/forgot-password-otp", authController.forgotPasswordOtp);
router.post("/reset-password-otp", authController.resetPasswordOtp);

router.put("/profile", authenticate, optionalProfileUpload, authController.updateProfile);
router.post("/admin/create-admin", authenticate, authorize("admin"), authController.createAdmin);

export default router;
