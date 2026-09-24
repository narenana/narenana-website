# Redesign release-readiness review — 23 September 2026

**24 September update: redesign fixes are implemented; user has authorized feature-branch pushes only. No deployment or main-branch merge is authorized. Owner reports the production FPV throttle issue is no longer reproducing; no code fix was applied. Nanawing 2 origin/main 9d5ff76 is integrated and verified in pushed feature-branch commit 62ec4a5.**

The original audit reviewed the local redesign across four repositories; its original evidence collection did not change application code or production. Subsequent fixes and owner-authorized feature-branch pushes are recorded below. Nothing was deployed, posted to social accounts, or written to a production database. Tests that mutate catalog data used the isolated local snapshot. Fetching Git remote references did not merge or change working files.

Earlier completion statements covered implementation, individual previews and selected checks. They did not establish end-to-end release readiness. In particular, the old homepage Lighthouse scores predate the newest sharing controls, the sitemap crawl does not check every link, and standalone app previews do not exercise the main-site proxy.

## Independent pre-production review — 24 September 2026

The website branch was reviewed against `master` (`c3d95f3`), with the branch running locally on a copy of production data. Five area reviewers raised 44 findings; independent reviewers then tried to refute each one, and 31 held up (many duplicates). The fixes are on branch `fix/redesign-release-review`, based on `codex/redesign-release` `4d751ed`. Owner decisions taken 24 September: public catalog surfaces stay **in-stock only**; manufacturer-sourced content stays **admin-only**; the Nanawing-first homepage title is **approved**.

| Finding | Status | Change / evidence |
|---|---|---|
| **Blocker:** homepage seller count read ~474,000 D1 rows per view (planner looped every approved sku × every ready model); not edge-cached. ~10 views/day would exhaust the 5M free read quota and fail every D1 query | Fixed | `catalog/lib/home-queries.mjs`: join order pinned `master_model → offer → sku` with CROSS JOIN. Measured on production (read-only): **1,962 rows**, same answer. The count now requires in-stock, priced, unflagged listings. Both homepage queries run in one D1 batch. The homepage is edge-cached like catalog pages (`x-home-cache`), and stale ETag/Last-Modified are dropped from the rewritten page. |
| Sitemap and `/wings/browse/` listed 222 out-of-stock models (436 vs 211 URLs) | Fixed (in-stock only) | Restored the in-stock filter in `sitemapResponse` and `browseData`, plus the original browse lede. The `SEO_MIN_URLS` floor was 450, which only the OOS-inflated sitemap could reach; it is now 150. New suite test: the sitemap and browse list exactly the grid's in-stock models. |
| Manufacturer data public on 61 product pages (section, JSON-LD `additionalProperty`, manufacturer link) | Hidden (admin-only) | `PUBLIC_MANUFACTURER_FACTS = false` in `catalog/lib/worker.mjs` (the query is skipped too). Admin is unchanged. New suite test checks published models with accepted mappings for any public manufacturer section, link or JSON-LD property. |
| Flagged listings: an in-stock page claimed OutOfStock (`fms-cessna-182-skylane`); 8 pages emitted a Product with no offers; the grid showed "—" | Fixed | Stock comes from any live listing, while flagged prices are still withheld: the headline reads "in stock · price under review". No Product is emitted without a truthful offer. Genuinely out-of-stock pages keep "last seen" + OutOfStock. Grid cards read "Price under review". New SEO regression test covers all five cases. **Data task:** 12 live listings have been flagged since 9 Aug; review them in admin to restore their prices. |
| Assets revalidated on every view (`max-age=0`); ~10–20 extra Worker requests per page | Fixed | `scripts/version-assets.mjs` stamps every `/assets/*` reference with a content hash, including CSS `url()`, module imports, and generator templates. It writes `src/asset-versions.mjs`. The Worker serves a current `?v=hash` as `max-age=31536000, immutable`; anything else gets 5 min + stale-while-revalidate. `npm run assets:version` / `assets:check`, guarded by a suite test. |
| Hero loaded the 768px image on 1280–1440px laptops | Fixed (attribute) | Corrected `sizes` on the preload and the img. A 1366×768 browser now loads the 1536px file, rendered at 1406px. A larger source for high-DPI screens is logged in `post-release-todo.md`. |
| Rollback not durable; `[skip ci]` tips; order and gates unstated; latest-router never deployed | Fixed (runbook + code) | `release-runbook.md`: merge-commit rule, push freeze, build-success gates, log viewer before website, `git revert -m 1` rollback, and a latest-router step. Code: the main Worker marks its `*.workers.dev` host noindex, which is what latest.narenana.com forwards to (new SEO test). The `/index.html` 301 is now relative. |

Tests on the fix branch against the local worker: catalog **60/60** (including the mutating lifecycle test), SEO **14/14**, `assets:check` clean. Remaining low-priority findings are tracked in [post-release-todo.md](post-release-todo.md).

## Fix log — 24 September 2026

Initial preflight found Nanawing 2 production at 288838c, newer than the family branch baseline. Integrated that revision and main 1bef30a (including flight sound) in 0ea86e3. The final owner-requested origin refresh incorporates main 9d5ff76 in 62ec4a5: 201 unit tests, typecheck, stable double build f25ce9118daf90f0dd6d (87 assets), and all nine Chromium audio/radio/offline checks pass. Do not release the old 381df71 build. Existing production health passed nine read-only checks; rollback metadata is recorded in the release runbook.

**Sitemap follow-up:** all four maps checked against indexable source pages and robots.txt, with valid XML. Main website/Wings: 436 URLs; Nanawing: 12; Nanawing 2: 2; log viewer: 11; 460 unique URLs across the property. Log-viewer build-day lastmod removed; product lastmod remains tied to real model edits. New `npm run sitemap:audit` checks canonical coverage, duplicates, host/path scope, discovery and modification dates, and is required by `seo:audit`. Evidence: [sitemap-readiness.json](sitemap-readiness.json). Rebuilt the log viewer and confirmed stable repeated sitemap generation. No sitemap submission or deployment; the later feature-branch push includes these changes.

All four feature branches have been pushed: website codex/redesign-release; FPV, Nanawing 2 and log viewer codex/site-theme-seo. No main merge, pull request or deployment was performed by this task. Historical findings below remain as the original checklist; this table tracks closure.

| Item | Status | Change / evidence |
|---|---|---|
| Upstream integration | Verified against fetched refs | Website preserved in f89607e, search merged in 174ac7d. FPV saved-radio handoff merged in f41cbfb. Catalog 55/55, FPV 814/814 plus production build. Nanawing 2 now integrates main 9d5ff76 in 62ec4a5; 201 unit cases, stable double build and nine audio/radio/offline browser cases pass. |
| Share/filter overlap | Verified for catalog | At 390px: Trainer → Show 22 closes the sheet, Share stays closed, focus returns to fx-open. Escape returns Share focus. Versioned imports/CSS resolve the reproduced warm-cache failure. Simulator cockpit hides marketing Share. |
| Duplicate proxy Share | Verified | Actual local Worker → log app: one launcher, one dialog, zero legacy buttons. New app also suppresses the previous Worker's injected widget during a staggered release; app and guide verified through a legacy-injection fixture (log commit 74cf4ca). |
| Log replay Share placement | Verified | Actual proxy at 390px: one visible header Share during sample replay, no timeline overlap, clean public canonical URL, Escape returns header focus. Welcome floating Share remains available. |
| Prices | Verified | Headline/schema use one comparable-offer selector; grid SQL excludes flagged/nonpositive values and prefers new singles. New regressions cover flagged/invalid/used/pack/unknown/OOS/dead combinations. |
| Manufacturer corrections | Verified unit/API contract | Public physical facts consult overrides for current accepted source only, including null clears; inferred handling stays private. Admin copy explains public scope. SEO suite 12/12. |
| Cache/update | Verified | Stable assets revalidate; version chain and production cache key bumped. FPV update probe 8/8. Final Nanawing 2 offline cases 4/4; repeated build identity f25ce9118daf90f0dd6d. Log Workbox incorrectly assigned revision:null to unhashed family files: fixed and guarded by postbuild verification. Existing cached browser upgraded without clearing data. |
| Broken links | Verified | 460 source pages, 489 destinations, zero broken links. Link audit now exits nonzero on failure. |
| Admin mobile/labels | Verified locally | Catalog fits 390px with 201 labelled inputs; Sources has no unlabelled inputs or horizontal overflow. Real typing saved a disposable local draft, visible save feedback appeared and reload retained it. Added stale-form version rejection (409); suite covers auth, source validation and approve/publish/unpublish lifecycle. Stats fixture verifies gated fail-soft layout; missing analytics render unavailable, not invented zero counts. |
| Accessibility/SEO | Verified representative templates | Homepage, catalog, product and watch pages score 100 accessibility / 100 SEO in rendered Lighthouse checks. Corrected navigation semantics, contrast, heading order, visible-name matching and initialized share links. Automated checks do not certify all assistive technology. |
| Performance | Improved; field gate remains | Catalog mobile performance 95 then 92 (LCP 2.4s / 3.3s); homepage 91, LCP 3.1s, CLS 0. Local results vary under software-rendered browser load; these do not establish field CWV or guarantee LCP below 2.5s. See final evidence below. |
| Dependencies | Triaged; scoped exception | Nanawing runtime zero, Nanawing 2 full audit zero, log runtime zero. Website retains extract-zip installer-chain advisories absent from Worker bundle; log desktop packaging advisories are outside this web release. Details and restrictions in release-dependencies.md. |
| Copy/design | Closed locally | Standard product names, no stale subscriber count, checked-price language, descriptive package names, page-specific watch social cards, one catalog footer. Rejected Direction B removed from production files. |
| Generator/audit gates | Verified | Editorial generator preserves social tags. Sitemap audit fails on errors/empty or shrunken inventory; required link gate passes 460 pages / 489 destinations. |
| Physical transmitter | Owner reports working; monitor | Owner confirmed flight with the radio, then reported a stuck throttle on sim.narenana.com, and subsequently said the issue seems resolved for now. No throttle code fix was applied and the cause is unconfirmed. Earlier local evidence: e502:bbab detected, roll capture and saved Mode 2 profile observed; disconnect paused flight and exposed keyboard fallback. Full endpoint/reconnect/reload acceptance and physical Nanawing 2 transfer are not certified by this check. |
| Video playback | Verified in Chrome | Click-to-play review reached 40 seconds; log walkthrough reached 1:35. Posters remain visible before play; ordinary YouTube fallback works without JavaScript. In-app browser still limits embedded content; actual phone/Safari checks remain separate. |
| Live-service preflight | Existing service passes | Nine read-only production checks passed. Candidate-only social unfurls, analytics/cron health and search indexing remain authorized-release steps. |

## Local release revisions and remaining acceptance

- Website: codex/redesign-release; implementation commit is the commit containing this updated checklist (resolve with git log). Prior integration 174ac7d.
- Nanawing: codex/site-theme-seo, pushed **c60e87a** (runtime 7624cb0); 814 tests, build, offline update probe 8/8.
- Nanawing 2: codex/site-theme-seo, pushed **62ec4a5**; incorporates origin/main **9d5ff76**. Typecheck, 201 unit tests and headless/provenance/binary checks passed. Two identical builds: **f25ce9118daf90f0dd6d**, 87 verified assets. All nine Chromium audio/radio/offline browser cases passed. See its family-origin-refresh-2026-09-24.md record; refetch origin before any future deployment.
- Log viewer: codex/site-theme-seo, pushed **a79165d**, runtime **74cf4ca** (legacy proxy compatibility, following sitemap revision 649347d); build, 44 tests, generated cache-revision gate, mobile proxy sharing/replay verified.
- Website catalog 55/55 and SEO 12/12 pass; Worker dry-run succeeds without upload. Full metadata/link crawl is recorded in seo-local-crawl.json and release-link-audit.json.

Remaining gates are **not silently marked fixed**:

0. **Throttle monitoring:** owner reports the live issue is resolved for now. No software fix or confirmed cause; reopen if it recurs. Nanawing 2 latest-origin integration and validation are complete; refetch before a future release.

1. Actual phone/browser acceptance: native share/cancel and video playback. Basic physical transmitter acceptance is recorded above; automated profile reload/transfer checks are separate evidence. A phone is not connected to this browser session, so those hardware cases remain unverified.
2. Production-only services: actual analytics bindings, live admin/cron/queue behavior, final social unfurls, Search Console/Rich Results and field CWV. These require a separately authorized release; none was requested or attempted.
3. Scoped dependency exception documented in [release-dependencies.md](release-dependencies.md). The affected archive installer is not shipped in the website Worker; a future desktop installer release is separate.
4. Performance: final homepage mobile cold/warm **91/90** (LCP **3.4s/2.1s**, TBT **0ms/310ms**); catalog **92/100** (LCP **3.2s/1.2s**, TBT **0ms/0ms**). Accessibility/SEO **100/100** in all four runs. Click-to-play video posters remove initial third-party player work; distant homepage sections defer layout/paint with reserved scroll space. Cold LCP remains above 2.5s, so real-device/field performance remains a limitation rather than a certified pass.
5. Both homepage players verified in Chrome after the lightweight poster change: Giz FPV review at 0:40, log walkthrough at 1:35. Actual phone/Safari playback remains part of device acceptance.

Final reports: `.wrangler/deferred-layout-measured-home-{cold,warm}.json` and `.wrangler/inline-video-measured-catalog-{cold,warm}.json`. Desktop leaderboard anchor rendering checked after the layout change. Chrome playback verified after the poster change. Windows temporary-profile cleanup reported EPERM after complete reports were written; failed/interstitial runs are not counted. Full sitemap/link crawl remains 460 pages / 489 destinations / zero issues.

No product-direction decision is currently blocking local implementation. Deployment coordination and rollback are prepared in [release-runbook.md](release-runbook.md). Keep the original findings below as historical evidence, not the current status.

## Original audit — must resolve before release

| Priority | Finding and evidence | Completion criterion |
|---|---|---|
| P1 | **Integrate current upstream changes.** The website checkout is on master with substantial uncommitted redesign work and is one commit behind origin/master: c3d95f3 adds catalog search. The FPV theme branch has two local commits but is three upstream commits behind, including 07b47da/dabbc2b for saved-radio handoff. | Preserve the local work on a release branch, integrate catalog search and radio handoff, review conflicts and rerun the full checks. Do not deploy old theme builds over those features. Record release SHAs for all four repositories. |
| P1 | **Share obscures the mobile filter action.** At 390px, the persistent Share pill overlaps the catalog's “Show 22 models” button. Clicking that results button opened the Share dialog while the filter backdrop remained open. | Hide/reposition the floating pill while another modal/sheet is active. Verify apply, clear, Escape, focus return and keyboard traversal. Test the same overlay against simulator controls and log playback controls. |
| P1 | **Two overlapping share widgets on the real log-viewer route.** Through a second local Worker configured to forward `/log-viewer/` to the new local app, both `#nn-shr-btn` and `#nn-share-launcher` render. The old widget has z-index 2147483000 and covers the new button. | Remove or conditionally suppress the old Worker injection; exactly one sharing implementation must appear on the app and every proxied guide. Verify public canonical links through the proxy, not only localhost:8790. Source: `src/index.js:415` and `site/assets/family/share.js`. |
| P1 | **Visible prices and structured prices disagree for flagged offers.** An isolated renderer case with a flagged ₹1 listing and a valid ₹1,000 listing displays “from ₹1”, while Product JSON-LD correctly advertises ₹1,000. The new SEO filtering does not govern the visible headline. | Use the same eligible-offer rule for visible headline, cards and structured data, preserving clearly labelled historical/under-review rows. Add regressions for flagged, invalid, used, multi-pack, unknown-config and entirely unavailable offers. Source: `catalog/lib/public.mjs:293` and `:340`. |
| P1 | **New public manufacturer details bypass saved corrections.** The public route reads raw `mfr_product` data and calls `manufacturerReference`; the admin Aircraft data route separately merges `mfr_profile.overrides_json`. Accepted identity is not the same as an approved fact, and explicit corrected/cleared values are not consulted publicly. | Define the public fact approval contract; respect applicable saved overrides, including explicit clears and source-product identity. Verify public copy and JSON-LD after a correction and a remap. Source: `catalog/lib/worker.mjs:195`, `:1109`, `catalog/lib/product-overview.mjs:6`. |
| P1 | **Mutable shared files have long cache lifetimes.** The log-viewer `_headers` assigns one-year immutable caching to `/assets/*`, including the newly copied, unhashed family CSS/JS/fonts. The main Worker also caches unversioned family assets for a day plus a week of stale reuse. Only the entry script has a query version; its imports do not. Earlier browser checks already encountered old preview shells. | Hash/version all changing dependencies or give the family directory a revalidation policy. Verify a returning visitor upgrading from the previous release, including service-worker update/rollback and offline reload. Source: log-viewer `public/_headers:9`, main `src/index.js:169`. |
| P2 | **Five broken internal destinations.** A separate link crawl examined 479 unique internal destinations from 460 sitemap pages and found five 404s. Four are log-guide URLs; one is the generated nitro-glider sibling category. | Correct source content and regenerate guides. Do not offer empty/nonexistent sibling category destinations; provide a valid fallback or unavailable state. Re-run the link audit to zero broken public destinations. See the exact list below. |
| P2 | **Admin theme/responsiveness is incomplete.** Catalog editing at 390px has a 549px document width and clipped controls. Sources has a 468px width and default blue links on charcoal. Catalog inputs have visible captions but lack associated accessible labels (201 unlabelled input elements in the displayed DOM). Aircraft data is better adapted but is not proof that the other admin tabs are ready. | Responsive catalog form columns, scroll-contained tables, readable link colours and associated field labels. Validate successful save feedback, errors, stale edits, mapping/rejection, publishing and tab navigation on desktop and mobile. Source: `catalog/lib/admin-ui.mjs:22`. |
| P2 | **Accessibility and rendered SEO regressions remain.** Fresh catalog mobile Lighthouse: accessibility 89, SEO 92. Power navigation uses `role=tablist` with ordinary anchor children, several counts/links fail contrast, and the new share dialog creates anchors without href until opened. The latter causes the crawlable-anchor audit failure. | Use appropriate navigation semantics; fix contrast; initialize share URLs before exposing anchors or use buttons appropriately. Check the rendered app, not just server HTML. Re-run Lighthouse and keyboard checks across representative templates. |
| Gate | **Performance is not signed off.** Current catalog mobile lab score is 63, LCP 4.0s, CLS 0.036. Earlier homepage runs ranged from 60 to 84 after optimization, with one LCP of 7.8s. | Establish repeatable cold/warm mobile measurements on the final build. Investigate image delivery, font/render delay, long catalog DOM and third-party embeds. Treat field CWV as post-release measurement, not something a local Lighthouse run can certify. |
| Gate | **Dependency advisories need triage.** `npm audit --omit=dev` reports website 4 high, Nanawing 2 1 high, log viewer 6 high/4 moderate/1 low, FPV 0. These are affected-package counts, not distinct exploited vulnerabilities. Some nominal runtime dependencies are build tooling. | Trace runtime/build exposure, apply compatible fixes and retest; record exceptions with a reason. Do not blindly run `npm audit fix --force`: the website audit proposes a major/downgrade change to Cloudflare Puppeteer. See release-review-evidence.json for packages and advisory links. |

These include both new integration defects and pre-existing issues revealed by reviewing the full release surface. Not every issue was introduced by the visual redesign, but none should be mistaken for a passed release check.

## Broken links

| Destination returning 404 | Source | Intended correction |
|---|---|---|
| `/log-viewer/guides/open-bbl-file/` | Betaflight use-case page | `/log-viewer/open-bbl-file/` |
| `/log-viewer/how-to-read-a-blackbox-log/` | iNAV use-case page | `/log-viewer/guides/how-to-read-a-blackbox-log/` |
| `/log-viewer/analyze-a-crash-log/` | iNAV use-case page | `/log-viewer/guides/analyze-a-crash-log/` |
| `/log-viewer/enable-blackbox-inav/` | iNAV use-case page | `/log-viewer/guides/enable-blackbox-inav/` |
| `/wings/nitro-gliders/` | Electric gliders power selector | Only link to a supported populated category, or show a deliberate empty state. |

Evidence: `release-link-audit.json`. Local built servers correctly return 404; a host's SPA fallback could instead mask some of these as misleading 200 pages.

## Design and copy finish

- Keep approved Direction A. No further homepage redesign is needed before fixing these release issues.
- The main hero badges requested for removal are absent. The review remains prominent, both audiences have clear routes, and the catalog/contact destinations are present.
- Standardize the primary product as **Nanawing — FPV simulator** and the second as **Nanawing 2 — line-of-sight simulator**. The LOS page still calls the first product “Nanawing 1”, and its social title says generic “RC Plane Simulator”.
- Remove the hard-coded “22.4k subscribers” from FPV review copy or deliberately date it; it will go stale. Keep reviewer credit and the playable review.
- Prefer “latest checked prices/stock” over an unconditional “live” claim. The local snapshot currently supplies 12 sellers, so “dozens of verified sellers” is not substantiated by that evidence. The methodology page already explains the limits correctly.
- Product introductions are accurate fallbacks but still read mechanically (e.g. “Compare pnp listings”). Expand KIT/PNP/RTF and improve introductions for the highest-traffic products/categories. Do not fabricate specifications. This editorial enrichment can continue after release once correctness is fixed.
- Watch pages currently reuse the Nanawing-wide OG artwork, including the log walkthrough. Page-specific video/log thumbnails would improve social previews; actual platform rendering must be checked after an authorized deployment.
- Reconcile secondary visual details: old review/card treatments, two catalog footers, application icons and dark admin link states. Preserve legible dark cockpit/log surfaces where appropriate rather than forcing the light marketing layout into controls.
- Remove the rejected Direction B files/generator from the production artifact, or explicitly retain them only in a non-production preview. Noindex alone is not artifact cleanup.

## Verification performed in this review

| Area | Result | Limit |
|---|---|---|
| Catalog suite | **54/54 passed**, including local approve → draft → publish → public → unapprove lifecycle | Does not cover every browser admin save or responsive layout; fixture remains local. |
| SEO regression | **10/10 passed** | Covers selected contracts, not Google rich-result eligibility or all rendered DOM states. |
| Local sitemap inventory | **460/460 successful pages**, expected canonical/title/description/one H1, parsed JSON-LD and OG fields | Not an internal-link, image, accessibility or indexing audit. |
| Internal links | **479 destinations checked, 5 failures** | External sellers/social platforms were not exhaustively crawled. |
| Nanawing tests | **810/810 passed** on the theme branch | Must rerun after incorporating the three new upstream commits. |
| Nanawing 2 | Typecheck, headless/provenance/binary checks and **153/153 unit tests passed** | Cross-browser and offline update gates have not been certified for this release candidate. |
| Log viewer | **44/44 passed** | Does not catch the duplicate share widget injected by the website Worker. |
| Worker bundle | Wrangler **dry-run passed**, no upload | Does not prove live bindings, cron or edge caching. |
| Browser review | Desktop/mobile public pages, authenticated Catalog/Aircraft data/Sources, share proxy integration and filters inspected | Sources and Catalog have confirmed mobile problems. |
| Catalog filtering | Trainer selection renders **22 cards** | Applying the sheet triggers Share because of overlap; interaction is not a pass. |
| Admin protection | Anonymous `/admin` and `/api/review` return **401**; suite covers auth/CSRF guards | This is not a penetration-test certification. |
| Stats dashboard | `/stats` returns **503** locally; `/stats.html` redirects to gated route | Local stats credentials/live service bindings are not configured; dashboard data and charts remain unverified. |
| Genuine missing page | **404** | Each deployed app's fallback route still needs release smoke coverage. |
| Review playback | Previously verified in Chrome, advancing to 15s of 28:12 | iOS/Safari and privacy-restricted browsers still need the fallback/player checks. |

The audit script itself needs a release-gate fix: it can print `urls: 0, issues: []` and exit successfully when sitemap requests fail. This happened at the start while local servers were stopped; servers were restored and the actual 460-page run above completed. Make sitemap fetch errors, unexpected inventory shrinkage, page failures and broken links produce a nonzero exit. Keep generated metadata changes in their source generators: the main editorial generator does not yet preserve every social field added directly to generated pages.

## Required final test matrix

1. **Public navigation:** desktop, 390px and tablet; menu open/close/Escape; homepage → sim → guides → catalog/product → log viewer; no horizontal overflow or obstructed CTAs.
2. **Catalog search and filters:** latest upstream search, role/power/size/condition, sorting, combined filters, zero results, reset, URL refresh/back, valid category siblings and product links.
3. **Catalog data:** flagged and missing prices; no-stock/all-gone offers; new versus pre-owned; pack/config comparison; image fallback; accepted manufacturer source, correction, explicit clear and remap; matching visible facts/schema.
4. **Admin:** approve/reject, publish/unpublish, edit blurb/specs, source validation, manufacturer accept/reject/remap and Aircraft data save; stale edit/error feedback; paused/running state indicators without accidentally triggering production jobs. Verify keyboard labels and phone layout.
5. **Sharing:** one widget per route; clean canonical URL; native success/cancel/unsupported; clipboard denial fallback; modal focus/Escape; no filter/playback/HUD interception; social cards on product, video, guide and app pages.
6. **Simulators:** launch/reset/aircraft change, keyboard and physical radio; saved-radio transfer after upstream integration; real leaderboard loading and unavailable state; dialog/game keyboard interaction.
7. **Offline/update:** first load → offline boot → launch; old release → new release; failed/corrupt update and rollback; same-origin fonts/styles remain available. Nanawing 2's documented `verify:offline` gate is required before deployment.
8. **Log viewer:** fixed-wing sample and real EdgeTX/ELRS/iNAV/Betaflight files; parse errors, multi-flight selection, replay/scrub/charts, dark/light mode, `/log-viewer/` proxy paths, service-worker scope and update. Confirm sharing never uploads logs.
9. **Browser coverage:** current Chrome/Edge plus Firefox, Safari and iOS; keyboard-only, reduced motion, zoom and slow-network/error states. Current Chromium observations are not cross-browser sign-off.
10. **Performance:** final homepage/catalog/product/watch/guide builds, cold and warm runs; stabilize LCP and image loading. Use field monitoring after release for INP and real-user percentiles.

## Release preparation and post-release checks

Before asking for production approval: resolve the findings, integrate upstream code, commit the website on a release branch, lock the four release SHAs/builds, remove preview-only artifacts, document deployment order and rollback, and rerun the tests against those exact builds. Validate the website Worker and log viewer together; their routing and share changes are coupled. Existing production data must not be overwritten by the local test snapshot. No redesign-specific schema migration is presently proposed.

After an explicitly authorized deployment: smoke-test production routes, redirects, real 404s, bindings, feeds, leaderboard, image proxy and admin gates; verify cron/queue health read-only; check new-user and returning-user caches. Check social unfurls and Google's Rich Results Test on representative Product/VideoObject pages. Verify Search Console ownership, submit the sitemaps and monitor coverage/video indexing and field CWV. Sitemap submission does not replace URL inspection, and a valid JSON object does not guarantee a rich result.

Reference thresholds: Google's [Web Vitals guidance](https://web.dev/articles/vitals) uses LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 at the 75th percentile. Product eligibility must follow [Google's Product snippet requirements](https://developers.google.com/search/docs/appearance/structured-data/product-snippet), not just a JSON parse check.

Raw evidence: `release-review-evidence.json`, `release-link-audit.json`, `seo-local-crawl.json`; local logs/reports under `.wrangler/release-*`. Historical implementation notes remain in `seo-completion.md` and should be read alongside this newer release review.
