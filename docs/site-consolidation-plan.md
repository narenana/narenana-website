# One site: moving every indexable page onto www.narenana.com

**Status (6 Oct, 17:30 IST):** in progress.
- M1 is done.
- M2 is live on the website and the Nanawing sim. Nanawing 2's M2 release is in its pipeline ([PR #60](https://github.com/narenana/nanawing2/pull/60)).
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
| **M2** | **Wed 14 Oct** | Wed 14 Oct | Fix today's drift in place; merge the two Island pages | **Live** on the website and fpvsim 6 Oct. Nanawing 2 in its release pipeline. Log viewer items with the log viewer session, by Fri 16 Oct |
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

### M2: Fix today's drift in place (due Wed 14 Oct) — live on 2 of 3 sites

No moves between hosts. One page merge on the sim host. Checklist and status in [§7](#7-live-inconsistencies-to-fix-m2).

- [x] Website live 6 Oct (`2f12b44`).
- [x] fpvsim live 6 Oct (`0de8fe7`, deployed 16:17 UTC).
- [ ] Nanawing 2: [PR #60](https://github.com/narenana/nanawing2/pull/60) is merged with Nanawing 2's own 5 Oct release and its gates are re-running. It merges when they pass and no other Nanawing 2 release is running. Expected Wed 7 Oct.
- [ ] Log viewer items (header and footer, AI Debrief copy, old widget guard), by the log viewer session, by Fri 16 Oct.

Exit: every item in §7 is either fixed or assigned to a later milestone, and the live sites agree with each other.

### M3: One content home, facts files and checks (Fri 16 Oct)

Also in M3:
- Fix the two www layout bugs found during M2: the 768px sideways scroll, and the Share button over "Back to the top".
- Use one fact-token phrase for Nanawing's controls on www.

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
| `sim.narenana.com/guides/aircraft` | `/nanawing/guides/aircraft/` | M5 | |
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
| nanawing2 | [PR #60](https://github.com/narenana/nanawing2/pull/60), branch head `ceba5ab` | **In the release pipeline.** Merged with Nanawing 2's own 5 Oct release (one docs conflict; `build/` regenerated; provenance and 407 unit tests pass). Merges when its gates pass and no other Nanawing 2 release is running; expected Wed 7 Oct |

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
- **www at 768px:** the page scrolls sideways by 11px (the `.nn-cta` header button and `.depth-image`). **Scheduled for M3.**
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
- [ ] **The log viewer's copy hasn't caught up with what it now does** (log viewer session). The AI Flight Debrief isn't mentioned anywhere. "Nothing is uploaded" sits next to consent-gated findings sent to `/api/debrief`, usage counts to `/api/usage` and anonymous Sentry error reports. The log file itself never leaves the browser; say exactly what does.
- [ ] **Stale internal notes:**
  - `docs/post-release-todo.md` says the log viewer has no GA or Sentry ID; both are set now.
  - The `forward()` comment in `src/index.js` mentions a share widget the Worker no longer injects.
  - The log viewer's `share.css` has a guard for that old widget.
- [ ] **Names vary.** "Sukhoi S-70" vs "Sukhoi S-70 Okhotnik". Nanawing 2's input is described four ways (keyboard / gamepad / RC radio / USB game controller). Pick one wording each.
- Later milestones:
  - **M3:** structured-data `@id` conflicts across hosts (one scheme in `products.json`); map pages without the family header and footer; `/log-viewer/` listed in two sitemaps; GA4 missing on the sim guides.
  - **M5:** two hosts competing for "nanawing" with near-identical titles.

## 8. Fact inventory

<a id="fact-inventory"></a>

Where each shared fact is defined today (the **source**), where it's copied, and where it will come from after M3. Update the row when you change a fact before 17 Nov.

| Fact | Source today | Copies today | After M3 |
|---|---|---|---|
| Header: product names, nav captions, URLs | website `scripts/brand-shell.mjs` | Pasted into fpvsim (index, 10 guides, leaderboard, 404) and nanawing2 (index, guide, 404, `build/`); a stale copy in the log viewer (`scripts/brand-shell.mjs`, `src/FamilyNav.jsx`, 10 generated pages) | `family/products.json` + `family:sync` + header test |
| Footer tagline and links | website `familyFooter()` | Pasted in all app pages; the homepage has its own footer | Same |
| Family assets (shell.css, fonts, share.js…) | website `site/assets/family/*` | Copied by hand into the three apps; already diverged | Family manifest + `family:sync` |
| Nanawing maps (count, names, beta) | fpvsim `src/world/maps.ts` | fpvsim landing, guides, map pages, leaderboard page; www homepage (strip, Desert band, `<select>`, JSON-LD); nanawing2 landing | `product.json` → tokens and `data-fact` |
| Race courses (ids, names, km, medals) | fpvsim `src/race/courses.ts`, `desertCourses.json` | fpvsim map pages, leaderboard page, guides; www homepage + `site/assets/leaderboard.js` | Same |
| Nanawing aircraft (names, count, specs) | fpvsim `src/aircraft/catalog.ts`, `src/config/aircraftSpecs.ts` | fpvsim landing, aircraft guide (specs typed by hand), other guides, leaderboard page; www homepage | Same |
| Nanawing 2 aircraft (selectable count, names) | nanawing2 `lib/aircraft-availability.ts` (8) | nanawing2 landing (says 5 and 8), guide (names 5), `build/`; www homepage ("5"), Wings practise links | Same |
| Controls and keys | fpvsim `src/hud/menuCopy.ts`; nanawing2 `lib/keymap.ts` | fpvsim landing FAQ, 4 guides; nanawing2 guide; www homepage | Same |
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
