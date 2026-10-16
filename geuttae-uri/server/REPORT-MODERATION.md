# 신고 검토 운영 / Report moderation operations

This PR is stacked on the unmerged 13+ safety PR #47. It is **not deployed**.
It does not publish Google Play, rebuild/replace an installed internal test app,
enable ads/checkout, or modify the existing Railway service or volume.

## Confirmed hosting state (2026-10-16)

- Railway project `geuttae-uri-test`, service `geuttae-api-test` is one replica in
  Virginia (iad). Railway calls its environment `production`; this is the existing
  **test** project, not authorization to change it.
- Source branch is `codex/us-back-then-play-100`, not this PR or PR #47.
- Private volume `geuttae-private-photos-test` is mounted at `/data`; the launcher
  confines application data to `/data/geuttae-uri`, runs as UID/GID 1000, and
  requires the existing volume rather than silently creating ephemeral storage.
- Existing storage is `rooms/<code>/room.json` + `media/<uuid>.jpg`, with separate
  accounts/commerce SQLite databases. No database credentials or live records were
  read for this task. Only platform configuration and repository code were inspected.

## Storage and privacy boundaries

`reports.sqlite` is a new, separate 0600 SQLite file in the same private data
directory. It adds no migrations to account/commerce DBs. Report fields are fixed:
random report ID, type, reason enum, room code/creation time, random room-local
reporter/author IDs, photo target ID if applicable, timestamps, status and version.
History contains operator **alias**, action, result and timestamp. There is no
free-text evidence field and no photo, question, story, name, email, account,
purchase, birth date, session credential or IP copy in this ledger.

The queue remains useful after expiry for recording review outcomes and patterns
within that room, but it cannot reconstruct deleted evidence or impose a global
account ban. Room IDs are anonymous and independent of Google accounts. An
operator may inspect an existing reported photo through the authenticated endpoint
below; it returns the existing file with no-store headers, never an archived copy.
Do not save/export photo evidence or send it to email/AI systems.

Each report and its cascading history expires **30 days after first receipt**.
Duplicates, restart, review and actions never reset expiry. Expired records are
invisible to reads/actions immediately; the startup sweep and 30-second cleanup
loop physically delete them using SQLite `secure_delete=ON`, FULL synchronous
writes and DELETE journal mode (no retained WAL). This overwrites deleted cells
in the live DB, not filesystem/provider snapshots. No app backup is created.
Before deployment, confirm the Railway volume backup policy and limit access and
retention of any provider snapshots; restoring a backup requires startup cleanup
**before serving traffic**. Do not create manual DB copies for routine review.

Photos still delete at game end/removal and abandoned rooms within **24 hours**
from creation. Expired access is denied before IO; deletion failures retry. A
failed legacy-report import never blocks expired room/photo deletion. Valid old
`room.reports` entries migrate idempotently using their original receipt time and
then are cleared from JSON. Already expired reports are not resurrected.

## Configure operator access later, with the matching policy and server

No moderator key was created or installed in the live service by this PR.
`MODERATION_OPERATORS_JSON` is server-only; missing configuration disables all
moderation access with 503 while reports still persist. Malformed config stops
startup. Each operator has a unique alias and a separate random **32-byte** key.
The server holds only the SHA-256 hex digest:

```json
[{"id":"safety-1","tokenSha256":"<64 lowercase hex digest of a random 32-byte hex key>"}]
```

Generate and keep the raw key in the operator's secret manager. Put only the
digest/config in Railway sealed variables; never frontend runtime config, browser
storage, repository files, command arguments or URLs. Keep aliases pseudonymous.
Revoke/rotate a key by removing/replacing its digest and restarting the server;
no participant/account session grants moderation rights. Use HTTPS. Access through
an operator VPN or identity-aware gateway with MFA is recommended before release.
The included API requires bearer auth and rejects **all** Origin headers and URL
queries; it grants no CORS access, cookie authentication or automatic redirects.

On a trusted operator machine, inject these through a secret manager (do not type
the raw key into a command line or shell history): `MODERATION_API_ORIGIN` (the
exact HTTPS API origin) and `MODERATION_TOKEN` (raw key). Commands:

```sh
node tools/moderate.mjs list
node tools/moderate.mjs list reviewing
node tools/moderate.mjs list all 50
node tools/moderate.mjs show REPORT_ID
node tools/moderate.mjs review REPORT_ID 1 --confirm
node tools/moderate.mjs dismiss REPORT_ID 2 --confirm
# Alternatives after review (choose exactly one, using the latest version):
node tools/moderate.mjs resolve REPORT_ID 2 --confirm
node tools/moderate.mjs remove_photo REPORT_ID 2 --confirm
node tools/moderate.mjs remove_player REPORT_ID 2 --confirm
node tools/moderate.mjs close_room REPORT_ID 2 --confirm
```

`list` defaults to open reports (received + reviewing), 50 per page, oldest first.
`nextOffset` supplies subsequent pages. Run it at the start/end of an operator
session, prioritize safety concerns, and re-read pending attempts after outages.
There is **no automatic email notification or staffed review SLA**. Assign an
operator and a review routine before making this feature available to users.
Do not interpret a reason enum or repeated accusations as proof of misconduct.
Inspect the live photo when needed, contact the support reporter for minimal
clarification, and dismiss unsupported reports. Deleted media cannot be recovered.

## Endpoints and outcomes

All endpoints require `Authorization: Bearer <operator key>` without an Origin
header. POST uses JSON and a bounded 8 KiB body. Credentials must never be in the URL.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/moderation/reports` | `{status:"open",offset:0}` queue; statuses also received/reviewing/resolved/dismissed/all |
| `GET /api/moderation/reports/<id>` | Minimal record, history, live room/author/photo availability |
| `GET /api/moderation/reports/<id>/photo` | Only this report's live photo; 410 if gone/expired, no archived fallback |
| `POST /api/moderation/reports/<id>/review` | `{action,expectedVersion,confirmed:true}` |

Received reports require `review` first. Reviewing reports accept dismiss, resolve
(no sanction), remove_photo, remove_player or close_room. Closed reports cannot be
reopened. Wrong/stale versions get 409, preventing duplicate/concurrent decisions.
Every enforcement writes an audit intent **before** asynchronous room IO. If IO
fails or the process stops, status stays reviewing with a pending audit entry;
reload and retry using the latest version. Deletion tombstones deny photo access
immediately. Repeated removal is safe. Outcomes distinguish `applied`,
`target_unavailable`, `room_unavailable`, and `host_room_closed`. Room identity
includes creation time, so a reused code never sanctions a later room.

Removing a photo denies it for everyone and excludes it from future memory books;
questions/order/scores remain playable. Removing a guest revokes their room access
and removes their content; removing a host closes the whole room. `close_room`
revokes room access, closes streams and deletes its temporary directory. Deletion
errors retry in sweep; there is no global ban or recall of already downloaded files.

## Abuse resistance and readiness

- Active room sessions only; no self/foreign/pending/spoofed targets. Photo reports
  must reference the current question/round. User-supplied metadata cannot set
  author, reporter, review state or receipt timestamps.
- Same room/reporter/type/target deduplicates even with a different reason and
  across restarts. At most 10 distinct reports per reporter/room/hour, 100 per room,
  10,000 retained globally; failed/full submissions never claim receipt. Existing
  request/body/room limits also apply. No auto sanctions and no arbitrary notes.
- Operator auth failures and API calls are rate-limited, lists are bounded, review
  history is capped at 99 actions per report. Report/request/key contents are not
  written to application logs. Provider access logs have separate controls.
- Before any later deployment, publish the matching KO/EN policy revision at
  `/geuttae-uri/privacy.html`, configure named operators, test secret revocation,
  and confirm backup/review coverage. The release policy draft and in-app notices
  in this PR describe the implementation; the current public policy/server have
  deliberately not been changed live.
- Test with fresh temporary directories/fixture accounts only. CI runs server,
  account, commerce, reporting and browser regressions without real billing/ads.

```sh
npm ci
npm test
node --test tests/reports.test.mjs
```
