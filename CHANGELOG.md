# Changelog

## 2026-07 — Catalog UX, SEO, image durability, and the manufacturer-content system

A large session. Grouped by area; commit hashes in parentheses. Deeper design lives in
`docs/` (`ARCHITECTURE-catalog.md`, `mfr-content-architecture.md`, `PRD-wings.md`).

### Catalog UX
- **Faceted filter grid is now the default `/wings/` experience** (classic grid still at
  `?ui=classic`). Electric/Nitro storefronts, multi-select role/size/condition chips, guided
  navigation, clean landing URLs. Fully isolated in `catalog/lib/grid-next.mjs`; `catalog.css`
  is untouched. (3dd3510, 861bbb2, fba398c)
- **Product pages**: removed the "suggested components" section (too often wrong) and added
  **"Similar models"** — same category, in-stock, sharing a role tag. (b150898)

### SEO
- **23 landing pages** at flat combo slugs (`/wings/electric-warbirds/`, `/wings/fpv/`,
  `/wings/nitro/`, …): proper H1, breadcrumbs + `BreadcrumbList` schema, a pre-filtered grid,
  and long-form buying-guide copy stored in `landing_page`. (eca05c8, 17ca4b7)
- **`/sitemap.xml`** generated live from D1 — **in-stock products only** + the 23 landings +
  hubs + homepage + `/log-viewer/`. Regenerates on every request from stock. (17ca4b7, 5c1ef91)
- **`/wings/browse/` HTML sitemap hub** — every in-stock model grouped by type + all landing
  pages, footer-linked site-wide. Fixes orphaned product pages (the grid only renders
  electric/in-stock in HTML). In-stock only. (6b5a194, 9c978fd)
- **`robots.txt`** covers all surfaces (site, `/log-viewer/`, `/wings/`), disallows
  `/admin` + `/api/`. (0505654)
- **Google Search Console** (operational): sitemap confirmed submitted (434 URLs → now
  in-stock); 8 top landing pages request-indexed (Google's manual quota ≈10/day). Property is
  a verified Domain property.
- **IndexNow** (aa0e0f5): the worker auto-submits changed in-stock URLs to Bing / Yandex /
  Seznam on the **hourly cron** (off the `*/15` pipeline tick). Ownership key at
  `/<key>.txt`; changed-only via an `updated_at` cursor; 191 URLs bulk-submitted at launch.
  New pages reach Bing within the hour — no manual Bing submission, ever.

### Image durability (`docs`: image proxy is R2-backed)
- The `/img` proxy caches each fetched image into **R2** on first view; added a **proactive
  warm slice** to the cron that backs images up *before* they're viewed (and before a seller
  goes down), tracked in an `image_cache` ledger. (3023dcb)
- **Local-machine residential pull tool** for sellers whose WAF blocks datacenter fetches
  (e.g. anubisrc). (5ca5480)
- Wix CDN (`static.wixstatic.com`) added to the image host allowlist. (4c0780f)

### Admin
- **Duplicates tab** now floats **both-in-stock pairs to the top** — the only merges that
  change what a shopper sees — with a per-pair badge and a boundary divider so the cosmetic
  (one-side-out-of-stock) tail is easy to skip. (ff836e1)

### Manufacturer content & audit system — NEW (`docs/mfr-content-architecture.md`)
A system that pulls authoritative content + specs from **manufacturers' own product pages**
to (a) enrich thin product pages and (b) audit our catalog (right brand→model mapping,
accurate wingspan). Matching a model to its manufacturer product **is** the audit — agreement
validates, disagreement flags. **Admin-only; zero consumer UI until content is reviewed.**
- **Schema** `0013_mfr.sql` (applied to prod): `manufacturer` / `mfr_product` / `mfr_match`.
- **Pure matcher** `catalog/lib/mfr-match.mjs`: aircraft filter (strong PNP/RTF/BNF/ARF signal
  wins; part-words exclude), wingspan extraction, **containment** name-scoring (our short name
  ⊆ their padded title) + a **wingspan tiebreak** that turns spec disagreement into an audit
  flag. (bfc99e2)
- **Per-domain strategy registry** `catalog/lib/mfr-strategies.mjs` — `fetchStrategy(domain)`
  dispatches by `via`: `shopify` (`/products.json`), `jsonld` (sitemap → schema.org Product),
  and `html` (dedicated parsers). Add a manufacturer = add one entry. (8f743c6, 9faa0b2)
- **6 reverse-engineered HTML parsers** in `catalog/lib/mfr-domains/` (Seagull's drives the
  site's ASP.NET AJAX RPC; RC-Factory, Multiplex, Pilot-RC, Kyosho, XFly), wired via
  `catalog/lib/mfr-html.mjs`. (9faa0b2)
- **Admin verify screen + API** (`mfr-matches` review queue, `mfr-decide` accept/reject) —
  side-by-side, wingspan compare, description preview. Accepting only marks *eligibility*;
  renders nothing on the consumer site. (bfc99e2)
- **Production-safe harvesting + SKU picker** (2026-07-24): additive `0014_mfr_harvest.sql`
  migration, weekly queue-sliced refresh, non-destructive product
  upserts, five ranked candidates per model, one-to-one automatic recommendations, and an
  admin selector for mapping the exact manufacturer SKU. Human decisions survive every
  harvest/rebuild. The production candidate set was rebuilt and all automatic many-to-one
  mappings were removed.
- **Weekly manufacturer trigger** (2026-07-24): one Sunday 03:07 UTC cron fans out bounded
  Cloudflare Queue jobs, keeping heavy official-site crawls inside Worker request limits.
  Admin can rematch newly added models immediately or manually queue an early harvest.
- **Loaded to prod**: 12 manufacturers, 1,139 products, **131 matches — 73 accept / 37 review /
  21 reject** (Seagull 24, Volantex 11, RC-Factory 10, HEEWING 7, ATOMRC 6, Freewing 6,
  Multiplex 5, Kyosho 2, SIG 1, XFly 1).
- **Audit already found real problems**: Mobula mis-tagged as ATOMRC (it's a Happymodel
  drone); a P-51D wingspan of 750 mm vs the manufacturer's 500 mm; 19 wingspan conflicts;
  Dynam/Extreme Flight models with garbage/mis-branded names.
- **Not yet done** (deferred): browser-render for the ~42 Cloudflare-protected models
  (FMS, Flite Test, …); the content **render** on product pages — gated on two decisions (description
  rewrite-vs-link for copyright/duplicate-content; wingspan auto-correct-vs-flag).

### Popularity signal
- YouTube-led model-popularity metric feeding default-sort + content prioritization, with an
  admin preview tab; the daily YouTube quota bursts with a 24-hour rolling reset. (7f5c702,
  4bc5338, 0d53c36)

### Decisions / parked
- The **Nanawing FPV simulator stays independent** on `sim.narenana.com`. A `narenana.com/sim`
  subpath migration was built on branch `feat/sim-subpath` but deliberately **not merged**.
