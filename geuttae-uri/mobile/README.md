# Us Back Then / 그때 우리 — Google Play release candidate

Release: com.bumblevai.thenus, version 1.0.2, versionCode 10002. Debug keeps a separate .test package and -TEST version suffix. Android API 24+, target API 36. Java 21 and Node 22+ required.

English app name: Us Back Then. Korean app name: 그때 우리. The initial interface follows the primary device locale, with English fallback. An in-app selection persists; player text stays as written.

The candidate bundles immutable releases/1.0.0. The published web preview stays on its existing version. The approved yellow photo/quiz icon is packaged in all launcher densities and adaptive icons. No broad photo-library, camera, microphone or location permission is requested. AdMob 25.5.0 and UMP 4.0.0 are included; their merged manifest adds advertising/network permissions, including AD_ID. Play Billing 9.1.0 is included, with checkout still disabled.

The home screen now links directly to personal ad removal, with optional sign-in at the bottom. Settings separate the ad-removal card from account management at the end. Verified Play prices and account entitlements drive the home card; no price is hard-coded. The Google sign-in button keeps its approved logo and styling.

## Build

Run npm ci, npm run sync, npm test, then android/gradlew assembleDebug bundleRelease assembleRelease lintDebug lintRelease. CI produces a debug APK and unsigned release AAB/APK. Sign privately using the retained upload key; never commit keys or put them in public CI artifacts. Google Play App Signing handles store distribution.

## Teen & family safety (draft)

Android launch now checks a self-declared birth date (never stored or transmitted). A coarse age band is retained locally. Under-13 users cannot enter gameplay; 13–17 users cannot request ads or initiate ad-removal checkout. Legacy ad choices cannot grant adult status. Participants may report and block another player in a room; reports currently expire with the room and are not yet delivered to an operator. This is not verified age assurance or a completed moderation workflow. Privacy/Data safety, physical-device tests and operational moderation must be completed before a closed-test submission.

## Submission gates

See store/SUBMISSION-REVIEW.md. This is a release candidate, not Google approval or a completed submission. The final privacy URL, actual hosting/backup retention, operational moderation channel, Console declarations and physical-device tests must be completed. Deploy and verify the backend photo-hiding/reporting/host-removal change before advertising it as live.

Current file exports remain free. AI generation and live purchases are not enabled. Debug builds use Google test advertising IDs; the default release build has live ads disabled. Production IDs supplied by the owner are configured, but activation requires an explicit -PthenusLiveAds=true build after policy, consent and device QA gates. Settings include ad privacy/age controls and a debug-only test-ad button. Unknown or under-18 age choices never initialize/request advertising. This age selection is not identity verification. Ads may run only on a confirmed transition to another game after a completed real gathering, once per game and at most once per five minutes; no-fill never delays play. Blocking is room-session scoped, not a global account/device ban.

Personal ad removal purchase/restore code is now included but Play checkout remains disabled pending owner product/price/credential setup. See [the billing setup guide](store/GOOGLE-PLAY-BILLING-SETUP.md). The existing working login APK uses an earlier CI signing certificate; a replacement APK must have its actual certificate registered before OAuth tests.
