-- Long-form SEO copy for landing pages (/wings/<slug>/). Content is DATA, not
-- code: drafted, humanised (TextGuard), and reviewed before publish. Rendered
-- below the grid on the matching landing page. Apply via:
--   wrangler d1 migrations apply catalog --remote
CREATE TABLE IF NOT EXISTS landing_page (
  slug        TEXT PRIMARY KEY,   -- e.g. 'warbirds', 'electric-warbirds', 'nitro'
  body        TEXT,               -- HTML long-form content
  published   INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER
);
