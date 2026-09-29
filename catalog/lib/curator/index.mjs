// The daily AI curator (design: docs "Autonomous daily AI curator for Wings").
//
// One job inside the existing Worker, driven by the */15 cron through
// runSlice. Once a UTC day, after the daily scan has finished and no earlier
// than 00:30 UTC (06:00 IST, after the Neuron allowance resets), it starts a
// run and works through its phases a tick at a time:
//
//   probe → directives → triage → fill → embed → candidates → judge → merge
//         → names → roles → report
//
// A run is a curator_run row (id = the UTC date, '2026-10-01#2' for a second
// run the same day); its cursor {phase, queue, idx, fails, inflight, …} holds
// the position, so any tick can resume it. While a run is active it takes only
// the odd 15-minute slots, leaving the even ones to warm and verify.
//
// Mode 'dry' writes only curator_* rows, ai_cache and the Neuron ledger: every
// change is recorded as 'planned', and "Apply this plan" (POST
// /api/curator-apply) applies exactly those, skipping any whose field changed
// since. Mode 'live' applies changes as it goes. Either way nothing the owner
// locked is ever written (store.mjs), and every change has a record with its
// before and after values.
//
// Per-tick budgets (Free plan; the setting curator_scale multiplies them):
// 34 D1 statements (Free caps an invocation at 50; the rest of the chain uses
// about 8), 6 AI calls, 1 merge, 3,000 vector comparisons, and no new work
// after 90 s (the jobs lease is 4 minutes). budgetedEnv counts them.
//
// Phases directives, embed, candidates, judge and merge are placeholders that
// complete at once, until dedup and merging move into the curator.

import { AiClient, aiSettingKeys, dayKey } from '../ai.mjs'
import { claimLease } from '../db.mjs'
import { PROBE_TASK } from './prompts.mjs'
import { triagePhase } from './triage.mjs'
import { fillPhase, namesPhase, rolesPhase } from './fill.mjs'
import { insertActions, upsertFieldSrc, ACTIONS_PER_STMT, FIELD_SRC_PER_STMT, planApplyStatements } from './store.mjs'

export const PHASES = ['probe', 'directives', 'triage', 'fill', 'embed', 'candidates', 'judge', 'merge', 'names', 'roles', 'report']
export const LIMITS = { stmts: 34, ai: 6, merges: 1, vec: 3000, wallMs: 90e3 }
export const START_AFTER_MS = 30 * 60e3 // 00:30 UTC
const DAY = 86400e3
const FIXED_FINAL = 2 // the curator_run update and the curator_state write
const MIN_SCALE = 0.25
const MAX_SCALE = 20
const parse = (s, d) => { try { return s == null ? d : JSON.parse(s) } catch { return d } }

// ------------------------------------------------------------------ budgets
export class BudgetExhausted extends Error {
  constructor(what) {
    super(`tick budget spent: ${what}`)
    this.name = 'BudgetExhausted'
    this.what = what
  }
}

export function makeMeter(scale = 1, t0 = Date.now(), limits = LIMITS) {
  const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Number(scale) || 1))
  return {
    scale: s,
    lim: {
      stmts: Math.max(16, Math.floor(limits.stmts * s)),
      ai: Math.max(1, Math.floor(limits.ai * s)),
      merges: Math.max(1, Math.floor(limits.merges * s)),
      vec: Math.floor(limits.vec * s),
      wallMs: limits.wallMs,
    },
    stmts: 0,
    ais: 0,
    merges: 0,
    vec: 0,
    t0,
    force: false, // set for the final batch, which is accounted for in advance
    stmt(n = 1) {
      if (!this.force && this.stmts + n > this.lim.stmts) throw new BudgetExhausted('D1 statements')
      this.stmts += n
    },
    ai() {
      if (this.ais >= this.lim.ai) throw new BudgetExhausted('AI calls')
      this.ais++
    },
    canAi() { return this.ais < this.lim.ai && Date.now() - this.t0 < this.lim.wallMs },
    late() { return Date.now() - this.t0 > this.lim.wallMs },
  }
}

// env with CATALOG_DB and AI wrapped: every .first/.all/.run/.raw, every
// statement inside a batch and every AI call is counted, and BudgetExhausted
// is thrown before a limit is crossed. Batches unwrap to the real statements.
export function budgetedEnv(env, meter) {
  const db = env.CATALOG_DB
  const wrap = (s) => ({
    __real: s,
    bind: (...a) => wrap(s.bind(...a)),
    first: async (c) => { meter.stmt(1); return s.first(c) },
    all: async () => { meter.stmt(1); return s.all() },
    run: async () => { meter.stmt(1); return s.run() },
    raw: async (o) => { meter.stmt(1); return s.raw(o) },
  })
  const CATALOG_DB = {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: async (stmts) => { meter.stmt(stmts.length); return db.batch(stmts.map((x) => x.__real ?? x)) },
    exec: async (sql) => { meter.stmt(1); return db.exec(sql) },
  }
  const AI = env.AI ? { run: async (...a) => { meter.ai(); return env.AI.run(...a) } } : undefined
  return { ...env, CATALOG_DB, AI }
}

// ------------------------------------------------------------------ phases
const notYet = async () => 'done' // dedup and merging do not run in the curator yet

async function probePhase(ctx) {
  const { cursor, ai } = ctx
  if (!ai.enabled) { cursor.health = { off: true }; return 'done' }
  // Once per UTC day: a second run the same day reuses the day's health, so it
  // makes no AI calls at all.
  if (ctx.state.health?.day === ctx.day && !cursor.health) {
    cursor.health = ctx.state.health.models
    for (const [id, h] of Object.entries(cursor.health ?? {})) if (h?.dead) ai.dead.add(id)
    return 'done'
  }
  const health = (cursor.health ??= {})
  const todo = [['primary', ai.models.primary], ['second', ai.models.second], ['embed', ai.models.embed]]
  for (let i = 0; i < todo.length; i++) {
    const [role, id] = todo[i]
    if (health[id]) continue
    const r = await ai.probe(id, PROBE_TASK)
    if (r.deferred) return 'more'
    health[id] = { role, ok: !!r.ok, code: r.code ?? null, kind: r.kind ?? null, dead: !!r.dead, msg: r.msg ?? null, ms: r.ms ?? null }
    if (!r.ok && role === 'primary' && ai.models.fallback) todo.push(['fallback', ai.models.fallback])
    if (!r.ok && role === 'embed' && ai.models.embed_fallback) todo.push(['embed_fallback', ai.models.embed_fallback])
  }
  ctx.state.health = { day: ctx.day, models: health }
  ctx.stateChanged = true
  return 'done'
}

async function reportPhase(ctx) {
  const rows = (await ctx.env.CATALOG_DB.prepare(`SELECT kind, entity, status, COUNT(*) AS n FROM curator_action WHERE run_id=? GROUP BY kind, entity, status`).bind(ctx.run.id).all()).results ?? []
  const tally = {}
  const add = (kind, entity, status, n) => { const k = `${kind}:${entity}:${status}`; tally[k] = (tally[k] ?? 0) + n }
  for (const r of rows) add(r.kind, r.entity, r.status, r.n)
  for (const a of ctx.actions) add(a.kind, a.entity, a.status, 1)
  const open = (await ctx.env.CATALOG_DB.prepare(`SELECT COUNT(*) AS n FROM curator_action WHERE kind='escalate' AND status='planned'`).first())?.n ?? 0
  const openNow = open + ctx.actions.filter((a) => a.kind === 'escalate').length
  const dry = ctx.run.mode === 'dry'
  const sum = (kinds, entity) => Object.entries(tally).reduce((s, [k, n]) => {
    const [kind, ent, status] = k.split(':')
    return kinds.includes(kind) && ent === entity && (status === 'applied' || (dry && status === 'planned')) ? s + n : s
  }, 0)
  const merged = sum(['merge'], 'master')
  const filled = sum(['fill', 'rename', 'roles'], 'master')
  const sorted = sum(['fill', 'reject', 'attach', 'draft'], 'sku')
  const neurons = Math.round((ctx.run.neurons ?? 0) + ctx.ai.neurons)
  const errors = (ctx.run.errors ?? 0) + ctx.errorCount()
  const n = (x) => x.toLocaleString('en-US')
  const pl = (k, word) => `${n(k)} ${word}${k === 1 ? '' : 's'}`
  const cost = `${n(neurons)} of ${n(Number(ctx.ai.cap))} Neurons, ${pl(errors, 'error')}.`
  ctx.summary = dry
    ? `Last run ${ctx.run.id} (dry run): ${pl(merged, 'merge')}, ${pl(filled, 'fill')} and ${pl(sorted, 'listing')} planned, ${n(openNow)} need you. ${cost}`
    : `Last run ${ctx.run.id} (live): ${n(merged)} merged, ${n(filled)} filled, ${pl(sorted, 'listing')} sorted, ${n(openNow)} need you. ${cost}`
  ctx.cursor.tally = tally
  return 'done'
}

export const HANDLERS = {
  probe: probePhase,
  directives: notYet,
  triage: triagePhase,
  fill: fillPhase,
  embed: notYet,
  candidates: notYet,
  judge: notYet,
  merge: notYet,
  names: namesPhase,
  roles: rolesPhase,
  report: reportPhase,
}

// ------------------------------------------------------------------ context
function makeCtx({ env, raw, t, day, run, cursor, state, settings, meter, ai }) {
  const ctx = {
    env, raw, t, day, run, cursor, state, settings, meter, ai,
    live: run.mode === 'live',
    actions: [],
    fieldSrc: [],
    stmts: [],
    errorsLogged: [],
    stateChanged: false,
    summary: null,
    committed() {
      return meter.stmts + ctx.stmts.length + Math.ceil(ctx.actions.length / ACTIONS_PER_STMT) + Math.ceil(ctx.fieldSrc.length / FIELD_SRC_PER_STMT) + ai.pendingCount() + FIXED_FINAL + (ctx.scaleTo != null ? 1 : 0)
    },
    room(n) { return ctx.committed() + n <= meter.lim.stmts },
    late() { return meter.late() },
    count(name, n = 1) { (cursor.counts ??= {})[name] = (cursor.counts[name] ?? 0) + n },
    errorCount() { return ctx.errorsLogged.length },
    // A change the run makes: applied now (live) or planned (dry). An explicit
    // status (e.g. 'skipped') is kept as given.
    change(a) {
      const status = a.status ?? (ctx.live ? 'applied' : 'planned')
      ctx.actions.push({ ...a, status, runId: run.id, t })
      if (status === 'applied') {
        if (a.fieldSrc) ctx.fieldSrc.push({ entity: a.entity, entityId: a.entityId, field: a.fieldSrc.field, src: a.fieldSrc.src, confidence: a.fieldSrc.confidence, runId: run.id, t })
        if (a.stmt) ctx.stmts.push(a.stmt())
      }
    },
    // Something for the owner: never applied by automation.
    escalate(a) { ctx.actions.push({ ...a, kind: 'escalate', status: 'planned', runId: run.id, t }) },
    write(stmt) { if (ctx.live && stmt) ctx.stmts.push(stmt) },
    error(e) {
      ctx.errorsLogged.push(e)
      const [entity, id] = String(e.item ?? '').split(':')
      ctx.actions.push({
        kind: 'error', status: 'failed', runId: run.id, t,
        entity: ['master', 'sku'].includes(entity) ? entity : 'run', entityId: Number(id) || null,
        evidence: { phase: e.phase ?? cursor.phase, item: e.item ?? null, model: e.model ?? null, code: e.code ?? null, kind: e.kind ?? null, msg: String(e.msg ?? '').slice(0, 300) },
      })
    },
    // Run one work item. An exception is logged and the item retried next
    // tick; after 3 failures in a row it is skipped with an error record.
    //   key: 'master:<id>' | 'sku:<id>' (the entity the error record names)
    async item(key, fn) {
      const fk = `${cursor.phase}/${key}`
      try {
        const out = await fn()
        if (cursor.fails?.[fk]) delete cursor.fails[fk]
        return out
      } catch (e) {
        if (e instanceof BudgetExhausted) throw e
        const n = ((cursor.fails ??= {})[fk] ?? 0) + 1
        cursor.fails[fk] = n
        const msg = String(e?.stack ?? e?.message ?? e).slice(0, 300)
        console.error(JSON.stringify({ at: 'curator', run: run.id, phase: cursor.phase, item: key, code: null, msg }))
        ctx.error({ phase: cursor.phase, item: key, kind: 'exception', msg })
        if (n >= 3) {
          ctx.error({ phase: cursor.phase, item: key, kind: 'poison', msg: `skipped after ${n} failures in a row` })
          return 'next'
        }
        return 'stop'
      }
    },
  }
  return ctx
}

// ------------------------------------------------------------------ the tick
const settingKeys = (day) => ['curator_enabled', 'curator_state', 'curator_mode', 'curator_scale', 'curator_automerge_max', ...aiSettingKeys(day)]

// Returns null when there is nothing to do (so later jobs get the tick), or a
// log object. opts: { scanDone, explicit, mode, force, now, limits }
//   explicit — the admin's Run now: no slot/time/scan gates; starts today's
//              run if none, resumes an active one, or (force) starts '#n'.
//   scope    — with explicit: {skus: [ids], masters: [ids]} limits a run to
//              those listings and pages ('2026-10-01~1'). A scoped run is a
//              check on a handful of items: it does not count as the day's
//              run, so the daily run still starts on time.
export async function curatorSlice(rawEnv, trigger = 'cron', opts = {}) {
  const t = opts.now ?? Date.now()
  const day = dayKey(t)
  const dayStart = t - (t % DAY)
  const explicit = !!opts.explicit
  const keys = settingKeys(day)
  const settings = Object.fromEntries(((await rawEnv.CATALOG_DB.prepare(`SELECT k, v FROM setting WHERE k IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()).results ?? []).map((r) => [r.k, r.v]))
  if (settings.curator_enabled == null) return explicit ? { job: 'curator', skipped: 'migration 0019 is not applied' } : null
  if (settings.curator_enabled !== '1') return explicit ? { job: 'curator', skipped: 'the curator is paused (curator_enabled=0)' } : null
  const state = parse(settings.curator_state, {}) ?? {}
  const odd = Math.floor(t / 9e5) % 2 === 1
  if (!explicit && !odd) return null

  // "Apply this plan": when no run is active, apply the chosen dry run's plan.
  if (state.apply && !state.active) return applyTick(rawEnv, { t, state, settings, opts })

  let runId = state.active ? state.run : null
  if (!runId) {
    if (!explicit) {
      if ((state.day ?? '') >= day) return null
      if (!opts.scanDone) return null
      if (t < dayStart + START_AFTER_MS) return null
    } else if (state.day === day && !opts.force && !opts.scope) {
      return { job: 'curator', run: state.run, note: "today's run has finished; pass force to start another", report: true }
    }
    const scope = explicit && opts.scope ? { skus: opts.scope.skus ?? [], masters: opts.scope.masters ?? [] } : null
    let next
    if (scope) {
      const scopeSeq = (state.scopeSeq ?? 0) + 1
      runId = `${day}~${scopeSeq}`
      next = { ...state, run: runId, active: true, scoped: true, scopeSeq, apply: null }
    } else {
      const seq = state.day === day ? (state.seq ?? 1) + 1 : 1
      runId = seq === 1 ? day : `${day}#${seq}`
      next = { ...state, day, run: runId, active: true, scoped: false, seq, apply: null }
    }
    const mode = ['dry', 'live'].includes(opts.mode) ? opts.mode : settings.curator_mode === 'live' ? 'live' : 'dry'
    const cap = Number(settings.curator_neuron_cap)
    await rawEnv.CATALOG_DB.batch([
      rawEnv.CATALOG_DB.prepare(`INSERT OR IGNORE INTO curator_run (id, mode, trig, status, phase, cursor, started_at, neuron_cap) VALUES (?,?,?,'running','probe',?,?,?)`)
        .bind(runId, mode, explicit ? 'manual' : 'cron', JSON.stringify({ phase: 'probe', idx: 0, ...(scope ? { scope } : {}) }), t, Number.isFinite(cap) ? cap : 8000),
      rawEnv.CATALOG_DB.prepare(`INSERT INTO setting (k, v) VALUES ('curator_state', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).bind(JSON.stringify(next)),
    ])
    Object.assign(state, next)
  }
  return tick(rawEnv, { t, day, runId, state, settings, trigger, opts })
}

async function tick(rawEnv, { t, day, runId, state, settings, opts }) {
  const meter = makeMeter(settings.curator_scale, t, opts.limits)
  meter.stmts = 1 // the settings read
  const env = budgetedEnv(rawEnv, meter)
  // Mark this tick in flight and read the run in one statement. The previous
  // tick's marker, still set, means that tick was killed (CPU or subrequest
  // limit) before it could save.
  const row = await env.CATALOG_DB.prepare(
    `UPDATE curator_run SET ticks = ticks + 1,
       cursor = json_set(cursor, '$.was', json(COALESCE(json_extract(cursor, '$.inflight'), 'null')),
                                 '$.inflight', json_object('t', ?, 'phase', phase, 'idx', COALESCE(json_extract(cursor, '$.idx'), 0)))
     WHERE id = ? AND status = 'running' RETURNING *`,
  ).bind(t, runId).first()
  if (!row) {
    // The state points at a run that is not running: repair the state.
    await env.CATALOG_DB.prepare(`INSERT INTO setting (k, v) VALUES ('curator_state', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).bind(JSON.stringify({ ...state, active: false })).run()
    return { job: 'curator', run: runId, note: 'run is not running; state repaired' }
  }
  const cursor = parse(row.cursor, {}) ?? {}
  cursor.phase = row.phase ?? cursor.phase ?? 'probe'
  const ai = new AiClient({ env, settings, now: t, run: runId, phase: cursor.phase, meter, health: cursor.health })
  const ctx = makeCtx({ env, raw: rawEnv, t, day, run: row, cursor, state, settings, meter, ai })
  ai.log = (e) => ctx.error(e)

  if (cursor.was) {
    // Killed last tick: halve the budgets, and count the item it was on.
    const scale = Math.max(MIN_SCALE, meter.scale / 2)
    if (scale !== meter.scale) ctx.scaleTo = scale
    const key = `${cursor.was.phase}:${cursor.was.idx}`
    const n = ((cursor.fails ??= {})[key] ?? 0) + 1
    cursor.fails[key] = n
    const msg = `the previous tick (${new Date(cursor.was.t).toISOString()}, ${cursor.was.phase} item ${cursor.was.idx}) did not finish; curator_scale ${meter.scale} → ${scale}`
    console.error(JSON.stringify({ at: 'curator', run: runId, phase: cursor.was.phase, item: null, code: 'killed', msg }))
    ctx.error({ phase: cursor.was.phase, item: null, kind: 'killed', msg })
    if (n >= 3 && cursor.phase === cursor.was.phase && (cursor.idx ?? 0) === cursor.was.idx) {
      cursor.idx = (cursor.idx ?? 0) + 1
      ctx.error({ phase: cursor.phase, item: null, kind: 'poison', msg: `skipped ${cursor.was.phase} item ${cursor.was.idx}: 3 ticks in a row died on it` })
    }
  }

  // Work through the phases until the tick's budget or time runs out.
  let finished = false
  for (;;) {
    const phase = cursor.phase
    const handler = HANDLERS[phase]
    if (!handler) { finished = true; break }
    ai.phase = phase
    let res
    try {
      res = await handler(ctx)
    } catch (e) {
      if (e instanceof BudgetExhausted) break
      const key = `phase:${phase}`
      const n = ((cursor.fails ??= {})[key] ?? 0) + 1
      cursor.fails[key] = n
      const msg = String(e?.stack ?? e?.message ?? e).slice(0, 300)
      console.error(JSON.stringify({ at: 'curator', run: runId, phase, item: null, code: null, msg }))
      ctx.error({ phase, item: null, kind: 'exception', msg })
      if (n < 3) break
      ctx.error({ phase, item: null, kind: 'poison', msg: `phase skipped after ${n} failures` })
      res = 'done'
    }
    if (res !== 'done') break
    const next = PHASES[PHASES.indexOf(phase) + 1]
    cursor.queue = null
    cursor.idx = 0
    if (!next) { finished = true; break }
    cursor.phase = next
    if (ctx.late() || !ctx.room(4)) break
  }

  return flush(ctx, { finished })
}

// The tick's one final batch: catalog writes, actions, provenance, AI cache
// rows and ledger, the run's cursor and counters, and the state.
async function flush(ctx, { finished }) {
  const { raw, cursor, run, ai, state, meter, t } = ctx
  const db = raw.CATALOG_DB
  if (finished) {
    state.active = false
    ctx.stateChanged = true
  }
  const saved = { ...cursor, inflight: null, was: null }
  const setting = (k, v) => db.prepare(`INSERT INTO setting (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).bind(k, v)
  const tail = (errors) => [
    ...ai.pendingStatements(db),
    db.prepare(
      `UPDATE curator_run SET phase=?, cursor=?, ai_calls=ai_calls+?, cache_hits=cache_hits+?, neurons=neurons+?, counts=?, errors=errors+?,
         status=?, finished_at=?, summary=COALESCE(?, summary) WHERE id=?`,
    ).bind(finished ? 'done' : saved.phase, JSON.stringify(saved), ai.calls, ai.cacheHits, Math.round(ai.neurons * 1e4) / 1e4, JSON.stringify(saved.counts ?? {}), errors,
      finished ? 'done' : 'running', finished ? t : null, ctx.summary, run.id),
    ...(ctx.stateChanged ? [setting('curator_state', JSON.stringify(state))] : []),
    ...(ctx.scaleTo != null ? [setting('curator_scale', String(ctx.scaleTo))] : []),
  ]
  const unwrap = (s) => s.__real ?? s
  let errors = ctx.errorCount()
  let stmts = [...ctx.stmts.map(unwrap), ...insertActions(raw, ctx.actions), ...upsertFieldSrc(raw, ctx.fieldSrc), ...tail(errors)]
  meter.stmts += stmts.length
  try {
    await db.batch(stmts)
  } catch (e) {
    // A catalog write failed (say, a constraint an owner edit made true in the
    // meantime). D1 rolled the whole batch back: keep the run's progress and
    // its records, and mark this tick's changes failed.
    const msg = String(e?.message ?? e).slice(0, 300)
    console.error(JSON.stringify({ at: 'curator', run: run.id, phase: cursor.phase, item: null, code: 'batch', msg }))
    const actions = ctx.actions.map((a) => (a.status === 'applied' ? { ...a, status: 'failed', evidence: { ...(a.evidence ?? {}), error: msg } } : a))
    actions.push({ kind: 'error', status: 'failed', runId: run.id, t, entity: 'run', evidence: { phase: cursor.phase, kind: 'batch', msg } })
    errors += 1
    stmts = [...insertActions(raw, actions), ...tail(errors)]
    meter.stmts += stmts.length
    await db.batch(stmts)
  }
  if (meter.stmts > meter.lim.stmts) console.error(JSON.stringify({ at: 'curator', run: run.id, phase: cursor.phase, item: null, code: 'over-budget', msg: `${meter.stmts} statements of ${meter.lim.stmts}` }))
  return {
    job: 'curator',
    run: run.id,
    mode: run.mode,
    phase: finished ? 'done' : saved.phase,
    idx: saved.idx ?? 0,
    queue: saved.queue?.length ?? null,
    statements: meter.stmts,
    ai_calls: ai.calls,
    cache_hits: ai.cacheHits,
    neurons: Math.round(ai.neurons * 100) / 100,
    actions: ctx.actions.filter((a) => a.kind !== 'error').length,
    errors,
    ...(ctx.summary ? { summary: ctx.summary } : {}),
  }
}

// ------------------------------------------------------------ apply a plan
async function applyTick(rawEnv, { t, state, settings, opts }) {
  const meter = makeMeter(settings.curator_scale, t, opts.limits)
  meter.stmts = 1
  const env = budgetedEnv(rawEnv, meter)
  const limit = Math.max(1, Math.floor((meter.lim.stmts - 6) / 4))
  const { stmts, taken } = await planApplyStatements(env, { runId: state.apply.run ?? null, limit, t })
  const doneApplying = taken < limit
  const next = doneApplying ? { ...state, apply: null } : state
  const all = [...stmts.map((s) => s.__real ?? s)]
  if (doneApplying) all.push(rawEnv.CATALOG_DB.prepare(`INSERT INTO setting (k, v) VALUES ('curator_state', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).bind(JSON.stringify(next)))
  if (all.length) await rawEnv.CATALOG_DB.batch(all)
  return { job: 'curator', applying: state.apply.run ?? 'all', taken, done: doneApplying, statements: meter.stmts + all.length }
}

// ---------------------------------------------------------- admin helpers
// Run now: one tick under the jobs lease, then the report so far.
export async function runCuratorNow(env, { mode = null, force = false, scope = null, now = Date.now() } = {}) {
  if (!(await claimLease(env, 'lease:jobs', 4 * 60e3, now))) return { skipped: 'another job slice is running; try again in a minute' }
  try {
    return await curatorSlice(env, 'manual', { explicit: true, mode, force, scope, now })
  } finally {
    await env.CATALOG_DB.prepare("UPDATE setting SET v='0' WHERE k='lease:jobs'").run()
  }
}

// The report the admin reads: the run, its actions, what needs the owner, and
// the last 14 runs.
export async function curatorReport(env, runId = null) {
  const db = env.CATALOG_DB
  const state = parse((await db.prepare(`SELECT v FROM setting WHERE k='curator_state'`).first())?.v, {}) ?? {}
  const id = runId || state.run || (await db.prepare(`SELECT id FROM curator_run ORDER BY started_at DESC LIMIT 1`).first())?.id
  const run = id ? await db.prepare(`SELECT * FROM curator_run WHERE id=?`).bind(id).first() : null
  const actions = id ? (await db.prepare(`SELECT * FROM curator_action WHERE run_id=? ORDER BY id LIMIT 500`).bind(id).all()).results ?? [] : []
  const needsYou = (await db.prepare(`SELECT * FROM curator_action WHERE kind='escalate' AND status='planned' ORDER BY id DESC LIMIT 300`).all()).results ?? []
  const history = (await db.prepare(`SELECT id, mode, trig, status, phase, started_at, finished_at, ticks, ai_calls, cache_hits, neurons, neuron_cap, errors, summary FROM curator_run ORDER BY started_at DESC LIMIT 14`).all()).results ?? []
  const decode = (a) => ({ ...a, before: parse(a.before, null), after: parse(a.after, null), evidence: parse(a.evidence, null) })
  if (run) run.cursor = { ...parse(run.cursor, {}), queue: undefined }
  return { state, run, actions: actions.map(decode), needsYou: needsYou.map(decode), history }
}
