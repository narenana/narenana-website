-- Auto-enrichment: the system fills in as much SKU data as it can before the
-- owner ever sees the review queue. A third sliced job (enrich) fetches each
-- new sku's product page once, extracts span/config/price/stock/image, and
-- stores a persistent guess JSON the review UI prefills from.
-- NOT replay-safe (SQLite ALTER): apply only via `wrangler d1 migrations apply`.
-- Interrupted-apply recovery:
--   INSERT INTO d1_migrations (name) VALUES ('0003_enrichment.sql');

ALTER TABLE sku ADD COLUMN guess TEXT;        -- {brand,name,spanMM,config,kind,via,at}
ALTER TABLE sku ADD COLUMN enriched_at INTEGER;
