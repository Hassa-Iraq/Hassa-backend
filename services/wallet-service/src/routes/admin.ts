import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as adminController from "../controllers/adminController";
import * as cashCollectionController from "../controllers/cashCollectionController";
import * as driverPaymentController from "../controllers/driverPaymentController";

const router = express.Router();

router.get("/wallets", authenticate, authorize("admin"), adminController.listWallets);
router.get("/wallets/:userId", authenticate, authorize("admin"), adminController.getUserWallet);
router.post("/wallets/:userId/adjust", authenticate, authorize("admin"), adminController.adjustWallet);
router.post("/wallets/:userId/add-funds", authenticate, authorize("admin"), adminController.addFunds);
router.patch("/wallets/:userId/freeze", authenticate, authorize("admin"), adminController.freezeWallet);
router.get("/payouts", authenticate, authorize("admin"), adminController.listPayouts);
router.post("/payouts/:id/approve", authenticate, authorize("admin"), adminController.approvePayout);
router.post("/payouts/:id/reject", authenticate, authorize("admin"), adminController.rejectPayout);

// Driver Payments
router.post("/driver-payments", authenticate, authorize("admin"), driverPaymentController.createPayment);
router.post("/driver-payments/:id/pay", authenticate, authorize("admin"), driverPaymentController.markAsPaid);
router.get("/driver-payments", authenticate, authorize("admin"), driverPaymentController.listPayments);

// Cash Collection
router.get("/cash-collection/pending", authenticate, authorize("admin"), cashCollectionController.getPendingSummary);
router.get("/cash-collection/balance/:type/:entityId", authenticate, authorize("admin"), cashCollectionController.getBalance);
router.post("/cash-collection", authenticate, authorize("admin"), cashCollectionController.collectCash);
router.get("/cash-collection", authenticate, authorize("admin"), cashCollectionController.listCollections);

export default router;
