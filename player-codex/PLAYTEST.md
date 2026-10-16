# ArcheAge Chronicles: gameplay evidence workflow

The EN and KO demo guides now share one evidence dataset. The existing Steam
publisher-news job remains independent. A news announcement, trailer, planned
test, browser draft or passing CI check is **not** a measured gameplay finding.

The initial dataset has seven checklist targets and **zero records, zero media
sources and no active build**. No game was launched or played to implement this
feature. Synthetic test fixtures exist only inside the test code, use a separate
historical test release and are never imported into the site dataset.

## Files and responsibilities

| File | Purpose |
| --- | --- |
| `archeage-chronicles/data/playtest.schema.json` | Versioned JSON Schema for language-independent IDs, typed observations, source media and review metadata |
| `archeage-chronicles/data/playtest-records.json` | Canonical checklist, release scope, all observation records and evidence sources |
| `archeage-chronicles/data/playtest-guide.json` | Generated projection of current-build, reviewed findings only |
| `scripts/playtest.py` | Offline validation, safe draft import, review digest and deterministic EN/KO rendering |
| `assets/playtest-notebook.mjs` | Local browser draft form on both demo guides |
| `assets/playtest-drafts.mjs` | Shared draft validation, import and deduplication logic |

The original seven targets cover classes/weapons, level-up stats, weapon
traits/skills, Diamond Shores landmarks, collectibles, Hinnon patterns and
channel differences. `kind` distinguishes class, skill, stat, trait, location,
collectible, boss pattern and channel records. No class/skill/boss names,
locations or measured values are prefilled as gameplay facts.

## Collect an observation

1. Open the Korean or English demo guide and expand **Record a playtest
   observation / 플레이 관찰 기록하기**. Use the actual observed game build,
   server region, channel, relevant class/weapon, character level and test setup.
   Times in the form use the device timezone and are exported as UTC.
2. Use stable, lowercase IDs for the subject and fact (for example, an English
   in-game subject name and a property such as `cooldown`). A fact is unique per
   release + kind + subject + property + build/region/channel/class/weapon/level/
   setup. Repeated attempts should add evidence to the same record. Separate
   builds or real test conditions can have separate records.
3. Enter what was actually observed. Korean-only or English-only drafts are
   allowed; both languages are required for publication. Missing measurements,
   capture times or sources remain incomplete, unverified drafts. The form
   never fills observation or capture times automatically.
4. Link the public original screenshot or video using HTTPS. Attribute its
   creator, capture time, build and what it demonstrates. Use only media you can
   share; remove personal information. The form does not upload media or contact
   a backend. Links open at the source rather than embedding third-party media.
5. For screenshots, calculate the **actual original file's SHA-256** locally
   (`sha256sum file.png` or PowerShell `Get-FileHash file.png -Algorithm SHA256`).
   For video, record the explicit start/end seconds in the original source.
   Do not estimate a digest, timing or coordinate.
6. Save the unverified draft. Drafts persist in this browser's storage; switching
   EN/KO on the same origin reuses them. **Export draft file** preserves a JSON
   bundle. Imports are local, idempotent and accept unverified records only.
   When storage is blocked, the session still supports export. Old/corrupt
   storage is not overwritten: export it first and reconcile its metadata.

The compact form captures one measurement and one media source per observation.
The common structure supports multiple measurements and sources; extend those
arrays in the canonical file during review. New observations can reuse a source
already in local drafts or the repository. Canonical records are not overwritten
by a draft import; use a reviewed repository change to amend them.

## Structured details

| Record kind | Required details before review |
| --- | --- |
| Class | Actual class context and observed weapon IDs |
| Skill/stat | Numeric values, units, bilingual measurement conditions for publishing; actual class, level and setup (weapon also required for skills) |
| Trait | Weapon context and observed prerequisite IDs; an empty list explicitly means none observed |
| Location/collectible | Map ID, X/Y, explicit coordinate basis, and the linked map-reference screenshot |
| Boss pattern | Boss ID, phase, cue/response, absolute cue/impact seconds and video covering that interval |
| Channel | Observed regular→PvP or PvP→regular transition and the captured steps/effects |

Coordinates are never inferred. `normalized_0_1` is bounded to 0–1 in both axes;
`map_pixels` also requires the reference map width/height and checks bounds;
`game_xy` preserves the game's own numeric coordinates, including negative values.
Map coordinates reference a screenshot in the record's `evidence_ids` so later
map scaling cannot silently change their meaning. They are records, not guessed
markers on an invented map.

## Import and review in a PR

From the repository root, with Python 3.12+ (stdlib only):

```sh
python player-codex/scripts/playtest.py --import-drafts /path/to/archeage-playtest-drafts.json
```

This imports into the canonical file and rebuilds the filtered projection and
both guide sections. It validates the entire candidate before writing. It never
overwrites an existing ID with different content or imports a new preapproved
record. Exact reimports are no-ops. A metadata/build mismatch requires explicit
reconciliation, not an automatic rewrite of the source's recorded build.

Review states are `unverified` → `in_review` → `verified` or `rejected`. To submit
for review, complete the actual observation, source provenance and typed details,
then set `verification` to `{"status":"in_review","review":null}`. The first
publication also requires `release.active_build` to be the actual observed demo
build; it starts as `null` rather than a guessed version.

A reviewer must **open every source**, confirm what it actually shows, check the
original screenshot checksum or video interval, verify build/conditions and
check both translations. After that inspection:

```sh
python player-codex/scripts/playtest.py --revision RECORD_ID
```

This only prints a SHA-256 digest; it never approves a record. The digest covers
the full observation (including both languages, context, coordinates and media
references) and every linked evidence object's metadata, excluding only
`verification`. The reviewer must explicitly enter:

- `verification.status`: `verified` (or `rejected` for a rejection).
- `verification.review.reviewer`: actual reviewer display name/handle.
- `reviewed_at`: actual RFC3339 review time, after the observation and captures.
- `decision`: `approve` or `reject`, matching the status.
- `revision_sha256`: the printed digest for the inspected revision.
- `evidence_ids`: exactly all linked evidence IDs inspected.
- `notes`: an EN/KO object with substantive review notes in at least one language.

Render, validate, commit and review the change:

```sh
python player-codex/scripts/playtest.py
python player-codex/scripts/playtest.py --check
python -m unittest discover -s player-codex/tests -p 'test_*.py' -v
node --test player-codex/tests/playtest-drafts.test.mjs
```

Commit the canonical dataset, generated `playtest-guide.json`, and **both** demo
HTML files together. The existing Pages branch publishing process serves them
after a reviewed PR is merged. No auto-approval, auto-merge, game automation or
separate publishing credential is added.

Changes to an approved record or its evidence invalidate its review. Reset it
to `in_review` with `review: null`, inspect the changed evidence, recompute the
digest and record a new review. A source reused by several approved records
requires re-review of every affected record. Keep rejected records for audit;
they never appear as gameplay findings.

When a new demo build is observed, update `release.active_build`. Older approved
records become `needs_recheck` in the generated checklist and are excluded from
both languages' findings. Their evidence/review history stays intact. Re-test
against the new build and create a new scoped record before publishing it. This
does not pretend a demo finding is valid for a future release.

## What automation checks

PR CI checks schema/types/unknown fields, IDs and duplicate facts, duplicate
source URLs (including YouTube aliases and common tracking parameters), media
checksums/clips, linked references, map bounds, video ranges, observation and
capture dates within the demo window, no future observations/reviews, matching
source/record builds, nonpromotional gameplay provenance, review decisions and
digest binding, and EN/KO publication completeness. Pending and rejected records
stay out of the generated gameplay projection. A stale generated JSON or guide
fails CI, which prevents manually inserting a finding only in one language.

The browser is an input aid. The Python validator is the authority; importing a
file never makes it approved. Validation cannot establish that an image is real,
an external URL still works, a media file matches an entered checksum, or the
named reviewer actually inspected it. Those are explicit human review steps in
the PR. There is no automated assertion that a video proves a game mechanic.

The existing three-hour Steam publisher-news workflow, permissions, schedule,
source feed and five-file write allowlist are unchanged. This pipeline writes
only the playtest dataset/projection and marker-delimited blocks in the two
demo guides. Official posts retain their existing “not gameplay verified” status.

Browser checks use Playwright, as the existing layout workflow does:

```sh
node player-codex/tests/smoke.mjs
node player-codex/tests/playtest-notebook.mjs
```

An existing local Chromium can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; CI uses Playwright's installed Chromium.
