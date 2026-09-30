// Directives phase (design § 10): the owner's approved decisions, applied
// first in each run, in id order, through the same merge and rename
// statements as the admin (a merge keeps its snapshot, so it can be undone).
// No AI. Each carries expectations (the ids and slugs it must find); if they
// do not match, the directive fails with the reason and nothing changes.
//
//   merge   {keep, absorb, expect: {keep_slug, absorb_slug}}
//   rename  {id, name?, slug?, expect: {slug}}
//   brand   {id, brand, expect: {slug}}
//
// A dry run plans them (status stays 'approved'); "Apply this plan" or the
// first live run applies them. The fields a rename or brand directive sets
// are locked as 'directive', so no automation rewrites them.

import { loadMergeSnapshot, planMerge, mergeStatements, renameStatements } from './merge.mjs'
import { normName } from '../util.mjs'
import { resolveLanding } from '../grid-next.mjs'
import { inputHash } from '../ai.mjs'

const parse = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }
const SLUG = /^[a-z0-9-]{3,60}$/

export const lockDirective = (env, entityId, field, t, runId) =>
  env.CATALOG_DB.prepare(`INSERT INTO field_src (entity, entity_id, field, src, confidence, run_id, at) VALUES ('master',?,?,'directive',NULL,?,?)
    ON CONFLICT(entity, entity_id, field) DO UPDATE SET src='directive', confidence=NULL, run_id=excluded.run_id, at=excluded.at WHERE field_src.src<>'owner'`).bind(entityId, field, runId, t)

export async function directivesPhase(ctx) {
  const { cursor } = ctx
  if (cursor.scope) return 'done' // a scoped check never applies the owner's queue
  if (!cursor.queue) {
    const rows = (await ctx.env.CATALOG_DB.prepare(`SELECT id FROM curator_directive WHERE status='approved' ORDER BY id`).all()).results ?? []
    cursor.queue = rows.map((r) => r.id)
    cursor.idx = 0
  }
  while (cursor.idx < cursor.queue.length) {
    // reads only here; a merge checks its own room once its statements are known
    if (ctx.late() || !ctx.room(6)) return 'more'
    if (ctx.live && ctx.meter.merges >= ctx.meter.lim.merges) return 'more'
    const id = cursor.queue[cursor.idx]
    const out = await ctx.item(`directive:${id}`, () => runDirective(ctx, id))
    if (out === 'stop') return 'more'
    cursor.idx++
  }
  return 'done'
}

// Plan (dry) or apply (live) one directive. Also used by "Apply this plan"
// through applyDirective().
async function runDirective(ctx, id) {
  const d = await ctx.env.CATALOG_DB.prepare(`SELECT * FROM curator_directive WHERE id=?`).bind(id).first()
  if (!d || d.status !== 'approved') return 'next'
  const r = await directiveStatements(ctx.env, d, { t: ctx.t, runId: ctx.run.id, live: ctx.live, absorbed: ctx.cursor.absorbed ?? [] })
  // A dry run records a directive's plan (or its failure) once per input, so
  // a second dry run the same day adds nothing. A live run always acts.
  const hash = await inputHash({ directive: d.id, payload: d.payload, error: r.error ?? null })
  if (!ctx.live && (await ctx.env.CATALOG_DB.prepare(`SELECT 1 AS x FROM curator_action WHERE kind='directive' AND input_hash=? AND status IN ('planned','failed','skipped') LIMIT 1`).bind(hash).first())) {
    if (r.merge) (ctx.cursor.absorbed ??= []).push(r.otherId)
    return 'next'
  }
  if (r.error) {
    ctx.change({ kind: 'directive', entity: 'master', entityId: r.entityId ?? null, status: 'failed', inputHash: hash, after: { field: 'directive', value: d.kind, directive: d.id }, evidence: { directive: d.id, kind: d.kind, payload: parse(d.payload, {}), error: r.error } })
    if (ctx.live) ctx.write(ctx.env.CATALOG_DB.prepare(`UPDATE curator_directive SET status='failed', applied_at=?, result=? WHERE id=? AND status='approved'`).bind(ctx.t, JSON.stringify({ error: r.error, run: ctx.run.id }), d.id))
    ctx.count('directives_failed')
    return 'next'
  }
  if (ctx.live && !ctx.room(r.stmts.length + 2)) return 'stop'
  ctx.change({
    kind: 'directive',
    entity: 'master',
    entityId: r.entityId,
    otherId: r.otherId ?? null,
    before: r.before,
    after: { field: 'directive', value: d.kind, directive: d.id, ...r.after },
    evidence: { directive: d.id, kind: d.kind, payload: parse(d.payload, {}), approved_by: d.approved_by, source: d.source },
    confidence: 1,
    inputHash: hash,
    stmt: () => [
      ...r.stmts,
      ctx.env.CATALOG_DB.prepare(`UPDATE curator_directive SET status='applied', applied_at=?, result=? WHERE id=? AND status='approved'`).bind(ctx.t, JSON.stringify({ run: ctx.run.id, ...r.after }), d.id),
    ],
  })
  if (r.merge) {
    if (ctx.live) ctx.meter.merges++
    ;(ctx.cursor.touched ??= []).push(r.entityId)
    ;(ctx.cursor.absorbed ??= []).push(r.otherId)
  } else (ctx.cursor.touched ??= []).push(r.entityId)
  ctx.count('directives')
  return 'next'
}

// The statements a directive makes, or {error}. absorbed: pages a dry run has
// planned to merge away (their slugs will be aliases, so they count as free).
export async function directiveStatements(env, d, { t = Date.now(), runId = null, live = true, absorbed = [] } = {}) {
  const p = parse(d.payload, null)
  if (!p) return { error: 'the payload is not JSON' }
  const actor = `owner directive #${d.id}`
  if (d.kind === 'merge') {
    if (!Number.isInteger(p.keep) || !Number.isInteger(p.absorb) || p.keep === p.absorb) return { error: 'merge needs two different ids: keep and absorb' }
    const snap = await loadMergeSnapshot(env, p.keep, p.absorb)
    const miss = !snap ? (await env.CATALOG_DB.prepare(`SELECT id FROM master_model WHERE id IN (?,?)`).bind(p.keep, p.absorb).all()).results ?? [] : null
    if (!snap) return { entityId: p.keep, error: `expected #${p.keep} and #${p.absorb}; ${miss.length ? `only #${miss.map((r) => r.id).join(', #')} exists` : 'neither exists'}` }
    const A = snap.a.row
    const B = snap.b.row
    const e = p.expect ?? {}
    if (e.keep_slug && A.slug !== e.keep_slug) return { entityId: A.id, error: `expected #${A.id} at ${e.keep_slug}, found ${A.slug}` }
    if (e.absorb_slug && B.slug !== e.absorb_slug) return { entityId: A.id, error: `expected #${B.id} at ${e.absorb_slug}, found ${B.slug}` }
    if (A.category_id !== B.category_id) return { entityId: A.id, error: 'the two pages are in different categories' }
    const plan = planMerge(snap, { slugRule: false }) // a directive states its own slug
    const { stmts } = mergeStatements(env, snap, plan, { actor, reason: `directive #${d.id}`, t, aliases: true })
    return {
      merge: true,
      entityId: A.id,
      otherId: B.id,
      stmts,
      before: { field: 'merge', value: { keep: { id: A.id, slug: A.slug, name: A.name }, absorb: { id: B.id, slug: B.slug, name: B.name, brand: B.brand } } },
      after: { survivor: A.id, absorbed: B.id, took: plan.took },
    }
  }
  if (d.kind === 'rename' || d.kind === 'brand') {
    if (!Number.isInteger(p.id)) return { error: `${d.kind} needs an id` }
    const m = await env.CATALOG_DB.prepare(`SELECT * FROM master_model WHERE id=?`).bind(p.id).first()
    if (!m) return { entityId: p.id, error: `expected #${p.id}; it does not exist` }
    const e = p.expect ?? {}
    if (e.slug && m.slug !== e.slug) return { entityId: m.id, error: `expected #${m.id} at ${e.slug}, found ${m.slug}` }
    const name = d.kind === 'rename' && typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null
    const slug = d.kind === 'rename' && typeof p.slug === 'string' && p.slug.trim() ? p.slug.trim() : null
    const brand = d.kind === 'brand' && typeof p.brand === 'string' ? p.brand.trim() : null
    if (d.kind === 'rename' && !name && !slug) return { entityId: m.id, error: 'rename needs a name or a slug' }
    if (d.kind === 'brand' && !brand) return { entityId: m.id, error: 'brand needs a brand' }
    if (slug && slug !== m.slug) {
      if (!SLUG.test(slug)) return { entityId: m.id, error: `"${slug}" is not a valid address (3 to 60 lower-case letters, digits and hyphens)` }
      if (slug === 'browse' || resolveLanding(slug)) return { entityId: m.id, error: `"${slug}" is a reserved page name` }
    }
    const nn = name ? normName(name) : m.name_norm
    const bn = brand != null ? normName(brand) : m.brand_norm
    const others = (await env.CATALOG_DB.prepare(
      `SELECT id, slug, name FROM master_model WHERE category_id=? AND id<>? AND (slug=? OR (brand_norm=? AND name_norm=?))`,
    ).bind(m.category_id, m.id, slug ?? m.slug, bn, nn).all()).results ?? []
    // a page this dry run merges away is not in the way: its slug becomes an alias
    const inWay = others.filter((o) => live || !absorbed.includes(o.id))
    if (inWay.length) {
      const o = inWay[0]
      return { entityId: m.id, error: o.slug === slug ? `#${o.id} "${o.name}" uses the address ${slug}` : `#${o.id} "${o.name}" already has this brand and name` }
    }
    const stmts = renameStatements(env, m, { name, slug, brand }, t)
    if (name && name !== m.name) stmts.push(lockDirective(env, m.id, 'name', t, runId))
    if (slug && slug !== m.slug) stmts.push(lockDirective(env, m.id, 'slug', t, runId))
    if (brand != null && brand !== m.brand) stmts.push(lockDirective(env, m.id, 'brand', t, runId))
    stmts.push(env.CATALOG_DB.prepare('INSERT INTO audit (at,actor,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?)').bind(t, actor, 'master-update', 'master_model', String(m.id), JSON.stringify({ directive: d.id, ...(name ? { name } : {}), ...(slug ? { slug, fromSlug: m.slug } : {}), ...(brand != null ? { brand } : {}) })))
    return {
      entityId: m.id,
      stmts,
      before: { field: d.kind === 'brand' ? 'brand' : 'name', value: { name: m.name, slug: m.slug, brand: m.brand } },
      after: { name: name ?? m.name, slug: slug ?? m.slug, brand: brand ?? m.brand, fromSlug: m.slug },
    }
  }
  return { error: `unknown directive kind "${d.kind}"` }
}
