# narenana.com

The home page for narenana — a Cloudflare Pages site that serves the landing
page, routes `/log-viewer/*` to the EdgeTX Log Viewer (a separate Pages
project), and exposes a YouTube feed cache at `/videos.json` refreshed by an
hourly cron.

```
                          narenana.com
                                │
              ┌─────────────────┴──────────────────┐
              │  Pages project: narenana           │
              │  (this repo)                       │
              │                                    │
              │   ┌──────────────────────────┐     │
              │   │ site/_worker.js          │     │
              │   │   (Pages Function)       │     │
              │   └──┬─────────┬─────────┬───┘     │
              │      │         │         │         │
              └──────┼─────────┼─────────┼─────────┘
                     │         │         │
        /log-viewer/*│  /videos.json     │ /*
        forward      │  KV-backed        │ env.ASSETS.fetch
                     │  cron'd JSON      │ (static files)
                     ▼         ▼         ▼
          edgetx-log-parser  KV: VIDEOS_KV   site/index.html
          (separate Pages    (refreshed       + assets/
           project)           hourly)
```

A single Pages Function (`site/_worker.js`) intercepts every request:
- `/log-viewer` and `/log-viewer/*` are stripped of the prefix and forwarded
  to the tool's own Pages deployment.
- `/videos.json` is served from KV — populated by the hourly cron that fetches
  YouTube's public RSS feed.
- Everything else falls through to `env.ASSETS.fetch(request)` — the static
  files in `site/`.

Each new tool mounts under its own path prefix the same way.

## Repo layout

```
narenana-website/
├── site/                  ← Pages build output dir
│   ├── index.html         landing page
│   ├── _worker.js         Pages Function: routing + cron + /videos.json
│   └── assets/            banner, avatar, log-viewer icon
├── wrangler.toml          Pages config — cron, KV, vars, build output dir
├── package.json
├── .dev.vars.example
└── README.md
```

## Local dev

```bash
npm install
npm run dev                # wrangler pages dev — serves site/ + runs _worker.js
```

For pure static preview without the Function:

```bash
npm run dev:static         # npx serve site -l 3000
```

`.dev.vars` (copy from `.dev.vars.example`, gitignored) overrides the values
in `wrangler.toml [vars]` for local — most usefully `LOG_VIEWER_ORIGIN` to
point at the tool's local Vite dev server.

## YouTube feed cache

`/videos.json` returns the latest videos from `YOUTUBE_CHANNEL_ID` (set in
`wrangler.toml [vars]`), parsed from YouTube's public RSS feed — no API key,
no quota. The cron trigger refreshes the cache hourly; serving is from KV.

To trigger the cron locally:

```bash
npm run dev -- --test-scheduled
# in another shell:
curl "http://localhost:8788/__scheduled?cron=0+*+*+*+*"
curl http://localhost:8788/videos.json
```

To mirror a different channel, edit `YOUTUBE_CHANNEL_ID` in `wrangler.toml`
and push. The channel ID for a `@handle` URL is in the channel page source:
search for `"externalId":"UC...`.

## Deploy

Both Pages projects auto-deploy on `git push` once connected — no CLI commands
needed for day-to-day. Cloudflare Pages handles the build and ships.

### One-time setup

1. **Create the KV namespace** locally:
   ```bash
   npx wrangler kv namespace create VIDEOS_KV
   ```
   Paste the returned `id` into `wrangler.toml` under `[[kv_namespaces]]` and
   commit.

2. **Connect this repo** to the existing `narenana` Pages project in the CF
   dashboard (Settings → Build & deployments → Source). Set:
   - Production branch: `main`
   - Build output directory: `site`
   - Build command: *(leave empty — no build step)*

3. **Connect the tool repo** (`narenana/edgetx-log-parser`) to a new
   `edgetx-log-parser` Pages project:
   - Build command: `npm run build`
   - Build output directory: `dist`

4. **Push both repos.** Pages builds and assigns `.pages.dev` URLs.

5. **Verify routing.** The `narenana.com` custom domain stays on this Pages
   project — no migration needed. After the first deploy, hit
   `https://narenana.com/log-viewer/` to confirm the Function forwards to the
   tool.

The `LOG_VIEWER_ORIGIN` in `wrangler.toml` defaults to
`https://edgetx-log-parser.pages.dev`. If your tool's Pages project ends up at
a different URL (e.g. you renamed the project), override it in the CF
dashboard's environment variables for this Pages project.

### Day-to-day

- Edit landing page → push `narenana-website` → Pages rebuilds and redeploys.
- Edit log viewer → push `edgetx-log-parser` → Pages rebuilds and redeploys.
- Edit routing or cron logic → push `narenana-website` (touches `_worker.js`
  or `wrangler.toml`) → Pages redeploys, including the Function.

### Manual deploy (rare — preview a build before pushing)

```bash
npx wrangler pages deploy
```

Reads `wrangler.toml` and ships the current `site/` directory to the
`narenana` project as a preview deployment.

## Adding another tool

1. Pick a path prefix (e.g. `/foo`).
2. Add an env var `FOO_ORIGIN` in `wrangler.toml [vars]` pointing at the
   tool's Pages deployment URL (or set it on the dashboard).
3. Add a routing branch in `site/_worker.js`:

   ```js
   if (url.pathname === '/foo' || url.pathname.startsWith('/foo/')) {
     return forward(request, env.FOO_ORIGIN, '/foo')
   }
   ```

4. Push.

Each tool stays in its own repo with its own build pipeline and deploys to
its own Pages project.
