import express from "express";
import * as notificationController from "../controllers/notificationController";

const router = express.Router();

router.post("/send-email", notificationController.sendEmail);
router.post("/send-sms", notificationController.sendSms);

export default router;
