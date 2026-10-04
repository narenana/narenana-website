-- First-party anonymous usage counters for the log viewer (and the rest
-- of the site). Pure aggregate tallies: one row per (day, event, dim),
-- no IP, no user id, no cookies, no filenames — not personal data, so
-- it is complete (not consent-undercounted like GA) and real-time.
CREATE TABLE IF NOT EXISTS lv_usage (
  day   TEXT    NOT NULL,            -- YYYY-MM-DD (UTC)
  event TEXT    NOT NULL,            -- log_loaded | parse_failed | ...
  dim   TEXT    NOT NULL DEFAULT '', -- format / reason bucket / ''
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, dim)
);
