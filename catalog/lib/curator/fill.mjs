// Fill, names and roles phases: the data fill-up for model pages (design § 8).
//
// One master-v1 call per page that needs something covers all three. The fill
// phase (before dedup) asks it and fills blanks; the names phase (after merges)
// and the roles phase reuse that answer from the cache, unless a merge changed
// the page in between.
//
//   field            filled automatically when                     otherwise
//   brand            blank / house / config word, not locked,      a real brand the AI contradicts
//                    quote verified, confidence ≥ 0.90, no clash   → ai-brand-conflict
//   brand spelling   same brandKey, other spelling, not locked     —
//                    → the spelling most pages use (or the owner's)
//   specs.spanMM     blank, not locked; ≥2 titles agree within 3%, titles disagree → ai-span-conflict
//                    or a verified quote with confidence ≥ 0.90
//   power            NULL → powerType(titles)                      AI says gas, rules electric → power-mismatch
//   name             not locked, fails nameLint or smells, answer  a proposal that is not sure enough,
//                    confidence ≥ 0.90, words from the old name or  not from the titles or clashing
//                    titles, lint-clean, no clash                   → name suggestion
//   role tags        role_source NULL or rules' catch-all, roles   confident rules that disagree
//                    confidence ≥ 0.80 after the owner's policy     → role suggestion
//   kind             never                                          fixed_wing:false → not-fixed-wing
// Never written: fields locked by the owner (field_src owner/directive),
// role_source reviewed/human, offers, blurbs, pop_boost, videos, status.

import { MASTER_TASK, MASTER_LISTINGS, MASTER_TEXT_CHARS } from './prompts.mjs'
import { checkMaster, coerceMaster, brandKey, isBlankBrand, nameSmell, tokenSubset } from './validate.mjs'
import { nameLint } from '../product-overview.mjs'
import { extractSpanMM } from '../adapters.mjs'
import { powerType, normalizeRoleTags } from '../public.mjs'
import { inputHash } from '../ai.mjs'
import { loadLocks, srcOf, isLocked, openActionKeys, actionKey, masterUpdate, PROTECTED_ROLE_SOURCES } from './store.mjs'
import { normName } from '../util.mjs'

export const CATCH_ALL = JSON.stringify(['Sport / Park Flyer'])
export const FILL_CONF = 0.9
export const NAME_CONF = 0.9
export const ROLE_CONF = 0.8
const SPAN_AGREE = 0.03

const parse = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }
export const spanOf = (m) => { const v = Number(parse(m.specs, {})?.spanMM); return v > 0 ? v : null }
const blankSpan = (m) => spanOf(m) == null

// What a page needs. spell = {brandKey: preferred spelling}.
export function needsOf(m, locks, spell = {}) {
  const n = {}
  const brandFree = !isLocked(locks, m.id, 'brand')
  if (brandFree && isBlankBrand(m.brand)) n.brand = true
  else if (brandFree && spell[brandKey(m.brand)] && spell[brandKey(m.brand)] !== m.brand) n.spelling = true
  if (blankSpan(m) && !isLocked(locks, m.id, 'specs.spanMM')) n.span = true
  if ((nameLint(m.name) || nameSmell(m.name, m.brand)) && !isLocked(locks, m.id, 'name')) n.name = true
  if (m.power == null) n.power = true
  if (!PROTECTED_ROLE_SOURCES.has(m.role_source) && !isLocked(locks, m.id, 'role_tags') && (m.role_source == null || (m.role_source === 'rules' && m.role_tags === CATCH_ALL))) n.roles = true
  return n
}
export const needsAi = (n) => !!(n.brand || n.span || n.name || n.roles)

// Brand spellings: for each brandKey spelled more than one way, the owner's
// own spelling if the owner set one, else the one most pages use (ties: the
// spelling of the oldest page).
export function brandSpellings(masters, locks) {
  const byKey = new Map()
  for (const m of [...masters].sort((a, b) => a.id - b.id)) {
    if (isBlankBrand(m.brand)) continue
    const k = brandKey(m.brand)
    if (!byKey.has(k)) byKey.set(k, new Map())
    const e = byKey.get(k).get(m.brand) ?? { n: 0, owner: false, first: m.id }
    e.n++
    if (srcOf(locks, m.id, 'brand') === 'owner') e.owner = true
    byKey.get(k).set(m.brand, e)
  }
  const out = {}
  for (const [k, spellings] of byKey) {
    if (spellings.size < 2) continue
    const ranked = [...spellings.entries()].sort((a, b) => Number(b[1].owner) - Number(a[1].owner) || b[1].n - a[1].n || a[1].first - b[1].first)
    out[k] = ranked[0][0]
  }
  return out
}

export function masterInput(m, listings) {
  return {
    brand: m.brand ?? '',
    name: m.name ?? '',
    span_mm: spanOf(m),
    power: m.power ?? null,
    tags: parse(m.role_tags, []) ?? [],
    listings: listings.slice(0, MASTER_LISTINGS).map((l) => ({ shop: l.shop ?? '', title: l.title ?? '', config: l.config ?? '', text: String(l.text ?? '').slice(0, MASTER_TEXT_CHARS) })),
  }
}

// ------------------------------------------------------------- loading
const MASTER_COLS = `m.id, m.category_id, m.slug, m.status, m.brand, m.name, m.brand_norm, m.name_norm, m.specs, m.power, m.role_tags, m.role_source`

async function loadAll(env) {
  return (await env.CATALOG_DB.prepare(`SELECT ${MASTER_COLS} FROM master_model m WHERE m.status IN ('ready','draft') ORDER BY m.id`).all()).results ?? []
}

async function loadChunk(ctx, ids) {
  const env = ctx.env
  const ph = ids.map(() => '?').join(',')
  const masters = (await env.CATALOG_DB.prepare(`SELECT ${MASTER_COLS} FROM master_model m WHERE m.id IN (${ph})`).bind(...ids).all()).results ?? []
  const offers = (await env.CATALOG_DB.prepare(
    `SELECT o.master_model_id AS mid, k.id AS sku_id, k.title, o.config, s.name AS shop, substr(sn.description, 1, ${MASTER_TEXT_CHARS}) AS text
     FROM offer o JOIN sku k ON k.id=o.sku_id JOIN source s ON s.id=k.source_id LEFT JOIN sku_snapshot sn ON sn.sku_id=k.id
     WHERE o.master_model_id IN (${ph}) ORDER BY o.master_model_id, k.id`,
  ).bind(...ids).all()).results ?? []
  const listings = new Map()
  for (const o of offers) {
    if (!listings.has(o.mid)) listings.set(o.mid, [])
    listings.get(o.mid).push(o)
  }
  const locks = await loadLocks(env, 'master', ids)
  const seen = await openActionKeys(env, 'master', ids)
  const byId = new Map(masters.map((m) => [m.id, m]))
  return { byId, listings, locks, seen }
}

// Another page already holding (category, brand_norm, name_norm): the UNIQUE
// key a brand or name change would collide with. One read per chunk.
async function clashes(ctx, wants) {
  if (!wants.length) return new Map()
  const names = [...new Set(wants.map((w) => w.nameNorm))]
  const rows = (await ctx.env.CATALOG_DB.prepare(
    `SELECT id, category_id, brand_norm, name_norm FROM master_model WHERE name_norm IN (${names.map(() => '?').join(',')})`,
  ).bind(...names).all()).results ?? []
  const taken = new Map(rows.map((r) => [`${r.category_id}|${r.brand_norm}|${r.name_norm}`, r.id]))
  const out = new Map()
  for (const w of wants) {
    const k = `${w.category}|${w.brandNorm}|${w.nameNorm}`
    const other = taken.get(k)
    if (other != null && other !== w.id) out.set(w.key, other)
    else taken.set(k, w.id) // two changes in this chunk may not take the same key either
  }
  return out
}

// The page's AI answer: this run's memo (so names and roles reuse the fill
// phase's call), else the cache, else a new call. null when there is none.
async function answer(ctx, m, input, { fresh = false } = {}) {
  const memoKey = !fresh && ctx.cursor.memo?.[m.id]
  if (memoKey) {
    await ctx.ai.preload([memoKey])
    const hit = ctx.ai.cache.get(memoKey)
    if (hit) {
      ctx.ai.cacheHits++
      return { status: hit.status, output: hit.output, key: memoKey, cached: true, model: hit.model }
    }
  }
  const r = await ctx.ai.ask(MASTER_TASK, input, { item: `master:${m.id}`, coerce: coerceMaster })
  if (r.key && (r.status === 'ok' || r.status === 'invalid')) (ctx.cursor.memo ??= {})[m.id] = r.key
  return r
}

// A phase over masters: build the queue once, then chunks of up to 6 pages
// per tick. perMaster returns a plan; finish writes the chunk's plans.
async function masterPhase(ctx, { build, perMaster, finish }) {
  const { cursor } = ctx
  if (!cursor.queue) {
    const ids = await build(ctx)
    cursor.queue = cursor.scope ? ids.filter((id) => cursor.scope.masters.includes(id)) : ids
    cursor.idx = 0
  }
  while (cursor.idx < cursor.queue.length) {
    if (ctx.late() || !ctx.room(8)) return 'more'
    const start = cursor.idx
    const ids = cursor.queue.slice(start, start + 6)
    try {
      const chunk = await loadChunk(ctx, ids)
      // one cache read for the chunk: this run's answers (memo) and the keys
      // the pages' current inputs would use
      const keys = await Promise.all([...chunk.byId.values()].map((m) => ctx.ai.keyFor(MASTER_TASK, masterInput(m, chunk.listings.get(m.id) ?? []))))
      await ctx.ai.preload([...keys, ...ids.map((id) => ctx.cursor.memo?.[id])])
      const plans = []
      let stop = false
      for (const id of ids) {
        // the chunk's plans are written by finish(), so reserve room for them too
        if (ctx.late() || !ctx.room(3 * (plans.length + 1) + 1)) { stop = true; break }
        const m = chunk.byId.get(id)
        if (!m) { cursor.idx++; continue } // merged away or retired since the queue was built
        const outcome = await ctx.item(`master:${id}`, async () => {
          const p = await perMaster(ctx, m, chunk)
          if (p === 'stop') return 'stop'
          if (p) plans.push(p)
          return 'next'
        })
        if (outcome === 'stop') { stop = true; break }
        cursor.idx++
      }
      await finish(ctx, plans, chunk)
      if (stop) return 'more'
    } catch (e) {
      // The tick's budget ran out mid-chunk: nothing of this chunk is written,
      // so do the whole chunk again next tick (its AI answers are cached).
      if (e?.name === 'BudgetExhausted') cursor.idx = start
      throw e
    }
  }
  return 'done'
}

// Record one finding unless the same one (same kind, field, issue and input)
// is already open or was dismissed.
function note(ctx, chunk, a) {
  const k = actionKey(a.kind, a.entityId, a.after?.field, a.evidence?.issue, a.inputHash)
  if (chunk.seen.has(k)) return false
  chunk.seen.add(k)
  if (a.kind === 'escalate') ctx.escalate(a)
  else ctx.change(a)
  return true
}

const evidenceOf = (r, extra = {}) => ({ model: r?.model ?? null, prompt_v: MASTER_TASK.v, ...extra })

// ================================================================ fill
export async function fillPhase(ctx) {
  return masterPhase(ctx, {
    async build(ctx) {
      const all = await loadAll(ctx.env)
      const locks = await loadLocks(ctx.env, 'master')
      const spell = brandSpellings(all, locks)
      ctx.cursor.spell = spell
      return all.filter((m) => Object.keys(needsOf(m, locks, spell)).length).map((m) => m.id)
    },
    async perMaster(ctx, m, chunk) {
      const n = needsOf(m, chunk.locks, ctx.cursor.spell ?? {})
      if (!Object.keys(n).length) return null
      const listings = chunk.listings.get(m.id) ?? []
      const input = masterInput(m, listings)
      let r = null
      if (needsAi(n)) {
        r = await answer(ctx, m, input, { fresh: true })
        if (r.status === 'deferred') return 'stop'
        ctx.count(`master_${r.status}`)
      }
      return { m, n, listings, input, r, c: r?.status === 'ok' ? checkMaster(r.output, input) : null, hash: await inputHash({ task: MASTER_TASK.v, input }) }
    },
    async finish(ctx, plans, chunk) {
      // brand changes that would take another page's (brand, name) key
      const wants = []
      for (const p of plans) {
        p.brandTo = planBrand(p, ctx.cursor.spell ?? {})
        if (p.brandTo) wants.push({ key: `b${p.m.id}`, id: p.m.id, category: p.m.category_id, brandNorm: normName(p.brandTo.to), nameNorm: p.m.name_norm })
      }
      const clash = await clashes(ctx, wants)
      for (const p of plans) writeFill(ctx, chunk, p, clash.get(`b${p.m.id}`))
    },
  })
}

// The brand change a plan makes, or null. {to, src, confidence, why}
function planBrand(p, spell) {
  const { m, n, c } = p
  if (n.brand && c?.brand && c.brandConf >= FILL_CONF) return { to: c.brand, src: 'curator', confidence: c.brandConf, quote: c.brandQuote }
  if (n.spelling) return { to: spell[brandKey(m.brand)], src: 'rules', confidence: 1, why: 'same brand, the spelling most pages use' }
  return null
}

function writeFill(ctx, chunk, p, clashId) {
  const { m, n, c, r, listings, hash } = p
  const id = m.id
  const ch = {}
  const titles = listings.map((l) => l.title ?? '')
  const base = { entity: 'master', entityId: id, inputHash: hash }

  // ---- brand
  if (p.brandTo) {
    const b = p.brandTo
    if (clashId != null) {
      note(ctx, chunk, { ...base, kind: 'fill', status: 'skipped', before: { field: 'brand', value: m.brand }, after: { field: 'brand', value: b.to, src: b.src },
        evidence: evidenceOf(r, { issue: 'duplicate', skipped: `#${clashId} already has this brand and name`, quote: b.quote ?? null }), confidence: b.confidence, otherId: clashId })
    } else if (note(ctx, chunk, { ...base, kind: 'fill', before: { field: 'brand', value: m.brand }, after: { field: 'brand', value: b.to, src: b.src },
      evidence: evidenceOf(b.src === 'rules' ? null : r, { quote: b.quote ?? null, why: b.why ?? null }), confidence: b.confidence, fieldSrc: { field: 'brand', src: b.src, confidence: b.confidence } })) {
      ch.brand = { from: m.brand, to: b.to }
    }
  }
  if (c?.brand && !isBlankBrand(m.brand) && !n.brand && brandKey(c.brand) !== brandKey(m.brand) && c.brandConf >= FILL_CONF) {
    note(ctx, chunk, { ...base, kind: 'escalate', before: { field: 'brand', value: m.brand }, after: { field: 'brand', value: c.brand },
      evidence: evidenceOf(r, { issue: 'ai-brand-conflict', quote: c.brandQuote }), confidence: c.brandConf })
  }

  // ---- wingspan
  if (n.span) {
    const stated = titles.map((t) => extractSpanMM(t)).filter((v) => v)
    const lo = Math.min(...stated)
    const hi = Math.max(...stated)
    const titlesAgree = stated.length >= 2 && hi / lo - 1 <= SPAN_AGREE
    const aiSpan = c?.spanMM && c.spanConf >= FILL_CONF ? c.spanMM : null
    const conflict = (stated.length >= 2 && !titlesAgree) || (aiSpan && stated.length && stated.some((v) => Math.abs(v - aiSpan) / aiSpan > SPAN_AGREE))
    if (conflict) {
      note(ctx, chunk, { ...base, kind: 'escalate', before: { field: 'specs.spanMM', value: null }, after: { field: 'specs.spanMM', value: aiSpan ?? null },
        evidence: evidenceOf(r, { issue: 'ai-span-conflict', title_spans: stated, quote: c?.spanQuote || null }), confidence: c?.spanConf ?? null })
    } else if (titlesAgree) {
      const to = [...stated].sort((a, b) => a - b)[Math.floor(stated.length / 2)]
      if (note(ctx, chunk, { ...base, kind: 'fill', before: { field: 'specs.spanMM', value: null }, after: { field: 'specs.spanMM', value: to, src: 'rules' },
        evidence: { why: `${stated.length} listing titles state it`, title_spans: stated }, confidence: 1, fieldSrc: { field: 'specs.spanMM', src: 'rules', confidence: 1 } }))
        ch.spanMM = { to }
    } else if (aiSpan) {
      if (note(ctx, chunk, { ...base, kind: 'fill', before: { field: 'specs.spanMM', value: null }, after: { field: 'specs.spanMM', value: aiSpan, src: 'curator' },
        evidence: evidenceOf(r, { quote: c.spanQuote }), confidence: c.spanConf, fieldSrc: { field: 'specs.spanMM', src: 'curator', confidence: c.spanConf } }))
        ch.spanMM = { to: aiSpan }
    }
  }

  // ---- power
  const rulesPower = powerType(titles.join(' '))
  if (n.power && titles.length) {
    if (note(ctx, chunk, { ...base, kind: 'fill', before: { field: 'power', value: null }, after: { field: 'power', value: rulesPower, src: 'rules' },
      evidence: { why: 'from the listing titles (powerType)' }, confidence: 1, fieldSrc: { field: 'power', src: 'rules', confidence: 1 } }))
      ch.power = { to: rulesPower }
  }
  if (c?.power === 'gas' && (m.power ?? rulesPower) === 'electric') {
    note(ctx, chunk, { ...base, kind: 'escalate', before: { field: 'power', value: m.power ?? rulesPower }, after: { field: 'power', value: 'gas' },
      evidence: evidenceOf(r, { issue: 'power-mismatch', quotes: titles.slice(0, 3) }), confidence: null })
  }

  // ---- kind
  if (c && c.fixedWing === false) {
    note(ctx, chunk, { ...base, kind: 'escalate', before: { field: 'kind', value: 'fixed-wing' }, after: { field: 'kind', value: 'not fixed-wing' },
      evidence: evidenceOf(r, { issue: 'not-fixed-wing', quotes: titles.slice(0, 3) }), confidence: null })
  }

  if (ctx.live && Object.keys(ch).length) ctx.write(masterUpdate(ctx.env, id, ch, ctx.t))
}

// =============================================================== names
export async function namesPhase(ctx) {
  return masterPhase(ctx, {
    async build(ctx) {
      const all = await loadAll(ctx.env)
      const locks = await loadLocks(ctx.env, 'master')
      return all.filter((m) => needsOf(m, locks).name).map((m) => m.id)
    },
    async perMaster(ctx, m, chunk) {
      if (!needsOf(m, chunk.locks).name) return null
      const listings = chunk.listings.get(m.id) ?? []
      const input = masterInput(m, listings)
      const r = await answer(ctx, m, input, { fresh: (ctx.cursor.touched ?? []).includes(m.id) })
      if (r.status === 'deferred') return 'stop'
      if (r.status !== 'ok') return null
      const c = checkMaster(r.output, input)
      if (!c.model || c.model === m.name) return null
      return { m, r, c, listings, hash: await inputHash({ task: MASTER_TASK.v, input }) }
    },
    async finish(ctx, plans, chunk) {
      const clash = await clashes(ctx, plans.map((p) => ({ key: `n${p.m.id}`, id: p.m.id, category: p.m.category_id, brandNorm: p.m.brand_norm, nameNorm: normName(p.c.model) })))
      for (const p of plans) {
        const { m, c, r, listings, hash } = p
        const titles = listings.map((l) => l.title ?? '').join('\n')
        const why = c.modelConf < NAME_CONF ? `confidence ${c.modelConf}`
          : !tokenSubset(c.model, `${m.name}\n${titles}`) ? 'uses words from the listing text, not the old name or the titles'
          : clash.has(`n${m.id}`) ? `#${clash.get(`n${m.id}`)} already has this name`
          : ''
        const base = { entity: 'master', entityId: m.id, inputHash: hash, before: { field: 'name', value: m.name }, confidence: c.modelConf }
        if (why) {
          note(ctx, chunk, { ...base, kind: 'escalate', after: { field: 'name', value: c.model }, otherId: clash.get(`n${m.id}`) ?? null,
            evidence: evidenceOf(r, { issue: 'name-suggestion', why, old_problem: nameLint(m.name) || nameSmell(m.name, m.brand) }) })
          continue
        }
        if (note(ctx, chunk, { ...base, kind: 'rename', after: { field: 'name', value: c.model, src: 'curator' },
          evidence: evidenceOf(r, { old_problem: nameLint(m.name) || nameSmell(m.name, m.brand) }), fieldSrc: { field: 'name', src: 'curator', confidence: c.modelConf } }))
          if (ctx.live) ctx.write(masterUpdate(ctx.env, m.id, { name: { from: m.name, to: c.model } }, ctx.t))
      }
    },
  })
}

// =============================================================== roles
export async function rolesPhase(ctx) {
  return masterPhase(ctx, {
    async build(ctx) {
      const all = await loadAll(ctx.env)
      const locks = await loadLocks(ctx.env, 'master')
      const memo = ctx.cursor.memo ?? {}
      // pages whose tags may change, plus rules-tagged pages already asked this
      // run (their answer is cached; a disagreement becomes a suggestion)
      return all.filter((m) => needsOf(m, locks).roles || (m.role_source === 'rules' && memo[m.id] && !isLocked(locks, m.id, 'role_tags'))).map((m) => m.id)
    },
    async perMaster(ctx, m, chunk) {
      if (PROTECTED_ROLE_SOURCES.has(m.role_source) || isLocked(chunk.locks, m.id, 'role_tags')) return null
      const may = needsOf(m, chunk.locks).roles
      if (!may && !ctx.cursor.memo?.[m.id]) return null
      const listings = chunk.listings.get(m.id) ?? []
      const input = masterInput(m, listings)
      const r = await answer(ctx, m, input, { fresh: (ctx.cursor.touched ?? []).includes(m.id) })
      if (r.status === 'deferred') return 'stop'
      if (r.status !== 'ok') return null
      const c = checkMaster(r.output, input)
      if (!c.tags.length || c.rolesConf < ROLE_CONF) return null
      return { m, r, c, may, hash: await inputHash({ task: MASTER_TASK.v, input }) }
    },
    async finish(ctx, plans, chunk) {
      for (const { m, r, c, may, hash } of plans) {
        const cur = normalizeRoleTags(parse(m.role_tags, []) ?? [])
        const base = { entity: 'master', entityId: m.id, inputHash: hash, before: { field: 'role_tags', value: parse(m.role_tags, null), raw: m.role_tags ?? null, source: m.role_source ?? null }, confidence: c.rolesConf }
        const evidence = evidenceOf(r, { roles: c.roles })
        if (may) {
          if (note(ctx, chunk, { ...base, kind: 'roles', after: { field: 'role_tags', value: c.tags, src: 'curator' }, evidence, fieldSrc: { field: 'role_tags', src: 'curator', confidence: c.rolesConf } }))
            if (ctx.live) ctx.write(masterUpdate(ctx.env, m.id, { roles: { fromSource: m.role_source ?? '', fromTags: m.role_tags ?? '', to: c.tags } }, ctx.t))
        } else if (c.tags[0] !== cur[0]) {
          note(ctx, chunk, { ...base, kind: 'escalate', after: { field: 'role_tags', value: c.tags }, evidence: { ...evidence, issue: 'role-suggestion', priority: 'low' } })
        }
      }
    },
  })
}
