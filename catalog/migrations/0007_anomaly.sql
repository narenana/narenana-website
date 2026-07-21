-- Brand/data anomalies detected by the dedup finder, surfaced in the Catalog
-- tab so the owner can correct a mislabel (e.g. an FMS Ranger tagged Volantex).
-- JSON {kind, detail, at} or NULL. Auto-recomputed each dedup pass; cleared
-- when the brand is fixed or the master is merged away.
-- NOT replay-safe (SQLite ALTER): apply via `wrangler d1 migrations apply`.

ALTER TABLE master_model ADD COLUMN anomaly TEXT;  -- JSON {kind, detail, at} | NULL
