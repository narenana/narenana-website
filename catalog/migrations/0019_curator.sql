-- The daily AI curator (catalog/lib/curator/). Tables for its runs, its
-- recorded decisions, merge snapshots for undo, the AI answer cache,
-- embeddings, field provenance (who set each field: the owner's values are
-- locked against automation) and the owner's queued decisions (directives).
--
-- NOT replay-safe (SQLite ALTER has no IF NOT EXISTS): apply ONLY with
--   npx wrangler d1 migrations apply CATALOG_DB --local | --remote
-- The code probes for field_src (like hasSlugAlias), so a deploy before this
-- migration leaves the curator doing nothing and the admin writing no
-- provenance.

CREATE TABLE IF NOT EXISTS curator_run (
  id          TEXT PRIMARY KEY,                -- the UTC date; '2026-10-01#2' for a second run that day
  mode        TEXT NOT NULL,                   -- dry | live
  trig        TEXT NOT NULL,                   -- cron | manual
  status      TEXT NOT NULL,                   -- running | done
  phase       TEXT,
  cursor      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(cursor)),  -- {phase, queue, idx, fails, inflight, health, memo, counts}
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  ticks       INTEGER NOT NULL DEFAULT 0,
  ai_calls    INTEGER NOT NULL DEFAULT 0,
  cache_hits  INTEGER NOT NULL DEFAULT 0,
  neurons     REAL NOT NULL DEFAULT 0,
  neuron_cap  INTEGER NOT NULL,
  counts      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(counts)),
  errors      INTEGER NOT NULL DEFAULT 0,
  summary     TEXT
);

-- One row per decision. kind: merge, fill, rename, slug, roles, attach,
-- reject, draft, escalate, directive, dismiss, error. status: planned (a dry
-- run's change, or an escalation waiting for the owner), applied, skipped,
-- undone, failed. before/after: {field, value, …}; evidence: {issue, quotes,
-- verdict, confidence, differences, model, prompt_v, …}.
CREATE TABLE IF NOT EXISTS curator_action (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES curator_run(id),
  kind        TEXT NOT NULL,
  entity      TEXT NOT NULL,                   -- master | sku | run
  entity_id   INTEGER,
  other_id    INTEGER,
  status      TEXT NOT NULL,
  before      TEXT,
  after       TEXT,
  evidence    TEXT,
  confidence  REAL,
  input_hash  TEXT,
  created_at  INTEGER NOT NULL,
  applied_at  INTEGER,
  undone_at   INTEGER,
  undone_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_cur_action_run ON curator_action(run_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_cur_action_ent ON curator_action(entity, entity_id);

-- A merge's complete before-image, so a merge can be undone in one click.
CREATE TABLE IF NOT EXISTS merge_undo (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id    INTEGER,
  survivor_id  INTEGER NOT NULL,
  absorbed_id  INTEGER NOT NULL,
  actor        TEXT NOT NULL,
  snapshot     TEXT NOT NULL CHECK (json_valid(snapshot)),
  created_at   INTEGER NOT NULL,
  undone_at    INTEGER
);

-- AI answers by sha256(task | model | prompt version | canonical input).
-- status ok | invalid. Transient errors are never stored.
CREATE TABLE IF NOT EXISTS ai_cache (
  key         TEXT PRIMARY KEY,
  task        TEXT NOT NULL,
  model       TEXT NOT NULL,
  prompt_v    TEXT NOT NULL,
  status      TEXT NOT NULL,
  output      TEXT,
  neurons     REAL,
  created_at  INTEGER NOT NULL
);

-- L2-normalised embeddings, int8-quantised with a per-row scale, base64 TEXT.
CREATE TABLE IF NOT EXISTS embedding (
  entity      TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  model       TEXT NOT NULL,
  input_hash  TEXT NOT NULL,
  scale       REAL NOT NULL,
  vec         TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (entity, entity_id)
);

-- Who set a field. src: owner (locked) | owner-approved | directive (locked)
-- | curator | rules. field: brand, name, slug, blurb, specs.<key>, power,
-- role_tags, guess, review.
CREATE TABLE IF NOT EXISTS field_src (
  entity      TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  field       TEXT NOT NULL,
  src         TEXT NOT NULL,
  confidence  REAL,
  run_id      TEXT,
  at          INTEGER NOT NULL,
  PRIMARY KEY (entity, entity_id, field)
);

-- Decisions the owner has made, applied first in each run. payload carries
-- the ids and the slugs it expects to find; a mismatch fails the directive
-- and changes nothing.
--   merge   {"keep": A, "absorb": B, "expect": {"keep_slug": …, "absorb_slug": …}}
--   rename  {"id": A, "name"?: …, "slug"?: …, "expect": {"slug": …}}
--   brand   {"id": A, "brand": …, "expect": {"slug": …}}
CREATE TABLE IF NOT EXISTS curator_directive (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,
  payload      TEXT NOT NULL CHECK (json_valid(payload)),
  status       TEXT NOT NULL DEFAULT 'approved',   -- approved | applied | failed
  approved_by  TEXT NOT NULL,
  approved_at  INTEGER NOT NULL,
  applied_at   INTEGER,
  result       TEXT,
  source       TEXT
);

ALTER TABLE merge_candidate ADD COLUMN ai_verdict TEXT;   -- JSON {verdict,confidence,evidence,differences,models,prompt_v,at}
ALTER TABLE merge_candidate ADD COLUMN keep_id INTEGER;   -- survivor by the shared rule
ALTER TABLE merge_candidate ADD COLUMN source TEXT;       -- heuristic | embedding | owner
-- merge_candidate.status gains 'dismissed': the AI says different; hidden by
-- default, and never counted as the owner's rejection.

-- ------------------------------------------------------------ backfill
-- The owner's locks, from audit (read-only check on production 2026-09-30:
-- 31 name and brand edits from the 09-29 names batch, 26 wingspan edits;
-- status-only edits lock nothing). audit.detail is cut at 2,000 characters and
-- may not be valid JSON, so fields are matched with LIKE. A wingspan the owner
-- saved blank is not locked: the saved specs do not say which key was edited.
INSERT OR IGNORE INTO field_src (entity, entity_id, field, src, confidence, run_id, at)
SELECT 'master', m.id, f.field, 'owner', NULL, NULL, MAX(a.at)
FROM audit a
JOIN master_model m ON m.id = CAST(a.entity_id AS INTEGER)
JOIN (
  SELECT 'brand' AS field, '%"brand":%' AS pat, NULL AS notpat
  UNION ALL SELECT 'name', '%"name":%', NULL
  UNION ALL SELECT 'slug', '%"slug":%', NULL
  UNION ALL SELECT 'blurb', '%"blurb":%', NULL
  UNION ALL SELECT 'specs.spanMM', '%"specs":%spanMM\":%', '%spanMM\":\"\"%'
) f ON a.detail LIKE f.pat AND (f.notpat IS NULL OR a.detail NOT LIKE f.notpat)
WHERE a.action = 'master-update'
  AND a.actor IN ('admin', 'owner (seo-2026-09 names)', 'owner (seo-2026-09 aliases)')
GROUP BY m.id, f.field;

-- Values accepted when a listing was approved as a new model: the curator may
-- fill their blanks and clean an obviously seller-style name, nothing else.
-- Matched through the approved slug, or the alias it became after a rename.
INSERT OR IGNORE INTO field_src (entity, entity_id, field, src, confidence, run_id, at)
SELECT 'master', m.id, f.field, 'owner-approved', NULL, NULL, MAX(a.at)
FROM audit a
JOIN master_model m ON m.id = COALESCE(
  (SELECT x.id FROM master_model x WHERE x.slug = CASE WHEN json_valid(a.detail) THEN json_extract(a.detail, '$.slug') END),
  (SELECT s.master_model_id FROM slug_alias s WHERE s.old_slug = CASE WHEN json_valid(a.detail) THEN json_extract(a.detail, '$.slug') END))
CROSS JOIN (SELECT 'brand' AS field UNION ALL SELECT 'name' UNION ALL SELECT 'slug' UNION ALL SELECT 'specs.spanMM') f
WHERE a.action = 'approve-new-master' AND a.actor IN ('admin', 'assistant-batch')
GROUP BY m.id, f.field;

-- The owner's approved Sky Surfer merges and rename
-- (docs/seo-2026-09/sky-surfer-merge-proposal.md), in order. #68 keeps its
-- brand "MapBird"; #425 and #514 are left alone, as the proposal says.
INSERT INTO curator_directive (kind, payload, status, approved_by, approved_at, source)
SELECT kind, payload, 'approved', 'owner', 1790726400000, 'docs/seo-2026-09/sky-surfer-merge-proposal.md'
FROM (
  SELECT 1 AS ord, 'merge' AS kind, '{"keep":67,"absorb":66,"expect":{"keep_slug":"x-uav-sky-surfer-v3","absorb_slug":"x-uav-sky-surfer-x8"}}' AS payload
  UNION ALL SELECT 2, 'merge', '{"keep":67,"absorb":193,"expect":{"keep_slug":"x-uav-sky-surfer-v3","absorb_slug":"x-uav-sky-surfer-original-fm"}}'
  UNION ALL SELECT 3, 'rename', '{"id":67,"name":"Sky Surfer X8 1400mm","slug":"x-uav-sky-surfer-x8","expect":{"slug":"x-uav-sky-surfer-v3"}}'
  UNION ALL SELECT 4, 'merge', '{"keep":68,"absorb":423,"expect":{"keep_slug":"mapbird-skysurfer","absorb_slug":"mapbird-skysurfer-1400mm-trainer"}}'
)
WHERE NOT EXISTS (SELECT 1 FROM curator_directive WHERE source = 'docs/seo-2026-09/sky-surfer-merge-proposal.md')
ORDER BY ord;

-- The curator starts in dry-run: its first run writes a plan and a report,
-- and changes nothing until the owner applies the plan or switches to live.
INSERT OR IGNORE INTO setting (k, v) VALUES
  ('curator_enabled', '1'),
  ('curator_mode', 'dry'),
  ('curator_ai', '1'),
  ('curator_neuron_cap', '8000'),
  ('curator_automerge_max', '25'),
  ('curator_scale', '1');
