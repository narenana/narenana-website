-- Role / type tags for a master model (multi-label): a JSON array of tags from
-- the fixed role vocabulary, index 0 = primary (card) label. A listing can carry
-- several (a MiG-29 is "Jet / EDF" AND "Warbird"). Assigned by the classify slice
-- (deterministic rules + a Workers AI fallback) for inbound models; the existing
-- catalog was seeded from a reviewed pass (role_source='reviewed').
-- role_source records provenance so a future re-derive can leave human/reviewed
-- labels alone: 'reviewed' | 'rules' | 'ai' | 'human' | NULL (unclassified).
-- NOT replay-safe (SQLite ALTER): apply via `wrangler d1 migrations apply`.

ALTER TABLE master_model ADD COLUMN role_tags   TEXT;  -- JSON string[]; [0] = primary. NULL = unclassified
ALTER TABLE master_model ADD COLUMN role_source TEXT;  -- 'reviewed' | 'rules' | 'ai' | 'human' | NULL
