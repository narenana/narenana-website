-- Store the power class on the master (electric | gas), derived from its
-- offers' seller titles. Lets the public grid FILTER by power in SQL and
-- PAGINATE with LIMIT/OFFSET — no GROUP_CONCAT-over-everything per request,
-- which was the query that grew heavy as the catalog filled.
-- NOT replay-safe (SQLite ALTER): apply via `wrangler d1 migrations apply`.

ALTER TABLE master_model ADD COLUMN power TEXT;  -- electric | gas (NULL = unclassified)
CREATE INDEX IF NOT EXISTS idx_master_grid ON master_model(category_id, status, power);
