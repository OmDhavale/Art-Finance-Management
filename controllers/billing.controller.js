import { google } from "googleapis";
import User from "../models/user.model.js";
import SubscriptionPurchase from "../models/subscriptionPurchase.model.js";

const PRODUCT_ID = process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID || "artist_finance_pro_yearly";
const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.omdhavale15.ArtFinanceManagementFE";
const ENTITLED_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  // A cancelled auto-renewing subscription remains entitled until expiry.
  "SUBSCRIPTION_STATE_CANCELED",
]);

let publisherClient;
const getPublisher = async () => {
  if (publisherClient) return publisherClient;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Google Play service account is not configured on the server.");
  }

  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must contain valid JSON.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  publisherClient = google.androidpublisher({ version: "v3", auth });
  return publisherClient;
};

const getVerifiedSubscription = async (purchaseToken) => {
  const publisher = await getPublisher();
  const response = await publisher.purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  });
  return response.data;
};

const syncPurchase = async (req, res) => {
  try {
    const userId = req.user._id;
    const { purchaseToken, productId } = req.body || {};

    if (!purchaseToken || typeof purchaseToken !== "string" || !productId) {
      return res.status(400).json({ success: false, message: "purchaseToken and productId are required." });
    }
    if (productId !== PRODUCT_ID) {
      return res.status(400).json({ success: false, message: "Unrecognized subscription product." });
    }

    // A token must never be claimable by two different app accounts.
    const existing = await SubscriptionPurchase.findOne({ purchaseToken }).select("userId");
    if (existing && String(existing.userId) !== String(userId)) {
      return res.status(409).json({ success: false, message: "This Google Play purchase is already linked to another account." });
    }

    const subscription = await getVerifiedSubscription(purchaseToken);
    const lineItem = (subscription.lineItems || []).find((item) => item.productId === PRODUCT_ID);
    if (!lineItem || lineItem.productId !== productId || !lineItem.expiryTime) {
      return res.status(400).json({ success: false, message: "Google Play did not return the expected subscription product." });
    }

    const expiryTime = new Date(lineItem.expiryTime);
    const now = new Date();
    const state = subscription.subscriptionState;
    const isEntitled = ENTITLED_STATES.has(state) && expiryTime > now;

    if (state === "SUBSCRIPTION_STATE_PENDING") {
      return res.status(202).json({ success: false, pending: true, message: "Your payment is pending. PRO access will activate after Google confirms payment." });
    }
    if (!isEntitled) {
      return res.status(403).json({ success: false, message: "The Google Play subscription is not currently active." });
    }

    // Acknowledge new purchases from the backend, after Google verification.
    if (subscription.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      const publisher = await getPublisher();
      await publisher.purchases.subscriptions.acknowledge({
        packageName: PACKAGE_NAME,
        subscriptionId: PRODUCT_ID,
        token: purchaseToken,
        requestBody: { developerPayload: `user:${String(userId)}` },
      });
    }

    const verifiedAt = new Date();
    const autoRenewing = Boolean(lineItem.autoRenewingPlan?.autoRenewEnabled);
    const orderId = subscription.latestOrderId || null;

    await SubscriptionPurchase.findOneAndUpdate(
      { purchaseToken },
      {
        $set: {
          userId, productId: PRODUCT_ID, packageName: PACKAGE_NAME, orderId,
          subscriptionState: state,
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
          expiryTime, autoRenewing, lastVerifiedAt: verifiedAt,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          plan: "PRO",
          planExpiresAt: expiryTime,
          "billing.provider": "google_play",
          "billing.productId": PRODUCT_ID,
          "billing.purchaseToken": purchaseToken,
          "billing.orderId": orderId,
          "billing.status": state,
          "billing.expiresAt": expiryTime,
          "billing.autoRenewing": autoRenewing,
          "billing.lastVerifiedAt": verifiedAt,
        },
      },
      { new: true }
    ).select("-password +billing.purchaseToken");

    return res.status(200).json({
      success: true,
      message: "Google Play subscription verified.",
      data: { user },
    });
  } catch (error) {
    console.error("Google Play subscription verification failed:", error);
    const status = error.code === 404 ? 404 : 502;
    return res.status(status).json({
      success: false,
      message: "Unable to verify this purchase with Google Play. Please try restoring purchases or contact support.",
    });
  }
};

export const verifyPurchase = syncPurchase;
export const restorePurchase = syncPurchase;

export const getBillingStatus = async (req, res) => {
  const user = await User.findById(req.user._id).select("plan planExpiresAt billing");
  return res.status(200).json({ success: true, data: { plan: user.plan, planExpiresAt: user.planExpiresAt, billing: user.billing } });
};


// Google Pub/Sub push endpoint for Real-time Developer Notifications (RTDN).
// Configure Pub/Sub to send authenticated OIDC push requests to this URL.
export const handleGoogleRtdn = async (req, res) => {
  try {
    const audience = process.env.GOOGLE_PUBSUB_AUDIENCE;
    const expectedEmail = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
    const authorization = req.headers.authorization || "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!audience || !expectedEmail || !idToken) {
      return res.status(401).json({ success: false, message: "Unauthenticated Pub/Sub notification." });
    }
    const authClient = new google.auth.OAuth2();
    const ticket = await authClient.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload || payload.email !== expectedEmail || payload.email_verified !== true) {
      return res.status(401).json({ success: false, message: "Invalid Pub/Sub identity." });
    }

    const encoded = req.body?.message?.data;
    if (!encoded) return res.status(400).json({ success: false, message: "Missing Pub/Sub message data." });
    const notification = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (notification.packageName !== PACKAGE_NAME) return res.status(200).json({ success: true });
    if (notification.testNotification) return res.status(200).json({ success: true });

    const purchaseToken = notification.subscriptionNotification?.purchaseToken
      || notification.voidedPurchaseNotification?.purchaseToken;
    if (!purchaseToken) return res.status(200).json({ success: true });

    const purchaseRecord = await SubscriptionPurchase.findOne({ purchaseToken }).select("+purchaseToken");
    // The app's initial verify call creates the token-to-user association.
    if (!purchaseRecord) return res.status(200).json({ success: true });

    const subscription = await getVerifiedSubscription(purchaseToken);
    const lineItem = (subscription.lineItems || []).find((item) => item.productId === PRODUCT_ID);
    const expiryTime = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : new Date(0);
    const entitled = ENTITLED_STATES.has(subscription.subscriptionState) && expiryTime > new Date();
    const autoRenewing = Boolean(lineItem?.autoRenewingPlan?.autoRenewEnabled);
    const verifiedAt = new Date();

    await SubscriptionPurchase.updateOne(
      { purchaseToken },
      { $set: {
        subscriptionState: subscription.subscriptionState,
        acknowledgementState: subscription.acknowledgementState,
        expiryTime,
        autoRenewing,
        orderId: subscription.latestOrderId || null,
        lastVerifiedAt: verifiedAt,
      } }
    );

    const user = await User.findById(purchaseRecord.userId).select("+billing.purchaseToken");
    if (user && String(user.billing?.purchaseToken) === String(purchaseToken)) {
      user.billing = user.billing || {};
      user.plan = entitled ? "PRO" : "FREE";
      user.planExpiresAt = entitled ? expiryTime : null;
      user.billing.status = subscription.subscriptionState || "UNKNOWN";
      user.billing.expiresAt = expiryTime;
      user.billing.autoRenewing = autoRenewing;
      user.billing.lastVerifiedAt = verifiedAt;
      await user.save();
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Google RTDN processing failed:", error);
    return res.status(500).json({ success: false, message: "RTDN processing failed." });
  }
};
