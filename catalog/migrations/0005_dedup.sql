-- Duplicate-master detection. A cron continuously compares masters within the
-- same category+brand; obvious dupes auto-merge, doubtful pairs land here for
-- the owner to approve (merge) or reject (not duplicates — never re-flag).
-- NOT replay-safe (SQLite has no IF NOT EXISTS on the UNIQUE) — apply via
-- `wrangler d1 migrations apply`.

CREATE TABLE IF NOT EXISTS merge_candidate (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id       INTEGER NOT NULL REFERENCES master_model(id),  -- proposed survivor
  b_id       INTEGER NOT NULL REFERENCES master_model(id),  -- proposed merged-away
  score      REAL NOT NULL,
  reason     TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',               -- pending|merged|rejected
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  UNIQUE (a_id, b_id)
);
CREATE INDEX IF NOT EXISTS idx_merge_pending ON merge_candidate(status, created_at);
