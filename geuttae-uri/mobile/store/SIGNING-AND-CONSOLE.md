# Signing and Play Console handoff

## Correct artifact and key

Use the audited release AAB for `com.bumblevai.thenus`, version `1.0.0`, code `10000`. The candidate APK from CI is a debug `.test` app and must not be uploaded as the production package. Do not uninstall or clear data from an existing TEST installation to work around a debug-certificate mismatch.

CI deliberately builds unsigned release files. Each new artifact includes `RELEASE-AUDIT.json`, the merged release manifest and `SHA256SUMS.txt` covering both APKs **and AAB**. Match the tested checkout SHA and workflow to the reviewed changes. GitHub PR workflows can test a merge commit; the manifest records the actual checkout, not an assumed branch head. The audit rejects unexpected dependency permissions and native libraries requiring a new 16 KB page-size review.

An earlier signed build is mentioned in PR #34's review notes. Locate the existing upload keystore and verify its certificate against **Console → App integrity / App signing** before doing anything with signing. Its location, ownership and certificate have not been verified in this task. Do not generate a replacement, use a debug key, commit a key/password, or ask the owner to paste secrets in chat. Retain an encrypted offline backup. If an existing key is lost, use Google's upload-key-reset process rather than changing the registered identity silently.

On the owner's trusted machine, Android Studio → Build → Generate Signed Bundle / APK → Android App Bundle can reuse the existing keystore. Alternatively, after checksum verification, sign a *copy* of the audited unsigned AAB with the existing private key using `jarsigner`; use its interactive password prompts. Verify with `jarsigner -verify -verbose -certs`, inspect the certificate SHA-256, compare the upload certificate in Console, and hash the signed AAB again. AAB uses JAR signing; `apksigner` is for APKs. No signing was performed by this audit.

Play App Signing signs the delivered APKs with Google's app-signing certificate, which differs from the upload certificate. Configure future Google login against the delivered signing certificate. Keep `.test` and production identities separate. If code 10000 is already consumed by an upload, increment versionCode across Gradle/audit metadata and rebuild; do not overwrite an accepted artifact.

## Console sequence — no production rollout yet

1. Confirm the exact developer account, existing app record, package reservation, verified identity and necessary release-to-testing permissions. Check Android developer verification status. Do not create duplicate app records.
2. The account owner confirms the Play App Signing terms, export-law declarations, store developer identity/contact and any legal declarations. No new agreements were accepted in this task.
3. Complete app access/reviewer instructions: no login required, demo from home; real play requires two devices/sessions, room creation, code entry and host approval. A random single-player room code is not a permanent reviewer credential. Provide a maintained reviewer route if Google requests online access.
4. Load `ko-KR.json` and `en-US.json`; verify 30-character titles, 80-character short descriptions and 4,000-character full descriptions. Provide final 512×512 icon, 1024×500 feature graphic and at least two compliant phone screenshots of the final build. Browser screenshots with a stub native bridge do not certify Android UX. Re-capture if monetization changes the screens. No store-media upload is claimed.
5. Publish and check the public, non-editable HTML privacy policy with no sign-in/geofence/PDF; use the same policy identity/contact and link/text in-app. Do not submit a draft with unconfirmed hosting/report handling. Work through DATA-SAFETY-WORKSHEET.md against actual final SDK and server behavior.
6. Complete IARC, target audience, ads, app access, Data safety and other applicable App content forms truthfully. The previous product direction focuses on adults; that is not a completed Console audience selection or an IARC rating. “Family mode” is a gameplay label, not Families-policy certification. No 19+ mode ships. Reassess age design before targeting children.
7. Upload the signed AAB to **internal testing** after owner key/account checks. This is not production approval. Install from Play on actual Android devices, including the production package, inspect pre-launch/device reports, then follow any required closed-test path. Keep production unsubmitted until policy and device gates pass.
8. For personal accounts created after 2023-11-13, check whether Console requires 12 opted-in closed testers continuously for 14 days and a production-access application. Internal tests do not replace that requirement. Record actual testers/dates and feedback; never invent results.
9. Once all gates pass and authority remains valid, submit the reviewed candidate to the intended track. Production must stay held until policy and physical-device gates and all applicable owner/account approvals pass; do not infer those from passing automation or the Draft PR.

References: https://developer.android.com/studio/publish/app-signing · https://developer.android.com/guide/practices/page-sizes · https://support.google.com/googleplay/android-developer/answer/14151465 · https://support.google.com/googleplay/android-developer/answer/9859348
