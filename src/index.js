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

  // Live catalog cards for the #shop-grid section. Fail-open on ANY D1
  // problem — the static "Browse every wing" fallback card stays.
  let wings = []
  try {
    if (env.CATALOG_DB) {
      const cat = (await env.CATALOG_DB.prepare(`SELECT id, path_prefix FROM category WHERE live=1 LIMIT 1`).all()).results?.[0]
      if (cat) {
        wings = (
          await env.CATALOG_DB.prepare(
            `SELECT m.id, m.slug, m.brand, m.name, m.specs,
                COALESCE(m.hero_image, MIN(CASE WHEN k.dead=0 THEN k.image_url END)) AS hero,
                MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND o.pack_qty=1 THEN k.price_inr END) AS price
             FROM master_model m
             JOIN offer o ON o.master_model_id=m.id
             JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
             WHERE m.category_id=? AND m.status='ready'
             GROUP BY m.id HAVING price IS NOT NULL AND hero IS NOT NULL
             ORDER BY price DESC LIMIT 4`,
          ).bind(cat.id).all()
        ).results.map((m) => ({ ...m, prefix: cat.path_prefix }))
      }
    }
  } catch {
    // fallback card remains
  }
  if (videos.length === 0 && wings.length === 0) return response

  const wingCard = (m) => {
    let span = ''
    try {
      span = JSON.parse(m.specs || '{}').spanMM || ''
    } catch {}
    return (
      `<a class="shopc" href="${esc(m.prefix)}/${esc(m.slug)}/">` +
      `<div class="shopc-img"><img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" loading="lazy" /><span class="skel-tag">IN STOCK</span></div>` +
      `<div class="shopc-body"><div class="shopc-brand">${esc(m.brand)}</div><div class="shopc-name">${esc(m.name)}</div>` +
      `<div class="shopc-meta"><span class="shopc-price">from ₹${Number(m.price).toLocaleString('en-IN')}</span>${span ? `<span class="shopc-chip">${esc(span)}mm</span>` : ''}</div></div></a>`
    )
  }

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

  let rw = new HTMLRewriter()
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
    })
  return rw.transform(response)
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

  // Inject the site share widget into proxied HTML (the log-viewer app ships
  // from its own repo; injecting at the edge keeps it on-brand without a
  // cross-repo release). Floating pill, self-contained, utm-tagged.
  if (prefix === '/log-viewer' && (out.headers.get('content-type') || '').includes('text/html') && out.status === 200) {
    out = new HTMLRewriter()
      .on('body', {
        element(el) {
          el.append(shareWidgetHtml('log-viewer', 'RC Log Viewer — replay EdgeTX / iNAV / Betaflight logs in 3D, free in your browser'), { html: true })
        },
      })
      .transform(out)
  }

  return out
}

// Floating share pill injected into proxied apps. Every channel carries its
// own utm_source (utm_medium=share, utm_campaign=<surface>) so GA4 and CF
// analytics can attribute incoming traffic to these buttons.
function shareWidgetHtml(campaign, title) {
  return `
<style>
#nn-shr{position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:'Hanken Grotesk',system-ui,sans-serif}
#nn-shr-btn{display:inline-flex;align-items:center;gap:7px;background:rgba(15,44,57,.88);border:1.5px solid rgba(252,249,241,.25);color:#FCF9F1;border-radius:999px;padding:8px 15px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28);backdrop-filter:blur(6px)}
#nn-shr-btn:hover{background:#EF7A25;border-color:#EF7A25;color:#12303D}
#nn-shr-menu{display:none;position:absolute;right:0;bottom:calc(100% + 12px);background:#FCF9F1;border:2px solid #0F2C39;border-radius:12px;min-width:208px;padding:6px;box-shadow:0 18px 44px rgba(0,0,0,.3)}
#nn-shr-menu.on{display:block}
#nn-shr .nn-k{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:rgba(15,44,57,.55);margin:6px 10px 5px;font-weight:700}
#nn-shr-menu a,#nn-shr-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;background:none;border:0;border-radius:8px;font-family:inherit;font-size:14px;font-weight:600;color:#0F2C39;text-align:left;text-decoration:none;cursor:pointer}
#nn-shr-menu a:hover,#nn-shr-menu button:hover{background:#DDE9EE}
</style>
<div id="nn-shr">
  <div id="nn-shr-menu">
    <p class="nn-k">Share this page</p>
    <a id="nn-shr-wa" target="_blank" rel="noopener"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.3c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.6.8 1.9.8 2 .1.1.1.3 0 .5-.3.6-.7.9-.5 1.2.7 1.2 1.6 2 2.8 2.6.3.2.5.1.7-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.4 0 .1 0 .7-.2 1.3z"/></svg>WhatsApp</a>
    <a id="nn-shr-x" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-6.8 7.8L23.3 22h-6.3l-4.9-6.4L6.5 22H3.4l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2zm-1.1 18h1.7L7.3 3.7H5.5L17.8 20z"/></svg>X / Twitter</a>
    <button id="nn-shr-cp"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>Copy link</button>
    <button id="nn-shr-nt"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>More options</button>
  </div>
  <button id="nn-shr-btn" aria-haspopup="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg>Share</button>
</div>
<script>(function(){var b=document.getElementById('nn-shr-btn'),m=document.getElementById('nn-shr-menu');if(!b)return;
function u(s){var x=new URL(location.origin+location.pathname);x.searchParams.set('utm_source',s);x.searchParams.set('utm_medium','share');x.searchParams.set('utm_campaign',${JSON.stringify(campaign)});return x.toString()}
var t=${JSON.stringify(title)};
b.onclick=function(e){e.stopPropagation();m.style.display=m.style.display==='block'?'none':'block'};
document.addEventListener('click',function(){m.style.display='none'});
m.addEventListener('click',function(e){e.stopPropagation()});
document.getElementById('nn-shr-wa').href='https://wa.me/?text='+encodeURIComponent(t+' — '+u('whatsapp'));
document.getElementById('nn-shr-x').href='https://twitter.com/intent/tweet?text='+encodeURIComponent(t)+'&url='+encodeURIComponent(u('x'));
document.getElementById('nn-shr-cp').onclick=function(){var el=this;navigator.clipboard.writeText(u('copy')).then(function(){el.textContent='Copied ✓';setTimeout(function(){el.textContent='Copy link'},1400)})};
var n=document.getElementById('nn-shr-nt');
if(navigator.share){n.onclick=function(){navigator.share({title:t,url:u('native')}).catch(function(){})}}else{n.style.display='none'}
})()</script>`
}
