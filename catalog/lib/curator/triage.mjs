// Triage phase: pending listings (design § 8 last row, § 9).
//
// Every pending listing the enrich slice has already fetched gets listing-v1,
// and its Review prefill (sku.guess) is refreshed from the checked answer, so
// the owner sees the AI's kind, brand, model name, wingspan and configuration
// (via gains '+ai'). The heuristic guess stays where the AI has nothing
// checked to offer. The listing's own fields, its review status and its offers
// are untouched here.

import { listingTask } from './prompts.mjs'
import { checkListing, coerceListing, quoteIn, nameSmell, LEGACY_KIND } from './validate.mjs'
import { inputHash } from '../ai.mjs'
import { skuGuessUpdate, openActionKeys, actionKey } from './store.mjs'
import { slugify } from '../util.mjs'

// Scope: review_status='new', not dead, not flagged, including out-of-stock
// listings (Review's default stock=in filter hides some), and only after
// enrich has fetched the page (so the snapshot text exists, and enrich's own
// one-shot write can never land on top of the AI's).
export async function buildTriageQueue(env) {
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT id FROM sku WHERE review_status='new' AND dead=0 AND flagged IS NULL AND enriched_at IS NOT NULL ORDER BY first_seen DESC, id DESC`,
  ).all()).results ?? []
  return rows.map((r) => r.id)
}

const parse = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }
const sameGuess = (a, b) => JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 })

// The refreshed prefill. brand: the checked AI brand, else the heuristic one
// only when the listing really names it (or it is the shop's own house brand):
// page chrome once put "FMS" on 83 havochobby listings.
export function mergeGuess(old, c, meta) {
  const g = { ...(old ?? {}) }
  const src = `${meta.title}\n${meta.text}`
  const houseBrand = old?.brand && slugify(old.brand) === meta.sourceId
  g.brand = c.brand || (old?.brand && (quoteIn(old.brand, src) || houseBrand) ? old.brand : '')
  // the checked name, unless it starts with the brand the prefill ends up with
  if (c.model && !nameSmell(c.model, g.brand)) g.name = c.model
  if (c.spanMM) g.spanMM = c.spanMM
  if (c.config) g.config = c.config
  g.kind = LEGACY_KIND[c.kind] ?? g.kind ?? null
  g.via = /\bai\b/.test(g.via ?? '') ? g.via : g.via && g.via !== 'none' ? `${g.via}+ai` : 'ai'
  g.ai = {
    kind: c.kind,
    confidence: c.confidence,
    brandQuote: c.brandQuote || '',
    spanQuote: c.spanMM ? c.spanQuote : '',
    power: c.power,
    packQty: c.packQty,
    evidence: c.evidence,
    model: meta.model,
    v: meta.v,
  }
  return g
}

// One tick's worth of the triage queue. Returns 'done' or 'more'.
export async function triagePhase(ctx) {
  const { cursor } = ctx
  if (!cursor.queue) {
    const ids = await buildTriageQueue(ctx.env)
    cursor.queue = cursor.scope ? ids.filter((id) => cursor.scope.skus.includes(id)) : ids
    cursor.idx = 0
  }
  while (cursor.idx < cursor.queue.length) {
    if (ctx.late() || !ctx.room(6)) return 'more'
    const ids = cursor.queue.slice(cursor.idx, cursor.idx + 6)
    const rows = (await ctx.env.CATALOG_DB.prepare(
      `SELECT k.id, k.source_id, k.title, k.guess, k.review_status, k.dead, k.flagged, s.name AS shop, sn.description AS text, c.configs
       FROM sku k JOIN source s ON s.id=k.source_id
       LEFT JOIN sku_snapshot sn ON sn.sku_id=k.id
       LEFT JOIN source_url_category suc ON suc.source_url_id=k.source_url_id
       LEFT JOIN category c ON c.id=suc.category_id
       WHERE k.id IN (${ids.map(() => '?').join(',')}) GROUP BY k.id`,
    ).bind(...ids).all()).results ?? []
    const byId = new Map(rows.map((r) => [r.id, r]))
    const items = ids.map((id) => {
      const k = byId.get(id)
      if (!k) return { id, gone: true }
      const configs = parse(k.configs, null) ?? ['kit', 'pnp', 'rtf', 'combo']
      const task = listingTask(configs)
      const input = { title: k.title ?? '', shop: k.shop ?? k.source_id, text: String(k.text ?? '').slice(0, 1200), configs }
      return { id, k, task, input }
    })
    const live = items.filter((x) => !x.gone && x.k.review_status === 'new' && !x.k.dead && !x.k.flagged)
    await ctx.ai.preload(await Promise.all(live.map((x) => ctx.ai.keyFor(x.task, x.input))))
    const seen = await openActionKeys(ctx.env, 'sku', live.map((x) => x.id))
    for (const x of items) {
      if (ctx.late() || !ctx.room(2)) return 'more'
      if (!live.includes(x)) { cursor.idx++; continue } // decided or removed since the queue was built
      const outcome = await ctx.item(`sku:${x.id}`, () => triageOne(ctx, x, seen))
      if (outcome === 'stop') return 'more'
      cursor.idx++
    }
  }
  return 'done'
}

async function triageOne(ctx, { id, k, task, input }, seen) {
  const r = await ctx.ai.ask(task, input, { item: `sku:${id}`, coerce: (o) => coerceListing(o, input.configs) })
  if (r.status === 'deferred') return 'stop'
  ctx.count(`listing_${r.status}`)
  if (r.status !== 'ok') return 'next'
  const c = checkListing(r.output, input)
  const old = parse(k.guess, {})
  const guess = mergeGuess(old, c, { title: input.title, text: input.text, sourceId: k.source_id, model: r.model, v: task.v })
  if (sameGuess(old, guess)) return 'next'
  const hash = await inputHash({ task: task.v, input })
  if (seen.has(actionKey('fill', id, 'guess', null, hash))) return 'next'
  ctx.change({
    kind: 'fill',
    entity: 'sku',
    entityId: id,
    before: { field: 'guess', value: k.guess ? old : null, raw: k.guess ?? null },
    after: { field: 'guess', value: guess, src: 'curator' },
    evidence: { kind: c.kind, quotes: c.evidence, brand_quote: c.brandQuote, span_quote: guess.ai.spanQuote, model: r.model, prompt_v: task.v },
    confidence: c.confidence,
    inputHash: hash,
    fieldSrc: { field: 'guess', src: 'curator', confidence: c.confidence },
    stmt: () => skuGuessUpdate(ctx.env, id, guess),
  })
  ctx.count('listings_sorted')
  return 'next'
}
