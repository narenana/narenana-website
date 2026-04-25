# Customer Website

The public face of the project — landing page + a Cloudflare Worker that mounts independent tool deployments under path prefixes.

```
                     ┌──────────────────────────────────────┐
                     │  mydomain.com/*                      │
                     │  (Cloudflare Worker — router)        │
                     └──────────────┬───────────────────────┘
                                    │
                ┌───────────────────┼────────────────────┐
                │                                        │
                ▼                                        ▼
        /log-viewer/*                                  /*
   ┌──────────────────────┐                ┌──────────────────────┐
   │ edgetx-log-parser    │                │ this site/           │
   │ Pages deployment     │                │ Pages deployment     │
   │ (separate repo)      │                │ (landing page)       │
   └──────────────────────┘                └──────────────────────┘
```

The Worker strips `/log-viewer/` from incoming URLs and forwards to the log-viewer Pages deployment. All other requests pass through to this site's Pages deployment. New tools mount under their own prefix the same way.

## Repo layout

```
website/
├── site/                  ← customer-facing landing page (deployed to Pages)
│   └── index.html
├── worker/                ← Cloudflare Worker that does the routing
│   └── src/
│       └── index.js
├── wrangler.toml          ← Worker config — domain bindings, env vars
├── package.json           ← devDeps for wrangler dev/deploy
└── .gitignore
```

## Local dev

```bash
npm install
npm run dev:worker        # runs the Worker locally on :8787
npm run dev:site          # serves site/ statically on :3000
```

Set `LOG_VIEWER_ORIGIN` and `CUSTOMER_SITE_ORIGIN` in `.dev.vars` (gitignored) to point at your local builds, e.g.:

```
LOG_VIEWER_ORIGIN=http://localhost:5173
CUSTOMER_SITE_ORIGIN=http://localhost:3000
```

## Deploy

```bash
# Site (Pages)
npx wrangler pages deploy site --project-name=customer-site

# Worker
npx wrangler deploy
```

Production env vars (set on the Worker dashboard or via `wrangler secret put`):
- `LOG_VIEWER_ORIGIN` — the Pages deployment URL of the log viewer (e.g. `https://edgetx-log-parser.pages.dev`)
- `CUSTOMER_SITE_ORIGIN` — the Pages deployment URL of this site

## Adding another tool

1. Pick a path prefix (e.g. `/foo`).
2. Add an env var `FOO_ORIGIN` in `wrangler.toml` and on the dashboard.
3. Add a routing branch in `worker/src/index.js`:

   ```js
   if (url.pathname === '/foo' || url.pathname.startsWith('/foo/')) {
     return forward(request, env.FOO_ORIGIN, '/foo')
   }
   ```

4. Deploy the Worker.

That's it — each tool stays in its own repo with its own build pipeline and deploys to its own Pages project.
