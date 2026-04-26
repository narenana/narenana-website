# `latest.narenana.com` — staging router

A tiny Cloudflare Worker bound to the `latest.narenana.com` subdomain. It
routes `/log-viewer/*` to a configurable **viewer** branch preview and
everything else to a configurable **website** branch preview. Either
upstream defaults to its production host, so out of the box
`latest.narenana.com` is identical to `narenana.com`.

The point: pre-merge testing of any branch in either repo, behind a real
domain (so OAuth, OG sharing, PWA scope, etc. behave as they will in prod).

```
                latest.narenana.com / *
                          │
                          ▼
        ┌────────────────────────────────────┐
        │  narenana-latest Worker            │
        │   (this directory)                 │
        └────┬───────────────────────────┬───┘
             │                           │
   /log-viewer/*                         │ everything else
   forward (strip)                       │ forward (pass through)
             │                           │
             ▼                           ▼
     $VIEWER_HOST                  $WEBSITE_HOST
   (e.g. feat-foo.edgetx-     (e.g. feat-foo.narenana-
    log-parser.pages.dev)      website.narenana.workers.dev)
```

## One-time setup (already done if you're reading this)

```bash
cd latest-router
npx wrangler deploy        # creates the Worker, binds it to latest.narenana.com
```

Cloudflare auto-creates the DNS record for `latest.narenana.com` because the
zone (`narenana.com`) is on the same account.

## Day-to-day

### Point `latest` at a viewer branch

```bash
cd latest-router
./scripts/use-branch.sh viewer feat/mweb-ui-polish
```

That converts the branch name to its Cloudflare preview slug
(`feat-mweb-ui-polish.edgetx-log-parser.pages.dev`) and pushes it as a
secret. Edge propagation is a few seconds — no redeploy needed.

### Point `latest` at a website branch

```bash
./scripts/use-branch.sh website feat/some-website-change
```

### Reset to production

```bash
./scripts/use-branch.sh reset
```

Deletes the secret overrides; the Worker falls back to the `[vars]`
defaults in `wrangler.toml` (which point at the production hosts).

### See what's pointed where

```bash
./scripts/status.sh
```

### Test both viewer and website branches together

Run `use-branch.sh viewer <vbranch>` and `use-branch.sh website <wbranch>`
back-to-back. They're independent.

## When does a Cloudflare branch preview NOT exist?

- Pages and Workers Builds only build previews after a successful build.
- If a branch hasn't been pushed to the matching repo yet, its preview
  URL doesn't exist. `latest` will return a 502 ("missing host" if your
  override targets a non-resolving host, or whatever the upstream returns).
- First push to a new branch typically takes ~90s for Pages and ~30s
  for the Worker to build. Wait until you see the deployment succeed in
  the Cloudflare dashboard before pointing `latest` at it.

## Why a separate Worker (not just an env var on the production one)?

Because the production Worker needs different behaviour: it's bound to
`narenana.com` + `www.narenana.com`, has the YouTube cron, the KV
binding, and routes `/log-viewer/*` to a fixed `LOG_VIEWER_ORIGIN`. The
staging router has none of that — it's just a path-based proxy. Splitting
keeps both small.

## Files

```
latest-router/
├── src/index.js              ← the router (≈90 lines)
├── wrangler.toml             ← Worker config + route + default vars
├── scripts/
│   ├── use-branch.sh         ← flip viewer or website to a branch
│   └── status.sh             ← show current overrides + live response
├── package.json              ← devDep on wrangler
└── README.md                 ← this file
```
