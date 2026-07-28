-- Owner-adjustable popularity multiplier. YouTube reach and community esteem
-- diverge for a handful of models (mass-market toys vs hobbyist staples);
-- pop_boost lets the owner nudge exactly those without touching the formula.
-- NULL/1.0 = neutral. Applied as: pop_score = raw × availability × boost.
-- NOT replay-safe (SQLite ALTER): apply via `wrangler d1 migrations apply catalog --remote`
ALTER TABLE master_model ADD COLUMN pop_boost REAL;
