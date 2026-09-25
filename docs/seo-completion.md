# SEO and theme completion — 23 September 2026

Local implementation complete. Feature branches are pushed (owner-authorized); nothing is merged to a main branch, deployed or submitted to search engines. Counts in "Verification" are the 23 September snapshot unless marked current.

## Implemented

- Approved Direction A applied to catalog, category/browse and product pages; both simulator landing pages and guides; FPV leaderboard; log-viewer application, use cases and guides; watch/methodology pages; 404 pages; admin/statistics styling.
- Shared avatar, blue/orange palette, Barlow Condensed headings, DM Sans body, two-line product navigation, mobile menu and cross-product footer. Fonts are self-hosted with OFL notices. Simulator gameplay/HUD retains a readable dark surface with matching typography and launch accents.
- Homepage metadata, social artwork, manifest, canonicals, sitemap discovery, truthful availability and comparable-product Offer/AggregateOffer data.
- Dedicated review and log-video watch pages with verified VideoObject dates/durations, prominent embedded players and fallback links.
- FPV leaderboard canonical corrected to sim.narenana.com and visible H1 added. Nanawing 2 title explicitly identifies line-of-sight; hidden boot title is no longer a second marketing H1.
- Sitemap and `/wings/browse/` list in-stock models only (owner decision, 24 September 2026; an earlier version of this branch listed out-of-stock models too and was reverted). Out-of-stock product pages stay reachable and keep honest OutOfStock schema. Retired models remain excluded. Category SSR renders selected cards while filters can reveal the remaining models.
- Product introductions derived from existing catalog facts. Editorial enrichment beyond available source facts is not fabricated. Manufacturer-sourced facts are **admin-only** (owner decision, 24 September 2026; `PUBLIC_MANUFACTURER_FACTS = false`). Product pages show no manufacturer section, link or JSON-LD property, and a suite test enforces it. Accepted mappings stay reviewable in admin → Aircraft data.
- Seller counts derive from approved, in-stock, priced listings on published models. Methodology explains verification, refresh batches and price/stock limitations.
- Genuine 404 status for missing pages: an unknown catalog slug returns 404 with the real grid. The branded `site/404.html` is **not yet served** for missing static paths, which return an empty 404; see `post-release-todo.md`. Also: index.html canonical redirect and staging/alternative-preview noindex protection.
- Responsive hero/race images, matching preload, deduplicated variable fonts, reduced initial parallax layout work, production-only homepage analytics and contrast fixes.

## Verification

- Read-only production baseline: 235 sitemap URLs, all 200 after transient retries. See seo-production-crawl.json.
- Updated local inventory (23 September, before the in-stock rule was restored): 460 sitemap URLs, all 200, correct canonical, one H1, title/description present, valid JSON-LD and no page-level noindex. Local app servers deliberately send a preview noindex header, excluded from the production-markup check. See seo-local-crawl.json. Recheck with `node scripts/seo-audit.mjs --local`.
- **Current (24 September, fix branch):** the website sitemap lists 214 URLs on the local production snapshot: 184 in-stock models plus hubs, landings and editorial pages. `seo-local-crawl.json` and `sitemap-readiness.json` still hold the 23 September crawl; regenerate them with `npm run seo:audit` (all four local previews running) before release.
- Catalog: 54/54 including lifecycle mutation on an isolated LOCAL database snapshot. SEO regression: 10/10. **Current:** catalog 64/64, SEO 16/16. Worker deployment dry-run passed; it does not upload.
- Nanawing: 810 tests, production build passed. Nanawing 2: typecheck, headless/provenance checks and 153 tests passed; two static builds produced identical service-worker hashes and 79 verified offline assets. Log viewer: 44 tests and production build passed.
- Desktop/mobile review of family navigation, catalog, simulator landings/guides, leaderboard and log guides/application. Sample flight parsed into telemetry and summary. Chrome embedded Giz review advanced to 15 seconds of 28:12.
- Lighthouse mobile: original performance 56 / accessibility 97 / best practices 96 / SEO 100. Optimized run performance 84; final contrast run accessibility 100 / best practices 96 / SEO 100, but performance varied to 60 (LCP 7.8s, TBT 0, CLS 0). These are local lab results with remote media and machine-load variability, not a stable performance pass or field CWV. Further deployed profiling remains necessary. Reports are in .wrangler/lighthouse-home*.report.html.

## Requires authorized release / external access

- Deploy the four reviewed repositories, then re-crawl production and run Google Rich Results validation on representative Product and VideoObject URLs.
- Verify Search Console ownership, submit sitemaps, inspect indexing/video reports and monitor real-user LCP/INP/CLS.
- Confirm deployed caching, compression, external video and service-worker upgrade behavior. Local source/build checks do not certify a live release.

## Local review

Main site http://localhost:8787/ ; FPV http://localhost:8788/ ; LOS http://localhost:8789/ ; log viewer http://localhost:8790/ . Local navigation maps between these ports; production URLs remain unchanged in canonical/structured metadata.
See theme-rollout.md for source locations and restart instructions.
