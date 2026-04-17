import express from "express";
import { requireInternalToken } from "../middleware/auth";
import * as internalController from "../controllers/internalController";

const router = express.Router();

router.post("/ensure", requireInternalToken, internalController.ensureWallet);
router.post("/debit", requireInternalToken, internalController.debitWallet);
router.post("/credit", requireInternalToken, internalController.creditWallet);

export default router;
