# PRD — narenana Wings (`narenana.com/wings/`)

*Status: draft v1 · Owner: narenana · Last updated: 2026-07-17*

> India's flying-wing buying guide: every wing kit sold in India, live prices,
> honest buy links — and for each kit, the exact motor/ESC/FC/battery combo for
> a good, fast, or endurance build.

## Problem statement

Indian pilots who want to get into fixed-wing FPV can't answer two basic
questions without hours of research or asking someone: **"which wing kits can I
actually buy in India, and at what price?"** and **"what components turn that
kit into a working build?"** The channel owner fields these same enquiries
repeatedly on YouTube and WhatsApp — evidence of unmet, recurring demand.
Vendors' own catalogues are scattered, poorly searchable, and price-volatile;
global build guides recommend components that aren't purchasable in India.
Not solving it costs the channel repeated 1:1 answering time and loses the
audience to guesswork purchases that stall their entry into the hobby.

## Goals

1. **Deflect enquiries:** the channel owner can answer any "which wing / what
   parts" question with a single `/wings/` link (target: it becomes the pinned
   answer in video descriptions and replies within 30 days of launch).
2. **Own the search intent:** rank on page 1 for "flying wing kit India",
   "<kit name> India price" queries within 90 days (measured in GSC).
3. **Trustworthy freshness:** ≥90% of displayed prices are ≤48h old in steady
   state; a stale price is always visibly dated, never silently wrong.
4. **Kickstart the funnel:** ≥20% of `/wings/` visitors click through to a
   vendor or another narenana tool (log viewer / Nanawing) per GA4.
5. **Earn its keep:** affiliate revenue covers the tool's running cost within
   two quarters (modest bar — infra is ~free on Cloudflare).

## Non-goals (v1)

- **Not a marketplace/checkout** — we link out; vendors own the transaction.
  (Payments, returns, inventory = their problem; trust + speed = ours.)
- **Not covering quads or multirotor kits** — the log viewer/Nanawing audience
  is fixed-wing; wings-only keeps curation quality high. (All-fixed-wing is P2.)
- **No user accounts, reviews, or comments** — roadmap principle: no
  moderation surface; curation is the owner's editorial voice.
- **No international-vendor price comparison** (Banggood/AliExpress import
  math, customs) — huge scope; v1 flags "not sold in India" gaps instead (P1
  shows import routes editorially).
- **No stock-level tracking promises** — we surface in-stock/out-of-stock
  as-scraped with timestamps, but no alerting in v1 (price-drop/stock alerts
  are P2, tied to the roadmap's newsletter).

## User stories

- As a **new fixed-wing pilot in India**, I want to see every wing kit I can
  buy domestically with current prices, so that I can pick one without
  cross-checking five shop sites.
- As a **budget-conscious builder**, I want each kit's full build recipe
  (motor, ESC, FC, battery, servos) with Indian buy links and a total cost, so
  that I know the real all-in price before committing.
- As a **pilot chasing a specific style**, I want "good / fast / endurance"
  recipe variants per kit, so that the build matches how I fly.
- As a **channel viewer**, I want the link from a YouTube reply to land on the
  exact kit being discussed, so that I get my answer in one click.
- As the **site owner**, I want price updates to run themselves and fail
  visibly-but-gracefully, so that maintenance doesn't fall on me weekly.
- As a **returning visitor**, I want to see what changed (new kits, price
  drops), so that checking back is worth it.
- Edge: as a **visitor on a dead listing**, I see the kit marked "listing
  unavailable — last seen ₹X on <date>" with alternates, not a broken link.

## Requirements

### P0 — must-have

| # | Requirement | Acceptance criteria |
|---|---|---|
| 1 | **Kit catalogue** — every flying-wing kit purchasable in India, from a curated JSON source of truth (`catalog/*.json` in repo) | Given the catalogue, when the site builds, then every kit renders a card (name, brand, wingspan, kit type PNP/KIT/ARF, price, vendor, verified buy link) and no entry ships with an unverified link |
| 2 | **Automated price refresh** — Cloudflare Worker cron scrapes each vendor listing on a schedule (per-vendor adapter modules) and writes `{price, inStock, checkedAt}` to KV; frontend reads a merged prices JSON | Given a vendor page that changed price, when the cron runs (daily), then the site shows the new price within 24h; given a scrape failure, then the last-known price renders with "as of <date>" and the kit is flagged in an ops log — never blank, never silently stale |
| 3 | **Build recipes** — each kit carries 1–3 curated recipes (good-allround / fast / endurance): motor, ESC, FC, battery, servos, each with an Indian buy link + INR price, and a computed "complete build ≈ ₹X" total | Given a kit page, when a visitor selects a recipe tab, then every component lists a working Indian link and the total updates; recipes are editorial (owner-authored), stored in the same JSON |
| 4 | **Per-kit SEO pages** — `/wings/<kit-slug>/` static pages with unique title/description, `Product` + `Offer` JSON-LD (price, availability, INR), OG card | Given any kit URL, when crawled, then it returns prerendered HTML (no client-only content) passing Rich Results test for Product |
| 5 | **Affiliate links** — where a program exists (Amazon Associates India at minimum), links carry the tag; disclosed | Given an affiliate-capable vendor, when a buy link renders, then it includes the tag and the page footer carries a one-line disclosure |
| 6 | **Filters/sort on the index** — price band, wingspan, kit completeness (PNP/KIT), in-stock | Given the index, when a filter is applied, then results update client-side instantly (no server round-trip) |
| 7 | **Umbrella integration** — routed at `narenana.com/wings/` via the existing worker path-prefix pattern; sitemap + tool card on the landing page | Given the deployed tool, when visiting narenana.com, then the tool grid shows a Wings card, and `/wings/*` serves through the canonical host |

### P1 — nice-to-have (fast follows)

- **Import-gap section**: kits the community wants that no Indian vendor
  stocks ("not sold in India — closest alternative / how people import").
- **Price history sparkline** per kit (KV already accumulates daily points).
- **"What changed" strip**: new kits + price drops on the index page.
- **Community contributions**: CONTRIBUTING.md + JSON schema so viewers can PR
  new kits/vendors; owner reviews (fits curated-only principle).
- **WhatsApp-friendly share cards** per kit (the enquiry channel is WhatsApp).

### P2 — future considerations (design for, don't build)

- Expand to all fixed-wing (trainers/gliders) — schema already has
  `airframeType`, so this is data-only.
- Price-drop / restock email alerts via the roadmap's newsletter provider.
- Saved builds / shareable build permalinks (`narenana.com/p/<id>` pattern
  from the roadmap).
- Cross-tool integration: "see this wing flown" → log viewer shared logs,
  Nanawing sim preset per kit.

## Data & scraping policy (engineering)

- **Source of truth:** curated JSON in-repo (kit identity, recipes, links).
  Scraper only ever updates *price/stock*, never creates kits.
- **Per-vendor adapters** with CSS/JSON selectors; respect robots.txt; ≤1
  req/product/day at jittered hours with a honest UA; hard-fail one vendor
  without affecting others.
- **Fragility containment:** adapter failure ⇒ stale-date display + entry in
  an ops JSON the owner can check; 3 consecutive failures ⇒ surfaced on a
  private status page. No scraping at request time — only cron → KV.
- Amazon.in prices come from the Associates API if enrolled (ToS-safe), not
  scraping.

## Success metrics

| Type | Metric | Target | Measured via |
|---|---|---|---|
| Leading | `/wings/` sessions from YouTube referrals | 500/mo by day 30 | GA4 |
| Leading | Vendor-link CTR | ≥20% of sessions | GA4 outbound events |
| Leading | Price freshness | ≥90% ≤48h | ops JSON |
| Lagging | Page-1 rankings for 5 target queries | day 90 | GSC |
| Lagging | Owner-reported enquiry deflection | "most enquiries answered with a link" | qualitative |
| Lagging | Affiliate revenue ≥ infra cost | quarter 2 | Associates dashboard |

## Open questions

- **(owner)** Which vendors have affiliate programs beyond Amazon.in? (robu.in
  has a referral scheme — confirm terms.)
- **(owner)** Recipe authorship workflow: written directly in JSON, or a
  simple markdown-per-kit the build script compiles?
- **(engineering, non-blocking)** Prerender strategy: static-site generate per
  kit at build time (recommended — Vite + a tiny SSG step) vs worker-side HTML.
- **(data)** Launch catalogue size — pending the market sweep (in progress);
  gate: ship only when every launch kit has ≥1 verified link + 1 recipe.

## Timeline & phasing

- **Phase 1 (week 1):** repo scaffold (`narenana-wings`), JSON schema,
  catalogue seeded from the verified market sweep, static index + kit pages,
  umbrella routing + landing card. *Ships without the scraper* — prices carry
  the sweep's "as of" date.
- **Phase 2 (week 2):** price-refresh worker (top 2–3 vendors first), KV
  merge, freshness badges, GA4 events, affiliate tags.
- **Phase 3 (week 3):** recipes complete for all launch kits (owner editorial
  pass), OG cards, launch video on the channel.

## Market data (2026-07-17 · every link fetched live)

Method: 170 listings discovered across Indian retailers → 105 unique → 85 live
fetches. Airframes classified strictly: **flying wing = tailless/delta only**;
V-tail pushers (Mini Talon, AtomRC Dolphin/Swordfish/Mobula) and boom-tail
gliders are *not* wings, regardless of marketing.

### The headline: the Indian flying-wing market is Vortex-RC

**Vortex-RC (Bangalore) makes EPP flying wings domestically at ₹1,650–5,749,
in stock, with crash spares and GST invoices.** Nothing else comes close on
price or availability. They are the spine of the catalogue.

| Wing | Span | Live price (INR) | Stock |
|---|---|---|---|
| Vortex-RC TuffBirds Micro Bee | 600mm | 1,650 (no power pack) – 4,149 | ✅ base in stock; power-pack variant OOS |
| Vortex-RC FPVWRA Spec Racer | 900mm* | 2,699 – 5,399 | ✅ |
| Vortex-RC Chiquita-100 | 1000mm | 2,899 – 5,749 | ✅ base; top variant OOS |
| Vortex-RC Interceptor-100 | 1050mm | 2,999 – 5,399 | ✅ |
| Vortex-RC Mapper V4 | 1400mm | 5,500 – 5,950 (kit only) | ✅ |
| Vortex-RC FT-Spear (laser-cut) | — | 2,299 – 4,699 | ✅ |
| LDARC Tiny Wing 450X V2 (uavmarketplace) | 430mm† | 6,999 (MRP 17,899) | ✅ RTF |
| Vortex-RC VT-Speedster V2 | 990mm | 1,100 – 2,950 | ❌ OOS |
| Skywalker X2 Mini (uavmarketplace) | 950mm | 6,649 | ❌ OOS |

\* **Data conflict — do not publish unchecked:** the Spec Racer page's title/H1/schema
all say 900mm but its own spec block says "WingSpan: 600MM". Likely a vendor
copy-paste error (AUW ~500g and FPVWRA racing is a 900mm class), but it must be
confirmed with Vortex-RC before it goes on a kit page.
† "450X" is a model designation, not the span — the spec table says 430mm.

### The import gap — this is the tool's most valuable page

The wings people see on YouTube are **effectively unobtainable in India**:

| Model | Reality in India |
|---|---|
| **ZOHD Nano Talon EVO** | ✅ **The one clean domestic buy** — robosynckits.in, **₹15,210 all-in** (₹12,890 + 18% GST), in stock, GST invoice. (V-tail pusher, not a wing.) |
| **ZOHD Dart XL Extreme** | ⚠️ Grey import only (Ubuy). ₹17,953 — and the fine print says **bare KIT, no motor/ESC/servos/prop**, ~2× US retail, *excluding* shipping + duty, buyer is importer of record, warranty void. Realistic **₹25–30k all-in, 10+ days**. |
| **ZOHD Drift** | ❌ Unobtainable. Amazon.in ASIN is "currently unavailable". Also **not a flying wing** — image inspection shows a boom-tail pusher glider. |
| **SonicModell AR Wing Classic / Pro** | ❌ Unobtainable — absent domestically *and* from both grey importers. Personal import ≈ ₹12–28k, 2–4 weeks, you clear customs. |

**Desertcart's ₹4,893 "Nano Talon EVO, customs included" is not real** — it's
below the plane's bare international cost ($139.99 Banggood). Scraped
placeholder data. Do not link it.

**So the honest editorial line is:** *"Don't import. A Vortex-RC Interceptor-100
is ₹2,999 in stock; a Dart XL is ₹25–30k landed and arrives as a bare kit."*
That comparison — not a long kit list — is the thing worth ranking for.

### Scope consequence

Strict flying-wings-only yields **~7 in-stock airframes** — thin for a
"directory". Widening to *FPV fixed-wing platforms* (adding Nano Talon, Mini
Talon, AtomRC Dolphin/Swordfish/Flying Fish, HEEWing T1 Ranger, MAPBIRD Evo,
Skywalker X2) yields **~20** and matches how enquiries actually arrive. See
Open Questions.

### Freshness risks (informs the P0 scraper)

- **robu.in sits behind Cloudflare** — cannot be scraped; treat as manual.
- **Vortex-RC / uavmarketplace / robosynckits** are WooCommerce/Zoho with clean
  JSON-LD — reliable adapters.
- **IndiaMART is quote-only** (no published price) — link, never price.
- **Amazon.in suppresses price on unavailable ASINs** — absence ≠ free.
- Vortex-RC prices are **variant ranges** (kit/electronics/center-bay), not
  single values — the schema must model variants or the "from ₹X" will lie.
- Several listings quote **ex-GST** (robosynckits +18%, indianrobostore) — the
  catalogue must store tax-inclusive or the totals will mislead.
