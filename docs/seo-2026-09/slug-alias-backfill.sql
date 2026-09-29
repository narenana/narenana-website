-- REC 6: 301 the product URLs Search Console reports as 404 to the model that
-- absorbed them.
--
-- FOR THE OWNER TO REVIEW AND RUN, after the migration. Not applied to
-- production. Order:
--   1. npx wrangler d1 migrations apply catalog --remote     (0018_slug_alias)
--   2. npx wrangler d1 execute CATALOG_DB --remote --file docs/seo-2026-09/slug-alias-backfill.sql
-- Test locally the same way with --local.
--
-- Scope (plan rec 6, challenge correction): only the slugs Google reports, not
-- every deleted slug. Search Console > Pages > 'Not found (404)' listed 17 URLs
-- on 2026-09-29; 13 were captured. Two of those stay 404 on purpose:
-- /feeds/posts/default (an old Blogger feed) and /wings/nitro-gliders/ (a
-- landing with no models; nothing links there). The other 11 are below. The
-- 4 URLs that were not captured can be added the same way once read from
-- Search Console.
--
-- Mapping: each old slug's 'approve-new-master' audit row names the listing
-- (sku) it was created for; that listing's offer now belongs to the survivor
-- of the merge. Checked with a read-only SELECT on production, 2026-09-29:
-- every one maps to exactly one ready model. Future merges and admin slug
-- renames write their own aliases (catalog/lib/jobs.mjs mergeMasters, the
-- admin 'master' endpoint), so this is a one-off.
--
-- Guarded and repeatable: an alias is written only while its survivor id still
-- exists in the category and no live model owns the old slug; a second run
-- changes nothing (INSERT OR IGNORE on the primary key). The public route also
-- ignores an alias whose survivor is not public, and a live slug always wins.

-- /wings/cessna-182-skylane-nitro/ -> /wings/vmar-cessna-182-skylane-63-5in/ (#254)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'cessna-182-skylane-nitro', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 254 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'cessna-182-skylane-nitro');

-- /wings/hangar-9-j-3-cub-20cc-88/ -> /wings/seagull-models-piper-j-3-cub-15-20cc/ (#361)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'hangar-9-j-3-cub-20cc-88', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 361 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'hangar-9-j-3-cub-20cc-88');

-- /wings/havoc-hobby-spacewalker/ -> /wings/spacewalker-ii-63/ (#183)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'havoc-hobby-spacewalker', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 183 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'havoc-hobby-spacewalker');

-- /wings/seagull-models-arising-star-46/ -> /wings/seagull-models-arising-star-v2-trainer-46/ (#216)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'seagull-models-arising-star-46', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 216 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'seagull-models-arising-star-46');

-- /wings/seagull-models-isport-low-wing-sport-10-15cc/ -> /wings/seagull-models-isport-10-15cc/ (#207)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'seagull-models-isport-low-wing-sport-10-15cc', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 207 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'seagull-models-isport-low-wing-sport-10-15cc');

-- /wings/seagull-models-isport-low-wing-sport-electric/ -> /wings/seagull-models-isport-10-15cc/ (#207)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'seagull-models-isport-low-wing-sport-electric', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 207 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'seagull-models-isport-low-wing-sport-electric');

-- /wings/seagull-models-low-wing-sport-60/ -> /wings/seagull-low-wing-sport-v2-60/ (#185)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'seagull-models-low-wing-sport-60', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 185 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'seagull-models-low-wing-sport-60');

-- /wings/wltoys-f959-sky-king/ -> /wings/wltoys-f959s-sky-king-2-4g-3ch-6-axis-rtf-rc-airplane-blue/ (#124)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'wltoys-f959-sky-king', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 124 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'wltoys-f959-sky-king');

-- /wings/x-uav-original-sky-surfer-x8-sunny-sky-x2212-2450kv-1400mm-w/ -> /wings/x-uav-sky-surfer-v3/ (#67)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'x-uav-original-sky-surfer-x8-sunny-sky-x2212-2450kv-1400mm-w', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 67 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'x-uav-original-sky-surfer-x8-sunny-sky-x2212-2450kv-1400mm-w');

-- /wings/x-uav-sky-surfer-v3-with-a2212-2200kv-1400mm-wingspan/ -> /wings/x-uav-sky-surfer-v3/ (#67)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'x-uav-sky-surfer-v3-with-a2212-2200kv-1400mm-wingspan', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 67 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'x-uav-sky-surfer-v3-with-a2212-2200kv-1400mm-wingspan');

-- /wings/xuwing-albabird-xl-1500mm-vtol-fpv-pnp-kit-x4-1-pnp-combo/ -> /wings/xuwing-albabird-xl-vtol/ (#72)
INSERT OR IGNORE INTO slug_alias (category_id, old_slug, master_model_id, created_at)
SELECT 'wings', 'xuwing-albabird-xl-1500mm-vtol-fpv-pnp-kit-x4-1-pnp-combo', m.id, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM master_model m
WHERE m.id = 72 AND m.category_id = 'wings'
  AND NOT EXISTS (SELECT 1 FROM master_model x WHERE x.category_id = 'wings' AND x.slug = 'xuwing-albabird-xl-1500mm-vtol-fpv-pnp-kit-x4-1-pnp-combo');

INSERT INTO audit (at, actor, action, entity, entity_id, detail)
SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 aliases)', 'slug-alias-backfill', 'slug_alias', 'wings', '{"slugs":11,"source":"Search Console 404 list, 2026-09-29"}'
WHERE NOT EXISTS (SELECT 1 FROM audit WHERE action = 'slug-alias-backfill');

-- Check: every alias and where it goes now (expect 11 rows, all 'ready').
SELECT a.old_slug, m.slug AS now_at, m.status FROM slug_alias a JOIN master_model m ON m.id = a.master_model_id WHERE a.category_id = 'wings' ORDER BY a.old_slug;
