-- Purge content from code (see audit, 2026-07-20):
--  * source.unscoped_ok       — was a regex over prose notes
--  * category.configs         — offer configs (kit/pnp/rtf/combo) were a
--                               hardcoded <select> in the admin
--  * recipe / component       — recipes.json (product content!) moves to D1;
--                               schema here, DATA imported out-of-band
-- Category-config seeds (0001's wings row, the configs update below) are the
-- one sanctioned repo-side seed class: bootstrap CONFIG, never product data.
--
-- NOT replay-safe (SQLite ALTER has no IF NOT EXISTS): wrangler's
-- d1_migrations bookkeeping runs each file once — apply ONLY via
-- `wrangler d1 migrations apply`. If an interrupted apply left the columns
-- present but the file unrecorded, recover with:
--   INSERT INTO d1_migrations (name) VALUES ('0002_content_out_of_code.sql');

ALTER TABLE source ADD COLUMN unscoped_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE category ADD COLUMN configs TEXT NOT NULL DEFAULT '["standard"]';

UPDATE category SET configs = '["kit","pnp","rtf","combo"]' WHERE id = 'wings';

CREATE TABLE IF NOT EXISTS recipe (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL REFERENCES category(id),
  goal        TEXT NOT NULL,             -- good | fast | endurance
  label       TEXT NOT NULL,
  span_min    INTEGER,                   -- applicability band on specs.spanMM
  span_max    INTEGER,
  summary     TEXT,
  source      TEXT,                      -- provenance note
  picks       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(picks))
              -- [{role, component_id, note}]
);
CREATE INDEX IF NOT EXISTS idx_recipe_cat ON recipe(category_id, span_min, span_max);

CREATE TABLE IF NOT EXISTS component (
  id        TEXT PRIMARY KEY,
  part_type TEXT,                        -- motor | esc | fc | battery | servo | rx | vtx
  name      TEXT NOT NULL,
  vendor    TEXT,
  url       TEXT,
  price_inr INTEGER,
  stock     TEXT,                        -- in-stock | out-of-stock | pre-order | listed
  note      TEXT
);
