# Monetization revision — 2026-10-15

Owner decision: remove Ultimate, recurring subscriptions and AI credit packs from the Android release. Keep regular photo quiz play free and anonymous. Plan advertising after completed games, personal ad removal as a one-time purchase requiring sign-in, and a one-time memory book purchase. Ad removal must affect only the purchasing account, with restoration on that account.

## Implemented in this revision

- Android candidate catalog and Korean/English product information list only `ad_free` and `memory_book`.
- The normal server catalog uses the same two-product catalog. The isolated legacy commerce fixtures remain for regression tests and do not enable payments.
- The product page explicitly says live advertising, sign-in and purchasing are not connected. Book previews and current test exports remain free. There are no working purchase buttons or simulated ownership claims.
- Follow-up AdMob integration: Google Mobile Ads SDK 25.5.0 + UMP 4.0.0 are now included. Debug uses Google's test app/ad unit; release contains the owner's IDs but live ads are OFF unless explicitly built with `-PthenusLiveAds=true`. Login and purchasing remain unimplemented.
- Owner supplied app ID `ca-app-pub-9723666081819297~5568418149` and interstitial ID `ca-app-pub-9723666081819297/3805489340` on 2026-10-15. The publisher matches the existing website ads.txt. A matching root app-ads.txt is prepared in this PR; it is not publicly verified until deployed and linked from the store.
- Unknown or under-18 local age choices do not initialize/request advertising. This is self-declaration, not identity verification. Adults complete UMP checks before SDK initialization/preloading. Privacy options and age-choice controls are in settings; the test-ad button is debug-only.
- Ads are attempted only after a completed real game, on an explicit next-game/new-gathering transition. No ads on launch, question/reveal, demo, early exit or home/exit. At most one attempt per game in the app session, five minutes between impressions, and no waiting for a late ad. These client/native gates do not yet implement paid ad removal.
- SDK data disclosure and policy drafts were updated. SDK/consent network behavior and real-device rendering are still to be verified; source tests do not establish compliance.

## Account setup

1. Completed by owner: create or sign in to an AdMob account at https://admob.google.com/ using the owner's Google account. The owner must supply payment, country and tax information and accept any account agreements.
2. Add an Android app as **Unpublished / not yet listed** until its Play listing is publicly available. Use **Us Back Then** and production package **com.bumblevai.thenus**. The `.test` debug package is not the Play app.
3. Completed by owner: create an **Interstitial** ad unit for a break after the game. Record the public AdMob App ID (`ca-app-pub-…~…`) and ad unit ID (`ca-app-pub-…/…`). These are configuration identifiers, not account passwords.
4. Configure privacy messages in AdMob. Before production advertising, integrate UMP consent and its privacy-options entry, consent-gated SDK initialization and Google test ads for QA. Never click live ads during testing.
5. Obtain the exact app-ads.txt seller line from AdMob. Publish it at the developer website root and connect that website in the Play listing. Do not invent a publisher ID. Link the store listing and complete AdMob readiness/ownership review before expecting full serving.

## Remaining implementation and launch gates

Google account menu/native flow, server verification, protected sessions and in-app deletion are now prepared in source. They are not deployed/activated: see GOOGLE-SIGN-IN-SETUP.md for the owner OAuth client/certificate configuration and policy/deletion gates. Purchases and paid ad removal are still unimplemented. The owner has reported the test ad displays on their phone; dismiss/consent and real OAuth require separate validation.

- Native ad SDK and natural-break placement are implemented; physical-device/consent QA remains. No opening-screen or mid-question ads are currently requested. Limit frequency; continue play if no ad is ready. Before selling ad removal, connect verified account entitlements so those accounts never initialize/request advertising. This integration is not present yet. Decide the actual target audience before configuring child/under-age treatment.
- Configure Google sign-in for the production package and Play signing certificate, validate ID tokens and nonces on the server, and provide secure account sessions, in-app account deletion and an external deletion URL. Regular games must remain usable without account creation.
- Create only `ad_free` and `memory_book` one-time products in Play Console. The ad-free price is undecided; do not activate an arbitrary price. The book's previously discussed US$0.99 is a planned reference price; display the price returned by Play in the buyer's local currency before checkout.
- Integrate Google Play Billing with server-side receipt verification, pending-payment handling, idempotent delivery, purchase restoration, acknowledgement/consumption and refund/revocation processing. No client flag or unverified receipt may grant a benefit.
- Resolve paid book delivery durability **before enabling sales**: the current book exists only in the connected tab's memory and is lost on home/reload/close. A purchase must survive cancellation of Save As, process death and reconnection without making a user pay twice. Provide an explicit, permitted local book library or another documented durable delivery design. Preserve the existing prompt deletion of temporary server photos; do not silently extend retention.
- Update the privacy policy, Play Data safety, ads declaration, account-deletion declaration and any applicable consent disclosures to the actual SDK behavior. Recheck the final dependency manifest, not just the source manifest.
- Validate with real devices, Play internal testing/license testers and Google test ad units before production review. The current pre-monetization AAB is not evidence that this work is complete.

## Official setup references

- AdMob setup: https://support.google.com/admob/answer/15948559
- Unpublished app setup: https://support.google.com/admob/answer/9989980
- SDK setup and test app ID: https://developers.google.com/admob/android/quick-start
- Consent: https://developers.google.com/admob/android/privacy
- app-ads.txt: https://support.google.com/admob/answer/9363762
- Play Billing: https://developer.android.com/google/play/billing/integrate

This document describes an advertising integration candidate with live serving disabled, not completed login/billing, verified serving or an approved store release.
