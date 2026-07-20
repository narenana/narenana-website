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

import { handleCatalog, catalogScheduled } from '../catalog/lib/worker.mjs'

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

    // /log-viewer/* is a separate proxied app — leave its responses untouched
    // (the delicate redirect + X-Robots-Tag handling lives in forward()).
    // Cloudflare-dashboard edge HSTS covers those hosts belt-and-suspenders.
    if (url.pathname === '/log-viewer' || url.pathname.startsWith('/log-viewer/')) {
      // latest.narenana.com mirrors the LATEST log-viewer preview build (the
      // `latest` Pages branch alias); www / apex stay on the production
      // origin. Falls back to production if the staging var is unset.
      const origin =
        url.hostname === 'latest.narenana.com' && env.LOG_VIEWER_ORIGIN_LATEST
          ? env.LOG_VIEWER_ORIGIN_LATEST
          : env.LOG_VIEWER_ORIGIN
      return forward(request, origin, '/log-viewer')
    }

    if (url.pathname === '/videos.json') {
      return harden(await videosResponse(env), url, isLocal)
    }

    // Catalog platform — public category pages (D1-backed), /admin, /api/*,
    // /img/* and /catalog.css. Returns null for paths it doesn't own.
    {
      const r = await handleCatalog(request, url, env, ctx)
      if (r) return harden(r, url, isLocal)
    }

    // The home page's "Latest from YouTube" grid hydrates client-side, so
    // crawlers / AI answer engines would otherwise see none of it. Inject a
    // <noscript> fallback list from the KV feed the Worker already holds.
    const response =
      url.pathname === '/' || url.pathname === '/index.html'
        ? await renderHome(request, env)
        : await env.ASSETS.fetch(request)

    return harden(response, url, isLocal)
  },

  async scheduled(event, env, ctx) {
    // Dispatch on the cron expression — each schedule owns ONE job. Without
    // this branch the hourly RSS refresh would re-fire on every */15 tick.
    if (event.cron === '0 * * * *') ctx.waitUntil(refreshFeed(env))
    else catalogScheduled(event, env, ctx)
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
function harden(response, url, isLocal) {
  const headers = new Headers(response.headers)
  if (!isLocal) {
    // 2-year max-age + `preload` makes the domain eligible for the HSTS preload
    // list (still has to be submitted once at hstspreload.org — a one-way door:
    // every subdomain must then stay HTTPS-only). Everything here already is.
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  // Cache static art for a day — but ONLY successful responses. Caching a 404 or
  // 5xx here (e.g. a request that races a deploy before an asset propagates)
  // would otherwise pin the error at the edge for the full TTL. Filenames aren't
  // content-hashed, but Workers-Assets re-versions changed files on deploy so
  // in-place edits still go live; stale-while-revalidate bounds the rest.
  if (url.pathname.startsWith('/assets/') && response.ok) {
    headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
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
async function renderHome(request, env) {
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
  }
  if (videos.length === 0) return response

  const card = (v) => {
    const href = v.url || `https://www.youtube.com/watch?v=${v.id}`
    const thumb = v.thumbnail || `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`
    return (
      `<a class="vid" href="${esc(href)}" target="_blank" rel="noopener">` +
      `<div class="vid-thumb"><img src="${esc(thumb)}" alt="${esc(v.title)}" loading="lazy" />` +
      `<div class="vid-play"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="margin-left:2px"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg></div></div>` +
      `<div class="vid-body"><div class="vid-title">${esc(v.title)}</div>` +
      `<div class="vid-meta"><svg width="15" height="15" viewBox="0 0 24 24" fill="#C63B2E" stroke="none"><rect x="2.5" y="5.5" width="19" height="13" rx="3.6"/><path d="M10 9.4l5.2 2.6L10 14.6z" fill="#FCF9F1"/></svg>YOUTUBE</div></div></a>`
    )
  }

  return new HTMLRewriter()
    .on('#vid-grid', {
      element(el) {
        el.setInnerContent(videos.map(card).join(''), { html: true })
      },
    })
    .transform(response)
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
  if (response.headers.has('x-robots-tag')) {
    const headers = new Headers(response.headers)
    headers.delete('x-robots-tag')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  return response
}
