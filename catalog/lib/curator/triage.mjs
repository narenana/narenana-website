// Triage phase: pending listings (design § 8 last row, § 9).
//
// Every pending listing the enrich slice has already fetched gets listing-v1:
//   * its Review prefill (sku.guess) is refreshed from the checked answer, so
//     the owner sees the AI's kind, brand, model name, wingspan and
//     configuration (via gains '+ai');
//   * AUTO-REJECT: not an airframe at ≥ 0.90, a rule agrees (a category
//     exclude keyword in the title, or no aircraft word in it), and the owner
//     has not put the listing back (field_src sku/review = owner). The reason
//     uses Review's words: parts, electronics, power, radio and tools are
//     'accessory'; multirotors, helicopters and the rest 'out-of-scope'.
//     Undo is Restore, which locks the listing so it is never auto-rejected
//     again;
//   * the checked facts are kept for the later phases, which attach a listing
//     to an existing page (dedup.mjs), start a draft page for an obvious new
//     plane, or leave it for the owner with the AI's proposal and top matches.
// A source whose every pending listing is rejected is flagged for the owner.

import { listingTask } from './prompts.mjs'
import { checkListing, coerceListing, quoteIn, nameSmell, LEGACY_KIND, rejectReasonFor } from './validate.mjs'
import { inputHash } from '../ai.mjs'
import { skuGuessUpdate, openActionKeys, actionKey, loadLocks } from './store.mjs'
import { slugify } from '../util.mjs'

export const REJECT_CONF = 0.9
export const SOURCE_FLAG_MIN = 3

// Words that say a title is about an aircraft. Not listed: RTF, PNP, BNF,
// FPV, UAV — quadcopters are sold that way too.
const AIRCRAFT = /\b(air ?planes?|aeroplanes?|aircraft|planes?|gliders?|sailplanes?|jets?|edf|trainers?|warbirds?|wings?|wingspan|biplane|seaplane|float ?plane|cessna|piper|cub|mustang|spitfire|corsair|stol|vtol|delta|sky ?surfer|bixler|talon)\b/i

// Does a deterministic rule agree that this listing is not a plane?
export function ruleAgrees(title, triage = {}) {
  const t = String(title ?? '').toLowerCase()
  const exclude = [...(triage.exclude ?? []), ...(triage.accessory ?? [])]
  if (exclude.some((w) => w && t.includes(String(w).toLowerCase()))) return 'an exclude keyword is in the title'
  const include = (triage.include ?? []).some((w) => w && t.includes(String(w).toLowerCase()))
  if (!include && !AIRCRAFT.test(t)) return 'no aircraft word in the title'
  return ''
}

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
    cursor.lst = {}
    cursor.srcTally = {}
  }
  while (cursor.idx < cursor.queue.length) {
    if (ctx.late() || !ctx.room(7)) return 'more'
    const ids = cursor.queue.slice(cursor.idx, cursor.idx + 6)
    const rows = (await ctx.env.CATALOG_DB.prepare(
      `SELECT k.id, k.source_id, k.title, k.guess, k.review_status, k.dead, k.flagged, s.name AS shop, sn.description AS text, c.id AS cat_id, c.configs, c.triage
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
    const locks = await loadLocks(ctx.env, 'sku', live.map((x) => x.id))
    for (const x of items) {
      if (ctx.late() || !ctx.room(3)) return 'more'
      if (!live.includes(x)) { cursor.idx++; continue } // decided or removed since the queue was built
      const outcome = await ctx.item(`sku:${x.id}`, () => triageOne(ctx, x, seen, locks))
      if (outcome === 'stop') return 'more'
      cursor.idx++
    }
  }
  if (!ctx.room(3)) return 'more'
  await flagSources(ctx)
  return 'done'
}

async function triageOne(ctx, { id, k, task, input }, seen, locks) {
  const tally = (ctx.cursor.srcTally[k.source_id] ??= { seen: 0, rejected: 0 })
  tally.seen++
  const r = await ctx.ai.ask(task, input, { item: `sku:${id}`, coerce: (o) => coerceListing(o, input.configs) })
  if (r.status === 'deferred') { tally.seen--; return 'stop' }
  ctx.count(`listing_${r.status}`)
  if (r.status !== 'ok') return 'next'
  const c = checkListing(r.output, input)
  const hash = await inputHash({ task: task.v, input })
  const locked = locks.get(id)?.get('review') === 'owner'
  const facts = {
    kind: c.kind, confidence: c.confidence, brand: c.brand, brandQuote: c.brandQuote, model: c.model, spanMM: c.spanMM, spanQuote: c.spanMM ? c.spanQuote : '',
    config: c.config, packQty: c.packQty, power: c.power, evidence: c.evidence, title: input.title, shop: input.shop, source: k.source_id, catId: k.cat_id ?? 'wings', hash, locked,
  }
  ctx.cursor.lst[id] = facts

  // ---- auto-reject: the AI is sure it is not a plane, and a rule agrees
  const triage = parse(k.triage, {}) ?? {}
  const agree = c.kind !== 'airframe' && c.confidence >= REJECT_CONF ? ruleAgrees(input.title, triage) : ''
  if (agree && !locked) {
    const reason = rejectReasonFor(c.kind)
    facts.rejected = true
    tally.rejected++
    if (seen.has(actionKey('reject', id, 'review', null, hash))) return 'next'
    ctx.change({
      kind: 'reject',
      entity: 'sku',
      entityId: id,
      before: { field: 'review', value: 'new' },
      after: { field: 'review', value: 'rejected', reason },
      evidence: { kind: c.kind, rule: agree, quotes: c.evidence, source_id: k.source_id, model: r.model, prompt_v: task.v },
      confidence: c.confidence,
      inputHash: hash,
      stmt: () => ctx.env.CATALOG_DB.prepare(`UPDATE sku SET review_status='rejected', reject_reason=?, reviewed_at=? WHERE id=? AND review_status='new'`).bind(reason, ctx.t, id),
    })
    ctx.count('listings_rejected')
    return 'next'
  }

  // ---- the Review prefill
  const old = parse(k.guess, {})
  const guess = mergeGuess(old, c, { title: input.title, text: input.text, sourceId: k.source_id, model: r.model, v: task.v })
  if (sameGuess(old, guess)) return 'next'
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

// Sources where every pending listing was rejected (say a multirotor URL
// added by mistake): one question for the owner — pause that source?
async function flagSources(ctx) {
  for (const [source, t] of Object.entries(ctx.cursor.srcTally ?? {})) {
    if (t.seen < SOURCE_FLAG_MIN || t.rejected < t.seen) continue
    const hash = await inputHash({ issue: 'source-all-rejected', source, n: t.seen })
    const open = await ctx.env.CATALOG_DB.prepare(`SELECT 1 AS x FROM curator_action WHERE kind='escalate' AND entity='run' AND status IN ('planned','skipped') AND input_hash=? LIMIT 1`).bind(hash).first()
    if (open) continue
    ctx.escalate({
      entity: 'run',
      entityId: null,
      inputHash: hash,
      before: { field: 'source', value: source },
      after: { field: 'source', value: 'pause?' },
      evidence: { issue: 'source-all-rejected', source_id: source, n: t.seen, why: `all ${t.seen} pending listings from ${source} were rejected as not planes; pause that source URL?` },
    })
  }
}
