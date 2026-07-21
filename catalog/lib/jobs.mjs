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
import { findDuplicates, bestSurvivor } from './dedup.mjs'
import { powerType } from './public.mjs'
import { storeSnapshot } from './snapshot.mjs'
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
    if ((await getSetting(env, 'dedup_paused')) !== '1') {
      const dd = await dedupSlice(env, trigger)
      if (dd) return dd
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
      cur.pOff = 0
      continue
    }
    // Resume within a page: a single feed page can hold more products than one
    // slice's budget. Skip the ones already done (cur.pOff) and, if the budget
    // truncates this page, hold position (don't advance the feed cursor) so the
    // rest are picked up next slice — instead of being silently dropped.
    const pageProducts = (res.products ?? []).slice(cur.pOff ?? 0)
    const stats = await upsertProducts(env, su, pageProducts, spent)
    log.push(`${su.source_id}: ${res.products?.length ?? 0} seen, ${stats.inserted} new, ${stats.changed} changed${(cur.pOff ?? 0) ? ` (from ${cur.pOff})` : ''}${res.subtree > 1 ? ` (subtree ${res.subtree})` : ''}`)
    if (stats.taken < pageProducts.length) {
      // budget hit mid-page — resume from the next unconsumed product next slice
      cur.pOff = (cur.pOff ?? 0) + stats.taken
      break
    }
    cur.pOff = 0
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
  const stats = { inserted: 0, changed: 0, taken: 0 }
  const take = products.slice(0, BUDGET.products - spent.products)
  stats.taken = take.length
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
        // URL reuse: same address, different product. Owner's rule: never
        // auto-remove — flag into the Missing list; confirm-gone is the gate.
        stmts.push(q(env, `UPDATE sku SET flagged=? WHERE id=?`,
          JSON.stringify({ kind: 'missing', detail: `url now serves a different product (pid ${byU.platform_pid} → ${p.pid})`, at: t }), byU.id))
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
  // Chunk at 15 rows (×5 cols = 75 params) — D1 caps bound params at ~100 per
  // statement, and a slice can change up to BUDGET.products (40) rows at once.
  for (let i = 0; i < obs.length; i += 15) {
    const chunk = obs.slice(i, i + 15)
    stmts.push(q(env,
      `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) VALUES ${chunk.map(() => '(?,?,?,?,?)').join(',')}`,
      ...chunk.flat()))
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
  // Feed-less (Zoho) sources get price/stock ONLY here — enrich runs once per
  // sku (enriched_at gates it), so a single transient empty fetch would strand
  // price/stock as null until verify happens to catch it. Retry to avoid that.
  const raw = (await getHtml(k.url_canonical, { tries: 2 })) ?? ''
  // A bot wall carries no product data — don't let it null out price/stock.
  const html = isChallenge(raw) ? '' : raw
  if (html) await storeSnapshot(env, k.id, html) // archive the page we already paid to fetch
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

// -------------------------------------------------------------- dedup slice
// Continuously hunts duplicate masters (same brand + model). Obvious dupes
// auto-merge; doubtful pairs go to merge_candidate for the owner to confirm.
// Time-gated (every 6h) — the whole comparison is cheap and in-memory.
const DEDUP_EVERY = 6 * 3600e3

export async function dedupSlice(env, trigger, force = false) {
  const last = Number((await getSetting(env, 'dedup_last')) ?? 0)
  const t = now()
  if (!force && t - last < DEDUP_EVERY) return null // not due — let verify have the slice
  await setSetting(env, 'dedup_last', String(t))

  const masters = await all(env, `SELECT m.id, m.slug, m.brand, m.name, m.brand_norm, m.name_norm, m.specs, m.status, m.category_id, m.power,
      (SELECT COUNT(*) FROM offer o WHERE o.master_model_id=m.id) AS offers,
      (SELECT GROUP_CONCAT(k.title, ' | ') FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id) AS titles
     FROM master_model m WHERE m.status IN ('ready','draft')`)
  const { obviousClusters, candidatePairs, anomalies } = findDuplicates(masters)
  // Power anomalies (only the electric-tagged direction, so a correctly-tagged
  // gas plane whose title carries no marker never trips it): an explicit gas
  // marker read as electric, or a large scale-fraction model likely to be gas.
  const brandFlagged = new Set(anomalies.map((a) => a.id))
  for (const m of masters) {
    if (brandFlagged.has(m.id) || m.power !== 'electric') continue
    const text = (m.name || '') + ' | ' + (m.titles || '')
    if (powerType(text) === 'gas') anomalies.push({ id: m.id, kind: 'power-mismatch', detail: 'gas/nitro marker in the title but tagged electric' })
    else if (/\b1\s*[/:]\s*[3-6]\b/.test(text)) anomalies.push({ id: m.id, kind: 'power-review', detail: 'scale model — likely gas, tagged electric' })
  }

  // Rejected pairs must never be re-proposed (auto-merge or candidate).
  const rejected = new Set((await all(env, `SELECT a_id, b_id FROM merge_candidate WHERE status='rejected'`)).map((r) => `${r.a_id}:${r.b_id}`))
  const isRejected = (a, b) => rejected.has(`${a}:${b}`) || rejected.has(`${b}:${a}`)

  let merged = 0
  let flagged = 0
  const log = []
  // Obvious dupes: merge each cluster's members into its single survivor.
  for (const cluster of obviousClusters) {
    const survivor = bestSurvivor(cluster)
    for (const m of cluster) {
      if (m.id === survivor.id || isRejected(survivor.id, m.id)) continue
      await mergeMasters(env, survivor.id, m.id, 'auto', 'obvious duplicate')
      merged++
      log.push(`merged #${m.id} '${m.name?.slice(0, 24)}' → #${survivor.id} '${survivor.name?.slice(0, 24)}'`)
    }
  }
  // Doubtful pairs → owner's review list.
  for (const p of candidatePairs) {
    if (isRejected(p.a.id, p.b.id)) continue
    const r = await run(env,
      `INSERT OR IGNORE INTO merge_candidate (a_id, b_id, score, reason, status, created_at) VALUES (?,?,?,?, 'pending', ?)`,
      Math.min(p.a.id, p.b.id), Math.max(p.a.id, p.b.id), p.score, p.reason, t)
    flagged++
  }
  // Brand anomalies (auto-recomputed every run): clear the old set, stamp the
  // current one. Fixing the brand — or merging the master away — clears it on
  // the next pass. The Catalog tab shows the badge so the owner can correct it.
  await run(env, `UPDATE master_model SET anomaly=NULL WHERE anomaly IS NOT NULL`)
  if (anomalies.length) await batch(env, anomalies.map((a) =>
    q(env, `UPDATE master_model SET anomaly=? WHERE id=?`, JSON.stringify({ kind: a.kind, detail: a.detail, at: t }), a.id)))
  return { job: 'dedup', trigger, merged, flagged, anomalies: anomalies.length, log }
}

// Merge master B into A: move B's offers to A (dropping any that would collide
// on a sku already offered on A), fill A's blank specs from B, drop B. Reused
// by the owner's admin "Merge" action. Returns nothing; throws on hard error.
export async function mergeMasters(env, aId, bId, actor, reason) {
  if (aId === bId) return
  const a = await one(env, `SELECT * FROM master_model WHERE id=?`, aId)
  const b = await one(env, `SELECT * FROM master_model WHERE id=?`, bId)
  if (!a || !b) return
  // fill A's missing specs from B (never overwrite an owner-entered value)
  let specs = {}
  try {
    specs = { ...JSON.parse(b.specs || '{}'), ...JSON.parse(a.specs || '{}') }
  } catch {}
  const stmts = [
    // free B's offers from any sku already carried by A, then re-home the rest
    q(env, `DELETE FROM offer WHERE master_model_id=? AND sku_id IN (SELECT sku_id FROM offer WHERE master_model_id=?)`, bId, aId),
    q(env, `UPDATE offer SET master_model_id=? WHERE master_model_id=?`, aId, bId),
    q(env, `UPDATE master_model SET specs=?, hero_image=COALESCE(hero_image, ?), updated_at=? WHERE id=?`, JSON.stringify(specs), b.hero_image, now(), aId),
    // B is absorbed then deleted — first remove EVERY merge_candidate row that
    // references B: the current pair AND any other pending pairs B sits in.
    // Otherwise deleting the master trips the a_id/b_id foreign key (RESTRICT)
    // and the whole merge throws. The next dedup pass re-evaluates the survivor
    // A against everything and re-creates candidates if they still look alike.
    q(env, `DELETE FROM merge_candidate WHERE a_id=? OR b_id=?`, bId, bId),
    q(env, `DELETE FROM master_model WHERE id=?`, bId),
    audit(env, actor, 'merge-master', 'master_model', bId, { into: aId, reason }),
  ]
  await batch(env, stmts)
  // Survivor absorbed B's offers — re-derive its power class from all titles.
  const titles = (await one(env, `SELECT GROUP_CONCAT(k.title, ' ') t FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=?`, aId))?.t ?? ''
  await run(env, `UPDATE master_model SET power=? WHERE id=?`, powerType(titles), aId)
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
  const kindOf = (f) => {
    try {
      return f ? JSON.parse(f).kind : null
    } catch {
      return null
    }
  }
  for (const sku of rows) {
    // Daily snapshot refresh: fetch the page, hash its product core, and re-store
    // only if it changed (the owner's "checksum, replace if changed"). Guarded —
    // a snapshot failure never affects the price/stock verify below.
    try { const sh = await getHtml(sku.url_canonical, { tries: 1, timeoutMs: 7000 }); if (sh) await storeSnapshot(env, sku.id, sh, t) } catch {}
    // WooCommerce: trust the Store API (reliable price/stock) over HTML scraping.
    const res =
      sku.platform === 'woocommerce' && sku.platform_pid
        ? await checkWooProduct(sku.home_url, sku.platform_pid, sku.url_canonical)
        : await checkPage(sku.url_canonical, sku)
    // The daily feed scan updates last_seen for every product still listed. A
    // "gone" signal is only trusted to AUTO-remove when the feed ALSO stopped
    // seeing it — a 404 that contradicts a fresh feed sighting is suspect.
    const feedRecent = sku.last_seen && t - sku.last_seen < DAY

    if (res.blocked) {
      // Bot wall / error — we could NOT read the listing. Preserve last-known
      // price/stock; only advance last_checked so verify rotates onward.
      stmts.push(q(env, `UPDATE sku SET last_checked=? WHERE id=?`, t, sku.id))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: blocked (data preserved)`)
      continue
    }
    if (res.gone && !feedRecent) {
      // Hard 404 AND the feed dropped it → genuine deletion. THE ONLY auto-remove
      // path (owner's rule), still gated behind 3 consecutive misses. No flag —
      // the Removed tab lists dead rows; the audit row records the actor.
      stmts.push(q(env, `UPDATE sku SET misses=misses+1, last_checked=?,
        dead=CASE WHEN misses+1>=3 THEN 1 ELSE dead END WHERE id=?`, t, sku.id))
      if (sku.misses + 1 >= 3) stmts.push(audit(env, 'verify', 'auto-removed-404', 'sku', sku.id, { url: sku.url_canonical }))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: 404+unlisted (miss ${sku.misses + 1})`)
      continue
    }
    if (res.quoteOnly && res.priceINR == null && sku.price_inr != null) {
      // A 200 page that no longer yields a price for a previously-priced
      // product is AMBIGUOUS (soft-404, theme without price markup). Preserve
      // the price and route to the owner's Missing list — never silently wipe.
      if (kindOf(sku.flagged) === 'missing') stmts.push(q(env, `UPDATE sku SET last_checked=? WHERE id=?`, t, sku.id))
      else stmts.push(q(env, `UPDATE sku SET flagged=?, last_checked=? WHERE id=?`,
        JSON.stringify({ kind: 'missing', detail: 'page no longer shows a price', at: t }), t, sku.id))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: unpriced 200 → owner review (price preserved)`)
      continue
    }
    if (res.missing || res.gone) {
      // Missing-from-feed, or a 404 the feed contradicts. NEVER auto-remove —
      // flag for the owner to confirm. Idempotent: re-flag only if not already.
      if (kindOf(sku.flagged) === 'missing') {
        stmts.push(q(env, `UPDATE sku SET last_checked=? WHERE id=?`, t, sku.id))
      } else {
        stmts.push(q(env, `UPDATE sku SET flagged=?, last_checked=? WHERE id=?`,
          JSON.stringify({ kind: 'missing', detail: res.gone ? '404 but still in feed' : 'absent from seller feed', at: t }), t, sku.id))
      }
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: MISSING → owner review`)
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
      // A successful read auto-clears a stale 'missing' flag — the product is back.
      const clearMissing = kindOf(sku.flagged) === 'missing' ? 1 : 0
      stmts.push(q(env,
        `UPDATE sku SET price_inr=?, in_stock=?, quote_only=?, image_url=COALESCE(image_url, ?),
           variants=CASE WHEN ? != '[]' THEN ? ELSE variants END,
           flagged=CASE WHEN ?=1 THEN NULL ELSE flagged END,
           misses=0, dead=0, last_checked=? WHERE id=?`,
        res.priceINR, res.inStock == null ? null : res.inStock ? 1 : 0, res.quoteOnly ? 1 : 0, res.img ?? null,
        JSON.stringify(res.variants ?? []), JSON.stringify(res.variants ?? []), clearMissing, t, sku.id))
      if (changed) stmts.push(q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) VALUES (?,?,?,?,?)`,
        sku.id, t, null, res.priceINR, res.inStock == null ? null : res.inStock ? 1 : 0))
      log.push(`${sku.id} ${sku.title?.slice(0, 30)}: ok ${res.priceINR ?? '—'}`)
    }
  }
  if (stmts.length) await batch(env, stmts)
  return { job: 'verify', trigger, checked: rows.length, log }
}
