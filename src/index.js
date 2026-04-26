// Cloudflare Worker (with static assets) — single-handler routing + cron.
//
// fetch() routes:
//   /videos.json                → JSON of latest videos (KV-backed cache)
//   /log-viewer, /log-viewer/*  → strip prefix → LOG_VIEWER_ORIGIN
//   everything else             → env.ASSETS.fetch(request) → site/ files
//
// scheduled() (hourly cron): fetch RSS for YOUTUBE_CHANNEL_ID, parse, write to
// KV under key "feed". Page reloads naturally pick up the new payload.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/videos.json') {
      return videosResponse(env)
    }

    if (url.pathname === '/log-viewer' || url.pathname.startsWith('/log-viewer/')) {
      return forward(request, env.LOG_VIEWER_ORIGIN, '/log-viewer')
    }

    return env.ASSETS.fetch(request)
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
    },
  })
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
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  }

  return response
}
