import express from "express";
import { authenticate, authorize } from "../middlewares/auth";
import * as authController from "../controllers/authController";
import { upload } from "../utils/fileUpload";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/login/phone", authController.loginPhone);

router.get("/me", authenticate, authController.me);
router.patch("/profile", authenticate, authController.updateProfile);
router.post(
  "/profile/upload-image",
  authenticate,
  upload.single("profile_picture"),
  authController.uploadProfileImage
);

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
router.post("/admin/employee-roles", authenticate, authorize("admin"), authController.createEmployeeRole);
router.get("/admin/employee-roles", authenticate, authorize("admin"), authController.listEmployeeRoles);
router.get("/admin/employee-roles/:id", authenticate, authorize("admin"), authController.getEmployeeRole);
router.patch("/admin/employee-roles/:id", authenticate, authorize("admin"), authController.updateEmployeeRole);
router.post("/admin/employees", authenticate, authorize("admin"), authController.addEmployee);
router.get("/admin/employees", authenticate, authorize("admin"), authController.listEmployees);
router.get("/admin/employees/:id", authenticate, authorize("admin"), authController.getEmployeeById);
router.patch("/admin/employees/:id", authenticate, authorize("admin"), authController.updateEmployeeByAdmin);
router.patch("/admin/employees/:id/role", authenticate, authorize("admin"), authController.assignEmployeeRole);
router.patch("/admin/employees/:id/status", authenticate, authorize("admin"), authController.updateEmployeeStatus);

router.post("/signup/request-otp", authController.signupRequestOtp);
router.post("/signup/email/verify-otp", authController.signupEmailVerifyOtp);

router.post("/forgot-password", authController.forgotPassword);
router.post("/forgot-password/verify-otp", authController.verifyForgotPasswordOtp);
router.post("/reset-password", authController.resetPassword);

export default router;