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

/** Constant-time-ish string compare (Workers' timingSafeEqual when present). */
function keyEquals(candidate, secret) {
  if (typeof candidate !== 'string' || candidate.length !== secret.length) return false
  const enc = new TextEncoder()
  const a = enc.encode(candidate)
  const b = enc.encode(secret)
  if (a.byteLength !== b.byteLength) return false
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(a, b)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

const SESSION_TTL = 30 * 24 * 3600 // seconds

/**
 * Sessions are STATELESS HMAC tokens (`<exp>.<mac>`), signed with a key
 * derived from STATS_KEY — the cookie never carries the master key, there is
 * no KV read per request and no KV-propagation race on first login, and
 * rotating STATS_KEY instantly revokes every session.
 */
let sessionKeyPromise = null
function sessionKey(env) {
  if (!sessionKeyPromise) {
    sessionKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`stats-session:${env.STATS_KEY}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }
  return sessionKeyPromise
}

async function mintSessionCookie(env) {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL)
  const mac = await crypto.subtle.sign('HMAC', await sessionKey(env), new TextEncoder().encode(exp))
  return `stats_session=${exp}.${b64urlBytes(mac)}; Max-Age=${SESSION_TTL}; Path=/stats; Secure; HttpOnly; SameSite=Lax`
}

/** Auth: ?key= presents the master key; the cookie carries a signed session.
 * Returns 'key' | 'session' | false. */
async function authorized(request, url, env) {
  if (!env.STATS_KEY) return false
  const key = url.searchParams.get('key')
  if (key !== null) return keyEquals(key, env.STATS_KEY) ? 'key' : false
  try {
    const cookies = request.headers.get('cookie') || ''
    const m = cookies.match(/(?:^|;\s*)stats_session=(\d{1,12})\.([A-Za-z0-9_-]{20,64})/)
    if (m === null) return false
    if (Number(m[1]) < Date.now() / 1000) return false // expired
    const mac = Uint8Array.from(atob(m[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const okSig = await crypto.subtle.verify(
      'HMAC',
      await sessionKey(env),
      mac,
      new TextEncoder().encode(m[1]),
    )
    return okSig ? 'session' : false
  } catch {
    return false
  }
}

/** Handle /stats, /stats/api/data (and bounce direct /stats.html hits). */
export async function handleStats(request, env, ctx, url) {
  if (!env.STATS_KEY) {
    return new Response('stats not configured (set the STATS_KEY secret)', { status: 503 })
  }
  const auth = await authorized(request, url, env)
  if (auth === false) {
    return new Response('unauthorized', { status: 401, headers: { 'x-robots-tag': 'noindex' } })
  }

  if (url.pathname === '/stats/api/data') {
    // Force-refresh only on POST: SameSite=Lax cookies don't ride cross-site
    // POSTs, so a hostile page can't burn upstream quota via top-level GETs —
    // and a 60 s floor stops even same-site refresh hammering.
    let force = false
    if (url.searchParams.get('refresh') === '1' && request.method === 'POST') force = true
    let json = await env.VIDEOS_KV.get(SNAPSHOT_KEY)
    if (json) {
      try {
        const age = Date.now() - (JSON.parse(json).generatedAt || 0)
        if (force && age > 60_000) json = null
        // Serve last-good immediately; revalidate in the background when stale.
        else if (age > STALE_MS) ctx.waitUntil(refreshStats(env))
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

  // A valid ?key= never renders: mint a session and 302 to the bare URL so the
  // master key doesn't persist in browser history / the address bar.
  if (auth === 'key') {
    return new Response(null, {
      status: 302,
      headers: {
        location: new URL('/stats', url).toString(),
        'set-cookie': await mintSessionCookie(env),
        'x-robots-tag': 'noindex',
      },
    })
  }

  // The page shell lives in site/stats.html; the Worker gates it.
  const shell = await env.ASSETS.fetch(new Request(new URL('/stats.html', url).toString()))
  const headers = new Headers(shell.headers)
  headers.set('x-robots-tag', 'noindex')
  headers.set('cache-control', 'no-store')
  headers.set('referrer-policy', 'no-referrer')
  return new Response(shell.body, { status: shell.status, headers })
}

/* ------------------------------------------------------------------ */
/* Snapshot builder                                                    */
/* ------------------------------------------------------------------ */

/** Fetch every source (independently fail-soft) and persist the snapshot. */
export async function refreshStats(env) {
  const [ga, gsc, cf, lastcall, nanawing, youtube] = await Promise.all([
    section(() => fetchGa(env)),
    section(() => fetchGsc(env)),
    section(() => fetchCf(env)),
    section(() => fetchLastCall(env)),
    section(() => fetchNanawing(env)),
    section(() => fetchYouTube(env)),
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
    youtube,
  })
  try {
    await env.VIDEOS_KV.put(SNAPSHOT_KEY, json)
  } catch {
    // Persist failure must not kill the response — serve the fresh build.
  }
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

/** Mint (or reuse) a dual-scope Google access token. Single-flight + cached in
 * module scope: fetchGa and fetchGsc call this concurrently every refresh, and
 * two parallel mints would double the subrequests and race a shared KV key —
 * per-isolate caching is enough at one refresh per hour (2 subrequests). */
let googleTokenCache = null // { promise, exp }
function googleToken(env) {
  if (!env.GOOGLE_SA_KEY) return Promise.reject(new Error('not configured: GOOGLE_SA_KEY secret missing'))
  if (googleTokenCache && googleTokenCache.exp > Date.now() / 1000 + 120) {
    return googleTokenCache.promise
  }
  const exp = Math.floor(Date.now() / 1000) + 3600 - 30
  const promise = mintGoogleToken(env).catch((err) => {
    googleTokenCache = null // never cache a failure
    throw err
  })
  googleTokenCache = { promise, exp }
  return promise
}

async function mintGoogleToken(env) {
  let sa
  try {
    sa = JSON.parse(env.GOOGLE_SA_KEY)
  } catch {
    // Fixed text only — V8's parse errors embed a snippet of the raw secret.
    throw new Error('GOOGLE_SA_KEY is not valid JSON')
  }
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
  // N-1 daysAgo..today = a true N-day inclusive window (matches dailySeries).
  const range = [{ startDate: `${WINDOW_DAYS - 1}daysAgo`, endDate: 'today' }]
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
  // Drop dev/preview noise so real projects aren't buried under a wall of
  // ephemeral *.pages.dev branch previews and localhost. hostName is the last
  // dimension in traffic/events/channels rows.
  const real = (h) =>
    typeof h === 'string' &&
    !/(^|\.)localhost$|^127\.0\.0\.1$|\.pages\.dev$|\.workers\.dev$/i.test(h)
  return {
    traffic: traffic.filter((r) => real(r[1])).map((r) => [gaDate(r[0]), r[1], r[2], r[3], r[4]]),
    events: events.filter((r) => real(r[1])),
    channels: channels.filter((r) => real(r[1])),
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
  const startDate = daysAgoIso(WINDOW_DAYS - 1)
  const endDate = daysAgoIso(0)
  // dataState 'all' everywhere so the tables cover the same fresh ~2 days the
  // clicks sparkline does (finalized-only would silently trail it).
  const [byDate, byPage, byQuery] = await Promise.all([
    gscQuery(token, { startDate, endDate, dimensions: ['date'], dataState: 'all', rowLimit: 1000 }),
    gscQuery(token, { startDate, endDate, dimensions: ['page'], dataState: 'all', rowLimit: 50 }),
    gscQuery(token, { startDate, endDate, dimensions: ['query'], dataState: 'all', rowLimit: 50 }),
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

/** Discover + cache the narenana.com zoneTag once (Zone Analytics token scope).
 * RUM needs NO siteTag — the account-wide dataset groups by requestHost with
 * only Account Analytics:Read (the Web Analytics /rum/site_info REST call, which
 * needs a separate Web-Analytics permission, is deliberately not used). */
async function cfZoneTag(env) {
  const cached = await env.VIDEOS_KV.get(CF_IDS_KEY, 'json')
  if (cached && cached.zoneTag) return cached.zoneTag
  const zones = await cfApi(env, '/zones?name=narenana.com')
  const zoneTag = zones[0] && zones[0].id
  if (!zoneTag) throw new Error('cf: narenana.com zone not visible to this token')
  await env.VIDEOS_KV.put(CF_IDS_KEY, JSON.stringify({ zoneTag }))
  return zoneTag
}

async function fetchCf(env) {
  if (!env.CF_API_TOKEN) throw new Error('not configured: CF_API_TOKEN secret missing')
  const zoneTag = await cfZoneTag(env)
  const start = daysAgoIso(WINDOW_DAYS - 1)
  const end = daysAgoIso(0)
  // Cloudflare's GraphQL API rejects @include/@skip directives, so the RUM block
  // (and its $account variable) is spliced in as a string only when the account
  // tag exists — no directive, no unused-variable validation error. RUM is
  // account-wide (no siteTag filter) grouped by requestHost = the per-project
  // pageview split, adblock-proof.
  const hasRum = Boolean(env.CF_ACCOUNT_TAG)
  const rumBlock = hasRum
    ? `
        accounts(filter: { accountTag: $account }) {
          rumPageloadEventsAdaptiveGroups(
            limit: 1000
            filter: { date_geq: $start, date_leq: $end }
            orderBy: [date_ASC]
          ) {
            count
            sum { visits }
            dimensions { date requestHost }
          }
        }`
    : ''
  const query = `
    query Portfolio($zone: string!, $start: Date!, $end: Date!${hasRum ? ', $account: string!' : ''}) {
      viewer {
        zones(filter: { zoneTag: $zone }) {
          httpRequests1dGroups(limit: 31, filter: { date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
            dimensions { date }
            sum { requests pageViews cachedRequests bytes }
            uniq { uniques }
          }
        }${rumBlock}
      }
    }`
  const variables = hasRum
    ? { zone: zoneTag, start, end, account: env.CF_ACCOUNT_TAG }
    : { zone: zoneTag, start, end }
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
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

/* ------------------------------------------------------------------ */
/* YouTube — recent uploads (free, from the KV feed) + channel totals  */
/* ------------------------------------------------------------------ */

async function fetchYouTube(env) {
  // Recent uploads come FREE from the same KV `feed` the Worker refreshes
  // hourly (parseFeed in index.js): {id,title,published,views,likes,url,...}.
  let videos = []
  try {
    const raw = await env.VIDEOS_KV.get('feed')
    if (raw) videos = JSON.parse(raw).videos || []
  } catch {
    videos = []
  }
  const cutoff = Date.now() - WINDOW_DAYS * 86400000
  const recent = {
    inFeed: videos.length,
    views: videos.reduce((a, v) => a + (v.views || 0), 0),
    likes: videos.reduce((a, v) => a + (v.likes || 0), 0),
    uploads28d: videos.filter((v) => Date.parse(v.published) > cutoff).length,
    // Best recent uploads by views (title, views, likes, url).
    top: [...videos]
      .sort((a, b) => (b.views || 0) - (a.views || 0))
      .slice(0, 10)
      .map((v) => [v.title, v.views || 0, v.likes || 0, v.url]),
  }

  // Channel-level totals (subscribers, lifetime views, video count) are PUBLIC
  // data the YouTube Data API v3 serves with just an API key — no OAuth. Only
  // fetched when YT_API_KEY is set; otherwise the recent-upload metrics stand
  // alone and the panel prompts to add the key.
  let channel = null
  if (env.YT_API_KEY) {
    const id = env.YOUTUBE_CHANNEL_ID
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${id}&key=${env.YT_API_KEY}`,
    )
    const data = await res.json()
    if (!res.ok) throw new Error(`youtube: ${(data.error && data.error.message) || res.status}`)
    const c = data.items && data.items[0]
    if (c) {
      channel = {
        title: c.snippet.title,
        subscribers: Number(c.statistics.subscriberCount),
        totalViews: Number(c.statistics.viewCount),
        videoCount: Number(c.statistics.videoCount),
      }
    }
  }
  return { recent, channel }
}
