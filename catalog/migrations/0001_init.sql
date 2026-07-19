-- Catalog platform schema v1 (see docs/ARCHITECTURE-catalog.md).
-- All DDL idempotent; timestamps are unix epoch MILLISECONDS (INTEGER).
-- Apply: npx wrangler d1 migrations apply CATALOG_DB [--local|--remote]

CREATE TABLE IF NOT EXISTS category (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  path_prefix  TEXT NOT NULL,
  spec_schema  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(spec_schema)),
  triage       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(triage)),
  live         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS source (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  home_url      TEXT NOT NULL,
  platform      TEXT,
  country       TEXT NOT NULL DEFAULT 'IN',
  made_in_india INTEGER NOT NULL DEFAULT 0,
  tax_included  INTEGER NOT NULL DEFAULT 1,
  grey_import   INTEGER NOT NULL DEFAULT 0,
  scrape_status TEXT NOT NULL DEFAULT 'ok',
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_url (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      TEXT NOT NULL REFERENCES source(id),
  url_canonical  TEXT NOT NULL UNIQUE,
  url_raw        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  added_by       TEXT NOT NULL DEFAULT 'owner',
  last_scan_at   INTEGER,
  last_scan_note TEXT CHECK (last_scan_note IS NULL OR json_valid(last_scan_note)),
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_url_category (
  source_url_id INTEGER NOT NULL REFERENCES source_url(id),
  category_id   TEXT NOT NULL REFERENCES category(id),
  PRIMARY KEY (source_url_id, category_id)
);

CREATE TABLE IF NOT EXISTS master_model (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  TEXT NOT NULL REFERENCES category(id),
  slug         TEXT NOT NULL,
  brand        TEXT NOT NULL,
  name         TEXT NOT NULL,
  brand_norm   TEXT NOT NULL,
  name_norm    TEXT NOT NULL,
  specs        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(specs)),
  blurb        TEXT,
  hero_image   TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (category_id, slug),
  UNIQUE (category_id, brand_norm, name_norm)
);
CREATE INDEX IF NOT EXISTS idx_master_cat ON master_model(category_id, status);

CREATE TABLE IF NOT EXISTS sku (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      TEXT NOT NULL REFERENCES source(id),
  source_url_id  INTEGER REFERENCES source_url(id),
  platform_pid   TEXT,
  url_canonical  TEXT NOT NULL UNIQUE,
  url_raw        TEXT NOT NULL,
  norm_version   INTEGER NOT NULL DEFAULT 1,
  title          TEXT,
  image_url      TEXT,
  specs          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(specs)),
  price_inr      INTEGER,
  in_stock       INTEGER,
  quote_only     INTEGER NOT NULL DEFAULT 0,
  variants       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(variants)),
  raw            TEXT,
  review_status  TEXT NOT NULL DEFAULT 'new',
  reject_reason  TEXT,
  reviewed_at    INTEGER,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,
  last_checked   INTEGER,
  misses         INTEGER NOT NULL DEFAULT 0,
  dead           INTEGER NOT NULL DEFAULT 0,
  flagged        TEXT CHECK (flagged IS NULL OR json_valid(flagged))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_pid ON sku(source_id, platform_pid)
  WHERE platform_pid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sku_review ON sku(review_status, source_id);
CREATE INDEX IF NOT EXISTS idx_sku_verify ON sku(review_status, dead, last_checked);

CREATE TABLE IF NOT EXISTS offer (
  sku_id          INTEGER NOT NULL REFERENCES sku(id),
  master_model_id INTEGER NOT NULL REFERENCES master_model(id),
  config          TEXT NOT NULL DEFAULT 'standard',
  pack_qty        INTEGER NOT NULL DEFAULT 1,
  note            TEXT,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (sku_id, master_model_id)
);
CREATE INDEX IF NOT EXISTS idx_offer_master ON offer(master_model_id);

CREATE TABLE IF NOT EXISTS observation (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id    INTEGER NOT NULL REFERENCES sku(id),
  at        INTEGER NOT NULL,
  vkey      TEXT,
  price_inr INTEGER,
  in_stock  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_obs_sku ON observation(sku_id, at);
CREATE INDEX IF NOT EXISTS idx_obs_at ON observation(at);

CREATE TABLE IF NOT EXISTS setting (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  detail    TEXT
);

-- Seed: the wings category (config/template, not product data).
INSERT OR IGNORE INTO category (id, name, path_prefix, spec_schema, triage, live) VALUES (
  'wings',
  'Flying wings',
  '/wings',
  '[{"key":"spanMM","label":"Wingspan","unit":"mm","type":"int","required":true},
    {"key":"auwG","label":"All-up weight","unit":"g","type":"int","required":false},
    {"key":"material","label":"Material","type":"text","required":false}]',
  '{"include":["wing","delta","dart","interceptor","chiquita","micro bee","spec racer","speedster","batman","zohd","ar wing","mojito","spear","plank"],
    "exclude":["motor","esc","propell","prop ","battery","charger","servo","carbon","plywood","balsa","foam","wire","connector","magnet","film","tube","rod","glue","goggle","camera","vtx","antenna","receiver","transmitter","screw","skid","spare","accessor","fc ","flight controller"],
    "accessory":["spare","skid","replacement","elevons pack","mounting kit"]}',
  1
);
