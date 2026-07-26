// /stats — private portfolio dashboard: one KV-cached snapshot combining
// GA4 (traffic/events/channels per hostname), Search Console (clicks/queries),
// Cloudflare (edge requests + RUM pageviews per host), LAST CALL play data
// (direct D1 binding) and Nanawing flight data (public stats worker).
//
// Design rules:
//  - NEVER fan out to the upstream APIs per page view. The snapshot is
//    materialized by the hourly cron (and cold-populated / force-refreshed on
//    demand) into VIDEOS_KV under "stats_snapshot"; the page reads only KV.
//    Cloudflare's GraphQL budget is 300 queries/5min ACROSS the account and a
//    429 there blocks the dashboard API too — cache aggressively.
//  - Every source is independent and fail-soft: a missing credential or a
//    flaky upstream yields { error } for that section and the page renders
//    what it has. LAST CALL (D1 binding) + Nanawing (public endpoints) work
//    with zero external credentials.
//  - Access: STATS_KEY secret. First visit with ?key=… sets a cookie so the
//    bare /stats URL works afterwards. Everything is noindex.
//
// Secrets (npx wrangler secret put …): STATS_KEY, GOOGLE_SA_KEY (the full
// service-account JSON), CF_API_TOKEN. Vars: GA4_PROPERTY_ID, CF_ACCOUNT_TAG.
// See docs/STATS-SETUP.md for the one-time grant steps.

const SNAPSHOT_KEY = 'stats_snapshot'
const CF_IDS_KEY = 'stats_cf_ids'
const WINDOW_DAYS = 28
const STALE_MS = 2 * 60 * 60 * 1000 // serve-stale-and-revalidate threshold

/* ------------------------------------------------------------------ */
/* Routing + auth                                                      */
/* ------------------------------------------------------------------ */

/** True when this request may see the dashboard (key param or cookie). */
function authorized(request, url, env) {
  if (!env.STATS_KEY) return false
  const key = url.searchParams.get('key')
  if (key !== null) return key === env.STATS_KEY
  const cookies = request.headers.get('cookie') || ''
  const m = cookies.match(/(?:^|;\s*)stats_key=([^;]+)/)
  return m !== null && decodeURIComponent(m[1]) === env.STATS_KEY
}

/** Handle /stats, /stats/api/data (and bounce direct /stats.html hits). */
export async function handleStats(request, env, ctx, url) {
  if (!env.STATS_KEY) {
    return new Response('stats not configured (set the STATS_KEY secret)', { status: 503 })
  }
  if (!authorized(request, url, env)) {
    return new Response('unauthorized', { status: 401, headers: { 'x-robots-tag': 'noindex' } })
  }

  if (url.pathname === '/stats/api/data') {
    const force = url.searchParams.get('refresh') === '1'
    let json = force ? null : await env.VIDEOS_KV.get(SNAPSHOT_KEY)
    if (json) {
      // Serve last-good immediately; revalidate in the background when stale.
      try {
        const age = Date.now() - (JSON.parse(json).generatedAt || 0)
        if (age > STALE_MS) ctx.waitUntil(refreshStats(env))
      } catch {
        json = null
      }
    }
    if (!json) json = await refreshStats(env)
    return new Response(json ?? JSON.stringify({ error: 'snapshot unavailable' }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
      },
    })
  }

  // The page shell lives in site/stats.html; the Worker gates it and sets the
  // auth cookie so the bare /stats URL works on the next visit.
  const shell = await env.ASSETS.fetch(new Request(new URL('/stats.html', url).toString()))
  const headers = new Headers(shell.headers)
  headers.set('x-robots-tag', 'noindex')
  headers.set('cache-control', 'no-store')
  if (url.searchParams.get('key') !== null) {
    headers.append(
      'set-cookie',
      `stats_key=${encodeURIComponent(env.STATS_KEY)}; Max-Age=2592000; Path=/stats; Secure; HttpOnly; SameSite=Lax`,
    )
  }
  return new Response(shell.body, { status: shell.status, headers })
}

/* ------------------------------------------------------------------ */
/* Snapshot builder                                                    */
/* ------------------------------------------------------------------ */

/** Fetch every source (independently fail-soft) and persist the snapshot. */
export async function refreshStats(env) {
  const [ga, gsc, cf, lastcall, nanawing] = await Promise.all([
    section(() => fetchGa(env)),
    section(() => fetchGsc(env)),
    section(() => fetchCf(env)),
    section(() => fetchLastCall(env)),
    section(() => fetchNanawing(env)),
  ])
  const json = JSON.stringify({
    v: 1,
    generatedAt: Date.now(),
    windowDays: WINDOW_DAYS,
    ga,
    gsc,
    cf,
    lastcall,
    nanawing,
  })
  await env.VIDEOS_KV.put(SNAPSHOT_KEY, json)
  return json
}

/** Run one source fetcher; shape failures as { error } instead of throwing. */
async function section(fn) {
  try {
    return await fn()
  } catch (err) {
    return { error: String(err && err.message ? err.message : err).slice(0, 300) }
  }
}

function daysAgoIso(n) {
  const d = new Date(Date.now() - n * 86400000)
  return d.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* Google auth (service account → OAuth token; GA4 + GSC share it)     */
/* ------------------------------------------------------------------ */

const b64url = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlBytes = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Mint (or reuse) a dual-scope Google access token. Cached in KV ~55 min. */
async function googleToken(env) {
  if (!env.GOOGLE_SA_KEY) throw new Error('not configured: GOOGLE_SA_KEY secret missing')
  const cached = await env.VIDEOS_KV.get('stats_google_token', 'json')
  if (cached && cached.exp > Date.now() / 1000 + 120) return cached.token

  const sa = JSON.parse(env.GOOGLE_SA_KEY)
  // Secrets pasted through shells may carry literal \n in the PEM — normalize.
  const pem = sa.private_key.replace(/\\n/g, '\n')
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), (c) =>
    c.charCodeAt(0),
  )
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const iat = Math.floor(Date.now() / 1000) - 30 // back-date for clock skew
  const claims = {
    iss: sa.client_email,
    scope:
      'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  }
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  const jwt = `${input}.${b64urlBytes(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`google token: ${body.error_description || body.error || res.status}`)
  }
  await env.VIDEOS_KV.put(
    'stats_google_token',
    JSON.stringify({ token: body.access_token, exp: iat + 3600 }),
    { expirationTtl: 3500 },
  )
  return body.access_token
}

/* ------------------------------------------------------------------ */
/* GA4 — hostname-segmented single stream                              */
/* ------------------------------------------------------------------ */

async function runReport(env, token, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(`ga4: ${(data.error && data.error.message) || res.status}`)
  return (data.rows || []).map((r) => [
    ...r.dimensionValues.map((d) => d.value),
    ...r.metricValues.map((m) => Number(m.value)),
  ])
}

/** "20260725" → "2026-07-25" (GA4 date dimension format). */
const gaDate = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`

async function fetchGa(env) {
  if (!env.GA4_PROPERTY_ID) throw new Error('not configured: GA4_PROPERTY_ID var missing')
  const token = await googleToken(env)
  const range = [{ startDate: `${WINDOW_DAYS}daysAgo`, endDate: 'today' }]
  const [traffic, events, channels, wwwPages] = await Promise.all([
    // Daily traffic per host — the portfolio's per-project series.
    runReport(env, token, {
      dateRanges: range,
      dimensions: [{ name: 'date' }, { name: 'hostName' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: '10000',
    }),
    // Engagement events per host (game_start, flight_start, wave_reached, …).
    runReport(env, token, {
      dateRanges: range,
      dimensions: [{ name: 'eventName' }, { name: 'hostName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '1000',
    }),
    // Acquisition channels per host — which projects have a real channel.
    runReport(env, token, {
      dateRanges: range,
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'hostName' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '1000',
    }),
    // Page split for www — separates the wings catalog / log viewer / home.
    runReport(env, token, {
      dateRanges: range,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      dimensionFilter: {
        filter: { fieldName: 'hostName', stringFilter: { value: 'www.narenana.com' } },
      },
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: '200',
    }),
  ])
  return {
    traffic: traffic.map((r) => [gaDate(r[0]), r[1], r[2], r[3], r[4]]),
    events,
    channels,
    wwwPages,
  }
}

/* ------------------------------------------------------------------ */
/* Search Console — sc-domain:narenana.com                             */
/* ------------------------------------------------------------------ */

async function gscQuery(token, body) {
  const res = await fetch(
    'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Anarenana.com/searchAnalytics/query',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(`gsc: ${(data.error && data.error.message) || res.status}`)
  return (data.rows || []).map((r) => [r.keys[0], r.clicks, r.impressions, r.ctr, r.position])
}

async function fetchGsc(env) {
  const token = await googleToken(env)
  const startDate = daysAgoIso(WINDOW_DAYS)
  const endDate = daysAgoIso(0)
  const [byDate, byPage, byQuery] = await Promise.all([
    gscQuery(token, { startDate, endDate, dimensions: ['date'], dataState: 'all', rowLimit: 1000 }),
    gscQuery(token, { startDate, endDate, dimensions: ['page'], rowLimit: 50 }),
    gscQuery(token, { startDate, endDate, dimensions: ['query'], rowLimit: 50 }),
  ])
  return { byDate, byPage, byQuery }
}

/* ------------------------------------------------------------------ */
/* Cloudflare — edge zone traffic + Web Analytics RUM                  */
/* ------------------------------------------------------------------ */

async function cfApi(env, path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}` },
  })
  const data = await res.json()
  if (!data.success) throw new Error(`cf api ${path}: ${JSON.stringify(data.errors).slice(0, 200)}`)
  return data.result
}

/** Discover + cache the zoneTag / RUM siteTag once (token-scoped lookups). */
async function cfIds(env) {
  const cached = await env.VIDEOS_KV.get(CF_IDS_KEY, 'json')
  if (cached && cached.zoneTag) return cached
  const zones = await cfApi(env, '/zones?name=narenana.com')
  const zoneTag = zones[0] && zones[0].id
  if (!zoneTag) throw new Error('cf: narenana.com zone not visible to this token')
  let siteTag = null
  try {
    const sites = await cfApi(env, `/accounts/${env.CF_ACCOUNT_TAG}/rum/site_info/list`)
    const site = sites.find((s) => s.zone_tag === zoneTag || /narenana/.test(s.host || '')) || sites[0]
    siteTag = site ? site.site_tag : null
  } catch {
    // RUM listing needs an account-scope permission; zone traffic still works.
  }
  const ids = { zoneTag, siteTag }
  await env.VIDEOS_KV.put(CF_IDS_KEY, JSON.stringify(ids))
  return ids
}

async function fetchCf(env) {
  if (!env.CF_API_TOKEN) throw new Error('not configured: CF_API_TOKEN secret missing')
  const { zoneTag, siteTag } = await cfIds(env)
  const start = daysAgoIso(WINDOW_DAYS)
  const end = daysAgoIso(0)
  const query = `
    query Portfolio($zone: string!, $account: string!, $site: string!, $start: Date!, $end: Date!, $rum: Boolean!) {
      viewer {
        zones(filter: { zoneTag: $zone }) {
          httpRequests1dGroups(limit: 31, filter: { date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
            dimensions { date }
            sum { requests pageViews cachedRequests bytes }
            uniq { uniques }
          }
        }
        accounts(filter: { accountTag: $account }) @include(if: $rum) {
          rumPageloadEventsAdaptiveGroups(
            limit: 1000
            filter: { date_geq: $start, date_leq: $end, siteTag: $site }
            orderBy: [date_ASC]
          ) {
            count
            sum { visits }
            dimensions { date requestHost }
          }
        }
      }
    }`
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: {
        zone: zoneTag,
        account: env.CF_ACCOUNT_TAG || '',
        site: siteTag || '',
        start,
        end,
        rum: Boolean(siteTag && env.CF_ACCOUNT_TAG),
      },
    }),
  })
  const data = await res.json()
  // GraphQL errors arrive as HTTP 200 + errors[] — always check the array.
  if (data.errors && data.errors.length > 0) {
    throw new Error(`cf graphql: ${data.errors[0].message}`.slice(0, 200))
  }
  const zone = (((data.data || {}).viewer || {}).zones || [])[0] || {}
  const accounts = ((data.data || {}).viewer || {}).accounts || []
  const rumRows = (accounts[0] && accounts[0].rumPageloadEventsAdaptiveGroups) || []
  return {
    zone: (zone.httpRequests1dGroups || []).map((g) => [
      g.dimensions.date,
      g.sum.requests,
      g.uniq.uniques,
      g.sum.pageViews,
      g.sum.bytes,
    ]),
    rum: rumRows.map((g) => [g.dimensions.date, g.dimensions.requestHost, g.count, g.sum.visits]),
  }
}

/* ------------------------------------------------------------------ */
/* LAST CALL — direct D1 binding (same Cloudflare account)             */
/* ------------------------------------------------------------------ */

async function fetchLastCall(env) {
  if (!env.LASTCALL_DB) throw new Error('not configured: LASTCALL_DB binding missing')
  const db = env.LASTCALL_DB
  const cutoff = Date.now() - WINDOW_DAYS * 86400000 // created_at is epoch ms
  const [daily, finishes, totals, byMap] = await Promise.all([
    db
      .prepare(
        "SELECT date(created_at/1000,'unixepoch') AS d, COUNT(*) AS starts, COUNT(DISTINCT client_id) AS players " +
          'FROM starts WHERE created_at >= ?1 GROUP BY d ORDER BY d',
      )
      .bind(cutoff)
      .all(),
    db
      .prepare(
        "SELECT date(created_at/1000,'unixepoch') AS d, COUNT(*) AS runs, SUM(wave >= 20) AS wins " +
          'FROM runs WHERE created_at >= ?1 GROUP BY d ORDER BY d',
      )
      .bind(cutoff)
      .all(),
    db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM starts) AS starts, (SELECT COUNT(DISTINCT client_id) FROM starts) AS players, ' +
          '(SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM runs WHERE wave >= 20) AS wins, ' +
          '(SELECT COUNT(*) FROM scores) AS boardRows',
      )
      .all(),
    db
      .prepare(
        'SELECT s.map, COUNT(*) AS starts, COUNT(DISTINCT s.client_id) AS players, ' +
          '(SELECT COUNT(*) FROM runs r WHERE r.map = s.map) AS runs, ' +
          '(SELECT COUNT(*) FROM runs r WHERE r.map = s.map AND r.wave >= 20) AS wins ' +
          'FROM starts s GROUP BY s.map',
      )
      .all(),
  ])
  // Merge the two daily series on date: [date, starts, players, runs, wins].
  const byDay = new Map()
  for (const r of daily.results) byDay.set(r.d, [r.d, r.starts, r.players, 0, 0])
  for (const r of finishes.results) {
    const row = byDay.get(r.d) || [r.d, 0, 0, 0, 0]
    row[3] = r.runs
    row[4] = r.wins || 0
    byDay.set(r.d, row)
  }
  return {
    daily: [...byDay.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    totals: totals.results[0],
    byMap: byMap.results,
  }
}

/* ------------------------------------------------------------------ */
/* Nanawing — public stats worker endpoints                            */
/* ------------------------------------------------------------------ */

/** Fetch a sibling Worker: service binding in prod (worker→worker fetch()es to
 * *.workers.dev are BLOCKED on the same account — error 1042), public URL in
 * local dev where the binding stub can't reach a non-running service. */
async function siblingFetch(binding, url) {
  if (binding) {
    try {
      const res = await binding.fetch(url)
      if (res.ok) return res
    } catch {
      // fall through to the public fetch
    }
  }
  return fetch(url)
}

async function fetchNanawing(env) {
  const base = 'https://fpvsim-stats.narenana.workers.dev'
  const [totalsRes, seriesRes, boardRes] = await Promise.all([
    siblingFetch(env.FPVSIM_STATS, `${base}/stats`),
    siblingFetch(env.FPVSIM_STATS, `${base}/series?days=${WINDOW_DAYS}`),
    siblingFetch(env.FPVSIM_BOARD, 'https://fpvsim-leaderboard.narenana.workers.dev/board?limit=1'),
  ])
  if (!totalsRes.ok) throw new Error(`nanawing stats: ${totalsRes.status}`)
  const totals = await totalsRes.json()
  const series = seriesRes.ok ? (await seriesRes.json()).series || [] : []
  let racers = null
  try {
    racers = boardRes.ok ? (await boardRes.json()).total : null
  } catch {
    racers = null
  }
  return {
    totals,
    series: series.map((r) => [r.day, r.flights, r.sessions, r.pilots]),
    racers,
  }
}
