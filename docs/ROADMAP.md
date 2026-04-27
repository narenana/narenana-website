# narenana.com — Product Roadmap

*Last updated: 2026-04-27*

## Vision

> The home for browser-native pilot tools.

narenana.com is a single domain hosting independently-built tools that solve concrete pain points for RC and FPV pilots. **Every tool runs entirely in the browser** — no uploads, no accounts required, no quota. The brand is built on an existing YouTube channel, so each tool ships alongside instructional content and gets distribution for free.

The infrastructure is set up for this multi-tool model:
- A Cloudflare Worker on `narenana.com` routes `/<tool-slug>/*` to whichever Pages or Workers project the tool lives in.
- Each tool stays in its **own GitHub repo**, with its own build pipeline and its own engineering pace.
- Adding a tool = pick a slug + add an env var + add a routing branch in `src/index.js`. ~5 minutes.
- `latest.narenana.com` is a staging mirror — point any branch of any tool at it for pre-merge review.

## Audience + jobs-to-be-done

| Persona | Tells us | What they need |
|---|---|---|
| **Hobby fixed-wing / GPS plane pilot** | "I want to know how the cross-country went." | Log viewer ✅ |
| **FPV freestyle pilot** | "I want to share an epic flight clip with telemetry overlaid." | DVR + telemetry overlay tool ⏳ |
| **Quad builder / tinkerer** | "Will these motors / ESCs / battery work in my frame?" | Build calculator ⏳ |
| **Tuner** | "Tell me what to change in Betaflight." | PID-tuning assist ⏳ (after blackbox parser lands) |
| **Tech-savvy pilot maintaining a fleet** | "When did I last replace those motors?" | Maintenance log ⏳ |
| **Channel viewer** | "I just watched narenana's video, where's the flight log?" | Tighter video → tool integration ⏳ |

## North-star metric

**Pilots returning to narenana.com within 30 days, with at least one tool used in each visit.**

Today, the funnel is: YouTube → narenana.com landing → log viewer → exit. The ask: turn that into a **multi-tool pilgrimage** where each visit lands on a different tool depending on the day's task.

Secondary metric: **traffic from organic search to tools by name** (e.g. "5 inch freestyle build calculator" → narenana.com/build/). Tools that solve specific pain points are search-engine magnets — the log viewer alone won't drive that.

## Strategy

Three principles drive the order of work:

1. **Lead with shareability.** A tool whose output gets posted to Discord / Reddit / Instagram is its own marketing engine. The log viewer's `?log=<url>` share endpoint and the proposed MP4-export feature both qualify. **DVR + telemetry overlay** is the strongest lever here: nobody else makes one for free in the browser, and the output is inherently posted.

2. **Each tool is a destination AND a pipeline.** Build calculator visitors who don't fly yet → see "log viewer" → curious. Log viewer visitors who just crashed → see "build calculator" → curious. Cross-recommendation in each tool's empty state.

3. **The umbrella site stays light.** narenana.com root page is a curated landing — hero banner, 3 features bullets, the tool grid, latest YouTube. It's not a CMS, blog, or forum. Distractions there cost more than they earn.

## Roadmap

### Now (Q2 2026 — 0–3 months)

Strengthen the foundation, ship one new tool, learn what users actually want.

#### Foundation

- **Tool listing page polish** — current grid is one tool. As soon as we have two, we need clearer hierarchy: featured tool, recent additions, "by use case" categories.
- **Search-friendly tool meta** — each tool's landing route gets a proper `<meta>` block (titles, descriptions, OG card, sitemap entry). The log viewer already has this; new tools must too.
- **Sitemap + structured data** — `/sitemap.xml` listing all tools + key landing routes; tool pages emit `SoftwareApplication` JSON-LD for rich Google results.
- **Newsletter sign-up form** *(S)* — single form, email + zip optional, deliver via Buttondown or similar. Use it sparingly — quarterly digest of new tools + standout community flights.

#### First new tool: DVR + telemetry overlay (P0)

> Drop a video file (DVR or goggles capture) + a flight log. Pick one sync point. Get back an MP4 with telemetry overlaid (alt, speed, attitude, battery, mode badge, mini-map).

- Why first: zero alternatives in the browser today; output is intrinsically shareable; pulls people into the log viewer to learn more.
- Slug: `narenana.com/dvr-overlay/`.
- Tech: WebCodecs (Chrome / Edge / Safari 17+) for MP4 decode + encode in browser. CSV parser shared with log viewer. Cesium / Three.js NOT needed — overlay is 2D HUD on video.
- Effort: **M (3–4 weeks)** for v1.
- v1 scope: 1080p, 60 fps, max 5 min video, English-only HUD, single sync-point alignment.

#### Second new tool: build calculator (P1)

> Pick frame, motors, ESCs, props, battery, FC stack. Get all-up weight, thrust-to-weight ratio, theoretical max amp draw, voltage sag estimate, PID profile starting point.

- Why: solves a concrete repetitive task ("will this work?"). High SEO value — every "build" search query.
- Slug: `narenana.com/build/`.
- Tech: pure browser, JSON parts catalogue (open-source maintainable), `localStorage` for "save this build."
- Effort: **M (2–3 weeks)** for v1 with a curated parts list (50 frames, 30 motors, 20 ESCs, 30 batteries).
- Stretch: import from CSV / Google Sheets so community can contribute parts data.

### Next (Q3 2026 — 3–6 months)

Once the multi-tool pattern is real, expand into more pain points.

- **Tool 3 — Maintenance log** *(M)* — track parts swaps, flight cycles, cumulative time per drone. localStorage-first (no account needed); export/import JSON. Eventually optional account for cross-device sync.
- **Tool 4 — Channel manager / VTX picker** *(S)* — given my crew's pilot count + frequencies, what's the safest channel allocation? Open-source frequency tables already exist; this just needs a clean UI.
- **Crash analyzer (could be standalone or embedded in log viewer)** *(M)* — upload log, get classified report: signal loss / battery sag / mechanical / pilot input. Big emotional draw.
- **YouTube → tool deep links** — channel pinned video has a link in the description that opens narenana.com with a specific log preloaded. Leverages existing audience to drive the funnel.
- **Pilot bookmarks** *(S)* — save specific tool states (a log URL, a build, a PID profile) under a slug — `narenana.com/p/<random-id>` — and share. No login required; they're public + non-discoverable by default.
- **Community gallery (curated)** *(M)* — pilots can publish their best flights with one click from the log viewer. Curated by the channel owner; not a free-for-all. Each entry is a permalink + thumbnail + 30-sec MP4 preview.

### Later (Q4 2026+ — 6–12 months)

These need at least one of the Now/Next ships to feel solid before they're worth committing to.

- **Tool 5 — Field finder** — community-submitted flying spots: GPS, type (RC field / FPV park / open space), local rules, notes. Lat/long + photo + comments.
- **Tool 6 — Race timing** — pair pilot's transmitter + lap timer (BLE) → record splits, compare to friends. Could integrate with the log viewer's GPS pass-detection.
- **Pilot directory** — opt-in profile page (callsign + favourite drone + best flights). Not a social network — just a "find pilot X's stuff" page.
- **Affiliate marketplace** — equipment links with tracked clicks. Only after we trust the parts catalogue, only on tools where it doesn't sour the experience (build calculator: yes; log viewer: no).
- **API for third parties** — embed the log viewer / build calculator in OEM sites or fly-club portals. Cloudflare Workers already supports this with a bit of CORS config.

## What's intentionally NOT here

- **A blog or CMS.** YouTube is the channel; narenana.com is the toolset. Don't compete with the YouTube content — link to it.
- **Custom user-generated content moderation.** Curated only — channel owner picks what to feature. Avoids forum/comment hell.
- **A login wall on tool basics.** Every tool's core flow must work anonymously. Login is for opt-in extras (cross-device sync, share-link aliases).
- **Native mobile apps.** PWA install via the existing web is sufficient.
- **Stripe / paid tier in 2026.** Revenue (if any) is earned via affiliate / sponsorship; tools stay free.

## Tool acceptance criteria

When a new tool is proposed, it must be answer-yes-to-all to ship under narenana.com:

1. **Browser-native.** No required server beyond static hosting + a tiny Cloudflare Worker.
2. **No upload by default.** User data stays local. Sharing is explicit + opt-in.
3. **Solves one specific pain point** that pilots feel today. No "platform plays" without a job to do.
4. **Has a v1 SEO-target query** — what would a pilot google to find it?
5. **Owner can demo it on the YouTube channel.** Distribution is part of the design.

## Engineering / repo layout

```
narenana-website/                     ← THIS REPO
├── src/index.js                      Worker — routing + cron
├── site/                             Landing page + assets
├── latest-router/                    Staging router (latest.narenana.com)
└── docs/ROADMAP.md                   ← you are here

edgetx-log-parser/                    Anchor tool — own repo
├── src/                              React + Vite + Cesium + Three
└── docs/ROADMAP.md                   Tool-specific roadmap

dvr-overlay/                          (planned)
└── ...

narenana-build/                       (planned)
└── ...
```

Each new tool gets its own repo. The umbrella Worker bumps a single line in `[vars]` + a routing branch in `src/index.js` to mount it under a path prefix.

## Recently shipped (umbrella site)

- 2026-04-27 · `latest.narenana.com` staging router with `use-branch.sh` script
- 2026-04-26 · Tighter top fold, CTA above bullets
- 2026-04-26 · Open Graph + Twitter Card meta on landing
- 2026-04-26 · Worker-with-static-assets architecture (replaced Pages Functions)
- 2026-04-26 · YouTube feed cache (`/videos.json` from KV, hourly cron)
- 2026-04-26 · Path-prefix routing (`/log-viewer/*` → tool's own deployment)
- 2026-04-26 · Initial scaffold + `narenana-website` GitHub repo
