# Google Play submission review — 2026-10-15

Status: RELEASE CANDIDATE. The owner is handling Play Console app creation. This agent has not submitted an app review request.

## Verified facts
- Package com.bumblevai.thenus, version 1.0.0 (10000), target Android API 36. The debug variant remains a separate .test package.
- English brand: Us Back Then. Korean brand: 그때 우리. Store listings en-US and ko-KR are authored separately.
- First launch follows the primary device locale; an explicit in-app selection takes priority on later launches; unsupported languages fall back to English. No personal story is automatically translated.
- The app source requests INTERNET; the new Google Mobile Ads/UMP dependencies add network/advertising permissions in the merged manifest, including AD_ID. CI captures and verifies the merged permissions for both variants. No broad photo-library, camera, microphone or location permission is allowed. Photos are selected through the system file chooser.
- AdMob 25.5.0 and UMP 4.0.0 are integrated: Google test IDs in debug, owner IDs with live serving OFF by default in release. Google Play Billing Library 9.1.0 now supports personal ad-removal purchase/restore; real checkout remains disabled pending owner Console/service-account configuration. No live AI service is active. The candidate lists only personal ad removal and a memory book as future one-time products, with free exports today. Ultimate and AI packs have been removed from the candidate catalog and product page. No recurring subscription is offered.

## Monetization setup is incomplete
- The owner completed AdMob app/ad unit setup and supplied both IDs. Native interstitial/UMP integration is implemented, but live serving is disabled in the default release pending privacy-message setup, AdMob readiness/store linking/app-ads.txt, real-device testing and declarations. Google sign-in is implemented and was verified by the owner on a phone (including persistence, logout and re-login). Play purchase/restore code is implemented but is not yet configured or physically verified. Do not submit this as a completed paid-product release.
- See [MONETIZATION-SETUP.md](MONETIZATION-SETUP.md) for exact remaining implementation, account setup, pricing and paid-book delivery gates. Privacy and Console declarations must be updated when those SDKs and accounts actually ship.

## Data Safety draft (must be confirmed in the actual Console form)
- Data collected: optional user-chosen photos; nicknames; questions/stories/answer choices; gameplay scores and answers; temporary session/player IDs; room-access and reporting records. Photos and room state are stored on private server disk and are NOT eligible for the in-memory-only ephemeral processing exemption.
- Purpose: app functionality and safety/abuse prevention. Quiz content is not passed to the ad SDK. Enabled Google advertising may additionally collect/share IP-derived approximate location, device/advertising IDs, ad interactions and diagnostics for advertising/analytics/fraud prevention. Account for the actual SDK behavior in Play Data safety; the original no-ad draft is superseded.
- User-directed sharing: selected room participants and explicit saved-book export; consider the Console's user-initiated transfer exception when completing the sharing questions. Railway is a hosting processor; confirm its actual access-log, region and backup settings before claiming retention guarantees.
- HTTPS in transit; files protected by session authorization; server expiry access control. Do not claim end-to-end encryption.
- Deletion: owner photo replacement/removal; host removal/room termination; abandoned room expiry within 24 hours. Physical cleanup retries after outages. Exported books cannot be remotely recalled.
- Advertising consent: only local self-declared adults can start the UMP process; unknown/under-18 selections do not initialize/request ads. Birth dates are not collected. Age settings are not verified identity. User Messaging Platform handles regional consent and exposes privacy options through settings. Configure AdMob messages and test regional cases before production. Target-audience declarations and any Families obligations still need assessment.
- Optional accounts now exist. Declare verified account email, app/hashed Google identifiers and authentication purposes. In-app deletion and a public external deletion URL are required and implemented; physical deletion checks remain. Play checkout, when activated, adds purchase history (receipt token hash/encrypted token, app-account link, package, verification state and check time) for verification/restoration and fraud prevention. Card details stay with Google Play. Account deletion cascades to server purchase records but does not refund/cancel the Play transaction. Publish the revised billing privacy draft before activation.

## UGC controls
- Explicit rules/consent before entering a gathering, with prohibited categories defined before upload.
- Consent from people shown; separate optional consent for book exports.
- Private room admission; host-only removal in the lobby and during play, requiring explicit confirmation. Removal deletes the removed player's questions/photos and revokes their room session. Existing scores of other players remain; fewer than two remaining players ends play.
- Reversible per-participant photo hiding, including server photo access and delivered book filtering. A reason plus final confirmation is required for reports; reporting hides the photo for the reporter and saves a temporary record without ending the game or automatically removing anyone. Duplicate reports from the same player/photo are idempotent.
- No personal user-blocking or account/device-wide blocking is implemented. Host removal and photo hiding must not be advertised as personal user blocking. Reassess the current Google Play UGC requirements for this invitation-only design before certifying compliance.
- The owner authorized keetojt@gmail.com as the public customer-support, reporting and privacy/deletion contact on 2026-10-15. The contact is included in the bilingual policy draft and store metadata; publication and operational report handling still need verification. Do NOT certify full policy compliance or request public production review until that channel and the deployed backend controls are verified.

## Remaining required inputs/actions
1. Contact selected by the owner: keetojt@gmail.com. Publish it with the final policy/store listing and verify operational handling; do not assume that in-app reports automatically send email.
2. Final privacy-policy URL containing that contact, developer/app identity, actual data/processor/retention practices, and deletion instructions. Draft below is not a published final policy.
3. Owner approval of Play App Signing Terms and the export-law declaration on the new-app form. No boxes were selected on the owner's behalf.
4. IARC questionnaire and target audience based on the actual release; do not invent an Everyone rating. The app is intended for people who know one another, not public anonymous matching.
5. Confirm whether the personal account requires 12 opted-in closed testers for 14 continuous days before production access; the Console determines applicability.
6. Closed-test physical Android installation, real multi-device play, room hiding/reporting/removal and cleanup verification after the backend update.

## Build status
- Earlier signed v1.0.0 artifacts predate this moderation revision and must not be submitted. Rebuild and verify the Android candidate from the updated PR head before signing/uploading.
- Runtime API must advertise moderationSupported before the new photo actions are enabled. The moderation backend deployment was confirmed successful on Railway at commit 90adf814 on 2026-10-15. This subsequent catalog revision requires a separate backend rollout; it does not add live monetization.

## Official references
- https://support.google.com/googleplay/android-developer/answer/9876937
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9844778

See [GOOGLE-PLAY-BILLING-SETUP.md](GOOGLE-PLAY-BILLING-SETUP.md) for exact Play product ID, matching package, secret configuration, price and license-test gates. The billing privacy additions in privacy-policy-DRAFT.html are not yet public; enabling checkout is blocked operationally until they are published.
