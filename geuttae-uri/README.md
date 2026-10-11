# 그때 우리 · fixed-link preview

This directory is separate from the existing market homepage. Do not change the root homepage, ads, sitemap, or other applications when updating this preview.

## Scope

v0.2.0 preserves the v0.1 cream/peach/green UI, sample-photo quiz, local custom photo/question editor, rotating question author, and results. This public static preview uses simulated participants. It does not host multiplayer rooms or call an AI service. Selected photos and questions stay in browser memory; refreshing or closing the page loses that session. No analytics, photo upload, localStorage, IndexedDB, or service-worker photo cache is used.

## Stable releases

`index.html` loads `boot-v1.js`. The loader fetches `version.json` with a cache-busting parameter, validates the version, and loads the immutable `releases/<version>/` JavaScript and CSS. Future releases must use a new directory. Publish all files and the updated `version.json` atomically. Keep old releases available for already open tabs.

The page displays the loaded version and release notes. Checks run once a minute while visible and when returning to the page or reconnecting. A new release never forces a reload. Apply is disabled during a lobby/game and while a dialog is open. Home/results may apply an update. The manifest is scoped only to `/geuttae-uri/`; internet is required at launch. No service worker is registered, so this app cannot control other paths on this hostname.

## Verification

The unchanged v0.1 backend/rules baseline passed 31 Node tests before preparing this preview. Browser UI and update controls passed an offline Playwright harness: three rounds, author exclusion, tied winners, local photo/question editing, update deferral, release notes, and no horizontal overflow at widths 320/390/768/1440. Release fetches/module loading were simulated in that local harness due to environment navigation restrictions; it is not a real-device/network test. Product JavaScript is separately syntax-checked. CI checks the published HTTP resources and browser-rendered home page where Chrome is available.

The live multiplayer backend, private cloud storage, AI photo analysis, adult mode, native Android/iOS builds, and actual-device two-player QA are separate work and are not provided by this static deployment.
