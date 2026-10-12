# 그때 우리 · fixed-link preview

This directory is separate from the existing market homepage. Do not change the root homepage, ads, sitemap, or other applications when updating this preview.

## Scope

v0.2.1 preserves the cream/peach/green UI, sample-photo quiz, local custom photo/question editor, rotating question author, and results. This public static preview uses simulated participants. It does not host multiplayer rooms or call an AI service. Selected photos and questions stay in browser memory; returning home, starting a new demo, refreshing or closing the page clears the memory-book session. No analytics, photo upload, localStorage, IndexedDB, or service-worker photo cache is used. A file is downloaded only when the user explicitly clicks the free test export button; downloaded files remain on the device.

## One optional purchase: a memory book

The home page and game remain free, without a membership catalog or AI tier grid. After a completed game, results offer a free memory-book preview. The proposed launch product is **US$0.99 for one game's memory book, one-time purchase, no subscription**. Actual store-localized prices are not connected. `memoryProduct.paymentEnabled` is false; the public preview never charges money and never grants a verified purchase entitlement. Export is explicitly labeled as a free test, and includes a test/sample watermark.

The composer has a separate optional save/share permission for a photo and its question/story. A newly selected photo defaults to **not allowed** even when replacing an allowed sample. Only explicitly allowed, revealed memories enter the book. The three illustrations and fictional participants are authorized sample content. An end/report does not create a book. Home/new-game clears the in-memory book. Downloaded copies cannot be remotely revoked, and the preview explains this before export.

The actual export is one self-contained UTF-8 **HTML album** with embedded reduced JPEGs, question/answer/story cards, participant responses and scores. It opens offline. The user can use the browser print menu to save a PDF; there is no promise of a native PDF download or direct mobile sharing. Text is HTML-escaped; only bounded JPEG data URLs are embedded. Room codes, API URLs, tokens and original filenames are excluded. Exported HTML has a restrictive CSP and no scripts, executable SVGs, network requests or analytics.

One noninteractive banner placeholder and one post-game interstitial placeholder demonstrate the proposed ad positions. They are clearly labeled: **no real advertisements, tracking, revenue or AdMob SDK**. The interstitial appears at most once for a completed demo, and the album dialog continues to block release application.

## Remaining release work

Actual mobile store billing/receipt verification, refunds/restoration, server-enforced per-game export entitlement, participant save permission and revocation checks, real ads and AI limits are **not implemented in this static release**. Native payment must be verified on a server before unlocking a production export; browser flags must never be accepted as proof of payment. Paid books do not extend the existing multiplayer server's photo lifetime.

The multiplayer code is separately held in PR #4 on `codex/geuttae-uri-multiplayer-v030`. This preview neither deploys that Node server nor migrates it to Cloudflare. A future multiplayer integration must obtain authoritative per-author permission, avoid retaining disallowed media, assemble authorized snapshots before temporary media deletion, and preserve end/report/24-hour expiry protection. Do not copy this local-only preview into production as a billing or authorization implementation. Cloudflare provisioning and AI subscription products remain separate work.

## Stable releases

`index.html` loads `boot-v1.js`. The loader fetches `version.json` with a cache-busting parameter, validates the version, and loads the immutable `releases/<version>/` JavaScript and CSS. Future releases must use a new directory. Publish all files and the updated `version.json` atomically. Keep old releases available for already open tabs.

The page displays the loaded version and release notes. Checks run once a minute while visible and when returning to the page or reconnecting. A new release never forces a reload. Apply is disabled during a lobby/game and while a dialog is open. Home/results may apply an update. The manifest is scoped only to `/geuttae-uri/`; internet is required at launch. No service worker is registered, so this app cannot control other paths on this hostname.

## Verification

Run `npm ci`, `npm test`, `npx playwright install --with-deps chromium`, then `node tests/browser-qa.mjs` from this directory. The browser harness uses a real local HTTP origin, a simulated quiz, a real generated JPEG upload, save denial, export/download/render/print, update deferral and widths 320/390/768/1440. It asserts no APIs, external requests, browser storage or service workers. The memory workflow runs this harness on pull requests; the existing deployment workflow verifies the fixed public HTTPS files after publishing. These are browser tests, not physical-phone or actual-payment tests.

The live multiplayer backend, private cloud storage, AI photo analysis, adult mode, native Android/iOS builds, and actual-device two-player QA are separate work and are not provided by this static deployment.
