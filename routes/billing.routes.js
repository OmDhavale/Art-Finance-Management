import express from "express";
import { verifyPurchase, restorePurchase, getBillingStatus, handleGoogleRtdn } from "../controllers/billing.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();
router.post("/google-rtdn", handleGoogleRtdn);
router.get("/status", verifyToken, getBillingStatus);
router.post("/verify-purchase", verifyToken, verifyPurchase);
router.post("/restore-purchase", verifyToken, restorePurchase);
export default router;
