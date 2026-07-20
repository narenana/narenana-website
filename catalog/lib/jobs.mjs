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

import { feedPage, checkPage } from './adapters.mjs'
import { all, one, run, batch, q, getSetting, setSetting, claimLease, audit } from './db.mjs'
import { now } from './util.mjs'

const BUDGET = { fetches: 12, statements: 30, products: 40 } // per slice, Free-safe
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
    const res = await feedPage(su, su.url_canonical, cur.sub)
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
    const res = await checkPage(sku.url_canonical, sku)
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
