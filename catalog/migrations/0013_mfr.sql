-- Manufacturer content & audit. ADMIN-ONLY: no consumer surface until matches
-- are reviewed + a render decision is made. Apply:
--   wrangler d1 migrations apply catalog --remote
CREATE TABLE IF NOT EXISTS manufacturer (
  id         INTEGER PRIMARY KEY,
  brand      TEXT UNIQUE,          -- canonical, = master_model.brand
  domain     TEXT,
  platform   TEXT,                 -- shopify | protected | html
  strategy   TEXT,                 -- shopify | browser | html
  status     TEXT DEFAULT 'active',
  updated_at INTEGER
);

-- One row per manufacturer aircraft product (the ground truth).
CREATE TABLE IF NOT EXISTS mfr_product (
  id              INTEGER PRIMARY KEY,
  manufacturer_id INTEGER NOT NULL,
  ext_id          TEXT,            -- source product id / handle / url-slug
  url             TEXT,
  title           TEXT,
  is_aircraft     INTEGER DEFAULT 1,
  span_mm         INTEGER,         -- extracted fact
  body_text       TEXT,            -- raw description: SOURCE for rewrite, NEVER rendered verbatim
  image_urls      TEXT,            -- JSON array
  fetched_at      INTEGER,
  UNIQUE(manufacturer_id, ext_id)
);

-- One best match per master. status drives the admin review queue; only
-- 'accepted' is ever eligible to surface content later.
CREATE TABLE IF NOT EXISTS mfr_match (
  master_model_id INTEGER PRIMARY KEY,
  mfr_product_id  INTEGER,
  score           REAL,
  span_agree      INTEGER,         -- 1 agree · 0 conflict · NULL unknown
  tier            TEXT,            -- accept | review | reject (auto-tier)
  status          TEXT DEFAULT 'pending', -- pending | accepted | rejected
  decided_by      TEXT,
  decided_at      INTEGER,
  updated_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mfr_product_mfr ON mfr_product(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_mfr_match_status ON mfr_match(status);
