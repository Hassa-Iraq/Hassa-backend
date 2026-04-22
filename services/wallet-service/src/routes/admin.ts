import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as adminController from "../controllers/adminController";

const router = express.Router();

router.get("/wallets", authenticate, authorize("admin"), adminController.listWallets);
router.get("/wallets/:userId", authenticate, authorize("admin"), adminController.getUserWallet);
router.post("/wallets/:userId/adjust", authenticate, authorize("admin"), adminController.adjustWallet);
router.post("/wallets/:userId/add-funds", authenticate, authorize("admin"), adminController.addFunds);
router.patch("/wallets/:userId/freeze", authenticate, authorize("admin"), adminController.freezeWallet);
router.get("/payouts", authenticate, authorize("admin"), adminController.listPayouts);
router.post("/payouts/:id/approve", authenticate, authorize("admin"), adminController.approvePayout);
router.post("/payouts/:id/reject", authenticate, authorize("admin"), adminController.rejectPayout);

export default router;
