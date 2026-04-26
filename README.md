# narenana.com

The home page for narenana — a Cloudflare Worker (with static assets) that
serves the landing page, routes `/log-viewer/*` to the EdgeTX Log Viewer
(a separate Pages project), and exposes a YouTube feed cache at
`/videos.json` refreshed by an hourly cron.

```
                          narenana.com / www.narenana.com
                                       │
              ┌────────────────────────┴────────────────────────┐
              │  Worker: narenana-website (this repo)           │
              │                                                 │
              │   ┌──────────────────────────────────────┐      │
              │   │ src/index.js                         │      │
              │   │   fetch(request, env, ctx)           │      │
              │   │   scheduled(event, env, ctx)         │      │
              │   └──┬─────────────┬─────────────┬───────┘      │
              │      │             │             │              │
              └──────┼─────────────┼─────────────┼──────────────┘
                     │             │             │
        /log-viewer/*│   /videos.json            │ /*
        forward      │   KV-backed,              │ env.ASSETS.fetch
                     │   cron'd JSON             │ (static files)
                     ▼             ▼             ▼
       edgetx-log-parser     KV: VIDEOS_KV     site/index.html
       .pages.dev            (refreshed         + site/assets/
       (separate repo,        hourly)
        own Pages project)
```

A single Worker handles every request:

- `/log-viewer` and `/log-viewer/*` are stripped of the prefix and forwarded
  to the tool's own Pages deployment (`edgetx-log-parser.pages.dev`).
- `/videos.json` is served from KV — populated by the hourly cron that
  fetches YouTube's public Atom feed for `YOUTUBE_CHANNEL_ID`.
- Everything else falls through to `env.ASSETS.fetch(request)` — the static
  files in `site/`.

Each new tool mounts under its own path prefix the same way.

## Repo layout

```
narenana-website/
├── src/
│   └── index.js          Worker entry — routing + scheduled() cron
├── site/                 Static assets, served via env.ASSETS binding
│   ├── index.html        landing page
│   └── assets/           banner, avatar, log-viewer icon
├── wrangler.toml         Worker config — main, [assets], cron, KV, vars
├── package.json
├── .dev.vars.example
└── README.md
```

## Local dev

```bash
npm install
npm run dev          # wrangler dev — runs the Worker + serves site/ assets on :8787
```

`.dev.vars` (copy from `.dev.vars.example`, gitignored) overrides values in
`wrangler.toml [vars]` for local runs — most usefully `LOG_VIEWER_ORIGIN`
to point at the tool's local Vite dev server (port 5173) instead of the
production Pages URL.

For pure static preview without the Worker:

```bash
npm run dev:static   # npx serve site -l 3000
```

## YouTube feed cache

`/videos.json` returns the latest videos from `YOUTUBE_CHANNEL_ID`
(`wrangler.toml [vars]`), parsed from YouTube's Atom feed — no API key, no
quota. The cron trigger refreshes the cache hourly; serving is from KV, so
reads are cheap.

To trigger the cron handler locally:

```bash
npm run dev -- --test-scheduled
# in another shell:
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
curl http://localhost:8787/videos.json
```

To mirror a different channel, edit `YOUTUBE_CHANNEL_ID` in `wrangler.toml`
and push. The channel ID for an `@handle` URL can be found by viewing the
channel page source and searching for `"externalId":"UC...`.

## Deploy

Both projects auto-deploy on `git push` to `master`. No CLI commands needed
for day-to-day work.

### One-time setup (already done)

1. **KV namespace** created with:
   ```bash
   npx wrangler kv namespace create VIDEOS_KV
   ```
   The returned id is in `wrangler.toml [[kv_namespaces]]`.

2. **Worker (this repo)** connected via Workers & Pages → Create →
   Pages → Connect to Git in the Cloudflare dashboard. Cloudflare's unified
   Workers + Pages flow detects `main` and `[assets]` in `wrangler.toml`
   and treats the repo as a Worker (not a Pages project) automatically.
   - Production branch: `master`
   - Custom domains: `narenana.com`, `www.narenana.com`
   - All bindings (KV, vars, cron) come from `wrangler.toml`.

3. **Tool (`edgetx-log-parser`)** is a separate Pages project connected to
   `narenana/edgetx-log-parser`:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Lives at `edgetx-log-parser.pages.dev`.

### Day-to-day

- Edit landing page or worker code → push `narenana-website` → Cloudflare
  rebuilds and redeploys the Worker (~30s).
- Edit log viewer → push `edgetx-log-parser` → Pages rebuilds and redeploys
  (~1 min for a Vite build).

### Manual deploy from local (rare)

```bash
npx wrangler deploy
```

Reads `wrangler.toml`, bundles `src/index.js` + `site/`, ships to the
`narenana-website` Worker.

## Adding another tool

1. Pick a path prefix (e.g. `/foo`).
2. Add `FOO_ORIGIN` in `wrangler.toml [vars]` pointing at the tool's
   deployment URL — or set it on the Worker dashboard for per-environment
   overrides.
3. Add a routing branch in `src/index.js`:

   ```js
   if (url.pathname === '/foo' || url.pathname.startsWith('/foo/')) {
     return forward(request, env.FOO_ORIGIN, '/foo')
   }
   ```

4. Push.

Each tool stays in its own repo with its own build pipeline and its own
Pages or Workers project. The router stays thin — it just strips prefixes
and forwards.
