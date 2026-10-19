# One site: moving every indexable page onto www.narenana.com

**Status (7 Oct, 22:50 IST):** in progress.
- M1 is done.
- M2 is live on all three sites: the website and the Nanawing sim on 6 Oct, Nanawing 2 on 7 Oct. Only the log viewer's items remain, with the log viewer session.
- M3 is next, due **Fri 16 Oct**.

**Window:** Tue 6 Oct → Tue 17 Nov 2026. Results are judged in February 2027.
- **Revised 6 Oct:** M2 finished eight days early, so the later milestones move one week earlier.
- The work now finishes **Tue 10 Nov**, and 11–17 Nov is buffer.
- The 17 Nov deadline is unchanged.

**Owner:** narenana. Every production deploy needs the owner's OK, as usual.
**Covers four repos:**
- `narenana-website`: this repo. It runs www.narenana.com and Wings.
- `fpvsim`: Nanawing, sim.narenana.com.
- `nanawing2`: nanawing2.narenana.com.
- `edgetx-log-parser`: the log viewer, www.narenana.com/log-viewer/.

> ### Changing facts or content before 17 Nov? Update this plan in the same change.
> This applies to any of the four repos, and to people and AI sessions alike. Update the plan if you:
> - change something a visitor can read: maps, courses, aircraft, controls, log formats, feature or privacy claims, prices or seller wording, the header or footer, a page title;
> - add, remove or rename a page or URL.
>
> Then:
> 1. Make your change as usual.
> 2. Add a dated line to the **[Change log](#change-log)** at the bottom: what changed, which repo and commit, and which milestone it touches.
> 3. If a page or URL was added, removed or renamed, update the **[URL map](#url-map)**.
> 4. If a fact changed, update its row in the **[Fact inventory](#fact-inventory)**. Fix the other copies listed there in the same change, or add them to the M2 list.
> 5. If your change moves a milestone's date or scope, edit the milestone and say why in the Change log.
>
> Until M3 (Fri 16 Oct) new pages still go where they go today. From M3 on, every new guide, landing or map page for any product is written in this repo under `content/<product>/`.

---

## 1. The decision (made 6 Oct 2026)

1. **One site.** Every page Google indexes lives on `www.narenana.com`, one folder per product. No product keeps indexable pages on its own subdomain.
2. **Folder names, permanent:** `/nanawing/` for the FPV sim and `/nanawing2/` for Nanawing 2. `/log-viewer/` and `/wings/` stay as they are. These names never change once live.
3. **The homepage is Nanawing's front door.** `www.narenana.com/` stays Nanawing-first and owns the search "nanawing". `sim.narenana.com/` redirects there. `/nanawing/` holds the guides, map pages and leaderboard; `/nanawing/` itself redirects to `/`. The homepage's share tags stay umbrella ("narenana — free RC flight simulators & RC plane prices in India"), as decided on 25 Sep.
4. **The apps stay where they run.** The sims keep running at `sim.narenana.com/?play` and `nanawing2.narenana.com/?play`, hidden from search (noindex). Players keep their saved radio calibration, pilot name, personal bests and offline cache, and installed apps keep working. Only the pages move.
5. **One content home.** Every marketing and content page, for every product, is written and built in this repo. Facts stay owned by the apps, which publish them in a small file that pages read.
6. **Not one big repo.** The four repos stay separate (see [§4](#4-how-content-will-be-managed)).

Rejected: moving the apps themselves under www. It would take about 13–19 engineer-days. Players would lose saved data unless we built a handoff. The sim's offline code would wipe other products' caches on a shared host. Nanawing 2's installed app would claim all of www. The pages would gain nothing in search over this plan. The research is summarised in [§9](#9-evidence).

## 2. Why, and what this will and won't do

**Our numbers** (28 days, 9 Sep–5 Oct 2026):
- Search Console: 247 clicks. sim.narenana.com took 207 of them, and 114 came from the one search "nanawing".
- The log viewer, already a www folder, is the only page set ranking for non-brand searches (positions 6–8). Wings got 5 clicks.
- So nearly all of the site's search value, and the links behind it, sits on a host that Wings, the log viewer and Nanawing 2 don't share.

**What Google says:**
- Subdomains and folders can both rank.
- Google also uses site-wide signals, and it says it "tend[s] to see subdomains apart from root domains".
- Its own staff advise keeping a site together unless a part should "stand on its own".
- On one host, Nanawing's popularity is structurally part of the same site as Wings and the log viewer. On subdomains that isn't guaranteed.

**What it won't do:**
- Fix Wings' rankings. Wings is already on www and averages position 17, so its problem is the pages, not the domain.
- Add traffic together. Google says merged sites don't simply sum.
- Expect a few weeks of swings on "nanawing". Judge the result at about 3 months.

## 3. Target structure

| URL | What lives there | Built in |
|---|---|---|
| `www.narenana.com/` | Nanawing's front door and the umbrella homepage (Nanawing 2, log viewer, Wings sections) | website |
| `/nanawing/guides/`, `/nanawing/guides/<slug>/` | The Nanawing guides | website |
| `/nanawing/maps/island/`, `/nanawing/maps/desert/`, `/nanawing/maps/parkland/` | Map pages (the Island guide merges into the Island map page). Parkland's page was added with the Parkland release (live 14 Oct; Change log, 13 and 14 Oct) | website |
| `/nanawing/leaderboard/` | Live standings, rendered by the Worker from the leaderboard database, so they are crawlable | website |
| `/nanawing2/`, `/nanawing2/guides/how-to-play/` | Nanawing 2 landing page and guide | website |
| `/log-viewer/…` | Unchanged URLs. The page sources move here; the app stays in its repo | website (pages), log viewer repo (app) |
| `/wings/…`, `/videos/…`, `/catalog-methodology/` | Unchanged | website |
| `sim.narenana.com/?play`, `nanawing2.narenana.com/?play` | The apps only, noindexed | app repos |
| `sim.narenana.com/radio-bridge`, the apps' `/404` | App infrastructure, stays | app repos |

## 4. How content will be managed

**Today:**
- 17 facts are copied 3–8 times each across the four repos: maps, courses, aircraft, controls, log formats, claims, header, footer, structured data.
- On 6 Oct, 15 of them disagreed on the live sites (see [§7](#7-live-inconsistencies-to-fix-m2)).
- Nothing ties a feature change in an app to the pages that describe it.

**Hub and spokes:**

- **One content home: this repo.**
  - `content/<product>/*.json` holds every guide, landing and map page. It uses the log viewer's proven page shape: slug, title, meta description, H1, sections, related links.
  - `family/products.json` is the only source for product names, nav captions, URLs, footer and the structured-data entities (one `@id` scheme).
  - One generator, `scripts/build-content.mjs`, builds the pages. It replaces both `scripts/seo-content.mjs`'s patching and the log viewer's `scripts/gen-content.mjs`. It also produces the sitemap and lastmod dates.
- **Facts stay owned by the apps.** Each app's build writes a `product.json` from its own code:
  - Nanawing: maps (with the beta flag), courses with lengths and medals, aircraft and measured specs, keyboard rows, claims.
  - Nanawing 2: selectable aircraft and keymap.
  - Log viewer: formats, firmware limits, what data leaves the browser.
  - Wings: the Worker serves seller and model counts from the database.

  Pages use fact tokens such as `{{nanawing.courses.count}}`. Static homepage text uses `data-fact` spans that the Worker fills from the latest facts, the way the seller count works today. When the sim adds a map, the pages follow.
- **Checks that fail when things disagree:**
  - Each app gets a contract test: its `product.json` must match its code, and its own HTML must not contradict it. This would have caught "5 aircraft".
  - This repo gets a test that every fact token resolves and no content contradicts the facts.
  - Every repo gets a header/footer test.
  - A daily live drift audit crawls all sitemaps and checks the header and footer, counts, beta labels, structured data, lastmod, analytics and broken outbound links. Failures go to one GitHub issue and to `/stats`.
- **Cross-repo flags.**
  - After an app deploys, it notifies this repo (`repository_dispatch`), and a workflow opens a PR such as "facts(nanawing2): aircraft 5 → 8" that lists the pages affected.
  - A change to the family header or footer here opens sync PRs in the app repos.
- **In-app text stays in the app repos:** menus, the hangar, controls screens, the debrief panel, error messages.

**Why not one big repo:**
- The sim repo is about 516 MB of art and terrain, and every checkout and AI session would carry it.
- The website and log viewer are public, while the sims are private with different licences.
- The four apps deploy four different ways: Workers Builds, GitHub Actions, a gated 40–60 minute pipeline, and a manual upload.

## 5. Milestones

Revised 6 Oct. The "Was" column is the original 6 Oct schedule.

| # | Due | Was | What | Status |
|---|---|---|---|---|
| **M1** | **Tue 6 Oct** | Tue 6 Oct | Plan and guardrails | **Done** 6 Oct |
| **M2** | **Wed 14 Oct** | Wed 14 Oct | Fix today's drift in place; merge the two Island pages | **Live** on all three sites: the website and fpvsim 6 Oct, Nanawing 2 7 Oct. Log viewer items with the log viewer session, by Fri 16 Oct |
| **M3** | **Fri 16 Oct** | Wed 21 Oct | One content home, facts files and checks; new pages ready on a preview | Next |
| **M4** | **Tue 20 Oct** | Tue 27 Oct | Nanawing 2's pages move to `/nanawing2/` (the trial run) | — |
| — | 20 Oct → 3 Nov | 27 Oct → 10 Nov | Let Nanawing 2's move settle (Google's advice: one host at a time) | — |
| **M5** | **Wed 4 Nov** | Wed 11 Nov | Nanawing's pages move; the homepage takes over as its front door | — |
| **M6** | **Tue 10 Nov** | Tue 17 Nov | Close-out: links everywhere, off-site links, docs; plan closed | — |
| — | 11–17 Nov | — | Buffer. **Hard deadline Tue 17 Nov** | — |
| — | Mon 23 Nov, Mon 7 Dec | Mon 30 Nov, Mon 14 Dec | Checkpoints; old page copies deleted after 7 Dec | — |
| — | Mon 8 Feb 2027 | Mon 8 Feb 2027 | Three-month verdict on the move | — |

Rough effort: M2 2–3 days, M3 5–7 days, M4 2–3 days, M5 4–6 days, M6 1–2 days.

**How each repo deploys:**
- **website:** Workers Builds on push to `master`, live in about 2 minutes.
- **fpvsim:** GitHub Actions on push to `main`, about 12 minutes.
- **nanawing2:** a PR runs about an hour of gates and a candidate; merging re-runs them on `main` and promotes, about another hour. Merge one PR at a time.
- **log viewer:** a manual upload.

### M1: Plan and guardrails (Tue 6 Oct) — done

- [x] Decisions recorded ([§1](#1-the-decision-made-6-oct-2026)).
- [x] URL map written and frozen ([§6](#url-map)).
- [x] Fact inventory and live inconsistencies listed ([§7](#7-live-inconsistencies-to-fix-m2), [§8](#fact-inventory)).
- [x] Baseline numbers recorded ([§10](#10-measurement)).
- [x] The "update this plan" rule added to all four repos (`CLAUDE.md` and `AGENTS.md`), as docs-only `[skip ci]` commits.

### M2: Fix today's drift in place (due Wed 14 Oct) — live on all three sites

No moves between hosts. One page merge on the sim host. Checklist and status in [§7](#7-live-inconsistencies-to-fix-m2).

- [x] Website live 6 Oct (`2f12b44`).
- [x] fpvsim live 6 Oct (`0de8fe7`, deployed 16:17 UTC).
- [x] Nanawing 2 live 7 Oct, inside Nanawing 2's consolidated release [PR #64](https://github.com/narenana/nanawing2/pull/64) (merged 17:10 UTC as `7195988`, live build `04d4c81e`).
  - Checked live: "8 powered aircraft" with no "5 aircraft" left; the new header and footer; "the Island and the Desert"; no private GitHub link.
  - The guide lists Electric Kato, Extra 3D and Gee Bee.
- [ ] Log viewer items (header and footer, AI Debrief copy, old widget guard), by the log viewer session, by Fri 16 Oct.

Exit: every item in §7 is either fixed or assigned to a later milestone, and the live sites agree with each other.

### M3: One content home, facts files and checks (Fri 16 Oct)

**Started early, 8 Oct: the first content page.** `/nanawing/aircraft/`, built in this repo (branch `feat/nanawing-aircraft-page`). It brings the first pieces of the content home:
- [x] `content/_facts/nanawing.json`: a hand-made snapshot of fpvsim's aircraft, specs, courses and credits, until fpvsim publishes `product.json`.
- [x] `content/nanawing/aircraft.json`: the page copy.
- [x] `scripts/build-nanawing-pages.mjs`: the generator.
- [x] `scripts/page-shell.mjs`: the editorial shell, moved out of `seo-content.mjs`. Both generators use it; the existing pages came out byte-identical.
- [x] Live lap records filled in by the Worker (`src/aircraft-records.js`, through the FPVSIM_BOARD service binding), cached per release like the homepage.

The old sim guide forwards to it (fpvsim `feat/aircraft-page-move`).

Also in M3:
- [x] The 768px sideways scroll, fixed 8 Oct: the header CTA, `family/shell.css` at 761–1080px.
- [ ] The Share button over "Back to the top".
- [ ] One fact-token phrase for Nanawing's controls on www.

Website:
- [ ] Create `family/products.json`, and move `brand-shell.mjs` and the family assets to `family/`. Publish a family manifest with a hash per file.
- [ ] Add `content/<product>/` and `scripts/build-content.mjs`. Port `/videos/*` and `/catalog-methodology/` to them with no visible change.
- [ ] Generate the sitemap's static pages and lastmod from the content sources. This retires `STATIC_PAGE_LASTMOD` and `site/sitemap.xml`. `/log-viewer/` gets a single owner.
- [ ] Generate robots.txt from `products.json`. **Keep crawling allowed on the old hosts**, or Google can't see the redirects.
- [ ] Add `data-fact` spans on the homepage, filled by the Worker from the facts files (hourly cron → KV).
- [ ] Build the new `/nanawing/…` and `/nanawing2/…` pages from the moved sources. Review them on a `wrangler versions upload` preview only; they are not routed in production yet.
- [ ] Write the Nanawing 2 landing page for `/nanawing2/` from its current landing.
- [ ] Decide what of the sim landing (FAQ, controls summary, aircraft, maps) moves into the homepage and what into the guides. Owner review before M5.
- [ ] Add the fact-token test, the header/footer test and the daily drift audit, which updates one GitHub issue and `/stats`.
- [ ] Add the `repository_dispatch` receiver that opens facts PRs.

Each app:
- [ ] fpvsim: write `product.json` at build from `src/world/maps.ts`, `src/race/courses.ts` + `desertCourses.json` + `src/world/parkland/parklandCourses.json` (with each course's aircraft allow-list: Estate Run is Spectre-only), `src/aircraft/catalog.ts` + `src/config/aircraftSpecs.ts`, `src/hud/menuCopy.ts`. Add a contract test that generalises `tools/mapPages.test.mjs`. Map-page images (hero, shots, `tracks.json`) are published alongside it. Until then, www's `content/_facts/nanawing.json` carries the allow-list by hand (`courses[].aircraft`, since 13 Oct).
- [ ] nanawing2: write `product.json` from `lib/aircraft-availability.ts` and `lib/keymap.ts`, plus a contract test.
- [ ] log viewer (the log viewer session): write `product.json` covering formats, firmware limits and data flows. Move `content/pages/*.json` into this repo; URLs are unchanged.
- [ ] All three: `family:sync` (generalising nanawing2's `scripts/sync-brand.mjs`), the header/footer test, and a deploy step that notifies this repo.

Exit: changing a fact in an app's code opens a PR here, and a contradicting page fails CI.

### M4: Nanawing 2's pages move (Tue 20 Oct)

Open the Nanawing 2 PR by **Mon 19 Oct**: its gates take about an hour, and the merge takes another hour on `main`. Merge only when no other Nanawing 2 release is running, and check with the Nanawing 2 session first.

- [ ] Before the redirect, point every "Fly"/"Play" link for Nanawing 2, in all four repos, at `nanawing2.narenana.com/?play…`. A link to the bare root would bounce back to www.
- [ ] Mark the app's HTML noindex. It is only ever served for `?play` once the root redirects.
- [ ] Route `/nanawing2/` and `/nanawing2/guides/how-to-play/` in production and add them to the www sitemap.
- [ ] **Owner, Cloudflare dashboard:** add a zone redirect rule so `nanawing2.narenana.com/` without a `play` query gets a 301 to `https://www.narenana.com/nanawing2/`, and `/guides/how-to-play` gets a 301 to `/nanawing2/guides/how-to-play/`. Exempt `/?play…`, `/sw.js`, `/robots.txt` and app assets. Single hop, query kept.
- [ ] Remove the page from Nanawing 2's own sitemap (leave the app's robots.txt allowing crawl).
- [ ] **Owner, Search Console:** submit the updated www sitemap and inspect the two new URLs.
- [ ] Update internal links: family nav, homepage, Wings "practise" links, log viewer pages.
- [ ] Verify: every old URL gives one 301 to its exact new URL; the app still opens with saved radio profiles; the offline gate passes.

Settle until **3 Nov**. Watch Nanawing 2's sessions and the moved URLs' impressions, and check for 404s.

### M5: Nanawing's pages move (Wed 4 Nov)

- [ ] Before the redirect, point every "Fly"/"Play" link for Nanawing at `sim.narenana.com/?play…`, in all four repos. There are about 270 runtime references to `sim.narenana.com` (counted 6 Oct). Pages that move get www links.
- [ ] Split fpvsim's landing from its app: the app boots at `/?play`. Make the service worker tolerate a redirected `/` navigation, so returning players and installed apps keep opening the app. Mark the app's HTML noindex.
- [ ] Fold the sim landing's unique content into the homepage and guides, as agreed in M3.
- [ ] Route `/nanawing/guides/…`, `/nanawing/maps/…` and `/nanawing/leaderboard/` in production. `/nanawing/` gets a 301 to `/`. Add them to the www sitemap.
- [ ] **Owner, Cloudflare dashboard:** add a zone redirect rule so `sim.narenana.com/` without `play` gets a 301 to `https://www.narenana.com/`, and each page gets a 301 to its exact new URL per the [URL map](#url-map). Exempt `/?play…`, `/sw.js`, `/radio-bridge*`, `/robots.txt` and app assets. Single hop: the-island goes straight to `/nanawing/maps/island/`.
- [ ] The map pages' stats beacon (`public/maps/maps.js`) moves to the www pages or is removed.
- [ ] Remove the moved pages from the sim's sitemap.
- [ ] **Owner, Search Console:** submit the updated www sitemap and inspect the top new URLs.
- [ ] Verify the same things as M4, plus that the radio bridge to Nanawing 2 still works.
- [ ] From the next day, watch "nanawing" by landing page daily for 6–8 weeks.

### M6: Close-out (Tue 10 Nov)

11–17 Nov is buffer for anything that slipped. The deadline is Tue 17 Nov.

- [ ] No internal link anywhere points at a redirected URL.
- [ ] **Owner:** update off-site links you control: YouTube descriptions and pinned comments, social profiles, forum and Reddit posts.
- [ ] Mark the old page copies in fpvsim and nanawing2 as retired. Keep them until the 7 Dec checkpoint so rollback stays possible, then delete them.
- [ ] Update `docs/release-runbook.md` and `docs/theme-rollout.md` for the new content home.
- [ ] Remove the "update this plan" note from the four repos' `CLAUDE.md`/`AGENTS.md`, replacing it with the permanent rule: content lives in `narenana-website/content/<product>/`, and facts come from `product.json`.
- [ ] Mark this plan done.

## 6. URL map

<a id="url-map"></a>

Frozen 6 Oct. Edit this table whenever a page is added, removed or renamed before 17 Nov.

| Old URL | New URL | When | Notes |
|---|---|---|---|
| `sim.narenana.com/` (no `play`) | `www.narenana.com/` | M5 | The homepage is Nanawing's front door. The owner approved the Chupito + Spectre artwork on 16 Oct (`fpvsim` main `5174ae5`); carry this art at M5. No URL change. |
| `sim.narenana.com/?play…` | stays | — | The app, noindex. 19 Oct preview: opens the engine-free Hangar first; Launch loads the selected world. URL and map/aircraft preselection unchanged. |
| `sim.narenana.com/guides/` | `www.narenana.com/nanawing/guides/` | M5 | |
| `sim.narenana.com/guides/how-to-play` | `/nanawing/guides/how-to-play/` | M5 | |
| `sim.narenana.com/guides/fpv-wings` | `/nanawing/guides/fpv-wings/` | M5 | |
| `sim.narenana.com/guides/aircraft` | `www.narenana.com/nanawing/aircraft/` | **8 Oct** (early) | The aircraft page, built on www. Until M5 the old URL is a meta-refresh + canonical page, because the sim's service worker can't follow a cross-host 301; M5 makes it a 301 |
| `sim.narenana.com/guides/leaderboard` | `/nanawing/guides/leaderboard/` | M5 | The guide; standings are `/nanawing/leaderboard/` |
| `sim.narenana.com/guides/how-its-built` | `/nanawing/guides/how-its-built/` | M5 | |
| `sim.narenana.com/guides/fpv-simulator-no-controller` | `/nanawing/guides/fpv-simulator-no-controller/` | M5 | |
| `sim.narenana.com/guides/fpv-simulator-chromebook` | `/nanawing/guides/fpv-simulator-chromebook/` | M5 | |
| `sim.narenana.com/guides/practice-fpv-without-a-drone` | `/nanawing/guides/practice-fpv-without-a-drone/` | M5 | |
| `sim.narenana.com/guides/the-island` | `sim.narenana.com/maps/island/` (M2), then `/nanawing/maps/island/` (M5) | M2, M5 | Merged into the map page; at M5 the redirect goes straight to the final URL |
| `sim.narenana.com/maps/island/` | `/nanawing/maps/island/` | M5 | |
| `sim.narenana.com/maps/desert/` | `/nanawing/maps/desert/` | M5 | |
| `sim.narenana.com/maps/parkland/` | `/nanawing/maps/parkland/` | M5 | **Added 13 Oct, live 14 Oct** with Parkland (fpvsim branch `parkland`, `946f467`; released as fpvsim main 244670f). Built in fpvsim with the other map pages (`tools/buildMapPages.mjs`; canonical and og:url `https://sim.narenana.com/maps/parkland/`; in the sim sitemap), because it was written before M3. If Parkland ships after M3 (16 Oct), the owner may prefer it rebuilt here under `content/nanawing/` first; the fpvsim page is the drop-in until then |
| `sim.narenana.com/leaderboard/` | `/nanawing/leaderboard/` | M5 | Server-rendered, crawlable |
| `sim.narenana.com/radio-bridge`, `/404` | stay | — | App infrastructure |
| `www.narenana.com/nanawing/` | 301 to `www.narenana.com/` | M5 | Decision 3 |
| `nanawing2.narenana.com/` (no `play`) | `www.narenana.com/nanawing2/` | M4 | |
| `nanawing2.narenana.com/?play…` | stays | — | The app, noindex |
| `nanawing2.narenana.com/guides/how-to-play` | `/nanawing2/guides/how-to-play/` | M4 | |
| `nanawing2.narenana.com/404` | stays | — | |
| `www.narenana.com/log-viewer/…` (12 pages) | unchanged | M3 | Sources move to this repo; no redirects |
| `www.narenana.com/`, `/wings/…`, `/videos/…`, `/catalog-methodology/` | unchanged | — | |

Rules: every old URL gets one 301 to its exact new URL, never a chain or a catch-all to a homepage. Redirects stay forever; AI assistants and old links will cite the old URLs for years. The old hosts' robots.txt keeps allowing crawl.

## 7. Live inconsistencies to fix (M2)

Found on the live sites on 6 Oct.

**M2 status (6 Oct, 17:30 IST).** The owner approved the release on 6 Oct.

| Repo | Released as | State |
|---|---|---|
| website | `2f12b44` (merge of `feat/m2-content-fixes`) | **Live** 6 Oct. Checked: "See all 8 aircraft", the controls phrase, the full Sukhoi name, homepage lastmod |
| fpvsim | `0de8fe7` (merge of `feat/m2-content-fixes`) | **Live** 6 Oct. Checked: new header on every page, `/guides/the-island` 301 → `/maps/island/`, the Island tour, the full Sukhoi name |
| nanawing2 | Inside [PR #64](https://github.com/narenana/nanawing2/pull/64) (`release/2026-10-07`, merged as `7195988`), which contains M2's `e18adca` and `ceba5ab` | **Live** 7 Oct, 17:14 UTC (build `04d4c81e`). Checked: 8 powered aircraft, the new header and footer, the two-maps line, no private GitHub link, and the guide lists all 8 |

Still open:
- **Log viewer items** (header and footer, the debrief copy, the old widget guard): the log viewer session's, by Fri 16 Oct.

Decided:
- **In-game wording in Nanawing 2** (owner, 6 Oct): keep the "coming" messaging for touch controls.
  - The in-game notice ("Touch flight controls are coming later") and the Hangar chip stay as they are.
  - The landing's "aren't supported yet" says the same thing.

Correction to the Island item below: there is no separate race menu. The Hangar tab is labelled "Leaderboard" and only browses the boards; a race starts when you fly through the green arch. What was stale in the old guide was the single course and the single railway loop.

Also found during M2 and fixed on the branches:
- fpvsim's service worker turned moved pages into an error page for returning players.
- The service worker also deleted some offline map files after each deploy.
- The aircraft guide's climb rates didn't match the measured specs: Morok 24.6 and Sukhoi 32.3 m/s.
- Nanawing 2's landing CSS overrode the family footer's padding.

Found and not yet fixed (all already live):
- **Nanawing 2 landing:** the final "Ready?" heading and its buttons are nearly invisible on the dark background, because `simulator.css` sets `--tx` for `#landing`. **Scheduled for M4:** the landing is rebuilt on www as `/nanawing2/`, so fix it there rather than in the old page.
- **www at 768px:** the page scrolls sideways by 11px (the `.nn-cta` header button and `.depth-image`). **Fixed 8 Oct:** the header's CTA button at 761–1080px. Checked at 761, 768, 800, 1024 and 1080px, with no sideways scroll.
- **www at 1366px:** the floating Share button covers "Back to the top". **Scheduled for M3.**
- **Nanawing's controls** are worded four ways on www. **Scheduled for M3**, with a fact token.

- [ ] **Two different headers are live on www.** fpvsim, nanawing2 and the log viewer still show "Compare RC aircraft" and "Explore your flights", against the website's current "Compare RC plane prices" and "Replay your flight logs". Copy the current `familyNav()` output into fpvsim (index, guides, leaderboard, 404) and nanawing2 (index, guide, 404, `build/` mirror). The log viewer session does `scripts/brand-shell.mjs` and `src/FamilyNav.jsx`.
- [ ] **The footer tagline differs.** www says "Free sims and tools for RC pilots."; the apps say "Made for the joy of flying." Use the website's `familyFooter()` everywhere.
- [ ] **The Nanawing 2 aircraft count disagrees.**
  - The source of truth, `lib/aircraft-availability.ts`, says 8 selectable powered aircraft.
  - Fix the "5 aircraft" stat strip on nanawing2.narenana.com.
  - Fix the guide's list, which names 5: add Electric Kato, Extra 3D and Gee Bee.
  - Fix "See all 5 aircraft" on the www homepage.
- [ ] **Nanawing 2 describes Nanawing as one island** (index.html ~415, "exploring an island"). Mention both maps.
- [ ] **The Island guide contradicts the Island map page.**
  - Racing: it says "no race menu" and one course, but there are two courses (Windmill Run 4.3 km, River Run 8.1 km) and a race menu.
  - It says "a railway loop", against two rail loops in the code.
  - Fix: merge `guides/the-island` into `maps/island/` with a 301 on the sim host. Fold the tour prose in and drop the stale parts. Link `/maps/island/` from the guides index.
- [ ] **Sitemap lastmod dates are stale:**
  - the sim's `public/sitemap.xml` says 26 Sep for pages changed on 4 Oct;
  - the www homepage lastmod says 27 Sep (`STATIC_PAGE_LASTMOD`).

  Fix by hand now; M3 automates it.
- [x] **FAQPage structured data contradicts itself across repos.** Five sim guides use it, while the log viewer bans it on purpose. **Decided 6 Oct: keep it.**
  - Any page with a visible FAQ carries FAQPage markup that matches it word for word.
  - The M3 generator emits it from each page's `faqs`.
  - The log viewer's "no FAQPage" rule (`scripts/gen-content.mjs` comment, growth plan) is retired; its pages get the markup when their sources move here in M3.
  - Since Aug 2023, Google shows FAQ rich results only for well-known government and health sites, so the markup mainly helps other search engines and AI assistants read the answers.
- [ ] **Nanawing 2's "Source & feedback" link points at a private GitHub repo**, which returns 404 for visitors. Replace it with the contact link.
- [ ] **The log viewer's copy hasn't caught up with what it now does** (log viewer session). The AI Flight Debrief isn't mentioned anywhere. "Nothing is uploaded" sits next to consent-gated findings sent to `/api/debrief`, usage counts to `/api/usage` and anonymous Sentry error reports. The log file itself never leaves the browser; say exactly what does. *(2026-10-12: the `/api/usage` counts now also carry anonymous flight attributes — firmware family, airframe type and a crash-grade flight outcome — derived in the browser; still no coordinates, filename or log content. See the Change log.)*
- [ ] **Stale internal notes:**
  - `docs/post-release-todo.md` says the log viewer has no GA or Sentry ID; both are set now.
  - The `forward()` comment in `src/index.js` mentions a share widget the Worker no longer injects.
  - The log viewer's `share.css` has a guard for that old widget.
- [x] **Names vary.** "Sukhoi S-70" vs "Sukhoi S-70 Okhotnik". Nanawing 2's input is described four ways (keyboard / gamepad / RC radio / USB game controller). Pick one wording each.
  - **Decided:** "Sukhoi S-70 Okhotnik" (6 Oct) and "keyboard, gamepad or USB RC radio" for Nanawing 2 (6 Oct).
  - **Owner, 7 Oct:** the new aircraft is **"WUDFLY Spectre"**, in full wherever a name is shown, the same rule as the Sukhoi. "The Spectre" is fine only as a second reference in the same text.
- Later milestones:
  - **M3:** structured-data `@id` conflicts across hosts (one scheme in `products.json`); map pages without the family header and footer; `/log-viewer/` listed in two sitemaps; GA4 missing on the sim guides.
  - **M5:** two hosts competing for "nanawing" with near-identical titles.
  - **At the Spectre release (shipped 8 Oct; see the Change log):**
    - [x] **www homepage:** the racing card's list and the podium's aircraft `<select>` now include the WUDFLY Spectre (`spectre`; the production leaderboard accepts it). The Desert line says "a manufacturing plant", not "army base", to match the civilian Desert.
    - [ ] **Name: "WUDFLY Spectre"** (owner, 7 Oct). The release shipped it in full on the sim's landing, map pages and aircraft guide. Two places still use short forms:
      - the in-game name, "Spectre" (fpvsim `src/aircraft/catalog.ts`, shown in the Hangar);
      - "Spectre · WUDFLY" on the sim's leaderboard page.
      
      Both change to "WUDFLY Spectre". That's an fpvsim change, which needs a preview and the owner's OK to deploy.
    - **At the Parkland release (released 14 Oct, owner's OK; see the Change log, 13 and 14 Oct).** Shipped in this order:
      1. [x] The **production** leaderboard worker with `parkland-estate-run` in `COURSES` and the server-side aircraft allow-list (backups first; no schema change).
      2. [x] fpvsim `main` from branch `parkland` (`d73bd93` + `8366b3f` + `946f467` + `695c843` + `794c959`; fpvsim main 244670f): the Parkland map, Estate Run, Real FPV, the new `/maps/parkland/` page and the fpvsim copy. Set the sim sitemap's lastmod (13 Oct on the changed pages, `/leaderboard/` included) to the release day.
      3. [x] website `master` from branch `nanawing-parkland` (`50eb663` + the plan commits, rebased onto `master` 6dbef0b on 14 Oct; sitemap and `STATIC_PAGE_LASTMOD` 2026-10-13, the release's UTC date): the homepage (strip "3 maps, 5 race courses", JSON-LD, learn card, race card, Parkland band, the podium's Estate Run option), `/nanawing/aircraft/` (Spectre's Estate Run record, FAQ), `content/_facts/nanawing.json`. Set the sitemap and `STATIC_PAGE_LASTMOD` dates to the release day. If this goes before step 1, the homepage board says "Standings are unavailable" for Estate Run and the aircraft page renders degraded, so it is never edge-cached.
      4. [ ] **nanawing2** (not done; the Nanawing 2 session): its landing describes Nanawing with two maps ("the Island and the Desert", M2). Add Parkland, or say "three maps", in its next release.
      5. [x] (14 Oct, with step 3: vendored from `parkland` 794c959, which is what fpvsim main 244670f holds) Re-vendor the fpvsim stats dashboard (`stats-worker/src/dashboard.js`, which names Parkland and Estate Run since fpvsim `8366b3f` on `parkland`) into `src/nanawing-dashboard.js` once that reaches fpvsim `main` (internal `/stats/nanawing`; until then it shows the raw ids).
      6. [x] Re-check: the homepage Parkland image is a 13 Oct game render (`estate-aerial`); swap it if the release ships new site art. *14 Oct: the release ships no new Parkland site art (fpvsim `public/assets/ui/maps/parkland*` last changed in `70b5496`), so the image stays.*
      7. [ ] **Owner decisions, fpvsim (found by the fpvsim session, 13 Oct; not changed):**
         - The Hangar and loader art for Parkland (`public/assets/ui/maps/parkland*.jpg/webp`) predates the estate, the lake, the forest ring and Estate Run. Hi-res candidates are rendered (`tools/out/site-art/parkland/hires/`); `tools/captureSiteArt.mjs --final` has not been run.
         - The sim's Desert map page still calls the Desert "the new map" (title, eyebrow, share creatives). Changing it is a page-title change and a creative re-render. The www homepage's Desert band no longer says "new" (this branch).
         - Where the Parkland map page lives if Parkland ships after M3 (16 Oct): see the URL map row.
- **Found 13 Oct (claims, not Parkland):** the touch face has been live since 9 Oct, but some copies still say Nanawing is for computers only:
  - www, **fixed 14 Oct (master ca50ecc):** the Wings FPV practise line (`catalog/lib/grid-next.mjs`) and both aircraft-page ledes now say "on a laptop or on your phone with two thumb sticks"; the homepage hero says so too; the JSON-LD `operatingSystem` adds Android and iOS. Nanawing 2 keeps "laptop or desktop" (no phone claim for it; the catalogue test holds both);
  - fpvsim, **fixed on `parkland` (695c843), live with the Parkland release:** every map page's phone note (`tools/buildMapPages.mjs`) and the landing's touch note no longer say "touch controls aren't here yet"; both now say a phone flies with the on-screen twin sticks, held sideways (`src/device/orientationGate.ts`: phones fly landscape), and a computer with a keyboard, gamepad or RC radio. Until that release, the live `/maps/island/`, `/maps/desert/` and landing keep the old line.
  
  Owner to decide the www wording, and may still reword the fpvsim lines before the release; Claims row.

## 8. Fact inventory

<a id="fact-inventory"></a>

Where each shared fact is defined today (the **source**), where it's copied, and where it will come from after M3. Update the row when you change a fact before 17 Nov.

| Fact | Source today | Copies today | After M3 |
|---|---|---|---|
| Header: product names, nav captions, URLs | website `scripts/brand-shell.mjs` | Pasted into fpvsim (index, 10 guides, leaderboard, 404) and nanawing2 (index, guide, 404, `build/`); a stale copy in the log viewer (`scripts/brand-shell.mjs`, `src/FamilyNav.jsx`, 10 generated pages) | `family/products.json` + `family:sync` + header test |
| Footer tagline and links | website `familyFooter()` | Pasted in all app pages; the homepage has its own footer | Same |
| Family assets (shell.css, fonts, share.js…) | website `site/assets/family/*` | Copied by hand into the three apps; already diverged | Family manifest + `family:sync` |
| Nanawing maps (count, names, beta, what's on them). *8 Oct: the Desert's army base became a civilian manufacturing plant. Since 14 Oct (the Parkland release; written 13 Oct): 3 maps, the third is **Parkland (beta)**: fly-through oaks and character trees, an estate (barns, granaries, a colonnade, a walled garden, windmills, sheep), a lake with an island and an estate bridge, forest all round* | fpvsim `src/world/maps.ts` (incl. the Hangar's `about` text) | fpvsim landing (meta, JSON-LD, hero map row, stat strip, features, FAQ, notices nav), guides index, 7 guides and every guide footer, map pages (+ `/maps/parkland/`; nav and "also in" on the other two), leaderboard page (meta and og: "three maps"), README; www homepage (strip "3 maps", Parkland band, Desert band, `<select>` optgroups, JSON-LD); nanawing2 landing (still says two maps: §7, Parkland release item 4) | `product.json` → tokens and `data-fact` |
| Race courses (ids, names, km, medals, **which aircraft may race**). *TBS Chupito release (branch, 15 Oct 2026): Estate Run is raced in the WUDFLY Spectre and the TBS Chupito; 22 boards.* *Since 14 Oct (the Parkland release; written 13 Oct): **Estate Run**, `parkland-estate-run`, Parkland, **2.8 km** (the Hangar's lapKm; not 2.9), 14 light-frame gates + the green START arch (the Hangar, the HUD's "GATE n/N" and the sim's map page count **15 gates**, the arch as gate 1; www copy says "the START arch, then 14 light frames"), medals Author 2:04, Gold 2:19, Silver 2:41, Bronze 3:12, **WUDFLY Spectre only** (the course's aircraft allow-list); no ghost rivals or race traces; 5 courses in all* | fpvsim `src/race/courses.ts` (`aircraft`, `courseAllowsAircraft`), `desertCourses.json`, `src/world/parkland/parklandCourses.json`; the leaderboard worker's `COURSES` + allow-list | fpvsim map pages (`/maps/parkland/`: 15 gates, medals, the course `blurb`), leaderboard page (course list, meta and og: "five race courses"; fpvsim `8366b3f`), landing and guides index ("five race courses"), guides (the leaderboard guide: Estate Run's row and medals; fpvsim `946f467`), Hangar (site detail with the `blurb`, board and results card); www homepage (strip "5 race courses", race card, Parkland band chips, the podium `<select>` with `data-aircraft`) + `site/assets/leaderboard.js` (disables the other aircraft); www `content/_facts/nanawing.json` (`courses[].aircraft`) → `/nanawing/aircraft/` (records rows per allowed aircraft, FAQ, Spectre section) + `src/aircraft-records.js` | Same |
| Radio (RX) range and failsafe. *Since 14 Oct (the Parkland release): Parkland 720 m from home; a failsafe below 60 m climbs first, then flies home. The Island and the Desert: `COAST_RADIUS`, 1,980 m ("about 2 km")* | fpvsim `src/world/parkland/flightArea.ts` (`PARK_RX_RADIUS`, `PARK_FAILSAFE_CLIMB_AGL`), `src/state/flightGuard.ts` (`COAST_RADIUS`), `src/world/maps.ts` (`failsafeTip`, no number) | fpvsim `/maps/parkland/` ("about 720 m from the launch here, against about 2 km on the Island and the Desert"; `tools/buildMapPages.mjs`), the loader tip (`failsafeTip`); www homepage Parkland band ("720 m from home") | `product.json` |
| Nanawing aircraft (names, count, specs, credits). *5 since the TBS Chupito release (branch, 15 Oct 2026: 6S 1800 mAh, 360°/s, 140 km/h; Team BlackSheep credit and product link required wherever it is shown, see the Change log).* *4 since 8 Oct, with the WUDFLY Spectre; new stall figures (Change log, 8 Oct). 15 Oct (copy pass, branch): the aircraft page no longer says how specs are measured; the STALL warning speeds are in the sim guides (how-to-play, practice). www facts: `content/_facts/nanawing.json`, feeding `/nanawing/aircraft/`. Page copy and editorial order: `content/nanawing/aircraft.json`; whole-hangar/free RC-practice positioning in website `a9bc680`, with Spectre-first lineup and sharing, without changing measured specs or the facts snapshot order.* | fpvsim `src/aircraft/catalog.ts`, `src/config/aircraftSpecs.ts` | fpvsim landing (stat strip, feature list, hero top-3 names), aircraft guide (specs typed by hand), other guides, map pages (wing count, wing tiles, `public/maps/maps.js`), leaderboard page; www homepage (racing card list, podium aircraft `<select>`); www aircraft page (free practice, aircraft differences, field-confidence context, Spectre social preview and requests via existing Instagram/LinkedIn profiles; other surfaces keep their own editorial order) | Same |
| Nanawing 2 aircraft (selectable count, names) | nanawing2 `lib/aircraft-availability.ts` (8) | nanawing2 landing (says 5 and 8), guide (names 5), `build/`; www homepage ("5"), Wings practise links | Same |
| Nanawing homepage artwork. *16 Oct, live in production (`5174ae5`): the TBS Chupito with its livery and a text-free WUDFLY Spectre share a Blender camera and lighting setup over the existing Desert scenery. Original project meshes, no manufacturer photographs; the in-game aircraft and specs are unchanged. Team BlackSheep and WUDFLY credits and product links remain on the page.* | fpvsim `art/hero-formation-v1.json`, `tools/blender/renderHeroFormation.py`, `tools/prepareHeroFormation.mjs` | fpvsim `/` responsive hero (`hero-formation-v1-*`) and homepage share card (`share-home-v3.jpg`). `/leaderboard/` retains `share-home-v2.jpg`; www artwork is unchanged until the M5 cutover. | Carry the approved homepage artwork at M5; preserve maker credits and product links |
| Controls and keys. *TBS Chupito release (branch, 15 Oct 2026): V cycles 5 aircraft; the Chupito has no yaw.* *Since 8 Oct: the Spectre's yaw stick and an 8-step calibration (Change log, 8 Oct). Since 14 Oct (the Parkland release): three camera views, C (or the touch camera button) cycles chase → FPV → **Real FPV**, a fixed 140° goggle lens in a 4:3 frame; fisheye, motion blur near full throttle and prop-wash shake only on the high and ultra tiers (a plain 140° view on lite and Intel low-GPU). The in-game key row reads "chase / FPV / Real FPV"* | fpvsim `src/hud/menuCopy.ts`, calibration steps in `src/hud/controlsUI.ts` (`src/hud/wizardMath.ts` from the Spectre release); cameras `src/camera/cameras.ts`, `src/render/qualityTier.ts` (`lensDistortion`); nanawing2 `lib/keymap.ts` | fpvsim landing FAQ, 4 guides (the step count: how-to-play, the guides index, the no-controller guide and its FAQPage); the cameras: fpvsim landing bullet, how-to-play (key row, cameras section), no-controller, Chromebook, FPV-wings and practice guides, README; nanawing2 guide; www homepage (learn card: "Real FPV, a 140° goggle-style view", no tier claim) | Same |
| Chupito keyboard response. *19 Oct, revised preview branch `codex/chupito-keyboard-expo`: pitch uses 0.20 s full travel and 25% keyboard expo; roll retains the first preview's 0.45 s and 65%. Both return from full travel in 0.08 s. Holding still reaches full authority; radio, gamepad, touch, the other aircraft, rates and flight physics are unchanged. Production is unchanged pending approval.* | fpvsim `src/config/flightConfig.ts` (`AIRCRAFT_FLIGHT.chupito.keyboardResponse`), `src/input/keyboardResponse.ts`, `src/input/keyboard.ts` | No visitor-facing copy or key binding changes; engineering notes in fpvsim `docs/CHUPITO.md`. | Keep keyboard advice distinct from aircraft rates; no URL or milestone change |
| Nanawing launch flow. *19 Oct, preview branch `codex/chupito-keyboard-expo`: public `?play`, `?nolanding` and `?map` links open the engine-free Hangar. Map, aircraft and graphics choices do not load a world; Launch does. In-game map/graphics changes and graphics benchmarking retain intentional reload continuation. Ordinary visits never pre-load a world behind the Hangar.* | fpvsim `src/boot.ts`, `src/bootPolicy.ts`, `src/menuSession.ts` | Existing Play links keep their URLs and preselection. No new page or marketing copy. | Preserve menu-first app entry at M5; do not redirect Play links to the bare root |
| Log formats and firmware limits | log viewer `src/App.jsx` + parsers | Log viewer landing and 9 content pages, README; www homepage, `/videos/log-viewer-walkthrough/`, Wings practise links | `product.json` |
| Claims: free, no install, no login, offline, phones. *15 Oct (copy pass, branch): offline is worded "after one full session online" on the sim pages. Phones: the sim flies on a phone with on-screen twin sticks, held sideways (fpvsim `src/input/twinStickInput.ts`, `src/device/orientationGate.ts`; live since 9 Oct). Since the Parkland release (14 Oct; `695c843`), the fpvsim landing's touch note and every map page's phone note say so. Three www copies still say computers only (§7)* | Behaviour in each app | www homepage, fpvsim landing (touch note), fpvsim map pages (phone note, `tools/buildMapPages.mjs`), nanawing2 FAQ, log viewer pages ("nothing is uploaded") | `product.json` claims |
| Wings prices, stock, sellers | Database (rendered per request) | Homepage fallback text (rewritten per request) | Unchanged + `/wings/facts.json` |
| Organization, WebSite, app entities (JSON-LD) | None; four versions | www homepage, fpvsim, nanawing2, log viewer, map pages | `family/products.json` |
| Sitemaps, robots, lastmod. *Since 14 Oct (the Parkland release): the sim sitemap has `/maps/parkland/` (fpvsim `946f467`); www `/` and `/nanawing/aircraft/` carry lastmod 2026-10-14 (`site/sitemap.xml`, `STATIC_PAGE_LASTMOD`). The sim's changed pages (`/leaderboard/` included) carry the release day too (fpvsim, §7 Parkland item 2)* | Hand-kept per repo + `STATIC_PAGE_LASTMOD` | 5 places | Generated in this repo |
| Debrief finding vocabulary | log viewer `src/debrief/payload.js` | website `debrief/lib/validate.mjs` ("KEEP IN SYNC" comment) | Contract test |
| Usage event allowlist | log viewer `src/utils/analytics.js` | website `usage/lib/worker.mjs` | Contract test |

## 9. Evidence

Research done on 6 Oct 2026: 33 sourced claims, fact-checked (28 supported, 5 overstated and corrected).

- Google's [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) (updated Dec 2025): choose subdomains or folders for business reasons; both rank.
- Google's [ranking systems guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide): site-wide signals and classifiers are used. Site diversity generally treats subdomains as part of the root domain.
- Google's [site names](https://developers.google.com/search/docs/appearance/site-names) doc: site names work per host, not per folder. Pages under `/nanawing/` show the www site name ("narenana").
- John Mueller (2018, 2022): he would "keep things together as much as possible", and a subdomain suits content meant "to stand on its own".
- Danny Sullivan (2022): Google tends "to see subdomains apart from root domains", depending on the case.
- Case studies of moves in either direction are anecdotal; none had a control group. Don't promise uplift.

Feasibility of moving the apps themselves, for the record:
- 7–10 engineer-days for fpvsim and 4–6 for nanawing2, plus Worker work.
- Blockers:
  - fpvsim's service worker deletes every other cache on its host;
  - Nanawing 2's installed app would claim all of www;
  - players' saved data would need a handoff;
  - the hostname-based production checks would reclassify www as staging.
- None of these apply to this plan, because the apps stay on their hosts.

## 10. Measurement

**Baseline** (28 days, 9 Sep–5 Oct 2026; Search Console and GA4 via the `/stats` snapshot):

| | Search clicks | Notes |
|---|---|---|
| sim.narenana.com | 207 | "nanawing": 114 clicks, 180 impressions, avg position 1.9 |
| www homepage | 15 | |
| www /log-viewer/ | 20 | "edgetx log viewer" pos 6.0, "inav log viewer" pos 8.1 |
| www /wings/ | 5 | Buying queries at positions 50–64 |
| nanawing2.narenana.com | 4 | |
| **All** | **247 clicks / 1,128 impressions** | Non-brand: "fpv wing simulator" 15 impressions, pos 6.0 |

GA4 sessions:
- sim.narenana.com: 1,235 (organic search 465, direct 358, AI assistants 163, referral 119).
- www: 467 (direct 318, organic 52, AI assistants 29). 167 of the www sessions, on 17–19 Sep, look automated.

**Checkpoints:**
- **Tue 3 Nov** (before M5): Nanawing 2's moved URLs indexed? No 404 spike? Sessions steady?
- **Mon 23 Nov:** "nanawing" clicks and position by landing page; any old URL still showing in results; 404s; AI-assistant sessions to www.
- **Mon 7 Dec:** the same. Delete the old page copies if stable.
- **Mon 8 Feb 2027:** verdict. Compare against the baseline above: site-wide clicks, non-brand impressions, and whether Wings and the log viewer gained.

Log the cutover dates in GA4 and on `/stats`, so the comparison is honest.

## 11. Risks and rollback

| Risk | Mitigation |
|---|---|
| "nanawing" ranking swings after M5 | Expected for a few weeks. Watch daily and judge at 3 months; don't react in week 1. |
| A "Play" link to a bare root bounces visitors to www | Rewrite all Play links to `?play` before each redirect goes live (M4, M5 checklists). |
| Returning players lose settings or offline data | The apps don't change host, so nothing is lost. Verify radio profiles and offline after each cutover. |
| Installed apps (PWA) break | Manifests keep `start_url`; the service worker tolerates the redirected `/`; verify on a real install. |
| Redirect chains or catch-alls lose deep links | One-hop, exact-URL rules from the URL map; check with `curl -sI` on every old URL. |
| Old hosts blocked in robots.txt hide the redirects | Keep crawling allowed on old hosts. |
| Facts drift again during the six weeks | The rule at the top of this plan, then the M3 checks. |
| A Nanawing 2 release collides with another session's release (it happened on 6 Oct) | Open the PR a day early, merge only when `main` has no run in progress, and update the branch from `main` before merging. |

**Rollback:**
- **Before a cutover:** don't route the new paths. Nothing changes for visitors.
- **After a cutover:** turn off the zone redirect rule (instant, no deploy). The old pages are still deployed on their hosts until the 7 Dec checkpoint.

## Change log

Add newest entries at the top: date, repo and commit, what changed, and the milestone affected.

- **2026-10-19** · **Menu-first play links and revised Chupito keyboard pitch (preview only).** fpvsim `codex/chupito-keyboard-expo` commit `246a326`, with latest `main` `983bf21` merged cleanly. Public `?play`, `?nolanding` and `?map` links open the engine-free Hangar; Launch loads the selected world directly into gameplay. Map/graphics restart and benchmark continuation remain explicit and one-shot. Missing offline maps are refused before loading. The owner found the first Chupito pitch tune too slow: pitch now uses 0.20 s travel / 25% keyboard expo; roll retains 0.45 s / 65%, both with 0.08 s release. Analog input, other aircraft and flight physics unchanged. Controls/entry fact rows and the existing Play URL row updated; no new URL or page copy. Production remains unchanged pending approval. **M2/M5:** preserve the menu-first app entry and keep keyboard response distinct from aircraft flight specifications; no milestone-date change.

- **2026-10-19** · **Chupito keyboard tap response (preview only).** fpvsim `codex/chupito-keyboard-expo` commit `3749164`, based on `main` `5174ae5`. The owner reported abrupt movement from a single key tap. Adds a per-aircraft virtual keyboard stick for pitch and roll, with gentle initial travel and quick centring; holding a key still reaches full authority. Other aircraft, analog inputs, flight physics, rate limits, turn assist and key bindings stay unchanged. Controls fact inventory updated; no page, URL or marketing-copy change. Production requires separate approval. **M2/M5:** keep any future keyboard guidance separate from the aircraft's unchanged flight specifications; no milestone-date change.

- **2026-10-16** · **Released: two-aircraft homepage artwork.** The owner approved merging and deploying the preview below. fpvsim `main` `5174ae5` replaces `5df7fd3` through the normal production pipeline. Chupito retains its TBS livery; Spectre has no wing lettering in the artwork only. Desktop and phone hero images and homepage sharing use the new formation. Headline, gameplay, flight physics, models and data services are unchanged. Pre-release checks passed: 2,350 unit tests, 22 offline/update checks, 87 real-input checks and 58 phone-layout checks, plus the whole-page brand review. Post-deploy verification: both production hosts report `5174ae5`, all 11 new image files match the approved sources, the game bundle answers 200 and the service worker is uncached; live desktop and phone views have no overflow or page errors. No database migration or worker deployment. **M5:** carry this approved artwork to the consolidated homepage; no URL or milestone-date change.

- **2026-10-16** · **Two-aircraft homepage artwork (branch preview only).** fpvsim `codex/two-aircraft-hero` commit `5174ae5`, based on main `5df7fd3`. The owner requested the Chupito with livery and the Spectre without wing text, rendered with matching sunlight, shadows and scenery. Replaces the single-Spectre hero with new desktop and phone compositions and a cache-busted homepage share card. Portrait layouts reserve a clear aircraft area below the CTA and above the map cards; the pack-specific 2S corner label is removed because the art now also shows the 6S Chupito. Headline, aircraft selection and flight behaviour stay unchanged. No manufacturer photographs. The homepage retains Team BlackSheep and WUDFLY credits and links. URL map and artwork fact row updated; no new URL or milestone-date change. **M5:** carry the approved art with the homepage move. Production remains unchanged until approval.

- **2026-10-15** · **Released: the TBS Chupito becomes the fifth aircraft.** fpvsim `main` 7035add (CI deploy), leaderboard worker e3948a05 (deployed first; backups 20261015T151135Z; rollback: client first, then worker ff3b5219), narenana-website master merge of `copy-full-pass`. It shipped together with the copy pass below.
  - **Permission:** Team BlackSheep's written permission, 15 Oct 2026 (ticket TBS-S261014-D3E0). The Chupito may be shown with its name and product livery if it is presented accurately and never as official or endorsed. Every surface that shows it credits Team BlackSheep and links https://www.team-blacksheep.com/products/prod:tbs_chupito_kit. No TBS photographs.
  - **Owner decisions:** the pack is 6S 1800 mAh · 30 A (was 1500); Estate Run opens to the Chupito alongside the WUDFLY Spectre; the Chupito is last in the fleet order.
  - **Sim:** the Hangar shows 5 tiles in one row; the homepage gets a fifth aircraft card; `/leaderboard/` gets a chip and a picture; the map pages, the guides and the in-game credits all carry the Team BlackSheep link. Search snippets (title, meta, og, twitter, JSON-LD) never name it without the credit.
  - **Leaderboard worker:** `chupito` joins `AIRCRAFT`, with rival playback windows (Windmill 87–163 s, River 167–313 s) and an Estate Run lap floor of 57 s. It deploys to production BEFORE the client.
  - **www:** `/nanawing/aircraft/` gets a Chupito section, a spec row and a FAQ; the homepage aircraft list and the board picker gain it, with a credit line.
  - **Facts that change:** 5 aircraft; the Chupito has the quickest roll (360°/s), so the Spectre's line becomes "slowest, the only one with yaw"; the highest stall is the Chupito's 35 km/h, so the stall range is 24–35 km/h; 22 boards (5 each on Windmill, River, Tunnel and Pyramid Run, 2 on Estate Run).
  - **Fact inventory rows:** Nanawing aircraft, Race courses, Controls. **URL map:** no new pages.
  - **Milestones:** none moved.
- **2026-10-15** · **Released with the TBS Chupito: the whole-page copy pass** (fpvsim `main` 7035add; narenana-website master merge of `copy-full-pass`).
  The owner found "Where the numbers come from" (test bot, bench, 1 g lift limit) live on `/nanawing/aircraft/` and said it should not exist. Every Nanawing surface was reviewed as a WHOLE page against the brand voice guide, which gains a whole-page review rule and a search-phrase note.
  - **www:** `/nanawing/aircraft/` loses the method section and the measurement notes; new title "Pick your wing and fly it free", new hero and section copy, and a new share card (`spectre-share-v2.jpg`). The homepage's Nanawing copy is rewritten benefit-first; Desert and Parkland stay marked Beta. CLAUDE.md gains the copy rule.
  - **fpvsim:** homepage, `/leaderboard/`, the 3 map pages and their share images, the 9 guides, the 404 and radio bridge, and the Hangar/HUD text. A new share card, `share-home-v2.jpg` (`tools/makeShareHome.mjs`), drops the banned triad; `/og.jpg` and `share-home.jpg` serve the same civilian card. Guide titles changed (URLs unchanged): "How to fly Nanawing", "FPV simulator with no controller: fly it on your keyboard", "Leaderboards: race other pilots for the fastest lap", "Fly an FPV simulator on your Chromebook".
  - **Facts:** no number changed. The STALL warning speeds moved from the www aircraft page to the guides (One 27, Sukhoi 39 km/h). Offline is now worded "after one full session online". Fact inventory rows: Nanawing aircraft, Claims.
  - **Milestones:** none moved. M5's moved pages inherit this copy.

- **2026-10-14** · **Released: the new Nanawing homepage, benefit-first copy, and phones on www.**
  - **fpvsim `main` 7e64c0c** (merge of `copy-voice`). It is on Pages production as deployment 2e20f571, and both hosts serve build `7e64c0c`.
    - **Hero:** Astra key art of the WUDFLY Spectre over the Desert. The flyby picture and the hero review card are gone; the review band's Watch link now opens the player.
    - **`#aircraft` ("Pick your wing"):** the 4 released wings.
    - **`#racing` ("Race other pilots for the fastest lap"):** the static line "Compete with 240+ pilots on 5 courses.", the top pilots on Windmill, River and Tunnel Run with no lap times, and a big CTA to the full leaderboards. The hero's top-3 strip is gone.
    - **The detailed board** (course tabs, podium, your standing, times to beat) moves to `sim.narenana.com/leaderboard/`. The URL is unchanged, so no URL map row changes.
    - **Share card:** a new one, `/shots/landing/share-home.jpg`, replaces the camouflage `og.jpg` on the landing and `/leaderboard/` (NOTHING MILITARY).
    - **Copy:** every visitor string on the landing, the map pages, `/leaderboard/` and the guides hub is rewritten benefit-first. It is gated by the brand-voice QA agent in strict mode against the guide's new first rule.
  - **Fact inventory:** these copies changed wording but not facts: the landing title, meta, og and Twitter text, the map page titles and descriptions, the course blurbs (`courses.ts` / `desertCourses.json` / `parklandCourses.json`) and the aircraft lines.
  - **Claim corrections:** Tunnel Run goes low across the factory yard (it does not go round it), and a crash does not end a race.
  - **narenana-website master ca50ecc:** Nanawing flies on phones (see §7 touch claims, now fixed), and `.claude/brand-voice-guidelines.md` gains "The first rule: write about the pilot, not the product", with the owner's examples.
  - **Milestones:** M2 touch claims are closed. No milestone date moves.
- **2026-10-14** · **Restored: the public Nanawing stats dashboard redirects to www again.** fpvsim `main` 23232a5 (merge of `redirect-stats-dashboard` 8356d56), production stats Worker `fpvsim-stats` version `0d34451a` (rollback target `a15b740b`; backups 20261014T063312Z). `https://fpvsim-stats.narenana.workers.dev/` (and `/index.html`) answers 302 to `https://www.narenana.com/stats/nanawing`, keeping `?sim=`; every beacon and API route is unchanged. 8356d56 had been deployed by hand on 13 Oct (`6c2d5ffe`, 15:32 UTC) from an unmerged branch, and the Parkland release's stats deploy from `main` (`a15b740b`, 19:27 UTC) brought the old public page back for about 11 hours. Not an indexable page, so no URL map row. No milestone moves.
- **2026-10-14** · **Released: Parkland, Estate Run and Real FPV.** In the §7 order, each with the owner's OK: the production leaderboard worker with `parkland-estate-run` (Spectre only), then fpvsim main 244670f (branch `parkland` 794c959), then narenana-website `master` from `nanawing-parkland` (rebased onto `master` 6dbef0b; merge commit `f7d7906` on `master`, Worker version `83dc43a6`, deployed by Workers Builds 13 Oct 19:38 UTC; rollback target `78a46f3a`). Everything the 13 and 14 Oct entries below call pending is live now. Verified on production after the merge (read-only): the homepage shows "3 maps, 5 race courses", the Parkland band and the Estate Run podium option (choosing it locks the aircraft to the WUDFLY Spectre and shows the Spectre-only note; Windmill Run re-enables all four); the Desert band reads "MAP / DESERT · BETA" and "Also in Nanawing"; `/nanawing/aircraft/` returns `x-aircraft-cache: HIT` (no degraded board) with one Estate Run row; the sitemap lastmod is 2026-10-13 on `/` and `/nanawing/aircraft/`; the Parkland image is immutable-cached; `scripts/release-public-smoke.mjs` 9/9. What changed on www with this merge:
  - `site/sitemap.xml` and `STATIC_PAGE_LASTMOD` (`catalog/lib/worker.mjs`): lastmod **2026-10-13** (the UTC date of the release: it shipped just after midnight IST on 14 Oct, and the sitemap checks reject a date later than today in UTC) on `/` and `/nanawing/aircraft/`.
  - `content/_facts/nanawing.json`: the source is fpvsim main 244670f (2026-10-14, files + `parklandCourses.json`); the `pending` block is gone and Estate Run is described as released.
  - `src/nanawing-dashboard.js` (internal `/stats/nanawing`): re-vendored from fpvsim `stats-worker/src/dashboard.js` at 794c959, so the board and maps panels name Estate Run and Parkland (were raw ids); the embed mode, back link and API base are kept.
  - Plan: §7's Parkland checklist items 1, 2, 3, 5 and 6 are done; 4 (nanawing2's "two maps") and 7 (owner decisions) stay open. The URL map's `/maps/parkland/` row and the Fact inventory rows (maps, courses, RX range, controls, claims, sitemaps) now read "since 14 Oct". No milestone moves.
- **2026-10-14** · **Released 14 Oct with Parkland (fpvsim main 244670f; written pending release): the Desert page is no longer "the new map".** fpvsim `794c959` on `parkland` (local; live with the Parkland release, when Parkland becomes the newest map). `sim.narenana.com/maps/desert/`: title "Desert — fly an FPV wing through a mountain in Nanawing, the free FPV wing simulator" (was "Desert — the new map in Nanawing, …"), eyebrow "The desert map in Nanawing", share/og/twitter copy without "new", share creatives' badge "Mesas & pyramids" (og/square/story re-rendered). URL unchanged; the URL map row is unchanged; if a www copy of the Desert page is written before M5 it takes the new title. No milestone moves.

- **2026-10-13** · **Released 14 Oct with Parkland (fpvsim main 244670f; written pending release): Parkland, review fixes.** fpvsim `695c843` on `parkland` (local, not pushed or deployed; live with the Parkland release, not before). What visitors will read:
  - **Phones (Claims row):** the landing's touch note and every map page's phone note (`tools/buildMapPages.mjs`, so `/maps/island/`, `/maps/desert/` and `/maps/parkland/`) said "touch controls aren't here yet". They now say a phone flies with the on-screen twin sticks, held sideways, and a computer with a keyboard, gamepad or RC radio. The www copies in §7 are unchanged.
  - **Cameras (Controls row; the fact is unchanged, one copy was wrong):** the no-controller guide counted the presses from FPV. The sim starts in chase: the first C gives FPV, the second Real FPV, the third chase again. That is what the guide now says, the same as the Chromebook and practice guides.
  - **`/maps/parkland/` only (no other copy states these):** the lake's island is in its broad **east** lobe (it said west; the OSD compass and the page's own north-up map put it east). The launch meadow has no barn, wall, hay or flock within about 170 m; the park's bandstand stands about 115 m out (the page said no building at all).
  - Not visitor copy: the leaderboard worker's release runbook (`leaderboard-worker/README.md`, 2a) now backs up the KV values as well as the key list, and mirrors the R2 race traces with the private poller before the worker deploys (the CLAUDE.md backup rule).
  - No milestone moves.

- **2026-10-13** · **Released 14 Oct (fpvsim main 244670f; written pending release): Parkland.** fpvsim branch `parkland` at `d73bd93` (on the preview parkland.fpvsim.pages.dev only; production still runs `main` without it), plus `8366b3f` (leaderboard: Estate Run boards, Spectre only) and `946f467` (copy + `/maps/parkland/`), both local on `parkland`, not pushed or deployed; and narenana-website branch `nanawing-parkland` at `50eb663` (content) + the plan commits after it (local, not pushed). **These pages go live with the Parkland production release, not before** (order in §7, "At the Parkland release"). What visitors will see:
  - **A third map, Parkland (beta):** giant oaks and character trees with fork windows to fly through; an estate with barns, granaries, cruck frames, a colonnade, a walled garden, windmills, folly towers, sheep in the paddocks and hay; a serpentine lake with an island and an estate bridge; a stream with footbridges; dense forest all round the park.
  - **A shorter radio range on Parkland:** 720 m from home, so you fly in the designed park. Past it the failsafe brings the wing home, climbing first if it latched below 60 m (fpvsim `src/world/parkland/flightArea.ts`).
  - **Its first race, Estate Run** (`parkland-estate-run`): 14 light-frame air gates plus the green START arch on the launch meadow, **2.8 km** (the Hangar's lapKm, from the gates; earlier notes said ~2.9), through tree fork windows, cruck bays, the colonnade, the Dutch barn's drive-through and the estate bridge's arch. It finishes at the last (red) frame. The sim counts **15 gates** (the arch is gate 1: the Hangar's "2.8 km · 15 gates", the HUD's "GATE n/15", the map page). Medals: Author 2:04, Gold 2:19, Silver 2:41, Bronze 3:12. **WUDFLY Spectre only** for now: the course's aircraft allow-list. The game enforces it, and on the branches so do the leaderboard worker, the Hangar's board and the www homepage board. No ghosts or race traces.
  - **Real FPV,** new to production with this release: a third camera (C cycles chase → FPV → Real FPV), a fixed 140° goggle lens in a 4:3 frame, with fisheye, motion blur near full throttle and prop-wash shake on the high and ultra tiers (a plain 140° view on lite and on Intel/low-GPU machines). The in-game key row reads "chase / FPV / Real FPV". The touch-stick fix (fpvsim `4e3e72a`) is not part of this release: it has been live on `main` since 10 Oct, and `parkland` carries it.
  - **Counts:** 3 maps, 5 race courses.
  - **Website (`nanawing-parkland` `50eb663`):**
    - homepage: the strip, the JSON-LD description, the learn card (Real FPV), the race card;
    - a new Parkland band leads the map bands, with an image rendered from the game on 13 Oct (`site/assets/nanawing-parkland*.webp`). The Desert band is no longer "new";
    - the podium's course `<select>` gains Estate Run with `data-aircraft="spectre"`. `site/assets/leaderboard.js` disables the other aircraft for it and says "WUDFLY Spectre only";
    - `/nanawing/aircraft/`: the Estate Run record row only in the Spectre's section (generator + `src/aircraft-records.js`, which no longer reads boards an aircraft can't race), the FAQ "Can every aircraft race every course?" answered for Estate Run, and one Spectre line;
    - `content/_facts/nanawing.json`: Estate Run with `aircraft: ["spectre"]`;
    - sitemap and `STATIC_PAGE_LASTMOD` dated 13 Oct; set them to the release day when merging (done: 2026-10-13, the release's UTC date).
  - **fpvsim (the same release, other sessions' work on `parkland`):**
    - `946f467`: a new map page, `sim.narenana.com/maps/parkland/`, titled "Parkland — fly an FPV wing through the trees in Nanawing, the free FPV wing simulator" (generated by `tools/buildMapPages.mjs`; canonical and og URLs on sim.narenana.com; in the sim sitemap). It is built in fpvsim, because it was written before M3; see the URL map. Also the landing, the guides index, 7 guides and every guide footer, the Island and Desert map pages (nav, "also in", counts), README, the Hangar's Parkland `about` text, Estate Run's `blurb`, the in-game key row, and the sim sitemap (lastmod 13 Oct on every changed page);
    - `8366b3f`: the leaderboard page ("five race courses across three maps"; Estate Run opens on the Spectre board), the worker's server-side allow-list (not deployed anywhere yet), and the stats dashboard's Parkland and Estate Run names.
  - **Not changed:** the homepage title and share tags, the family header and footer, the Giz review page ("the gate courses" stays true).
  - Plan: §3 and the URL map gain `/maps/parkland/` (M5). Fact inventory: the maps, courses, controls and sitemaps rows, plus a new radio-range row (Parkland 720 m; the Island and the Desert about 2 km). M3's fpvsim `product.json` sources gain `parklandCourses.json` and the allow-list. §7 gets the release checklist, with a pending Nanawing 2 item (its landing names two maps) and the owner decisions the fpvsim session found (Parkland's Hangar art, the Desert page's "new map" title). No milestone dates move.
  - Also found, not Parkland: three www copies and fpvsim's map pages still say Nanawing is for computers only, though touch has been live since 9 Oct (§7).
- **2026-10-13** · Wings catalog review, owner decisions applied to the production database (data, no page templates changed; §6 URL map unchanged since `/wings/…` stays generic). **29 product-page addresses renamed** to the brand–model–size form, each old address 301-redirecting through `slug_alias`: 10 Volantex (`volantex-phoenix-2000-v2` and so on), 8 TA Horizons (`ta-horizons-mighty-edge-33in` pattern), 3 Vortex-RC, 2 RC Factory, 2 FMS, 2 Aeromodellingtutor, `heewing-hunter-j20`, `wltoys-f959s-sky-king`, and `hangar-9-cessna-turbo-skylane-182-69` → `seagull-models-cessna-turbo-skylane-182-69` (rebranded Seagull Models). **Brand spellings standardised:** Dancing Wings Hobby, CARF-Models, Pilot-RC, SKYWING, FlyingMachines, Aeromodellingtutor. **Unpublished** under the maker policy: Havoc Raptor F22, Havoc Trainer 60 Nitro. **Merged** by curator directive (undoable): Nieuport 28, iSport, Space Walker II, Excite-1 pairs. Eight price-jump holds accepted (sellers back at the stored price), two fpvguru TBS Chupito listings confirmed removed, a Hangar 9 Spacewalker draft page created. The sitemap follows the database. Affects no milestone.
- **2026-10-12** · narenana-website `4b1cdb0`: the price verifier now reads Shopify's ProductGroup schema, so multi-variant listings (six at aeromodellingtutor, held since 2 Sep as "page no longer shows a price") publish their price again. Fact row "Wings prices, stock, sellers": unchanged source, restored coverage.
- **2026-10-12** · Anonymous flight-attribute usage counters (edgetx-log-parser client + narenana-website `feat/usage-flight-attrs`, `usage/lib/worker.mjs`; touches the M3 log-viewer privacy-copy item in §7).
  - **What the browser now sends to `/api/usage`, on top of the existing format / gps-presence / outcome / narration counts:** firmware family (`fw_family`: betaflight · inav · emuflight — blackbox logs only), airframe type (`craft`: quad · wing · unknown — best-effort from firmware, board target and flight dynamics), and a finer flight outcome (`debrief_shown` gains `critical` = crash-grade: in-air power or link loss). Each is one low-cardinality allowlisted bucket; the `ALLOW` map and `usageSummary()` in `usage/lib/worker.mjs` were extended to match.
  - **Still never sent:** GPS coordinates, filename, or any log content. The craft classifier reads altitude only relative to the flight's own minimum and uses speed/attitude magnitudes — no position.
  - **Privacy copy:** on-page claims ("the CSV … never leaves your computer", "nothing uploaded") stay accurate and are unchanged; the §7 item above now also covers naming these dims when that copy is rewritten.
  - **Deploy:** owner approved on 2026-10-12; server shipped by fast-forwarding `master` (Workers Builds), client via the log-viewer Pages build.

- **2026-10-12** · narenana-website `d0885ef`, released as `f974d2f` (deployed): Wings product pages laid out for phones. One summary panel (image, headline price, "Buy at <seller> ↗", "Compare N sellers ↓", specs); "Where to buy", "Watch it fly" and "Similar models" are labelled sections with a one-line summary each; on phones the seller table becomes cards and the videos and similar models scroll sideways. Wording: "Buy ↗" only on in-stock listings ("View ↗" otherwise); row dates read "checked 28 Sep 2026". No facts, prices, titles, URLs or structured data changed. Milestone: none.
- **2026-10-08** · Owner approved merging and deploying the aircraft-page revision (narenana-website `a9bc680` plus plan commits, branch `codex/spectre-aircraft-copy`; M3).
  - **Release scope:** the whole-hangar/free-practice copy, Spectre-first aircraft ordering and share card, and aircraft requests through existing Instagram/LinkedIn profiles. No game, data-path, binding or schema changes; no migration is needed.
  - **Preflight:** nine aircraft regressions, 22 non-HTTP SEO regressions, the 88-file asset-version gate and the Worker deploy dry run passed. The pre-release website source, live aircraft HTML/card and active Worker version were saved in ignored local backups. Production baseline: website `c2a3f64`, Worker version `814b3eff-6747-45dc-b120-93f05c775f91`.
  - **Delivery:** owner-authorized release merge to website `master`, followed by Workers Builds and live page/card verification. Canonical URLs, aircraft facts and milestone scope are unchanged.

- **2026-10-08** · Aircraft copy revised to the owner's whole-hangar brief (narenana-website `a9bc680`, branch `codex/spectre-aircraft-copy`; M3 content polish, not deployed).
  - **Positioning:** “Fly more aircraft. Build your skills for free.” The page now introduces lifelike aircraft from a trainer to WUDFLY's 3D-printed wing, explains the enjoyment and practice value of their different handling, and connects simulator practice to confidence at the RC field. It does not promise complete training or manufacturer-validated handling.
  - **Details:** each aircraft describes what to explore and practise. A new practice section and field-readiness FAQ support that message. Spectre remains first; measured specs, model/photo credits and record slots are unchanged.
  - **Sharing:** still Spectre-specific, now “Fly the WUDFLY Spectre free in Nanawing”, with updated description and card. This supersedes the closer-flying headline/campaign in `7d91b95` below.
  - **Requests:** bottom `#request-aircraft` section invites suggestions using the same Instagram and LinkedIn profile URLs as the homepage contact section; no form, data sink or promised addition.
  - **Validation / URL map:** nine file-only aircraft tests and asset-version checks pass; desktop and 390px mobile layouts checked. Canonical page and social-image paths are unchanged, with no redirects, other-page copy propagation or milestone changes required.

- **2026-10-08** · Spectre-first aircraft-page copy (narenana-website `7d91b95`, branch `codex/spectre-aircraft-copy`; M3 content polish, not deployed).
  - **Headline:** “Fly a little closer. Meet the WUDFLY Spectre.” Experience-led descriptions for all four aircraft; hero and final actions launch the Spectre directly.
  - **Order:** Spectre, Nanawing One, Morok, Sukhoi in the lineup, comparison table, aircraft sections and structured ItemList. Shared facts, measured specifications, credits, WUDFLY photos/videos and live-record slots are unchanged.
  - **Sharing:** Spectre-specific Open Graph/Twitter title, description and alt text, plus a dedicated 1200×630 `/nanawing/aircraft/spectre-share-v1.jpg`. The existing Share menu consumes this metadata. Search copy is also Spectre-led.
  - **Validation:** seven new file-only aircraft regressions and 22 existing non-HTTP SEO tests pass; repeated generation is byte-identical; asset-version check passes. Static local preview checked at desktop, 390px and 768px widths without production data services.
  - **URL map / scope:** canonical page remains `/nanawing/aircraft/`; no page moves, redirects or milestone changes. Other products and landing pages need no copy propagation because aircraft facts did not change.

- **2026-10-08** · New page: `www.narenana.com/nanawing/aircraft/`, the first M3 content page (website `feat/nanawing-aircraft-page`).
  - **Content:** four sections with full-resolution renders from the sim's own models, measured specs, live lap records per course, and model credits (two CC BY 4.0 models).
  - **WUDFLY Spectre section:** WUDFLY, links to wudfly.com and the store, and three of WUDFLY's Spectre videos.
  - **Extras:** a visible FAQ with FAQPage markup, and a sitemap entry.
  - **Old guide:** fpvsim `feat/aircraft-page-move` makes `sim.narenana.com/guides/aircraft` forward to the new page and repoints its 19 links.
  - **Mobile:** checked at 360, 390, 768 and 1366px; the 768px header overflow is fixed site-wide.

- **2026-10-08** · fpvsim's Spectre release is live (`11a48ae`, deployed 04:33 UTC). For visitors:
  - **A fourth aircraft, the WUDFLY Spectre**, with yaw on a controller's rudder stick and an 8-step calibration.
  - **New published stall speeds** for the other three wings.
  - **A civilian Desert:** the army base is now a manufacturing plant, and nothing military remains.
  - **A new Desert hero on the sim's landing.**
  - **Website follow-up** (`fix/spectre-desert-home`): the homepage racing card and leaderboard dropdown add the WUDFLY Spectre, and the Desert line says "a manufacturing plant".
  - **Still open:** the sim's in-game name "Spectre" and its leaderboard page's "Spectre · WUDFLY" against the owner's "WUDFLY Spectre" (§7).
  - Nanawing 2 and the log viewer don't mention the aircraft or the army base, so no change is needed there.

- **2026-10-07, 22:50 IST** · Nanawing 2's M2 is live.
  - PR #64 (`release/2026-10-07`) merged at 17:10 UTC as `7195988` and promoted as build `04d4c81e`.
  - Checked on the live landing and guide.
  - M2 is now live on all three sites; the log viewer items remain with the log viewer session.

- **2026-10-07** · Owner decisions and Nanawing 2 status:
  - The new aircraft is named **"WUDFLY Spectre"** everywhere, like the Sukhoi (see §7, Names).
  - Nanawing 2: the Nanawing 2 session folded PR #60 into its consolidated release, PR #64 (`release/2026-10-07`). Nanawing 2's M2 ships when that merges.
  - The other session's `plan-spectre-release` notes (below) are merged into this plan; the conflict with the 6 Oct M2 entries was resolved by keeping both.
- **2026-10-06** · **Pending release, date not set.** fpvsim `spectre-release` a725ad8 (not on `main`), with its guide pages on `chase-camera` 831e283 and the chase framing not yet committed. What visitors will see:
  - Aircraft 3 → 4: the **WUDFLY Spectre**, a 0.60 m, 215 g twin-motor wing, in its original white skin and lettering on an improved model (smoother shading, lettering that shimmers far less, about 30% fewer triangles). The Hangar credits "Aircraft by WUDFLY ↗", linked to WUDFLY's website `https://wudfly.com/`, and a second link, "Buy the SPECTRE ↗", goes to the Spectre's store page `https://wudfly.com/store/spectre` (fpvsim 6d66ff9). The aircraft guide and CREDITS.md carry the same two links.
  - Its simulator specs: 100 km/h top, 25 km/h stall, 344°/s roll, 8.9 m/s climb. The three other wings fly as before, but their published stall speeds become 24 / 28 / 34 km/h (were 27 / 32 / 39, which are now their stall-warning speeds): stall is now the level-flight lift limit.
  - Yaw on the Spectre only, by differential thrust, on a controller's yaw (rudder) stick. A standard gamepad uses its left stick pushed sideways. No yaw key and no touch yaw.
  - The calibration wizard has 8 steps, with an optional Yaw step (was 7).
  - The chase camera frames every aircraft at the same size: the wingspan covers 30% of a 16:9 screen's width. Before, one fixed distance made the Spectre the smallest on screen.
  - fpvsim's landing, guides, map pages and leaderboard page say four aircraft; the guides also cover yaw and the 8-step calibration (on `chase-camera`; at a725ad8 they still say 7 steps and that yaw isn't modelled).

  Fact inventory: aircraft and controls rows. The www copies to change in the same release are in [§7](#7-live-inconsistencies-to-fix-m2). No milestone moves; if this ships before M3, fpvsim's `product.json` starts with four aircraft.
- **2026-10-06, 17:30 IST** · Schedule revised: M2 finished early, so the later milestones move one week earlier.
  - M3 Fri 16 Oct (was Wed 21 Oct)
  - M4 Tue 20 Oct (was Tue 27 Oct)
  - M5 Wed 4 Nov (was Wed 11 Nov)
  - M6 Tue 10 Nov (was Tue 17 Nov)
  - Checkpoints 3 Nov, 23 Nov, 7 Dec. The verdict stays Mon 8 Feb 2027.
  - 11–17 Nov is buffer; the 17 Nov deadline is unchanged.
- **2026-10-06** · M2 deployed to the website (`2f12b44`) and fpvsim (`0de8fe7`), both checked live.
  - nanawing2 PR #60 was merged with its own 5 Oct release (`ceba5ab`) and is in its release pipeline.
  - Owner decision: keep the "coming" messaging for touch controls in Nanawing 2; the in-game text is unchanged.

- **2026-10-06** · M2 branches, not deployed yet:
  - **fpvsim** `feat/m2-content-fixes` (11a4dae..6920ede):
    - current family header and footer;
    - `/guides/the-island` merged into `/maps/island/` with a 301;
    - "Sukhoi S-70 Okhotnik" in full;
    - Island facts corrected (two lakes, two rail loops), in the game too;
    - measured climb rates in the aircraft guide;
    - Desert labelled beta;
    - two service-worker fixes;
    - sitemap dates.
  - **nanawing2** `codex/m2-content-fixes` (e18adca):
    - family header and footer;
    - 8 aircraft everywhere, with the guide listing all 8;
    - Nanawing described with two maps;
    - "keyboard, gamepad or USB RC radio";
    - the private GitHub link replaced with "Get in touch";
    - footer padding;
    - sitemap dates.
  - **website** `feat/m2-content-fixes`:
    - "See all 8 aircraft";
    - the Nanawing 2 controls chip;
    - "Sukhoi S-70 Okhotnik" in the race card and leaderboard;
    - homepage lastmod;
    - stale notes fixed.
- **2026-10-06** · Owner decision: keep FAQPage structured data on every page with a visible FAQ. The log viewer's ban is retired (M2 item ticked; the generator emits it from M3).
- **2026-10-06** · narenana-website: plan written. Decisions locked: folders `/nanawing/`, `/nanawing2/`; the homepage stays Nanawing's front door. The "update this plan" rule was added to all four repos. M1 done.
