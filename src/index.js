// Cloudflare Worker (with static assets) — single-handler routing + cron.
//
// fetch() routes:
//   http:// or apex             → 301 redirect → https://www.narenana.com (canonical)
//   /videos.json                → JSON of latest videos (KV-backed cache)
//   /log-viewer, /log-viewer/*  → strip prefix → LOG_VIEWER_ORIGIN
//   everything else             → env.ASSETS.fetch(request) → site/ files
//
// scheduled() (hourly cron): fetch RSS for YOUTUBE_CHANNEL_ID, parse, write to
// KV under key "feed". Page reloads naturally pick up the new payload. Also
// runs the Wings pipeline (availability refresh + discovery), gated internally.

import { handleCatalog, catalogScheduled, publicCacheKey, forMethod } from '../catalog/lib/worker.mjs'
import { consumeManufacturerHarvestQueue } from '../catalog/lib/mfr-jobs.mjs'
import { homeCatalogQueries } from '../catalog/lib/home-queries.mjs'
import { ASSET_VERSIONS } from './asset-versions.mjs'
import { handleStats, refreshStats } from './stats.js'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // Canonicalize scheme + host: force HTTPS and redirect the apex → www.
    // Runs first so every path (incl. /log-viewer and /videos.json) resolves to
    // one canonical https://www URL — search-engine and social-card crawlers see
    // a single URL, and cookies / SW scope stay stable. Localhost is exempt so
    // `wrangler dev` (served over http://127.0.0.1) isn't bounced to https.
    const isLocal =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.localhost') ||
      // Private-range IPs = wrangler dev exposed on the LAN (e.g. testing from
      // another device). Never a canonical production host, so don't force
      // https onto them — there's no cert there to serve it.
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
    const isApex = url.hostname === 'narenana.com'
    if (!isLocal && (url.protocol === 'http:' || isApex)) {
      url.protocol = 'https:'
      if (isApex) url.hostname = 'www.narenana.com'
      return Response.redirect(url.toString(), 301)
    }
    if (url.pathname === '/index.html') {
      // Relative Location: behind latest-router this Worker sees the workers.dev
      // host, and an absolute redirect would move staging testers onto it.
      return new Response(null, { status: 301, headers: { Location: '/' + url.search } })
    }

    // /log-viewer/* is a separate proxied app — leave its responses untouched
    // (the delicate redirect + X-Robots-Tag handling lives in forward()).
    // Cloudflare-dashboard edge HSTS covers those hosts belt-and-suspenders.
    // No trailing slash: the app's relative asset URLs would resolve against
    // the site root (/assets/...) and the viewer would load blank.
    if (url.pathname === '/log-viewer') {
      return new Response(null, { status: 301, headers: { Location: '/log-viewer/' + url.search } })
    }
    if (url.pathname.startsWith('/log-viewer/')) {
      // latest.narenana.com mirrors the LATEST log-viewer preview build (the
      // `latest` Pages branch alias); www / apex stay on the production
      // origin. Falls back to production if the staging var is unset.
      const origin =
        url.hostname === 'latest.narenana.com' && env.LOG_VIEWER_ORIGIN_LATEST
          ? env.LOG_VIEWER_ORIGIN_LATEST
          : env.LOG_VIEWER_ORIGIN
      const response = await forward(request, origin, '/log-viewer')
      return isStagingHost(url.hostname) ? harden(response, url, isLocal) : response
    }

    if (url.pathname === '/videos.json') {
      return harden(await videosResponse(env), url, isLocal)
    }

    // Private portfolio dashboard (src/stats.js). Sets its own security headers
    // (noindex/no-store/referrer-policy + the auth cookie), so — like
    // /log-viewer — it's returned unwrapped rather than through harden(), whose
    // Headers copy would collapse the Set-Cookie. Matched on the DECODED path so
    // %-encoded variants can't slip past the gate to ASSETS.
    {
      let statsPath = null
      try {
        statsPath = decodeURIComponent(url.pathname)
      } catch {
        statsPath = null
      }
      if (statsPath === '/stats' || statsPath === '/stats/' || (statsPath !== null && statsPath.startsWith('/stats/api/'))) {
        return handleStats(request, env, ctx, url)
      }
      if (statsPath === '/stats.html') {
        return Response.redirect(new URL('/stats', url).toString(), 302)
      }
    }

    // Catalog platform — public category pages (D1-backed), /admin, /api/*,
    // /img/* and /catalog.css. Returns null for paths it doesn't own.
    // FAIL OPEN: a D1 outage (or missing tables) must degrade to the catalog
    // paths 404-ing via assets — never take the homepage down with it.
    {
      let r = null
      try {
        r = await handleCatalog(request, url, env, ctx)
      } catch (e) {
        console.error('catalog unavailable, falling through to assets:', e)
      }
      if (r) return harden(r, url, isLocal)
    }

    // The home page's "Latest from YouTube" grid hydrates client-side, so
    // crawlers / AI answer engines would otherwise see none of it. Inject a
    // <noscript> fallback list from the KV feed the Worker already holds.
    const response =
      url.pathname === '/'
        ? await cachedHome(request, env, ctx, isLocal)
        : await staticAsset(request, env)

    return harden(response, url, isLocal, { staticFile: url.pathname !== '/' })
  },

  async scheduled(event, env, ctx) {
    // Dispatch on the cron expression. Hourly: YouTube RSS refresh (here) +
    // IndexNow push. */15: catalog slice. Weekly: manufacturer queue fan-out.
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(refreshFeed(env))
      ctx.waitUntil(refreshStats(env).catch(() => null)) // fail-soft: keep last-good snapshot
    }
    catalogScheduled(event, env, ctx)
  },

  async queue(batch, env) {
    await consumeManufacturerHarvestQueue(batch, env)
  },
}

async function videosResponse(env) {
  let json = await env.VIDEOS_KV.get('feed')
  if (!json) {
    // Cold start (first deploy, before cron has run): populate inline so the
    // first user doesn't get an empty grid.
    json = await refreshFeed(env)
  }
  return new Response(json ?? JSON.stringify({ videos: [] }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      // It's a data endpoint, not a page — keep it out of the search index.
      'x-robots-tag': 'noindex',
    },
  })
}

// Add security + caching headers to responses this Worker serves directly.
// HSTS goes on HTTPS responses (browsers ignore it over http and we skip
// localhost); static art under /assets/ gets a real cache lifetime since the
// Workers-Assets default is `max-age=0, must-revalidate` — every repeat visit
// would otherwise revalidate.
// Non-canonical hosts must never be indexed. latest-router forwards
// latest.narenana.com to this Worker's *.workers.dev host, so that is the host
// seen here in production; the workers.dev mirror itself is a duplicate too.
const isStagingHost = (hostname) => hostname === 'latest.narenana.com' || hostname.endsWith('.workers.dev')

function harden(response, url, isLocal, { staticFile = false } = {}) {
  const headers = new Headers(response.headers)
  // Static files support byte ranges (staticAsset); say so, as Pages does.
  if (staticFile && response.status === 200 && !headers.has('accept-ranges')) headers.set('Accept-Ranges', 'bytes')
  if (isStagingHost(url.hostname) || url.pathname.startsWith('/direction-b')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  if (!isLocal) {
    // 2-year max-age + `preload` makes the domain eligible for the HSTS preload
    // list (still has to be submitted once at hstspreload.org — a one-way door:
    // every subdomain must then stay HTTPS-only). Everything here already is.
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  // Asset caching. Only successful responses — never persist an error.
  // - ?v=<hash> matching the file's CURRENT content hash (scripts/version-assets.mjs
  //   stamps every reference): immutable for a year, so repeat views make zero
  //   asset requests. A stale hash (old cached HTML, a rollback) must not pin
  //   today's bytes under it, so it falls through to the short rule.
  // - Anything else (unversioned or stale): 5 min, then revalidated in the
  //   background — never render-blocking, at most briefly stale after a release.
  // 304s get the same header: a 304 replaces the stored response's headers
  // (RFC 9111 4.3.4), so the Workers-Assets default on it would undo this.
  if (url.pathname.startsWith('/assets/') && (response.ok || response.status === 304)) {
    const v = url.searchParams.get('v')
    headers.set('Cache-Control', v && ASSET_VERSIONS[url.pathname] === v
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=300, stale-while-revalidate=86400')
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// Server-render the "Latest FPV & RC flying" cards into #vid-grid from the
// same KV feed the /videos.json endpoint serves. Crawlers (and Bing, which is
// unreliable about executing JS) get the six titles + links as real HTML, the
// grid paints without waiting for the client fetch, and freshness is visible
// at crawl time. The client script skips its own fetch when it finds these
// cards already present (falling back to hydration only if KV was empty).
// Markup mirrors the client renderer in site/index.html — keep in sync.
// The homepage runs two D1 queries and a KV read per render. Cache the rendered
// HTML at the edge like catalog pages (same release key, same TTLs) so traffic
// and crawlers cost one render per ~15 minutes per location, not one per view.
// Workers static assets answer HEAD with no Content-Length and ignore Range
// (observed in production, 2026-09-25), unlike Pages. Link-preview fetchers
// such as WhatsApp check an image's size before using it, and fall back to a
// small thumbnail when they can't, so answer both from the full GET response.
// Only HEAD and Range requests take this path; ordinary GETs pass through.
async function staticAsset(request, env) {
  const range = request.headers.get('range')
  if (request.method !== 'HEAD' && !(request.method === 'GET' && range)) return env.ASSETS.fetch(request)
  const headers = new Headers(request.headers)
  headers.delete('range')
  const res = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers }))
  if (res.status !== 200) return request.method === 'HEAD' ? new Response(null, res) : res
  const body = await res.arrayBuffer()
  const size = body.byteLength
  const out = new Headers(res.headers)
  out.set('Accept-Ranges', 'bytes')
  if (request.method === 'HEAD') {
    out.set('Content-Length', String(size))
    return new Response(null, { status: 200, headers: out })
  }
  // A single byte range ("bytes=a-b", "bytes=a-", "bytes=-n"); anything else
  // (multiple ranges, other units) gets the whole file, which is always valid.
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!m || (m[1] === '' && m[2] === '')) return new Response(body, { status: 200, headers: out })
  const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1])
  const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  if (start >= size || start > end) {
    out.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers: out })
  }
  out.set('Content-Range', `bytes ${start}-${end}/${size}`)
  return new Response(body.slice(start, end + 1), { status: 206, headers: out })
}

async function cachedHome(request, env, ctx, isLocal) {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || isLocal) return renderHome(request, env)
  // Key on host + path only: the rendered homepage never depends on the query
  // string, and keying on it would let ?utm=/?fbclid=/random params bypass the
  // cache and force a D1 render each. The key carries the deployed version.
  const cacheKey = publicCacheKey(new URL(request.url), env, { path: '/', params: [], tag: 'home' })
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  // HEAD (uptime monitors, link checkers) is answered from the GET entry, and a
  // miss renders the GET once so monitors can't run D1 on every probe.
  if (hit) return forMethod(request, hit)
  const state = { degraded: false }
  const get = request.method === 'HEAD' ? new Request(request.url, { method: 'GET', headers: request.headers }) : request
  const res = await renderHome(get, env, state)
  // A render that fell back because KV or D1 failed is served, never cached:
  // one blip must not pin a homepage without prices/videos for 15 minutes.
  if (!state.degraded && res.status === 200 && (res.headers.get('content-type') || '').includes('text/html')) {
    const store = new Response(res.clone().body, res)
    store.headers.set('cache-control', 'public, max-age=300, s-maxage=900')
    store.headers.set('x-home-cache', 'HIT') // only ever seen on responses served FROM the cache
    ctx.waitUntil(cache.put(cacheKey, store))
  }
  return forMethod(request, res)
}

async function renderHome(request, env, state = {}) {
  const response = await env.ASSETS.fetch(request)
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    return response
  }

  let videos = []
  try {
    const json = await env.VIDEOS_KV.get('feed')
    if (json) videos = (JSON.parse(json).videos || []).slice(0, 6)
  } catch {
    // Leave the page untransformed rather than inject garbage on a KV blip.
    state.degraded = true
  }

  // Live catalog cards for the #shop-grid section. Fail-open on ANY D1
  // problem — real catalog product links stay, without stale prices or stock claims.
  let wings = []
  let sellerCount = 0
  try {
    if (env.CATALOG_DB) {
      const cat = (await env.CATALOG_DB.prepare(`SELECT id, path_prefix FROM category WHERE live=1 AND path_prefix='/wings' LIMIT 1`).all()).results?.[0]
      if (cat) {
        const [sellers, cards] = await env.CATALOG_DB.batch(homeCatalogQueries(env.CATALOG_DB, cat.id))
        sellerCount = sellers.results?.[0]?.n || 0
        wings = (cards.results || []).map((m) => ({ ...m, prefix: cat.path_prefix }))
      }
    }
  } catch {
    // fallback card remains
    state.degraded = true
  }
  if (videos.length === 0 && wings.length === 0 && sellerCount === 0) return response

  const wingCard = (m) => {
    let span = ''
    try {
      span = JSON.parse(m.specs || '{}').spanMM || ''
    } catch {}
    return (
      `<a class="shopc" href="${esc(m.prefix)}/${esc(m.slug)}/">` +
      `<div class="shopc-img"><img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" width="400" height="300" loading="lazy" /><span class="skel-tag">IN STOCK</span></div>` +
      `<div class="shopc-body"><div class="shopc-brand">${esc(m.brand)}</div><div class="shopc-name">${esc(m.name)}</div>` +
      `<div class="shopc-meta"><span class="shopc-price">from ₹${Number(m.price).toLocaleString('en-IN')}</span>${span ? `<span class="shopc-chip">${esc(span)}mm</span>` : ''}</div>${m.checked_at ? `<p class="shopc-checked">Oldest live listing check: <time datetime="${new Date(m.checked_at).toISOString()}">${new Date(m.checked_at).toISOString().slice(0,10)}</time></p>` : ''}</div></a>`
    )
  }

  const card = (v) => {
    const href = v.url || `https://www.youtube.com/watch?v=${v.id}`
    const thumb = v.thumbnail || `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`
    return (
      `<a class="vid" href="${esc(href)}" target="_blank" rel="noopener">` +
      `<div class="vid-thumb"><img src="${esc(thumb)}" alt="${esc(v.title)}" width="480" height="360" loading="lazy" />` +
      `<div class="vid-play"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="margin-left:2px"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg></div></div>` +
      `<div class="vid-body"><div class="vid-title">${esc(v.title)}</div>` +
      `<div class="vid-meta"><svg width="15" height="15" viewBox="0 0 24 24" fill="#C63B2E" stroke="none"><rect x="2.5" y="5.5" width="19" height="13" rx="3.6"/><path d="M10 9.4l5.2 2.6L10 14.6z" fill="#FCF9F1"/></svg>YOUTUBE</div></div></a>`
    )
  }

  let rw = new HTMLRewriter()
  if (sellerCount) rw = rw.on('#catalog-seller-count', { element(el) { el.setInnerContent(`Listings from ${sellerCount} Indian sellers`) } })
  if (videos.length)
    rw = rw.on('#vid-grid', {
      element(el) {
        el.setInnerContent(videos.map(card).join(''), { html: true })
      },
    })
  if (wings.length)
    rw = rw.on('#shop-grid', {
      element(el) {
        el.setInnerContent(wings.map(wingCard).join(''), { html: true })
      },
    }).on('#shop-status', {
      element(el) {
        el.setInnerContent('Latest checked prices and stock. Confirm availability with the seller.')
      },
    })
  // The rewritten page no longer matches the static file's validators; drop
  // them so a conditional request can't be answered 304 with stale prices.
  const out = rw.transform(response)
  const page = new Response(out.body, out)
  page.headers.delete('etag')
  page.headers.delete('last-modified')
  return page
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function refreshFeed(env) {
  if (!env.YOUTUBE_CHANNEL_ID) return null

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${env.YOUTUBE_CHANNEL_ID}`

  let xml
  try {
    const res = await fetch(feedUrl, { cf: { cacheTtl: 0 } })
    if (!res.ok) return null
    xml = await res.text()
  } catch {
    // Leave last-good in KV rather than overwriting with garbage on a blip.
    return null
  }

  const videos = parseFeed(xml)
  if (videos.length === 0) return null

  const json = JSON.stringify({
    updated: new Date().toISOString(),
    channel: env.YOUTUBE_CHANNEL_ID,
    videos,
  })
  await env.VIDEOS_KV.put('feed', json)
  return json
}

function parseFeed(xml) {
  const out = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  let m
  while ((m = entryRe.exec(xml))) {
    const e = m[1]
    const id = pick(e, /<yt:videoId>([^<]+)<\/yt:videoId>/)
    const title = decode(pick(e, /<title>([^<]+)<\/title>/) || '')
    const published = pick(e, /<published>([^<]+)<\/published>/)
    const description = decode(pick(e, /<media:description>([\s\S]*?)<\/media:description>/) || '')
    const views = parseInt(pick(e, /<media:statistics views="([^"]+)"/) || '0', 10)
    const likes = parseInt(pick(e, /<media:starRating[^>]+count="([^"]+)"/) || '0', 10)

    if (!id || !title) continue

    out.push({
      id,
      title,
      published,
      description,
      views,
      likes,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    })
  }
  return out
}

function pick(s, re) {
  const m = s.match(re)
  return m ? m[1] : null
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/**
 * Forward `request` to `origin`, optionally stripping `prefix` from the path.
 * Preserves query string, method, headers and body. Drops Host so the
 * upstream Pages deployment dispatches to its own project.
 *
 * For 3xx responses with absolute-path Location headers, prepend `prefix` so
 * redirects stay inside our path namespace. Cloudflare Pages issues a 308
 * `/log-viewer/index.html` → `Location: /` which would otherwise jump the
 * user out of the prefix and hit the landing page (and the SW would then
 * cache the landing page as the precached `index.html` for the viewer).
 */
async function forward(request, origin, prefix) {
  if (!origin) {
    return new Response('Routing misconfigured: missing origin', { status: 502 })
  }

  const url = new URL(request.url)
  let path = url.pathname

  if (prefix) {
    path = path.slice(prefix.length) || '/'
    if (!path.startsWith('/')) path = '/' + path
  }

  const target = origin.replace(/\/$/, '') + path + url.search
  const upstream = new Request(target, request)
  upstream.headers.delete('host')
  // Don't pass the client's accept-encoding through: with it, workerd keeps
  // the upstream body COMPRESSED end-to-end and HTMLRewriter (share-widget
  // injection below) silently parses nothing. Without it, the runtime hands
  // us a decoded body and re-compresses toward the client on its own.
  upstream.headers.delete('accept-encoding')

  // redirect: 'manual' so we can rewrite Location ourselves before passing on.
  const response = await fetch(upstream, { redirect: 'manual' })

  if (prefix && response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location')
    if (location && location.startsWith('/') && !location.startsWith(prefix + '/') && location !== prefix) {
      const headers = new Headers(response.headers)
      // `/` → `/log-viewer/`,  `/foo` → `/log-viewer/foo`
      headers.set('Location', prefix + (location === '/' ? '/' : location))
      headers.delete('x-robots-tag')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  }

  // Strip any upstream X-Robots-Tag before serving on narenana.com hosts.
  // The Pages project sets `X-Robots-Tag: noindex` via _headers to keep the
  // duplicate *.pages.dev hosts out of the index — but this Worker fetches
  // that same origin, and forwarding the header verbatim would noindex the
  // canonical www.narenana.com/log-viewer/ (and latest.narenana.com) too.
  let out = response
  if (response.headers.has('x-robots-tag')) {
    const headers = new Headers(response.headers)
    headers.delete('x-robots-tag')
    out = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  // The upstream app owns its shared chrome, including the share dialog.
  return out
}
