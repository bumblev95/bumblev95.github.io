# Monetization revision — 2026-10-15

Regular photo quiz play stays free and anonymous. Ultimate, subscriptions and AI credit packs are removed. The only planned paid options are personal ad removal and a one-time memory book. File exports remain free; paid book delivery is not implemented.

## Current implementation

- Google Mobile Ads 25.5.0 + UMP 4.0.0. Debug uses only Google test advertising IDs. Release has owner-supplied IDs but live serving OFF unless explicitly built with `-PthenusLiveAds=true` after launch gates.
- Owner AdMob App ID: `ca-app-pub-9723666081819297~5568418149`; interstitial: `ca-app-pub-9723666081819297/3805489340`. Root https://bumblev95.github.io/app-ads.txt is public with the matching publisher entry. Store linking/readiness review remain separate.
- Advertising is attempted only on an explicit new-game transition after a completed real gathering, once per game per app session and at least five minutes between shown ads. No launch/question/reveal/demo/early-exit ads. No-fill/errors continue play. Unknown/under-18 age choices do not request ads; adult self-declaration is not identity verification. UMP eligibility precedes SDK initialization/loading.
- The owner confirmed test-ad display and real Google login, session persistence, logout and re-login on their phone. Regional consent/dismissal and account deletion still require physical-device checks.
- Optional Google accounts have server-verified ID tokens/nonces, native Keystore sessions, logout and confirmed account deletion. Production package/Play signing certificate setup remains separate from TEST OAuth registration.
- Personal ad removal now has native Play purchase/restore UI, server verification/acknowledgement, encrypted receipt storage and a native-only advertising gate. The server's Play billing feature remains OFF without owner credentials/configuration. Signing in alone grants nothing. See [GOOGLE-PLAY-BILLING-SETUP.md](GOOGLE-PLAY-BILLING-SETUP.md) for exact product ID, package matching, license testers and activation gates.
- The internal proposed catalog key `ad_free` maps to Play product `thenus_remove_ads`. Do not create a second duplicate Play SKU from the internal key. The proposed memory-book price does not set the ad-removal price; only Google Play's returned price is shown at checkout.
- Live Play purchases, restoration/refund behavior and paid-user SDK suppression have not yet been verified on a physical device. Automated backend/UI checks use isolated test providers/native stubs.

## Before enabling sales

Complete product/price/country setup, service-account permissions, server secrets, privacy purchase-history disclosures and the matching package/signing certificate. Validate license-test success, decline, cancellation, pending, process death, acknowledgement retry, restore and refund/revocation. No real charge should be used for development tests.

Before selling memory books, implement durable delivery that survives save cancellation, app death and reconnection without duplicate payment, while preserving prompt deletion of temporary server photos. Do not enable its sales with the existing tab-only snapshot.

Final store gates remain: AdMob readiness and messages; target audience/Families and UGC assessment; Data safety including purchase history; public privacy/deletion links; report-review operations; pricing/tax settings; IARC and required internal/closed testing. Production submission is on hold until the owner explicitly requests it.
