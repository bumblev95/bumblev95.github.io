# Google sign-in candidate — not activated

The old AdMob test APK has no account menu. This revision adds **Settings → Account → Sign in with Google** in Korean and English, plus signed-in email, sign-out and confirmed account deletion. Ordinary games stay anonymous. Purchases and paid ad removal remain disabled; signing in grants no paid benefit.

## Code and security

- Native Credential Manager 1.6.0 and Google ID 1.2.1 open Google's account chooser. No embedded web login or app password field.
- The fixed HTTPS backend provides a random, single-use five-minute nonce challenge. The server uses google-auth-library 11.3.0 to verify signature, audience, issuer and expiry, and checks the nonce and verified email. Google `sub`, hashed with a provider prefix, determines identity; a client-supplied account ID/email/paid flag cannot do so.
- Accounts contain a random app UUID, hashed Google subject, verified email and creation time. Google ID tokens are not persisted. Opaque 30-day app session tokens are stored only as hashes on the server and encrypted with Android Keystore AES-GCM in private, backup-excluded app storage. Tokens do not cross the JavaScript bridge or enter localStorage. Up to ten sessions per account are retained.
- Logout revokes the current session and clears native/provider state. Account deletion needs final confirmation and a sign-in less than five minutes old, removes the account and all its sessions, and checkpoints the live SQLite database. It does not delete the person's Google account or downloaded books. Anonymous room data is independent and keeps the existing expiry/deletion rules. Provider logs/backups have separate retention.
- No Google Cloud client ID is invented. Without `GOOGLE_WEB_CLIENT_ID` the backend rejects sign-in, and the menu explains that setup is incomplete. The currently deployed backend predates these endpoints; a 404 is also shown as unconfigured. There is no fake successful login.
- Startup does not request a Google credential or contact the account service. Opening settings refreshes account status; only explicit sign-in opens the chooser.

## Owner configuration needed before real sign-in

1. In the owner's Google Cloud project, open **Google Auth Platform**. Configure Branding, Audience and contact information for Us Back Then / 그때 우리. Use the real public policy URL https://bumblev95.github.io/geuttae-uri/privacy.html and support keetojt@gmail.com. Verify any domain ownership Google requires. While the OAuth app is in Testing, add the intended test users.
2. In **Clients**, create an OAuth client of type **Web application** for backend audience. Supply its public `…apps.googleusercontent.com` client ID. This native ID-token flow does not use a client secret or a browser redirect URI. Do not send a client secret, service-account key or password in chat.
3. In the same project, create Android OAuth clients for the package and signing certificate actually used:
   - Candidate debug APK: `com.bumblevai.thenus.test` plus the delivered APK's SHA-1 certificate fingerprint.
   - Play distribution: `com.bumblevai.thenus` plus **Play App Signing** SHA-1 from Play Console (not just the upload key).
   - Register other developer-signed release certificates only when those builds need sign-in. Never substitute an AdMob ID for an OAuth ID.
4. The CI artifact includes `debug-signing-certificate.txt`, containing public certificate fingerprints only. A fresh ephemeral CI debug key may change across runs; register the exact APK under test or configure a stable private debug-signing key through a proper secret mechanism before relying on ongoing Google sign-in/update testing. No keystore is published.
5. Update the public privacy policy and Play Data safety/account-deletion disclosures to the account data and retention above **before activating login**. Publish and verify an external account-deletion request page; the currently published policy says accounts are not yet active. Do not silently change that claim while this is only an undeployed candidate.
6. Deploy the reviewed backend revision and set `GOOGLE_WEB_CLIENT_ID` to that Web client ID on the exact Railway service. Enable only after the policy/deletion pages are ready. Account config must return `enabled:true`; the real Google flow must be tested on a device with the registered certificate. No OAuth console configuration or server rollout is performed by this source change.

## Validation

Server tests cover verified identity persistence, hashed secrets, wrong nonce/audience/issuer/expiry, unverified email, forged tokens, concurrent replay, challenge/session expiry, recent-auth deletion, all-session revocation and HTTP origin checks. Browser checks cover KO/EN, visible menu, unconfigured/cancelled/verified states, safe email rendering, confirmation/reauth and logout using a stub native bridge. These do not claim real Google OAuth has succeeded.

Official implementation references:
- https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- https://developers.google.com/identity/sign-in/android/backend-auth
- https://developers.google.com/identity/android-credential-manager/releases
- https://developer.android.com/jetpack/androidx/releases/credentials
