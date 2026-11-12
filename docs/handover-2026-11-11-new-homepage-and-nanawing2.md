# Handover: new homepage and `/nanawing2/` (11 Nov 2026)

The work is on branch `ccr-257b3a00-pltw47` of narenana-website. It is not live, and nothing has been merged to `master` or deployed. fpvsim and nanawing2 have no changes for this work: their branches of the same name exist only in the cloud session that did it, and were never pushed.

## The brief and the owner's answers

The owner's brief (3 Nov): "https://benglooru.com/ use this inspiration to make completely new website pages for narenana, nanawing and nanawing 2. Design, copy, videos and overall design all look crisp and attractive."

- **Pages:** "Keep the plan: 2 pages". A new `www.narenana.com/` serves as the umbrella page and Nanawing's front door (plan decision 3). A new `www.narenana.com/nanawing2/` is M4's page.
- **Videos:** "Render clips from the sims" and "Use my YouTube flights".
- **Design reference:** benglooru.com, borrowed for its dark, video-led layout and nothing else.

## Where things are

| What | Path |
|---|---|
| Design system: dark tokens, components, responsive rules | `site/assets/night.css` |
| Behaviour: header on scroll, reveals, lazy clips, switchers | `site/assets/night.js` |
| Homepage (hand-written; edit it in place) | `site/index.html` |
| `/nanawing2/`, a **generated** file. Don't edit it directly. | `site/nanawing2/index.html` |
| Its source: template, then the builder (fleet, FAQ, JSON-LD, share text) | `scripts/redesign/nanawing2-page.template.html`, `scripts/redesign/build-nanawing2-page.mjs` |
| Homepage images | `site/assets/home/` (hero formation art, map renders, Hangar capture) |
| Nanawing 2 clips and aircraft pictures | `site/assets/nanawing2/` |
| Real-input page checks and the copy extractor | `scripts/redesign/checks/` |
| Clip renderers (Nanawing 2 used; Nanawing trial) | `scripts/redesign/clips/` |
| Plan entries | `docs/site-consolidation-plan.md`: Change log 11 Nov, URL map, Fact inventory (Nanawing 2 aircraft, Controls and keys), M3 tick |

To rebuild `/nanawing2/` after editing its source:

```
node scripts/redesign/build-nanawing2-page.mjs && npm run assets:version
```

On 11 Nov the builder's output matched the committed page byte for byte.

## Branch history

- `c6361ee`, `380834a`, `a9ae246`, `0143fbc`: build, then three strict brand-voice passes. All `[skip ci]`.
- `874a25a`: the real Nanawing 2 clips, the copy fixes from the deeper review, and layout fixes.
- `07ff13a`: plan update recording why the branch has no preview link.
- `9aef7df`: `origin/master` (`52a8bda`) merged in. That brings master's `seo-content.mjs` fix, which stops the script rewriting the homepage's copy; without it, a run would have reverted the new homepage. The only conflict was the plan's change log, and both sides' entries were kept.
- The commit that adds this file: the tooling and the handover.

## Contracts the homepage must keep (all test-locked)

The tests are `catalog/test/seo.mjs`, `catalog/test/suite.mjs`, `scripts/nanawing-aircraft.test.mjs` and `scripts/nanawing-landing.test.mjs`.

- **Share tags:**
  - og:title starts "narenana " and names "simulators" and "RC plane prices".
  - og:description contains "Indian sellers".
  - og:image is `/og.jpg`.
- **Titles and descriptions:**
  - `<title>` starts "Nanawing".
  - The Organization and WebSite descriptions start "Nanawing and Nanawing 2,".
  - The meta description is 160 characters or fewer.
- **Hero text:** `<p class="hero-description">` keeps "on your phone with two thumb sticks." and "most laptops from the last few years".
- **Header and page structure:**
  - Exactly one `<header>`. Section heads use `<div class="sec-head">`.
  - The header must equal `familyNav({home:'', cta:{label:'Fly FPV',href:'https://sim.narenana.com',newTab:true}, contactArrow:'↓'})`.
- **Worker slots:** `#vid-grid`, `#shop-grid`, `#shop-status` and `#catalog-seller-count`, which the Worker fills.
- **Race board:**
  - The markup and select ids are unchanged.
  - Aircraft order is sukhoi, desertwing, morok, spectre, chupito, darkwing.
  - The Estate Run course keeps `data-aircraft="spectre chupito"`.
  - The TBS note appears once.
- **Wing cards:** `ul.fleet#nanawing-fleet` holds one `a.craft` per aircraft, linking to `/nanawing/aircraft/#id`, plus "Compare all 6 wings".
- **JSON-LD:** must come out of `scripts/seo-content.mjs` byte-identical. This is master's new test, and the branch passes it. The VideoObjects share their `@id`s with the `/videos/` pages.

## Media

- **Nanawing 2 clips** were rendered frame by frame from the real sim (its renderer and physics, at 1/120 s) by a scripted pilot, then encoded twice: H.264 yuv420p with faststart, and 10-bit AV1 (`codecs=av01.0.08M.10`). There's no audio.

  | Clip | Length | Aircraft | Notes |
  |---|---|---|---|
  | `hero` | 10 s, 1920×1080 | NanaTrainer | Seamless loop. `hero-portrait` (720×1280) is a separate native portrait cut for phones. |
  | `takeoff` | 3 s | NanaTrainer | Lifts off from the mown grass runway, which the sim calls a runway. |
  | `landing` | 5.5 s | NanaTrainer | Touches down at about 3.9 s; the sim rates it "good, on runway". |
  | `aerobatic` | 7.5 s | NanaEdge | Two full inside loops (flight trace), no knife-edge, no rolls. |

  The 8 aircraft pictures are 1600×900 WebP with transparency.
- **Known weak spots, all in the owner's hands:**
  - No motion blur.
  - The hero, its portrait cut and the loops use camera positions the sim itself doesn't offer, yet they're labelled "In the sim".
  - The take-off and loop clips show a short double exposure where they dissolve back to the start. A straight cut would need a re-render, because the frames were deleted.
  - The loops are filmed against plain sky.
  - The landing poster is a small plane on a grey sky.
- **Nanawing (FPV) clips (12 Nov):** the homepage's maps switcher plays three clips rendered on the owner's computer from fpvsim `main` (`aeb7d16`): `clip-island` (Spectre beside the freight train, 6 s, seamless loop), `clip-desert` (Desert Wing past the pyramids, 7 s) and `clip-parkland` (Spectre over the lake and bridge, 5 s), in `site/assets/home/`. The desert and parkland loops restart with a straight cut. The hero still uses the approved formation art.
  - To re-render, from `scripts/redesign/clips/nanawing/scripts/`: set `FPVSIM_REPO` to a clean checkout of fpvsim `main` with `node_modules` (not a work-in-progress branch), `CLIP_CAPTURE=jpeg` (ten times faster grabs) and `FFMPEG` to ffmpeg with `libsvtav1`.
  - `node render.mjs <shot> --every 15` scouts a line (stills and `../out/<shot>-scout.jpg`); `node render.mjs <shot> --ss 2` renders (add `--auto` for `island-train`); `node encode.mjs <shot> --maxrate <kbit> --av1max <kbit>` encodes. Used: desert 1800/1200, parkland 2200/1700, island 4000/3000 with `--crf 21`.
  - Shots are in `shots.mjs`. The pilot follows a path over the ground and does not dodge trees or buildings, so scout every new line.
  - A cloud container has no GPU and renders soft; on Linux the scripts still default to software rendering (`CLIP_GPU=1` to change).
- **Re-rendering Nanawing 2 clips:**
  - The scripts expect a sibling nanawing2 checkout with `npm ci`, or set `NW2_REPO`, plus `ffmpeg` with `libsvtav1`.
  - Run them from `scripts/redesign/clips/nanawing2/scripts/`:

    ```
    node render2.mjs hero,hero-portrait,takeoff-short   # --stills=6 checks framing, --plan dry-runs only
    node render2.mjs landing,aerobatic
    ./encode2.sh hero 10 1 3.3 3.3
    ./encode2.sh hero-portrait 10 1 2.35 2.35
    ROTATE=1 ./encode2.sh takeoff-short 3 0.5 0.95 1.1
    ./encode2.sh landing 5.5 0 0.95 1.1
    ROTATE=1 ./encode2.sh aerobatic 7.5 0.5 0.95 1.1
    node studio.mjs                                      # the 8 aircraft pictures
    ```

  - Shots are defined in `shots2.mjs`; the pilot and cameras are in `page-driver.js`.
  - Outputs go to `out2/` and `frames/` next to `scripts/`; both are gitignored.
  - Copy the results into `site/assets/nanawing2/` (`takeoff-short.*` is renamed `takeoff.*`), then run `npm run assets:version`.
  - Every browser these scripts launch is headless and muted.

## How to check it

```
npx wrangler dev --local --ip 127.0.0.1 --port 8787   # needs a gitignored .dev.vars with ADMIN_PASS=<any> for the admin tests
npm run assets:check
npm run aircraft:test          # 24/24
npm run seo:test               # seo.mjs 35 + prints-live 5 pass, 1 TODO (the share card, waiting on the owner)
npm run usage:test             # 14/14
npm run catalog:test           # 70 pass / 7 fail: the same 7 fail on master with an empty local D1
```

- **Page checks** (`scripts/redesign/checks/`): Playwright, headless, muted, with real input and loopback-only requests. narenana-website has no Playwright, so borrow fpvsim's: `NODE_PATH=../fpvsim/node_modules node scripts/redesign/checks/interact.cjs`.
- **`interact.cjs`** covers:
  - the map and clip switchers (only the active clip plays);
  - the phone "Send it to your computer" button, which opens the share dialog;
  - zero video requests under reduced motion;
  - main buttons in the first screen.
- **The other checks:**
  - `sharecheck.cjs`: the dialog heading follows the button, and the copy message.
  - `herofold.cjs <outdir> [url] [prefix]`: hero shots on 4 phones and 2 laptops.
  - `pageshot.cjs <url> <prefix> laptop|phone`: full page and section shots, plus an overflow and video report.
  - `elshot.cjs`: a screenshot of one element.
  - `strings.py <page.html>`: extracts every string a visitor reads, as input for the copy review.
- **State on 11 Nov:**
  - No horizontal overflow on any of the six screen sizes.
  - Clips play, and pause off-screen.
  - The phone hero shows the plane above the copy.
  - The laptop "In the sim" tag sits clear of the floating Share button.

## The copy gate (CLAUDE.md)

Run the brand-voice reviewer in strict mode on the **whole** page, fix every finding, and re-run until it's clean. Then read every line yourself against the guide's five checks.

- **Homepage:** clean after three passes. Its copy hasn't changed since; the shared share-dialog strings were reviewed on `/nanawing2/`.
- **`/nanawing2/`:** clean on the third pass of its last round. That round checked claims against the sim's source, `lib/keymap.ts` and `lib/launch-mode.ts`.
- **Lines kept on purpose, because they're test-locked or shared:**
  - The laptop line and the hero opening.
  - The board sentence.
  - The VideoObject text, shared with `/videos/`.
  - The third Wings chip, which the Worker rewrites.
  - The shared footer.
- **Reviewer prompt:** extract the page with `python3 scripts/redesign/checks/strings.py site/nanawing2/index.html > /tmp/qa.txt`, then give a general-purpose agent this:

  > You are the brand-voice quality-assurance reviewer for narenana, in STRICT mode (settings: fpvsim/.claude/brand-voice.local.md). Review one whole page, every string a visitor can read, against narenana-website/.claude/brand-voice-guidelines.md. Read all of it first, especially "The first rule: write about the pilot, not the product", the Banned patterns, Style rules and Terminology table. Text: /tmp/qa.txt; HTML: <page>. Product facts come from the sims and are true; check claims against the sim source when the page states a control, a key or a behaviour. For each line: 1) about the pilot or the product? 2) does it sell a limit? 3) would a pilot say it at the field? 4) banned patterns (two-beat slogans, rhetorical-question headings, cute conceits, explore/discover/unlock/immersive…, triads, em-dash drama, stating the obvious) 5) style and terminology (sentence case, Indian/British spelling, practise as the verb, no space before mm, verb-first CTAs, "no install, no login", pilot, RC radio). Report a table: exact string, rule broken, must-fix/should-fix, suggested rewrite; then the borderline lines you passed. Edit nothing.

## Previewing

- **No `workers.dev` preview exists, and none can.** The Worker implements a Durable Object (`DebriefLimiter`), and Cloudflare creates no preview URLs for such Workers. The guessed `ccr-257b3a00-pltw47-narenana-website.narenana.workers.dev` does not exist.
- **Cloud sessions can't deploy.** They have no wrangler login and no Cloudflare key, and the owner declined to add one on 11 Nov. Live deploys run on Cloudflare's or GitHub's side; earlier branch previews were run from the owner's computer, where wrangler is logged in.
- **Static preview from the owner's computer.** This serves no Worker and no data, and is marked noindex. The price and video slots show their fallback cards.

  ```
  rm -rf /tmp/www-preview && cp -r site /tmp/www-preview
  printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > /tmp/www-preview/_headers
  mkdir -p /tmp/empty && cd /tmp/empty        # NOT the repo: see the warning below
  node <repo>/node_modules/wrangler/bin/wrangler.js pages deploy /tmp/www-preview --project-name=narenana-www-preview --branch=ccr-257b3a00-pltw47 --commit-dirty=true
  ```

  **A preview is up (11 Nov).** Redeploy with the commands above after each change.

  **Never run `wrangler pages project create` inside the repo.** The project already exists (created 11 Nov). wrangler 4.137 hands that command to a Workers deploy, which reads the repo's `wrangler.toml` and publishes the whole Worker, with production bindings and cron schedules, under the project's name. That happened on 11 Nov; the stray Worker was deleted within a minute and no schedule fired. If the project ever has to be made again, run the command from an empty folder with `--force`.

  It ends up at `https://ccr-257b3a00-pltw47.narenana-www-preview.pages.dev/` and `…/nanawing2/`.
- **Local preview of the full Worker:** `npx wrangler dev`, then open http://localhost:8787. Local data is empty.
- **Runbook boundary:** `docs/release-runbook.md` "Current boundary" (24 Sep) still says previews and deploys need the owner's go-ahead. The owner asked for a preview on 11 Nov.

## Open decisions for the owner

1. **Homepage share image.** `site/og.jpg` still carries banned slogans; its seo.mjs TODO and `docs/post-release-todo.md` track it.
2. **Nanawing 2 share card.** It says "8 aircraft · No install" (nanawing2 `scripts/social-card.html`).
3. **New milestone dates.** M4 (20 Oct), M5 (4 Nov) and M6 (10 Nov) have passed, and the plan closes 17 Nov.
4. **The M4 redirect, on merge day.** The header's "Nanawing 2" link still goes to the bare `nanawing2.narenana.com/`, and "Read the Nanawing 2 flying guide" goes to `nanawing2.narenana.com/guides/how-to-play`. Both should follow the redirect rule.
5. **Nanawing hero video.** The maps now play as clips (12 Nov); the hero is still the formation art. Say if the hero should be a clip too, or supply flight footage.
6. **The "In the sim" label** on clips filmed from camera positions the sim doesn't offer: keep it or reword it.
7. **The other share-script copies.** fpvsim's and nanawing2's `public/assets/family/share.js` still say "Link copied. Ready to share!". They had already drifted (plan §8, Family assets row).

## Next steps

1. Owner review on a preview, as above. Apply the feedback, put new owner rules into the brand voice guide, and re-run the copy gate on each touched page.
2. Merge `origin/master` again if it has moved, and re-run every suite.
3. **Release**, only on the owner's explicit say-so, following `docs/release-runbook.md`:
   - a `--no-ff` merge to `master`, whose message must not start with `[skip ci]`;
   - Workers Builds deploys;
   - check www, then turn on the M4 redirect on the same day.
4. Optional:
   - Shrink `site/assets/home/map-*-1600.webp` (about 300 KB each).
   - A better landing poster.
   - Re-render the take-off and loop clips with a straight cut instead of the dissolve.
