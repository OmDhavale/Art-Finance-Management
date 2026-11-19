# Razorpay Payment Gateway & Autopay Setup (Branch: V2RA)

This branch (`V2RA`) replaces Google Play Billing with **Razorpay** for direct APK distribution, avoiding Google Play's 15–30% platform cut.

---

## 1. Quick Architecture Overview

* **Shared MongoDB Database:** Both the `GBills-PRO` (Google Play) and `V2RA` (Razorpay) backends connect to the same MongoDB database.
* **Dual-Provider Entitlement:** `auth.middleware.js` and `user.model.js` allow both `google_play` and `razorpay` providers.
* **1-Year TTL (Time-To-Live):** Upon successful payment, `user.planExpiresAt` is set to `current_time + 365 days`. `auth.middleware.js` automatically validates expiry on every API request.
* **Anti-Fraud Security:** Payments are verified cryptographically using HMAC-SHA256 signatures (`order_id + '|' + payment_id`) and checked against the Razorpay REST API before granting PRO status. Each `razorpay_payment_id` can only be claimed once across the entire database.

---

## 2. Environment Variables (.env)

Add the following variables to your `.env` on your deployed backend server (e.g. Render, Railway, AWS):

```env
# Razorpay Credentials (from Dashboard -> Account & Settings -> API Keys)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxx    # Use rzp_test_... during testing
RAZORPAY_KEY_SECRET=yyyyyyyyyyyyyyyyyyyyyy

# Webhook Secret (configured in Razorpay Dashboard -> Webhooks)
RAZORPAY_WEBHOOK_SECRET=your_custom_webhook_secret_string

# 1-Year Plan Price in INR (e.g., 999 for ₹999/year)
PRO_PLAN_PRICE_INR=999
RAZORPAY_PLAN_PRODUCT_ID=artist_finance_pro_yearly
```

---

## 3. Razorpay Dashboard Configuration Steps

### Step 1: Generate API Keys
1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Switch to **Test Mode** (for development) or **Live Mode** (for production).
3. Navigate to **Account & Settings** $\rightarrow$ **API Keys** $\rightarrow$ **Generate Key**.
4. Copy `Key Id` and `Key Secret` and paste them into your backend `.env`.

### Step 2: Configure Webhook (For Autopay & Asynchronous Confirmations)
1. In Razorpay Dashboard, go to **Account & Settings** $\rightarrow$ **Webhooks** $\rightarrow$ **Add New Webhook**.
2. **Webhook URL:** `https://your-v2ra-backend.onrender.com/api/billing/razorpay/webhook`
3. **Secret:** Set a secure random string (e.g. `rzp_wh_secret_2026`) and copy it into `RAZORPAY_WEBHOOK_SECRET` in `.env`.
4. **Active Events:**
   - `payment.captured`
   - `payment.failed`
   - `subscription.charged` (if using UPI Autopay / recurring mandate)
   - `subscription.cancelled`
   - `subscription.halted`
5. Click **Create Webhook**.

---

## 4. API Endpoints Reference

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/billing/razorpay/config` | Bearer Token | Returns public Razorpay key ID, price, and plan info. |
| `POST` | `/api/billing/razorpay/create-order` | Bearer Token | Generates a Razorpay `order_id` for checkout. |
| `POST` | `/api/billing/razorpay/verify-payment` | Bearer Token | Cryptographically verifies HMAC signature and activates 1-year PRO. |
| `POST` | `/api/billing/razorpay/webhook` | Public (Signed) | Receives server-to-server webhook events from Razorpay. |
| `GET` | `/api/billing/status` | Bearer Token | Returns current plan (`FREE` or `PRO`) and expiration date. |
