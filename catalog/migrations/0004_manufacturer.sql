-- Manufacturer enrichment: masters can carry the MANUFACTURER's own product
-- page URL (owner pastes it in the Catalog tab — it's data, not code). A
-- sliced job polls that page (weekly per master) and stores what it finds:
-- richer specs (weight, length, battery, material...) and the official
-- description. Owner-entered spec values always win; mfr data only fills
-- gaps and renders as a "Manufacturer specs" section.
-- NOT replay-safe (SQLite ALTER): apply only via `wrangler d1 migrations apply`.
-- Interrupted-apply recovery:
--   INSERT INTO d1_migrations (name) VALUES ('0004_manufacturer.sql');

ALTER TABLE master_model ADD COLUMN mfr_url TEXT;
ALTER TABLE master_model ADD COLUMN mfr_specs TEXT;      -- {specs:{}, desc, at}
ALTER TABLE master_model ADD COLUMN mfr_checked_at INTEGER;
