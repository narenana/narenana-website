-- REC 3 step 6: contextual links inside the landing editorials.
--
-- FOR THE OWNER TO REVIEW AND RUN. Not applied to production. Test locally:
--   npx wrangler d1 execute CATALOG_DB --local  --file docs/seo-2026-09/landing-links.sql
-- Production, once reviewed, and AFTER landing-editorial-merge.sql (the jets
-- edit is written for the copy that file puts on /wings/jets/):
--   npx wrangler d1 execute CATALOG_DB --remote --file docs/seo-2026-09/landing-links.sql
--
-- 45 links across 19 of the 20 indexable landings. They go on words the copy already
-- has ("before moving on to sport, aerobatic or scale models" links each of
-- the three); the only new words are on /wings/aerobatic/: "This is not a
-- category to learn on: start on a trainer." Targets are landings in the
-- sitemap today: the eight all-power role pages and /wings/nitro/, plus
-- electric-X / nitro-X only where both halves have 3+ models in stock
-- (trainers, warbirds, scale planes, aerobatic, sport planes). No link goes to
-- electric-fpv/-jets/-gliders (301 since rec 2) or to /wings/electric/ (rec 5
-- folds it into /wings/).
--
-- Not covered: /wings/gliders/ has no phrase that names another type, so it
-- gets no link rather than new copy. No editorial names a product: a model
-- named in evergreen copy goes stale when it sells out (product pages already
-- link their role landing through the breadcrumb, rec 3).
--
-- Guarded and repeatable: each UPDATE applies only while the body has no
-- /wings/ link yet and still contains every phrase it edits, so a second run,
-- or a body edited since 2026-09-29, is left alone.

-- trainers: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'before moving on to sport, aerobatic or scale models.', 'before moving on to <a href="/wings/sport-planes/">sport</a>, <a href="/wings/aerobatic/">aerobatic</a> or <a href="/wings/scale-planes/">scale</a> models.'), 'far simpler than glow engines.', 'far simpler than <a href="/wings/nitro/">glow engines</a>.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'trainers' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'before moving on to sport, aerobatic or scale models.') > 0
  AND instr(body, 'far simpler than glow engines.') > 0;

-- sport-planes: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'rather than pylon racing or hardcore aerobatics.', 'rather than pylon racing or hardcore <a href="/wings/aerobatic/">aerobatics</a>.'), 'the natural first aeroplane after a trainer,', 'the natural first aeroplane after a <a href="/wings/trainers/">trainer</a>,'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'sport-planes' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'rather than pylon racing or hardcore aerobatics.') > 0
  AND instr(body, 'the natural first aeroplane after a trainer,') > 0;

-- aerobatic: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'This is not a category to learn on.', 'This is not a category to learn on: start on a <a href="/wings/trainers/">trainer</a>.'), 'Park-flyer sizes in the 800mm', '<a href="/wings/sport-planes/">Park-flyer</a> sizes in the 800mm'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'aerobatic' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'This is not a category to learn on.') > 0
  AND instr(body, 'Park-flyer sizes in the 800mm') > 0;

-- scale-planes: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'Cessna-style high-wing trainers,', 'Cessna-style high-wing <a href="/wings/trainers/">trainers</a>,'), 'aerobatic and sport monoplanes', '<a href="/wings/aerobatic/">aerobatic</a> and <a href="/wings/sport-planes/">sport</a> monoplanes'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'scale-planes' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'Cessna-style high-wing trainers,') > 0
  AND instr(body, 'aerobatic and sport monoplanes') > 0;

-- warbirds: 1 edit(s)
UPDATE landing_page SET body = REPLACE(body, 'than a high-wing trainer.', 'than a high-wing <a href="/wings/trainers/">trainer</a>.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'warbirds' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'than a high-wing trainer.') > 0;

-- jets: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'EDF jets carry far higher wing loading than trainers,', 'EDF jets carry far higher wing loading than <a href="/wings/trainers/">trainers</a>,'), 'comfortable with low-wing warbirds', 'comfortable with low-wing <a href="/wings/warbirds/">warbirds</a>'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'jets' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'EDF jets carry far higher wing loading than trainers,') > 0
  AND instr(body, 'comfortable with low-wing warbirds') > 0;

-- fpv: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'racing far better than aerobatics.', 'racing far better than <a href="/wings/aerobatic/">aerobatics</a>.'), 'once you can land a trainer confidently.', 'once you can land a <a href="/wings/trainers/">trainer</a> confidently.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'fpv' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'racing far better than aerobatics.') > 0
  AND instr(body, 'once you can land a trainer confidently.') > 0;

-- nitro: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'typically suit sport and trainer sizes,', 'typically suit <a href="/wings/nitro-sport-planes/">sport</a> and <a href="/wings/nitro-trainers/">trainer</a> sizes,'), 'larger scale, aerobatic and warbird airframes.', 'larger <a href="/wings/nitro-scale-planes/">scale</a>, <a href="/wings/nitro-aerobatic/">aerobatic</a> and <a href="/wings/nitro-warbirds/">warbird</a> airframes.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'nitro' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'typically suit sport and trainer sizes,') > 0
  AND instr(body, 'larger scale, aerobatic and warbird airframes.') > 0;

-- electric: 3 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(REPLACE(body, 'look for a high-wing trainer', 'look for a high-wing <a href="/wings/trainers/">trainer</a>'), 'move to low-wing sport, EDF jets and scale warbirds', 'move to low-wing <a href="/wings/sport-planes/">sport</a>, <a href="/wings/jets/">EDF jets</a> and scale <a href="/wings/warbirds/">warbirds</a>'), 'fast warbirds, gliders and sport aerobatic models', 'fast warbirds, <a href="/wings/gliders/">gliders</a> and sport aerobatic models'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'electric' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'look for a high-wing trainer') > 0
  AND instr(body, 'move to low-wing sport, EDF jets and scale warbirds') > 0
  AND instr(body, 'fast warbirds, gliders and sport aerobatic models') > 0;

-- electric-aerobatic: 1 edit(s)
UPDATE landing_page SET body = REPLACE(body, 'circuits and landings on a trainer behind you', 'circuits and landings on a <a href="/wings/trainers/">trainer</a> behind you'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'electric-aerobatic' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'circuits and landings on a trainer behind you') > 0;

-- electric-scale-planes: 1 edit(s)
UPDATE landing_page SET body = REPLACE(body, 'classic light sport types, trainers and small airliners', 'classic light <a href="/wings/sport-planes/">sport</a> types, <a href="/wings/trainers/">trainers</a> and small airliners'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'electric-scale-planes' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'classic light sport types, trainers and small airliners') > 0;

-- electric-sport-planes: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'roll into basic aerobatics like loops and rolls', 'roll into basic <a href="/wings/aerobatic/">aerobatics</a> like loops and rolls'), 'far less mess than a nitro engine.', 'far less mess than a <a href="/wings/nitro-sport-planes/">nitro engine</a>.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'electric-sport-planes' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'roll into basic aerobatics like loops and rolls') > 0
  AND instr(body, 'far less mess than a nitro engine.') > 0;

-- electric-trainers: 1 edit(s)
UPDATE landing_page SET body = REPLACE(body, 'stepping up from a small park flyer,', 'stepping up from a small <a href="/wings/sport-planes/">park flyer</a>,'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'electric-trainers' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'stepping up from a small park flyer,') > 0;

-- electric-warbirds: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'Fly a trainer and then a sport model first;', 'Fly a <a href="/wings/trainers/">trainer</a> and then a <a href="/wings/sport-planes/">sport model</a> first;'), 'without any glow-fuel mess', 'without any <a href="/wings/nitro-warbirds/">glow-fuel</a> mess'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'electric-warbirds' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'Fly a trainer and then a sport model first;') > 0
  AND instr(body, 'without any glow-fuel mess') > 0;

-- nitro-aerobatic: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'Get comfortable on a trainer, and ideally a low-wing sport model, before moving here.', 'Get comfortable on a <a href="/wings/trainers/">trainer</a>, and ideally a low-wing <a href="/wings/sport-planes/">sport model</a>, before moving here.'), 'rather than an electric motor, so you get long flight times', 'rather than an <a href="/wings/electric-aerobatic/">electric motor</a>, so you get long flight times'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'nitro-aerobatic' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'Get comfortable on a trainer, and ideally a low-wing sport model, before moving here.') > 0
  AND instr(body, 'rather than an electric motor, so you get long flight times') > 0;

-- nitro-scale-planes: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'high-wing trainers, sport cruisers and classic light aircraft', 'high-wing <a href="/wings/nitro-trainers/">trainers</a>, sport cruisers and classic light aircraft'), 'powered by a combustion engine instead of an electric motor.', 'powered by a combustion engine instead of an <a href="/wings/electric-scale-planes/">electric motor</a>.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'nitro-scale-planes' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'high-wing trainers, sport cruisers and classic light aircraft') > 0
  AND instr(body, 'powered by a combustion engine instead of an electric motor.') > 0;

-- nitro-sport-planes: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'moved past their first trainer', 'moved past their first <a href="/wings/nitro-trainers/">trainer</a>'), 'learning on an electric trainer first.', 'learning on an <a href="/wings/electric-trainers/">electric trainer</a> first.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'nitro-sport-planes' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'moved past their first trainer') > 0
  AND instr(body, 'learning on an electric trainer first.') > 0;

-- nitro-trainers: 1 edit(s)
UPDATE landing_page SET body = REPLACE(body, 'still prefer them over electric.', 'still prefer them over <a href="/wings/electric-trainers/">electric</a>.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'nitro-trainers' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'still prefer them over electric.') > 0;

-- nitro-warbirds: 2 edit(s)
UPDATE landing_page SET body = REPLACE(REPLACE(body, 'log hours on a high-wing trainer first.', 'log hours on a high-wing <a href="/wings/trainers/">trainer</a> first.'), 'powered by a glow (nitro) or petrol engine rather than an electric motor.', 'powered by a glow (nitro) or petrol engine rather than an <a href="/wings/electric-warbirds/">electric motor</a>.'),
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE slug = 'nitro-warbirds' AND instr(body, 'href="/wings/') = 0
  AND instr(body, 'log hours on a high-wing trainer first.') > 0
  AND instr(body, 'powered by a glow (nitro) or petrol engine rather than an electric motor.') > 0;
-- Check: links per landing.
SELECT slug, (length(body) - length(replace(body, '<a href=', ''))) / 8 AS links FROM landing_page ORDER BY slug;
