import express from "express";
import {
  verifyPurchase,
  restorePurchase,
  getBillingStatus,
  handleGoogleRtdn,
} from "../controllers/billing.controller.js";
import {
  getRazorpayConfig,
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
} from "../controllers/razorpay.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// General billing status
router.get("/status", verifyToken, getBillingStatus);

// Razorpay endpoints
router.get("/razorpay/config", verifyToken, getRazorpayConfig);
router.post("/razorpay/create-order", verifyToken, createRazorpayOrder);
router.post("/razorpay/verify-payment", verifyToken, verifyRazorpayPayment);
router.post("/razorpay/webhook", handleRazorpayWebhook);

// Google Play billing endpoints (retained for dual-store database compatibility)
router.post("/google-rtdn", handleGoogleRtdn);
router.post("/verify-purchase", verifyToken, verifyPurchase);
router.post("/restore-purchase", verifyToken, restorePurchase);

export default router;
