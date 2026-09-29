// Every Workers AI call the catalog makes goes through this module.
//
// Why it exists (2026-09-30): Workers AI had never produced a result in
// production. The enrich prompt called a model Cloudflare retired on
// 2026-05-30 (every call failed with 5028), the role prompt ran String() on a
// response the binding had already parsed into an object, and both catches
// returned null without a word. Here, instead:
//   * models come from an allowlist, and the active set is the setting
//     curator_models, so a future retirement is fixed from the System tab;
//   * requests use the shape each model family expects, with a JSON schema;
//   * responses are read whether they arrive as a string or an object;
//   * the output is checked against the schema (schema.mjs);
//   * each call has a 30 s timeout;
//   * no error is swallowed: each one is logged with console.error, counted,
//     and handed to the caller for its error record;
//   * Neurons are estimated before a call and counted after it, against a
//     daily cap (curator_neuron_cap), with a kill switch (curator_ai='0');
//   * results are cached by input hash (ai_cache), so the same input is never
//     sent twice.

import { check } from './schema.mjs'

// ---------------------------------------------------------------- models
// rates: Neurons per million tokens, from the Workers AI pricing page
// (2026-09-30). shape: how the model takes JSON-schema requests.
export const MODELS = {
  '@cf/google/gemma-4-26b-a4b-it': { shape: 'openai', rin: 9091, rout: 27273, kind: 'text' },
  '@cf/zai-org/glm-4.7-flash': { shape: 'openai', rin: 5500, rout: 36400, kind: 'text' },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { shape: 'legacy', rin: 26668, rout: 204805, kind: 'text' },
  '@cf/baai/bge-m3': { shape: 'embed', rin: 1075, rout: 0, kind: 'embed', dims: 1024 },
  '@cf/qwen/qwen3-embedding-0.6b': { shape: 'embed', rin: 1075, rout: 0, kind: 'embed', dims: 1024 },
}

// Roles → models. The second opinion is a different model family on purpose,
// so two verdicts are independent; it has no fallback (without it, nothing
// auto-merges). Paid-only models are not listed: on Free they fail with 5035.
export const DEFAULT_MODELS = {
  primary: '@cf/google/gemma-4-26b-a4b-it',
  fallback: '@cf/zai-org/glm-4.7-flash',
  second: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  embed: '@cf/baai/bge-m3',
  embed_fallback: '@cf/qwen/qwen3-embedding-0.6b',
}
const FALLBACK_OF = { primary: 'fallback', embed: 'embed_fallback' }
const ROLE_KIND = { primary: 'text', fallback: 'text', second: 'text', embed: 'embed', embed_fallback: 'embed' }

// The setting curator_models is JSON {role: model}. Only allowlisted models of
// the right kind are accepted; anything else keeps the default for that role.
export function resolveModels(json) {
  let o = {}
  try { o = typeof json === 'string' ? JSON.parse(json) : json ?? {} } catch {}
  const out = { ...DEFAULT_MODELS }
  for (const [role, id] of Object.entries(o && typeof o === 'object' ? o : {}))
    if (ROLE_KIND[role] && MODELS[id]?.kind === ROLE_KIND[role]) out[role] = id
  return out
}
export const validModels = (json) => {
  let o
  try { o = JSON.parse(json) } catch { return false }
  return !!o && typeof o === 'object' && !Array.isArray(o) && Object.entries(o).every(([role, id]) => ROLE_KIND[role] && MODELS[id]?.kind === ROLE_KIND[role])
}

export const TIMEOUT_MS = 30000
const CACHE_ROWS_PER_STMT = 12 // 8 columns → 96 bound parameters (D1 caps a statement at 100)
export const DEFAULT_NEURON_CAP = 8000
export const dayKey = (t) => new Date(t).toISOString().slice(0, 10) // UTC day, as Cloudflare resets

// ---------------------------------------------------------- request shape
// OpenAI shape (gemma-4, glm-4.7): strict json_schema, max_completion_tokens,
// and thinking off (on, a call costs about 3.5 times as much). Legacy shape
// (llama-3.3): json_schema is the bare schema, and max_tokens must be set
// because its default is 256.
export function buildInput(modelId, { system, user, schema, maxOut, name = 'out' }) {
  const m = MODELS[modelId]
  if (!m || m.kind !== 'text') throw new Error(`not an allowlisted text model: ${modelId}`)
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }]
  if (m.shape === 'openai')
    return {
      messages,
      response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
      max_completion_tokens: maxOut,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    }
  return { messages, response_format: { type: 'json_schema', json_schema: schema }, max_tokens: maxOut, temperature: 0 }
}

// ------------------------------------------------------------ response shape
export class AiError extends Error {
  constructor(kind, detail) {
    super(detail ? `${kind}: ${detail}` : kind)
    this.name = 'AiError'
    this.kind = kind
  }
}

// Either shape: OpenAI content (a JSON string), or llama-3.3's `response`,
// which the binding returns already parsed. Code fences are tolerated.
export function parseOut(r) {
  const v = r?.choices?.[0]?.message?.content ?? r?.response
  if (v && typeof v === 'object') return v
  if (typeof v !== 'string' || !v.trim()) throw new AiError('empty', r?.choices?.[0]?.finish_reason)
  return JSON.parse(v.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
}

// Workers AI errors carry their code as a message prefix ("5028: … was
// deprecated …"). kind decides what happens next:
//   deprecated | paid → the model is unusable; use the role's fallback
//   exhausted         → the daily free allocation is gone; no more AI today
//   busy | timeout | server → transient; the item waits (never cached)
//   other             → logged
export function classifyError(e) {
  const msg = String(e?.message ?? e ?? '').slice(0, 300)
  const code = Number(msg.match(/^\s*(?:AiError:\s*)?(\d{4})\b/)?.[1] ?? e?.code ?? 0) || null
  let kind = 'other'
  if (e?.kind === 'timeout' || code === 3007 || code === 3008) kind = 'timeout'
  else if (code === 5028 || code === 5007 || code === 3042 || /deprecated|no such model/i.test(msg)) kind = 'deprecated'
  else if (code === 5035) kind = 'paid'
  else if (code === 3036) kind = 'exhausted'
  else if (code === 3040 || code === 429 || /capacity temporarily exceeded|too many requests/i.test(msg)) kind = 'busy'
  else if ((code && code >= 500 && code < 600) || /internal server error|\b5\d\d\b/i.test(msg)) kind = 'server'
  return { code, kind, transient: kind === 'busy' || kind === 'timeout' || kind === 'server', msg }
}

// ----------------------------------------------------------------- Neurons
// Before a call: ceil(chars/4) input tokens at the input rate plus the whole
// output allowance at the output rate. After: the Neurons the response
// reports, else its token usage, else the same chars/4 estimate.
export function estimateNeurons(modelId, chars, maxOut = 0) {
  const m = MODELS[modelId]
  if (!m) return 0
  return (Math.ceil(chars / 4) * m.rin + maxOut * m.rout) / 1e6
}
export function actualNeurons(modelId, r, chars, outChars = 0) {
  const reported = Number(r?.usage?.neurons ?? r?.meta?.neurons)
  if (Number.isFinite(reported) && reported >= 0) return reported
  const m = MODELS[modelId]
  if (!m) return 0
  const tin = Number(r?.usage?.prompt_tokens)
  const tout = Number(r?.usage?.completion_tokens)
  if (Number.isFinite(tin) && Number.isFinite(tout)) return (tin * m.rin + tout * m.rout) / 1e6
  return (Math.ceil(chars / 4) * m.rin + Math.ceil(outChars / 4) * m.rout) / 1e6
}

// ------------------------------------------------------------------ cache
// key = sha256(task | model | prompt version | canonical JSON of the input).
export function canonicalJSON(v) {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']'
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}'
}
export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export const inputHash = (input) => sha256Hex(canonicalJSON(input))
export const cacheKey = (task, modelId, v, input) => sha256Hex(`${task}|${modelId}|${v}|${canonicalJSON(input)}`)

// The call, or a timeout error after ms; the timer is always cleared.
async function withTimeout(p, ms) {
  let timer
  try {
    return await Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`timeout after ${ms} ms`), { kind: 'timeout' })), ms) })])
  } finally {
    clearTimeout(timer)
  }
}

// The settings the client reads (the curator loads them in one query).
export const aiSettingKeys = (day) => ['curator_ai', 'curator_models', 'curator_neuron_cap', 'curator_gateway', `ai_neurons:${day}`, `ai_exhausted:${day}`]

// ------------------------------------------------------------------ client
// One client per tick. It never writes on its own: pendingStatements() hands
// the cache rows and the Neuron ledger to the caller's final batch.
//
//   meter   { canAi(): bool } — the tick's budgets. Counting happens in the
//           budgeted env (curator/index.mjs), which wraps CATALOG_DB and AI.
//   health  { [modelId]: {ok, code} } from the run's probe; dead models are skipped
//   log     (entry) => void — an error record for the caller (curator_action)
export class AiClient {
  constructor({ env, settings = {}, now = Date.now(), run = null, phase = null, meter = null, health = {}, log = null, timeoutMs = TIMEOUT_MS } = {}) {
    this.env = env
    this.day = dayKey(now)
    this.now = now
    this.run = run
    this.phase = phase
    this.meter = meter
    this.log = log
    this.timeoutMs = timeoutMs
    this.enabled = !!env?.AI && (settings.curator_ai ?? '1') !== '0'
    this.models = resolveModels(settings.curator_models)
    const cap = Number(settings.curator_neuron_cap)
    this.cap = Number.isFinite(cap) && cap >= 0 ? cap : DEFAULT_NEURON_CAP
    this.usedBefore = Number(settings[`ai_neurons:${this.day}`] ?? 0) || 0
    this.exhausted = settings[`ai_exhausted:${this.day}`] === '1'
    this.gateway = settings.curator_gateway || null
    this.dead = new Set(Object.entries(health ?? {}).filter(([, h]) => h && h.ok === false && h.dead).map(([id]) => id))
    this.cache = new Map() // key → {status, output}
    this.preloaded = new Set()
    this.writes = [] // ai_cache rows to insert
    this.calls = 0
    this.cacheHits = 0
    this.neurons = 0
    this.budgetSkips = 0
    this.errors = []
    this.newlyExhausted = false
  }

  get used() { return this.usedBefore + this.neurons }

  // The model a role uses now: the role's own, or its fallback when the probe
  // (or a call this tick) found the model retired or paid-only.
  modelFor(role) {
    const own = this.models[role]
    if (own && !this.dead.has(own)) return own
    const fb = FALLBACK_OF[role] && this.models[FALLBACK_OF[role]]
    return fb && !this.dead.has(fb) ? fb : null
  }

  #fail(item, modelId, err) {
    const e = { at: 'curator', run: this.run, phase: this.phase, item: item ?? null, model: modelId, code: err.code, kind: err.kind, msg: err.msg }
    console.error(JSON.stringify(e))
    this.errors.push(e)
    this.log?.(e)
    return e
  }

  // Bulk cache read for a chunk of work: one D1 statement for all the keys.
  async preload(keys) {
    const want = [...new Set(keys)].filter((k) => k && !this.preloaded.has(k))
    for (let i = 0; i < want.length; i += 90) {
      const chunk = want.slice(i, i + 90)
      const rows = (await this.env.CATALOG_DB.prepare(`SELECT key, status, output, model FROM ai_cache WHERE key IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all()).results ?? []
      for (const k of chunk) this.preloaded.add(k)
      for (const r of rows) this.cache.set(r.key, { status: r.status, output: r.output == null ? null : JSON.parse(r.output), model: r.model })
    }
  }

  async #cached(key) {
    if (this.cache.has(key)) return this.cache.get(key)
    if (this.preloaded.has(key)) return null
    await this.preload([key])
    return this.cache.get(key) ?? null
  }

  // The cache keys a task's input would use with this role's current model,
  // for preload().
  keyFor(t, input, role = 'primary') {
    const m = this.modelFor(role)
    return m ? cacheKey(t.task, m, t.v, input) : null
  }

  // Ask one question. t = a task from prompts.mjs ({task, v, system, schema,
  // maxOut, user}); coerce = lossless fixes applied before the schema check.
  // Returns { status, output, model, key, cached, neurons }:
  //   ok        output passed the schema (the caller still runs its checks)
  //   invalid   unparseable or schema-failing output; cached as invalid, so it
  //             is asked again only under a new prompt version or model
  //   budget    the Neuron cap or the day's allocation stops the call
  //   deferred  this tick's call budget is spent, or a transient error: retry later
  //   error     a permanent error for this item (logged)
  //   off       curator_ai='0' or no AI binding: env.AI is never called
  //   unavailable  no usable model for the role
  async ask(t, input, { role = 'primary', item = null, coerce = null, cache = true } = {}) {
    if (!this.enabled) return { status: 'off' }
    for (let attempt = 0; attempt < 2; attempt++) {
      const modelId = this.modelFor(role)
      if (!modelId) return { status: 'unavailable' }
      const key = await cacheKey(t.task, modelId, t.v, input)
      if (cache) {
        const hit = await this.#cached(key)
        if (hit) {
          this.cacheHits++
          return { status: hit.status, output: hit.output, model: modelId, key, cached: true, neurons: 0 }
        }
      }
      if (this.exhausted) { this.budgetSkips++; return { status: 'budget', reason: 'daily allocation used up', model: modelId, key } }
      const user = t.user(input)
      const chars = (t.system?.length ?? 0) + user.length
      const est = estimateNeurons(modelId, chars, t.maxOut)
      if (this.used + est > this.cap) { this.budgetSkips++; return { status: 'budget', reason: `cap ${this.cap}`, model: modelId, key } }
      if (this.meter && !this.meter.canAi()) return { status: 'deferred', reason: 'tick call budget', model: modelId, key }
      this.calls++
      let r
      try {
        const body = buildInput(modelId, { system: t.system, user, schema: t.schema, maxOut: t.maxOut, name: t.task })
        r = await withTimeout(this.env.AI.run(modelId, body, this.gateway ? { gateway: { id: this.gateway } } : undefined), this.timeoutMs)
      } catch (e) {
        if (e?.name === 'BudgetExhausted') throw e // the tick's budget, not an AI failure
        const err = classifyError(e)
        this.#fail(item, modelId, err)
        if (err.kind === 'deprecated' || err.kind === 'paid') { this.dead.add(modelId); continue } // try the fallback
        if (err.kind === 'exhausted') { this.exhausted = true; this.newlyExhausted = true; return { status: 'budget', reason: 'daily allocation used up', model: modelId, key } }
        return { status: err.transient ? 'deferred' : 'error', error: err, model: modelId, key }
      }
      const outText = JSON.stringify(r?.choices?.[0]?.message?.content ?? r?.response ?? '')
      const n = actualNeurons(modelId, r, chars, outText.length)
      this.neurons += n
      let output = null
      let status = 'ok'
      let why = ''
      try {
        output = parseOut(r)
        if (coerce) output = coerce(output)
        const v = check(t.schema, output)
        if (!v.ok) { status = 'invalid'; why = v.errors.slice(0, 4).join('; ') }
      } catch (e) {
        status = 'invalid'
        why = String(e?.message ?? e).slice(0, 200)
      }
      if (status === 'invalid') this.#fail(item, modelId, { code: null, kind: 'invalid', msg: why })
      const row = { status, output: status === 'ok' ? output : null, model: modelId }
      if (cache) {
        this.cache.set(key, row)
        this.writes.push([key, t.task, modelId, t.v, status, row.output == null ? null : JSON.stringify(row.output), n, this.now])
      }
      return { status, output: row.output, model: modelId, key, cached: false, neurons: n, why }
    }
    return { status: 'unavailable' }
  }

  // Model health: probe-v1 to a text model, or one tiny embedding call. Never
  // cached. A retired or paid-only model is marked dead for the run.
  async probe(modelId, probeTask) {
    if (!this.enabled) return { ok: false, off: true }
    const m = MODELS[modelId]
    if (!m) return { ok: false, code: null, msg: 'not allowlisted' }
    if (this.exhausted) return { ok: false, code: 3036, msg: 'daily allocation used up' }
    if (this.meter && !this.meter.canAi()) return { ok: null, deferred: true }
    this.calls++
    const t0 = Date.now()
    try {
      const body = m.kind === 'embed' ? { text: ['probe'] } : buildInput(modelId, { system: probeTask.system, user: probeTask.user(), schema: probeTask.schema, maxOut: probeTask.maxOut, name: 'probe' })
      const r = await withTimeout(this.env.AI.run(modelId, body, this.gateway ? { gateway: { id: this.gateway } } : undefined), this.timeoutMs)
      this.neurons += actualNeurons(modelId, r, 60, 20)
      if (m.kind === 'embed') {
        const ok = Array.isArray(r?.data) && Array.isArray(r.data[0]) && r.data[0].length > 0
        return { ok, ms: Date.now() - t0, ...(ok ? {} : { msg: 'no vector' }) }
      }
      const out = parseOut(r)
      return { ok: out?.ok === true, ms: Date.now() - t0, ...(out?.ok === true ? {} : { msg: 'unexpected reply' }) }
    } catch (e) {
      if (e?.name === 'BudgetExhausted') throw e
      const err = classifyError(e)
      this.#fail('probe', modelId, err)
      if (err.kind === 'deprecated' || err.kind === 'paid') this.dead.add(modelId)
      if (err.kind === 'exhausted') { this.exhausted = true; this.newlyExhausted = true }
      return { ok: false, code: err.code, kind: err.kind, msg: err.msg, dead: err.kind === 'deprecated' || err.kind === 'paid', ms: Date.now() - t0 }
    }
  }

  // Embeddings for up to 100 texts in one call → { status, vectors, model }.
  async embed(texts, { item = null } = {}) {
    if (!this.enabled) return { status: 'off' }
    const modelId = this.modelFor('embed')
    if (!modelId) return { status: 'unavailable' }
    if (this.exhausted) { this.budgetSkips++; return { status: 'budget' } }
    const chars = texts.reduce((s, x) => s + String(x).length, 0)
    if (this.used + estimateNeurons(modelId, chars) > this.cap) { this.budgetSkips++; return { status: 'budget' } }
    if (this.meter && !this.meter.canAi()) return { status: 'deferred' }
    this.calls++
    try {
      const r = await withTimeout(this.env.AI.run(modelId, { text: texts }, this.gateway ? { gateway: { id: this.gateway } } : undefined), this.timeoutMs)
      this.neurons += actualNeurons(modelId, r, chars)
      if (!Array.isArray(r?.data) || r.data.length !== texts.length) throw new AiError('embedding shape', `got ${r?.data?.length ?? 'none'} of ${texts.length}`)
      return { status: 'ok', vectors: r.data, model: modelId }
    } catch (e) {
      if (e?.name === 'BudgetExhausted') throw e
      const err = e instanceof AiError ? { code: null, kind: 'invalid', msg: e.message, transient: false } : classifyError(e)
      this.#fail(item, modelId, err)
      if (err.kind === 'deprecated' || err.kind === 'paid') this.dead.add(modelId)
      if (err.kind === 'exhausted') { this.exhausted = true; this.newlyExhausted = true; return { status: 'budget' } }
      return { status: err.transient ? 'deferred' : 'error', error: err }
    }
  }

  // The statements the caller adds to its final batch: new cache rows, the
  // day's Neuron ledger (added to, never overwritten, so two writers cannot
  // lose each other's spend) and the exhausted flag.
  pendingCount() {
    return Math.ceil(this.writes.length / CACHE_ROWS_PER_STMT) + (this.neurons > 0 ? 1 : 0) + (this.newlyExhausted ? 1 : 0)
  }
  pendingStatements(db = this.env.CATALOG_DB) {
    const out = []
    for (let i = 0; i < this.writes.length; i += CACHE_ROWS_PER_STMT) {
      const rows = this.writes.slice(i, i + CACHE_ROWS_PER_STMT)
      out.push(db.prepare(`INSERT INTO ai_cache (key, task, model, prompt_v, status, output, neurons, created_at) VALUES ${rows.map(() => '(?,?,?,?,?,?,?,?)').join(',')}
        ON CONFLICT(key) DO UPDATE SET status=excluded.status, output=excluded.output, neurons=excluded.neurons, created_at=excluded.created_at`).bind(...rows.flat()))
    }
    if (this.neurons > 0)
      out.push(db.prepare(`INSERT INTO setting (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = CAST(ROUND(CAST(setting.v AS REAL) + CAST(excluded.v AS REAL), 4) AS TEXT)`).bind(`ai_neurons:${this.day}`, String(Math.round(this.neurons * 1e4) / 1e4)))
    if (this.newlyExhausted)
      out.push(db.prepare(`INSERT INTO setting (k, v) VALUES (?, '1') ON CONFLICT(k) DO UPDATE SET v='1'`).bind(`ai_exhausted:${this.day}`))
    return out
  }
}
