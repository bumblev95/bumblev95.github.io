# PLAYER’S CODEX · game hub (preview)

This directory is a **non-disruptive draft** for a shared PLAYER’S CODEX entry point and a separate ArcheAge Chronicles playtest guide. The repository root is the S&P 500 dashboard; this directory does not replace or modify it. Existing AION 2 pages are served separately by `bumblev95/Aion2-Daeva-Atlas`.

## Routes

- `/player-codex/`: English multi-game hub
- `/player-codex/ko/`: Korean multi-game hub
- `/player-codex/archeage-chronicles/`: English ArcheAge Chronicles landing page
- `/player-codex/archeage-chronicles/ko/`: Korean ArcheAge Chronicles landing page

Both game cards are real links. AION 2 opens the existing independent site; ArcheAge Chronicles opens its own new section. A distinct repository or domain for ArcheAge Chronicles can be introduced later, with explicit canonical redirect/migration planning rather than speculative links. Do not change AION 2 routing while setting up the preview.

## Facts & editorial boundaries

XLGAMES announced a free demo for Steam Next Fest October 19, 10 AM PDT through October 26, 10 AM PDT. Diamond Shores, four classes, PvP and the Throne of Hinnon dungeon are part of announced demo content; some life content is unavailable. Steam announced demo progress will not carry over to Early Access.

Sources:
- https://www.xlgames.com/company/news/429?pageNo=1
- https://steamcommunity.com/app/3218230/allnews/
- https://archeagechronicles.xlgames.com/en/

The page clearly labels all guide categories as plans, not verified gameplay facts. No fabricated skills, DPS rankings, maps, enemy drops, or test results. The ArcheAge Chronicles card uses CSS-based atmospheric art rather than copying a third-party image. The AION 2 card reuses the existing game site's public hero image, already credited in its repository. Owners retain all game trademarks; both landing pages disclose fan-project status.

## Publishing safety

GitHub Pages root source is `main`/`root`. Do **not** merge this draft until reviewed and ready for public release. No extra analytics tags, ads, user data collection, backend, build tooling or existing application changes are introduced. The new pages use static HTML, CSS and one progressive-enhancement status script. Direct hyperlinks, canonical URLs, bilingual hreflang and a standalone child sitemap are included.

Once approved, update the root sitemap discovery to include `/player-codex/sitemap.xml`, and add a visible All Games link in the AION 2 site in a separate PR that rebuilds its generated `docs/` pages. Root index.html and the live S&P 500 application remain unchanged.

## Field guide and mobile QA (October 15)

Added bilingual `/archeage-chronicles/demo/` playtest notes with explicit sourcing to XLGAMES developer communications. These are stated as announced systems, not measured gameplay outcomes. Internal links and shared assets use root-relative production paths so the site also renders correctly in a local preview server. Small-screen top navigation hides non-essential links while retaining the brand home link and language switch.

Browser smoke tests in `tests/smoke.mjs` verify six URLs in 360 px, 390 px and 1440 px layouts, language links, game card navigation, console errors and horizontal overflow. The GitHub Actions workflow runs the checks without changing the market homepage.

## Official videos linked before the demo (October 15, 2026)

The ArcheAge Chronicles landing pages (English and Korean) present clearly labelled external links to original publisher/official-platform video sources. Pages do not embed or redistribute full video files, and don't load YouTube playback scripts. Optional YouTube-supplied poster thumbnails are requested lazily and with `referrerpolicy=no-referrer` when the media cards come into view. Opening a video sends visitors to its provider in a new tab.

- PlayStation official first announcement trailer (Sep 24, 2024): https://www.youtube.com/watch?v=UeRY7LU0x3M
- ArcheAge Chronicles / XLGAMES developer video (Oct 8, 2026): https://www.youtube.com/watch?v=78ZGLdQMPGU
- Official Steam gameplay trailer at the publisher's Steam store: https://store.steampowered.com/app/3218230/ArcheAge_Chronicles/
- Official game YouTube channel: https://www.youtube.com/@ArcheAgeChronicles

All promotional and publisher-described footage remains distinct from independently tested class skills, DPS, NPC positions and boss mechanics. The local Playwright smoke test checks the links for both languages and all existing viewport sizes.

## October 15, 2026 – leading gameplay showcase

Added the official ArcheAge Chronicles video [A Quick Look at Auroria](https://www.youtube.com/watch?v=E12uscaQvSA), published September 7, 2026, as the **first and featured** media card on both EN and KO landing pages. The developer briefing (October 8, 2026) follows as a separate editorial category and the 2024 reveal trailer is third. This prioritizes the newest gameplay-focused footage over the old cinematic announcement. The video is an external YouTube link; nothing is rehosted or auto-played. Both local browser smoke and post-deployment HTTP checks assert card order.

## Automatic official announcements (October 2026)

GitHub Actions checks Steam's public ISteamNews GetNewsForApp v2 endpoint for ArcheAge Chronicles AppID 3218230 every three hours. It auto-publishes only the steam_community_announcements feed from the game publisher; other news feeds and player posts are not automatically published. New items are attributed, dated, deduplicated and limited to brief source excerpts. Korean pages retain original headlines rather than invent translations. Up to 80 items are kept in the machine-readable archive.

- EN archive: /player-codex/archeage-chronicles/news/
- KO archive: /player-codex/archeage-chronicles/news/ko/
- Latest three official updates are highlighted on both game homepages.
- Git commits are produced only when publisher content changes.
- The official Steam API is the source; if it fails, the job fails without removing existing news.
- The job explicitly requests a new GitHub Pages build after bot commits, which normally do not trigger branch-based Pages builds automatically. Pages write permission is required.
- To run immediately, use Actions > ArcheAge Chronicles · official news sync > Run workflow.
- This does not crawl restricted forums or players' personal data; it does not claim skills, DPS, boss patterns, maps or community rumors have been verified. Those require editorial review or documented gameplay.

A live HTTP check now compares the most recent official article ID and its individual source link against both published landing pages and both news archives on each scheduled run. It retries during CDN propagation and fails the workflow when the site is stale rather than silently reporting a successful update.
