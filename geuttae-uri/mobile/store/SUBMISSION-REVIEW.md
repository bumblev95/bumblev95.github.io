# Google Play submission review — 2026-10-15

Status: RELEASE CANDIDATE. No application has been created and no review request has been submitted.

## Verified facts
- Package com.bumblevai.thenus, version 1.0.0 (10000), target Android API 36. The debug variant remains a separate .test package.
- English brand: Us Back Then. Korean brand: 그때 우리. Store listings en-US and ko-KR are authored separately.
- First launch follows the primary device locale; an explicit in-app selection takes priority on later launches; unsupported languages fall back to English. No personal story is automatically translated.
- Only INTERNET permission, no broad photo-library, camera, microphone or location permissions. Photos selected through the system file chooser.
- No ad, tracking, billing or live AI SDK is active in this candidate's UI. Optional product descriptions remain clearly labelled as future products, with free exports today.

## Data Safety draft (must be confirmed in the actual Console form)
- Data collected: optional user-chosen photos; nicknames; questions/stories/answer choices; gameplay scores and answers; temporary session/player IDs; room-access and reporting records. Photos and room state are stored on private server disk and are NOT eligible for the in-memory-only ephemeral processing exemption.
- Purpose: app functionality and safety/abuse prevention. No sale of personal data or advertising use is implemented.
- User-directed sharing: selected room participants and explicit saved-book export; consider the Console's user-initiated transfer exception when completing the sharing questions. Railway is a hosting processor; confirm its actual access-log, region and backup settings before claiming retention guarantees.
- HTTPS in transit; files protected by session authorization; server expiry access control. Do not claim end-to-end encryption.
- Deletion: owner photo replacement/removal; report/room termination; abandoned room expiry within 24 hours. Physical cleanup retries after outages. Exported books cannot be remotely recalled.
- No account creation: the account-deletion requirement does not apply to an account system that does not exist. Do not describe temporary room sessions as registered accounts.

## UGC controls
- Explicit rules/consent before entering a gathering, with prohibited categories defined before upload.
- Consent from people shown; separate optional consent for book exports.
- Private room admission; host removal in the lobby; immediate photo/report takedown; reported author's session blocked in that room. Self-report still removes content without blocking the reporter.
- Blocking is scoped to a room session; no account-wide or device-wide blocking is claimed.
- The owner authorized keetojt@gmail.com as the public customer-support, reporting and privacy/deletion contact on 2026-10-15. The contact is included in the bilingual policy draft and store metadata; publication and operational report handling still need verification. Do NOT certify full policy compliance or request public production review until that channel and the deployed backend controls are verified.

## Remaining required inputs/actions
1. Contact selected by the owner: keetojt@gmail.com. Publish it with the final policy/store listing and verify operational handling; do not assume that in-app reports automatically send email.
2. Final privacy-policy URL containing that contact, developer/app identity, actual data/processor/retention practices, and deletion instructions. Draft below is not a published final policy.
3. Owner approval of Play App Signing Terms and the export-law declaration on the new-app form. No boxes were selected on the owner's behalf.
4. IARC questionnaire and target audience based on the actual release; do not invent an Everyone rating. The app is intended for people who know one another, not public anonymous matching.
5. Confirm whether the personal account requires 12 opted-in closed testers for 14 continuous days before production access; the Console determines applicability.
6. Closed-test physical Android installation, real multi-device play, room reporting/blocking and cleanup verification after the backend update.

## Official references
- https://support.google.com/googleplay/android-developer/answer/9876937
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9844778
