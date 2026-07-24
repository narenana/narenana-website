# Manufacturer Truth & Content — design

**Status:** BUILT + DEPLOYED (2026-07). Schema on prod; matcher, per-domain strategy registry
(Shopify + JSON-LD + 6 HTML parsers), and the admin verify screen are live; **73 accept-tier
matches loaded** (see `CHANGELOG.md`). Remaining: candidate-picker, browser-render for
protected sites, a production discovery cron, and the consumer render. **Admin-only — nothing
renders on the consumer site yet.** The design below is retained as the reference rationale.

## 1. Goal

Two outcomes from one system, both grounded in the **manufacturer's own product page** as
the source of truth:

1. **Content** — put authoritative material on our product pages: verified specs, an
   "official product page" link, and a description.
2. **Audit** — check our catalog against ground truth: is the manufacturer→model mapping
   right, is the wingspan accurate, are there duplicate/fragmented rows.

The insight from the prototype: **these are the same pipeline.** Matching a model to its
manufacturer product *is* the audit — agreement validates, disagreement flags.

## 2. What the prototype found (HEEWING, real data)

Probed 5 manufacturers, then matched HEEWING's `/products.json` (181 products) against our
12 HEEWING masters. Scripts: `scratchpad/mfr-audit/{analyze,heewing-proto}.mjs`.

- **Platform split decides everything.** heewing.com, volantexrc.com, atomrc.com are all
  **Shopify** → `/products.json` returns clean JSON (`title`, `body_html` description,
  `variants`, `images`, `tags`, `vendor`). fmsmodel.com sits behind **Cloudflare bot
  protection** ("Just a moment…"). team-blacksheep.com 301s and is electronics-only.
- **Extraction works.** Descriptions 356–4,867 chars; wingspan pulls cleanly from
  `body_html` with a regex.
- **Wingspan cross-check is the killer feature.** It auto-confirmed the good matches
  (T1 Ranger, Hunter H1 Humi, P-51 — all "span ✓ same") *and* flagged bad ones.
- **Three failure modes the design must handle:**
  1. *Parts beat planes.* "T2 Cruza" matched *"T2 Cruza VTOL Conversion Kit"* (a part)
     while the real *"T2 Cruza – 1.2M wingspan PNP"* sat unmatched. → must prefer aircraft.
  2. *Sparse names mismatch.* "Hunter F22/Su27/J20" all wrongly matched "Hunter H1 Humi"
     (0.33) — and the span check caught it (ours 400 vs mfr 680). These may be **mis-branded
     in our catalog** (does HEEWING even make an F22?).
  3. *Our catalog is fragmented.* "T2 Cruza" + "T2 Cruza VTOL" = two rows, one real plane.

## 3. Architecture

```
manufacturer registry ──> discover+fetch ──> normalize ──> match(+span) ──> {accept | review | reject}
   (~40 brands)            (Shopify JSON /      (aircraft      (per master)          │
                            browser fallback)    filter,                             ├─> audit flags
                                                 spec extract)                        └─> render (accepted only)
```

Runs as a **local batch first** (against a copy of prod data), producing a reviewable match
table + audit report. Only **accepted** matches + derived content get promoted to prod D1
(same "draft → review → publish" discipline as the landing-page content).

## 4. Stages

### 4.1 Manufacturer registry — `manufacturer` table
`brand` (canonical, = `master.brand`), `site_url`, `platform` (shopify|woo|custom|protected),
`products_url` (override), `status`, `notes`.
- Seed ~40 brands by hand, once. **Pro:** explicit control + per-brand overrides.
  **Con:** manual — but 40 brands cover ~90% of the 398 masters. Also forces us to settle
  the **brand-normalization** dupes found in the audit (Havoc/Havoc Hobby, Pilot-RC/Pilot RC,
  MapBird/Mapbird, SKYWING/SkyWing, CARF/CARF-Models, …) — one canonical brand each.

### 4.2 Discover + fetch — `mfr_product` table
- **Shopify** → `GET /products.json?limit=250&page=N` until empty. Store each product raw.
- **WooCommerce** → `/wp-json/wc/store/products` or sitemap.
- **Protected (Cloudflare)** → `env.BROWSER` (browser rendering) or residential pull (the
  `catalog/tools/pull-blocked.mjs` pattern). Bounded — do these last.
- **Pro:** most plane brands are Shopify = free, structured, no HTML scraping.
  **Con:** protected/custom sites are expensive and per-site; treat as a long tail.

### 4.3 Normalize + spec extract
- **Filter to aircraft.** Drop parts/accessories by title+type keywords (`boom, bag, case,
  servo, esc, vtx, motor, prop, canopy, gear, cover, protector, mount, spare, part, sticker,
  antenna, stickers, foam set`). This alone fixes failure mode #1.
- **Extract facts** from `body_html`/`title`: `spanMM`, `weightG`, channels, build types
  (PNP/RTF/KIT/BNF/ARF), material. Store in `specs_json`.
- **Pro:** facts are the high-value, low-risk payload. **Con:** keyword filter + regex need
  per-brand tuning; keep them data-driven, not hardcoded.

### 4.4 Match — `mfr_match` link table
Per master (brand-scoped candidates only):
`score = name_similarity  +  wingspan_agreement_bonus  −  parts_penalty`
Tiers:
- **auto-accept:** name ≥ 0.8 **AND** (wingspan agrees OR one side has no span).
- **review:** 0.4–0.8, **or** name high but wingspan conflicts (the interesting audit cases).
- **reject:** < 0.4.
Row: `master_model_id, mfr_product_id, score, span_agree (null|0|1), status
(auto|pending|accepted|rejected), decided_by, decided_at, flags_json`.
- **Pro:** the span tiebreak makes accepts trustworthy and routes conflicts to humans.
  **Con:** the mid-tier needs a review UI + human time (bounded — ~400 models, most auto).

### 4.5 Audit (falls out of matching)
Derived report, no extra work:
- **Wingspan conflicts** (name matches, span differs) → fix our data or the match.
- **Brand mismatches / no candidate** → our brand or name is likely wrong (the F22/Su27 case).
- **Unmatched masters** → manufacturer missing from registry, or bad name.
- **Many→one** (several masters → same mfr product) → merge candidates (T2 Cruza fragments).

### 4.6 Render (the content payoff) — gated on `status='accepted'`
On the product page, only for an **accepted** match:
- **Verified specs block** — manufacturer's wingspan/weight/etc. ("as published by <brand>").
- **"Official product page" link.**
- **Description** — see §5.

## 5. Content & copyright strategy (important)

Pasting a manufacturer's `body_html` verbatim = **duplicate content (hurts SEO)** + a
copyright problem. So:

- **Specs are facts** (wingspan, weight, channels) — not copyrightable. Use directly for
  audit + the verified-specs block. Safe, high value.
- **Descriptions** — never verbatim. Two options (decide during iteration):
  - (a) short factual summary + prominent link to the manufacturer, or
  - (b) manufacturer text as the **source** for an LLM-rewritten, unique description, stored
    + reviewed (landing-page pattern), so our copy is original.
- **Images** — manufacturer product images are higher quality than seller thumbnails; can
  feed the R2 image system, but same copyright caveat → prefer linking/hotlink-with-attrib
  or treat as a separate decision.

## 6. Where it runs

- **Production maintenance (live 2026-07-24).** A dedicated hourly cron runs one bounded
  manufacturer page at a time, stores its cursor in D1, and refreshes each manufacturer
  weekly. It upserts by stable external product id and never deletes review decisions.
- **Local recovery/backfill.** `catalog/tools/mfr/run.mjs` emits safe, idempotent upsert SQL
  from the committed manufacturer registry. `rebuild-remote.mjs --apply` rebuilds ranked
  candidates while preserving every row with a human `decided_at`.
- **Review.** The admin stores five ranked candidates per master. Automatic recommendations
  are one-to-one; shared or weak candidates are left unmapped for a human to choose.

## 7. Rollout order

1. **HEEWING** (prototype → harden): prove the pipeline end-to-end on 12 models.
2. **Other Shopify brands** by catalog weight: Volantex (22), ATOMRC (8), then the rest that
   expose `/products.json`.
3. **Protected/custom** (FMS 31, Seagull 37, …): browser-render/residential, per-site, last.
4. **The (null) brand bucket (80 masters, 20%!)** — biggest gap; needs brand assignment
   before it can be matched at all. Possibly its own sub-project.

## 8. Proposed schema (sketch)

```sql
CREATE TABLE manufacturer (
  id INTEGER PRIMARY KEY, brand TEXT UNIQUE, site_url TEXT, platform TEXT,
  products_url TEXT, status TEXT DEFAULT 'todo', notes TEXT, updated_at INTEGER);

CREATE TABLE mfr_product (
  id INTEGER PRIMARY KEY, manufacturer_id INTEGER, ext_id TEXT, url TEXT,
  title TEXT, product_type TEXT, is_aircraft INTEGER, body_text TEXT,
  specs_json TEXT, image_urls TEXT, raw_json TEXT, fetched_at INTEGER,
  UNIQUE(manufacturer_id, ext_id));

CREATE TABLE mfr_match (
  master_model_id INTEGER, mfr_product_id INTEGER, score REAL, span_agree INTEGER,
  status TEXT DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, flags_json TEXT,
  PRIMARY KEY (master_model_id));
```

## 9. Pros / cons of the whole approach

**Pros:** authoritative specs + an independent audit of our data for free; genuinely useful
product-page content; no fabrication (facts are facts); reuses proven patterns (cron slices,
review queue, bulk-SQL promote, R2 images).

**Cons:** matching is inherently fuzzy and needs a human review tier; protected sites are a
real cost; the registry + brand normalization is manual seeding; description content needs a
copyright-safe path (rewrite/summarize, not verbatim); the 80 null-brand masters can't be
matched until they're branded.

## 10. Open decisions (to settle while iterating)

1. Description strategy: **(a) link+summary** vs **(b) LLM-rewrite+review**?
2. Match store: link table (`mfr_match`) — confirmed, or a column on `master_model`?
3. Auto-accept threshold: name ≥ 0.8 + span-agree — too strict / too loose?
4. Do we auto-**correct** our wingspan from the manufacturer on a high-confidence match, or
   only **flag** it for review? (Lean: flag first, auto-correct once trust is established.)
5. Images: adopt manufacturer images or leave to the seller-image system?
6. ~~Where does the batch live?~~ Resolved: bounded production cron plus safe local recovery
   tooling.

## 11. Scope + decisions locked (2026-07-23)

**Content =** (a) **factual copy of metrics** (specs verbatim — facts, not copyrightable) **+** (b)
**LLM-rewritten descriptions** (manufacturer text as *source* → unique copy; never verbatim).
Resolves decision #1 → rewrite.
**NEW source — OCR image-text → HTML.** Manufacturers bury a lot of content (spec tables,
feature copy) *inside product images*, invisible to search engines. OCR that text and render it
as real HTML → big SEO lift. First-class content source alongside specs + descriptions.
**No consumer UI** until content is human-verified — everything lands in admin/data first.
**Admin verify screens** review (1) the matches we made and (2) the content we intend to add
(specs / rewritten description / OCR'd text) before anything goes live.

**Platform landscape (probed):**
- **Shopify (free `/products.json`):** HEEWING, Volantex, ATOMRC, Dynam, Extreme Flight.
- **Protected (Cloudflare challenge → browser rendering):** motionrc.com (mega-distributor —
  Freewing/FMS/Arrows/Dynam/E-flite in one store), fmsmodel.com, store.flitetest.com,
  arrowshobby.com, durafly.com.
- **Custom HTML:** seagullmodels, zohd, sonicmodell, pilot-rc, dwhobby, freewingmodel — need
  JSON-LD / WooCommerce (`/wp-json`) parsing.

**Browser rendering:** the repo already binds `env.BROWSER` (Cloudflare Browser Rendering, used
for WAF-blocked sellers) — a real headless Chrome passes the JS challenge. Adapter to render
protected `products.json` / product pages (env.BROWSER worker job, or local Playwright in the
batch). **motionrc alone unlocks a large slice of the catalog.**

**Politeness/caching (learned):** re-fetching every run gets you rate-limited (saw 0-product
pulls after hammering). Batch now caches per-manufacturer 24h in `.mfr-cache/` (gitignored) and
paces requests. The D1 `mfr_product` store is the persistent version.

**Build order (updated 2026-07-24):**
1. ✅ Shopify fetch + aircraft filter + containment match + wingspan audit (local batch).
2. ✅ Caching + registry expansion (5 Shopify brands).
3. ✅ Custom-site adapters — JSON-LD plus six dedicated HTML parsers.
4. ✅ D1 schema + production load.
5. ✅ Ranked-candidate admin picker with decision-preserving rebuilds.
6. ✅ Weekly Sunday production cron backed by bounded Queue jobs; admin can
   immediately rematch a newly added model or queue an early harvest.
7. **Browser-render adapter** — protected sites (fms, flitetest, arrows, durafly).
8. **OCR pipeline** — manufacturer product images → structured HTML text.
9. **LLM description rewrite** — unique copy from manufacturer source, queued for review.
10. **Consumer render** — ONLY after verification.

**Open decisions now:** #2 wingspan conflicts → still **flag-first** in admin (auto-correct once
trusted). #5 manufacturer image *adoption* (vs just OCR'ing their text) → still TBD.
