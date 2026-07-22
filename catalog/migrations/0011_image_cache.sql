-- Image warm/backfill ledger. The warm slice (jobs.mjs) proactively copies each
-- seller image the /img proxy could serve into R2 BEFORE any page view, so a
-- down / geo-blocked / WAF-guarded seller can't blank the catalog. This table
-- tracks what's been handled so the sweep is idempotent and so CDN/WAF-blocked
-- images (that a datacenter fetch can't retrieve) surface for a local-browser
-- pull. Apply: wrangler d1 migrations apply catalog --remote
CREATE TABLE IF NOT EXISTS image_cache (
  src        TEXT PRIMARY KEY,   -- origin image URL (exactly what /img resolves to)
  k          TEXT NOT NULL,      -- FNV-1a imgKey = R2 object key
  status     TEXT NOT NULL,      -- 'ok' | 'blocked' (403/401/429) | 'error'
  http       INTEGER,            -- last origin HTTP status
  bytes      INTEGER,            -- stored object size when ok
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_image_cache_status ON image_cache(status);
