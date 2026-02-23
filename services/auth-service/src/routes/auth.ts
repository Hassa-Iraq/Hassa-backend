import express from "express";
import { authenticate } from "../middlewares/auth";
import * as authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/login/phone", authController.loginPhone);

router.get("/me", authenticate, authController.me);

router.post("/signup/request-otp", authController.signupRequestOtp);
router.post("/signup/email/verify-otp", authController.signupEmailVerifyOtp);

export default router;