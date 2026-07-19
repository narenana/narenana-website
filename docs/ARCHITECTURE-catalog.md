# Catalog platform — architecture

*Status: v2 ACCEPTED + IMPLEMENTED · 2026-07-19 · adversarially reviewed (33 findings folded in)*

**Owner decisions:** D1 ✓ · master-model public pages ✓ · jobs-in-one-Worker ✓ ·
**Workers Free** (budget-sliced jobs, 2 cron triggers) · **HTTP Basic auth** ·
**clean start** (no KV migration) · approval-maps-to-master ✓ · recipes phase 2 ·
wings-only day one. Implementation lives in `catalog/`.

The India-deliverable product catalog behind `narenana.com/wings/` — designed
so the same machinery later powers motors, ESCs, cameras and any other
category, without schema surgery.

## Principles (owner's intent, verbatim spirit)

1. **No product data in the codebase.** The repo contains logic, schema and
   templates only. Every URL, SKU, price and model lives in the database.
2. **Humans gate what ships.** Machines discover and scan; nothing reaches
   real users without an explicit owner approval — and a daily scan must never
   be able to silently change what an approval meant (see *Identity*).
3. **Sellers are many; aircraft are few.** The public catalog is organised
   around canonical **master models**, each aggregating offers from every
   seller — with offer *configuration* (bare kit vs PNP vs RTF vs combo) made
   explicit so prices are compared like-for-like.
4. **Category-agnostic.** "Wings" is the first category, not a special case.
   Everything category-specific (specs, triage terms, routing prefix) is data.

## The data flow

```
                    ┌────────────────────────────┐
 (PAUSED) discover  │  source_url                │   owner pastes URLs in admin
 job ──proposals──▶ │  scannable listing URLs    │◀── (Sources panel, with
                    │  per seller site           │    add-time dry-run probe)
                    └─────────────┬──────────────┘
                                  │  cron: SCAN (chunked, daily coverage)
                                  ▼
                    ┌────────────────────────────┐
                    │  sku  (+ observation on    │  identity = platform product
                    │  change)                   │  id, then canonical URL
                    └─────────────┬──────────────┘
                                  │  admin: Review queue
                    ┌─────────────▼──────────────┐
                    │  approve → offer row links │  reject(reason) — reopenable
                    │  SKU to a master_model     │  by scope changes
                    │  (attach / create draft)   │
                    └─────────────┬──────────────┘
                                  ▼
                    ┌────────────────────────────┐
                    │  PUBLIC: master pages with │  liveness is DERIVED: live
                    │  config-labelled offers    │  master ⇔ has usable offer
                    └─────────────┬──────────────┘
                                  │  cron: VERIFY (approved SKUs, oldest-first)
                                  ▼
                       price/stock/dead checks; big
                       deltas → FLAG queue, never
                       silently republished
```

## Platform budget (decides real shapes — read first)

- **This design assumes Workers Paid ($5/mo).** Free's 50 subrequests + 50 D1
  queries per invocation + 10 ms CPU cannot run a scan over 7+ sellers in one
  invocation; the current code's `ENRICH_CAP=25` exists precisely because of
  this. Paid: 10,000 subrequests, 30 s CPU (15 min for ≥1h schedules), D1
  1,000 queries/invocation. **Open question O1 to owner.**
- Even on Paid, jobs are **chunked by design**: each run consumes a budget
  (e.g. 40 fetches / 300 statements), persists a cursor in `setting`, and the
  cron re-fires until the day's sweep completes. Overlap is prevented by a
  lease: `UPDATE setting SET v=<now+ttl> WHERE k='scan_lease' AND v<<now>` —
  claimed only if the changed-row count is 1.
- All schedules share one `scheduled()` handler — **dispatch on `event.cron`**
  (the existing hourly RSS refresh keeps its own expression; today's handler
  runs it unconditionally, which must change the day a second cron lands).
  Free caps cron triggers at 5/account — one more reason Paid is assumed.
- Writes use single-statement upserts (`INSERT … ON CONFLICT … DO UPDATE`) and
  multi-row inserts (~30 rows per statement under the 100-bound-params cap).
  D1 capacity is a non-issue at this scale (10 GB Paid; observation rows are
  ~100 B) with one exception: **never store raw HTML** — `sku.raw` holds the
  parsed extract only, capped at 64 KB (D1's hard 2 MB/row would otherwise
  break upserts on the first inlined-state product page).

## Storage: Cloudflare D1

Relational model (FKs, uniqueness for dedup, joins for offers), zero new
infra, SQLite semantics. **Honest platform note:** D1 has *no interactive
transactions* — auto-commit per statement plus atomic `db.batch()`. Every
multi-step mutation below is therefore expressed as one batch whose statements
reference prior rows by *natural keys we generate up front* (slug, url), never
by round-tripping an AUTOINCREMENT id. Reads-then-writes are folded into
conditional single statements.

Create with an APAC location hint (`wrangler d1 create catalog --location=apac`)
— D1 is single-primary and placed at creation; the audience is Indian.
Escape hatches if ever needed: D1 read replication (Sessions API) and the
free Cache API for rendered pages (first resort before any KV cache).

### Identity — the heart of the design

**A URL is where a listing lives, not what it is.** Sellers delete products
and reuse slugs; feeds and scrapes render the same listing under different
URL forms. Two rules:

1. **Primary identity = `(source_id, platform_pid)`** — the platform's own
   product id (WooCommerce/Shopify/Zoho all expose one in their feeds).
2. **Canonical URL is secondary**, produced by a *specified, versioned*
   canonicalizer: lowercase scheme+host, strip fragment/default port/tracking
   params (utm_*, srsltid, fbclid…), prefer the feed's canonical product URL,
   collapse `/collections/<x>/products/<h>` → `/products/<h>`, no trailing
   slash. Stored as `url_canonical` + `url_raw` + `norm_version`; bumping the
   canonicalizer ships with a merge migration (keep the reviewed row, repoint
   observations, delete the duplicate).

**URL-reuse defence:** if a scan hits a known URL whose `platform_pid` (or,
for HTML sources, drastic title dissimilarity) mismatches the stored row: the
old row is closed out (`dead=1`, mapping and history preserved) and a *new*
row enters review. An approved row's identity fields are never silently
rewritten — a normal daily scan cannot change what the owner approved.

### Schema

```sql
-- Product verticals. Adding "motors" later = INSERT + spec/triage JSON.
CREATE TABLE IF NOT EXISTS category (
  id           TEXT PRIMARY KEY,            -- 'wings' | 'motors' | 'esc' | …
  name         TEXT NOT NULL,
  path_prefix  TEXT NOT NULL,               -- '/wings' (public mount)
  -- Spec template: [{key,label,unit,type,required}]. KEYS ARE IMMUTABLE
  -- IDENTIFIERS (rename the label, never the key); admin allows add/deprecate
  -- only. Drives master/SKU spec forms, validation, public spec tables.
  spec_schema  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(spec_schema)),
  -- Triage config: include/exclude/accessory term lists — per-category data,
  -- NOT hardcoded regexes (wings' NOISE list penalising 'motor' would
  -- otherwise zero out the entire motors queue on launch day).
  triage       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(triage)),
  live         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS source (
  id            TEXT PRIMARY KEY,           -- derived from host: 'vortex-rc'
  name          TEXT NOT NULL,
  home_url      TEXT NOT NULL,
  platform      TEXT,                       -- woocommerce | shopify | zoho | html
  country       TEXT NOT NULL DEFAULT 'IN',
  made_in_india INTEGER NOT NULL DEFAULT 0,
  tax_included  INTEGER NOT NULL DEFAULT 1,
  grey_import   INTEGER NOT NULL DEFAULT 0,
  scrape_status TEXT NOT NULL DEFAULT 'ok', -- ok | blocked:<reason> | banned
  notes         TEXT,
  created_at    INTEGER NOT NULL,           -- ALL timestamps: unix epoch ms
  updated_at    INTEGER NOT NULL
);

-- Scannable URLs. Scan-scope HINTS, not SKU identity: a URL may carry several
-- categories (drkstore's mixed shop; vortex-rc's rc-plane-kits has wings AND
-- trainers), so category lives in a join table and the SKU's true category is
-- fixed at approval from the master it maps to.
CREATE TABLE IF NOT EXISTS source_url (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      TEXT NOT NULL REFERENCES source(id),
  url_canonical  TEXT NOT NULL UNIQUE,     -- same canonicalizer as SKUs
  url_raw        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active', -- active | paused | proposed
  added_by       TEXT NOT NULL DEFAULT 'owner',  -- owner | discovery
  last_scan_at   INTEGER,
  last_scan_note TEXT CHECK (last_scan_note IS NULL OR json_valid(last_scan_note)),
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS source_url_category (
  source_url_id INTEGER NOT NULL REFERENCES source_url(id),
  category_id   TEXT NOT NULL REFERENCES category(id),
  PRIMARY KEY (source_url_id, category_id)
);

-- Canonical products. Public unit. Born DRAFT; goes live only when required
-- specs are filled AND it has a usable offer. UNIQUE guards stop the dedup
-- problem re-appearing at the canonical layer.
CREATE TABLE IF NOT EXISTS master_model (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  TEXT NOT NULL REFERENCES category(id),
  slug         TEXT NOT NULL,
  brand        TEXT NOT NULL,
  name         TEXT NOT NULL,
  brand_norm   TEXT NOT NULL,              -- lowercase, collapsed — dup guard
  name_norm    TEXT NOT NULL,
  specs        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(specs)),
  blurb        TEXT,
  hero_image   TEXT,
  status       TEXT NOT NULL DEFAULT 'draft', -- draft | ready | retired
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (category_id, slug),
  UNIQUE (category_id, brand_norm, name_norm)
);
CREATE INDEX IF NOT EXISTS idx_master_cat ON master_model(category_id, status);

-- Seller listings. Identity per the Identity section.
CREATE TABLE IF NOT EXISTS sku (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      TEXT NOT NULL REFERENCES source(id),
  source_url_id  INTEGER REFERENCES source_url(id),
  platform_pid   TEXT,                     -- feed product id (null for HTML)
  url_canonical  TEXT NOT NULL UNIQUE,
  url_raw        TEXT NOT NULL,
  norm_version   INTEGER NOT NULL DEFAULT 1,
  title          TEXT,
  image_url      TEXT,
  specs          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(specs)),
    -- extracted at scan-time against candidate categories' spec keys; feeds
    -- the match suggester (brand+title fuzz alone can't tell Ranger 1600
    -- from Ranger 2000 — the span spec can)
  price_inr      INTEGER,                  -- cheapest ORDERABLE variant
  in_stock       INTEGER,                  -- 1 | 0 | NULL unverified
  quote_only     INTEGER NOT NULL DEFAULT 0,
  variants       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variants)),
    -- [{vkey, label, priceINR, inStock}] — vkey is a stable per-variant key
    -- so observations can compare like-for-like
  raw            TEXT,                     -- parsed extract ONLY, ≤64 KB
  review_status  TEXT NOT NULL DEFAULT 'new', -- new | approved | rejected
  reject_reason  TEXT,                     -- out-of-scope | accessory |
                                           -- duplicate | junk  (one-tap enum;
                                           -- scope widening reopens
                                           -- 'out-of-scope' as a batch)
  reviewed_at    INTEGER,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,         -- last seen in a feed
  last_checked   INTEGER,                  -- last direct page check
  misses         INTEGER NOT NULL DEFAULT 0, -- consecutive feed absences
  dead           INTEGER NOT NULL DEFAULT 0,
  flagged        TEXT                      -- NULL | json {kind, detail, at} —
                                           -- price-jump / identity-mismatch;
                                           -- first-class admin queue
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_pid ON sku(source_id, platform_pid)
  WHERE platform_pid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_review ON sku(review_status, source_id);
CREATE INDEX IF NOT EXISTS idx_sku_verify ON sku(review_status, dead, last_checked);

-- SKU ↔ master mapping as a JOIN TABLE (not a column): the market sells
-- bundles. A "motor+ESC combo ×4" SKU maps to BOTH the motor master and the
-- ESC master; an RTF listing and a bare-kit listing of the same airframe are
-- different CONFIGS of one master and must not be price-compared raw.
CREATE TABLE IF NOT EXISTS offer (
  sku_id          INTEGER NOT NULL REFERENCES sku(id),
  master_model_id INTEGER NOT NULL REFERENCES master_model(id),
  config          TEXT NOT NULL DEFAULT 'standard',
    -- category-defined enum, e.g. wings: kit | pnp | rtf | combo
  pack_qty        INTEGER NOT NULL DEFAULT 1,
  note            TEXT,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (sku_id, master_model_id)
);
CREATE INDEX IF NOT EXISTS idx_offer_master ON offer(master_model_id);

-- Price/stock timeline. APPEND ONLY ON CHANGE (vs the SKU's latest
-- observation) — a daily no-change append would be ~90% dead weight and D1
-- churn. Freshness lives on sku.last_seen/last_checked. Never write all-NULL
-- rows (parse failures go to source_url.last_scan_note / sku.flagged).
-- Retention: collapse to weekly after 12 months (documented op, not a trigger).
CREATE TABLE IF NOT EXISTS observation (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id    INTEGER NOT NULL REFERENCES sku(id),
  at        INTEGER NOT NULL,
  vkey      TEXT,                          -- variant the price refers to;
                                           -- price-jump flags compare
                                           -- like-for-like per vkey (a KIT
                                           -- selling out must not read as an
                                           -- 81% "jump" to the PNP price)
  price_inr INTEGER,
  in_stock  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_obs_sku ON observation(sku_id, at);
CREATE INDEX IF NOT EXISTS idx_obs_at ON observation(at);

CREATE TABLE IF NOT EXISTS setting (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- 'discovery_paused'='1' (ships ON), job leases, scan cursors, cron stamps.

CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  actor     TEXT NOT NULL,   -- identity (see Auth) | 'scan' | 'verify'
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  detail    TEXT
);
```

**Structural invariants** (app-enforced, stated here as law):
- `review_status='approved'` ⇔ at least one `offer` row exists. Approve is one
  `batch()`: [create draft master if needed (slug pre-generated), insert
  offer(s) via slug subselect, set review_status, audit]. Un-approve is the
  mirror batch and records the old mapping in the audit detail.
- Public **liveness is derived, never stored**: a master renders ⇔ status
  `ready` AND ≥1 offer whose SKU is approved. A master whose offers are all
  dead/out-of-stock **keeps its page** ("listing unavailable — last seen ₹X on
  <date>", with alternates) — pages only vanish when the owner retires the
  model. Deranking a page that people are actively searching for, precisely
  when its stock blips, would burn the SEO goal.
- `dead` **auto-resurrects**: a scan/verify that finds the listing live again
  clears it (audit-logged). `dead` is set by `misses ≥ 3` AND a direct page
  404 — feed absence alone isn't death (sellers hide out-of-stock items).
- A scan may never mutate `category`-determining or identity fields of a
  reviewed row; conflicts set `flagged` instead.

## The jobs

One deployed Worker; `scheduled()` dispatches on `event.cron`; each job gated
by a `setting` flag (pause from admin, no deploy) and an overlap lease.

| Job | Cadence | Scope |
|---|---|---|
| `scan` | every 15 min until day-sweep complete | active source_urls, cursor-chunked: feed → upsert SKUs (identity rules) → on-change observations → per-URL result note |
| `verify` | every 15 min until 12h-sweep complete | approved+alive SKUs oldest-`last_checked` first: direct page check → price/stock/dead → >25% same-vkey delta ⇒ `flagged`, **not** republished |
| `discover` | daily (**ships paused**) | proposes `source_url` rows (`status='proposed'`) for owner activation; never activates anything |
| `rss` | hourly (existing) | YouTube feed cache — untouched, but now behind its own `event.cron` branch |

While a SKU is `flagged`, the public page renders the **last-confirmed price
with its observation date** and no freshness claim — never the unvetted new
number, never a silent freeze.

## Admin panel

Four sections; every mutation audits. Built phone-first — the design target is
**triage in 2 minutes/day**, which drives four specifics:
1. **One-tap approve** when the suggester has a high-confidence master match
   (brand+norm-title+spec proximity over `sku.specs`).
2. **Approve-with-TODO**: approving into a *new* master creates it as `draft`
   with specs copied from the SKU; it publishes only when required specs are
   complete — so phone passes are triage, not data entry.
3. **Bulk actions**: reject-by-reason (accessory/junk/out-of-scope/duplicate),
   reject-all-from-source.
4. **Daily digest** (email now; WhatsApp-friendly link format) — "9 new · 2
   flagged · 1 dead" with deep links. Without a push channel the owner only
   finds work by remembering to look.

Sections: **Sources** (paste URL → host-derived source, platform probe,
dry-run "found N products" before saving; per-URL last-scan health; discovery
proposals await activation) · **Review** (queue with the existing filters +
Flagged as a first-class state; mapping step per approve) · **Catalog**
(masters: specs/blurb/hero, offers with price history, retire/restore,
un-approve) · **System** (job pauses, run-now, cron health, audit tail).

## Auth

Current single static Bearer token has real weaknesses for a write-capable
admin: no identity for audit, edge-speed brute-forceable (Workers have no
built-in rate limiting), token in localStorage = XSS exfiltrable.

**Recommended: Cloudflare Access** (Zero Trust free tier) on
`narenana.com/wings/admin*` with One-Time PIN to the owner's email — *plus*
in-Worker validation of the `Cf-Access-Jwt-Assertion` JWT (the edge check
alone can be bypassed via the workers.dev hostname, which must be disabled for
this Worker). Audit `actor` becomes the JWT email — real identity. Fallback if
Access is declined: keep the token but timing-safe compare, a zone
rate-limiting rule on the admin path, and stated rotation. **Open question O2.**

## Public site

- `/wings/` — live masters grid; price shown is **cheapest orderable across
  offers of the base config** ("from ₹2,999 · 3 sellers"), never a combo/pack
  price masquerading as the product price.
- `/wings/<slug>/` — canonical page: specs (from `spec_schema`), editorial
  blurb, **offers table** grouped by config (Kit / PNP / RTF), each row:
  seller, price + observation date, stock, tax/import caveats from `source`
  flags. `Product` + `AggregateOffer` JSON-LD per config group.
- New categories mount at their own `path_prefix` (`/motors/`) — one renderer,
  per-category config. Slug uniqueness is **per category** (a wings page and a
  cameras page may share a slug; paths never collide).
- Renderers skip-and-flag a row whose JSON fails to parse — one poisoned row
  must not 500 a page.

## What stays in the codebase vs D1

| In repo | In D1 |
|---|---|
| Schema + migrations (`migrations/*.sql`, idempotent DDL) | sources, source URLs, categories |
| Platform adapters, canonicalizer (versioned) | SKUs, variants, specs, observations |
| Renderers, admin UI | masters, offers, mappings |
| Category seed *templates* (first-run only) | approvals, reject reasons, flags |
| Recipes/components — **phase 2 → D1** (`recipe` table keyed by category + spec band); acknowledged as product data, sequenced after core | settings, audit, price history |

Removed by migration: `wings/data/kits.json`, `wings/data/sources.json`
(their *knowledge* — seller quirks — moves into `source.notes`).

## Migration (one-time, offline-first)

1. `wrangler d1 create catalog --location=apac`; bind `CATALOG_DB` alongside
   the existing KV (bindings coexist; KV binding removed in a follow-up deploy
   — an explicit cutover step).
2. Migrations: `wrangler d1 migrations apply CATALOG_DB --remote` runs as a
   pre-deploy step (Workers Builds does **not** auto-apply; order is
   schema-first, code-tolerant). All DDL idempotent so a partially-applied
   file is safely re-runnable. Rollback net: D1 Time Travel (30 days).
3. **Import offline, never via a Worker endpoint** (per-invocation budgets +
   double-trigger risk): KV export → script emits chunked multi-row INSERTs →
   `wrangler d1 execute --remote --file`, parents first
   (`PRAGMA defer_foreign_keys` for safety).
4. **Re-canonicalize on import**: every KV-era URL passes through the new
   canonicalizer, then a dry-run scan of all active source_urls reconciles —
   imported rows the dry run can't match are surfaced for manual re-keying,
   NOT imported as-is (else the first real scan duplicates the whole queue
   and the imported approvals freeze at migration-day prices forever).
5. Owner sanity pass in admin (existing approvals arrive pre-mapped as
   offers); then remove JSON seeds + KV code path.

## Failure honesty (systemic)

- Every price renders with its observation date.
- "In stock" strictly = verified purchasable; quote-only/unverified never
  renders buyable.
- Broken source URLs fail loudly: at add-time (dry-run) and every scan
  (last_scan_note in admin).
- No whole-shop fallback when a category scope can't resolve — refuse and
  report (the vortex-rc lesson).
- A daily scan can never rewrite what an approval meant; identity conflicts
  flag, humans decide.

## Open questions for the owner

- **O1 · Workers plan.** The design assumes **Workers Paid ($5/mo)** (job
  budgets, D1 caps, >5 cron triggers). Current account appears to be Free.
  Upgrade, or should I design down to Free (slower sweeps, tighter caps)?
- **O2 · Admin auth.** Cloudflare Access with email OTP (recommended: real
  identity in audit, no shared secret) — or keep the hardened static token?
- **O3 · Public shape.** Master-model pages with config-grouped offer tables;
  SKU-level public pages cease to exist. Confirm.
- **O4 · Approval = mapping.** Approving always attaches/creates a master
  (with draft-TODO so it's never data entry on the phone). Confirm.
- **O5 · Migrate or clean start.** Import the current state (your approvals +
  the 245-candidate queue, re-canonicalized) — or start the DB empty?
- **O6 · Recipes in phase 2.** OK to leave recipes in-repo for phase 1?
- **O7 · Day-one categories.** Wings only, others added via admin later — or
  stub motors/esc/cameras now (empty, spec templates ready)?
```
