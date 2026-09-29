// Provenance and write helpers shared by the curator's phases and the admin.
//
// Every automatic change is a curator_action row (before, after, confidence,
// evidence, model, prompt version, input hash) plus a field_src row saying who
// set the field. field_src.src is one of:
//   owner           the owner set it; LOCKED — automation never writes it
//   directive       came from one of the owner's queued decisions; LOCKED
//   owner-approved  accepted at approval or publish time; blanks may be filled
//                   and an obviously seller-style name cleaned, nothing else
//   curator         written by the curator (with its confidence)
//   rules           written by a deterministic rule
// Writes are CAS'd on the value the curator read, so an owner edit that lands
// between the read and the write always wins.

import { normName } from '../util.mjs'

export const LOCKED_SRC = new Set(['owner', 'directive'])
export const PROTECTED_ROLE_SOURCES = new Set(['reviewed', 'human'])

// True once migration 0019 is applied. Probed, not assumed (like
// hasSlugAlias), so the code can ship before the migration: the curator then
// does nothing and the admin writes no provenance.
export const hasCuratorTables = (env) => env.CATALOG_DB.prepare(`SELECT 1 AS ok FROM field_src LIMIT 1`).first().then(() => true, () => false)

// ---------------------------------------------------------------- locks
// Map id → Map(field → src) of the LOCKED fields (owner, directive) of one
// entity kind: the only provenance automation has to obey. (Loading just
// these keeps the queue build small: ~80 rows, not the ~1,600 owner-approved.)
export async function loadLocks(env, entity, ids = null) {
  const rows = ids
    ? ids.length
      ? (await env.CATALOG_DB.prepare(`SELECT entity_id, field, src FROM field_src WHERE entity=? AND src IN ('owner','directive') AND entity_id IN (${ids.map(() => '?').join(',')})`).bind(entity, ...ids).all()).results
      : []
    : (await env.CATALOG_DB.prepare(`SELECT entity_id, field, src FROM field_src WHERE entity=? AND src IN ('owner','directive')`).bind(entity).all()).results
  const out = new Map()
  for (const r of rows ?? []) {
    if (!out.has(r.entity_id)) out.set(r.entity_id, new Map())
    out.get(r.entity_id).set(r.field, r.src)
  }
  return out
}
export const srcOf = (locks, id, field) => locks.get(id)?.get(field) ?? null
export const isLocked = (locks, id, field) => LOCKED_SRC.has(srcOf(locks, id, field))

// --------------------------------------------------------------- actions
// Columns written for a new action, in order.
const ACTION_COLS = ['run_id', 'kind', 'entity', 'entity_id', 'other_id', 'status', 'before', 'after', 'evidence', 'confidence', 'input_hash', 'created_at', 'applied_at']
const j = (v) => (v === undefined || v === null ? null : JSON.stringify(v))
export function actionValues(a) {
  return [a.runId, a.kind, a.entity, a.entityId ?? null, a.otherId ?? null, a.status, j(a.before), j(a.after), j(a.evidence), a.confidence ?? null, a.inputHash ?? null, a.t, a.status === 'applied' ? a.t : null]
}
const chunked = (rows, per) => {
  const out = []
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per))
  return out
}
// Multi-row INSERTs, at most ~91 bound parameters each (D1 caps a statement at 100).
export const ACTIONS_PER_STMT = Math.floor(99 / ACTION_COLS.length)
export function insertActions(env, actions) {
  return chunked(actions.map(actionValues), ACTIONS_PER_STMT).map((rows) =>
    env.CATALOG_DB.prepare(`INSERT INTO curator_action (${ACTION_COLS.join(',')}) VALUES ${rows.map(() => `(${ACTION_COLS.map(() => '?').join(',')})`).join(',')}`).bind(...rows.flat()),
  )
}

// field_src upserts. An existing owner/directive lock is never downgraded.
export const FIELD_SRC_PER_STMT = 14
export function upsertFieldSrc(env, rows) {
  return chunked(rows.map((r) => [r.entity, r.entityId, r.field, r.src, r.confidence ?? null, r.runId ?? null, r.t]), FIELD_SRC_PER_STMT).map((rs) =>
    env.CATALOG_DB.prepare(`INSERT INTO field_src (entity, entity_id, field, src, confidence, run_id, at) VALUES ${rs.map(() => '(?,?,?,?,?,?,?)').join(',')}
      ON CONFLICT(entity, entity_id, field) DO UPDATE SET src=excluded.src, confidence=excluded.confidence, run_id=excluded.run_id, at=excluded.at
      WHERE field_src.src NOT IN ('owner','directive')`).bind(...rs.flat()),
  )
}
// The owner's own lock: always wins, including over an earlier curator value.
export const lockOwner = (env, entity, entityId, field, t) =>
  env.CATALOG_DB.prepare(`INSERT INTO field_src (entity, entity_id, field, src, confidence, run_id, at) VALUES (?,?,?,'owner',NULL,NULL,?)
    ON CONFLICT(entity, entity_id, field) DO UPDATE SET src='owner', confidence=NULL, run_id=NULL, at=excluded.at`).bind(entity, entityId, field, t)

// Dedupe: the same finding for the same input is recorded once. An open
// ('planned') or dismissed ('skipped') action with the same key suppresses a
// new one, so a second run on the same day adds nothing.
export const actionKey = (kind, entityId, field, issue, hash) => `${kind}|${entityId}|${field ?? ''}|${issue ?? ''}|${hash ?? ''}`
export async function openActionKeys(env, entity, ids) {
  if (!ids.length) return new Set()
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT kind, entity_id, input_hash, json_extract(after,'$.field') AS field, json_extract(evidence,'$.issue') AS issue
     FROM curator_action WHERE entity=? AND status IN ('planned','skipped') AND entity_id IN (${ids.map(() => '?').join(',')})`,
  ).bind(entity, ...ids).all()).results ?? []
  return new Set(rows.map((r) => actionKey(r.kind, r.entity_id, r.field, r.issue, r.input_hash)))
}

// ------------------------------------------------------- catalog writes
// One UPDATE per master carrying every change, each CAS'd on the value read:
//   brand {from,to}  name {from,to}  spanMM {to} (only while blank)
//   power {to} (only while NULL)  roles {fromTags, fromSource, to}
// SQLite evaluates every SET expression on the old row, so the CASE tests
// see the values the curator planned against.
export function masterUpdate(env, id, ch, t) {
  const sets = []
  const args = []
  if (ch.brand) {
    sets.push(`brand = CASE WHEN brand = ? THEN ? ELSE brand END`, `brand_norm = CASE WHEN brand = ? THEN ? ELSE brand_norm END`)
    args.push(ch.brand.from, ch.brand.to, ch.brand.from, normName(ch.brand.to))
  }
  if (ch.name) {
    sets.push(`name = CASE WHEN name = ? THEN ? ELSE name END`, `name_norm = CASE WHEN name = ? THEN ? ELSE name_norm END`)
    args.push(ch.name.from, ch.name.to, ch.name.from, normName(ch.name.to))
  }
  if (ch.spanMM) {
    sets.push(`specs = CASE WHEN json_extract(specs,'$.spanMM') IS NULL OR json_extract(specs,'$.spanMM') IN ('', 0) THEN json_set(specs, '$.spanMM', ?) ELSE specs END`)
    args.push(ch.spanMM.to)
  }
  if (ch.power) {
    sets.push(`power = COALESCE(power, ?)`)
    args.push(ch.power.to)
  }
  if (ch.roles) {
    const cond = `COALESCE(role_source,'') = ? AND COALESCE(role_tags,'') = ?`
    sets.push(`role_tags = CASE WHEN ${cond} THEN ? ELSE role_tags END`, `role_source = CASE WHEN ${cond} THEN 'ai' ELSE role_source END`)
    args.push(ch.roles.fromSource ?? '', ch.roles.fromTags ?? '', JSON.stringify(ch.roles.to), ch.roles.fromSource ?? '', ch.roles.fromTags ?? '')
  }
  if (!sets.length) return null
  return env.CATALOG_DB.prepare(`UPDATE master_model SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...args, t, id)
}

// The pending listing's Review prefill.
export const skuGuessUpdate = (env, id, guess) =>
  env.CATALOG_DB.prepare(`UPDATE sku SET guess=? WHERE id=? AND review_status='new'`).bind(JSON.stringify(guess), id)

// ---------------------------------------------------- one planned change
// The field an action changes, as a master-update change, plus the SQL that
// tells whether the field holds a given value now (for apply and revert).
function changeFor(action, direction) {
  const a = action.after ?? {}
  const b = action.before ?? {}
  const [from, to] = direction === 'apply' ? [b.value, a.value] : [a.value, b.value]
  switch (a.field) {
    case 'brand': return { ch: { brand: { from, to } }, holds: [`(SELECT brand FROM master_model WHERE id=?) = ?`, to] }
    case 'name': return { ch: { name: { from, to } }, holds: [`(SELECT name FROM master_model WHERE id=?) = ?`, to] }
    case 'power': return direction === 'apply' ? { ch: { power: { to } }, holds: [`(SELECT power FROM master_model WHERE id=?) = ?`, to] } : null
    case 'specs.spanMM': return direction === 'apply' ? { ch: { spanMM: { to } }, holds: [`(SELECT json_extract(specs,'$.spanMM') FROM master_model WHERE id=?) = ?`, to] } : null
    case 'role_tags': {
      if (direction !== 'apply') return null
      return { ch: { roles: { fromSource: b.source ?? '', fromTags: b.raw ?? (b.value == null ? '' : JSON.stringify(b.value)), to } }, holds: [`(SELECT role_tags FROM master_model WHERE id=?) = ?`, JSON.stringify(to)] }
    }
    default: return null
  }
}

// Apply the open planned changes of a dry run ("Apply this plan"), oldest
// first, at most `limit`. Each is CAS'd on the value it was planned against:
// a field that changed since, or that the owner has since locked, is skipped
// as stale. Returns the statements to run and how many were taken.
export async function planApplyStatements(env, { runId = null, limit = 8, t = Date.now() } = {}) {
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT * FROM curator_action WHERE status='planned' AND kind IN ('fill','rename','roles') ${runId ? 'AND run_id=?' : ''} ORDER BY id LIMIT ?`,
  ).bind(...(runId ? [runId, limit] : [limit])).all()).results ?? []
  const locks = await loadLocks(env, 'master', [...new Set(rows.filter((r) => r.entity === 'master').map((r) => r.entity_id))])
  const stmts = []
  for (const r of rows) {
    const action = { ...r, before: r.before ? JSON.parse(r.before) : null, after: r.after ? JSON.parse(r.after) : null }
    const field = action.after?.field
    const skip = (why) => stmts.push(env.CATALOG_DB.prepare(`UPDATE curator_action SET status='skipped', evidence=json_set(COALESCE(evidence,'{}'),'$.skipped',?) WHERE id=? AND status='planned'`).bind(why, r.id))
    if (r.entity === 'sku' && field === 'guess') {
      stmts.push(
        env.CATALOG_DB.prepare(`UPDATE sku SET guess=? WHERE id=? AND review_status='new' AND COALESCE(guess,'') = ?`).bind(JSON.stringify(action.after.value), r.entity_id, action.before?.raw ?? ''),
        env.CATALOG_DB.prepare(`UPDATE curator_action SET status = CASE WHEN (SELECT guess FROM sku WHERE id=?) = ? THEN 'applied' ELSE 'skipped' END, applied_at=? WHERE id=? AND status='planned'`).bind(r.entity_id, JSON.stringify(action.after.value), t, r.id),
      )
      continue
    }
    if (r.entity !== 'master') { skip('not a master change'); continue }
    if (isLocked(locks, r.entity_id, field)) { skip('the owner has locked this field'); continue }
    const c = changeFor(action, 'apply')
    if (!c) { skip('unsupported change'); continue }
    const up = masterUpdate(env, r.entity_id, c.ch, t)
    const src = action.after.src ?? 'curator'
    stmts.push(
      up,
      ...upsertFieldSrc(env, [{ entity: 'master', entityId: r.entity_id, field, src, confidence: r.confidence, runId: r.run_id, t }]),
      env.CATALOG_DB.prepare(`UPDATE curator_action SET status = CASE WHEN ${c.holds[0]} THEN 'applied' ELSE 'skipped' END, applied_at=? WHERE id=? AND status='planned'`).bind(r.entity_id, c.holds[1], t, r.id),
    )
  }
  return { stmts, taken: rows.length }
}

// Revert one applied change from the admin: restore the old value if the
// field still holds the curator's, and lock the field as the owner's, so the
// curator never fills it again. Returns {ok, error?}.
export async function revertAction(env, actionId, actor, t = Date.now()) {
  const r = await env.CATALOG_DB.prepare(`SELECT * FROM curator_action WHERE id=?`).bind(actionId).first()
  if (!r) return { ok: false, status: 404, error: 'unknown action' }
  if (r.status !== 'applied') return { ok: false, status: 409, error: `this change is ${r.status}, not applied` }
  const action = { ...r, before: r.before ? JSON.parse(r.before) : null, after: r.after ? JSON.parse(r.after) : null }
  const field = action.after?.field
  const stmts = []
  if (r.entity === 'sku' && field === 'guess') {
    stmts.push(env.CATALOG_DB.prepare(`UPDATE sku SET guess=? WHERE id=? AND guess=?`).bind(action.before?.value == null ? null : JSON.stringify(action.before.value), r.entity_id, JSON.stringify(action.after.value)))
  } else if (r.entity === 'master') {
    if (field === 'brand' || field === 'name') {
      const c = changeFor(action, 'revert')
      stmts.push(masterUpdate(env, r.entity_id, c.ch, t))
    } else if (field === 'specs.spanMM') {
      stmts.push(env.CATALOG_DB.prepare(`UPDATE master_model SET specs=json_set(specs,'$.spanMM',?), updated_at=? WHERE id=? AND json_extract(specs,'$.spanMM') = ?`).bind(action.before?.value ?? '', t, r.entity_id, action.after.value))
    } else if (field === 'power') {
      stmts.push(env.CATALOG_DB.prepare(`UPDATE master_model SET power=?, updated_at=? WHERE id=? AND power=?`).bind(action.before?.value ?? null, t, r.entity_id, action.after.value))
    } else if (field === 'role_tags') {
      // The owner chose the old tags over the curator's: they are now the
      // owner's ('human'), which no automation touches.
      stmts.push(env.CATALOG_DB.prepare(`UPDATE master_model SET role_tags=?, role_source='human', updated_at=? WHERE id=? AND role_tags=? AND role_source='ai'`).bind(
        action.before?.value == null ? null : JSON.stringify(action.before.value), t, r.entity_id, JSON.stringify(action.after.value)))
    } else return { ok: false, status: 400, error: `cannot revert a ${field} change` }
    stmts.push(lockOwner(env, 'master', r.entity_id, field === 'role_tags' ? 'role_tags' : field, t))
  } else return { ok: false, status: 400, error: 'cannot revert this change' }
  stmts.push(
    env.CATALOG_DB.prepare(`UPDATE curator_action SET status='undone', undone_at=?, undone_by=? WHERE id=?`).bind(t, actor, r.id),
    env.CATALOG_DB.prepare('INSERT INTO audit (at,actor,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?)').bind(t, actor, 'curator-revert', r.entity === 'sku' ? 'sku' : 'master_model', String(r.entity_id), JSON.stringify({ action: r.id, field, restored: action.before?.value ?? null }).slice(0, 2000)),
  )
  await env.CATALOG_DB.batch(stmts)
  return { ok: true, field, restored: action.before?.value ?? null }
}
