-- REC 5 data: offer configurations that the seller's own listing contradicts.
--
-- FOR THE OWNER TO REVIEW AND RUN. Not applied to production. Test locally:
--   npx wrangler d1 execute CATALOG_DB --local  --file docs/seo-2026-09/offer-config-labels.sql
-- Production, once reviewed:
--   npx wrangler d1 execute CATALOG_DB --remote --file docs/seo-2026-09/offer-config-labels.sql
--
-- Built from a read-only SELECT on production D1 (2026-09-29): every approved
-- offer stored as 'kit' on a ready or retired Wings model (360 offers). 'kit' is what
-- detectConfig() and the approve form fall back to when nothing is named, so
-- the public pages no longer take it at its word (statedConfig in
-- catalog/lib/product-overview.mjs). Of the 360:
--   92 say kit, airframe or frame only: nothing to do.
--   97 say ARF: shown as ARF already; 'arf' is not in the category's
--      config list, so they stay 'kit' here.
--   20 name RTF, PNP or a combo in the title (or URL): the UPDATEs below.
--   151 say nothing: shown as 'Configuration not stated' and left out of
--      the Kit price band. By seller: havochobby 46, aeromodellingtutor 42, vortex-rc 29, flightmode 22, flyingmachines 10, drkstore 1, robosynckits 1.
--      Owner call, per seller: if a seller's base price is always the bare
--      airframe (e.g. Vortex-RC), that needs a per-seller rule in code;
--      changing offer.config alone will not show them as kits.
-- The full list, with titles and URLs, is offer-config-labels.csv.
--
-- The pages already read these listings correctly; this makes the stored
-- data agree, so the admin and the product pages' AggregateOffer grouping
-- (comparableOffers groups by stored config) stop mixing configurations.
-- Guarded: each UPDATE applies only while the offer is still 'kit'.

-- xuwing-albabird-xl-vtol · anubisrc · ₹124999 · XUWING ALBABIRD-XL 1500MM VTOL FPV PNP KIT(X4+1 PNP COMBO)
UPDATE offer SET config = 'pnp' WHERE sku_id = 694 AND master_model_id = 72 AND config = 'kit';
-- volantex-ranger-2000-v757-8-2000mm-wingspan-epo-fpv-aircraft · flyingmachines · ₹22750 · Volantex Ranger 2000 V757-8 2000mm Wingspan EPO FPV Aircraft RC Airplane PNP
UPDATE offer SET config = 'pnp' WHERE sku_id = 285 AND master_model_id = 135 AND config = 'kit';
-- volantex-rc-asw28-v2-2-6m-plastic-unibody-scale-glider-759-1 · flyingmachines · ₹24500 · Volantex RC ASW28 V2 2.6m Plastic Unibody Scale Glider 759-1 PNP
UPDATE offer SET config = 'pnp' WHERE sku_id = 283 AND master_model_id = 137 AND config = 'kit';
-- volantex-rc-jet-f-16-falcon-2-ch-rc-plane-red · flyingmachines · ₹8500 · VolantexRC F-16 Fighting Falcon RC Jet – Ready-to-Fly Trainer Jet with LED Lights & Xpilot
UPDATE offer SET config = 'rtf' WHERE sku_id = 270 AND master_model_id = 126 AND config = 'kit';
-- volantex-rc-mini-trainstar-400mm-6-axis-gyro-airplane-761-1- · flyingmachines · ₹11999 · Volantex RC Mini Trainstar 400mm 6-Axis Gyro Airplane 761-1 RTF
UPDATE offer SET config = 'rtf' WHERE sku_id = 272 AND master_model_id = 140 AND config = 'kit';
-- volantex-rc-mustang-p51d-750mm-warbird-768-1-rtf · flyingmachines · ₹19700 · Volantex RC Mustang P51D 750mm Warbird 768-1 RTF – Beginner-Friendly Aerobatic RC Airplane
UPDATE offer SET config = 'rtf' WHERE sku_id = 271 AND master_model_id = 141 AND config = 'kit';
-- volantex-rc-p-51d-mustang-beginner-rc-airplane-with-stabiliz · flyingmachines · ₹10500 · VolantexRC P-51D Mustang Beginner RC Airplane with Stabilization – Ready-to-Fly
UPDATE offer SET config = 'rtf' WHERE sku_id = 269 AND master_model_id = 143 AND config = 'kit';
-- volantex-rc-phoenix-2400-6-channel-glider-with-2400-mm-wings · flyingmachines · ₹26400 · Volantex RC Phoenix 2400 6 Channel Glider With 2400 mm Wings 759-3 PNP
UPDATE offer SET config = 'pnp' WHERE sku_id = 282 AND master_model_id = 138 AND config = 'kit';
-- volantex-rc-phoenix-s-4-channel-glider-with-1600mm-wingspan- · flyingmachines · ₹21250 · Volantex RC Phoenix S 4 Channel Glider with 1600MM Wingspan and Streamline ABS Plastic Fus
UPDATE offer SET config = 'pnp' WHERE sku_id = 287 AND master_model_id = 134 AND config = 'kit';
-- volantex-rc-ranger-2400 · flyingmachines · ₹35500 · Volantex RC Ranger 2400 – Professional FPV Carrier 757-9 PNP
UPDATE offer SET config = 'pnp' WHERE sku_id = 284 AND master_model_id = 136 AND config = 'kit';
-- volantex-rc-ranger-600 · flyingmachines · ₹13500 · Volantex RC Ranger 600 | Ready-to-Fly Glider Plane for Beginners & Adults
UPDATE offer SET config = 'rtf' WHERE sku_id = 302 AND master_model_id = 129 AND config = 'kit';
-- volantex-rc-t-28-trojan-4ch-airplane-with-xpilot-stabilizer · flyingmachines · ₹12500 · VolantexRC T-28 Trojan 4CH Airplane with Xpilot Stabilizer – One-Key Aerobatic (761-9 RTF)
UPDATE offer SET config = 'rtf' WHERE sku_id = 273 AND master_model_id = 139 AND config = 'kit';
-- volantex-rc-trainstar-ascent-1400mm-747-8-pnp-unleash-superi · flyingmachines · ₹27565 · Volantex RC Trainstar Ascent 1400mm 747-8 PNP: Unleash Superior Performance and Control
UPDATE offer SET config = 'pnp' WHERE sku_id = 300 AND master_model_id = 130 AND config = 'kit';
-- x-uav-sky-surfer-v3 · flyingmachines · ₹13999 · X-UAV Original Sky Surfer X8 Sunny-Sky X2212 2450kv 1400mm Wingspan(PNP)
UPDATE offer SET config = 'pnp' WHERE sku_id = 294 AND master_model_id = 67 AND config = 'kit';
-- volantex-rc-ranger-600 · havochobby · ₹23370 · RC AIRPLANE VOLANTEX RANGER 600 BLACK STUNT RTF
UPDATE offer SET config = 'rtf' WHERE sku_id = 311 AND master_model_id = 129 AND config = 'kit';
-- volantex-rc-ranger-600 · havochobby · ₹23370 · RC AIRPLANE VOLANTEX RANGER 600 WHITE STUNT RTF
UPDATE offer SET config = 'rtf' WHERE sku_id = 322 AND master_model_id = 129 AND config = 'kit';
-- wltoys-f959s-sky-king-2-4g-3ch-6-axis-rtf-rc-airplane-blue · havochobby · ₹12850 · WLTOYS F959S SKY-KING 2.4G 3CH 6-AXIS RTF RC AIRPLANE ORANGE
UPDATE offer SET config = 'rtf' WHERE sku_id = 308 AND master_model_id = 124 AND config = 'kit';
-- wltoys-f959s-sky-king-2-4g-3ch-6-axis-rtf-rc-airplane-blue · havochobby · ₹12850 · WLTOYS F959S SKY-KING 2.4G 3CH 6-AXIS RTF RC AIRPLANE BLUE
UPDATE offer SET config = 'rtf' WHERE sku_id = 318 AND master_model_id = 124 AND config = 'kit';
-- xc1 · havochobby · ₹106820 · Rc Aircraft Xc1 Model With Electronics Arf
UPDATE offer SET config = 'combo' WHERE sku_id = 526 AND master_model_id = 401 AND config = 'kit';
-- heewing-t1-ranger · tujorc · ₹19999 · HEEWING T1 Ranger – PNP PRO GRY
UPDATE offer SET config = 'pnp' WHERE sku_id = 71 AND master_model_id = 15 AND config = 'kit';
