-- REC 4 data: brands and plain model names for public product pages.
--
-- FOR THE OWNER TO REVIEW AND RUN. Not applied to production. Test locally:
--   npx wrangler d1 execute CATALOG_DB --local  --file docs/seo-2026-09/product-brands-names.sql
-- Production, once reviewed:
--   npx wrangler d1 execute CATALOG_DB --remote --file docs/seo-2026-09/product-brands-names.sql
--
-- Built from read-only SELECTs on production D1 (2026-09-29). The full list,
-- with seller-title evidence, is product-brands-names.csv. Only its
-- 'high' rows are here (31 UPDATEs); 'medium', 'owner' and 'merge' rows
-- wait for the owner, and colour/kit variants wait for rec 6's merges.
--
-- What each UPDATE does, and only this: brand, name, their normalised forms
-- (brand_norm/name_norm, same rule as normName in catalog/lib/util.mjs and the
-- admin's master-update) and updated_at (the product's sitemap lastmod, which
-- also sends it to IndexNow on the next hourly run). Slugs are NOT changed:
-- slug renames wait for rec 6's alias table so old URLs 301.
--
-- Guarded: each UPDATE applies only if brand and name are still what was read
-- on 2026-09-29, so an admin edit made since then is never overwritten. The
-- audit row is written only when its UPDATE changed the row.
-- No new brand+name pair collides with an existing master (checked against
-- all 419 masters, UNIQUE(category_id, brand_norm, name_norm)).
--
-- Public effect once the edge cache turns over (15 min): titles, H1s,
-- breadcrumbs, Product JSON-LD and card names use the new names; the
-- brandless TA Horizons and QIDI models get a Brand.

-- #119 heewing-hunter-j20-pnp-kit: seller title (lower case, config words)
UPDATE master_model SET brand = 'HEEWING', name = 'Hunter J20', brand_norm = 'heewing', name_norm = 'hunter j20', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 119 AND brand = 'HEEWING' AND name = 'hunter j20 pnp kit';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '119', '{"brand":"HEEWING","name":"Hunter J20","from":{"brand":"HEEWING","name":"hunter j20 pnp kit"}}' WHERE changes() = 1;

-- #121 volantex-rc-sport-cub-s2: seller title in capitals
UPDATE master_model SET brand = 'Volantex', name = 'Sport Cub S2', brand_norm = 'volantex', name_norm = 'sport cub s2', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 121 AND brand = 'Volantex' AND name = 'RC SPORT CUB S2';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '121', '{"brand":"Volantex","name":"Sport Cub S2","from":{"brand":"Volantex","name":"RC SPORT CUB S2"}}' WHERE changes() = 1;

-- #124 wltoys-f959s-sky-king-2-4g-3ch-6-axis-rtf-rc-airplane-blue: seller title (radio spec, RTF, colour)
UPDATE master_model SET brand = 'WLtoys', name = 'F959S Sky King', brand_norm = 'wltoys', name_norm = 'f959s sky king', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 124 AND brand = 'WLtoys' AND name = 'F959S SKY-KING 2.4G 3CH 6-AXIS RTF RC AIRPLANE BLUE';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '124', '{"brand":"WLtoys","name":"F959S Sky King","from":{"brand":"WLtoys","name":"F959S SKY-KING 2.4G 3CH 6-AXIS RTF RC AIRPLANE BLUE"}}' WHERE changes() = 1;

-- #130 volantex-rc-trainstar-ascent-1400mm-747-8-pnp-unleash-superi: seller slogan ("Unleash Superior Perfo…"), cut at 60 characters
UPDATE master_model SET brand = 'Volantex', name = 'Trainstar Ascent 1400mm (747-8)', brand_norm = 'volantex', name_norm = 'trainstar ascent 1400mm 747 8', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 130 AND brand = 'Volantex' AND name = 'RC Trainstar Ascent 1400mm 747-8 PNP: Unleash Superior Perfo';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '130', '{"brand":"Volantex","name":"Trainstar Ascent 1400mm (747-8)","from":{"brand":"Volantex","name":"RC Trainstar Ascent 1400mm 747-8 PNP: Unleash Superior Perfo"}}' WHERE changes() = 1;

-- #132 volantex-rc-phoenix-2000-v2-soar-to-new-heights-with-precisi: seller slogan ("Soar to New Heights…"), cut at 60 characters
UPDATE master_model SET brand = 'Volantex', name = 'Phoenix 2000 V2', brand_norm = 'volantex', name_norm = 'phoenix 2000 v2', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 132 AND brand = 'Volantex' AND name = 'RC Phoenix 2000 V2: Soar to New Heights with Precision and P';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '132', '{"brand":"Volantex","name":"Phoenix 2000 V2","from":{"brand":"Volantex","name":"RC Phoenix 2000 V2: Soar to New Heights with Precision and P"}}' WHERE changes() = 1;

-- #134 volantex-rc-phoenix-s-4-channel-glider-with-1600mm-wingspan-: seller title cut at 60 characters
UPDATE master_model SET brand = 'Volantex', name = 'Phoenix S 1600mm (742-7)', brand_norm = 'volantex', name_norm = 'phoenix s 1600mm 742 7', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 134 AND brand = 'Volantex' AND name = 'RC Phoenix S 4 Channel Glider with 1600MM Wingspan and Strea';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '134', '{"brand":"Volantex","name":"Phoenix S 1600mm (742-7)","from":{"brand":"Volantex","name":"RC Phoenix S 4 Channel Glider with 1600MM Wingspan and Strea"}}' WHERE changes() = 1;

-- #135 volantex-ranger-2000-v757-8-2000mm-wingspan-epo-fpv-aircraft: seller title cut at 60 characters
UPDATE master_model SET brand = 'Volantex', name = 'Ranger 2000 (757-8)', brand_norm = 'volantex', name_norm = 'ranger 2000 757 8', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 135 AND brand = 'Volantex' AND name = 'Ranger 2000 V757-8 2000mm Wingspan EPO FPV Aircraft RC Airpl';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '135', '{"brand":"Volantex","name":"Ranger 2000 (757-8)","from":{"brand":"Volantex","name":"Ranger 2000 V757-8 2000mm Wingspan EPO FPV Aircraft RC Airpl"}}' WHERE changes() = 1;

-- #137 volantex-rc-asw28-v2-2-6m-plastic-unibody-scale-glider-759-1: seller title (material, config)
UPDATE master_model SET brand = 'Volantex', name = 'ASW28 V2 2.6m (759-1)', brand_norm = 'volantex', name_norm = 'asw28 v2 2 6m 759 1', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 137 AND brand = 'Volantex' AND name = 'RC ASW28 V2 2.6m Plastic Unibody Scale Glider 759-1 PNP';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '137', '{"brand":"Volantex","name":"ASW28 V2 2.6m (759-1)","from":{"brand":"Volantex","name":"RC ASW28 V2 2.6m Plastic Unibody Scale Glider 759-1 PNP"}}' WHERE changes() = 1;

-- #138 volantex-rc-phoenix-2400-6-channel-glider-with-2400-mm-wings: seller title cut at 60 characters (out of stock)
UPDATE master_model SET brand = 'Volantex', name = 'Phoenix 2400 (759-3)', brand_norm = 'volantex', name_norm = 'phoenix 2400 759 3', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 138 AND brand = 'Volantex' AND name = 'RC Phoenix 2400 6 Channel Glider With 2400 mm Wings 759-3 PN';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '138', '{"brand":"Volantex","name":"Phoenix 2400 (759-3)","from":{"brand":"Volantex","name":"RC Phoenix 2400 6 Channel Glider With 2400 mm Wings 759-3 PN"}}' WHERE changes() = 1;

-- #139 volantex-rc-t-28-trojan-4ch-airplane-with-xpilot-stabilizer: seller title ("with Xpilot Stabilizer")
UPDATE master_model SET brand = 'Volantex', name = 'T-28 Trojan (761-9)', brand_norm = 'volantex', name_norm = 't 28 trojan 761 9', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 139 AND brand = 'Volantex' AND name = 'RC T-28 Trojan 4CH Airplane with Xpilot Stabilizer';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '139', '{"brand":"Volantex","name":"T-28 Trojan (761-9)","from":{"brand":"Volantex","name":"RC T-28 Trojan 4CH Airplane with Xpilot Stabilizer"}}' WHERE changes() = 1;

-- #140 volantex-rc-mini-trainstar-400mm-6-axis-gyro-airplane-761-1-: seller title (gyro, RTF)
UPDATE master_model SET brand = 'Volantex', name = 'Mini Trainstar (761-1)', brand_norm = 'volantex', name_norm = 'mini trainstar 761 1', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 140 AND brand = 'Volantex' AND name = 'RC Mini Trainstar 400mm 6-Axis Gyro Airplane 761-1 RTF';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '140', '{"brand":"Volantex","name":"Mini Trainstar (761-1)","from":{"brand":"Volantex","name":"RC Mini Trainstar 400mm 6-Axis Gyro Airplane 761-1 RTF"}}' WHERE changes() = 1;

-- #141 volantex-rc-mustang-p51d-750mm-warbird-768-1-rtf: seller title ("Warbird", RTF)
UPDATE master_model SET brand = 'Volantex', name = 'P-51D Mustang 750mm (768-1)', brand_norm = 'volantex', name_norm = 'p 51d mustang 750mm 768 1', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 141 AND brand = 'Volantex' AND name = 'RC Mustang P51D 750mm Warbird 768-1 RTF';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '141', '{"brand":"Volantex","name":"P-51D Mustang 750mm (768-1)","from":{"brand":"Volantex","name":"RC Mustang P51D 750mm Warbird 768-1 RTF"}}' WHERE changes() = 1;

-- #123 qidi-cross-country-aircraft-qidi-560-m7-51-2cm-wing-span-37c: seller title in capitals, cut at 60 characters
UPDATE master_model SET brand = 'QIDI', name = '560 M7 (red)', brand_norm = 'qidi', name_norm = '560 m7 red', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 123 AND brand = 'QIDI' AND name = 'CROSS-COUNTRY AIRCRAFT QIDI-560 M7 51.2CM WING SPAN 37CM FUS';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '123', '{"brand":"QIDI","name":"560 M7 (red)","from":{"brand":"QIDI","name":"CROSS-COUNTRY AIRCRAFT QIDI-560 M7 51.2CM WING SPAN 37CM FUS"}}' WHERE changes() = 1;

-- #248 qidi-560-m7: brandless
UPDATE master_model SET brand = 'QIDI', name = '560 M7 (blue)', brand_norm = 'qidi', name_norm = '560 m7 blue', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 248 AND brand = '' AND name = 'QIDI-560 M7';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '248', '{"brand":"QIDI","name":"560 M7 (blue)","from":{"brand":"","name":"QIDI-560 M7"}}' WHERE changes() = 1;

-- #491 xuwing-fpv-xbird-800mm-kit-version: seller title in capitals ("FPV … KIT VERSION")
UPDATE master_model SET brand = 'XUWING', name = 'XBird 800mm', brand_norm = 'xuwing', name_norm = 'xbird 800mm', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 491 AND brand = 'XUWING' AND name = 'FPV XBIRD 800MM KIT VERSION';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '491', '{"brand":"XUWING","name":"XBird 800mm","from":{"brand":"XUWING","name":"FPV XBIRD 800MM KIT VERSION"}}' WHERE changes() = 1;

-- #492 xuwing-albabird-1100mm-v2-kit: seller title in capitals ("KIT")
UPDATE master_model SET brand = 'XUWING', name = 'Albabird 1100mm V2', brand_norm = 'xuwing', name_norm = 'albabird 1100mm v2', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 492 AND brand = 'XUWING' AND name = 'ALBABIRD 1100MM V2 KIT';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '492', '{"brand":"XUWING","name":"Albabird 1100mm V2","from":{"brand":"XUWING","name":"ALBABIRD 1100MM V2 KIT"}}' WHERE changes() = 1;

-- #489 fms-ta-horizons-37-fancy-extra-kit-green-blue-kit: brandless; seller title with colour and "Kit … kit"
UPDATE master_model SET brand = 'TA Horizons', name = 'Fancy Extra 37in', brand_norm = 'ta horizons', name_norm = 'fancy extra 37in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 489 AND brand = '' AND name = 'Ta Horizons 37" Fancy Extra Kit(Green/Blue) kit';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '489', '{"brand":"TA Horizons","name":"Fancy Extra 37in","from":{"brand":"","name":"Ta Horizons 37\" Fancy Extra Kit(Green/Blue) kit"}}' WHERE changes() = 1;

-- #460 33-laser-z2300-kit-only-rt-scheme: brandless; "33%" for a 33in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Laser Z2300 33in (RT scheme)', brand_norm = 'ta horizons', name_norm = 'laser z2300 33in rt scheme', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 460 AND brand = '' AND name = 'Laser Z2300 33% (RT scheme)';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '460', '{"brand":"TA Horizons","name":"Laser Z2300 33in (RT scheme)","from":{"brand":"","name":"Laser Z2300 33% (RT scheme)"}}' WHERE changes() = 1;

-- #461 33-laser-z2300-kit-only-sh-scheme: brandless; "33%" for a 33in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Laser Z2300 33in (SH scheme)', brand_norm = 'ta horizons', name_norm = 'laser z2300 33in sh scheme', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 461 AND brand = '' AND name = 'Laser Z2300 33% (SH scheme)';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '461', '{"brand":"TA Horizons","name":"Laser Z2300 33in (SH scheme)","from":{"brand":"","name":"Laser Z2300 33% (SH scheme)"}}' WHERE changes() = 1;

-- #464 37-laser-z2300-pnp-combo: brandless; "37%" for a 37in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Laser Z2300 37in', brand_norm = 'ta horizons', name_norm = 'laser z2300 37in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 464 AND brand = '' AND name = 'Laser Z2300 37%';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '464', '{"brand":"TA Horizons","name":"Laser Z2300 37in","from":{"brand":"","name":"Laser Z2300 37%"}}' WHERE changes() = 1;

-- #467 37-laser-z2300-kit-only-rr-scheme: brandless; "37%" for a 37in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Laser Z2300 37in (RR scheme)', brand_norm = 'ta horizons', name_norm = 'laser z2300 37in rr scheme', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 467 AND brand = '' AND name = 'Laser Z2300 37% (RR scheme)';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '467', '{"brand":"TA Horizons","name":"Laser Z2300 37in (RR scheme)","from":{"brand":"","name":"Laser Z2300 37% (RR scheme)"}}' WHERE changes() = 1;

-- #469 37-extra-sx-kit-only-aj-scheme: brandless; "37%" for a 37in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Extra SX 37in (AJ scheme)', brand_norm = 'ta horizons', name_norm = 'extra sx 37in aj scheme', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 469 AND brand = '' AND name = 'Extra SX 37% (AJ scheme)';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '469', '{"brand":"TA Horizons","name":"Extra SX 37in (AJ scheme)","from":{"brand":"","name":"Extra SX 37% (AJ scheme)"}}' WHERE changes() = 1;

-- #474 33-wicked-slick-pro-v2-kit-only-aj-scheme: brandless; "33%" for a 33in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Wicked Slick Pro V2 33in (AJ scheme)', brand_norm = 'ta horizons', name_norm = 'wicked slick pro v2 33in aj scheme', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 474 AND brand = '' AND name = 'Wicked Slick Pro V2 33% (AJ scheme)';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '474', '{"brand":"TA Horizons","name":"Wicked Slick Pro V2 33in (AJ scheme)","from":{"brand":"","name":"Wicked Slick Pro V2 33% (AJ scheme)"}}' WHERE changes() = 1;

-- #476 33-wicked-slick-pro-kit-only: brandless; "33%" for a 33in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Wicked Slick Pro 33in', brand_norm = 'ta horizons', name_norm = 'wicked slick pro 33in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 476 AND brand = '' AND name = 'Wicked Slick Pro 33%';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '476', '{"brand":"TA Horizons","name":"Wicked Slick Pro 33in","from":{"brand":"","name":"Wicked Slick Pro 33%"}}' WHERE changes() = 1;

-- #480 37-wicked-slick-pro-v2-kit-only-aj-scheme: brandless; "37%" for a 37in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Wicked Slick Pro V2 37in (AJ scheme)', brand_norm = 'ta horizons', name_norm = 'wicked slick pro v2 37in aj scheme', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 480 AND brand = '' AND name = 'Wicked Slick Pro V2 37% (AJ scheme)';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '480', '{"brand":"TA Horizons","name":"Wicked Slick Pro V2 37in (AJ scheme)","from":{"brand":"","name":"Wicked Slick Pro V2 37% (AJ scheme)"}}' WHERE changes() = 1;

-- #481 33-mighty-edge-kit-only: brandless; "33%" for a 33in plane
UPDATE master_model SET brand = 'TA Horizons', name = 'Mighty Edge 33in', brand_norm = 'ta horizons', name_norm = 'mighty edge 33in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 481 AND brand = '' AND name = 'Mighty Edge 33%';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '481', '{"brand":"TA Horizons","name":"Mighty Edge 33in","from":{"brand":"","name":"Mighty Edge 33%"}}' WHERE changes() = 1;

-- #459 34-pro-extra-v3-ultralight-3d-4d-kit-only: brandless; seller title in lower case ("kit only")
UPDATE master_model SET brand = 'TA Horizons', name = 'Pro Extra V3 Ultralight 34in', brand_norm = 'ta horizons', name_norm = 'pro extra v3 ultralight 34in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 459 AND brand = '' AND name = '34 pro extra v3 ultralight 3d 4d kit only';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '459', '{"brand":"TA Horizons","name":"Pro Extra V3 Ultralight 34in","from":{"brand":"","name":"34 pro extra v3 ultralight 3d 4d kit only"}}' WHERE changes() = 1;

-- #462 34-pro-extra-v3-3d-4d-pnp-combo: brandless; seller title in lower case ("pnp combo")
UPDATE master_model SET brand = 'TA Horizons', name = 'Pro Extra V3 34in', brand_norm = 'ta horizons', name_norm = 'pro extra v3 34in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 462 AND brand = '' AND name = '34 pro extra v3 3d 4d pnp combo';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '462', '{"brand":"TA Horizons","name":"Pro Extra V3 34in","from":{"brand":"","name":"34 pro extra v3 3d 4d pnp combo"}}' WHERE changes() = 1;

-- #320 stol-x-40in: brandless
UPDATE master_model SET brand = 'TA Horizons', name = 'STOL X 40in', brand_norm = 'ta horizons', name_norm = 'stol x 40in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 320 AND brand = '' AND name = 'STOL X 40in';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '320', '{"brand":"TA Horizons","name":"STOL X 40in","from":{"brand":"","name":"STOL X 40in"}}' WHERE changes() = 1;

-- #321 extra-ng-37in-3d: brandless
UPDATE master_model SET brand = 'TA Horizons', name = 'Extra NG 37in', brand_norm = 'ta horizons', name_norm = 'extra ng 37in', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 321 AND brand = '' AND name = 'Extra NG 37in 3D';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '321', '{"brand":"TA Horizons","name":"Extra NG 37in","from":{"brand":"","name":"Extra NG 37in 3D"}}' WHERE changes() = 1;

-- #116 aeromodellingtutor-pt19-sparingly-used-model-like-new: condition in the name ("Sparingly used model like NEW")
UPDATE master_model SET brand = 'Aeromodellingtutor', name = 'PT-19', brand_norm = 'aeromodellingtutor', name_norm = 'pt 19', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 116 AND brand = 'Aeromodellingtutor' AND name = 'PT19 Sparingly used model like NEW';
INSERT INTO audit (at, actor, action, entity, entity_id, detail) SELECT CAST(strftime('%s','now') AS INTEGER) * 1000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '116', '{"brand":"Aeromodellingtutor","name":"PT-19","from":{"brand":"Aeromodellingtutor","name":"PT19 Sparingly used model like NEW"}}' WHERE changes() = 1;
-- Check: every row below should show the proposed brand and name.
SELECT id, slug, brand, name FROM master_model WHERE id IN (119, 121, 124, 130, 132, 134, 135, 137, 138, 139, 140, 141, 123, 248, 491, 492, 489, 460, 461, 464, 467, 469, 474, 476, 480, 481, 459, 462, 320, 321, 116) ORDER BY id;
