// Cloudflare Worker (with static assets) — single-handler routing + cron.
//
// fetch() routes:
//   http:// or apex             → 301 redirect → https://www.narenana.com (canonical)
//   /videos.json                → JSON of latest videos (KV-backed cache)
//   /log-viewer, /log-viewer/*  → strip prefix → LOG_VIEWER_ORIGIN
//   everything else             → env.ASSETS.fetch(request) → site/ files
//
// scheduled() (hourly cron): fetch RSS for YOUTUBE_CHANNEL_ID, parse, write to
// KV under key "feed". Page reloads naturally pick up the new payload.

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
      url.hostname.endsWith('.localhost')
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
    ctx.waitUntil(refreshFeed(env))
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

// Server-rendered <noscript> fallback for the client-hydrated YouTube grid,
// built from the same KV feed. Crawlers and AI answer engines that don't run
// the page script still get the latest video titles + links as crawlable text.
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

  const items = videos
    .map((v) => `<li><a href="${esc(v.url)}">${esc(v.title)}</a></li>`)
    .join('')
  const noscript = `<noscript><ul>${items}</ul></noscript>`

  return new HTMLRewriter()
    .on('#videos', {
      element(el) {
        el.after(noscript, { html: true })
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
