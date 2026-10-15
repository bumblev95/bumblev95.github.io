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
