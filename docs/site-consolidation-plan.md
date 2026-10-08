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
| `/nanawing/maps/island/`, `/nanawing/maps/desert/` | Map pages (the Island guide merges into the Island map page) | website |
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
- [ ] fpvsim: write `product.json` at build from `src/world/maps.ts`, `src/race/courses.ts` + `desertCourses.json`, `src/aircraft/catalog.ts` + `src/config/aircraftSpecs.ts`, `src/hud/menuCopy.ts`. Add a contract test that generalises `tools/mapPages.test.mjs`. Map-page images (hero, shots, `tracks.json`) are published alongside it.
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
| `sim.narenana.com/` (no `play`) | `www.narenana.com/` | M5 | The homepage is Nanawing's front door |
| `sim.narenana.com/?play…` | stays | — | The app, noindex |
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
- [ ] **The www homepage calls the Desert's compound an army base** (`site/index.html`, Desert band: "An airfield and army base under the mesas"). From fpvsim `desert-civilian` on, the Desert has nothing military: change it to "An airfield and a manufacturing plant under the mesas" when that branch ships.
- [ ] **Nanawing 2's "Source & feedback" link points at a private GitHub repo**, which returns 404 for visitors. Replace it with the contact link.
- [ ] **The log viewer's copy hasn't caught up with what it now does** (log viewer session). The AI Flight Debrief isn't mentioned anywhere. "Nothing is uploaded" sits next to consent-gated findings sent to `/api/debrief`, usage counts to `/api/usage` and anonymous Sentry error reports. The log file itself never leaves the browser; say exactly what does.
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
      Done in the sim on fpvsim `post-release-fixes` (8 Oct, pending merge): the catalogue name, the leaderboard page and two guide tables.
    - [ ] **The Sukhoi on www's aircraft page is a "stealth wing"** twice (the intro, "a 323 km/h stealth wing", and the image alt, "a grey stealth flying wing"). Under the no-military rule (owner, 7 Oct) the sim now says "the heavyweight flying wing"; www should match.

## 8. Fact inventory

<a id="fact-inventory"></a>

Where each shared fact is defined today (the **source**), where it's copied, and where it will come from after M3. Update the row when you change a fact before 17 Nov.

| Fact | Source today | Copies today | After M3 |
|---|---|---|---|
| Header: product names, nav captions, URLs | website `scripts/brand-shell.mjs` | Pasted into fpvsim (index, 10 guides, leaderboard, 404) and nanawing2 (index, guide, 404, `build/`); a stale copy in the log viewer (`scripts/brand-shell.mjs`, `src/FamilyNav.jsx`, 10 generated pages) | `family/products.json` + `family:sync` + header test |
| Footer tagline and links | website `familyFooter()` | Pasted in all app pages; the homepage has its own footer | Same |
| Family assets (shell.css, fonts, share.js…) | website `site/assets/family/*` | Copied by hand into the three apps; already diverged | Family manifest + `family:sync` |
| Nanawing maps (count, names, beta, what's on them). *8 Oct: the Desert's army base became a civilian manufacturing plant* | fpvsim `src/world/maps.ts` | fpvsim landing, guides, map pages, leaderboard page; www homepage (strip, Desert band, `<select>`, JSON-LD); nanawing2 landing | `product.json` → tokens and `data-fact` |
| Race courses (ids, names, km, medals) | fpvsim `src/race/courses.ts`, `desertCourses.json` | fpvsim map pages, leaderboard page, guides; www homepage + `site/assets/leaderboard.js` | Same |
| Nanawing aircraft (names, count, specs, credits). *4 since 8 Oct, with the WUDFLY Spectre; new stall figures (Change log, 8 Oct). www copy: `content/_facts/nanawing.json`, feeding `/nanawing/aircraft/`* | fpvsim `src/aircraft/catalog.ts`, `src/config/aircraftSpecs.ts` | fpvsim landing (stat strip, feature list, hero top-3 names), aircraft guide (specs typed by hand), other guides, map pages (wing count, wing tiles, `public/maps/maps.js`), leaderboard page; www homepage (racing card list, podium aircraft `<select>`) | Same |
| Nanawing 2 aircraft (selectable count, names) | nanawing2 `lib/aircraft-availability.ts` (8) | nanawing2 landing (says 5 and 8), guide (names 5), `build/`; www homepage ("5"), Wings practise links | Same |
| Controls and keys. *Since 8 Oct: the Spectre's yaw stick and an 8-step calibration (Change log, 8 Oct)* | fpvsim `src/hud/menuCopy.ts`, calibration steps in `src/hud/controlsUI.ts` (`src/hud/wizardMath.ts` from the Spectre release); nanawing2 `lib/keymap.ts` | fpvsim landing FAQ, 4 guides (the step count: how-to-play, the guides index, the no-controller guide and its FAQPage); nanawing2 guide; www homepage | Same |
| Log formats and firmware limits | log viewer `src/App.jsx` + parsers | Log viewer landing and 9 content pages, README; www homepage, `/videos/log-viewer-walkthrough/`, Wings practise links | `product.json` |
| Claims: free, no install, no login, offline, phones | Behaviour in each app | www homepage, fpvsim landing, nanawing2 FAQ, log viewer pages ("nothing is uploaded") | `product.json` claims |
| Wings prices, stock, sellers | Database (rendered per request) | Homepage fallback text (rewritten per request) | Unchanged + `/wings/facts.json` |
| Organization, WebSite, app entities (JSON-LD) | None; four versions | www homepage, fpvsim, nanawing2, log viewer, map pages | `family/products.json` |
| Sitemaps, robots, lastmod | Hand-kept per repo + `STATIC_PAGE_LASTMOD` | 5 places | Generated in this repo |
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

- **2026-10-08** · **Pending merge** (fpvsim `post-release-fixes`, local): the sim names the new aircraft "WUDFLY Spectre" wherever a name is shown (the Hangar's tiles and detail panel, the leaderboard's wing dropdown and results card, the sim's leaderboard page, the guide tables in fpv-wings and fpv-simulator-chromebook; the compact board strips keep short names, as for the Sukhoi). The Sukhoi's descriptions drop combat words (Hangar: "heavy stealth UCAV" becomes "the heavyweight flying wing"; fpv-wings: "UCAV shape" and "stealth delta" become "flying wing" and "delta wing"). Also two fixes visitors can feel: a Launch press is no longer lost when the leaderboard answers mid-click or a typed pilot name commits, and on a slow connection the real launch thrower takes over from the stand-in once it loads.

  Fact inventory: the aircraft row (names). §7: the "WUDFLY Spectre" item is done in the sim once this merges; a new item asks www to drop "stealth" from the Sukhoi on the aircraft page. No milestone moves.
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
- **2026-10-07** · **Pending: ships with the WUDFLY Spectre release** (owner request, 7 Oct; fpvsim 4f8e030, on `codex/spectre-wing`, the designer's preview, since 8 Oct): the sim landing's hero shows the Desert (the pyramids and the river) instead of the Island train, and a new picture of the WUDFLY Spectre and the Nanawing One flies over it (rendered from the game's models; between the copy and the map cards on desktops, between the copy and the review on phones). No copy, facts or URLs change.

  Fact inventory: none. No milestone moves; at M5 the hero art and the flyby picture are candidates for the homepage's Nanawing band.
- **2026-10-07** · **Pending: ships with the WUDFLY Spectre release** (owner decision, 7 Oct; fpvsim 561eb01, on `codex/spectre-wing`, the designer's preview, since 8 Oct): the Spectre's battery becomes 2S 1500 mAh with 12 A at full throttle (was 2S 1000 mAh, 15 A), about 7 minutes flat out and about 18 at 60% throttle. Its flight physics is unchanged. Visitor-visible: the Hangar's spec line and the aircraft guide's spec row say "2S LiHV 1500 mAh · 12 A" (changed in the same commit; no www page states the pack).

  Fact inventory: the aircraft row's pending note. No milestone moves.
- **2026-10-07** · **Pending: ships with the WUDFLY Spectre release** (owner decision, 7 Oct; fpvsim `codex/spectre-wing`, merged from `desert-civilian`): nothing military on the Desert map. The army base becomes a manufacturing plant, and every military vehicle, aircraft and building is replaced by civilian models made for the project: container and cargo trucks, excavators, bulldozers, dump trucks, mobile cranes, a utility helicopter, business jets on the flyover circuit, factory halls, warehouses, gas storage spheres and a process unit. Visitor-visible copy:
  - the Hangar's Desert description: "an airbase" → "a factory", "an air base" → "a manufacturing plant";
  - the sim landing: "army base" → "manufacturing plant";
  - the Desert map page: the "Airfield & factory" feature, a photo caption, and the Tunnel Run line "back round the factory" (also in the course registry).

  Fact inventory: the maps row (descriptions). The www homepage's Desert band still says "army base": see [§7](#7-live-inconsistencies-to-fix-m2). No milestone moves.
- **2026-10-07** · **Pending release (the WUDFLY Spectre, entry below), date not set.** fpvsim `codex/spectre-wing` c652793 (pushed; the designer's preview), merged with `main` locally at 27f0011 (not pushed). Added since 6 Oct, visible to visitors when it ships:
  - **Sim landing redesign:** the hero uses the Island art (a freight train through the fields), the first screen carries two map cards (the Island, and the Desert marked beta) linking to the map pages, the sections are tighter and show the Island and Desert art, the final launch band shows the Windmill Run start arches, and the FAQ gains "Where can I learn more?" (the guides and both map pages). The stat strip says "the desert (beta)". No URL changes.
  - **Island map page tour (main's M2 copy):** with the Spectre in the fleet, the gorge tip says the Spectre rolls fastest (344°/s against the Nanawing One's 241°/s), and the biplane line names the three wings that can keep up with it (the Spectre tops out at 100 km/h).
  - **Practice guide:** the Sukhoi S-70 Okhotnik line gives its 34 km/h level-flight stall (main's M2 line said 39, the stall-warning speed).

  Fact inventory: the aircraft row's pending note stands. No milestone moves. At M5 the sim landing's unique content folds into the homepage; the redesign's map cards and art are candidates.
- **2026-10-06** · **Pending release, date not set.** fpvsim `codex/spectre-wing` (the designer's preview; not on `main`); its state on 7 Oct is in the entry above. What visitors will see:
  - Aircraft 3 → 4: the **WUDFLY Spectre**, a 0.60 m, 215 g twin-motor wing, in its original white skin and lettering on an improved model (smoother shading, lettering that shimmers far less, about 30% fewer triangles). The Hangar credits "Aircraft by WUDFLY ↗", linked to WUDFLY's website `https://wudfly.com/`, and a second link, "Buy the SPECTRE ↗", goes to the Spectre's store page `https://wudfly.com/store/spectre` (fpvsim 6d66ff9). The aircraft guide and CREDITS.md carry the same two links.
  - Its simulator specs: 100 km/h top, 25 km/h stall, 344°/s roll, 8.9 m/s climb. The three other wings fly as before, but their published stall speeds become 24 / 28 / 34 km/h (were 27 / 32 / 39, which are now their stall-warning speeds): stall is now the level-flight lift limit.
  - Yaw on the Spectre only, by differential thrust, on a controller's yaw (rudder) stick. A standard gamepad uses its left stick pushed sideways. No yaw key and no touch yaw.
  - The calibration wizard has 8 steps, with an optional Yaw step (was 7).
  - The chase camera frames every aircraft at the same size: the wingspan covers 24% of a 16:9 screen's width (30% was tried first; the owner moved it back on 6 Oct). Before, one fixed distance made the Spectre the smallest on screen.
  - fpvsim's landing, guides, map pages and leaderboard page say four aircraft; the guides also cover yaw and the 8-step calibration.

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
