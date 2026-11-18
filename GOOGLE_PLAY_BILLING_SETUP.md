# Google Play Billing setup (backend)

The backend exposes authenticated routes:

- `POST /api/billing/verify-purchase` — verify a Google Play purchase token and activate the subscription.
- `POST /api/billing/restore-purchase` — re-check an existing token after restore.
- `GET /api/billing/status` — return the current server-side entitlement.
- `POST /api/billing/google-rtdn` — authenticated Google Pub/Sub Real-time Developer Notifications push endpoint.

The old `POST /api/users/update-plan` endpoint has been removed. Never re-enable a client-controlled plan switch in production.

## 1. Install dependency

```bash
npm install googleapis
```

The `googleapis` dependency is declared in `package.json`.

## 2. Google Cloud / Play Console setup

1. In Google Cloud, enable the **Google Play Android Developer API**.
2. Create a dedicated service account and keep its JSON key private.
3. In Play Console > Users and permissions, grant that service account the permissions required to view subscription/order data and manage subscriptions/acknowledgements for this app.
4. Configure the Play Console app and subscription product before testing.
5. Store the service-account JSON as a Render secret environment variable. Never commit it or put it in the mobile app.

Set these Render environment variables:

```env
GOOGLE_PLAY_PACKAGE_NAME=com.omdhavale15.ArtFinanceManagementFE
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=artist_finance_pro_yearly
GOOGLE_SERVICE_ACCOUNT_JSON={...full service-account JSON...}
```

The `GOOGLE_SERVICE_ACCOUNT_JSON` value must be valid JSON. In Render, paste the full JSON as the value, preserving escaped newlines in `private_key`.

## 3. RTDN (required for reliable renewals/cancellations/refunds)

The code includes an authenticated Pub/Sub push handler. Configure a Cloud Pub/Sub topic for Google Play RTDN and a push subscription to:

`https://YOUR_BACKEND_HOST/api/billing/google-rtdn`

Configure authenticated push delivery with an OIDC service account and set:

```env
GOOGLE_PUBSUB_AUDIENCE=https://YOUR_BACKEND_HOST/api/billing/google-rtdn
GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL=the-push-auth-service-account@YOUR_PROJECT.iam.gserviceaccount.com
```

Grant `google-play-developer-notifications@system.gserviceaccount.com` Pub/Sub Publisher on the topic. Set the RTDN topic in Play Console. The push subscription's OIDC service account is the identity expected by `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`; it is not necessarily the Play API service account.

RTDN messages are signals only; the handler fetches the current subscription from the Google Play Developer API before updating MongoDB.

## 4. Data model and security

- `User.plan` remains `FREE` or `PRO` so existing feature gates continue to work.
- `User.billing` stores current Google Play entitlement metadata.
- `SubscriptionPurchase` stores unique purchase-token ownership and verified status.
- A purchase token cannot be claimed by a different app account.
- The backend grants access only for active, in-grace-period, or cancelled-but-not-yet-expired subscriptions. Legacy/demo PRO flags without a Google Play provider are downgraded to FREE on the next authenticated request/login.
- Pending purchases do not grant access.
- New purchases are acknowledged server-side after verification.

## 5. Deployment/testing

Deploy the backend after setting the secrets. Test using a subscription purchased from the Play Store internal testing build. A purchase token from a debug/mock environment will not verify against the production Play Developer API. Check Render logs if Google rejects the service-account permissions or package/product configuration.

## Remaining production hardening

Before public launch, test all RTDN event types (renewal, cancellation, grace period, account hold, expiration, refund/revoke), add alerting/retry handling for Pub/Sub delivery failures, and review your support/refund policy. This starter implementation is not a substitute for end-to-end Play Console testing.
