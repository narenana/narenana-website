# Post-release follow-ups

Deferred from the 24 September 2026 pre-production review (see `release-readiness-review.md`). None of these block the release.

## Owner / data tasks

- [ ] **Higher-resolution homepage hero for high-DPI screens.** Needs a new image, generated later. The largest file today is 1536px (`site/assets/hero-flight-v2.webp`). Common 1x laptops now load it and look sharp, but a 1440px-wide 2x ("retina") screen needs about 2,800px. Add a ~2800px `hero-flight-v2-2800.webp` (plus avif if wanted) as a `2800w` srcset entry on both the preload and the `<img>` in `site/index.html`, then run `npm run assets:version`.
- [ ] **Review the 12 flagged live listings** (flagged since 9 Aug) in admin → Review, with the flagged filter. Until each one is accepted or corrected, its model shows "in stock · price under review" with no published price.
- [ ] **Decide on manufacturer facts on product pages** (currently hidden: `PUBLIC_MANUFACTURER_FACTS = false` in `catalog/lib/worker.mjs`). Two things need settling first: how descriptions are used (rewrite or link), and what happens when a manufacturer wingspan conflicts with ours (auto-correct or flag). Enabling it needs no cache step: cache keys follow the deployed version.

## Found during the release (25 September 2026)

- [ ] **Log viewer: Pages Git production builds always fail.** Every one since July has failed, so production only changes by manual upload, and past uploads came from a dirty working tree. Either fix the Git build or switch the project to direct upload only, and add a `deploy` script that builds and uploads the exact committed tree (as done for this release; see `release-runbook.md`).
- [ ] **Log viewer: Cesium satellite imagery returns 401.** The build sets no `VITE_CESIUM_TOKEN`, so `api.cesium.com/v1/assets/2` is requested with an empty token. This predates the release: the previous build has the identical empty setting. Terrain (ArcGIS) works. Set the token as a build secret, or switch to a keyless imagery provider. `VITE_GA_ID` and `VITE_SENTRY_DSN` are empty too, so the log viewer has no analytics or crash reporting. Decide whether that is intended.
- [ ] **Nanawing 2 (its repo): production verifier races CDN propagation.** `verify-deployment.mjs` fails immediately when the 404 body right after a promote is still the previous build's. Treat that as propagation and retry within the shared deadline. Handed to the Nanawing 2 session; run 36103039819 is red for this reason only.
- [ ] **Nanawing FPV (its repo): two advisory probes are always red.** The live offline probe expects `/unavailable/i`, but the offline leaderboard copy never says that. The pitch probe hits a runner-speed harness failure. Both are `continue-on-error`, so neither fails the run.

## Low-priority fixes from the review

- [ ] **Sync the shared header copies** (`scripts/brand-shell.mjs`, `site/assets/family/shell.css`) into the Nanawing, Nanawing 2 and log-viewer repos. The only changes are the optional `cta` button and `avatar` URL (unused there, output unchanged), so this is housekeeping, not a release dependency.

- [ ] Catalog link previews (grid, landings, browse, search) use the Nanawing simulator social card as their default `og:image`. Give `/wings/` pages a catalog card (`page()` in `catalog/lib/public.mjs`).
- [ ] Electric/Nitro tabs on landing pages link to noindex filter URLs, not the sibling landing page (`grid-next.mjs` `powerHref`). Link to the sibling landing when it is valid.
- [ ] The generated product lede calls the default `kit` config an "airframe" even when it was never detected (`catalog/lib/product-overview.mjs`). Show the label only when the config was detected or set by an admin.
- [ ] The designed 404 page (`site/404.html`) is never served for missing static paths. Set `not_found_handling = "404-page"` under `[assets]` in `wrangler.toml` and smoke-test `/nonexistent`.
- [ ] The new static pages (video pages, catalog methodology, 404) have no analytics. Add the hostname-gated gtag snippet to the editorial generator (`scripts/seo-content.mjs`) and `404.html`.
- [ ] The floating Share button covers the hero's simulator link in the first viewport (`site/assets/family/share.css`).
- [ ] The product-page offers table scrolls sideways on 360px phones, by up to 28px. Wrap `table.vars` in an `overflow-x:auto` container, or let cells wrap below 400px.
- [ ] The homepage leaderboard is fetched uncached on every view. Load it when its section scrolls into view, or give the endpoint a short public cache.
