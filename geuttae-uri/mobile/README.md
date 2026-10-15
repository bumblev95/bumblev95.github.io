# Us Back Then / 그때 우리 — Google Play release candidate

Release: com.bumblevai.thenus, version 1.0.0, versionCode 10000. Debug keeps a separate .test package and -TEST version suffix. Android API 24+, target API 36. Java 21 and Node 22+ required.

English app name: Us Back Then. Korean app name: 그때 우리. The initial interface follows the primary device locale, with English fallback. An in-app selection persists; player text stays as written.

The candidate bundles immutable releases/1.0.0. The published web preview stays on its existing version. The approved yellow photo/quiz icon is packaged in all launcher densities and adaptive icons. No broad photo-library, camera, microphone, location, ad, analytics or billing permission/SDK is added.

## Build

Run npm ci, npm run sync, npm test, then android/gradlew assembleDebug bundleRelease assembleRelease lintDebug lintRelease. CI produces a debug APK and unsigned release AAB/APK. Sign privately using the retained upload key; never commit keys or put them in public CI artifacts. Google Play App Signing handles store distribution.

## Submission gates

See store/SUBMISSION-REVIEW.md. This is a release candidate, not Google approval or a completed submission. The public support contact, final privacy URL, actual hosting/backup retention, operational moderation channel, Console declarations and physical-device tests must be completed. Deploy and verify the backend report/block change before advertising it as live.

Current file exports remain free. AI generation, live purchases and advertising are not enabled. Blocking is room-session scoped, not a global account/device ban.
