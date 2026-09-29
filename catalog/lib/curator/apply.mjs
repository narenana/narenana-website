// "Apply this plan" for every kind a dry run plans, and the one-click undo
// for every kind a run applies (design § 12).
//
// Apply: the planned actions, oldest first (the order the run made them:
// directives, triage, fills, merges, names, roles), each skipped as stale when
// its input changed since planning:
//   fill / rename / roles   CAS on the field's value (store.mjs)
//   directive               re-checked against its expectations, then applied
//   merge                   both pages still there and unchanged (the
//                           fingerprint of what the pair was judged on)
//   attach / reject / draft the listing still pending and not the owner's
// At most one merge per tick; light actions fill the rest of the budget.
//
// Undo (POST /api/curator-revert {actionId}):
//   merge, directive merge  unmerge from the snapshot (merge.mjs), and the
//                           pair is rejected for good
//   attach, draft           un-approve the listing (a draft page the curator
//                           made is removed while it has no other listing)
//   reject                  restore the listing
//   a directive rename      the old name and address back
//   field changes           store.mjs revertAction
// Every listing undo locks the listing as the owner's (field_src sku/review),
// so the curator never auto-rejects or auto-attaches it again.

import { planApplyStatements, lockOwner, revertAction as revertField } from './store.mjs'
import { normName } from '../util.mjs'
import { loadMergeSnapshot, planMerge, mergeStatements, attachSku, draftStatements, unmergeMasters, renameStatements } from './merge.mjs'
import { directiveStatements } from './directives.mjs'
import { eff, mergeFingerprint } from './dedup.mjs'
import { powerType } from '../public.mjs'
import { audit } from '../db.mjs'

const parse = (s, d) => { try { return s == null ? d : JSON.parse(s) } catch { return d } }
const q = (env, sql, ...a) => env.CATALOG_DB.prepare(sql).bind(...a)
const LIGHT = { fill: 4, rename: 4, roles: 4, reject: 2, attach: 6, draft: 7 }
const skipStmt = (env, id, why) => q(env, `UPDATE curator_action SET status='skipped', evidence=json_set(COALESCE(evidence,'{}'),'$.skipped',?) WHERE id=? AND status='planned'`, why, id)

// The statements for the next slice of the plan. Returns {stmts, taken, done, ids}.
export async function planSliceStatements(env, { runId = null, t = Date.now(), budget = 26 } = {}) {
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT * FROM curator_action WHERE status='planned' AND kind IN ('fill','rename','roles','merge','directive','attach','reject','draft') ${runId ? 'AND run_id=?' : ''} ORDER BY id LIMIT 12`,
  ).bind(...(runId ? [runId] : [])).all()).results ?? []
  const stmts = []
  const ids = []
  let used = 0
  let merged = false
  let taken = 0
  const simple = []
  for (const r of rows) {
    const cost = LIGHT[r.kind]
    if (cost) {
      if (used + cost > budget) break
      used += cost
      if (['fill', 'rename', 'roles'].includes(r.kind)) simple.push(r)
      else stmts.push(...(await skuActionStatements(env, r, t)))
      ids.push(r.id)
      taken++
      continue
    }
    // merge / directive: one per tick, and only with room for all of it
    if (merged || used + 26 > budget + 4) break
    const s = r.kind === 'merge' ? await mergeActionStatements(env, r, t) : await directiveActionStatements(env, r, t)
    if (used + s.length > budget + 4 && used > 0) break
    stmts.push(...s)
    used += s.length
    ids.push(r.id)
    merged = true
    taken++
  }
  if (simple.length) stmts.unshift(...(await planApplyStatements(env, { rows: simple, t })).stmts)
  return { stmts, taken, done: taken === rows.length && rows.length < 12, ids }
}

async function mergeActionStatements(env, r, t) {
  const ev = parse(r.evidence, {}) ?? {}
  const snap = await loadMergeSnapshot(env, r.entity_id, r.other_id)
  if (!snap) return [skipStmt(env, r.id, 'stale: one of the pages is gone')]
  const lists = new Map([[snap.b.row.id, snap.b.x.offers.map((o) => ({ sku_id: o.sku_id }))]])
  const fp = await mergeFingerprint(eff(snap.a.row), eff(snap.b.row), lists)
  if (ev.fp && fp !== ev.fp) return [skipStmt(env, r.id, 'stale: a page changed since the plan was made')]
  const plan = planMerge(snap)
  const { stmts } = mergeStatements(env, snap, plan, { actor: 'curator', reason: `plan of run ${r.run_id}: same plane`, t, aliases: true })
  return [...stmts, q(env, `UPDATE curator_action SET status='applied', applied_at=? WHERE id=? AND status='planned'`, t, r.id)]
}

async function directiveActionStatements(env, r, t) {
  const after = parse(r.after, {}) ?? {}
  const d = await env.CATALOG_DB.prepare(`SELECT * FROM curator_directive WHERE id=?`).bind(after.directive).first()
  if (!d || d.status !== 'approved') return [skipStmt(env, r.id, `the directive is ${d?.status ?? 'gone'}`)]
  const res = await directiveStatements(env, d, { t, runId: r.run_id, live: true })
  if (res.error)
    return [
      q(env, `UPDATE curator_action SET status='failed', evidence=json_set(COALESCE(evidence,'{}'),'$.error',?) WHERE id=? AND status='planned'`, res.error, r.id),
      q(env, `UPDATE curator_directive SET status='failed', applied_at=?, result=? WHERE id=? AND status='approved'`, t, JSON.stringify({ error: res.error }), d.id),
    ]
  return [
    ...res.stmts,
    q(env, `UPDATE curator_directive SET status='applied', applied_at=?, result=? WHERE id=? AND status='approved'`, t, JSON.stringify({ plan: r.run_id, ...res.after }), d.id),
    q(env, `UPDATE curator_action SET status='applied', applied_at=? WHERE id=? AND status='planned'`, t, r.id),
  ]
}

async function skuActionStatements(env, r, t) {
  const after = parse(r.after, {}) ?? {}
  const k = await env.CATALOG_DB.prepare(
    `SELECT k.id, k.review_status, k.title, (SELECT src FROM field_src WHERE entity='sku' AND entity_id=k.id AND field='review') AS lock FROM sku k WHERE k.id=?`,
  ).bind(r.entity_id).first()
  if (!k || k.review_status !== 'new') return [skipStmt(env, r.id, 'stale: the listing was decided since')]
  if (k.lock === 'owner') return [skipStmt(env, r.id, 'the owner has decided this listing')]
  const setStatus = (cond, ...args) => q(env, `UPDATE curator_action SET status=CASE WHEN ${cond} THEN 'applied' ELSE 'skipped' END, applied_at=? WHERE id=? AND status='planned'`, ...args, t, r.id)
  if (r.kind === 'reject')
    return [
      q(env, `UPDATE sku SET review_status='rejected', reject_reason=?, reviewed_at=? WHERE id=? AND review_status='new'`, after.reason ?? 'out-of-scope', t, k.id),
      setStatus(`(SELECT review_status FROM sku WHERE id=?)='rejected'`, k.id),
    ]
  if (r.kind === 'attach') {
    const m = await env.CATALOG_DB.prepare(`SELECT id, (SELECT GROUP_CONCAT(k2.title, ' ') FROM offer o JOIN sku k2 ON k2.id=o.sku_id WHERE o.master_model_id=m.id) AS titles FROM master_model m WHERE m.id=?`).bind(after.master).first()
    if (!m) return [skipStmt(env, r.id, 'stale: the page is gone')]
    return [
      ...attachSku(env, k.id, m.id, after.config ?? 'kit', after.pack_qty ?? 1, 'curator', { t, onlyNew: true }),
      q(env, `UPDATE master_model SET power=? WHERE id=?`, powerType(`${m.titles ?? ''} ${k.title ?? ''}`), m.id),
      setStatus(`EXISTS (SELECT 1 FROM offer WHERE sku_id=? AND master_model_id=?)`, k.id, m.id),
    ]
  }
  if (r.kind === 'draft') {
    const d = after.draft ?? {}
    const catId = (await env.CATALOG_DB.prepare(`SELECT suc.category_id AS c FROM sku k JOIN source_url_category suc ON suc.source_url_id=k.source_url_id WHERE k.id=?`).bind(k.id).first())?.c ?? 'wings'
    const taken = await env.CATALOG_DB.prepare(`SELECT id FROM master_model WHERE category_id=? AND (slug=? OR (brand_norm=? AND name_norm=?)) LIMIT 1`).bind(catId, d.slug, normName(d.brand ?? ''), normName(d.name ?? '')).first()
    if (taken) return [skipStmt(env, r.id, `stale: #${taken.id} now has this address or name`)]
    return [
      ...draftStatements(env, { skuId: k.id, catId, slug: d.slug, brand: d.brand, name: d.name, spanMM: d.spanMM, config: d.config, packQty: 1, power: powerType(k.title ?? ''), confidence: r.confidence, runId: r.run_id }, t),
      setStatus(`EXISTS (SELECT 1 FROM offer o JOIN master_model m ON m.id=o.master_model_id WHERE o.sku_id=? AND m.slug=?)`, k.id, d.slug),
    ]
  }
  return [skipStmt(env, r.id, 'unsupported change')]
}

// ------------------------------------------------------------------ undo
export async function revertCuratorAction(env, actionId, actor, t = Date.now()) {
  const r = await env.CATALOG_DB.prepare(`SELECT * FROM curator_action WHERE id=?`).bind(actionId).first()
  if (!r) return { ok: false, status: 404, error: 'unknown action' }
  if (r.status !== 'applied') return { ok: false, status: 409, error: `this change is ${r.status}, not applied` }
  const after = parse(r.after, {}) ?? {}
  if (r.kind === 'merge' || (r.kind === 'directive' && r.other_id != null)) {
    const u = await env.CATALOG_DB.prepare(`SELECT id FROM merge_undo WHERE survivor_id=? AND absorbed_id=? AND undone_at IS NULL ORDER BY id DESC LIMIT 1`).bind(r.entity_id, r.other_id).first()
    if (!u) return { ok: false, status: 409, error: 'no undo snapshot for this merge' }
    return unmergeMasters(env, u.id, actor, t)
  }
  if (r.kind === 'directive') return revertRename(env, r, after, actor, t)
  if (r.kind === 'reject' || r.kind === 'attach' || r.kind === 'draft') return revertListing(env, r, after, actor, t)
  return revertField(env, actionId, actor, t)
}

async function revertListing(env, r, after, actor, t) {
  const k = await env.CATALOG_DB.prepare(`SELECT id, review_status FROM sku WHERE id=?`).bind(r.entity_id).first()
  if (!k) return { ok: false, status: 404, error: 'unknown listing' }
  const stmts = []
  if (r.kind === 'reject') {
    if (k.review_status !== 'rejected') return { ok: false, status: 409, error: `the listing is ${k.review_status} now` }
    stmts.push(q(env, `UPDATE sku SET review_status='new', reject_reason=NULL, reviewed_at=NULL WHERE id=?`, k.id))
  } else {
    if (k.review_status !== 'approved') return { ok: false, status: 409, error: `the listing is ${k.review_status} now` }
    stmts.push(
      q(env, `DELETE FROM offer WHERE sku_id=?`, k.id),
      q(env, `UPDATE sku SET review_status='new', reviewed_at=NULL WHERE id=?`, k.id),
    )
    if (r.kind === 'draft') {
      // the draft page the curator made from this listing goes too, while it is
      // still a draft with no other listing and nothing the owner set
      const slug = after.draft?.slug
      const m = slug ? await env.CATALOG_DB.prepare(
        `SELECT m.id, m.status, (SELECT COUNT(*) FROM offer o WHERE o.master_model_id=m.id AND o.sku_id<>?) AS others,
           (SELECT COUNT(*) FROM field_src f WHERE f.entity='master' AND f.entity_id=m.id AND f.src IN ('owner','directive')) AS owned
         FROM master_model m WHERE m.slug=?`).bind(k.id, slug).first() : null
      if (m && m.status === 'draft' && !m.others && !m.owned)
        stmts.push(
          q(env, `DELETE FROM merge_candidate WHERE a_id=? OR b_id=?`, m.id, m.id),
          q(env, `DELETE FROM slug_alias WHERE master_model_id=?`, m.id),
          q(env, `DELETE FROM field_src WHERE entity='master' AND entity_id=?`, m.id),
          q(env, `DELETE FROM embedding WHERE entity='master' AND entity_id=?`, m.id),
          q(env, `DELETE FROM master_video WHERE master_model_id=?`, m.id),
          q(env, `DELETE FROM master_model WHERE id=? AND status='draft'`, m.id),
        )
    }
  }
  stmts.push(
    lockOwner(env, 'sku', k.id, 'review', t),
    q(env, `UPDATE curator_action SET status='undone', undone_at=?, undone_by=? WHERE id=?`, t, actor, r.id),
    audit(env, actor, `curator-revert-${r.kind}`, 'sku', k.id, { action: r.id }),
  )
  await env.CATALOG_DB.batch(stmts)
  return { ok: true, listing: k.id, restored: 'new' }
}

async function revertRename(env, r, after, actor, t) {
  const before = parse(r.before, {})?.value ?? {}
  const m = await env.CATALOG_DB.prepare(`SELECT * FROM master_model WHERE id=?`).bind(r.entity_id).first()
  if (!m) return { ok: false, status: 404, error: 'the page is gone' }
  const name = after.name && m.name === after.name && before.name ? before.name : null
  const brand = after.brand && m.brand === after.brand && before.brand != null ? before.brand : null
  const slug = after.slug && m.slug === after.slug && before.slug && before.slug !== m.slug ? before.slug : null
  if (!name && !brand && !slug) return { ok: false, status: 409, error: 'the page has been edited since; nothing to undo' }
  if (slug && (await env.CATALOG_DB.prepare(`SELECT id FROM master_model WHERE category_id=? AND slug=? AND id<>?`).bind(m.category_id, slug, m.id).first()))
    return { ok: false, status: 409, error: `another page now uses ${slug}` }
  const stmts = [
    ...renameStatements(env, m, { name, slug, brand }, t),
    ...(name ? [lockOwner(env, 'master', m.id, 'name', t)] : []),
    ...(slug ? [lockOwner(env, 'master', m.id, 'slug', t)] : []),
    ...(brand != null ? [lockOwner(env, 'master', m.id, 'brand', t)] : []),
    q(env, `UPDATE curator_action SET status='undone', undone_at=?, undone_by=? WHERE id=?`, t, actor, r.id),
    audit(env, actor, 'curator-revert-directive', 'master_model', m.id, { action: r.id }),
  ]
  await env.CATALOG_DB.batch(stmts)
  return { ok: true, restored: { name, slug, brand } }
}

// Dismiss one open question (an escalation): it is closed, and the same
// finding on the same input is not raised again.
export async function dismissEscalation(env, actionId, actor, t = Date.now()) {
  const r = await env.CATALOG_DB.prepare(`SELECT id, kind, status FROM curator_action WHERE id=?`).bind(actionId).first()
  if (!r) return { ok: false, status: 404, error: 'unknown action' }
  if (r.kind !== 'escalate' || r.status !== 'planned') return { ok: false, status: 409, error: 'only an open question can be dismissed' }
  await env.CATALOG_DB.batch([
    q(env, `UPDATE curator_action SET status='skipped', undone_at=?, undone_by=?, evidence=json_set(COALESCE(evidence,'{}'),'$.dismissed_by',?) WHERE id=? AND status='planned'`, t, actor, actor, r.id),
  ])
  return { ok: true }
}
