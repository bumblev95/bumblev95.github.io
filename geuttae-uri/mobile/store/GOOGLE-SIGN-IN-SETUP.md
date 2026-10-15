# Google sign-in candidate — test backend deployed; device verification pending

The old AdMob test APK has no account menu. This revision adds **Settings → Account → Sign in with Google** in Korean and English, plus signed-in email, sign-out and confirmed account deletion. Ordinary games stay anonymous. Purchases and paid ad removal remain disabled; signing in grants no paid benefit.

## Code and security

- Google ID 1.2.0 is pinned for its Kotlin 2.1 metadata compatibility with the app’s AGP 8.13 lint toolchain; 1.2.1 changes only metrics per Google’s release notes but requires newer metadata support.
- Native Credential Manager 1.6.0 and Google ID 1.2.0 open Google's account chooser. No embedded web login or app password field.
- The fixed HTTPS backend provides a random, single-use five-minute nonce challenge. The server uses google-auth-library 11.3.0 to verify signature, audience, issuer and expiry, and checks the nonce and verified email. Google `sub`, hashed with a provider prefix, determines identity; a client-supplied account ID/email/paid flag cannot do so.
- Accounts contain a random app UUID, hashed Google subject, verified email and creation time. Google ID tokens are not persisted. Opaque 30-day app session tokens are stored only as hashes on the server and encrypted with Android Keystore AES-GCM in private, backup-excluded app storage. Tokens do not cross the JavaScript bridge or enter localStorage. Up to ten sessions per account are retained.
- Logout revokes the current session and clears native/provider state. Account deletion needs final confirmation and a sign-in less than five minutes old, removes the account and all its sessions, and checkpoints the live SQLite database. It does not delete the person's Google account or downloaded books. Anonymous room data is independent and keeps the existing expiry/deletion rules. Provider logs/backups have separate retention.
- No Google Cloud client ID is invented. Without `GOOGLE_WEB_CLIENT_ID` the backend rejects sign-in, and the menu explains that setup is incomplete. As independently checked on 2026-10-15, the test backend includes these endpoints and returns `enabled:true`. A missing configuration or a 404 on another deployment is still shown as unconfigured. There is no fake successful login.
- Startup does not request a Google credential or contact the account service. Opening settings refreshes account status; only explicit sign-in opens the chooser.

## Owner configuration needed before real sign-in

1. In the owner's Google Cloud project, open **Google Auth Platform**. Configure Branding, Audience and contact information for Us Back Then / 그때 우리. Use the real public policy URL https://bumblev95.github.io/geuttae-uri/privacy.html and support keetojt@gmail.com. Verify any domain ownership Google requires. While the OAuth app is in Testing, add the intended test users.
2. In **Clients**, create an OAuth client of type **Web application** for backend audience. Supply its public `…apps.googleusercontent.com` client ID. This native ID-token flow does not use a client secret or a browser redirect URI. Do not send a client secret, service-account key or password in chat.
3. In the same project, create Android OAuth clients for the package and signing certificate actually used:
   - Candidate debug APK: `com.bumblevai.thenus.test` plus the delivered APK's SHA-1 certificate fingerprint.
   - Play distribution: `com.bumblevai.thenus` plus **Play App Signing** SHA-1 from Play Console (not just the upload key).
   - Register other developer-signed release certificates only when those builds need sign-in. Never substitute an AdMob ID for an OAuth ID.
4. The CI artifact includes `debug-signing-certificate.txt`, containing public certificate fingerprints only. A fresh ephemeral CI debug key may change across runs; register the exact APK under test or configure a stable private debug-signing key through a proper secret mechanism before relying on ongoing Google sign-in/update testing. No keystore is published.
5. PR #39 published the bilingual privacy policy and external account-deletion instructions. Both public pages returned HTTP 200 on 2026-10-15. Play Data safety and submission declarations remain release work; this does not authorize Play submission.
6. The existing Railway **test** service has already deployed commit `fc8cb4c63256becd488ce13ae2428f212b62390d`; deployment `e4d1e474-4d7d-4b7d-8e2a-a0f28d642212` is `SUCCESS` (created 2026-10-15 16:24:37 UTC / 10:24:37 America/Regina). Live `/api/account/config` returned `enabled:true` and the owner-supplied Web client ID below. This documentation change performs no deployment or OAuth Console mutation. Real device verification remains pending.

## Validation

Server tests cover verified identity persistence, hashed secrets, wrong nonce/audience/issuer/expiry, unverified email, forged tokens, concurrent replay, challenge/session expiry, recent-auth deletion, all-session revocation and HTTP origin checks. Browser checks cover KO/EN, visible menu, unconfigured/cancelled/verified states, safe email rendering, confirmation/reauth and logout using a stub native bridge. These do not claim real Google OAuth has succeeded.

Official implementation references:
- https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- https://developers.google.com/identity/sign-in/android/backend-auth
- https://developers.google.com/identity/android-credential-manager/releases
- https://developer.android.com/jetpack/androidx/releases/credentials

## Verified artifact and configuration — 2026-10-15

- Workflow: https://github.com/bumblev95/bumblev95.github.io/actions/runs/38761128994
- Source: `fc8cb4c63256becd488ce13ae2428f212b62390d`; artifact ID `11986241393`.
- Installable file: `Us-Back-Then-v1.0.0-candidate.apk` (the previously delivered `Us-Back-Then-TEST-v1.0.0-Login.apk` has identical bytes).
- Manifest inspected from APK: `com.bumblevai.thenus.test`, version `1.0.0-TEST`, versionCode `10000`.
- APK SHA-256: `fe603b8548ae1f810ca0c9daaa841ace44ce0505eb9db7793da4888a6c2f779f`.
- APK v2 signer certificate SHA-1 extracted independently and matches CI certificate report:
  `9A:77:03:50:24:20:D1:26:B0:A6:5E:22:F9:36:85:22:1C:68:DF:F7`.
- Live backend Web audience: `809415127587-gi1pdb84kf27k9c7117l2r9c85q1eh3t.apps.googleusercontent.com`.
- Owner-supplied Android client: `809415127587-4cabcaos7gdrbi37lh8puteba9pc863t.apps.googleusercontent.com`. Its ID alone cannot prove its package/certificate configuration.
- Google Cloud Console could not be accessed in the verification browser. Its stored Android package/SHA-1 and same-project relationship are **not yet independently verified**. In Google Auth Platform → Clients, open this Android client and compare the exact TEST package and SHA-1 above; verify the Web client is in the same project. Do not replace the Web audience with the Android client ID. If Audience is Testing, verify the intended tester is allowed.
- Live `/api/health`: HTTP 200, `paymentsEnabled:false`; `/api/account/config`: HTTP 200, `enabled:true`, `paymentsEnabled:false`; unauthenticated `/api/account/me`: HTTP 401, `SIGN_IN_REQUIRED`.
- On this verification run, 13 focused account/mobile checks passed using the candidate APK’s extracted bundled assets: `node --test geuttae-uri/server/tests/accounts.test.mjs geuttae-uri/mobile/tests/*.test.mjs`. The first local attempt lacked generated assets; extracting them from the exact delivered APK resolved that setup-only failure. No app implementation was changed.
- CI Android build/lint/bundled UI checks passed. Its account UI uses a stub native bridge. No successful real Google account choice, sign-in, persistence, logout, re-login or deletion has been reported.
- Artifact ad report: debug uses Google sample/test advertising IDs; default release has live ads disabled. This work enables neither live ads nor paid purchases.

## Preserve existing installations

The earlier `Us-Back-Then-TEST-v1.0.0-AdMob.apk` has the same TEST package and versionCode, but its signer SHA-1 is
`25:40:97:FA:50:F8:0B:CE:57:4F:A5:DA:AC:AD:3E:43:3B:37:5B:95`.
It **cannot be updated in place** with this login APK under Android's normal signing rules. Never uninstall it, clear storage or recommend bypassing signature validation to solve the conflict. Actual installed APK/signature remains unknown until checked on the device.

If the identical Login APK is already installed, use it; reinstalling is unnecessary. If only the older AdMob APK is installed, preserve it and test on another Android device or an independently isolated Android user/profile if the device supports it. That profile's private data will be separate. A future in-place update requires access to the original private signing key; registering another SHA-1 in Google Cloud does not fix Android installation compatibility. Do not generate a new key and assume it matches.

Only the signed candidate APK is for installation. The unsigned APK and AAB in this artifact are not phone test installers. The TEST package is different from `com.bumblevai.thenus`, so this candidate does not target the formal app's package.

On a PC with Android platform-tools and an explicitly connected device, optional read-only inspection:

```sh
adb shell pm path com.bumblevai.thenus.test
adb shell dumpsys package com.bumblevai.thenus.test
# Pull the exact base.apk path returned above, then inspect it:
adb pull <returned-base.apk-path> installed-test.apk
apksigner verify --print-certs installed-test.apk
```

Only after checking matching package, signer and a compatible versionCode use `adb install -r Us-Back-Then-v1.0.0-candidate.apk`, or Android's ordinary Update installer. No uninstall/clear-data/downgrade flags. If Android reports a signature conflict or App not installed, stop and retain the existing app.

## Physical-device sequence and result log

Use a Google account whose app account is disposable. Finish any active game first; export any needed memory book using the existing export feature. Export is not a complete app-data backup.

1. Open the installed **TEST** app → Settings (설정) → Account (계정). Confirm **Google로 로그인 / Sign in with Google** is visible. An older AdMob build has no account menu.
2. Tap Sign in with Google → Google account chooser. First cancel once: remain signed out and continue using the app. Then tap again and select the intended test account. Do not enter Google passwords into the app.
3. Confirm Settings shows the selected email, **로그인했어요 / Signed in**, **로그아웃 / Sign out**, **계정 삭제 / Delete account**, and **Google 계정 다시 확인 / Verify Google account again**. Account chooser alone is not successful app authentication.
4. Remove the app from Android Recents and reopen it (do not clear storage). Open Settings again; wait for the server status check. The same account email and logout/delete actions should remain. A brief anonymous placeholder before Settings finishes checking is not by itself a persistence failure.
5. Tap Logout. Confirm the email disappears and the sign-in button returns. Restart and open Settings; remain signed out.
6. Sign in again with the same account. Confirm success as in step 3.
7. Tap Delete account → Cancel. Confirm the account remains. Then, within five minutes of sign-in, tap Delete account → **계정 삭제 확인 / Confirm account deletion**. This permanently deletes this app's account and all its app sessions. It does not delete the Google account or locally exported books. If asked to verify again, use **Verify Google account again**, then repeat the explicit deletion confirmation.
8. Confirm **계정을 삭제했어요 / Account deleted**, no email and no logout/delete actions. Restart → Settings; remain signed out. Re-signing in afterward creates an app account again and is not evidence that deletion failed. Device UI alone cannot prove physical removal from every backup or log; backend deletion semantics are covered separately by automated tests.

| Check | Automated/server evidence | User-confirmed physical-device result |
|---|---|---|
| Candidate package/certificate | APK inspected; matches CI report | Installation/signature not reported |
| Google chooser/cancel | Native bridge stub only | Not tested/reported |
| Successful Google verification | Live enabled config; verifier tests | Not tested/reported |
| Restart persistence | Encrypted native storage implementation; account tests | Not tested/reported |
| Logout/re-login | Server/UI tests | Not tested/reported |
| Delete cancel/confirm/recent authentication | Server/UI tests | Not tested/reported |

Record device model, Android version, APK hash/build, exact step, actual visible message and local time after the user supplies results. Do not mark device steps passed from CI results. Do not record ID/session tokens, passwords, full account email or unredacted logcat.

## Triage by failure stage

- Install conflict: compare installed signer to the two SHA-1 values above. Keep the old app. Google Cloud changes cannot resolve a package signature mismatch.
- No account menu: confirm TEST app and Login APK, not AdMob APK or web preview.
- Chooser cannot open / GOOGLE_SIGN_IN_FAILED: first check exact package/SHA-1 registration, correct Google Cloud project, account/provider availability, Google Play services and network. These are candidates, not a confirmed root cause without device evidence.
- Chooser returns but GOOGLE_VERIFICATION_FAILED: inspect safe server error/time, Web audience, nonce expiry and app challenge flow; never request the raw token. The native error currently groups multiple provider failures, so the UI message alone cannot pinpoint the cause.
- UNAVAILABLE / configuration message: check live config and reachability of the exact native API host; do not infer successful authentication from an enabled config.
- Persistence failure: confirm same Android profile and APK, no uninstall/storage clearing, then distinguish server session rejection from native Keystore storage failure.
- REAUTHENTICATE_TO_DELETE: expected after five minutes; verify Google account again and retry deletion. Other errors require diagnosis before claiming success.

Official installation reference: https://developer.android.com/studio/publish/app-signing
