// Catalog worker: public pages from D1, admin panel + API behind HTTP Basic
// auth, image proxy, and the */15 job-slice dispatcher.

import puppeteer from '@cloudflare/puppeteer'
import { CSS } from './styles.mjs'
import { ADMIN_HTML } from './admin-ui.mjs'
import { renderGrid, renderMaster, powerType } from './public.mjs'
import { runSlice, upsertProducts, mergeMasters, dedupSlice } from './jobs.mjs'
import { getHtml, ogImageFrom, feedPage } from './adapters.mjs'
import { all, one, run, batch, q, getSetting, setSetting, audit } from './db.mjs'
import { json, esc, now, canonicalUrl, hostOf, slugify, normName, basicAuth, challenge } from './util.mjs'

// --- categories cache (per-isolate, 60s) — saves a D1 query on most requests
let catCache = { at: 0, rows: [] }
async function categories(env) {
  if (now() - catCache.at > 60e3) catCache = { at: now(), rows: await all(env, 'SELECT * FROM category') }
  return catCache.rows
}

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' } })

export async function handleCatalog(request, url, env, ctx) {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (!env.CATALOG_DB) return null

  if (path === '/catalog.css')
    // URL is versioned (?v=<hash> in the <link>), so the bytes are immutable:
    // a CSS change ships a new URL rather than mutating this one.
    return new Response(CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' } })

  // ---- image proxy (public; host-allowlisted to registered sellers) ----
  if (path.startsWith('/img/')) return imgProxy(env, path)

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
  const cat = cats.find((c) => path === c.path_prefix || path.startsWith(c.path_prefix + '/'))
  if (!cat || !cat.live) return null

  if (path === cat.path_prefix) {
    const power = ['electric', 'gas', 'all'].includes(url.searchParams.get('power')) ? url.searchParams.get('power') : 'electric'
    const sort = ['price-desc', 'price-asc', 'span-desc', 'span-asc'].includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'price-desc'
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const counts = await gridCounts(env, cat)
    const masters = await gridMasters(env, cat, power, page, sort)
    return html(renderGrid(cat, masters, { power, page, counts, sort }))
  }

  const slug = path.slice(cat.path_prefix.length + 1)
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
      // Build recipes are DATA: matched from D1 by category + spec band.
      let span = NaN
      try {
        span = Number(JSON.parse(m.specs || '{}').spanMM)
      } catch {}
      const recipes = Number.isFinite(span) && span > 0
        ? await all(env, `SELECT * FROM recipe WHERE category_id=? AND (span_min IS NULL OR span_min<=?) AND (span_max IS NULL OR span_max>=?)`, cat.id, span, span)
        : []
      const components = {}
      const compIds = [...new Set(recipes.flatMap((r) => { try { return JSON.parse(r.picks).map((p) => p.component_id) } catch { return [] } }))]
      if (compIds.length)
        for (const c of await all(env, `SELECT * FROM component WHERE id IN (${compIds.map(() => '?').join(',')})`, ...compIds)) components[c.id] = c
      return html(renderMaster(cat, m, offers, recipes, components))
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
async function imgProxy(env, path) {
  const m = path.match(/^\/img\/(master|sku)\/(\d+)$/)
  if (!m) return new Response('bad path', { status: 400 })
  const src =
    m[1] === 'master'
      // Self-heal: a master approved from a data-poor sku gains an image the
      // moment ANY of its offers' skus gets one (scan/verify backfill).
      ? (await one(env, `SELECT COALESCE(mm.hero_image,
            (SELECT k.image_url FROM offer o JOIN sku k ON k.id=o.sku_id
             WHERE o.master_model_id=mm.id AND k.image_url IS NOT NULL ORDER BY k.dead ASC LIMIT 1)) AS u
          FROM master_model mm WHERE mm.id=?`, m[2]))?.u
      : (await one(env, 'SELECT image_url AS u FROM sku WHERE id=?', m[2]))?.u
  if (!src) return new Response('no image', { status: 404 })
  const hosts = (await all(env, 'SELECT home_url FROM source')).map((s) => hostOf(s.home_url))
  const h = hostOf(src)
  const okHost = h && (hosts.includes(h) || /(^|\.)(cdn\.shopify\.com|shopify\.com|zohocommercecdn\.com)$/.test(h))
  if (!okHost) return new Response('host not allowed', { status: 403 })
  const img = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0', referer: `https://${h}/` } })
  // Re-check after redirects — a seller 30x'ing to an arbitrary host must not
  // turn this into an open proxy. And only ever relay actual images.
  const finalHost = hostOf(img.url)
  const okFinal = finalHost && (hosts.includes(finalHost) || /(^|\.)(cdn\.shopify\.com|shopify\.com|zohocommercecdn\.com)$/.test(finalHost))
  if (!okFinal) return new Response('redirect off-allowlist', { status: 403 })
  const ct = img.headers.get('content-type') ?? 'image/jpeg'
  if (img.ok && !/^image\//i.test(ct)) return new Response('not an image', { status: 502 })
  return new Response(img.body, {
    status: img.status,
    headers: { 'content-type': ct, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' },
  })
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
    const where = anomalyOnly ? 'WHERE m.anomaly IS NOT NULL' : ''
    const total = (await one(env, `SELECT COUNT(*) n FROM master_model m ${where}`))?.n ?? 0
    const anomalyCount = (await one(env, `SELECT COUNT(*) n FROM master_model WHERE anomaly IS NOT NULL`))?.n ?? 0
    const masters = await all(env, `SELECT m.*, COUNT(o.sku_id) AS offers,
        SUM(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS live_offers
      FROM master_model m LEFT JOIN offer o ON o.master_model_id=m.id
      LEFT JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
      ${where} GROUP BY m.id ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`, PAGE, (page - 1) * PAGE)
    for (const m of masters) m.path = `${cats.find((c) => c.id === m.category_id)?.path_prefix ?? ''}/${m.slug}/`
    return json({ masters, page, total, pageSize: PAGE, anomalyCount })
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
      // Which side to KEEP: ready>draft, then more offers, then has-span, then lower id.
      const ra = [r.a_status === 'ready' ? 0 : 1, -r.a_offers.length, hasSpan(r.a_specs), r.a_id]
      const rb = [r.b_status === 'ready' ? 0 : 1, -r.b_offers.length, hasSpan(r.b_specs), r.b_id]
      let keepA = true
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) { keepA = ra[i] < rb[i]; break }
      r.keepId = keepA ? r.a_id : r.b_id
    }
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
    if (!/^(scan|verify|enrich|dedup)_paused$/.test(body.k)) return json({ error: 'unknown setting' }, 400)
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
}
