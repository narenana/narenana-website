-- REC 2: fold electric-fpv, electric-jets and electric-gliders into their
-- all-power landings (/wings/fpv/, /wings/jets/, /wings/gliders/).
--
-- FOR THE OWNER TO REVIEW AND RUN. Not applied to production. Applied locally
-- only, to test:
--   npx wrangler d1 execute CATALOG_DB --local  --file docs/seo-2026-09/landing-editorial-merge.sql
-- Production, once reviewed:
--   npx wrangler d1 execute CATALOG_DB --remote --file docs/seo-2026-09/landing-editorial-merge.sql
--
-- The code change (catalog/lib/grid-next.mjs validLandings + landingRedirect)
-- 301s electric-X to X while nitro-X has fewer than 3 models in stock, so the
-- electric-X editorial stops being shown. Which copy survives, per pair
-- (bodies compared 2026-09-29; production and the local copy were identical):
--
--   fpv      KEEP fpv as it is. electric-fpv opens with "the immersive end of
--            fixed-wing flying" (a banned word in the brand voice guide); fpv
--            is more specific (line of sight first, video dropouts, failsafe,
--            DGCA rules). No change.
--   gliders  KEEP gliders as it is. It covers motor gliders, pure slope
--            gliders and DLGs, which suits the all-power page; electric-gliders
--            is written for powered gliders only. No change.
--   jets     USE the electric-jets copy (below). It is more specific: fan size
--            to cell count (3S-4S, about 6S, 8S-12S), ESC headroom, retracts,
--            RTF being rare. jets had vaguer lines ("prized for high speed and
--            clean lines", "confident three-channel-plus control"). Three
--            small edits fit it to the all-power page: the H2 and first
--            sentence drop "electric" (the page also lists a nitro jet), and
--            the em dash before the fan sizes becomes a colon.
--
-- The electric-* rows are left untouched on purpose: if nitro-X ever reaches
-- 3 in stock, electric-X serves again with its own copy.
--
-- Guarded: the UPDATE only applies if the jets row has not been edited since
-- it was reviewed (updated_at 1784678039498). Check with the SELECT at the end:
-- body_len should be 1576 after the update.

UPDATE landing_page
SET body = '<h2>What jet and EDF planes are</h2><p>Most jet and EDF (electric ducted fan) planes here swap the usual propeller for a shrouded, multi-blade fan spun by a high-kV inrunner brushless motor. The duct gives scale jet looks, a distinctive turbine-like note and genuinely high speeds. Fan units are sized by diameter: 50mm and 64mm for smaller sport jets, 70mm and 90mm for larger scale models, up to 120mm on big warbirds and airliners. Bigger fans need higher cell counts and pull serious current, so the whole power system has to be matched carefully.</p><p>This is not a beginner category. EDF jets carry far higher wing loading than trainers, which means quick takeoff and landing speeds, little tolerance for slow flying and no propeller drag to help you wash off energy. They reward smooth throttle and planning ahead, and are best flown once you are comfortable with low-wing warbirds and have a large, obstruction-free strip.</p><h2>What an Indian buyer should weigh</h2><p>Most jets here are moulded foam (EPO) sold PNP — airframe, fan unit, ESC and servos fitted, so you add receiver, battery and charger. Ready-to-fly is rare; kits and composite fibreglass-and-balsa airframes are heavier, faster and meant for experienced builders. Match the LiPo to the fan: smaller units usually run 3S-4S, 70-90mm units around 6S, and the biggest 120mm setups 8S-12S, with the ESC rated well above peak current. Check that the battery bay, pack C-rating and retracts suit the model before buying, and budget for a spare fan and a charger that handles the higher pack voltages.</p>',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'jets' AND updated_at = 1784678039498;

SELECT slug, published, length(body) AS body_len, updated_at FROM landing_page WHERE slug IN ('jets', 'electric-jets');
