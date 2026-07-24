// Incremental production manufacturer harvesting.
//
// One hourly cron invocation fetches a bounded page from one manufacturer.
// When that manufacturer completes, candidates are rebuilt without touching
// human decisions. Products are upserted by their stable external id; there is
// no DELETE+INSERT refresh and therefore no review-state loss.

import { all, one, run, getSetting, setSetting, claimLease, audit } from './db.mjs'
import { fetchStrategyPage, STRATEGIES } from './mfr-strategies.mjs'
import { isAircraft, rankCandidates } from './mfr-match.mjs'

const DAY = 86400e3
const REFRESH = 7 * DAY
const RETRY = DAY
const PAGE = { shopify: 40, jsonld: 8, html: 8 }

const brandKey = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const aliasesOf = (brand) => {
  const b = (brand || '').toLowerCase()
  return [...new Set([b, b.replace(/\s+/g, ''), b.replace(/[^a-z0-9]/g, '')].filter(Boolean))]
}
const masterSpan = (m) => {
  try {
    const n = +JSON.parse(m.specs || '{}').spanMM
    return n > 0 ? n : null
  } catch {
    return null
  }
}
const chunks = (rows, n) => {
  const out = []
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n))
  return out
}
const text = (value, max = 8000) => String(value ?? '').slice(0, max)

async function upsertProducts(env, manufacturer, products, at) {
  if (!products.length) return
  const payload = products.map((p) => ({
    ext_id: text(p.ext_id || p.url, 1000),
    url: text(p.url, 2000),
    title: text(p.title, 1000),
    span_mm: p.span > 0 ? Math.round(p.span) : null,
    body_text: text(p.body_text),
    image_urls: JSON.stringify((p.image_urls || []).filter(Boolean).slice(0, 20)),
  }))
  for (const part of chunks(payload, 20)) {
    await run(
      env,
      `INSERT INTO mfr_product
         (manufacturer_id,ext_id,url,title,is_aircraft,span_mm,body_text,image_urls,fetched_at,last_seen_at)
       SELECT ?,json_extract(value,'$.ext_id'),json_extract(value,'$.url'),
              json_extract(value,'$.title'),1,json_extract(value,'$.span_mm'),
              json_extract(value,'$.body_text'),json_extract(value,'$.image_urls'),?,?
       FROM json_each(?)
       WHERE json_extract(value,'$.ext_id') IS NOT NULL
       ON CONFLICT(manufacturer_id,ext_id) DO UPDATE SET
         url=excluded.url,title=excluded.title,is_aircraft=1,
         span_mm=excluded.span_mm,body_text=excluded.body_text,
         image_urls=excluded.image_urls,fetched_at=excluded.fetched_at,
         last_seen_at=excluded.last_seen_at`,
      manufacturer.id,
      at,
      at,
      JSON.stringify(part),
    )
  }
}

const candidateReason = (candidate, claimed) => {
  if (!candidate) return 'no credible manufacturer SKU'
  if (claimed) return 'higher-ranked SKU was already recommended for another model'
  if (candidate.name < 0.35) return 'weak model-name match'
  if (candidate.span_agree === 0) return 'name resembles this model but wingspan conflicts'
  if (candidate.margin < 0.1 && candidate.name < 0.999) return 'two or more manufacturer SKUs score similarly'
  if (candidate.tier === 'review') return 'partial model-name match; verify the exact variant'
  return null
}

// Rebuild top-five candidates for one brand. Manual decisions are immutable;
// automatic recommendations use one-to-one assignment so one official SKU
// cannot silently "verify" several catalog models.
export async function rebuildManufacturerMatches(env, manufacturer, at = Date.now()) {
  const [masters, rawProducts, existing] = await Promise.all([
    all(env, `SELECT id,brand,name,specs,status FROM master_model WHERE status IN ('ready','draft')`),
    all(env, `SELECT id,ext_id,url,title,span_mm,body_text,image_urls
              FROM mfr_product WHERE manufacturer_id=? AND is_aircraft=1`, manufacturer.id),
    all(env, `SELECT master_model_id,mfr_product_id,status,decided_at FROM mfr_match`),
  ])
  const mine = masters.filter((m) => brandKey(m.brand) === brandKey(manufacturer.brand))
  if (!mine.length) return { masters: 0, candidates: 0, automatic: 0 }

  const products = rawProducts.map((p) => ({ ...p, span: p.span_mm }))
  const aliases = aliasesOf(manufacturer.brand)
  const existingByMaster = new Map(existing.map((r) => [r.master_model_id, r]))
  const rankedByMaster = new Map()
  const candidateRows = []

  for (const master of mine) {
    const ranked = rankCandidates({ name: master.name, span: masterSpan(master) }, products, aliases, 5)
    rankedByMaster.set(master.id, ranked)
    ranked.forEach((c, index) => candidateRows.push({
      master_model_id: master.id,
      mfr_product_id: c.product.id,
      rank: index + 1,
      score: +c.score.toFixed(4),
      name_score: +c.name.toFixed(4),
      span_agree: c.span_agree,
      tier: c.tier,
      reason: candidateReason(c, false),
      updated_at: at,
    }))
  }

  // Accepted manual mappings claim their SKU first. Manual rejections remain
  // decisions but do not prevent a different master from using that product.
  const claimed = new Set()
  for (const row of existing) {
    if (row.decided_at && row.status === 'accepted' && row.mfr_product_id) claimed.add(row.mfr_product_id)
  }

  const automatic = mine
    .filter((m) => !existingByMaster.get(m.id)?.decided_at)
    .sort((a, b) => {
      const ar = rankedByMaster.get(a.id)?.[0]
      const br = rankedByMaster.get(b.id)?.[0]
      return (br?.score ?? 0) - (ar?.score ?? 0) ||
        (br?.margin ?? 0) - (ar?.margin ?? 0) ||
        a.id - b.id
    })

  const matchRows = []
  for (const master of automatic) {
    const ranked = rankedByMaster.get(master.id) || []
    const top = ranked[0]
    const weak = !!top && top.name >= 0.35 && top.name < 0.6
    const collision = !!top && top.name >= 0.6 && claimed.has(top.product.id)
    const selected = top && top.name >= 0.6 && !collision ? top : null
    if (selected) claimed.add(selected.product.id)
    const tier = collision || weak ? 'review' : selected?.tier ?? 'reject'
    matchRows.push({
      master_model_id: master.id,
      mfr_product_id: selected?.product.id ?? null,
      score: +(selected?.score ?? top?.score ?? 0).toFixed(4),
      span_agree: selected?.span_agree ?? top?.span_agree ?? null,
      tier,
      status: tier === 'reject' ? 'rejected' : 'pending',
      note: collision
        ? 'top manufacturer SKU is already recommended for another model; choose the exact SKU manually'
        : weak
          ? 'only a partial model-name match was found; choose the exact SKU manually'
        : candidateReason(selected, false),
      updated_at: at,
    })
  }

  const masterIds = mine.map((m) => m.id)
  await run(
    env,
    `DELETE FROM mfr_candidate
     WHERE master_model_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    JSON.stringify(masterIds),
  )

  for (const part of chunks(candidateRows, 50)) {
    await run(
      env,
      `INSERT INTO mfr_candidate
         (master_model_id,mfr_product_id,rank,score,name_score,span_agree,tier,reason,updated_at)
       SELECT json_extract(value,'$.master_model_id'),json_extract(value,'$.mfr_product_id'),
              json_extract(value,'$.rank'),json_extract(value,'$.score'),
              json_extract(value,'$.name_score'),json_extract(value,'$.span_agree'),
              json_extract(value,'$.tier'),json_extract(value,'$.reason'),
              json_extract(value,'$.updated_at')
       FROM json_each(?)
       WHERE true
       ON CONFLICT(master_model_id,mfr_product_id) DO UPDATE SET
         rank=excluded.rank,score=excluded.score,name_score=excluded.name_score,
         span_agree=excluded.span_agree,tier=excluded.tier,
         reason=excluded.reason,updated_at=excluded.updated_at`,
      JSON.stringify(part),
    )
  }

  for (const part of chunks(matchRows, 50)) {
    await run(
      env,
      `INSERT INTO mfr_match
         (master_model_id,mfr_product_id,score,span_agree,tier,status,note,updated_at)
       SELECT json_extract(value,'$.master_model_id'),json_extract(value,'$.mfr_product_id'),
              json_extract(value,'$.score'),json_extract(value,'$.span_agree'),
              json_extract(value,'$.tier'),json_extract(value,'$.status'),
              json_extract(value,'$.note'),json_extract(value,'$.updated_at')
       FROM json_each(?)
       WHERE true
       ON CONFLICT(master_model_id) DO UPDATE SET
         mfr_product_id=excluded.mfr_product_id,score=excluded.score,
         span_agree=excluded.span_agree,tier=excluded.tier,
         status=excluded.status,note=excluded.note,updated_at=excluded.updated_at
       WHERE mfr_match.decided_at IS NULL`,
      JSON.stringify(part),
    )
  }

  return { masters: mine.length, candidates: candidateRows.length, automatic: matchRows.length }
}

export async function mfrHarvestSlice(env, trigger = 'cron') {
  const at = Date.now()
  if ((await getSetting(env, 'mfr_paused')) === '1') return { job: 'manufacturer', paused: true }
  if (!(await claimLease(env, 'lease:mfr', 50 * 60e3, at))) return { job: 'manufacturer', skipped: 'lease held' }

  try {
    let cursor = {}
    try { cursor = JSON.parse((await getSetting(env, 'mfr_cursor')) || '{}') } catch {}
    let manufacturer = cursor.manufacturerId
      ? await one(env, `SELECT * FROM manufacturer WHERE id=? AND status='active'`, cursor.manufacturerId)
      : null

    if (!manufacturer) {
      manufacturer = await one(
        env,
        `SELECT * FROM manufacturer
         WHERE status='active' AND (
           last_harvest_at IS NULL OR
           (last_harvest_status='error' AND last_harvest_at<?) OR
           (COALESCE(last_harvest_status,'')<>'error' AND last_harvest_at<?)
         )
         ORDER BY COALESCE(last_harvest_at,0),id LIMIT 1`,
        at - RETRY,
        at - REFRESH,
      )
      cursor = manufacturer ? { manufacturerId: manufacturer.id, offset: 0, startedAt: at } : {}
    }
    if (!manufacturer) return { job: 'manufacturer', idle: true }

    const cfg = STRATEGIES[manufacturer.domain]
    if (!cfg || cfg.via === 'todo') {
      await run(
        env,
        `UPDATE manufacturer SET last_harvest_at=?,last_harvest_status='error',last_harvest_note=? WHERE id=?`,
        at,
        'No production harvesting strategy',
        manufacturer.id,
      )
      await setSetting(env, 'mfr_cursor', '{}')
      return { job: 'manufacturer', brand: manufacturer.brand, error: 'no strategy' }
    }

    try {
      const page = await fetchStrategyPage(manufacturer.domain, manufacturer.brand, {
        offset: cursor.offset || 0,
        limit: PAGE[cfg.via] || 8,
      })
      if (!page || !Number.isFinite(page.total) || page.total <= 0)
        throw new Error('strategy returned no discoverable products')

      const aircraft = cfg.via === 'html'
        ? page.products
        : page.products.filter((p) => isAircraft(p.title))
      await upsertProducts(env, manufacturer, aircraft, at)

      if (!page.done) {
        await setSetting(env, 'mfr_cursor', JSON.stringify({
          ...cursor,
          manufacturerId: manufacturer.id,
          offset: page.nextOffset,
          total: page.total,
        }))
        return {
          job: 'manufacturer',
          trigger,
          brand: manufacturer.brand,
          offset: page.nextOffset,
          total: page.total,
          harvested: aircraft.length,
        }
      }

      const rebuilt = await rebuildManufacturerMatches(env, manufacturer, at)
      await run(
        env,
        `UPDATE manufacturer
         SET updated_at=?,last_harvest_at=?,last_harvest_status='ok',last_harvest_note=?
         WHERE id=?`,
        at,
        at,
        `${page.total} discovered; ${rebuilt.candidates} ranked candidates`,
        manufacturer.id,
      )
      await setSetting(env, 'mfr_cursor', '{}')
      await audit(env, 'cron', 'mfr-harvest', 'manufacturer', manufacturer.id, {
        brand: manufacturer.brand,
        discovered: page.total,
        ...rebuilt,
      }).run()
      return { job: 'manufacturer', trigger, brand: manufacturer.brand, done: true, total: page.total, ...rebuilt }
    } catch (error) {
      await run(
        env,
        `UPDATE manufacturer SET last_harvest_at=?,last_harvest_status='error',last_harvest_note=? WHERE id=?`,
        at,
        text(error?.message || error, 500),
        manufacturer.id,
      )
      await setSetting(env, 'mfr_cursor', '{}')
      return { job: 'manufacturer', brand: manufacturer.brand, error: text(error?.message || error, 500) }
    }
  } finally {
    await run(env, "UPDATE setting SET v='0' WHERE k='lease:mfr'")
  }
}
