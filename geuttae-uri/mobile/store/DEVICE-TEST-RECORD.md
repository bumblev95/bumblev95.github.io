# Physical Android test record — NOT RUN

Browser automation stubs the native bridge. No emulator or physical Android device is attached in this workspace. Do not mark a row passed from CI screenshots or source inspection.

Use the signed production package through Play internal testing when available. Install alongside the existing TEST app; never uninstall it or clear its data. Use harmless sample photos and new rooms only. Record tested commit, signed AAB SHA-256, Play versionCode, Android/WebView versions and device models, with date and actual observations.

| Test | Steps and expected result | Actual evidence |
|---|---|---|
| Installation and identity | Install from internal track. Production package is com.bumblevai.thenus; existing .test data remains present. KO/EN launcher labels and approved icon render correctly. | NOT RUN |
| First launch and language | Fresh production installation with Korean, then English device language; unsupported language falls back to English. Manual selection survives force close. | NOT RUN |
| Consent and chooser | Read rules/privacy before checking consent; attempt continuing unchecked. Open system file chooser, cancel, then select a real supported photo. No broad storage/camera permission. Verify large/rotated/HEIC selection behavior. | NOT RUN |
| Two-device play | A hosts; B joins by code and waits for approval. Confirm unauthorized photos/answers inaccessible, then play a complete round. | NOT RUN |
| Hide, report, removal | B hides/shows A's photo; A stays unchanged. Cancel report → nothing changes; confirm → B's photo hidden, play continues. Host removal confirmation revokes B and deletes B's media; two-player room ends with warning. Operator handling is tested separately. | NOT RUN |
| Save and cancellation | Permit one photo, deny another, complete game. Export PDF and HTML through Android Save As; cancel causes no success. Reopen actual files in Android viewers and check consent filtering. | NOT RUN |
| Native share/back/links | Native share contains room code/link only. Back closes dialogs, confirms leaving room, exits home correctly. Invalid/malicious thenus links do not expose tokens or navigate arbitrary hosts. | NOT RUN |
| Interruptions | Lock/unlock, background/foreground, airplane mode and network switch, process death and reconnection. Document session/book loss honestly; no silent paid-book loss is permitted if sales are added. | NOT RUN |
| Deletion/expiry | End own room and verify photo access denied. In an isolated test environment verify 24h expiry and outage cleanup with private disk evidence; never alter other users' rooms or production clock. | NOT RUN |
| TEST preservation | Existing TEST package/data/settings still usable. Note that backend is currently shared: separate packages do not provide server isolation. | NOT RUN |

No live-ad tapping, real purchase spending, or sensitive family photos are needed for these checks. If monetization ships, add Google test-ad/consent and license-tester purchase/pending/restore/refund/account-deletion cases first.
