# Personal ad removal: purchase and restore

Implementation is present; **real checkout is disabled until the owner configures Play and the backend**. Do not submit or publish the app to production as part of setup. No price is assumed in code. Paid memory books remain out of scope and exports stay free.

## Product and package

- Product ID: `thenus_remove_ads` (permanent, non-consumable, one-time product; no subscription).
- One active permanent **buy** purchase option, with one eligible offer. Do not configure rental, preorder, multiple quantities, or multiple offers for this candidate.
- Name KO: `개인 광고 제거`; EN: `Personal ad removal`.
- Description KO: `로그인한 내 계정의 게임 사이 광고를 제거합니다. 한 번 구매하며 정기 구독이 아닙니다. 다른 참가자에게는 적용되지 않습니다.`
- Description EN: `Remove between-game ads for your signed-in account. One-time purchase, no subscription. Does not remove ads for other participants.`
- The owner selects the selling price in Play Console. The app displays Play's formatted local price; it never uses the book's proposed US$0.99 price for ad removal.
- Production package: `com.bumblevai.thenus`. Existing TEST APK: `com.bumblevai.thenus.test`. Play billing requires a matching package, including for sideloaded license testers. Setting up the production product does **not** enable purchases in the `.test` app. Choose a separate Play TEST app/product for `.test`, or a correctly signed internal-test build of the production app. No public rollout is needed.

## Server-only configuration

Enable Google Play Android Developer API in the owner's Cloud project. Create a least-privilege service account; grant it access to the relevant app and purchase/order APIs in Play Console (including permission to view purchase data and acknowledge purchases). Do not grant release or publishing access solely for verification.

Configure on the existing private server using its secret manager, never Git or the APK:

| Variable | Value |
| --- | --- |
| `GOOGLE_PLAY_BILLING_ENABLED` | Leave absent/false until every setup and disclosure step is complete; `true` enables this integration. |
| `GOOGLE_PLAY_PACKAGE_NAME` | Exactly the package whose product was configured. One package per deployment. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Owner-managed service-account credentials JSON. Do not send a private key in chat or screenshots. |
| `GOOGLE_PLAY_TOKEN_KEY` | Random 32-byte AES key encoded as 64 lowercase hexadecimal characters. Keep a secure backup; changing it makes stored receipt tokens unreadable. |

Keep the existing `GOOGLE_WEB_CLIENT_ID`. No new Google user scopes are requested. A service account is separate from the user's OAuth client.

The server fetches `purchases.products.get` for the fixed package and product, verifies purchased/unconsumed/single quantity and the app account's obfuscated ID, stores the token encrypted with AES-256-GCM and acknowledges via Google's API. It never consumes the product. It revalidates stored receipts on each entitlement check, including before logged-in advertising, so cancelled/refunded receipts lose access on the next check. Temporary verification outages skip the ad without displaying a paid entitlement or success message.

Acknowledgement errors remain recoverable verification intents. The next restore/status check retries; no success is shown until acknowledgement succeeds. If verification cannot finish within Google's acknowledgement window, Google can automatically refund the purchase. This candidate does not claim a background RTDN/voided-purchase worker; access is checked against Google on use. Keep billing disabled until acknowledgement retry and outage scenarios pass with license testers.

## Privacy and deletion before activation

The public policy and external deletion page must disclose purchase-token hashing/encryption, app-account association, entitlement state and check time; Google Play handles payment methods. This app must not request/store card details. Account deletion cascades to stored purchase records and sessions. It does not cancel/refund the Google Play transaction. Signing in again with the same Google identity and restoring from the purchasing Play account can recover the entitlement; another app identity cannot claim it. Update the public policy, in-app notice and Play Data safety purchase-history declaration before enabling real checkout.

## Physical-device / license tests

1. Complete the product setup, matching app package and country availability. Add `keetojt@gmail.com` as a **license tester**. A Google OAuth test user and a Play license tester are separate settings.
2. Use the matching native build with a registered OAuth signing certificate. Existing CI debug keys are ephemeral unless a private stable test key has been configured; never publish a private signing key to Git or artifacts. Keep the working login APK until the replacement certificate is registered.
3. Configure backend secrets and deploy with billing still false. Verify missing/invalid sessions, package mismatch and unavailable products cannot launch checkout.
4. Update disclosures, enable billing for the selected test package, and open Settings → Account. Google Play must provide the price. Use only a Play test payment method; confirm the purchase sheet explicitly says it is a test purchase before approving it.
5. Verify purchase → server acknowledgement → ad removal; restart/reinstall/another device → same app identity + Play account → restore without a new charge; cancellation grants nothing; pending purchase grants nothing until approved; repeated callbacks do not duplicate acknowledgements or purchases.
6. Refund/revoke → next entitlement check removes access. Switch the app identity → the receipt is rejected. Test offline/API outage and recover using Restore purchases. Test account deletion and restoration after signing in again. Confirm other room participants still receive their own ads.

Official references:
- https://developer.android.com/google/play/billing/integrate
- https://developer.android.com/google/play/billing/security
- https://developer.android.com/google/play/billing/test
- https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products
- https://developers.google.com/android-publisher/getting_started
