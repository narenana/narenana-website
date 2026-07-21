-- Per-product page snapshots: a chrome-free extract of the product core + a
-- content hash, so classifiers (power/brand/span/config/dedup) can be re-run
-- over INTERNAL data without re-fetching sellers, and a daily re-scan only
-- reprocesses when the product actually changed. Kept in its own table so the
-- catalog/review/verify hot-path SELECTs never drag the blob. The full raw page
-- is archived to R2 (env.SNAPSHOTS) when that binding exists — the hash lives
-- here either way.
-- NOT replay-safe (SQLite DDL): apply via `wrangler d1 migrations apply`.

CREATE TABLE IF NOT EXISTS sku_snapshot (
  sku_id       INTEGER PRIMARY KEY REFERENCES sku(id),
  hash         TEXT NOT NULL,             -- FNV-1a of (jsonld + normalised description)
  jsonld       TEXT,                      -- Product JSON-LD block (raw)
  description  TEXT,                      -- product-scoped text (og/meta + JSON-LD description)
  r2_key       TEXT,                      -- object key of the archived raw page, if any
  fetched_at   INTEGER NOT NULL,          -- first time we stored this product
  updated_at   INTEGER NOT NULL           -- last time the hash changed
);
