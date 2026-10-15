# Data safety worksheet — candidate 1.0.0 / 10000

This is a code-derived draft for the owner to confirm in Console, not a submitted declaration. Applies to PR #34 at 4e0d950 plus the submission-audit changes. Re-evaluate the final binary, active backend and SDKs together. A short retention period and anonymous rooms do not mean “no collection.” Data saved to private disk is not ephemeral processing.

| Actual data | Suggested Play data type | Collection and choice | Purpose / evidence |
|---|---|---|---|
| Nickname | Personal info → Name | Collected; required for multiplayer (demo alone does not make online collection optional) | Functionality; room create/join |
| Temporary player and session identifiers | Personal info → User IDs | Collected; required online; pseudonymous | Functionality and security; session authorization |
| Selected resized JPEGs | Photos and videos → Photos | Collected; user selects whether to upload | Functionality; private room disk, author and round-based access |
| Questions, options, stories, room titles and safety reports | App activity → Other user-generated content | Collected; authored/uploaded or reported by user | Functionality; security for reports |
| Answers, scores, gameplay state and room actions | App activity → App interactions | Collected; required for online play | Functionality; no analytics system evidenced |
| IP/network records | Device or other IDs if retained/used as identifiers; consider any other actual uses | NOT FINAL: reverse proxy/provider retention must be checked | In-memory request rate limits and provider HTTP records; do not infer location collection without a location use |

Sharing: room participants and explicit book export are user-directed transfers. Hosting is a service-provider transfer if Railway acts solely on our behalf. These can qualify for Play's sharing exceptions, but do not hide them from the privacy policy. Confirm provider processing and every active SDK before selecting “no data shared.”

Encryption in transit: candidate uses HTTPS, cleartext is disabled in Android, authorized photo endpoints are no-store. Not end-to-end encryption. Confirm *all* final SDK traffic before answering yes.

Deletion: users can remove/replace their questions; the host can end rooms/remove members; room access expires within 24h. Physical cleanup retries after outages. Email keetojt@gmail.com for requests, without session tokens or sensitive photos. An exported book cannot be recalled. Check provider backups/logs and correspondence retention separately; they are not proven erased by the room cleanup routine.

No registered-account system exists in this candidate. Do not declare account deletion implemented. If Google login is added for ad removal, implement in-app and external account deletion before updating this worksheet. No current ad/analytics/billing SDK, live payments or active AI service was found. The server health on 2026-10-15 reported AI and payments disabled. Do not use these draft answers for a future monetized binary.

Official form definitions: https://support.google.com/googleplay/android-developer/answer/10787469
Privacy/account policy: https://support.google.com/googleplay/android-developer/answer/10144311
