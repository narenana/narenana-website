# Sky Surfer merge proposal (SEO rec 6)

For the owner to decide. Nothing here has been run. The data comes from a read-only query of production on 2026-09-29.

Seven separate Wings pages exist for what buyers search as "sky surfer" (the page averages position 68.5). Merging duplicates within each brand gives Google one strong page per plane. Run each merge from the admin's **Merge** action, only after migration `0018_slug_alias` is applied on production, so that each merged page's old address 301s to the page that survives.

| # | Page | Brand / name | Listings | In stock at | What the sellers call it |
|---|---|---|---|---|---|
| 66 | /wings/x-uav-sky-surfer-x8/ | X-UAV Sky Surfer X8 | 1 | none | "X-UAV SKY-SURFER X8 KIT (EPO FOAM)" (robosynckits) |
| 67 | /wings/x-uav-sky-surfer-v3/ | X-UAV Sky Surfer V3 | 3 | 2 sellers | "Sky Surfer V3 … 1400mm PNP" (tujorc, flyingmachines), plus "X-UAV **Original Sky Surfer X8** Sunny-Sky X2212 … 1400mm" |
| 193 | /wings/x-uav-sky-surfer-original-fm/ | X-UAV Sky Surfer Original 1400mm | 1 | none | "X-UAV Original Sky Surfer - PNP" (flightmode) |
| 68 | /wings/mapbird-skysurfer/ | MapBird SkySurfer | 3 | 1 seller | "mapbird skysurfer 1400mm fpv uav trainer kit", "… kit with electronic", "… pnp kit" (uavmarketplace) |
| 423 | /wings/mapbird-skysurfer-1400mm-trainer/ | Mapbird Skysurfer 1400mm Trainer | 1 | none | "MAPBIRD SKYSURFER TRAINER KIT" (havochobby) |
| 425 | /wings/sky-surfer/ | *(no brand)* Sky Surfer | 1 | none | "Rc Airplane Sky Surfer Arf" (havochobby) |
| 514 | /wings/unbranded-sky-surfer-v4-1500/ | Unbranded Sky Surfer V4 1500mm | 1 | none | "Sky Surfer V4" (havochobby) |

None of the seven has a wingspan in its specs, so span can't settle the matches. Every listing that names a size says 1400mm, except the V4 at 1500mm.

## Proposed merges (same brand, same 1400mm airframe)

1. **X-UAV:** merge #66 and #193 into **#67**. #67 is the only X-UAV page with sellers in stock, and one of its listings is already titled "Original Sky Surfer X8". After merging, rename #67 to "Sky Surfer X8 1400mm" and give it #66's short address, `x-uav-sky-surfer-x8`, using the admin's new Page address field. The rename takes over that alias, and `x-uav-sky-surfer-v3` then 301s to it. **Your call:** is X-UAV's "V3" the same airframe as the "X8" and "Original"? The seller titles suggest it is (all 1400mm, same motor class), but check with a seller if unsure.
2. **MapBird:** merge #423 into **#68**, and set the brand to "MapBird" (#423 spells it "Mapbird").

## Left for you

- **#425 "Sky Surfer" (no brand, havochobby ARF):** havochobby also lists the MapBird kit (#423), so this ARF could be MapBird, X-UAV or a generic clone. Merge it into #68 only if you know it is MapBird. Otherwise, set its brand to what the seller confirms, or leave it as is.
- **#514 Sky Surfer V4 1500mm:** a different size, so it stays a separate page. Set its brand if havochobby says who makes it.
- **Cross-brand:** MapBird's SkySurfer is a copy of the X-UAV design. The proposal keeps the two brands as separate pages, because they are different manufacturers with different prices, and the catalog compares sellers of the *same* plane.

## After the merges

- Curl the absorbed addresses (e.g. `/wings/x-uav-sky-surfer-x8/`, `/wings/mapbird-skysurfer-1400mm-trainer/`) and confirm they return 301.
- Watch the "sky surfer" query in Search Console (position 68.5 on 2026-09-29).
