-- Popularity signal for master models. A YouTube-led composite: the poll job
-- (jobs.mjs → popularitySlice) queries YouTube for each model's review videos
-- and folds view counts + coverage breadth + recency into a score. Two scores,
-- because "what to write about" and "what to sell first" differ:
--   pop_raw   — raw audience interest. Drives CONTENT priority; stays high even
--               for import-gap models (heavy YouTube presence, no Indian seller).
--   pop_score — pop_raw folded with availability (sellers / in-stock). The
--               BUYABLE grid's default sort, so an unobtainable model never tops
--               the shop. Content priority reads pop_raw; the grid reads pop_score.
-- pop_signals is the JSON component breakdown (views, videoCount, recency,
-- availability factor) so the formula stays transparent and re-tunable without a
-- re-poll to inspect it. NULL pop_score = never polled (sorts as a baseline).
-- NOT replay-safe (SQLite ALTER): apply via `wrangler d1 migrations apply catalog`.
ALTER TABLE master_model ADD COLUMN pop_score      REAL;    -- buyable-grid score; NULL = never polled
ALTER TABLE master_model ADD COLUMN pop_raw        REAL;    -- raw interest (content priority)
ALTER TABLE master_model ADD COLUMN pop_updated_at INTEGER; -- epoch ms of last poll; the re-poll cursor (oldest first)
ALTER TABLE master_model ADD COLUMN pop_signals    TEXT;    -- JSON breakdown of the score components

CREATE INDEX IF NOT EXISTS idx_master_pop ON master_model(category_id, pop_score);

-- Matched YouTube videos per master. Dual-purpose: the poll aggregates their
-- view counts into the score NOW, and Phase 4 embeds them as "Reviews & videos".
-- pinned / excluded are the human gate over machine matching (admin): an excluded
-- video never counts toward the score nor renders; a pinned one always does, even
-- if a later search drops it. rank = search-relevance order at fetch time.
CREATE TABLE IF NOT EXISTS master_video (
  master_model_id INTEGER NOT NULL REFERENCES master_model(id),
  video_id        TEXT NOT NULL,             -- YouTube 11-char video id
  title           TEXT,
  channel         TEXT,
  views           INTEGER,
  published_at    INTEGER,                   -- epoch ms
  rank            INTEGER,                    -- search relevance order at fetch time
  pinned          INTEGER NOT NULL DEFAULT 0,
  excluded        INTEGER NOT NULL DEFAULT 0,
  fetched_at      INTEGER NOT NULL,
  PRIMARY KEY (master_model_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_master_video_master ON master_video(master_model_id, excluded);
