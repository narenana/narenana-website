-- Old product slugs that 301 to the model that now owns them (SEO rec 6).
-- mergeMasters writes (absorbed slug -> survivor) in the same batch that
-- deletes the absorbed master and re-points aliases that targeted it, and a
-- slug rename in the admin writes (old slug -> same master), so an old URL
-- never falls through to the 404 grid. The public product route reads it only
-- after the live master lookup misses, so a live slug always wins.
-- Replay-safe (IF NOT EXISTS). Apply with:
--   npx wrangler d1 migrations apply catalog --remote
-- then run docs/seo-2026-09/slug-alias-backfill.sql for the known 404 slugs.
CREATE TABLE IF NOT EXISTS slug_alias (
  category_id     TEXT NOT NULL REFERENCES category(id),
  old_slug        TEXT NOT NULL,
  master_model_id INTEGER NOT NULL REFERENCES master_model(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (category_id, old_slug)
);
CREATE INDEX IF NOT EXISTS idx_slug_alias_master ON slug_alias(master_model_id);
