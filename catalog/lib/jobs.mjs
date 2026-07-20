// The pipeline jobs, sliced for Workers Free budgets.
//
// Free plan reality: ~50 subrequests per invocation, and every D1 statement is
// one. So no job ever "runs to completion" — each invocation runs ONE slice
// within an explicit budget, persists a cursor in `setting`, and the */15 cron
// (or the admin Run-now button) keeps slicing until the sweep is done.
//
//   scan   — walk active source_urls' feeds; upsert SKUs (identity rules);
//            observations on change. Daily sweep.
//   verify — direct page checks for approved SKUs, oldest last_checked first.
//            Continuous; large same-variant price deltas flag, never publish.
//
// Identity rules enforced here (architecture § Identity):
//   * match by (source_id, platform_pid) first, then url_canonical
//   * URL hit with mismatched pid ⇒ old row dead+flagged, new row inserted
//   * a scan never rewrites identity fields of a reviewed row

import { feedPage, checkPage, checkWooProduct, getHtml, ogImageFrom, extractSpanMM, detectConfig, parseJsonLd, cartSignals, isChallenge } from './adapters.mjs'
import { all, one, run, batch, q, getSetting, setSetting, claimLease, audit } from './db.mjs'
import { now } from './util.mjs'

// Per-slice, Free-safe. fetches=8 keeps the worst case (each iteration ≈ 2
// fetch attempts + ~3 D1 calls) under the ~50-subrequest invocation cap.
const BUDGET = { fetches: 8, statements: 30, products: 40 }
const DAY = 86400e3

export async function runSlice(env, trigger = 'cron') {
  const t = now()
  if (!(await claimLease(env, 'lease:jobs', 4 * 60e3, t))) return { skipped: 'lease held' }
  try {
    let scanState = JSON.parse((await getSetting(env, 'scan_cursor')) ?? '{}')
    const dayStart = t - (t % DAY)
    // A source URL added AFTER today's sweep finished would otherwise wait for
    // tomorrow — restart the sweep whenever an active URL has never been
    // scanned. (Owner adds a source, hits Run — it must scan NOW.)
    if (scanState.done) {
      const unscanned = await one(env, `SELECT COUNT(*) n FROM source_url WHERE status='active' AND last_scan_at IS NULL`)
      if ((unscanned?.n ?? 0) > 0) scanState = {}
    }
    if ((scanState.day ?? 0) < dayStart) {
      // new day → fresh sweep
      const paused = (await getSetting(env, 'scan_paused')) === '1'
      if (!paused) {
        const next = { day: dayStart, suIdx: 0, sub: null, done: false }
        await setSetting(env, 'scan_cursor', JSON.stringify(next))
        return await scanSlice(env, next, trigger)
      }
    } else if (!scanState.done) {
      return await scanSlice(env, scanState, trigger)
    }
    if ((await getSetting(env, 'enrich_paused')) !== '1') {
      const e = await enrichSlice(env, trigger)
      if (e) return e
    }
    if ((await getSetting(env, 'verify_paused')) !== '1') return await verifySlice(env, trigger)
    return { idle: true }
  } finally {
    await run(env, "UPDATE setting SET v='0' WHERE k='lease:jobs'")
  }
}

// ---------------------------------------------------------------- scan slice
async function scanSlice(env, cur, trigger) {
  const sus = await all(
    env,
    `SELECT su.*, s.platform, s.home_url, s.unscoped_ok FROM source_url su
     JOIN source s ON s.id = su.source_id
     WHERE su.status='active' ORDER BY su.id`,
  )
  let spent = { fetches: 0, statements: 2, products: 0 }
  const log = []

  while (cur.suIdx < sus.length && spent.fetches < BUDGET.fetches && spent.statements < BUDGET.statements) {
    const su = sus[cur.suIdx]
    // A THROW here (adapter bug, malformed URL) must not wedge the cursor on
    // this source_url forever — that starves verify and every later source.
    let res
    try {
      res = await feedPage(su, su.url_canonical, cur.sub)
    } catch (e) {
      res = { error: `feed threw: ${String(e.message || e).slice(0, 120)}` }
    }
    spent.fetches += res.fetches ?? 2
    if (res.error) {
      await run(env, 'UPDATE source_url SET last_scan_at=?, last_scan_note=? WHERE id=?', now(), JSON.stringify({ error: res.error }), su.id)
      spent.statements++
      log.push(`${su.source_id}: ✗ ${res.error}`)
      cur.suIdx++
      cur.sub = null
      continue
    }
    const stats = await upsertProducts(env, su, res.products ?? [], spent)
    log.push(`${su.source_id}: ${res.products?.length ?? 0} seen, ${stats.inserted} new, ${stats.changed} changed${res.subtree > 1 ? ` (subtree ${res.subtree})` : ''}`)
    cur.sub = res.nextCursor
    if (!cur.sub) {
      await run(env, 'UPDATE source_url SET last_scan_at=?, last_scan_note=? WHERE id=?', now(), JSON.stringify({ ok: true, subtree: res.subtree ?? 1 }), su.id)
      spent.statements++
      cur.suIdx++
    }
    if (spent.products >= BUDGET.products) break
  }

  cur.done = cur.suIdx >= sus.length
  await setSetting(env, 'scan_cursor', JSON.stringify(cur))
  return { job: 'scan', trigger, progress: `${cur.suIdx}/${sus.length} urls`, done: cur.done, log, spent }
}

export async function upsertProducts(env, su, products, spent) {
  const t = now()
  const stats = { inserted: 0, changed: 0 }
  const take = products.slice(0, BUDGET.products - spent.products)
  spent.products += take.length
  if (!take.length) return stats

  const urls = take.map((p) => p.url).filter(Boolean)
  const pids = take.map((p) => p.pid).filter(Boolean)
  const existing = await all(
    env,
    `SELECT id, platform_pid, url_canonical, title, price_inr, in_stock, review_status, dead
     FROM sku WHERE source_id=? AND (url_canonical IN (${urls.map(() => '?').join(',') || "''"})
       OR (platform_pid IS NOT NULL AND platform_pid IN (${pids.map(() => '?').join(',') || "''"})))`,
    su.source_id, ...urls, ...pids,
  )
  spent.statements++
  const byUrl = new Map(existing.map((r) => [r.url_canonical, r]))
  const byPid = new Map(existing.filter((r) => r.platform_pid).map((r) => [r.platform_pid, r]))

  const inserts = []
  const stmts = []
  const obs = []

  for (const p of take) {
    if (!p.url) continue
    const byP = p.pid ? byPid.get(p.pid) : null
    const byU = byUrl.get(p.url)

    if (byP) {
      // Known product (identity = pid). URL may legitimately change; refresh data.
      const changed = byP.price_inr !== p.priceINR || !!byP.in_stock !== !!p.inStock
      stmts.push(q(env,
        `UPDATE sku SET url_canonical=?, url_raw=?, title=CASE WHEN review_status='new' THEN ? ELSE title END,
           image_url=COALESCE(?, image_url), price_inr=?, in_stock=?, variants=?, last_seen=?, misses=0, dead=0 WHERE id=?`,
        p.url, p.url, p.title, p.img, p.priceINR, p.inStock == null ? null : p.inStock ? 1 : 0,
        JSON.stringify(p.variants ?? []), t, byP.id))
      if (changed) {
        obs.push([byP.id, t, null, p.priceINR, p.inStock == null ? null : p.inStock ? 1 : 0])
        stats.changed++
      }
    } else if (byU) {
      if (p.pid && byU.platform_pid && byU.platform_pid !== p.pid) {
        // URL reuse: same address, different product. Close the old row loudly;
        // the new listing enters review as a fresh row.
        stmts.push(q(env, `UPDATE sku SET dead=1, flagged=? WHERE id=?`,
          JSON.stringify({ kind: 'url-reused', detail: `pid ${byU.platform_pid} -> ${p.pid}`, at: t }), byU.id))
        inserts.push(p)
      } else {
        const changed = byU.price_inr !== p.priceINR || !!byU.in_stock !== !!p.inStock
        stmts.push(q(env,
          `UPDATE sku SET platform_pid=COALESCE(platform_pid, ?), title=CASE WHEN review_status='new' THEN ? ELSE title END,
             image_url=COALESCE(?, image_url), price_inr=?, in_stock=?, variants=?, last_seen=?, misses=0, dead=0 WHERE id=?`,
          p.pid, p.title, p.img, p.priceINR, p.inStock == null ? null : p.inStock ? 1 : 0,
          JSON.stringify(p.variants ?? []), t, byU.id))
        if (changed) {
          obs.push([byU.id, t, null, p.priceINR, p.inStock == null ? null : p.inStock ? 1 : 0])
          stats.changed++
        }
      }
    } else {
      inserts.push(p)
    }
  }

  // New SKUs — multi-row insert, 5 rows per statement (17 cols × 5 < 100 params).
  for (let i = 0; i < inserts.length; i += 5) {
    const chunk = inserts.slice(i, i + 5)
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')
    const params = chunk.flatMap((p) => [
      su.source_id, su.id, p.pid, p.url, p.url, p.title ?? '', p.img,
      p.priceINR, p.inStock == null ? null : p.inStock ? 1 : 0,
      JSON.stringify(p.variants ?? []), 'new', t, t, 0,
    ])
    stmts.push(q(env,
      `INSERT OR IGNORE INTO sku (source_id, source_url_id, platform_pid, url_canonical, url_raw, title, image_url,
         price_inr, in_stock, variants, review_status, first_seen, last_seen, misses)
       VALUES ${placeholders}`, ...params))
    stats.inserted += chunk.length
  }
  if (obs.length) {
    stmts.push(q(env,
      `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) VALUES ${obs.map(() => '(?,?,?,?,?)').join(',')}`,
      ...obs.flat()))
  }
  if (stmts.length) {
    await batch(env, stmts)
    spent.statements += stmts.length
  }
  return stats
}

// -------------------------------------------------------------- enrich slice
// The system fills in as much data as it can BEFORE the owner reviews: one
// product-page fetch per new sku → wingspan, config, image, price/stock (for
// feed-less HTML/Zoho sources), brand matched against the category's brand
// list (D1 data), plus an optional Workers-AI pass for kind + clean name.
// Runs after the daily scan finishes, before verify; one-shot per sku.
async function enrichSlice(env, trigger) {
  const t = now()
  const rows = await all(
    env,
    `SELECT k.*, c.triage FROM sku k
     LEFT JOIN source_url_category suc ON suc.source_url_id=k.source_url_id
     LEFT JOIN category c ON c.id=suc.category_id
     WHERE k.review_status='new' AND k.enriched_at IS NULL AND k.dead=0
     GROUP BY k.id ORDER BY k.first_seen DESC LIMIT 5`,
  )
  if (!rows.length) return null // nothing pending — let verify have the slice
  const stmts = []
  const log = []
  for (const k of rows) {
    const g = await buildGuess(env, k)
    stmts.push(q(env,
      `UPDATE sku SET guess=?, enriched_at=?, image_url=COALESCE(image_url, ?),
         price_inr=COALESCE(price_inr, ?), in_stock=COALESCE(in_stock, ?) WHERE id=?`,
      JSON.stringify(g), t, g._img ?? null, g._price ?? null, g._stock ?? null, k.id))
    log.push(`${k.id} ${String(k.title ?? '').slice(0, 26)}: ${g.brand || '?'} span:${g.spanMM ?? '—'} ${g.config} [${g.via}]`)
  }
  await batch(env, stmts)
  return { job: 'enrich', trigger, enriched: rows.length, log }
}

async function buildGuess(env, k) {
  const title = k.title ?? ''
  const triage = (() => { try { return JSON.parse(k.triage ?? '{}') } catch { return {} } })()
  const brands = triage.brands ?? []
  const raw = (await getHtml(k.url_canonical, { tries: 1 })) ?? ''
  // A bot wall carries no product data — don't let it null out price/stock.
  const html = isChallenge(raw) ? '' : raw
  // visible-ish text only: strip tags/scripts so regexes see prose, not markup
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20000)

  const findBrand = (s) => brands.find((b) => new RegExp(b.replace(/[-\s]/g, '.?'), 'i').test(s))
  let brand = findBrand(title) ?? findBrand(text.slice(0, 3000)) ?? (brands.find((b) => b.toLowerCase().replace(/[^a-z0-9]/g, '') === String(k.source_id).replace(/[^a-z0-9]/g, '')) || '')
  let spanMM = extractSpanMM(title)
  let via = spanMM ? 'title' : ''
  if (!spanMM) {
    spanMM = extractSpanMM(text)
    if (spanMM) via = 'page'
  }
  const config = detectConfig(title + ' ' + text.slice(0, 2000))
  // heuristic clean name: strip brand token, SEO tails, config words.
  // SEO tails are cut ONLY at spaced separators — a bare hyphen is part of
  // the model name ("VT-Allrounder", "X-UAV"), not a separator.
  let name = title.replace(/\s+[|–—-]\s+[^|]*$/i, '').trim()
  if (brand) name = name.replace(new RegExp('^' + brand.replace(/[-\s]/g, '[-\\s]?') + '[\\s:–—-]*', 'i'), '').trim() || name
  name = name.replace(/\b(rc\s+(plane|aircraft|airplane)|for\s+beginners?|india|fpv\s+flight)\b/gi, ' ').replace(/\s+/g, ' ').trim()

  // side-fill for feed-less sources: the page fetch is already paid for
  let _img = null, _price = null, _stock = null
  if (html && (k.image_url == null || k.price_inr == null || k.in_stock == null)) {
    try {
      _img = ogImageFrom(html, k.url_canonical)
    } catch {}
    const chk = parseJsonLd(html) ?? cartSignals(html)
    _price = chk?.priceINR ?? null
    _stock = chk?.inStock == null ? null : chk.inStock ? 1 : 0
  }

  // optional Workers AI: kind + cleaner name (+ span only as a last resort)
  let kind = null
  const ai = await aiGuess(env, title, text.slice(0, 1600))
  if (ai) {
    kind = ai.kind ?? null
    if (!brand && ai.brand) brand = String(ai.brand).slice(0, 40)
    if (ai.name) name = String(ai.name).slice(0, 60)
    if (!spanMM && Number(ai.spanMM) >= 200 && Number(ai.spanMM) <= 4000) {
      spanMM = Math.round(Number(ai.spanMM))
      via = 'ai'
    }
    via = via ? via + '+ai' : 'ai'
  }
  return { brand, name: name.slice(0, 60), spanMM, config, kind, via: via || 'none', at: now(), _img, _price, _stock }
}

async function aiGuess(env, title, snippet) {
  if (!env.AI) return null
  try {
    const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      max_tokens: 180,
      messages: [
        { role: 'system', content: 'You classify RC hobby-shop listings. Reply with ONLY a JSON object: {"kind":"aircraft"|"accessory"|"other","brand":string,"name":string,"spanMM":number}. kind=aircraft only for fixed-wing airplane/flying-wing/glider AIRFRAMES (kits/PNP/RTF). Motors, ESCs, servos, batteries, props, radios, FPV gear, spare parts, multirotors are accessory/other. name = clean model name without brand or marketing text. spanMM = wingspan in millimetres, 0 if unknown. brand = manufacturer if identifiable, else "".' },
        { role: 'user', content: `Title: ${title}\nPage: ${snippet}` },
      ],
    })
    const m = String(r?.response ?? '').match(/\{[\s\S]*?\}/)
    if (!m) return null
    const j = JSON.parse(m[0])
    return { kind: ['aircraft', 'accessory', 'other'].includes(j.kind) ? j.kind : null, brand: j.brand, name: j.name, spanMM: j.spanMM }
  } catch {
    return null
  }
}

// -------------------------------------------------------------- verify slice
const FLAG_DELTA = 0.25

async function verifySlice(env, trigger) {
  const t = now()
  const rows = await all(
    env,
    `SELECT k.*, s.platform, s.home_url FROM sku k JOIN source s ON s.id=k.source_id
     WHERE k.review_status='approved' AND k.dead=0
     ORDER BY COALESCE(k.last_checked,0) ASC LIMIT 6`,
  )
  const log = []
  const stmts = []
  for (const sku of rows) {
    // WooCommerce: trust the Store API (reliable price/stock) over HTML scraping.
    const res =
      sku.platform === 'woocommerce' && sku.platform_pid
        ? await checkWooProduct(sku.home_url, sku.platform_pid)
        : await checkPage(sku.url_canonical, sku)
    if (res.blocked) {
      // Seller put up a bot wall — we could NOT read the listing. Preserve the
      // last-known price/stock; only advance last_checked so verify rotates on
      // to other SKUs instead of spinning on this blocked seller forever.
      stmts.push(q(env, `UPDATE sku SET last_checked=? WHERE id=?`, t, sku.id))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: blocked (data preserved)`)
      continue
    }
    if (res.gone) {
      stmts.push(q(env, `UPDATE sku SET misses=misses+1, last_checked=?, dead=CASE WHEN misses+1>=3 THEN 1 ELSE dead END WHERE id=?`, t, sku.id))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: page gone (miss ${sku.misses + 1})`)
      continue
    }
    const delta = sku.price_inr && res.priceINR ? Math.abs(res.priceINR - sku.price_inr) / sku.price_inr : 0
    if (delta > FLAG_DELTA) {
      // big move — flag for the owner; keep last-confirmed price published
      stmts.push(q(env, `UPDATE sku SET flagged=?, last_checked=? WHERE id=?`,
        JSON.stringify({ kind: 'price-jump', detail: `${sku.price_inr} -> ${res.priceINR}`, at: t }), t, sku.id))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: FLAG price ${sku.price_inr}→${res.priceINR}`)
    } else {
      const changed = sku.price_inr !== res.priceINR || !!sku.in_stock !== !!res.inStock
      stmts.push(q(env,
        `UPDATE sku SET price_inr=?, in_stock=?, quote_only=?, image_url=COALESCE(image_url, ?),
           variants=CASE WHEN ? != '[]' THEN ? ELSE variants END,
           misses=0, dead=0, last_checked=? WHERE id=?`,
        res.priceINR, res.inStock == null ? null : res.inStock ? 1 : 0, res.quoteOnly ? 1 : 0, res.img ?? null,
        JSON.stringify(res.variants ?? []), JSON.stringify(res.variants ?? []), t, sku.id))
      if (changed) stmts.push(q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) VALUES (?,?,?,?,?)`,
        sku.id, t, null, res.priceINR, res.inStock == null ? null : res.inStock ? 1 : 0))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: ok ${res.priceINR ?? '—'}`)
    }
  }
  if (stmts.length) await batch(env, stmts)
  return { job: 'verify', trigger, checked: rows.length, log }
}
