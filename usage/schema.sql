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

-- Product feedback from the log viewer's Feedback dialog (POST
-- /api/feedback, usage/lib/feedback.mjs). A row is written only when a
-- visitor presses Send. Stored: the 1–10 rating, the comment as typed
-- (trimmed, ≤ 2000 chars, may be empty), which screen it came from and
-- the minute. NOT stored: IP, user id, cookie, user agent, the log.
CREATE TABLE IF NOT EXISTS lv_feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT    NOT NULL,                      -- 'YYYY-MM-DDTHH:MMZ' (UTC)
  day        TEXT    NOT NULL,                      -- YYYY-MM-DD (UTC)
  product    TEXT    NOT NULL DEFAULT 'log-viewer',
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  comment    TEXT    NOT NULL DEFAULT '',
  context    TEXT    NOT NULL DEFAULT ''            -- landing | blackbox | edgetx-csv | sample
);
CREATE INDEX IF NOT EXISTS lv_feedback_day ON lv_feedback (day);
