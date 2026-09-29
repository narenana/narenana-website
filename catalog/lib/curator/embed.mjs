// Embed phase (design § 6): one vector per model page and per pending
// listing, refreshed only when the text it is built from changes. Up to 100
// texts per bge-m3 call. Embeddings are written in dry runs too (they change
// nothing a shopper or the owner sees).

import { masterText, listingText, quantize } from '../vectors.mjs'
import { sha256Hex } from '../ai.mjs'

const parse = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }
const spanOf = (specs) => { const v = Number(parse(specs, {})?.spanMM); return v > 0 ? v : null }
export const EMBED_BATCH = 100
const ROWS_PER_STMT = 14 // 7 columns → 98 bound parameters

// Every item that should have a vector now: [{k: 'm:ID' | 's:ID', text}].
export async function embedItems(env, { lst = {}, scope = null } = {}) {
  const masters = (await env.CATALOG_DB.prepare(
    `SELECT m.id, m.brand, m.name, m.specs, (SELECT GROUP_CONCAT(k.title, char(31)) FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id) AS titles
     FROM master_model m WHERE m.status IN ('ready','draft') ORDER BY m.id`,
  ).all()).results ?? []
  const skus = (await env.CATALOG_DB.prepare(
    `SELECT id, title, guess FROM sku WHERE review_status='new' AND dead=0 AND flagged IS NULL AND enriched_at IS NOT NULL ORDER BY id`,
  ).all()).results ?? []
  const out = []
  for (const m of masters) {
    if (scope && !scope.masters.includes(m.id)) continue
    out.push({ k: `m:${m.id}`, text: masterText(m, String(m.titles ?? '').split('\u001f'), spanOf(m.specs)) })
  }
  for (const s of skus) {
    if (scope && !scope.skus.includes(s.id)) continue
    const g = parse(s.guess, {}) ?? {}
    const f = lst[s.id] ?? {}
    out.push({ k: `s:${s.id}`, text: listingText({ brand: f.brand || g.brand || '', title: s.title ?? '', spanMM: f.spanMM ?? g.spanMM ?? null }) })
  }
  return out
}

const entityOf = (k) => (k.startsWith('m:') ? 'master' : 'sku')
const idOf = (k) => Number(k.slice(2))

export async function embedPhase(ctx) {
  const { cursor, ai } = ctx
  if (!ai.enabled) return 'done' // curator_ai=0: env.AI is never called
  const model = ai.modelFor('embed')
  if (!model) { ctx.count('embed_unavailable'); return 'done' }
  if (!cursor.queue) {
    if (ctx.late() || !ctx.room(6)) return 'more'
    const items = await embedItems(ctx.env, { lst: cursor.lst ?? {}, scope: cursor.scope ?? null })
    const have = new Map(((await ctx.env.CATALOG_DB.prepare(`SELECT entity, entity_id, input_hash, model FROM embedding`).all()).results ?? [])
      .map((r) => [`${r.entity === 'master' ? 'm' : 's'}:${r.entity_id}`, r]))
    const queue = []
    for (const it of items) {
      const hash = await sha256Hex(it.text)
      const h = have.get(it.k)
      if (!h || h.input_hash !== hash || h.model !== model) queue.push({ k: it.k, text: it.text, hash })
    }
    // vectors of pages merged away or listings decided since: gone
    if (!cursor.scope) {
      const live = new Set(items.map((x) => x.k))
      const stale = [...have.keys()].filter((k) => !live.has(k))
      if (stale.length) {
        for (let i = 0; i < stale.length; i += 90) {
          const part = stale.slice(i, i + 90)
          ctx.stmts.push(ctx.env.CATALOG_DB.prepare(`DELETE FROM embedding WHERE (entity || ':' || entity_id) IN (${part.map(() => '?').join(',')})`)
            .bind(...part.map((k) => `${entityOf(k)}:${idOf(k)}`)))
        }
      }
    }
    cursor.queue = queue
    cursor.idx = 0
    ctx.count('embed_queued', queue.length)
  }
  while (cursor.idx < cursor.queue.length) {
    const chunk = cursor.queue.slice(cursor.idx, cursor.idx + EMBED_BATCH)
    if (ctx.late() || !ctx.room(Math.ceil(chunk.length / ROWS_PER_STMT) + 2) || !ctx.meter.canAi()) return 'more'
    const r = await ai.embed(chunk.map((x) => x.text), { item: 'embed' })
    if (r.status === 'deferred') return 'more'
    if (r.status !== 'ok') {
      // cap, allocation or a failed call: no new vectors today; dedup still
      // runs on the heuristics and the vectors it has
      ctx.count(`embed_${r.status}`)
      return 'done'
    }
    const rows = chunk.map((x, i) => {
      const qv = quantize(r.vectors[i])
      return [entityOf(x.k), idOf(x.k), r.model, x.hash, qv.scale, qv.vec, ctx.t]
    })
    for (let i = 0; i < rows.length; i += ROWS_PER_STMT) {
      const part = rows.slice(i, i + ROWS_PER_STMT)
      ctx.stmts.push(ctx.env.CATALOG_DB.prepare(
        `INSERT INTO embedding (entity, entity_id, model, input_hash, scale, vec, updated_at) VALUES ${part.map(() => '(?,?,?,?,?,?,?)').join(',')}
         ON CONFLICT(entity, entity_id) DO UPDATE SET model=excluded.model, input_hash=excluded.input_hash, scale=excluded.scale, vec=excluded.vec, updated_at=excluded.updated_at`,
      ).bind(...part.flat()))
    }
    ctx.count('embedded', chunk.length)
    cursor.idx += chunk.length
  }
  return 'done'
}
