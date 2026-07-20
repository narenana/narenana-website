// Thin D1 helpers. D1 reality: auto-commit per statement, atomic db.batch(),
// NO interactive transactions — multi-step mutations must be expressed as one
// batch (see architecture doc). Every statement counts against per-invocation
// budgets on the Free plan, so callers count what they spend.

export const q = (env, sql, ...params) => env.CATALOG_DB.prepare(sql).bind(...params)
export const all = async (env, sql, ...params) => (await q(env, sql, ...params).all()).results
export const one = async (env, sql, ...params) => q(env, sql, ...params).first()
export const run = (env, sql, ...params) => q(env, sql, ...params).run()
export const batch = (env, stmts) => env.CATALOG_DB.batch(stmts)

export const getSetting = async (env, k) => (await one(env, 'SELECT v FROM setting WHERE k=?', k))?.v ?? null
export const setSetting = (env, k, v) =>
  run(env, 'INSERT INTO setting (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v))

// Overlap guard: claim a lease atomically via conditional UPDATE. Returns true
// iff this invocation owns the job for ttlMs.
export async function claimLease(env, key, ttlMs, nowMs) {
  await run(env, 'INSERT OR IGNORE INTO setting (k,v) VALUES (?,?)', key, '0')
  const res = await run(env, 'UPDATE setting SET v=? WHERE k=? AND CAST(v AS INTEGER) < ?', String(nowMs + ttlMs), key, nowMs)
  return (res.meta?.changes ?? 0) > 0
}

export const audit = (env, actor, action, entity, entityId, detail) =>
  q(env, 'INSERT INTO audit (at,actor,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?)',
    Date.now(), actor, action, entity, String(entityId ?? ''), detail ? JSON.stringify(detail).slice(0, 2000) : null)
