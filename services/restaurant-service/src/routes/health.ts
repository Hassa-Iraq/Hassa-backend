import express from "express";
import * as healthController from "../controllers/healthController";

const router = express.Router();
router.get("/health", healthController.health);
export default router;