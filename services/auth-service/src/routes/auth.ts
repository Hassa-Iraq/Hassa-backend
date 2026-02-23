import express from "express";
import { authenticate, authorize } from "../middlewares/auth";
import * as authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/login/phone", authController.loginPhone);

router.get("/me", authenticate, authController.me);

router.post("/admin", authenticate, authorize("admin"), authController.addAdmin);

router.post("/signup/request-otp", authController.signupRequestOtp);
router.post("/signup/email/verify-otp", authController.signupEmailVerifyOtp);

export default router;