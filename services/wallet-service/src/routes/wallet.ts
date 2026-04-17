import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as walletController from "../controllers/walletController";

const router = express.Router();

router.get("/", authenticate, walletController.getMyWallet);
router.get("/transactions", authenticate, walletController.getMyTransactions);
router.post("/topup", authenticate, authorize("customer", "admin"), walletController.topup);
router.post("/payout", authenticate, authorize("restaurant", "driver", "admin"), walletController.requestPayout);
router.get("/payouts", authenticate, authorize("restaurant", "driver", "admin"), walletController.listMyPayouts);

export default router;
