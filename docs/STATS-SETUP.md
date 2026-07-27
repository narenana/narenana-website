# /stats — one-time credential setup

The portfolio dashboard at **https://www.narenana.com/stats** aggregates five
sources into an hourly KV snapshot (`src/stats.js`). Two sources work with no
setup (LAST CALL via the D1 binding, Nanawing via service bindings). The other
three light up when their credentials exist — the page shows a status chip per
source, so partial setup is always visible, never broken.

## Secrets & vars overview

| Name | Kind | Purpose |
|---|---|---|
| `STATS_KEY` | secret | Page access key — visit `/stats?key=…` once, a session cookie takes over |
| `GOOGLE_SA_KEY` | secret | Full service-account JSON — unlocks GA4 + Search Console |
| `CF_API_TOKEN` | secret | Cloudflare API token — unlocks edge/RUM analytics |
| `GA4_PROPERTY_ID` | var (set) | `534605239` — the narenana.com GA4 property |
| `CF_ACCOUNT_TAG` | var (set) | Cloudflare account id |

Generate `STATS_KEY` with real entropy — there is no lockout on guesses:

```bash
openssl rand -base64 24
```

A valid `?key=` visit never renders: the Worker 302s to the bare `/stats` URL
and sets a signed **session token** cookie (30 days; the key itself is never
stored client-side). Sessions are stateless HMAC tokens derived from
`STATS_KEY` — rotating the secret instantly revokes every session.

Set a secret with:

```bash
npx wrangler secret put NAME
```

(If wrangler refuses with "latest version isn't currently deployed", set it in
the Cloudflare dashboard → Workers → narenana-website → Settings → Variables,
or push any commit to master first so the latest version deploys.)

## 1. Google service account (GA4 + Search Console)

One service account serves both APIs (one token, two scopes).

1. **Create**: [console.cloud.google.com](https://console.cloud.google.com) →
   pick/create a project → IAM & Admin → Service Accounts → *Create service
   account* (name e.g. `narenana-stats`). No project roles needed.
2. **Enable APIs**: APIs & Services → Enable → **Google Analytics Data API**
   and **Google Search Console API**.
3. **Key**: open the service account → Keys → *Add key → JSON*. Download the
   file, then:

   ```bash
   npx wrangler secret put GOOGLE_SA_KEY < downloaded-key.json
   ```

4. **Grant GA4**: [analytics.google.com](https://analytics.google.com) → Admin
   → Property *narenana.com* → **Property Access Management** → add the service
   account email (`…@…iam.gserviceaccount.com`) as **Viewer**.
5. **Grant Search Console**: [search.google.com/search-console](https://search.google.com/search-console)
   → property `sc-domain:narenana.com` → Settings → **Users and permissions** →
   Add user → the same email, permission **Restricted** (read is enough).

## 2. Cloudflare API token

[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
→ *Create Token* → *Create Custom Token*:

- **Zone → Analytics → Read** (zone: narenana.com) — edge traffic
- **Account → Account Analytics → Read** — Web Analytics (RUM) per-host split

```bash
npx wrangler secret put CF_API_TOKEN
```

The Worker auto-discovers the zone id and RUM site tag on first use (cached in
KV under `stats_cf_ids`; delete that key to re-discover).

## Verifying

Open `/stats?key=…` and check the **Data sources** chips at the bottom — each
reads `ok`, `not configured: …`, or a real error. `?refresh=1` (the *refresh*
button) forces a snapshot rebuild instead of waiting for the hourly cron.

## Notes

- The page and API send `X-Robots-Tag: noindex` and are never in the sitemap.
- KV keys used (all in `VIDEOS_KV`): `stats_snapshot` (the hourly data) and
  `stats_cf_ids` (discovered zone/RUM ids). Sessions are stateless (no KV).
- Google quotas (200k tokens/day) and Cloudflare GraphQL limits (300 req/5min)
  are untouchable at one refresh per hour — do not wire the fetchers to run
  per-request.
- **Accepted risk**: `LASTCALL_DB` is a full D1 binding to the live LAST CALL
  leaderboard database — D1 bindings cannot be scoped read-only, so "read-only"
  is enforced by code review (`src/stats.js` issues only SELECTs), not by the
  platform.
- Adding a future project: if it's a new subdomain reporting to the shared GA4
  stream, it auto-appears as a card; to name it properly, add one entry to
  `PROJECTS` in `site/stats.html`.
- The live-test Worker `narenana-stats-preview` (workers.dev) duplicates this
  code with the same cron + KV — **delete it once /stats is on production**:
  `npx wrangler delete --name narenana-stats-preview`.
