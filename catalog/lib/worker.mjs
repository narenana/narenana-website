// Catalog worker: public pages from D1, admin panel + API behind HTTP Basic
// auth, image proxy, and the */15 job-slice dispatcher.

import { CSS } from './styles.mjs'
import { ADMIN_HTML } from './admin-ui.mjs'
import { renderGrid, renderMaster } from './public.mjs'
import { runSlice } from './jobs.mjs'
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
    return new Response(CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' } })

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
    const masters = await all(
      env,
      `SELECT m.*, COUNT(DISTINCT k.source_id) AS sellers,
              MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND o.pack_qty=1 THEN k.price_inr END) AS min_price,
              MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS any_stock
       FROM master_model m
       JOIN offer o ON o.master_model_id = m.id
       JOIN sku k ON k.id = o.sku_id AND k.review_status='approved'
       WHERE m.category_id=? AND m.status='ready'
       GROUP BY m.id ORDER BY any_stock DESC, min_price ASC`,
      cat.id,
    )
    return html(renderGrid(cat, masters))
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
      return html(renderMaster(cat, m, offers))
    }
  }
  // unknown slug → category grid with 404
  const masters = await all(env, `SELECT m.*, 1 AS sellers, NULL AS min_price, 0 AS any_stock FROM master_model m WHERE category_id=? AND status='ready'`, cat.id)
  return html(renderGrid(cat, masters), 404)
}

// ---------------------------------------------------------------- img proxy
async function imgProxy(env, path) {
  const m = path.match(/^\/img\/(master|sku)\/(\d+)$/)
  if (!m) return new Response('bad path', { status: 400 })
  const src =
    m[1] === 'master'
      ? (await one(env, 'SELECT hero_image AS u FROM master_model WHERE id=?', m[2]))?.u
      : (await one(env, 'SELECT image_url AS u FROM sku WHERE id=?', m[2]))?.u
  if (!src) return new Response('no image', { status: 404 })
  const hosts = (await all(env, 'SELECT home_url FROM source')).map((s) => hostOf(s.home_url))
  const h = hostOf(src)
  const okHost = h && (hosts.includes(h) || /(^|\.)(cdn\.shopify\.com|shopify\.com|zohocommercecdn\.com)$/.test(h))
  if (!okHost) return new Response('host not allowed', { status: 403 })
  const img = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0', referer: `https://${h}/` } })
  return new Response(img.body, {
    status: img.status,
    headers: { 'content-type': img.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' },
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
    for (const r of await all(env, `SELECT review_status s, COUNT(*) n FROM sku WHERE flagged IS NULL GROUP BY review_status`)) counts[r.s] = r.n
    counts.flagged = (await one(env, `SELECT COUNT(*) n FROM sku WHERE flagged IS NOT NULL`))?.n ?? 0
    const sources = await all(env, 'SELECT id FROM source ORDER BY id')
    const cat = await one(env, `SELECT * FROM category WHERE id='wings'`)
    const specFields = JSON.parse(cat?.spec_schema ?? '[]')
    const triage = JSON.parse(cat?.triage ?? '{}')

    const status = url.searchParams.get('status') ?? 'new'
    const stock = url.searchParams.get('stock') ?? 'in'
    const src = url.searchParams.get('src') ?? ''
    let where, params
    if (status === 'flagged') {
      where = 'k.flagged IS NOT NULL'
      params = []
    } else {
      where = `k.review_status=? AND k.flagged IS NULL`
      params = [status]
      if (status === 'new') {
        if (stock === 'in') where += ' AND k.in_stock=1'
        else if (stock === 'out') where += ' AND (k.in_stock IS NULL OR k.in_stock=0)'
      }
    }
    if (src) {
      where += ' AND k.source_id=?'
      params.push(src)
    }
    const skus = await all(env, `SELECT k.*, mm.brand || ' ' || mm.name AS master FROM sku k
       LEFT JOIN offer o ON o.sku_id=k.id LEFT JOIN master_model mm ON mm.id=o.master_model_id
       WHERE ${where} GROUP BY k.id ORDER BY k.first_seen DESC LIMIT 40`, ...params)

    const masters = await all(env, `SELECT id, brand, name, brand_norm, name_norm FROM master_model LIMIT 400`)
    const score = (t = '') => {
      const lc = t.toLowerCase()
      let s = 0
      if ((triage.include ?? []).some((w) => lc.includes(w))) s += 2
      if ((triage.exclude ?? []).some((w) => lc.includes(w))) s -= 3
      return s
    }
    const KNOWN = ['Vortex-RC', 'ATOMRC', 'HEEWING', 'HEE WING', 'Skywalker', 'ZOHD', 'TBS', 'LDARC', 'MAPBIRD', 'X-UAV', 'SonicModell', 'Durafly', 'XFly', 'FMS', 'H-King']
    const madeBySource = new Set(['vortex-rc']) // house-brand shops: their products carry their brand
    for (const k of skus) {
      k.score = score(k.title)
      const t = k.title ?? ''
      // Brand: known brand in the title → that; house-brand shop → the shop;
      // otherwise leave EMPTY for the owner rather than guessing the first
      // word (which produced brands like "Batman" and "1000mm").
      const brand =
        KNOWN.find((b) => new RegExp(b.replace(/[-\s]/g, '.?'), 'i').test(t)) ??
        (madeBySource.has(k.source_id) ? 'Vortex-RC' : '')
      // Name: the title minus any leading brand token — never "Batman Batman".
      let name = t.replace(/\s*[|–—-]\s*[^|]*$/i, '').trim()
      if (brand) {
        const rx = new RegExp('^' + brand.replace(/[-\s]/g, '[-\\s]?') + '[\\s:–—-]*', 'i')
        name = name.replace(rx, '').trim() || name
      }
      const span = t.match(/(\d{3,4})\s*mm/i)?.[1] ?? ''
      k.guess = {
        brand,
        name: name.slice(0, 60),
        slug: slugify((brand ? brand + ' ' : '') + name),
        specs: { spanMM: span },
      }
      const tn = normName(t)
      k.suggestions = masters
        .map((mm) => ({ ...mm, s: tn.includes(mm.name_norm) ? 2 : mm.name_norm.split(' ').filter((w) => w.length > 2 && tn.includes(w)).length }))
        .filter((mm) => mm.s >= 2)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
    }
    return json({ counts, sources, skus, specFields })
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
        audit(env, actor, 'approve-attach', 'sku', k.id, { master: mm.id }),
      ])
      return json({ ok: true })
    }
    if (body.action === 'approve') {
      const m = body.master ?? {}
      if (!m.brand || !m.name || !m.slug || !/^[a-z0-9-]{3,60}$/.test(m.slug)) return json({ error: 'brand, name and a valid slug are required' }, 400)
      const specs = JSON.stringify(m.specs ?? {})
      // one atomic batch: create draft master (slug is the natural key), offer
      // via subselect, approve, audit — no orphan states possible.
      try {
        await batch(env, [
          q(env, `INSERT INTO master_model (category_id, slug, brand, name, brand_norm, name_norm, specs, hero_image, status, created_at, updated_at)
                  VALUES ('wings', ?,?,?,?,?,?,?, 'draft', ?, ?)`,
            m.slug, m.brand, m.name, normName(m.brand), normName(m.name), specs, k.image_url, t, t),
          q(env, `INSERT INTO offer (sku_id, master_model_id, config, pack_qty, created_at)
                  SELECT ?, id, ?, ?, ? FROM master_model WHERE category_id='wings' AND slug=?`, k.id, body.config ?? 'kit', body.packQty ?? 1, t, m.slug),
          q(env, `UPDATE sku SET review_status='approved', reviewed_at=? WHERE id=?`, t, k.id),
          audit(env, actor, 'approve-new-master', 'sku', k.id, { slug: m.slug }),
        ])
      } catch (e) {
        if (/UNIQUE/.test(String(e))) return json({ error: 'a master with that slug or brand+name already exists — use its suggestion button instead' }, 409)
        throw e
      }
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
    const host = hostOf(canon)
    const sourceId = host.split('.')[0].replace(/[^a-z0-9-]/g, '')
    const home = `https://${new URL(canon).hostname}`
    // probe platform
    let platform = 'html'
    if (await probeOk(`${home}/wp-json/wc/store/v1/products?per_page=1`)) platform = 'woocommerce'
    else if (await probeOk(`${canon.replace(/\/$/, '')}/products.json?limit=1`)) platform = 'shopify'
    else if (/zoho/i.test((await getHtml(canon)) ?? '')) platform = 'zoho'
    const t = now()
    const src = { id: sourceId, platform, home_url: home }
    // dry-run BEFORE saving — a broken root is rejected at add-time
    const dry = await feedPage(src, canon, 1)
    if (dry.error) return json({ error: `dry-run failed: ${dry.error}` }, 400)
    if (!dry.products?.length) return json({ error: 'dry-run found 0 products — wrong URL?' }, 400)
    const stmts = [
      q(env, `INSERT INTO source (id, name, home_url, platform, created_at, updated_at) VALUES (?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET platform=excluded.platform, updated_at=excluded.updated_at`, sourceId, host, home, platform, t, t),
      q(env, `INSERT OR IGNORE INTO source_url (source_id, url_canonical, url_raw, status, added_by, created_at) VALUES (?,?,?,?,?,?)`, sourceId, canon, raw, 'active', actor, t),
      audit(env, actor, 'add-source-url', 'source_url', canon, { platform, found: dry.products.length }),
    ]
    await batch(env, stmts)
    const su = await one(env, 'SELECT id FROM source_url WHERE url_canonical=?', canon)
    for (const c of body.categories ?? ['wings'])
      await run(env, 'INSERT OR IGNORE INTO source_url_category (source_url_id, category_id) VALUES (?,?)', su.id, c)
    return json({ ok: true, platform, found: dry.products.length })
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
    const masters = await all(env, `SELECT m.*, COUNT(o.sku_id) AS offers,
        SUM(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) AS live_offers
      FROM master_model m LEFT JOIN offer o ON o.master_model_id=m.id
      LEFT JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
      GROUP BY m.id ORDER BY m.updated_at DESC LIMIT 200`)
    for (const m of masters) m.path = `${cats.find((c) => c.id === m.category_id)?.path_prefix ?? ''}/${m.slug}/`
    return json({ masters })
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
              blurb=COALESCE(?, blurb), specs=COALESCE(?, specs), status=COALESCE(?, status), updated_at=? WHERE id=?`,
        body.brand ?? null, body.name ?? null,
        body.brand ? normName(body.brand) : null, body.name ? normName(body.name) : null,
        body.blurb ?? null, body.specs ?? null, body.status ?? null, now(), body.id),
      audit(env, actor, 'master-update', 'master_model', body.id, body),
    ])
    catCache.at = 0
    return json({ ok: true })
  }

  if (ep === 'system' && request.method === 'GET') {
    const settings = {}
    for (const r of await all(env, 'SELECT k, v FROM setting')) settings[r.k] = r.v
    const auditRows = await all(env, 'SELECT * FROM audit ORDER BY id DESC LIMIT 25')
    return json({ settings, audit: auditRows })
  }
  if (ep === 'system' && request.method === 'POST') {
    if (!/^(scan|verify)_paused$/.test(body.k)) return json({ error: 'unknown setting' }, 400)
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
