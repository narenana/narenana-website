# SEO and theme audit — 22 September 2026

## Scope and limits

Compared the local redesign at http://localhost:8787/ with production at https://www.narenana.com/. Inspected live HTML, HTTP responses, metadata, structured data, robots files and sitemap inventories, plus the local rendering/router code. Sampled catalog root, FPV, trainers, electric, browse, a filtered URL and TBS Chupito product page. Checked all sitemap-listed FPV guide pages, the leaderboard, the Nanawing 2 guide, and all 11 log-viewer sitemap URLs.

Inventories: 211 main sitemap URLs, 11 log-viewer sitemap URLs (the log root overlaps the main sitemap), 12 FPV simulator URLs and 2 Nanawing 2 URLs: 235 distinct listed URLs. This is an inventory and template audit, not an individual crawl of every product. No Search Console, analytics, field Core Web Vitals, Lighthouse or Google Rich Results Test was available/run. Structured-data presence is not a guarantee of Google eligibility or indexing. Production staging and a root-level missing-page request timed out; those behaviors remain unverified.

This audit changes no application code. Nothing was pushed or deployed.

## What is already working

- Production has crawlable catalog links, category editorial content, a browse index, canonical URLs and product structured data. Keep these during redesign.
- Sampled category pages include BreadcrumbList and ItemList. The product sample has Product/AggregateOffer plus VideoObject markup for reviews.
- Filter/sort URL tested is noindex with a canonical back to the catalog root, avoiding needless indexable filter combinations.
- The nonexistent product URL returned a real 404. The apex domain redirects to www.
- All 11 log-viewer sitemap URLs returned 200 with matching canonicals, one H1 and no HTML noindex. They already have useful WebPage, SoftwareApplication, TechArticle and breadcrumb markup as appropriate.
- FPV simulator guides cover controls, aircraft, environment, hardware constraints and getting started. Their checked pages returned 200 with descriptive titles and canonicals.
- Nanawing 2 has a separate canonical, sitemap and getting-started guide.

## Production versus local redesign

| Area | Production | Local redesign | Assessment |
|---|---|---|---|
| Main title | narenana — free RC log viewer + FPV wing simulator | Nanawing — FPV flight simulator \| narenana | Better aligned with the stated priority. Keep the homepage a brand/product hub and the simulator the playable destination. |
| H1 | Free browser tools for RC pilots. | Nanawing. Fly FPV. | Clearer product identity. Supporting text should retain “free browser FPV flying-wing simulator.” |
| Discovery | Tools-focused landing | Prominent FPV, LOS launch, review, category/product links and log tool | Better product hierarchy and internal navigation. Add a few relevant guide links. |
| Video | Existing video links/content | Two prominent playable embeds | Stronger visitor experience, but new homepage embeds have no VideoObject metadata. |
| Metadata | Broad tools positioning | Visible copy updated, some schema still old | Organization/WebSite descriptions and sharing artwork need alignment. |
| HTML payload | About 64.5 KB in fetched response | About 29.9 KB in fetched response | Smaller HTML alone does not prove a faster page. New images, fonts, embeds and motion need measurement. |
| Branding | Existing design across products | Avatar-derived blue/orange homepage | Most destination pages still use their own typography and styling. |

## Recommended work, in priority order

### 1. Preserve search equity while extending the design

Keep existing product, category, guide and simulator URLs. Keep self-canonicals on distinct pages; do not canonicalize product/subdomain content to the homepage. Preserve server-rendered titles, descriptions, editorial copy, breadcrumbs, product links and structured data when replacing templates.

Avoid changing slugs merely for design consistency. Any deliberate URL move needs a corresponding permanent redirect and updated links/sitemaps.

### 2. Complete homepage metadata and video information

- Shorten the repetitive homepage description. Suggested copy: “Fly Nanawing, the free browser FPV wing simulator. Try Nanawing 2 for line-of-sight flying, compare RC wings in India, and explore flight logs.” Google can choose a different snippet; there is no guaranteed character cutoff.
- Update Organization/WebSite descriptions to include the current product family. Scope privacy claims to local log processing: site-wide “nothing ever leaves your device” is too broad for a site with analytics and YouTube embeds.
- Update the Open Graph/Twitter card image and alt text to match the current visual identity. They still reference the older tools artwork.
- Add accurate VideoObject metadata for the Giz FPV review and log-viewer walkthrough, with title, description, thumbnail, verified upload date and embed URL. Credit the reviewer visibly. Do not invent dates or other properties.
- If video search is a priority, add substantive dedicated watch pages for the review and log walkthrough, with the video as their main content, useful summary and timestamps. Homepage embeds alone do not guarantee video search eligibility. Respect ownership when adding transcripts or excerpts.
- Keep promotional artwork distinguishable from actual simulator screenshots.

### 3. Make sitemap discovery complete

The main robots.txt lists the main sitemap and the FPV simulator sitemap, but omits https://www.narenana.com/log-viewer/sitemap.xml. The log sitemap contains ten additional pages beyond the app root. Its nested robots.txt does not govern crawling for the www host.

Add the log sitemap to root robots.txt or a suitable sitemap index, and submit/verify it in Search Console. Nanawing 2 already advertises its own sitemap through its own robots.txt; ensure that property is covered in Search Console too. Its absence from the main robots.txt is not itself a blocking defect.

Review sitemap generation for temporarily out-of-stock products: the current catalog sitemap uses an in-stock condition. Useful product pages should not lose sitemap discovery simply because stock temporarily disappears. Keep their availability honest; retired or empty pages need a separate policy.

### 4. Strengthen the catalog's price-comparison proposition

Production category pages already have buying guidance; preserve and improve it rather than replace it with decorative cards.

- Put “Compare RC wing prices and stock across Indian sellers” near category headings, supported by meaningful category-specific copy.
- Show last-checked timestamps clearly, explain refresh frequency and stale-data handling, and link to a concise seller-verification methodology. Product seller rows already contain check dates; extend this clarity to the homepage/catalog summary where appropriate.
- Derive seller counts from actual active, verified sellers. The requested “dozens of verified Indian sellers” statement should have a verifiable basis.
- Add original product descriptions where absent, accurate dimensions/specifications and useful comparison context. Add manufacturer identifiers only when verified.
- Audit AggregateOffer boundaries so prices compare equivalent variants, bundles and conditions. The sampled product already has AggregateOffer; it does not need redundant replacement markup. A comparison site should not imply that it is the merchant selling the goods.
- Maintain visible out-of-stock status rather than making unavailable products look purchasable.

### 5. Reduce category payload and measure the new homepage

The sampled FPV and trainer responses each contain 184 image elements and about 166 KB of HTML, because the grid includes models outside the selected category and hides nonmatches. This is a DOM/HTML cost; it does not prove every image is downloaded.

Render the selected category's results on the server, retain crawlable pagination/browse paths, and keep client filtering as an enhancement. Verify that changing this does not break current cross-category filters.

The new homepage loads Google Fonts via CSS @import, introducing a stylesheet discovery chain. Prefer direct font stylesheet loading or properly licensed, self-hosted WOFF2 fonts with only required weights. The hero already has a WebP asset, dimensions, preload and high fetch priority; retain those practices.

Measure mobile loading and scrolling with the new hero, both video embeds and parallax active. Reduced-motion support is already implemented. If embeds dominate loading cost, consider a poster-based click-to-load player while retaining in-page playback and crawlable video metadata. Use measured results to decide.

Core Web Vitals targets at the 75th percentile are LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1. No scores were measured in this audit.

### 6. Clarify Nanawing 2 and check staging safeguards

Consider “Nanawing 2 — Free Line-of-Sight RC Simulator” for the LOS landing title. Its source includes two H1 elements, including the hangar heading; review the visible heading hierarchy and use an appropriate heading level for the hangar. Multiple H1s alone are not a demonstrated ranking penalty.

The staging router does not visibly enforce noindex itself. The live staging request timed out, so indexing exposure is unconfirmed. Verify staging response headers and add an explicit staging-only X-Robots-Tag: noindex if absent. Do not accidentally propagate it to production.

## Pages requiring the theme rollout

| Surface | Pages/templates | Recommended treatment | Implementation location |
|---|---|---|---|
| Wings catalog | /wings/, /wings/browse/, 23 category landing URLs, 184 product URLs in the current sitemap | Shared logo, blue/orange tokens, fonts, two-line product navigation, footer and cards. Retain dense readable comparison tables. | This repository: catalog/lib/public.mjs, catalog/lib/styles.mjs, grid styles and generated catalog CSS. |
| Log viewer | App, 4 search landing pages, guide index, 5 guides | Brand the app shell and editorial pages. Preserve chart contrast, monospace data and analysis interactions. | Separate app proxied through this repository; changes require its source project. |
| Nanawing FPV | Simulator landing, guide index, 9 guide articles, leaderboard | Consistent logo, colors, navigation and editorial fonts. Preserve cockpit/HUD legibility. | Separate simulator project. |
| Nanawing 2 | Landing/hangar and how-to-play guide | Shared identity, aircraft presentation, buttons and typography; retain usable simulation controls. | Separate LOS simulator project. |
| Shared assets | Favicons, Apple icon, web manifest, social cards, loading/empty/error states | Check and align with the approved avatar-derived identity. | Each deployed app plus the main site assets. |
| Private pages | Admin and statistics | Optional later visual cleanup; lower priority and not a search landing-page task. | Their existing templates. |

The current catalog still uses cream/deep-teal colors, Bricolage Grotesque and Hanken Grotesk, while the homepage uses blue/orange, Barlow Condensed and DM Sans. Its shared template means hundreds of catalog pages can be updated together. Do not copy the complete homepage stylesheet into every app: extract shared design tokens and reusable header/footer styles, then adapt each app's layout. Parallax belongs on marketing imagery, not log charts or simulator controls.

Suggested sequence: metadata/sitemap fixes → shared design tokens → catalog templates → log-viewer landing pages and guides → simulator landings/guides → optional private tools. Validate canonical URLs, structured data, keyboard navigation, responsive layouts and mobile performance after each template change.

## References

- [Google title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google snippets](https://developers.google.com/search/docs/appearance/snippet)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Video SEO](https://developers.google.com/search/docs/appearance/video)
- [Video structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Product snippets and AggregateOffer](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [Search-friendly lazy loading](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading)
- [Core Web Vitals](https://web.dev/articles/vitals)
