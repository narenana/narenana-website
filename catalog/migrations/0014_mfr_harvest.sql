-- Safe, incremental manufacturer harvesting + ranked review candidates.
--
-- Human decisions stay in mfr_match. Automated refreshes replace only
-- undecided rows and the derived candidate set.
ALTER TABLE manufacturer ADD COLUMN last_harvest_at INTEGER;
ALTER TABLE manufacturer ADD COLUMN last_harvest_status TEXT;
ALTER TABLE manufacturer ADD COLUMN last_harvest_note TEXT;

ALTER TABLE mfr_product ADD COLUMN last_seen_at INTEGER;
ALTER TABLE mfr_match ADD COLUMN note TEXT;

CREATE TABLE IF NOT EXISTS mfr_candidate (
  master_model_id INTEGER NOT NULL,
  mfr_product_id  INTEGER NOT NULL,
  rank            INTEGER NOT NULL,
  score           REAL NOT NULL,
  name_score      REAL NOT NULL,
  span_agree      INTEGER,
  tier            TEXT NOT NULL,
  reason          TEXT,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (master_model_id, mfr_product_id)
);

CREATE INDEX IF NOT EXISTS idx_mfr_candidate_master_rank
  ON mfr_candidate(master_model_id, rank);
CREATE INDEX IF NOT EXISTS idx_mfr_candidate_product
  ON mfr_candidate(mfr_product_id);

-- Seed the picker with today's selected candidate. The first cron completion
-- for each manufacturer replaces this with a fresh top-five list.
INSERT OR IGNORE INTO mfr_candidate (
  master_model_id, mfr_product_id, rank, score, name_score,
  span_agree, tier, reason, updated_at
)
SELECT
  master_model_id, mfr_product_id, 1, score,
  CASE WHEN score - CASE WHEN span_agree=1 THEN 0.15 ELSE 0 END < 0
       THEN 0
       ELSE score - CASE WHEN span_agree=1 THEN 0.15 ELSE 0 END
  END,
  span_agree, tier, 'candidate imported from the original batch', updated_at
FROM mfr_match
WHERE mfr_product_id IS NOT NULL;

UPDATE manufacturer
SET last_harvest_at = COALESCE(updated_at, 0),
    last_harvest_status = 'imported',
    last_harvest_note = 'Original local batch';

INSERT OR IGNORE INTO setting(k,v) VALUES ('mfr_paused','0');
INSERT OR IGNORE INTO setting(k,v) VALUES ('mfr_cursor','{}');
