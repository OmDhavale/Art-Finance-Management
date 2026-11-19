import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../models/user.model.js";
import SubscriptionPurchase from "../models/subscriptionPurchase.model.js";

const DEFAULT_PLAN_PRICE_INR = 999;
const PRODUCT_ID = process.env.RAZORPAY_PLAN_PRODUCT_ID || "artist_finance_pro_yearly";

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error("Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured.");
  }

  return new Razorpay({ key_id, key_secret });
};

/**
 * GET /api/billing/razorpay/config
 * Returns public Razorpay configuration for frontend checkout
 */
export const getRazorpayConfig = async (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID || "";
    const amountInr = Number(process.env.PRO_PLAN_PRICE_INR) || DEFAULT_PLAN_PRICE_INR;
    const amountPaise = amountInr * 100;

    return res.status(200).json({
      success: true,
      data: {
        keyId,
        amount: amountPaise,
        amountInr,
        currency: "INR",
        name: "Artist Finance Management",
        description: "1 Year PRO Subscription",
        productId: PRODUCT_ID,
      },
    });
  } catch (error) {
    console.error("Error fetching Razorpay config:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve payment configuration." });
  }
};

/**
 * POST /api/billing/razorpay/create-order
 * Creates a standard Razorpay order for 1-year PRO subscription
 */
export const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const razorpay = getRazorpayInstance();
    const amountInr = Number(process.env.PRO_PLAN_PRICE_INR) || DEFAULT_PLAN_PRICE_INR;
    const amountPaise = amountInr * 100;

    const receipt = `rcpt_${String(userId).slice(-6)}_${Date.now()}`;
    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        userId: String(userId),
        userPhone: user.phone || "",
        userName: user.name || "",
        workshopName: user.workshopName || "",
        plan: "PRO",
        durationYears: 1,
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully.",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        customer: {
          name: user.name,
          contact: user.phone,
        },
      },
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to initiate payment with Razorpay.",
    });
  }
};

/**
 * POST /api/billing/razorpay/verify-payment
 * Cryptographically verifies HMAC-SHA256 signature, validates payment with Razorpay API,
 * and activates 1-year PRO plan.
 */
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
      });
    }

    // Step 1: Verify HMAC SHA256 signature
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: "Server payment configuration missing." });
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment signature verification failed. Untrusted transaction.",
      });
    }

    // Step 2: Prevent duplicate token claims across different accounts
    const existing = await SubscriptionPurchase.findOne({ purchaseToken: razorpay_payment_id }).select("userId");
    if (existing && String(existing.userId) !== String(userId)) {
      return res.status(409).json({
        success: false,
        message: "This Razorpay payment is already linked to another account.",
      });
    }

    // Step 3: Fetch verified payment state from Razorpay API
    const razorpay = getRazorpayInstance();
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== "captured") {
      if (payment.status === "authorized") {
        await razorpay.payments.capture(razorpay_payment_id, payment.amount, payment.currency);
      } else {
        return res.status(400).json({
          success: false,
          message: `Payment is not in captured state (status: ${payment.status}).`,
        });
      }
    }

    // Step 4: Calculate 1-Year (365 days) TTL Expiration
    const verifiedAt = new Date();
    const currentUser = await User.findById(userId);

    // If user already has an active PRO subscription that expires in the future, extend from that date!
    const baseDate = currentUser?.plan === "PRO" && currentUser?.planExpiresAt && new Date(currentUser.planExpiresAt) > verifiedAt
      ? new Date(currentUser.planExpiresAt)
      : verifiedAt;

    const expiryTime = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Step 5: Save audit record in subscription_purchases
    await SubscriptionPurchase.findOneAndUpdate(
      { purchaseToken: razorpay_payment_id },
      {
        $set: {
          userId,
          provider: "razorpay",
          productId: PRODUCT_ID,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          subscriptionState: "ACTIVE",
          acknowledgementState: "ACKNOWLEDGED",
          expiryTime,
          autoRenewing: false,
          lastVerifiedAt: verifiedAt,
          metadata: {
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            email: payment.email,
            contact: payment.contact,
            signature: razorpay_signature,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Step 6: Upgrade User to PRO
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          plan: "PRO",
          planExpiresAt: expiryTime,
          "billing.provider": "razorpay",
          "billing.productId": PRODUCT_ID,
          "billing.purchaseToken": razorpay_payment_id,
          "billing.orderId": razorpay_order_id,
          "billing.paymentId": razorpay_payment_id,
          "billing.status": "ACTIVE",
          "billing.expiresAt": expiryTime,
          "billing.autoRenewing": false,
          "billing.lastVerifiedAt": verifiedAt,
        },
      },
      { new: true }
    ).select("-password +billing.purchaseToken");

    return res.status(200).json({
      success: true,
      message: "Razorpay payment verified and 1-Year PRO plan activated successfully!",
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error("Razorpay verification failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to verify Razorpay payment.",
    });
  }
};

/**
 * POST /api/billing/razorpay/webhook
 * Handles asynchronous server-to-server webhook events from Razorpay
 * (payment.captured, subscription.charged for recurring autopay, subscription.cancelled)
 */
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const webhookSignature = req.headers["x-razorpay-signature"];

    if (!webhookSecret || !webhookSignature) {
      return res.status(401).json({ success: false, message: "Missing webhook secret or signature." });
    }

    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature." });
    }

    const { event, payload: eventData } = req.body;

    // Handle Recurring Subscription Auto-debit (UPI Autopay / Card recurring)
    if (event === "subscription.charged") {
      const subscription = eventData?.subscription?.entity;
      const payment = eventData?.payment?.entity;
      const customerNotes = subscription?.notes || payment?.notes || {};
      const userId = customerNotes.userId;

      if (userId) {
        const verifiedAt = new Date();
        const expiryTime = new Date(verifiedAt.getTime() + 365 * 24 * 60 * 60 * 1000);

        await User.findByIdAndUpdate(userId, {
          $set: {
            plan: "PRO",
            planExpiresAt: expiryTime,
            "billing.provider": "razorpay",
            "billing.status": "ACTIVE",
            "billing.expiresAt": expiryTime,
            "billing.autoRenewing": true,
            "billing.lastVerifiedAt": verifiedAt,
          },
        });
      }
    }

    // Handle Subscription Cancellation
    if (event === "subscription.cancelled" || event === "subscription.halted") {
      const subscription = eventData?.subscription?.entity;
      const userId = subscription?.notes?.userId;
      if (userId) {
        await User.findByIdAndUpdate(userId, {
          $set: {
            "billing.autoRenewing": false,
            "billing.status": event === "subscription.cancelled" ? "CANCELLED" : "HALTED",
          },
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed:", error);
    return res.status(500).json({ success: false, message: "Webhook handler failed." });
  }
};
