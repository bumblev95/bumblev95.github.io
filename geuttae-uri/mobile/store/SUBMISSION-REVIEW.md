# Google Play submission review — 2026-10-15

Status: RELEASE CANDIDATE. The owner is handling Play Console app creation. This agent has not submitted an app review request.

## Follow-up submission audit — 2026-10-15

**NOT READY for production submission.** The following evidence supplements the earlier review; it does not certify Google policy approval. No Play Console record was read or modified and no artifact was signed, uploaded or submitted in this audit.

| Area | Verified evidence | Still required |
|---|---|---|
| Source and CI | PR #34 remains Draft/open; head 4e0d950aefc4e2f24c524fb1dc16388b42e2c692. Its Android, multiplayer, memory and preview checks succeeded. Latest original Android run: 38713106267; artifact 11961184071. | Rebuild/review the follow-up PR; do not sign the earlier revision after changing code. |
| Deployment | Railway deployment 0a5a0083-d46c-4fc1-ac5a-ef3bfd7337fb SUCCESS at 90adf814, one iad replica, private /data volume. HTTPS health reports AI/payments disabled. | Latest catalog revision is absent from live deployment. This endpoint/volume is shared by TEST and the candidate; separate Android packages do not isolate server data. No restart/redeploy/volume change was made. |
| Deployed moderation API | An opt-in synthetic room verified admission, per-viewer hide/show, reporting without auto-ending, rejection of non-host kick, host kick/session revocation and inaccessible photo endpoints after end. Only this test room and harmless fixture photos were used and cleaned up. | No physical disk-erasure, backup/log retention or operator notification/action proof. |
| Privacy | Existing draft includes app/developer/contact and data lifecycle. Follow-up adds bilingual disclosures inside the consent form and identifies processor/collected data in the in-app policy. Proposed /geuttae-uri/privacy.html returned HTTP 404. | Confirm provider logs/backups and support correspondence retention, finalize and publish the public HTML policy, then check it from a signed-out browser. A bundled candidate notice is not a final public policy. |
| UGC | Rules precede upload; report records include photo/author/reason; personal hiding and host removal are distinct. | Reports live only inside room JSON and expire with it; there is no demonstrated ongoing operator queue/notification/action workflow. Email is manual. No individual user blocking exists; room approval is not verified identity. Private invitations alone do not establish compliance with the specified-user exception. Resolve reporting of users and appropriate blocking/moderation before certifying UGC compliance. Do not restore automatic room termination on report. |
| Android | Source package, target API 36, backups/cleartext disabled; debug stays .test. Follow-up CI audits the merged release APK permissions and both APK/AAB hashes/provenance, rejecting unreviewed SDK permissions/native libraries. | Final follow-up binary audit and actual Android/Play-installed testing. No connected physical device was available. |
| Store/Console | KO/EN text describes only currently working free features. | Final graphic/screenshots, correct audience/IARC, ads/Data safety declarations and app-access instructions, actual account/testing status and any legal acceptance. No declarations were selected. |
| Monetization | No live ads, sign-in or billing SDK; supplied AdMob IDs retained in setup notes. | Implement the previously requested ads/ad-removal/book model, consent, account deletion, verified billing and durable paid-book delivery, or obtain an explicit owner change of launch scope. Do not silently submit this as the requested monetized release. |

Local follow-up verification: 118 server tests, 20 core tests, 2 native-source tests, 4 release-audit negative/positive cases; bundled KO/EN moderation/consent, home at seven sizes, full demo and stub native save/cancel checks passed. These browser checks do not prove native device behavior.

Use [DATA-SAFETY-WORKSHEET.md](DATA-SAFETY-WORKSHEET.md), [SIGNING-AND-CONSOLE.md](SIGNING-AND-CONSOLE.md) and [DEVICE-TEST-RECORD.md](DEVICE-TEST-RECORD.md) for the specific handoff. Every physical-device row is deliberately NOT RUN.

Official policy checked on 2026-10-15: User Data requires public non-editable HTML policy plus in-app text/link; Data safety covers pseudonymous data and server disk copies; UGC requires ongoing effective moderation and reporting/blocking appropriate to the actual interaction model. No claim that photo hiding equals user blocking. API 36 matches the current new-app requirement.

## Verified facts
- Package com.bumblevai.thenus, version 1.0.0 (10000), target Android API 36. The debug variant remains a separate .test package.
- English brand: Us Back Then. Korean brand: 그때 우리. Store listings en-US and ko-KR are authored separately.
- First launch follows the primary device locale; an explicit in-app selection takes priority on later launches; unsupported languages fall back to English. No personal story is automatically translated.
- Only INTERNET permission, no broad photo-library, camera, microphone or location permissions. Photos selected through the system file chooser.
- No ad, tracking, billing or live AI SDK is active in this candidate's UI. The candidate lists only personal ad removal and a memory book as future one-time products, with free exports today. Ultimate and AI packs have been removed from the candidate catalog and product page. No recurring subscription is offered.

## Monetization setup is incomplete
- The owner has supplied AdMob App ID and ad unit identifiers (see MONETIZATION-SETUP.md); association and format verification plus native integration are still needed. Native ads, login and Play Billing are not implemented or enabled by this revision. Do not submit this candidate as a completed ad-funded or paid-product release.
- See [MONETIZATION-SETUP.md](MONETIZATION-SETUP.md) for exact remaining implementation, account setup, pricing and paid-book delivery gates. Privacy and Console declarations must be updated when those SDKs and accounts actually ship.

## Data Safety draft (must be confirmed in the actual Console form)
- Data collected: optional user-chosen photos; nicknames; questions/stories/answer choices; gameplay scores and answers; temporary session/player IDs; room-access and reporting records. Photos and room state are stored on private server disk and are NOT eligible for the in-memory-only ephemeral processing exemption.
- Purpose: app functionality and safety/abuse prevention. No sale of personal data or advertising use is implemented.
- User-directed sharing: selected room participants and explicit saved-book export; consider the Console's user-initiated transfer exception when completing the sharing questions. Railway is a hosting processor; confirm its actual access-log, region and backup settings before claiming retention guarantees.
- HTTPS in transit; files protected by session authorization; server expiry access control. Do not claim end-to-end encryption.
- Deletion: owner photo replacement/removal; host removal/room termination; abandoned room expiry within 24 hours. Physical cleanup retries after outages. Exported books cannot be remotely recalled.
- No account creation: the account-deletion requirement does not apply to an account system that does not exist. Do not describe temporary room sessions as registered accounts.

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
