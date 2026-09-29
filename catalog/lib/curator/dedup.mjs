// Dedup inside the curator (design § 6): candidates → judge → merge.
//
// candidates  the union of (a) each changed page's top 5 embedding neighbours
//             with cosine ≥ 0.80, (b) the heuristic pairs of findDuplicates
//             (grouped by brandKey), (c) every pending merge_candidate; minus
//             pairs the owner rejected (directly, inherited, or by an
//             unmerge) and pairs naming a page with an open directive. For
//             each pending airframe listing, its nearest pages: an attach
//             candidate, a new-plane candidate, or a question for the owner.
// judge       pair-v1 on the primary model for every candidate; the second
//             opinion (a different family) only when the primary says same
//             at ≥ 0.90 and the deterministic gates G1–G6 pass.
// merge       auto-merge only pairs that pass every gate and both verdicts
//             (G7), in fully connected clusters of at most 4 (G8), at most
//             curator_automerge_max per run (G9); the same gates attach a new
//             listing to an existing page. Everything else goes to the owner
//             with the verdict and evidence attached.
//
// A pair's verdict is stored with the hash of its input (merge_candidate
// .ai_verdict), so an unchanged pair is never judged twice, and a pending
// pair whose inputs change is judged again.

import { brandKey, isBlankBrand, checkPair, coercePair } from './validate.mjs'
import { PAIR_TASK } from './prompts.mjs'
import { inputHash } from '../ai.mjs'
import { decode, nearest, NEIGHBOUR_MIN } from '../vectors.mjs'
import { compare, findDuplicates, sizeTokens, brandConfirmed, NOISE } from '../dedup.mjs'
import { extractSpanMM } from '../adapters.mjs'
import { normName, slugify } from '../util.mjs'
import { powerType } from '../public.mjs'
import { nameLint } from '../product-overview.mjs'
import { resolveLanding } from '../grid-next.mjs'
import { loadLocks, openActionKeys, actionKey, PROTECTED_ROLE_SOURCES } from './store.mjs'
import { loadMergeSnapshot, planMerge, mergeStatements, attachSku, draftStatements, survivorInfo, pickSurvivor } from './merge.mjs'
import { nameSmell } from './validate.mjs'

const parse = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }
export const PRIMARY_SAME = 0.9
export const SECOND_SAME = 0.85
export const PRIMARY_DIFFERENT = 0.9
export const ATTACH_KIND = 0.9
export const DRAFT_KIND = 0.95
export const ATTACH_LEAD = 0.05
export const CLUSTER_MAX = 4
export const NEW_PAIRS_PER_MASTER = 3
const MAX_PAIRS_PER_RUN = 400

// ----------------------------------------------------------- the pages
const META_COLS = `m.id, m.category_id, m.slug, m.status, m.brand, m.name, m.brand_norm, m.name_norm, m.specs, m.power, m.role_tags, m.role_source,
  (SELECT GROUP_CONCAT(k.title, char(31)) FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id) AS titles,
  (SELECT COUNT(*) FROM offer o WHERE o.master_model_id=m.id) AS offers,
  (SELECT COUNT(*) FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id AND k.review_status='approved' AND k.in_stock=1 AND k.dead=0) AS live`
export async function loadMeta(env, ids = null) {
  if (ids && !ids.length) return []
  const sql = ids
    ? `SELECT ${META_COLS} FROM master_model m WHERE m.id IN (${ids.map(() => '?').join(',')})`
    : `SELECT ${META_COLS} FROM master_model m WHERE m.status IN ('ready','draft') ORDER BY m.id`
  return (await env.CATALOG_DB.prepare(sql).bind(...(ids ?? [])).all()).results ?? []
}

const inchSpan = (t) => {
  const m = String(t ?? '').match(/(\d{2}(?:\.\d)?)\s*(?:"|″|in\b|inch)/i)
  const v = m ? Math.round(parseFloat(m[1]) * 25.4) : null
  return v && v >= 300 && v <= 3000 ? v : null
}
export const titleSpan = (t) => extractSpanMM(t) ?? inchSpan(t)
const specSpan = (specs) => { const v = Number(parse(specs, {})?.spanMM); return v > 0 ? v : null }

// A page as the gates see it. planned: this dry run's planned fills
// ({id: {brand, spanMM}}), so a dry run judges what a live run would.
export function eff(m, planned = null) {
  const p = planned?.[m.id] ?? {}
  const titles = String(m.titles ?? '').split('\u001f').filter(Boolean)
  return {
    ...m,
    brand: isBlankBrand(m.brand) && p.brand ? p.brand : m.brand ?? '',
    spanMM: specSpan(m.specs) ?? p.spanMM ?? null,
    titles,
    titleSpans: titles.map(titleSpan).filter(Boolean),
    inStock: (m.live ?? 0) > 0,
  }
}

// ------------------------------------------------------------- tolerances
export const spanTol = (x, y) => Math.abs(x - y) <= 25 || Math.abs(x - y) / Math.max(x, y) <= 0.03

// ---------------------------------------------------------- name core (G4)
// After removing noise words (dedup.mjs), configuration phrases, colours and
// livery words (and the word before "scheme") and brand words, the core
// words; numbers apart ("1400mm" → "1400").
const PHRASES = /\b(kit only|pnp combo|crash a lot|with(?:out)? electronics?|air ?frame|frame only|plug (?:n|and) play|ready to fly|almost ready|bnf|pnf|set)\b/g
const LIVERY = new Set(['white', 'black', 'red', 'blue', 'green', 'orange', 'yellow', 'grey', 'gray', 'silver', 'pink', 'purple', 'camo', 'camouflage', 'scheme', 'livery'])
export function nameParts(name, brand = '') {
  let s = ` ${normName(name)} `
  s = s.replace(/ [a-z0-9]+ scheme /g, ' ').replace(PHRASES, ' ')
  const bw = new Set(normName(brand).split(' ').filter(Boolean))
  const bk = brandKey(brand)
  const core = new Set()
  const nums = new Set()
  for (const w of s.split(' ').filter(Boolean)) {
    if (bw.has(w) || (bk.length >= 3 && brandKey(w) === bk)) continue
    if (NOISE.has(w) || LIVERY.has(w)) continue
    if (/^\d/.test(w)) nums.add(w.replace(/^(\d+)mm$/, '$1'))
    else core.add(w)
  }
  return { core, nums }
}
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))
// A number on one side only is a different model, unless it is a size the
// pair's known wingspan already accounts for ("Ranger 600" vs "Ranger", 600 mm).
function numConsistent(tok, spans) {
  const m = tok.match(/^(\d{2,4})(cm|in)?$/)
  if (!m) return false
  const v = Number(m[1]) * (m[2] === 'cm' ? 10 : m[2] === 'in' ? 25.4 : 1)
  if (!m[2] && v < 200) return false
  return spans.some((s) => s && spanTol(v, s))
}

// ----------------------------------------------------------------- gates
// G1–G6 for two pages (or a page and a listing). ctx: { rejected,
// directive, locksA, locksB, listing, modelA, modelB }. Returns the list of
// failures ([] = all pass), each "G<n> …".
export function gates(a, b, c = {}) {
  const fails = []
  // G1 scope
  if (a.category_id !== b.category_id) fails.push('G1 different category')
  for (const m of c.listing ? [a] : [a, b]) if (!['ready', 'draft'].includes(m.status)) fails.push(`G1 #${m.id} is ${m.status}`)
  if (c.directive) fails.push('G1 an open directive names one of them')
  if (c.rejected) fails.push('G1 the owner rejected this pair')
  if (c.locked) fails.push('G1 the owner decided this listing')
  // G2 brand
  if (isBlankBrand(a.brand) || isBlankBrand(b.brand)) fails.push('G2 a brand is blank or unverified')
  else if (brandKey(a.brand) !== brandKey(b.brand)) fails.push(`G2 brand ${a.brand} vs ${b.brand}`)
  // G3 size
  const g3 = sizeGate(a, b)
  if (g3) fails.push(`G3 ${g3}`)
  // G4 name core, and no version or size number on one side only
  const pa = nameParts(a.name, a.brand)
  const pb = nameParts(b.name, b.brand)
  const sameModel = c.modelA && c.modelB && normName(c.modelA) === normName(c.modelB)
  if (!sameModel) {
    if (!pa.core.size || !setEq(pa.core, pb.core)) fails.push(`G4 names differ (${[...pa.core].join(' ') || '—'} vs ${[...pb.core].join(' ') || '—'})`)
    const spans = [a.spanMM, b.spanMM, ...(a.titleSpans ?? []), ...(b.titleSpans ?? [])].filter(Boolean)
    const oneSided = [...[...pa.nums].filter((x) => !pb.nums.has(x)), ...[...pb.nums].filter((x) => !pa.nums.has(x))]
    const bad = oneSided.filter((x) => !numConsistent(x, spans))
    if (bad.length) fails.push(`G4 ${bad.join(', ')} on one side only`)
  }
  // G5 power
  if (a.power && b.power && a.power !== b.power) fails.push(`G5 power ${a.power} vs ${b.power}`)
  // G6 what the owner locked
  const la = c.locksA ?? new Map()
  const lb = c.locksB ?? new Map()
  const locked = (l, f) => ['owner', 'directive'].includes(l.get(f))
  if (locked(la, 'brand') && locked(lb, 'brand') && brandKey(a.brand) !== brandKey(b.brand)) fails.push('G6 your brands differ')
  if (locked(la, 'name') && locked(lb, 'name') && !setEq(pa.core, pb.core)) fails.push('G6 your names differ')
  if (locked(la, 'specs.spanMM') && locked(lb, 'specs.spanMM') && a.spanMM && b.spanMM && !spanTol(a.spanMM, b.spanMM)) fails.push('G6 your wingspans differ')
  if (!c.listing && PROTECTED_ROLE_SOURCES.has(a.role_source) && PROTECTED_ROLE_SOURCES.has(b.role_source)) {
    const ta = parse(a.role_tags, []) ?? []
    const tb = parse(b.role_tags, []) ?? []
    if (ta[0] && tb[0] && ta[0] !== tb[0]) fails.push(`G6 your role tags differ (${ta[0]} vs ${tb[0]})`)
  }
  return fails
}

// G3: both spans known → within 3% or 25 mm; one known → no size on the
// other side contradicts it; neither → a shared size.
function sizeGate(a, b) {
  const sa = a.spanMM
  const sb = b.spanMM
  if (sa && sb) return spanTol(sa, sb) ? null : `wingspan ${sa} vs ${sb} mm`
  const toks = (m) => [...sizeTokens(normName(m.name ?? '')), ...(m.titleSpans ?? [])]
  if (sa || sb) {
    const known = sa || sb
    const bad = toks(sa ? b : a).find((v) => !spanTol(v, known))
    return bad ? `size ${bad} vs wingspan ${known} mm` : null
  }
  const ta = toks(a)
  const tb = toks(b)
  return ta.some((x) => tb.some((y) => spanTol(x, y))) ? null : 'no wingspan on either side and no shared size'
}

// The rules-only obvious test (AI unavailable): compare().obvious, with the
// brand compared by brandKey.
export function rulesObvious(a, b) {
  if (isBlankBrand(a.brand) || brandKey(a.brand) !== brandKey(b.brand)) return false
  const bn = normName(a.brand)
  const spec = (m) => (m.spanMM ? JSON.stringify({ spanMM: m.spanMM }) : '{}')
  return compare({ brand_norm: bn, name_norm: normName(a.name), specs: spec(a) }, { brand_norm: bn, name_norm: normName(b.name), specs: spec(b) }).obvious
}

// ------------------------------------------------------------ pair input
export const side = (m, listings) => ({
  brand: m.brand ?? '',
  name: m.name ?? '',
  span_mm: m.spanMM ?? null,
  power: m.power ?? null,
  listings: (listings ?? []).slice(0, 5).map((l) => ({ shop: l.shop ?? '', title: l.title ?? '', config: l.config ?? '' })),
})
export async function loadListings(env, ids) {
  if (!ids.length) return new Map()
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT o.master_model_id AS mid, k.id AS sku_id, k.title, o.config, s.name AS shop FROM offer o JOIN sku k ON k.id=o.sku_id JOIN source s ON s.id=k.source_id
     WHERE o.master_model_id IN (${ids.map(() => '?').join(',')}) ORDER BY o.master_model_id, k.id`,
  ).bind(...ids).all()).results ?? []
  const out = new Map()
  for (const r of rows) {
    if (!out.has(r.mid)) out.set(r.mid, [])
    out.get(r.mid).push(r)
  }
  return out
}
// Master vs master: A is the lower id, so the input (and its cache key) does
// not depend on which side found the other.
export const mmInput = (a, b, lists) => {
  const [x, y] = a.id < b.id ? [a, b] : [b, a]
  return { A: side(x, lists.get(x.id)), B: side(y, lists.get(y.id)) }
}
// A listing as the B side of a pair: its checked facts.
export const listingSide = (f) => ({
  brand: f.brand ?? '',
  name: f.model ?? '',
  span_mm: f.spanMM ?? null,
  power: f.power ?? null,
  listings: [{ shop: f.shop ?? '', title: f.title ?? '', config: f.config ?? '' }],
})
// A fingerprint of what a planned merge was judged on, for "Apply this plan":
// the absorbed page's identity and listings and the survivor's identity (not
// its listings, which earlier merges in the same plan add to).
export const mergeFingerprint = (keep, absorb, lists) => inputHash({
  keep: { brand: keep.brand, name: keep.name, spanMM: keep.spanMM ?? null, status: keep.status },
  absorb: { brand: absorb.brand, name: absorb.name, spanMM: absorb.spanMM ?? null, status: absorb.status, skus: (lists.get(absorb.id) ?? []).map((l) => l.sku_id) },
})

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`)

// ============================================================ candidates
export async function candidatesPhase(ctx) {
  const { cursor } = ctx
  const env = ctx.env
  if (!cursor.queue) {
    if (ctx.late() || !ctx.room(6)) return 'more'
    const embRows = (await env.CATALOG_DB.prepare(`SELECT entity, entity_id, updated_at FROM embedding`).all()).results ?? []
    const since = cursor.scope ? -1 : ctx.state.vecAt ?? -1
    const scopeM = cursor.scope?.masters
    const changed = embRows.filter((r) => r.entity === 'master' && r.updated_at > since && (!scopeM || scopeM.includes(r.entity_id))).map((r) => `m:${r.entity_id}`)
    const hasVec = new Set(embRows.filter((r) => r.entity === 'sku').map((r) => r.entity_id))
    const lst = cursor.lst ?? {}
    const listings = Object.keys(lst).map(Number).filter((id) => lst[id].kind === 'airframe' && lst[id].confidence >= ATTACH_KIND && !lst[id].locked && hasVec.has(id)).map((id) => `s:${id}`)
    cursor.queue = [...changed.sort(), ...listings]
    cursor.idx = 0
    cursor.found = []
    cursor.lnb = {}
    ctx.count('vec_changed', changed.length)
  }
  if (cursor.idx < cursor.queue.length) {
    if (ctx.late() || !ctx.room(6)) return 'more'
    // this tick's pool: every page's vector (one read) and the meta for blocking
    const meta = new Map((await loadMeta(env)).map((m) => [m.id, eff(m, cursor.planned)]))
    const vecs = (await env.CATALOG_DB.prepare(`SELECT entity, entity_id, scale, vec FROM embedding WHERE entity='master'`).all()).results ?? []
    const pool = []
    for (const r of vecs) {
      const m = meta.get(r.entity_id)
      if (!m) continue
      pool.push({ id: r.entity_id, q: decode(r.vec), scale: r.scale, m })
    }
    const byId = new Map(pool.map((p) => [p.id, p]))
    const doneChanged = new Set(cursor.queue.slice(0, cursor.idx).filter((k) => k.startsWith('m:')).map((k) => Number(k.slice(2))))
    const scopeM = cursor.scope?.masters
    const listingIds = cursor.queue.slice(cursor.idx).filter((k) => k.startsWith('s:')).map((k) => Number(k.slice(2)))
    const lvecs = listingIds.length
      ? new Map(((await env.CATALOG_DB.prepare(`SELECT entity_id, scale, vec FROM embedding WHERE entity='sku' AND entity_id IN (${listingIds.map(() => '?').join(',')})`).bind(...listingIds).all()).results ?? [])
        .map((r) => [r.entity_id, { q: decode(r.vec), scale: r.scale }]))
      : new Map()
    const found = cursor.found
    while (cursor.idx < cursor.queue.length) {
      if (ctx.meter.vec >= ctx.meter.lim.vec || ctx.late()) break
      const key = cursor.queue[cursor.idx]
      const id = Number(key.slice(2))
      if (key.startsWith('m:')) {
        const item = byId.get(id)
        if (item) {
          const r = nearest(item, pool, {
            min: NEIGHBOUR_MIN,
            block: (x, p) => !doneChanged.has(p.id) && (!scopeM || scopeM.includes(p.id)) && blockOk(x.m, p.m),
          })
          ctx.meter.vec += r.compared
          for (const n of r.top) found.push([Math.min(id, n.id), Math.max(id, n.id), n.cos])
        }
        doneChanged.add(id)
      } else {
        const lv = lvecs.get(id)
        const f = cursor.lst?.[id]
        if (lv && f) {
          const item = { id: -id, ...lv, m: { category_id: f.catId, brand: f.brand, spanMM: f.spanMM, brand_norm: normName(f.brand ?? ''), titles: [f.title] } }
          const r = nearest(item, pool, { k: 3, min: 0.5, block: (x, p) => (!scopeM || scopeM.includes(p.id)) && blockOk(x.m, p.m) })
          ctx.meter.vec += r.compared
          cursor.lnb[id] = r.top
        }
      }
      cursor.idx++
    }
    if (cursor.idx < cursor.queue.length) return 'more'
  }
  // ---- all compared: assemble the day's pairs
  if (ctx.late() || !ctx.room(6)) return 'more'
  const all = (await loadMeta(env)).map((m) => eff(m, cursor.planned))
  const meta = new Map(all.map((m) => [m.id, m]))
  const mc = (await env.CATALOG_DB.prepare(`SELECT a_id, b_id, status, score, reason FROM merge_candidate`).all()).results ?? []
  const dirs = (await env.CATALOG_DB.prepare(`SELECT payload FROM curator_directive WHERE status='approved'`).all()).results ?? []
  const dirIds = new Set()
  for (const d of dirs) { const p = parse(d.payload, {}); for (const k of ['keep', 'absorb', 'id']) if (Number.isInteger(p?.[k])) dirIds.add(p[k]) }
  cursor.dirIds = [...dirIds]
  const rejected = new Set(mc.filter((r) => r.status === 'rejected').map((r) => pairKey(r.a_id, r.b_id)))
  const pairs = new Map() // key → {a, b, src:Set, score, cos}
  const add = (a, b, src, { score = 0, cos = 0 } = {}) => {
    if (a === b || !meta.has(a) || !meta.has(b)) return
    const k = pairKey(a, b)
    if (rejected.has(k) || dirIds.has(a) || dirIds.has(b)) return
    if (cursor.scope && !(cursor.scope.masters.includes(a) && cursor.scope.masters.includes(b))) return
    const p = pairs.get(k) ?? { a: Math.min(a, b), b: Math.max(a, b), src: [], score: 0, cos: 0 }
    if (!p.src.includes(src)) p.src.push(src)
    p.score = Math.max(p.score, score)
    p.cos = Math.max(p.cos, cos)
    pairs.set(k, p)
  }
  for (const [a, b, cos] of cursor.found ?? []) add(a, b, 'embedding', { cos })
  const withKey = all.map((m) => ({ ...m, brand_key: isBlankBrand(m.brand) ? '' : brandKey(m.brand), brand_norm: isBlankBrand(m.brand) ? '' : normName(m.brand), titles: m.titles.join(' | ') }))
  const dd = findDuplicates(withKey)
  for (const cl of dd.obviousClusters) for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) add(cl[i].id, cl[j].id, 'heuristic', { score: 1 })
  for (const p of dd.candidatePairs) add(p.a.id, p.b.id, 'heuristic', { score: p.score })
  for (const r of mc) if (r.status === 'pending') add(r.a_id, r.b_id, 'pending', { score: r.score ?? 0 })
  // closure: in a small group, judge every pair, so a cluster can be checked
  // for full connection (G8)
  const adj = new Map()
  for (const p of pairs.values()) {
    for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y) }
  }
  const seen = new Set()
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const comp = []
    const stack = [start]
    while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); comp.push(x); for (const y of adj.get(x) ?? []) stack.push(y) }
    if (comp.length < 3 || comp.length > CLUSTER_MAX) continue
    for (let i = 0; i < comp.length; i++) for (let j = i + 1; j < comp.length; j++) if (blockOk(meta.get(comp[i]), meta.get(comp[j]))) add(comp[i], comp[j], 'closure')
  }
  const list = [...pairs.values()]
  const stock = (p) => Number(meta.get(p.a).inStock && meta.get(p.b).inStock)
  list.sort((x, y) => stock(y) - stock(x) || y.score - x.score || y.cos - x.cos || x.a - y.a || x.b - y.b)
  // listings: attach candidates, new planes, or questions
  const lm = []
  cursor.newPlane = []
  cursor.lstAsk = {}
  for (const [sid, top] of Object.entries(cursor.lnb ?? {})) {
    const id = Number(sid)
    const best = top[0]
    const second = top[1]
    if (best && best.cos >= NEIGHBOUR_MIN) {
      if (!second || best.cos - second.cos >= ATTACH_LEAD) lm.push({ sku: id, m: best.id, cos: best.cos })
      else cursor.lstAsk[id] = 'two pages match about equally'
    } else cursor.newPlane.push(id)
  }
  cursor.pairs = [...list.slice(0, MAX_PAIRS_PER_RUN).map((p) => ({ k: 'mm', a: p.a, b: p.b, src: p.src, score: p.score, cos: p.cos })), ...lm.map((p) => ({ k: 'lm', ...p }))]
  cursor.found = null
  ctx.count('pairs', cursor.pairs.length)
  if (!cursor.scope) { ctx.state.vecAt = ctx.t; ctx.stateChanged = true }
  return 'done'
}

// Blocking for vector comparisons and closure: same category, compatible
// brands (equal keys, or one blank or not confirmed by its own titles), spans
// within 10% or unknown.
function blockOk(a, b) {
  if (!a || !b || a.category_id !== b.category_id) return false
  const blankA = isBlankBrand(a.brand)
  const blankB = isBlankBrand(b.brand)
  if (!blankA && !blankB && brandKey(a.brand) !== brandKey(b.brand)) {
    const t = (m) => (Array.isArray(m.titles) ? m.titles.join(' | ') : m.titles ?? '')
    if (brandConfirmed(normName(a.brand), t(a)) && brandConfirmed(normName(b.brand), t(b))) return false
  }
  if (a.spanMM && b.spanMM && Math.abs(a.spanMM - b.spanMM) / Math.max(a.spanMM, b.spanMM) > 0.1) return false
  return true
}

// ================================================================= judge
export async function judgePhase(ctx) {
  const { cursor } = ctx
  const env = ctx.env
  const pairs = cursor.pairs ?? []
  if (!cursor.queue) { cursor.queue = pairs.map((_, i) => i); cursor.idx = 0; cursor.obvious ??= []; cursor.newPairs ??= {} }
  const dirIds = new Set(cursor.dirIds ?? [])
  while (cursor.idx < cursor.queue.length) {
    if (ctx.late() || !ctx.room(10)) return 'more'
    const chunk = cursor.queue.slice(cursor.idx, cursor.idx + 3).map((i) => pairs[i])
    const ids = [...new Set(chunk.flatMap((p) => (p.k === 'mm' ? [p.a, p.b] : [p.m])))]
    const meta = new Map((await loadMeta(env, ids)).map((m) => [m.id, eff(m, cursor.planned)]))
    const lists = await loadListings(env, ids)
    const mmPairs = chunk.filter((p) => p.k === 'mm')
    const mc = mmPairs.length
      ? new Map(((await env.CATALOG_DB.prepare(`SELECT * FROM merge_candidate WHERE ${mmPairs.map(() => '(a_id=? AND b_id=?)').join(' OR ')}`).bind(...mmPairs.flatMap((p) => [p.a, p.b])).all()).results ?? [])
        .map((r) => [pairKey(r.a_id, r.b_id), r]))
      : new Map()
    const locks = await loadLocks(env, 'master', ids)
    const seen = await openActionKeys(env, 'master', ids)
    let info = null
    const keepOf = async (a, b) => {
      info ??= await survivorInfo(env, ids)
      const x = info.get(a)
      const y = info.get(b)
      return x && y ? pickSurvivor([x, y]).id : Math.min(a, b)
    }
    for (const p of chunk) {
      if (ctx.late() || !ctx.room(4)) return 'more'
      const out = await ctx.item(p.k === 'mm' ? `master:${p.a}` : `sku:${p.sku}`, () =>
        p.k === 'mm' ? judgeMM(ctx, p, { meta, lists, mc, locks, seen, dirIds, keepOf }) : judgeLM(ctx, p, { meta, lists, locks, dirIds }))
      if (out === 'stop') return 'more'
      cursor.idx++
    }
  }
  return 'done'
}

// The verdicts for one input: primary, then (if it and the gates allow) the
// second opinion. Returns {status, v1, v2, rules, complete} or 'stop'.
async function verdicts(ctx, input, fails, item, rulesOk) {
  const r1 = await ctx.ai.ask(PAIR_TASK, input, { role: 'primary', item, coerce: coercePair })
  if (r1.status === 'deferred') return 'stop'
  ctx.count(`pair_${r1.status}`)
  if (['off', 'unavailable', 'budget'].includes(r1.status)) return { status: 'rules', obvious: rulesOk && !fails.length, complete: false, models: [] }
  if (r1.status !== 'ok') return { status: r1.status, obvious: false, complete: true, models: [r1.model] }
  const v1 = checkPair(r1.output, input)
  const res = { status: 'ok', v1, models: [r1.model], complete: true, obvious: false }
  if (v1.verdict === 'different' && v1.confidence >= PRIMARY_DIFFERENT) { res.different = true; return res }
  const primaryOk = v1.verdict === 'same' && v1.confidence >= PRIMARY_SAME && (v1.config_or_colour_only || !(v1.differences ?? []).length)
  if (!primaryOk || fails.length) return res
  const r2 = await ctx.ai.ask(PAIR_TASK, input, { role: 'second', item, coerce: coercePair })
  if (r2.status === 'deferred') return 'stop'
  ctx.count(`pair2_${r2.status}`)
  if (r2.status !== 'ok') { res.complete = r2.status === 'invalid' || r2.status === 'error'; res.secondMissing = r2.status; return res }
  const v2 = checkPair(r2.output, input)
  res.v2 = v2
  res.models.push(r2.model)
  res.obvious = v2.verdict === 'same' && v2.confidence >= SECOND_SAME
  return res
}

const brief = (v) => (v ? { verdict: v.verdict, confidence: v.confidence, same_manufacturer: v.same_manufacturer, same_size: v.same_size, config_or_colour_only: v.config_or_colour_only, differences: v.differences, evidence: v.evidence, name: v.name } : null)
const verdictDoc = (r, fails, hash, t, extra = {}) => ({
  verdict: r.v1?.verdict ?? (r.status === 'rules' ? 'rules-only' : r.status),
  confidence: r.v1?.confidence ?? null,
  primary: brief(r.v1),
  second: brief(r.v2),
  models: r.models,
  prompt_v: PAIR_TASK.v,
  gates: fails,
  hash,
  complete: r.complete,
  at: t,
  ...extra,
})

async function judgeMM(ctx, p, { meta, lists, mc, locks, seen, dirIds, keepOf }) {
  const a = meta.get(p.a)
  const b = meta.get(p.b)
  if (!a || !b) return 'next' // merged away or retired since
  const input = mmInput(a, b, lists)
  const hash = await inputHash({ task: PAIR_TASK.v, input })
  const row = mc.get(pairKey(p.a, p.b))
  if (row?.status === 'rejected') return 'next'
  const prior = parse(row?.ai_verdict, null)
  if (prior?.hash === hash && prior.complete && ['pending', 'dismissed'].includes(row.status)) return 'next' // judged already, nothing changed
  // at most 3 new pairs a day for any one page (both in stock first, by the order)
  const np = ctx.cursor.newPairs
  if ((np[p.a] ?? 0) >= NEW_PAIRS_PER_MASTER || (np[p.b] ?? 0) >= NEW_PAIRS_PER_MASTER) { ctx.count('pairs_capped'); return 'next' }
  np[p.a] = (np[p.a] ?? 0) + 1
  np[p.b] = (np[p.b] ?? 0) + 1
  const fails = gates(a, b, { directive: dirIds.has(a.id) || dirIds.has(b.id), locksA: locks.get(a.id), locksB: locks.get(b.id), modelA: ctx.cursor.models?.[a.id], modelB: ctx.cursor.models?.[b.id] })
  const r = await verdicts(ctx, input, fails, `master:${p.a}`, rulesObvious(a, b))
  if (r === 'stop') return 'stop'
  const keep = await keepOf(p.a, p.b)
  const doc = verdictDoc(r, fails, hash, ctx.t, { keep_id: keep, sources: p.src, cos: p.cos || null })
  if (r.obvious) {
    ctx.cursor.obvious.push({ a: p.a, b: p.b, hash, doc })
    ctx.count('pairs_obvious')
    return 'next'
  }
  const dismissed = !!r.different
  const status = dismissed ? 'dismissed' : 'pending'
  if (!r.complete && !dismissed) {
    // the second opinion (or all AI) was not available: ask again another day
    doc.outcome = 'waiting'
  }
  const source = p.src.includes('pending') && row?.source ? row.source : p.src.includes('heuristic') ? 'heuristic' : p.src.includes('embedding') ? 'embedding' : row?.source ?? 'heuristic'
  const reason = dismissed ? `AI: different (${Math.round((r.v1?.confidence ?? 0) * 100)}%)${r.v1?.differences?.length ? ': ' + r.v1.differences.join(', ') : ''}`
    : fails.length ? fails[0] : r.v1 ? `AI: ${r.v1.verdict} (${Math.round((r.v1.confidence ?? 0) * 100)}%)` : 'needs a look'
  ctx.write(ctx.env.CATALOG_DB.prepare(
    `INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, ai_verdict, keep_id, source) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(a_id, b_id) DO UPDATE SET ai_verdict=excluded.ai_verdict, keep_id=excluded.keep_id, reason=excluded.reason,
       status=CASE WHEN merge_candidate.status IN ('pending','dismissed') THEN excluded.status ELSE merge_candidate.status END,
       source=COALESCE(merge_candidate.source, excluded.source)`,
  ).bind(p.a, p.b, Math.max(p.score ?? 0, p.cos ?? 0, 0.5), reason.slice(0, 200), status, ctx.t, JSON.stringify(doc), keep, source))
  const kind = dismissed ? 'dismiss' : 'escalate'
  const issue = dismissed ? 'ai-different' : 'merge-review'
  const k = actionKey(kind, p.a, 'pair', issue, hash)
  if (seen.has(k)) return 'next'
  seen.add(k)
  const a0 = { entity: 'master', entityId: p.a, otherId: p.b, inputHash: hash, confidence: r.v1?.confidence ?? null, before: { field: 'pair', value: status === 'dismissed' ? row?.status ?? null : null }, after: { field: 'pair', value: status, keep_id: keep }, evidence: { issue, ...doc } }
  if (dismissed) ctx.change({ ...a0, kind })
  else ctx.escalate(a0)
  ctx.count(dismissed ? 'pairs_dismissed' : 'pairs_escalated')
  return 'next'
}

async function judgeLM(ctx, p, { meta, lists, locks, dirIds }) {
  const m = meta.get(p.m)
  const f = ctx.cursor.lst?.[p.sku]
  if (!m || !f) return 'next'
  const input = { A: side(m, lists.get(m.id)), B: listingSide(f) }
  const hash = await inputHash({ task: PAIR_TASK.v, input })
  const l = { id: `sku ${p.sku}`, category_id: f.catId, status: 'new', brand: f.brand ?? '', name: f.model ?? '', spanMM: f.spanMM ?? null, power: f.power ?? null, titleSpans: [titleSpan(f.title)].filter(Boolean), titles: [f.title] }
  const fails = gates(m, l, { listing: true, directive: dirIds.has(m.id), locked: f.locked, locksA: locks.get(m.id) })
  if (!f.model) fails.push('G4 the listing has no checked model name')
  const r = await verdicts(ctx, input, fails, `sku:${p.sku}`, false)
  if (r === 'stop') return 'stop'
  const doc = verdictDoc(r, fails, hash, ctx.t, { master: m.id, cos: p.cos })
  if (r.obvious) { ctx.cursor.obvious.push({ sku: p.sku, m: m.id, hash, doc }); ctx.count('attach_obvious'); return 'next' }
  const ask = (ctx.cursor.lstJudged ??= {})
  ask[p.sku] = { master: m.id, different: !!r.different, doc }
  return 'next'
}

// ================================================================= merge
export async function mergePhase(ctx) {
  const { cursor } = ctx
  const env = ctx.env
  if (!cursor.queue) {
    if (ctx.late() || !ctx.room(8)) return 'more'
    cursor.queue = await buildOps(ctx)
    cursor.idx = 0
  }
  while (cursor.idx < cursor.queue.length) {
    if (ctx.late()) return 'more'
    const op = cursor.queue[cursor.idx]
    const out = await ctx.item(op.op === 'merge' ? `master:${op.keep}` : `sku:${op.sku}`, () =>
      op.op === 'merge' ? doMerge(ctx, op) : op.op === 'attach' ? doAttach(ctx, op) : op.op === 'draft' ? doDraft(ctx, op) : doAsk(ctx, op))
    if (out === 'stop') return 'more'
    cursor.idx++
  }
  return 'done'
}

// The day's operations: merges (G8 cliques around each cluster's survivor,
// G9 cap), attaches, new drafts, and the listings left for the owner.
async function buildOps(ctx) {
  const { cursor } = ctx
  const env = ctx.env
  const ops = []
  const obvious = cursor.obvious ?? []
  const mm = obvious.filter((o) => o.a != null)
  const ok = new Set(mm.map((o) => pairKey(o.a, o.b)))
  const byPair = new Map(mm.map((o) => [pairKey(o.a, o.b), o]))
  const adj = new Map()
  for (const o of mm) for (const [x, y] of [[o.a, o.b], [o.b, o.a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y) }
  const info = await survivorInfo(env, [...adj.keys()])
  const cap = Math.max(0, Number(ctx.settings.curator_automerge_max ?? 25))
  let planned = cursor.counts?.merges ?? 0
  const seen = new Set()
  for (const start of [...adj.keys()].sort((x, y) => x - y)) {
    if (seen.has(start)) continue
    const comp = []
    const stack = [start]
    while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); comp.push(x); for (const y of adj.get(x) ?? []) stack.push(y) }
    const members = comp.map((id) => info.get(id)).filter(Boolean)
    if (members.length < 2) continue
    const keep = pickSurvivor(members)
    // G8: grow a fully connected group around the survivor, best-ranked first
    const clique = [keep.id]
    const rest = members.filter((m) => m.id !== keep.id).sort((x, y) => (pickSurvivor([x, y]) === x ? -1 : 1))
    for (const m of rest) {
      if (clique.length >= CLUSTER_MAX) break
      if (clique.every((c) => ok.has(pairKey(c, m.id)))) clique.push(m.id)
    }
    for (const absorb of clique.slice(1)) {
      if (planned >= cap) { ctx.count('merges_waiting'); continue } // G9: tomorrow
      planned++
      const o = byPair.get(pairKey(keep.id, absorb))
      ops.push({ op: 'merge', keep: keep.id, absorb, hash: o.hash, doc: o.doc, cluster: clique })
    }
    if (clique.length < comp.length) ctx.count('cluster_not_connected', comp.length - clique.length)
  }
  // attaches: one per listing
  const attached = new Set()
  for (const o of obvious.filter((x) => x.sku != null)) {
    if (attached.has(o.sku)) continue
    attached.add(o.sku)
    ops.push({ op: 'attach', sku: o.sku, m: o.m, hash: o.hash, doc: o.doc })
  }
  // new planes: no page within 0.80, or every close page judged different
  const judged = cursor.lstJudged ?? {}
  const newPlane = new Set(cursor.newPlane ?? [])
  for (const [sid, j] of Object.entries(judged)) if (j.different) newPlane.add(Number(sid))
  const drafts = (ctx.settings.curator_drafts ?? '1') !== '0'
  for (const id of newPlane) {
    if (attached.has(id)) continue
    const f = cursor.lst?.[id]
    const why = draftBlock(f)
    if (drafts && !why) ops.push({ op: 'draft', sku: id })
    else ops.push({ op: 'ask', sku: id, why: drafts ? why : 'new drafts are off (curator_drafts=0)' })
    attached.add(id)
  }
  // everything else the triage saw that is still pending: the owner decides
  for (const [sid, f] of Object.entries(cursor.lst ?? {})) {
    const id = Number(sid)
    if (attached.has(id) || f.rejected || f.locked) continue
    ops.push({ op: 'ask', sku: id, why: cursor.lstAsk?.[id] ?? (judged[id] ? 'the closest page is not clearly the same plane' : f.kind !== 'airframe' ? `the AI reads it as ${f.kind} (${f.confidence}), but no rule agrees` : f.confidence < ATTACH_KIND ? `not sure it is a plane (${f.confidence})` : 'no page to compare it with yet') })
  }
  return ops
}

// Why a listing cannot become a draft page on its own, or ''.
function draftBlock(f) {
  if (!f) return 'no checked facts'
  if (f.kind !== 'airframe' || f.confidence < DRAFT_KIND) return `kind confidence ${f.confidence} is below ${DRAFT_KIND}`
  if (!f.brand) return 'no brand stated in the listing'
  if (!f.model || nameLint(f.model) || nameSmell(f.model, f.brand)) return 'no clean model name in the listing'
  if (!f.spanMM) return 'no wingspan stated in the listing'
  return ''
}

// A dry run plans each change once per input: a second dry run the same day
// adds nothing.
async function plannedBefore(ctx, entity, id, kind, field, hash, issue = null) {
  if (ctx.live) return false
  const seen = await openActionKeys(ctx.env, entity, [id])
  return seen.has(actionKey(kind, id, field, issue, hash))
}

async function doMerge(ctx, op) {
  const { meter, cursor } = ctx
  if (ctx.live && meter.merges >= meter.lim.merges) return 'stop' // one merge per tick
  if (!ctx.room(ctx.live ? 26 : 4)) return 'stop'
  if (await plannedBefore(ctx, 'master', op.keep, 'merge', 'merge', op.hash)) { (cursor.absorbed ??= []).push(op.absorb); return 'next' }
  const snap = await loadMergeSnapshot(ctx.env, op.keep, op.absorb)
  if (!snap) { ctx.count('merge_gone'); return 'next' }
  const A = snap.a.row
  const B = snap.b.row
  if (!['ready', 'draft'].includes(A.status) || !['ready', 'draft'].includes(B.status) || (A.status === 'draft' && B.status === 'ready')) { ctx.count('merge_status_changed'); return 'next' }
  if (snap.b.x.cands.some((c) => c.status === 'rejected' && ((c.a_id === A.id && c.b_id === B.id) || (c.a_id === B.id && c.b_id === A.id)))) return 'next'
  const plan = planMerge(snap)
  const { stmts } = mergeStatements(ctx.env, snap, plan, { actor: 'curator', reason: `curator run ${ctx.run.id}: same plane`, t: ctx.t, aliases: true })
  if (ctx.live && !ctx.room(stmts.length + 1)) return 'stop' // next tick, with the whole budget
  const lists = new Map([[B.id, snap.b.x.offers.map((o) => ({ sku_id: o.sku_id }))]])
  const fp = await mergeFingerprint(eff(A, cursor.planned), eff(B, cursor.planned), lists)
  ctx.change({
    kind: 'merge',
    entity: 'master',
    entityId: A.id,
    otherId: B.id,
    inputHash: op.hash,
    confidence: op.doc?.primary?.confidence ?? null,
    before: { field: 'merge', value: { keep: { id: A.id, slug: A.slug, name: A.name }, absorb: { id: B.id, slug: B.slug, name: B.name, brand: B.brand } } },
    after: { field: 'merge', value: { survivor: A.id, took: plan.took, slug: plan.slugTo ?? A.slug, set: plan.set } },
    evidence: { ...op.doc, fp, cluster: op.cluster, why: 'same plane: every gate and both AI verdicts' },
    stmt: () => stmts,
  })
  meter.merges++
  ctx.count('merges')
  ;(cursor.touched ??= []).push(A.id)
  ;(cursor.absorbed ??= []).push(B.id)
  return 'next'
}

async function doAttach(ctx, op) {
  if (!ctx.room(8)) return 'stop'
  if (await plannedBefore(ctx, 'sku', op.sku, 'attach', 'review', op.hash)) return 'next'
  const f = ctx.cursor.lst?.[op.sku]
  const row = await ctx.env.CATALOG_DB.prepare(
    `SELECT k.id, k.review_status, k.title, (SELECT GROUP_CONCAT(k2.title, ' ') FROM offer o JOIN sku k2 ON k2.id=o.sku_id WHERE o.master_model_id=?) AS titles,
       (SELECT status FROM master_model WHERE id=?) AS mstatus FROM sku k WHERE k.id=?`,
  ).bind(op.m, op.m, op.sku).first()
  if (!row || row.review_status !== 'new' || !row.mstatus || !f) return 'next'
  const config = f.config || 'kit'
  const packQty = f.packQty || 1
  const power = powerType(`${row.titles ?? ''} ${row.title ?? ''}`)
  ctx.change({
    kind: 'attach',
    entity: 'sku',
    entityId: op.sku,
    otherId: op.m,
    inputHash: op.hash,
    confidence: op.doc?.primary?.confidence ?? null,
    before: { field: 'review', value: 'new' },
    after: { field: 'review', value: 'approved', master: op.m, config, pack_qty: packQty },
    evidence: { ...op.doc, why: 'same plane as an existing page: every gate and both AI verdicts' },
    stmt: () => [
      ...attachSku(ctx.env, op.sku, op.m, config, packQty, 'curator', { t: ctx.t, onlyNew: true }),
      ctx.env.CATALOG_DB.prepare(`UPDATE master_model SET power=? WHERE id=? AND EXISTS (SELECT 1 FROM offer WHERE sku_id=? AND master_model_id=?)`).bind(power, op.m, op.sku, op.m),
    ],
  })
  ctx.count('attached')
  return 'next'
}

async function doDraft(ctx, op) {
  if (!ctx.room(10)) return 'stop'
  const f = ctx.cursor.lst?.[op.sku]
  if (!f) return 'next'
  if (await plannedBefore(ctx, 'sku', op.sku, 'draft', 'review', f.hash ?? null, 'draft-to-publish')) return 'next'
  const slug = slugify(`${f.brand} ${f.model}`)
  const nn = normName(f.model)
  const bn = normName(f.brand)
  const clash = await ctx.env.CATALOG_DB.prepare(
    `SELECT (SELECT review_status FROM sku WHERE id=?) AS st,
       (SELECT id FROM master_model WHERE category_id=? AND (slug=? OR (brand_norm=? AND name_norm=?)) LIMIT 1) AS taken,
       (SELECT master_model_id FROM slug_alias WHERE category_id=? AND old_slug=?) AS alias,
       (SELECT image_url FROM sku WHERE id=?) AS image`,
  ).bind(op.sku, f.catId, slug, bn, nn, f.catId, slug, op.sku).first()
  if (!clash || clash.st !== 'new') return 'next'
  const why = !/^[a-z0-9-]{3,60}$/.test(slug) ? `the address "${slug}" is not valid`
    : slug === 'browse' || resolveLanding(slug) ? `"${slug}" is a reserved page name`
    : clash.taken ? `#${clash.taken} already has this address or name`
    : clash.alias ? `"${slug}" is an old address of #${clash.alias}` : ''
  if (why) return doAsk(ctx, { sku: op.sku, why })
  const d = { skuId: op.sku, catId: f.catId, slug, brand: f.brand, name: f.model, spanMM: f.spanMM, config: f.config || 'kit', packQty: f.packQty || 1, power: f.power ?? powerType(f.title), image: clash.image, confidence: f.confidence, runId: ctx.run.id }
  ctx.change({
    kind: 'draft',
    entity: 'sku',
    entityId: op.sku,
    inputHash: f.hash ?? null,
    confidence: f.confidence,
    before: { field: 'review', value: 'new' },
    after: { field: 'review', value: 'approved', draft: { slug, brand: f.brand, name: f.model, spanMM: f.spanMM, config: d.config } },
    evidence: { issue: 'draft-to-publish', kind: f.kind, brand_quote: f.brandQuote, span_quote: f.spanQuote, quotes: f.evidence, matches: ctx.cursor.lnb?.[op.sku] ?? [], why: 'a new plane: no page is the same model' },
    stmt: () => draftStatements(ctx.env, d, ctx.t),
  })
  ctx.count('drafts')
  return 'next'
}

async function doAsk(ctx, op) {
  if (!ctx.room(3)) return 'stop'
  const f = ctx.cursor.lst?.[op.sku]
  if (!f) return 'next'
  const matches = ctx.cursor.lnb?.[op.sku] ?? []
  const judged = ctx.cursor.lstJudged?.[op.sku] ?? null
  const hash = await inputHash({ listing: f.hash ?? null, matches: matches.map((x) => x.id), why: op.why })
  const seen = await openActionKeys(ctx.env, 'sku', [op.sku])
  const k = actionKey('escalate', op.sku, 'review', 'listing-review', hash)
  if (seen.has(k)) return 'next'
  ctx.escalate({
    entity: 'sku',
    entityId: op.sku,
    otherId: matches[0]?.id ?? null,
    inputHash: hash,
    confidence: f.confidence,
    before: { field: 'review', value: 'new' },
    after: { field: 'review', value: { kind: f.kind, brand: f.brand, name: f.model, spanMM: f.spanMM, config: f.config } },
    evidence: { issue: 'listing-review', why: op.why, kind: f.kind, confidence: f.confidence, source_id: f.source, matches, verdict: judged?.doc ?? null },
  })
  ctx.count('listings_asked')
  return 'next'
}
