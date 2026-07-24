// Catalog worker: public pages from D1, admin panel + API behind HTTP Basic
// auth, image proxy, and the */15 job-slice dispatcher.

import puppeteer from '@cloudflare/puppeteer'
import { CSS } from './styles.mjs'
import { ADMIN_HTML } from './admin-ui.mjs'
import { renderGrid, renderMaster, powerType } from './public.mjs'
import { gridDataNext, renderGridNext, resolveLanding, validLandings, browseData, renderBrowse } from './grid-next.mjs'
import { runSlice, upsertProducts, mergeMasters, dedupSlice } from './jobs.mjs'
import {
  MFR_WEEKLY_CRON,
  enqueueManufacturerHarvests,
  rebuildAllManufacturerMatches,
  rebuildManufacturerMatches,
} from './mfr-jobs.mjs'
import { configAgreement, configTypes } from './mfr-match.mjs'
import { getHtml, ogImageFrom, feedPage } from './adapters.mjs'
import { all, one, run, batch, q, getSetting, setSetting, audit } from './db.mjs'
import { json, esc, now, canonicalUrl, hostOf, slugify, normName, basicAuth, challenge, imgKey, imageCacheHeaders } from './util.mjs'

// --- categories cache (per-isolate, 60s) — saves a D1 query on most requests
let catCache = { at: 0, rows: [] }
async function categories(env) {
  if (now() - catCache.at > 60e3) catCache = { at: now(), rows: await all(env, 'SELECT * FROM category') }
  return catCache.rows
}

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' } })

// IndexNow key — PUBLIC (served at /<key>.txt to prove ownership so Bing /
// Yandex accept our URL submissions). Not a secret; safe in the repo.
const INDEXNOW_KEY = '7f3e9a1c5b8d4260e94a1f7c3b0d8e62'

export async function handleCatalog(request, url, env, ctx) {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (!env.CATALOG_DB) return null

  if (path === '/catalog.css')
    // URL is versioned (?v=<hash> in the <link>), so the bytes are immutable:
    // a CSS change ships a new URL rather than mutating this one.
    return new Response(CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' } })

  // IndexNow ownership key, served at the site root.
  if (path === `/${INDEXNOW_KEY}.txt`)
    return new Response(INDEXNOW_KEY, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } })

  // Manufacturer imagery is review evidence, not a consumer surface. Keep it
  // behind the same Basic-auth gate as the admin while seller/master imagery
  // remains public for catalog cards.
  if (path.startsWith('/img/mfr/')) {
    const auth = await basicAuth(request, env)
    if (!auth.ok) return challenge(auth.reason)
    return imgProxy(env, path, ctx)
  }

  // ---- public seller/master image proxy (host-allowlisted) ----
  if (path.startsWith('/img/')) return imgProxy(env, path, ctx)

  // ---- admin (HTTP Basic) ----
  if (path === '/admin' || path.startsWith('/api/')) {
    const auth = await basicAuth(request, env)
    if (!auth.ok) return challenge(auth.reason)
    if (path === '/admin')
      return new Response(ADMIN_HTML, {
        // no-store: the admin is a long-lived SPA and a stale cached shell
        // silently runs old JS against a newer API — "can't see my approvals"
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    try {
      return await api(request, url, env, path.slice(5), auth.actor)
    } catch (e) {
      return json({ error: String(e.message || e) }, 500)
    }
  }

  // ---- public category routes ----
  const cats = await categories(env)
  if (path === '/sitemap.xml') return sitemapResponse(env, cats)
  const cat = cats.find((c) => path === c.path_prefix || path.startsWith(c.path_prefix + '/'))
  if (!cat || !cat.live) return null

  if (path === cat.path_prefix) {
    // Faceted grid is the DEFAULT UX; the classic grid stays reachable at ?ui=classic.
    if (url.searchParams.get('ui') !== 'classic') {
      const p = url.searchParams.get('power') === 'gas' ? 'gas' : 'electric'
      const roles = (url.searchParams.get('role') || '').split(',').filter(Boolean)
      const sizes = (url.searchParams.get('size') || '').split(',').filter(Boolean)
      const [rows, counts] = await Promise.all([gridDataNext(env, cat, p), gridCounts(env, cat)])
      return html(renderGridNext(cat, rows, { power: p, roles, sizes, cond: url.searchParams.get('cond'), sort: url.searchParams.get('sort'), counts }))
    }
    const power = ['electric', 'gas', 'all'].includes(url.searchParams.get('power')) ? url.searchParams.get('power') : 'electric'
    const sort = ['price-desc', 'price-asc', 'span-desc', 'span-asc'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'price-desc'
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const counts = await gridCounts(env, cat)
    const masters = await gridMasters(env, cat, power, page, sort)
    return html(renderGrid(cat, masters, { power, page, counts, sort }))
  }

  const slug = path.slice(cat.path_prefix.length + 1)
  // HTML sitemap hub — a crawlable index of every product + landing link, so no
  // product page is orphaned. Reserved slug, checked before the master lookup.
  if (slug === 'browse') {
    const rows = await browseData(env, cat)
    return html(renderBrowse(cat, rows, validLandings(rows)))
  }
  // SEO landing pages — flat slugs (warbirds, electric-warbirds, nitro, …).
  // Checked before the master lookup; reserved slugs can't collide with product slugs.
  if (slug && !slug.includes('/')) {
    const L = resolveLanding(slug)
    if (L) {
      const [rows, counts] = await Promise.all([gridDataNext(env, cat, L.power), gridCounts(env, cat)])
      const matched = L.roles.length
        ? rows.filter((r) => { try { return JSON.parse(r.role_tags || '[]').some((t) => L.roles.includes(t)) } catch { return false } }).length
        : rows.length
      if (matched >= 1) {
        const lp = await one(env, `SELECT body FROM landing_page WHERE slug=? AND published=1`, slug)
        return html(renderGridNext(cat, rows, { power: L.power, roles: L.roles, landing: { L, slug, content: lp?.body || '' }, counts }))
      }
    }
  }
  if (slug && !slug.includes('/')) {
    const m = await one(env, `SELECT * FROM master_model WHERE category_id=? AND slug=? AND status IN ('ready','retired')`, cat.id, slug)
    if (m) {
      const offers = await all(
        env,
        `SELECT o.config, o.pack_qty, k.*, s.name AS source_name, s.grey_import, s.made_in_india, s.tax_included
         FROM offer o JOIN sku k ON k.id=o.sku_id JOIN source s ON s.id=k.source_id
         WHERE o.master_model_id=? AND k.review_status='approved'
         ORDER BY k.dead ASC, k.in_stock DESC, k.price_inr ASC`,
        m.id,
      )
      // "What to put in it" (recipes/components) is removed until we build a
      // trustworthy framework for it. Product pages now show similar models
      // instead — same category, in-stock, sharing a role tag.
      const similar = await similarMasters(env, cat, m)
      return html(renderMaster(cat, m, offers, similar))
    }
  }
  // unknown slug → the REAL category grid (page 1, electric) with 404 status
  return html(renderGrid(cat, await gridMasters(env, cat, 'electric', 1), { power: 'electric', page: 1, counts: await gridCounts(env, cat) }), 404)
}

const GRID_PAGE = 24

// One page of in-stock masters, filtered by power, cheapest-last (price
// high→low). Power is a stored column (0006) so this filters + paginates in
// SQL — no GROUP_CONCAT over the whole catalog per request.
async function gridMasters(env, cat, power = 'electric', page = 1, sort = 'price-desc') {
  const powerClause = power === 'all' ? '' : `AND COALESCE(m.power,'electric')=?`
  const params = [cat.id]
  if (power !== 'all') params.push(power)
  params.push(GRID_PAGE, (page - 1) * GRID_PAGE)
  // Whitelisted ORDER BY — never interpolate raw user input. No-price / no-span
  // rows always sort last, then a stable price tiebreak.
  const ORDER = {
    'price-desc': '(min_price IS NULL) ASC, min_price DESC',
    'price-asc': '(min_price IS NULL) ASC, min_price ASC',
    'span-desc': '(span_mm IS NULL OR span_mm=0) ASC, span_mm DESC, (min_price IS NULL) ASC, min_price ASC',
    'span-asc': '(span_mm IS NULL OR span_mm=0) ASC, span_mm ASC, (min_price IS NULL) ASC, min_price ASC',
  }[sort] ?? '(min_price IS NULL) ASC, min_price DESC'
  return all(
    env,
    `SELECT m.*, COUNT(DISTINCT k.source_id) AS sellers,
            COALESCE(m.hero_image, MIN(CASE WHEN k.dead=0 THEN k.image_url END)) AS hero_any,
            MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND o.pack_qty=1 THEN k.price_inr END) AS min_price,
            CAST(json_extract(m.specs,'$.spanMM') AS INTEGER) AS span_mm,
            MAX(CASE WHEN LOWER(k.title) LIKE '%pre-owned%' OR LOWER(k.title) LIKE '%pre owned%' OR LOWER(k.title) LIKE '%preowned%'
                  OR LOWER(k.title) LIKE '%sparingly used%' OR LOWER(k.title) LIKE '%(used)%' OR LOWER(k.title) LIKE '%refurbished%' THEN 1 ELSE 0 END) AS preowned,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS any_stock
     FROM master_model m
     JOIN offer o ON o.master_model_id = m.id
     JOIN sku k ON k.id = o.sku_id AND k.review_status='approved'
     WHERE m.category_id=? AND m.status='ready' ${powerClause}
     GROUP BY m.id
     HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) = 1
     ORDER BY ${ORDER}
     LIMIT ? OFFSET ?`,
    ...params,
  )
}

// Similar models for a product page: same category, in-stock, sharing ≥1 role
// tag with m. Ranked by shared-tag count, then closest wingspan. Returns the
// grid-card shape (reuses masterCard). Empty if m has no role tags.
async function similarMasters(env, cat, m) {
  let myTags = []
  try { myTags = JSON.parse(m.role_tags || '[]') } catch {}
  myTags = (Array.isArray(myTags) ? myTags : []).filter(Boolean)
  if (!myTags.length) return []
  const like = myTags.map(() => `m.role_tags LIKE ?`).join(' OR ')
  const params = [cat.id, m.id, ...myTags.map((t) => `%"${t}"%`)]
  const rows = await all(
    env,
    `SELECT m.*, COUNT(DISTINCT k.source_id) AS sellers,
            COALESCE(m.hero_image, MIN(CASE WHEN k.dead=0 THEN k.image_url END)) AS hero_any,
            MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND o.pack_qty=1 THEN k.price_inr END) AS min_price,
            CAST(json_extract(m.specs,'$.spanMM') AS INTEGER) AS span_mm,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS any_stock
     FROM master_model m
     JOIN offer o ON o.master_model_id = m.id
     JOIN sku k ON k.id = o.sku_id AND k.review_status='approved'
     WHERE m.category_id=? AND m.status='ready' AND m.id<>? AND (${like})
     GROUP BY m.id
     HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) = 1
     LIMIT 60`,
    ...params,
  )
  const mySet = new Set(myTags)
  const mySpan = Number(m.span_mm) || (() => { try { return Number(JSON.parse(m.specs || '{}').spanMM) || 0 } catch { return 0 } })()
  return rows
    .map((r) => {
      let rt = []
      try { rt = JSON.parse(r.role_tags || '[]') } catch {}
      return { r, shared: rt.filter((t) => mySet.has(t)).length, dspan: Math.abs((r.span_mm || 0) - mySpan) }
    })
    .sort((a, b) => b.shared - a.shared || a.dspan - b.dspan)
    .slice(0, 8)
    .map((x) => x.r)
}

// In-stock master counts per power (for the filter chips + page total).
async function gridCounts(env, cat) {
  const rows = await all(
    env,
    `SELECT COALESCE(p,'electric') power, COUNT(*) n FROM (
       SELECT m.id, m.power AS p
       FROM master_model m JOIN offer o ON o.master_model_id=m.id
       JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
       WHERE m.category_id=? AND m.status='ready'
       GROUP BY m.id
       HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END)=1
     ) GROUP BY power`,
    cat.id,
  )
  const c = { electric: 0, gas: 0 }
  for (const r of rows) c[r.power] = r.n
  c.all = c.electric + c.gas
  c.pageSize = GRID_PAGE
  return c
}

// Recompute a master's power from all its offers' seller titles (gas if any
// offer names an engine — cc / glow size / nitro). Called on approve/attach/merge.
async function setMasterPower(env, masterId) {
  const t = (await one(env, `SELECT GROUP_CONCAT(k.title, ' ') titles FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=?`, masterId))?.titles ?? ''
  await run(env, `UPDATE master_model SET power=? WHERE id=?`, powerType(t), masterId)
}

// ---------------------------------------------------------------- img proxy
const SITE = 'https://www.narenana.com'

// sitemap.xml: homepage + each live category + its valid landing pages (>=3
// in-stock) + every ready product page.
async function sitemapResponse(env, cats) {
  // Main site + the /log-viewer/ tool (this route shadows the static
  // site/sitemap.xml, so those entries must live here now). The FPV simulator
  // is on its own subdomain and ships its own sitemap.
  const urls = [`${SITE}/`, `${SITE}/log-viewer/`]
  for (const cat of cats.filter((c) => c.live)) {
    urls.push(`${SITE}${cat.path_prefix}/`)
    urls.push(`${SITE}${cat.path_prefix}/browse/`)
    const masters = await all(
      env,
      `SELECT m.slug, COALESCE(m.power,'electric') AS power, m.role_tags,
              MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS any_stock
       FROM master_model m JOIN offer o ON o.master_model_id=m.id
       JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
       WHERE m.category_id=? AND m.status='ready' GROUP BY m.id`,
      cat.id,
    )
    for (const s of validLandings(masters)) urls.push(`${SITE}${cat.path_prefix}/${s}/`)
    // In-stock only — don't feed Google product pages we can't currently sell.
    // Regenerates live each request, so pages auto-drop/return with stock.
    for (const m of masters) if (m.any_stock) urls.push(`${SITE}${cat.path_prefix}/${m.slug}/`)
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}

// --- IndexNow: push changed in-stock URLs to Bing / Yandex / Seznam ---------
// One POST notifies every IndexNow participant. Fire-and-forget from the hourly
// cron. Fully guarded — a failure never touches anything else.
async function indexNowSubmit(urlList) {
  if (!urlList.length) return false
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: 'www.narenana.com', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urlList.slice(0, 10000) }),
    })
    return res.status === 200 || res.status === 202
  } catch {
    return false
  }
}

// Submit in-stock product URLs changed since the last run. First run (no cursor)
// seeds the whole in-stock set + hubs + landings; after that only masters edited
// since — updated_at is bumped on real edits (new / enriched / classified /
// merged), NOT on verify ticks, so this stays changed-only and non-spammy.
async function indexNowPing(env) {
  if (!env.CATALOG_DB) return
  const cursor = parseInt((await getSetting(env, 'indexnow_at')) || '0', 10)
  const t = now()
  const first = cursor === 0
  const cats = (await categories(env)).filter((c) => c.live)
  const urls = []
  for (const cat of cats) {
    const rows = await all(
      env,
      `SELECT m.slug FROM master_model m
       JOIN offer o ON o.master_model_id=m.id
       JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
       WHERE m.category_id=? AND m.status='ready' AND COALESCE(m.updated_at,0) > ?
       GROUP BY m.id
       HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) = 1
       LIMIT 9000`,
      cat.id,
      cursor,
    )
    if (!rows.length && !first) continue
    for (const r of rows) urls.push(`${SITE}${cat.path_prefix}/${r.slug}/`)
    urls.push(`${SITE}${cat.path_prefix}/`, `${SITE}${cat.path_prefix}/browse/`)
    if (first) {
      urls.push(`${SITE}/`)
      const ms = await all(
        env,
        `SELECT COALESCE(m.power,'electric') AS power, m.role_tags,
                MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS any_stock
         FROM master_model m JOIN offer o ON o.master_model_id=m.id
         JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
         WHERE m.category_id=? AND m.status='ready' GROUP BY m.id`,
        cat.id,
      )
      for (const s of validLandings(ms)) urls.push(`${SITE}${cat.path_prefix}/${s}/`)
    }
  }
  if (!urls.length) return void (await setSetting(env, 'indexnow_at', String(t)))
  if (await indexNowSubmit(urls)) await setSetting(env, 'indexnow_at', String(t))
}

// imgKey (FNV-1a of the source URL → stable R2 key) lives in util.mjs so the
// warm job agrees on the key. Dedups images shared across masters; a changed
// source URL naturally gets a new key + re-fetch.
const IMG_CDN = /(^|\.)(cdn\.shopify\.com|shopify\.com|zohocommercecdn\.com|wixstatic\.com)$/

async function imgProxy(env, path, ctx) {
  const m = path.match(/^\/img\/(master|sku|mfr)\/(\d+)$/)
  if (!m) return new Response('bad path', { status: 400 })
  const cacheHeaders = imageCacheHeaders(m[1])
  const src =
    m[1] === 'master'
      // Self-heal: a master approved from a data-poor sku gains an image the
      // moment ANY of its offers' skus gets one (scan/verify backfill).
      ? (await one(env, `SELECT COALESCE(mm.hero_image,
            (SELECT k.image_url FROM offer o JOIN sku k ON k.id=o.sku_id
             WHERE o.master_model_id=mm.id AND k.image_url IS NOT NULL ORDER BY k.dead ASC LIMIT 1)) AS u
          FROM master_model mm WHERE mm.id=?`, m[2]))?.u
      : m[1] === 'sku'
        ? (await one(env, 'SELECT image_url AS u FROM sku WHERE id=?', m[2]))?.u
        : (await one(
            env,
            `SELECT CASE WHEN json_valid(image_urls)
                         THEN json_extract(image_urls,'$[0]') END AS u
             FROM mfr_product WHERE id=?`,
            m[2],
          ))?.u
  if (!src) return new Response('no image', { status: 404 })

  const key = imgKey(src)
  // Durable copy: once an image is in R2 we never touch the seller again, so a
  // down / slow / geo-blocked seller site can't blank the catalog.
  if (env.IMAGES) {
    const hit = await env.IMAGES.get(key)
    if (hit) return new Response(hit.body, { headers: { ...cacheHeaders, 'content-type': hit.httpMetadata?.contentType || 'image/jpeg', 'x-img': 'r2' } })
  }

  // Miss → fetch origin (host-allowlisted), relay, and stash in R2 for next time.
  const [hosts, manufacturerDomains] = await Promise.all([
    all(env, 'SELECT home_url FROM source').then((rows) => rows.map((s) => hostOf(s.home_url)).filter(Boolean)),
    all(env, `SELECT domain FROM manufacturer WHERE status='active'`).then((rows) =>
      rows.map((r) => hostOf(r.domain) || hostOf(`https://${r.domain}`)).filter(Boolean),
    ),
  ])
  const allowed = (host) =>
    !!host &&
    (hosts.includes(host) ||
      manufacturerDomains.some((domain) => host === domain || host.endsWith(`.${domain}`)) ||
      IMG_CDN.test(host))
  const h = hostOf(src)
  if (!allowed(h)) return new Response('host not allowed', { status: 403 })
  let img
  try { img = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0', referer: `https://${h}/` } }) }
  catch { return new Response('origin unreachable', { status: 502 }) }
  // Re-check after redirects — a seller 30x'ing to an arbitrary host must not
  // turn this into an open proxy.
  const finalHost = hostOf(img.url)
  if (!allowed(finalHost)) return new Response('redirect off-allowlist', { status: 403 })
  const ct = img.headers.get('content-type') ?? 'image/jpeg'
  if (!img.ok) return new Response('origin error', { status: img.status })
  if (!/^image\//i.test(ct)) return new Response('not an image', { status: 502 })
  const buf = await img.arrayBuffer()
  if (env.IMAGES && ctx?.waitUntil) ctx.waitUntil(env.IMAGES.put(key, buf, { httpMetadata: { contentType: ct } }))
  return new Response(buf, { headers: { ...cacheHeaders, 'content-type': ct, 'x-img': 'origin' } })
}

// --------------------------------------------------------------------- API
async function api(request, url, env, ep, actor) {
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}

  if (ep === 'run' && request.method === 'POST') {
    const res = await runSlice(env, 'manual')
    await audit(env, actor, 'run-slice', 'jobs', '', res).run?.()
    return json(res)
  }

  if (ep === 'review') {
    const counts = {}
    for (const r of await all(env, `SELECT review_status s, COUNT(*) n FROM sku WHERE flagged IS NULL AND dead=0 GROUP BY review_status`)) counts[r.s] = r.n
    counts.flagged = (await one(env, `SELECT COUNT(*) n FROM sku WHERE flagged IS NOT NULL AND json_extract(flagged,'$.kind')!='missing' AND dead=0`))?.n ?? 0
    counts.missing = (await one(env, `SELECT COUNT(*) n FROM sku WHERE json_extract(flagged,'$.kind')='missing' AND dead=0`))?.n ?? 0
    counts.removed = (await one(env, `SELECT COUNT(*) n FROM sku WHERE dead=1`))?.n ?? 0
    const sources = await all(env, 'SELECT id FROM source ORDER BY id')
    const allCats = await categories(env)
    const cat = allCats.find((c) => c.id === url.searchParams.get('cat')) ?? allCats[0]
    const specFields = JSON.parse(cat?.spec_schema ?? '[]')
    const triage = JSON.parse(cat?.triage ?? '{}')
    const configs = JSON.parse(cat?.configs ?? '[]')

    const status = url.searchParams.get('status') ?? 'new'
    const stock = url.searchParams.get('stock') ?? 'in'
    const src = url.searchParams.get('src') ?? ''
    // status-only base (dead/flag semantics); stock + seller layer on top so the
    // pill counts can vary one dimension while respecting the others.
    let statusWhere, statusParams
    if (status === 'flagged') {
      statusWhere = `k.flagged IS NOT NULL AND json_extract(k.flagged,'$.kind')!='missing' AND k.dead=0`
      statusParams = []
    } else if (status === 'missing') {
      statusWhere = `json_extract(k.flagged,'$.kind')='missing' AND k.dead=0`
      statusParams = []
    } else if (status === 'removed') {
      statusWhere = `k.dead=1`
      statusParams = []
    } else {
      statusWhere = `k.review_status=? AND k.flagged IS NULL AND k.dead=0`
      statusParams = [status]
    }
    const stockClause = status === 'new' ? (stock === 'in' ? ' AND k.in_stock=1' : stock === 'out' ? ' AND (k.in_stock IS NULL OR k.in_stock=0)' : '') : ''
    // seller counts (respect status + stock, vary seller)
    const srcCounts = {}
    for (const r of await all(env, `SELECT k.source_id s, COUNT(*) n FROM sku k WHERE ${statusWhere}${stockClause} GROUP BY k.source_id`, ...statusParams)) srcCounts[r.s] = r.n
    // stock counts (respect status + seller, vary stock) — only meaningful for 'new'
    const stockCounts = {}
    if (status === 'new') {
      const sc = src ? ' AND k.source_id=?' : ''
      for (const r of await all(env, `SELECT CASE WHEN k.in_stock=1 THEN 'in' ELSE 'out' END b, COUNT(*) n FROM sku k WHERE ${statusWhere}${sc} GROUP BY b`, ...statusParams, ...(src ? [src] : []))) stockCounts[r.b] = r.n
      stockCounts.all = (stockCounts.in ?? 0) + (stockCounts.out ?? 0)
    }
    let where = statusWhere + stockClause
    const params = [...statusParams]
    if (src) {
      where += ' AND k.source_id=?'
      params.push(src)
    }
    const RPAGE = 40
    const rpage = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const skus = await all(env, `SELECT k.*, mm.brand || ' ' || mm.name AS master FROM sku k
       LEFT JOIN offer o ON o.sku_id=k.id LEFT JOIN master_model mm ON mm.id=o.master_model_id
       WHERE ${where} GROUP BY k.id ORDER BY k.first_seen DESC LIMIT ? OFFSET ?`, ...params, RPAGE, (rpage - 1) * RPAGE)

    const masters = await all(env, `SELECT id, brand, name, brand_norm, name_norm FROM master_model LIMIT 400`)
    const score = (t = '') => {
      const lc = t.toLowerCase()
      let s = 0
      if ((triage.include ?? []).some((w) => lc.includes(w))) s += 2
      if ((triage.exclude ?? []).some((w) => lc.includes(w))) s -= 3
      return s
    }
    // Brand knowledge is DATA (category.triage.brands), not code. House-brand
    // shops are derived, not listed: a brand whose slug equals a source id IS
    // that seller's own storefront, so its unlabeled products carry its brand.
    const KNOWN = triage.brands ?? []
    const houseBrandOf = (srcId) => KNOWN.find((b) => slugify(b) === srcId) ?? ''
    for (const k of skus) {
      k.score = score(k.title)
      const t = k.title ?? ''
      // The enrich job's stored guess (product-page fetch + optional Workers
      // AI) wins; title heuristics are the fallback for not-yet-enriched skus.
      let stored = null
      try {
        stored = k.guess ? JSON.parse(k.guess) : null
      } catch {}
      // Brand: known brand in the title → that; house-brand shop → the shop;
      // otherwise leave EMPTY for the owner rather than guessing the first
      // word (which produced brands like "Batman" and "1000mm").
      const brand =
        stored?.brand ||
        (KNOWN.find((b) => new RegExp(b.replace(/[-\s]/g, '.?'), 'i').test(t)) ??
          houseBrandOf(k.source_id))
      // Name: the title minus any leading brand token — never "Batman Batman".
      // SEO tails cut only at SPACED separators (bare hyphens are model names).
      let name = t.replace(/\s+[|–—-]\s+[^|]*$/i, '').trim()
      if (brand) {
        const rx = new RegExp('^' + brand.replace(/[-\s]/g, '[-\\s]?') + '[\\s:–—-]*', 'i')
        name = name.replace(rx, '').trim() || name
      }
      if (stored?.name) name = stored.name
      const span = stored?.spanMM ?? (t.match(/(\d{3,4})\s*mm/i)?.[1] ?? '')
      k.guess = {
        brand,
        name: name.slice(0, 60),
        slug: slugify((brand ? brand + ' ' : '') + name),
        specs: { spanMM: span },
        config: stored?.config,
        kind: stored?.kind,
        via: stored?.via,
      }
      const tn = normName(t)
      k.suggestions = masters
        .map((mm) => ({ ...mm, s: tn.includes(mm.name_norm) ? 2 : mm.name_norm.split(' ').filter((w) => w.length > 2 && tn.includes(w)).length }))
        .filter((mm) => mm.s >= 2)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
    }
    return json({ counts, srcCounts, stockCounts, sources, skus, specFields, cat: { id: cat?.id, configs }, page: rpage, pageSize: RPAGE })
  }

  if (ep === 'decide' && request.method === 'POST') {
    const k = await one(env, 'SELECT * FROM sku WHERE id=?', body.skuId)
    if (!k) return json({ error: 'unknown sku' }, 404)
    const t = now()

    if (body.action === 'reject') {
      await batch(env, [
        q(env, `UPDATE sku SET review_status='rejected', reject_reason=?, reviewed_at=? WHERE id=?`, body.reason ?? 'junk', t, k.id),
        audit(env, actor, 'reject', 'sku', k.id, { reason: body.reason }),
      ])
      return json({ ok: true })
    }
    if (body.action === 'restore') {
      await batch(env, [
        q(env, `UPDATE sku SET review_status='new', reject_reason=NULL, reviewed_at=NULL WHERE id=?`, k.id),
        audit(env, actor, 'restore', 'sku', k.id),
      ])
      return json({ ok: true })
    }
    if (body.action === 'unflag') {
      // accept the observed change: clear the flag; next verify pass republishes
      await batch(env, [q(env, `UPDATE sku SET flagged=NULL, last_checked=NULL WHERE id=?`, k.id), audit(env, actor, 'unflag', 'sku', k.id)])
      return json({ ok: true })
    }
    if (body.action === 'confirm-gone') {
      // Owner confirms a flagged-missing product really is gone → remove it from
      // the live site (dead=1). The row + price history stay for the record and
      // it can be brought back via restore-live. Never a hard delete.
      await batch(env, [q(env, `UPDATE sku SET dead=1, flagged=NULL, reviewed_at=? WHERE id=?`, now(), k.id), audit(env, actor, 'confirm-gone', 'sku', k.id)])
      return json({ ok: true })
    }
    if (body.action === 'restore-live') {
      // Bring a removed product back (owner spotted it relisted, or the
      // auto-404 was wrong). Resets the miss counter so verify re-checks fresh.
      await batch(env, [q(env, `UPDATE sku SET dead=0, misses=0, flagged=NULL, last_checked=NULL WHERE id=?`, k.id), audit(env, actor, 'restore-live', 'sku', k.id)])
      return json({ ok: true })
    }
    if (body.action === 'unapprove') {
      await batch(env, [
        q(env, `DELETE FROM offer WHERE sku_id=?`, k.id),
        q(env, `UPDATE sku SET review_status='new', reviewed_at=NULL, flagged=NULL WHERE id=?`, k.id),
        audit(env, actor, 'unapprove', 'sku', k.id),
      ])
      return json({ ok: true })
    }
    if (body.action === 'attach') {
      const mm = await one(env, 'SELECT id FROM master_model WHERE id=?', body.masterId)
      if (!mm) return json({ error: 'unknown master' }, 404)
      await batch(env, [
        q(env, `INSERT OR IGNORE INTO offer (sku_id, master_model_id, config, pack_qty, created_at) VALUES (?,?,?,?,?)`, k.id, mm.id, body.config ?? 'kit', body.packQty ?? 1, t),
        q(env, `UPDATE sku SET review_status='approved', reviewed_at=? WHERE id=?`, t, k.id),
        // snapshot the good price at approval → a guaranteed D1 recovery point
        q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) VALUES (?,?,?,?,?)`, k.id, t, null, k.price_inr, k.in_stock),
        audit(env, actor, 'approve-attach', 'sku', k.id, { master: mm.id }),
      ])
      await setMasterPower(env, mm.id)
      return json({ ok: true })
    }
    if (body.action === 'approve') {
      const m = body.master ?? {}
      if (!m.brand || !m.name || !m.slug || !/^[a-z0-9-]{3,60}$/.test(m.slug)) return json({ error: 'brand, name and a valid slug are required' }, 400)
      const specs = JSON.stringify(m.specs ?? {})
      // Category comes from the sku's source_url mapping (or an explicit
      // body.categoryId override) — never hardcoded in code.
      const catId =
        body.categoryId ??
        (await one(env, `SELECT category_id AS c FROM source_url_category WHERE source_url_id=?`, k.source_url_id))?.c
      if (!catId || !(await categories(env)).some((c) => c.id === catId)) return json({ error: 'sku has no category mapping — pass categoryId' }, 400)
      // one atomic batch: create draft master (slug is the natural key), offer
      // via subselect, approve, audit — no orphan states possible.
      try {
        await batch(env, [
          q(env, `INSERT INTO master_model (category_id, slug, brand, name, brand_norm, name_norm, specs, hero_image, status, created_at, updated_at)
                  VALUES (?, ?,?,?,?,?,?,?, 'draft', ?, ?)`,
            catId, m.slug, m.brand, m.name, normName(m.brand), normName(m.name), specs, k.image_url, t, t),
          q(env, `INSERT INTO offer (sku_id, master_model_id, config, pack_qty, created_at)
                  SELECT ?, id, ?, ?, ? FROM master_model WHERE category_id=? AND slug=?`, k.id, body.config ?? 'kit', body.packQty ?? 1, t, catId, m.slug),
          q(env, `UPDATE sku SET review_status='approved', reviewed_at=? WHERE id=?`, t, k.id),
          // snapshot the good price at approval → a guaranteed D1 recovery point
          q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) VALUES (?,?,?,?,?)`, k.id, t, null, k.price_inr, k.in_stock),
          audit(env, actor, 'approve-new-master', 'sku', k.id, { slug: m.slug }),
        ])
      } catch (e) {
        if (/UNIQUE/.test(String(e))) return json({ error: 'a master with that slug or brand+name already exists — use its suggestion button instead' }, 409)
        throw e
      }
      const created = await one(env, `SELECT id FROM master_model WHERE category_id=? AND slug=?`, catId, m.slug)
      if (created) await setMasterPower(env, created.id)
      return json({ ok: true, note: 'master created as DRAFT — publish it from the Catalog tab once specs are complete' })
    }
    return json({ error: `unknown action "${body.action}"` }, 400)
  }

  if (ep === 'sources' && request.method === 'GET') {
    const cats = await categories(env)
    const urls = await all(env, `SELECT su.*, s.platform, GROUP_CONCAT(suc.category_id) AS cats
      FROM source_url su JOIN source s ON s.id=su.source_id
      LEFT JOIN source_url_category suc ON suc.source_url_id=su.id
      GROUP BY su.id ORDER BY su.source_id`)
    return json({ categories: cats, urls })
  }

  if (ep === 'sources' && request.method === 'POST') {
    const raw = body.url
    const canon = canonicalUrl(raw)
    if (!canon) return json({ error: 'not a valid URL' }, 400)
    // Categories are caller-supplied and validated — no default category in code.
    const knownCats = await categories(env)
    const catIds = (body.categories ?? []).filter((c) => knownCats.some((x) => x.id === c))
    if (!catIds.length) return json({ error: 'pick at least one category' }, 400)
    const host = hostOf(canon)
    const sourceId = host.split('.')[0].replace(/[^a-z0-9-]/g, '')
    const home = `https://${new URL(canon).hostname}`
    // probe platform
    let platform = 'html'
    // Probe at the ORIGIN — building /products.json off a canon that carries a
    // query (?currency=…) produced a malformed URL that could false-detect.
    if (await probeOk(`${home}/wp-json/wc/store/v1/products?per_page=1`)) platform = 'woocommerce'
    else if (await probeOk(`${home}/products.json?limit=1`)) platform = 'shopify'
    else {
      const doc = (await getHtml(canon)) ?? ''
      if (/zoho/i.test(doc)) platform = 'zoho'
      else if (/\/skin\/frontend\/|var BLANK_URL|Mage\.Cookies|Magento/i.test(doc)) platform = 'magento'
      else if (/static\.wixstatic\.com|_wixCIDX|wixBiSession|wix-code/i.test(doc)) platform = 'wix'
    }
    const t = now()
    const src = { id: sourceId, platform, home_url: home }
    // dry-run BEFORE saving — a broken root is rejected at add-time
    const dry = await feedPage(src, canon, null)
    if (dry.error) return json({ error: `dry-run failed: ${dry.error}` }, 400)
    if (!dry.products?.length) return json({ error: 'dry-run found 0 products — wrong URL?' }, 400)
    const stmts = [
      q(env, `INSERT INTO source (id, name, home_url, platform, created_at, updated_at) VALUES (?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET platform=excluded.platform, updated_at=excluded.updated_at`, sourceId, host, home, platform, t, t),
      q(env, `INSERT OR IGNORE INTO source_url (source_id, url_canonical, url_raw, status, added_by, created_at) VALUES (?,?,?,?,?,?)`, sourceId, canon, raw, 'active', actor, t),
      // category mappings ride the same atomic batch (subselect on the natural
      // key) — no window where a source_url exists without its categories
      ...catIds.map((c) =>
        q(env, `INSERT OR IGNORE INTO source_url_category (source_url_id, category_id) SELECT id, ? FROM source_url WHERE url_canonical=?`, c, canon)),
      audit(env, actor, 'add-source-url', 'source_url', canon, { platform, found: dry.products.length, subtree: dry.subtree ?? 1 }),
    ]
    await batch(env, stmts)
    const su = await one(env, 'SELECT * FROM source_url WHERE url_canonical=?', canon)
    // Seed the dry-run's first page straight into the review queue — adding a
    // source is scanning it. The REST of the subtree (more pages, child
    // categories) arrives via the job slices; last_scan_at stays NULL so the
    // next slice restarts the sweep and walks it all.
    const spent = { fetches: 0, statements: 0, products: 0 }
    const seeded = await upsertProducts(env, su, dry.products, spent)
    return json({ ok: true, platform, found: dry.products.length, seeded: seeded.inserted, subtree: dry.subtree ?? 1 })
  }

  if (ep === 'source-url' && request.method === 'POST') {
    await batch(env, [
      q(env, 'UPDATE source_url SET status=? WHERE id=?', body.status, body.id),
      audit(env, actor, 'source-url-status', 'source_url', body.id, { status: body.status }),
    ])
    return json({ ok: true })
  }

  if (ep === 'catalog') {
    const cats = await categories(env)
    const PAGE = 50
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const anomalyOnly = url.searchParams.get('anomaly') === '1'
    const sort = url.searchParams.get('sort') === 'pop' ? 'pop' : 'updated'
    const where = anomalyOnly ? 'WHERE m.anomaly IS NOT NULL' : ''
    // Popularity sort: highest pop_score first, never-polled (NULL) last — this
    // is the ADMIN preview of the sort before it's exposed to customers.
    const orderBy = sort === 'pop' ? 'ORDER BY m.pop_score IS NULL, m.pop_score DESC' : 'ORDER BY m.updated_at DESC'
    const total = (await one(env, `SELECT COUNT(*) n FROM master_model m ${where}`))?.n ?? 0
    const anomalyCount = (await one(env, `SELECT COUNT(*) n FROM master_model WHERE anomaly IS NOT NULL`))?.n ?? 0
    const popCoverage = sort === 'pop'
      ? await one(
        env,
        `WITH visible AS (
           SELECT m.id,m.pop_score,m.pop_updated_at
           FROM master_model m
           JOIN offer o ON o.master_model_id=m.id
           JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
           WHERE m.status='ready'
           GROUP BY m.id
           HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END)=1
         )
         SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN pop_score IS NOT NULL THEN 1 ELSE 0 END),0) AS scored,
                COALESCE(SUM(CASE WHEN pop_score>0 THEN 1 ELSE 0 END),0) AS nonzero,
                COALESCE(SUM(CASE WHEN pop_score=0 THEN 1 ELSE 0 END),0) AS zero,
                COALESCE(SUM(CASE WHEN pop_score IS NULL THEN 1 ELSE 0 END),0) AS unscored,
                MAX(pop_updated_at) AS last_poll
         FROM visible`,
      )
      : null
    const masters = await all(env, `SELECT m.*, COUNT(o.sku_id) AS offers,
        SUM(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS live_offers
      FROM master_model m LEFT JOIN offer o ON o.master_model_id=m.id
      LEFT JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
      ${where} GROUP BY m.id ${orderBy} LIMIT ? OFFSET ?`, PAGE, (page - 1) * PAGE)
    for (const m of masters) m.path = `${cats.find((c) => c.id === m.category_id)?.path_prefix ?? ''}/${m.slug}/`
    // Attach the matched YouTube videos — only for the popularity view, so the
    // ordinary Catalog tab never touches master_video (top by views; excluded
    // ones last so admin can still see and reconsider them).
    if (sort === 'pop' && masters.length) {
      const ids = masters.map((m) => m.id)
      const vids = await all(env, `SELECT master_model_id, video_id, title, channel, views, published_at, pinned, excluded
        FROM master_video WHERE master_model_id IN (${ids.map(() => '?').join(',')})
        ORDER BY excluded ASC, views DESC`, ...ids)
      const byMaster = {}
      for (const v of vids) (byMaster[v.master_model_id] ??= []).push(v)
      for (const m of masters) m.videos = (byMaster[m.id] || []).slice(0, 6)
    }
    return json({ masters, page, total, pageSize: PAGE, anomalyCount, sort, popCoverage })
  }

  if (ep === 'master' && request.method === 'POST') {
    const m = await one(env, 'SELECT m.*, c.spec_schema FROM master_model m JOIN category c ON c.id=m.category_id WHERE m.id=?', body.id)
    if (!m) return json({ error: 'unknown master' }, 404)
    if (body.status === 'ready') {
      const req = JSON.parse(m.spec_schema).filter((f) => f.required).map((f) => f.key)
      const specs = JSON.parse(body.specs ?? m.specs ?? '{}')
      const missing = req.filter((k2) => specs[k2] == null || specs[k2] === '')
      if (missing.length) return json({ error: `cannot publish: missing required spec(s): ${missing.join(', ')}` }, 400)
    }
    await batch(env, [
      q(env, `UPDATE master_model SET brand=COALESCE(?, brand), name=COALESCE(?, name),
              brand_norm=COALESCE(?, brand_norm), name_norm=COALESCE(?, name_norm),
              blurb=COALESCE(?, blurb), specs=COALESCE(?, specs), status=COALESCE(?, status),
              anomaly=CASE WHEN ? IS NOT NULL THEN NULL ELSE anomaly END, updated_at=? WHERE id=?`,
        body.brand ?? null, body.name ?? null,
        body.brand ? normName(body.brand) : null, body.name ? normName(body.name) : null,
        body.blurb ?? null, body.specs ?? null, body.status ?? null, body.brand ?? null, now(), body.id),
      audit(env, actor, 'master-update', 'master_model', body.id, body),
    ])
    catCache.at = 0
    return json({ ok: true })
  }

  // Spike: can a REAL browser (Browser Rendering) reach a WAF-protected
  // seller the plain Worker fetch cannot? Admin-gated, read-only.
  if (ep === 'browser-test' && request.method === 'POST') {
    if (!env.BROWSER) return json({ error: 'browser binding unavailable on this deployment' }, 501)
    const target = canonicalUrl(body.url)
    if (!target) return json({ error: 'bad url' }, 400)
    let browser
    try {
      browser = await puppeteer.launch(env.BROWSER)
      const pg = await browser.newPage()
      const resp = await pg.goto(target, { waitUntil: 'domcontentloaded', timeout: 25000 })
      const html = await pg.content()
      const title = await pg.title()
      return json({
        status: resp?.status() ?? null,
        title: title.slice(0, 120),
        bytes: html.length,
        addToCartHits: (html.match(/add[\s-]*to[\s-]*cart/gi) ?? []).length,
        productLinks: [...new Set([...html.matchAll(/href="([^"]*\/product\/[^"]+)"/g)].map((m) => m[1]))].length,
      })
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 200) }, 502)
    } finally {
      try {
        await browser?.close()
      } catch {}
    }
  }

  if (ep === 'duplicates' && request.method === 'GET') {
    const cats = await categories(env)
    const rows = await all(env, `SELECT mc.id, mc.a_id, mc.b_id, mc.score, mc.reason,
        a.slug a_slug, a.brand a_brand, a.name a_name, a.status a_status, a.category_id a_cat, a.specs a_specs, a.power a_power,
        b.slug b_slug, b.brand b_brand, b.name b_name, b.status b_status, b.specs b_specs, b.power b_power
      FROM merge_candidate mc
      JOIN master_model a ON a.id=mc.a_id JOIN master_model b ON b.id=mc.b_id
      WHERE mc.status='pending' ORDER BY mc.score DESC, mc.id`)
    // Pull each involved master's actual offers (photo comes from /img/master/id)
    // so the reviewer sees seller, price and title — not just a name + score.
    const ids = [...new Set(rows.flatMap((r) => [r.a_id, r.b_id]))]
    const byMaster = {}
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80)
      const offers = await all(env, `SELECT o.master_model_id mid, k.title, k.price_inr, k.in_stock, k.dead, k.url_canonical, s.name source_name
        FROM offer o JOIN sku k ON k.id=o.sku_id JOIN source s ON s.id=k.source_id
        WHERE o.master_model_id IN (${chunk.map(() => '?').join(',')})
        ORDER BY k.dead ASC, k.price_inr ASC`, ...chunk)
      for (const o of offers) (byMaster[o.mid] ??= []).push(o)
    }
    const hasSpan = (s) => { try { return JSON.parse(s || '{}').spanMM > 0 ? 0 : 1 } catch { return 1 } }
    for (const r of rows) {
      r.prefix = cats.find((c) => c.id === r.a_cat)?.path_prefix ?? ''
      r.a_offers = byMaster[r.a_id] ?? []
      r.b_offers = byMaster[r.b_id] ?? []
      // A side is "in stock" if it has ≥1 live (non-dead, in_stock) offer.
      r.a_in_stock = r.a_offers.some((o) => o.in_stock && !o.dead)
      r.b_in_stock = r.b_offers.some((o) => o.in_stock && !o.dead)
      r.both_in_stock = r.a_in_stock && r.b_in_stock
      // Which side to KEEP: ready>draft, then more offers, then has-span, then lower id.
      const ra = [r.a_status === 'ready' ? 0 : 1, -r.a_offers.length, hasSpan(r.a_specs), r.a_id]
      const rb = [r.b_status === 'ready' ? 0 : 1, -r.b_offers.length, hasSpan(r.b_specs), r.b_id]
      let keepA = true
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) { keepA = ra[i] < rb[i]; break }
      r.keepId = keepA ? r.a_id : r.b_id
    }
    // Surface the merges that actually matter first: when BOTH masters are in
    // stock, merging changes what a shopper sees; if one side is out of stock the
    // dupe collapses to the in-stock side either way (cosmetic). Keep the finder's
    // confidence order (score DESC, then id) within each tier.
    rows.sort((x, y) => Number(y.both_in_stock) - Number(x.both_in_stock) || y.score - x.score || x.id - y.id)
    return json({ candidates: rows })
  }

  if (ep === 'merge' && request.method === 'POST') {
    const a = await one(env, 'SELECT id FROM master_model WHERE id=?', body.aId)
    const b = await one(env, 'SELECT id FROM master_model WHERE id=?', body.bId)
    if (!a || !b) return json({ error: 'unknown master' }, 404)
    await mergeMasters(env, body.aId, body.bId, actor, body.reason ?? 'owner-confirmed')
    catCache.at = 0
    return json({ ok: true })
  }

  if (ep === 'reject-merge' && request.method === 'POST') {
    await batch(env, [
      q(env, `INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at)
              VALUES (?,?,0,'owner: not duplicates','rejected',?,?)
              ON CONFLICT(a_id,b_id) DO UPDATE SET status='rejected', decided_at=excluded.decided_at`,
        Math.min(body.aId, body.bId), Math.max(body.aId, body.bId), now(), now()),
      audit(env, actor, 'reject-merge', 'master_model', body.bId, { with: body.aId }),
    ])
    return json({ ok: true })
  }

  if (ep === 'dedup-run' && request.method === 'POST') {
    const res = await dedupSlice(env, 'manual', true)
    await audit(env, actor, 'dedup-run', 'jobs', '', res ?? {}).run?.()
    return json(res ?? { note: 'no masters to compare' })
  }

  // One-time / maintenance: (re)derive power for every master from its offers.
  if (ep === 'recompute-power' && request.method === 'POST') {
    const ids = await all(env, `SELECT id FROM master_model`)
    for (const r of ids) await setMasterPower(env, r.id)
    return json({ ok: true, recomputed: ids.length })
  }

  // Re-run classifiers over STORED snapshots — no seller fetch. The stored
  // description is the chrome-free product core, so powerType is reliable on it
  // (unlike a whole-page scrape). Corrects only the trustworthy direction: a
  // product whose description reads gas but is tagged electric (a gas plane's
  // copy may omit markers, so we never flip gas→electric here).
  if (ep === 'rederive' && request.method === 'POST') {
    const rows = await all(env, `SELECT m.id, m.name, m.power, GROUP_CONCAT(sn.description, ' ') AS descs
      FROM master_model m JOIN offer o ON o.master_model_id=m.id JOIN sku_snapshot sn ON sn.sku_id=o.sku_id
      WHERE m.status IN ('ready','draft') AND sn.description IS NOT NULL GROUP BY m.id`)
    const t = now()
    const changed = []
    const stmts = []
    for (const r of rows) {
      if (r.power === 'electric' && powerType((r.name || '') + ' ' + (r.descs || '')) === 'gas') {
        changed.push({ id: r.id, name: r.name })
        stmts.push(q(env, `UPDATE master_model SET power='gas', updated_at=? WHERE id=?`, t, r.id))
      }
    }
    if (stmts.length) { stmts.push(audit(env, actor, 'rederive-power', 'jobs', '', { changed: changed.length })); await batch(env, stmts) }
    return json({ ok: true, snapshotsWithDesc: rows.length, changedToGas: changed.length, changed })
  }

  // ---- manufacturer-match review (admin-only; no consumer surface) ----
  if (ep === 'mfr-matches' && request.method === 'GET') {
    const status = url.searchParams.get('status') || 'pending'
    const rows = await all(
      env,
      `SELECT mm.master_model_id, mm.mfr_product_id, mm.score, mm.span_agree, mm.tier, mm.status,
              mm.note,
              m.brand, m.name, m.slug, m.specs, m.power, m.role_tags, c.path_prefix,
              COALESCE(m.hero_image,
                (SELECT k.image_url FROM offer oi JOIN sku k ON k.id=oi.sku_id
                 WHERE oi.master_model_id=m.id AND k.image_url IS NOT NULL
                 ORDER BY k.dead ASC, k.in_stock DESC LIMIT 1)) AS model_image,
              (SELECT GROUP_CONCAT(DISTINCT oc.config)
               FROM offer oc JOIN sku kc ON kc.id=oc.sku_id
               WHERE oc.master_model_id=m.id
                 AND kc.review_status='approved' AND kc.dead=0) AS model_configs,
              p.ext_id AS mfr_ext_id, p.title AS mfr_title, p.url AS mfr_url,
              p.span_mm AS mfr_span, p.image_urls,
              substr(p.body_text,1,800) AS body_preview, length(p.body_text) AS body_len,
              mf.brand AS mfr_brand, mf.domain, mf.strategy
       FROM mfr_match mm
       JOIN master_model m ON m.id=mm.master_model_id
       JOIN category c ON c.id=m.category_id
       LEFT JOIN mfr_product p ON p.id=mm.mfr_product_id
       LEFT JOIN manufacturer mf ON mf.id=p.manufacturer_id
       WHERE mm.status=?
       ORDER BY CASE mm.tier WHEN 'review' THEN 0 WHEN 'accept' THEN 1 ELSE 2 END, mm.score DESC
       LIMIT 500`,
      status,
    )
    const candidateRows = await all(
      env,
      `SELECT mc.master_model_id,mc.mfr_product_id,mc.rank,mc.score,mc.name_score,
              mc.span_agree,mc.tier,mc.reason,
              p.ext_id,p.title,p.url,p.span_mm,p.image_urls,
              substr(p.body_text,1,800) AS body_preview,length(p.body_text) AS body_len,
              mf.brand AS mfr_brand,mf.domain,mf.strategy
       FROM mfr_candidate mc
       JOIN mfr_match mm ON mm.master_model_id=mc.master_model_id
       JOIN mfr_product p ON p.id=mc.mfr_product_id
       JOIN manufacturer mf ON mf.id=p.manufacturer_id
       WHERE mm.status=?
       ORDER BY mc.master_model_id,mc.rank
       LIMIT 2500`,
      status,
    )
    const candidatesByMaster = {}
    for (const candidate of candidateRows)
      (candidatesByMaster[candidate.master_model_id] ??= []).push(candidate)
    const configFacts = (title, bodyPreview, modelConfigs) => {
      const fromTitle = configTypes(title)
      const types = fromTitle.length ? fromTitle : configTypes(bodyPreview)
      return { types, agree: configAgreement(modelConfigs, types) }
    }
    for (const row of rows) {
      const candidates = candidatesByMaster[row.master_model_id] ?? []
      for (const candidate of candidates) {
        const facts = configFacts(candidate.title, candidate.body_preview, row.model_configs)
        candidate.config_types = facts.types
        candidate.config_agree = facts.agree
      }
      // A manual mapping is immutable, while the computed top-five candidates
      // are replaceable. Keep that saved SKU visible even if it later falls out
      // of the candidate set.
      if (row.status === 'accepted' && row.mfr_product_id &&
          !candidates.some((candidate) => +candidate.mfr_product_id === +row.mfr_product_id)) {
        const facts = configFacts(row.mfr_title, row.body_preview, row.model_configs)
        candidates.unshift({
          master_model_id: row.master_model_id,
          mfr_product_id: row.mfr_product_id,
          rank: 0,
          score: row.score,
          name_score: null,
          span_agree: row.span_agree,
          tier: row.tier,
          reason: 'currently saved mapping',
          ext_id: row.mfr_ext_id,
          title: row.mfr_title,
          url: row.mfr_url,
          span_mm: row.mfr_span,
          image_urls: row.image_urls,
          body_preview: row.body_preview,
          body_len: row.body_len,
          mfr_brand: row.mfr_brand,
          domain: row.domain,
          strategy: row.strategy,
          config_types: facts.types,
          config_agree: facts.agree,
          is_current: 1,
        })
      }
      const current = configFacts(row.mfr_title, row.body_preview, row.model_configs)
      row.mfr_config_types = current.types
      row.config_agree = current.agree
      row.candidates = candidates
    }
    const counts = {}
    for (const r of await all(env, `SELECT status, COUNT(*) n FROM mfr_match GROUP BY status`)) counts[r.status] = r.n
    const harvest = await all(
      env,
      `SELECT id,brand,domain,strategy,last_harvest_at,last_harvest_status,last_harvest_note
       FROM manufacturer ORDER BY brand`,
    )
    return json({ matches: rows, counts, harvest })
  }

  if (ep === 'mfr-decide' && request.method === 'POST') {
    if (!body.masterId) return json({ error: 'need masterId + decision' }, 400)
    if (body.decision === 'accept') {
      let candidate = await one(
        env,
        `SELECT * FROM mfr_candidate WHERE master_model_id=? AND mfr_product_id=?`,
        body.masterId,
        body.mfrProductId,
      )
      // Re-saving an existing human decision is safe even when a later rebuild
      // has dropped that product from the replaceable top-five candidate table.
      if (!candidate)
        candidate = await one(
          env,
          `SELECT mfr_product_id,score,span_agree,tier,note AS reason
           FROM mfr_match
           WHERE master_model_id=? AND mfr_product_id=?
             AND status='accepted' AND decided_at IS NOT NULL`,
          body.masterId,
          body.mfrProductId,
        )
      if (!candidate) return json({ error: 'manufacturer SKU is not a candidate for this model' }, 400)
      await run(
        env,
        `UPDATE mfr_match
         SET mfr_product_id=?,score=?,span_agree=?,tier=?,status='accepted',
             note=?,decided_by=?,decided_at=?,updated_at=?
         WHERE master_model_id=?`,
        candidate.mfr_product_id,
        candidate.score,
        candidate.span_agree,
        candidate.tier,
        candidate.reason,
        actor,
        now(),
        now(),
        body.masterId,
      )
    } else if (body.decision === 'reject') {
      await run(
        env,
        `UPDATE mfr_match SET status='rejected',decided_by=?,decided_at=?,updated_at=? WHERE master_model_id=?`,
        actor,
        now(),
        now(),
        body.masterId,
      )
    } else if (body.decision === 'reopen') {
      await run(
        env,
        `UPDATE mfr_match SET status='pending',decided_by=NULL,decided_at=NULL,updated_at=? WHERE master_model_id=?`,
        now(),
        body.masterId,
      )
    } else {
      return json({ error: 'decision must be accept, reject, or reopen' }, 400)
    }
    await audit(env, actor, 'mfr-' + body.decision, 'mfr_match', body.masterId, {}).run?.()
    return json({ ok: true })
  }

  if (ep === 'mfr-rebuild' && request.method === 'POST') {
    const manufacturer = await one(env, `SELECT * FROM manufacturer WHERE id=?`, body.manufacturerId)
    if (!manufacturer) return json({ error: 'unknown manufacturer' }, 404)
    const result = await rebuildManufacturerMatches(env, manufacturer, now())
    await audit(env, actor, 'mfr-rebuild', 'manufacturer', manufacturer.id, result).run?.()
    return json({ ok: true, manufacturer: manufacturer.brand, ...result })
  }

  if (ep === 'mfr-rebuild-all' && request.method === 'POST') {
    const result = await rebuildAllManufacturerMatches(env, now())
    await audit(env, actor, 'mfr-rebuild-all', 'manufacturer', 'all', result).run?.()
    return json({ ok: true, ...result })
  }

  if (ep === 'mfr-harvest' && request.method === 'POST') {
    try {
      const result = await enqueueManufacturerHarvests(env, {
        manufacturerId: body.manufacturerId,
        trigger: 'admin',
      })
      await audit(env, actor, 'mfr-harvest-queued', 'manufacturer', body.manufacturerId || 'all', result).run?.()
      return json({ ok: true, ...result })
    } catch (error) {
      if (error?.message === 'unknown manufacturer') return json({ error: error.message }, 404)
      throw error
    }
  }

  if (ep === 'system' && request.method === 'GET') {
    const settings = {}
    for (const r of await all(env, 'SELECT k, v FROM setting')) settings[r.k] = r.v
    const auditRows = await all(env, 'SELECT * FROM audit ORDER BY id DESC LIMIT 25')
    // Source health: last scan + verify recency and live/flagged/removed counts,
    // so a systematic block or drift is visible instead of silent.
    const scans = await all(env, `SELECT source_id, MAX(last_scan_at) last_scan FROM source_url GROUP BY source_id`)
    const counts = await all(env, `SELECT source_id,
        SUM(CASE WHEN review_status='approved' AND dead=0 THEN 1 ELSE 0 END) live,
        SUM(CASE WHEN flagged IS NOT NULL THEN 1 ELSE 0 END) flagged,
        SUM(CASE WHEN dead=1 THEN 1 ELSE 0 END) removed,
        MIN(CASE WHEN review_status='approved' AND dead=0 THEN last_checked END) oldest_verify
      FROM sku GROUP BY source_id`)
    const byId = {}
    for (const r of scans) byId[r.source_id] = { source_id: r.source_id, last_scan: r.last_scan }
    for (const r of counts) byId[r.source_id] = { ...(byId[r.source_id] ?? { source_id: r.source_id }), ...r }
    return json({ settings, audit: auditRows, health: Object.values(byId).sort((a, b) => (a.source_id < b.source_id ? -1 : 1)) })
  }
  if (ep === 'system' && request.method === 'POST') {
    if (!/^(scan|verify|enrich|dedup|classify|warm|popularity|mfr)_paused$/.test(body.k)) return json({ error: 'unknown setting' }, 400)
    await setSetting(env, body.k, body.v)
    await audit(env, actor, 'setting', 'setting', body.k, { v: body.v }).run?.()
    return json({ ok: true })
  }

  return json({ error: 'no route' }, 404)
}

const probeOk = async (u) => {
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' }, signal: AbortSignal.timeout(6000) })
    if (!r.ok) return false
    const d = await r.json()
    return Array.isArray(d) ? true : Array.isArray(d?.products)
  } catch {
    return false
  }
}

export function catalogScheduled(event, env, ctx) {
  if (event.cron === '*/15 * * * *') ctx.waitUntil(runSlice(env, 'cron'))
  // One weekly trigger fans out bounded queue jobs. Each manufacturer page
  // receives a fresh subrequest budget without waking this Worker hourly.
  else if (event.cron === MFR_WEEKLY_CRON)
    ctx.waitUntil(enqueueManufacturerHarvests(env, { trigger: 'cron' }))
  // Hourly: push changed in-stock URLs to Bing/Yandex via IndexNow. Kept off the
  // */15 tick so it never competes with the pipeline for the subrequest budget.
  else if (event.cron === '0 * * * *') ctx.waitUntil(indexNowPing(env))
}
