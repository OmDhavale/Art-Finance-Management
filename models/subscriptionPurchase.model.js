import mongoose from "mongoose";

const { Schema, model } = mongoose;

const subscriptionPurchaseSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  provider: { type: String, enum: ["google_play", "razorpay"], default: "razorpay", index: true },
  purchaseToken: { type: String, required: true, unique: true, index: true, select: false },
  productId: { type: String, required: true },
  packageName: { type: String, default: "com.omdhavale15.ArtFinanceManagementFE" },
  orderId: { type: String, default: null },
  paymentId: { type: String, default: null },
  subscriptionState: { type: String, required: true },
  acknowledgementState: { type: String, default: null },
  expiryTime: { type: Date, required: true },
  autoRenewing: { type: Boolean, default: false },
  lastVerifiedAt: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false, collection: "subscription_purchases" });

const SubscriptionPurchase = model("SubscriptionPurchase", subscriptionPurchaseSchema);
export default SubscriptionPurchase;
