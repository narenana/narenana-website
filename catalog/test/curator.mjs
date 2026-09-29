// AI curator tests: the AI client layer, the checks on AI answers, and the
// data fill-up (triage, fill, names, roles), on a real SQLite database with
// every migration applied (d1-sqlite.mjs) and a test double for env.AI
// (ai-double.mjs). No network, no Workers AI calls.
//   npm run curator:test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeD1, seedBasics, addSku, addMaster, addOffer } from './d1-sqlite.mjs'
import { aiDouble, aiError, openai, legacy, fenced, never, userOf, probeReply, embedReply } from './ai-double.mjs'
import { AiClient, parseOut, AiError, buildInput, classifyError, estimateNeurons, resolveModels, validModels, cacheKey, DEFAULT_MODELS } from '../lib/ai.mjs'
import { check } from '../lib/schema.mjs'
import { listingTask, MASTER_TASK, PAIR_TASK, PROBE_TASK } from '../lib/curator/prompts.mjs'
import { checkListing, checkMaster, coerceListing, coerceMaster, rolePolicy, brandKey, isBlankBrand, nameSmell, checkName, checkSpan, checkBrand, normConfig, quoteIn, tokenSubset, spanFromQuote } from '../lib/curator/validate.mjs'
import { curatorSlice, makeMeter, budgetedEnv, BudgetExhausted, curatorReport } from '../lib/curator/index.mjs'
import { mergeGuess } from '../lib/curator/triage.mjs'
import { brandSpellings, needsOf } from '../lib/curator/fill.mjs'
import { revertAction } from '../lib/curator/store.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GEMMA = DEFAULT_MODELS.primary
const GLM = DEFAULT_MODELS.fallback
const LLAMA = DEFAULT_MODELS.second
const BGE = DEFAULT_MODELS.embed
const DAY0 = Date.UTC(2026, 9, 1, 1, 0, 0) // 2026-10-01 01:00 UTC

// Capture console.error lines during fn.
async function withErrors(fn) {
  const saved = console.error
  const lines = []
  console.error = (...a) => lines.push(a.join(' '))
  try {
    return { result: await fn(), lines }
  } finally {
    console.error = saved
  }
}

// ------------------------------------------------------------------ fixtures
const ROLES0 = { fpv_intent: false, beginner_trainer: false, glider: false, scale_replica: false, jet: false, warbird: false, aerobatic: false, airliner: false, sport: false, tags: [] }
// master-v2's flat answer, written as {roles: {…, tags}, confidence: {brand, model, span, roles}}
const mOut = ({ roles = {}, confidence = {}, ...o } = {}) => {
  const c = { brand: 0.95, model: 0.95, span: 0.95, roles: 0.9, ...confidence }
  return {
    brand: '', brand_quote: '', model: '', span_mm: null, span_quote: '', power: 'electric', fixed_wing: true,
    ...o,
    ...ROLES0, ...roles,
    confidence_brand: c.brand, confidence_model: c.model, confidence_span: c.span, confidence_roles: c.roles,
  }
}
const lOut = (o = {}) => ({ kind: 'airframe', brand: '', brand_quote: '', model: '', config: 'unstated', span_mm: null, span_quote: '', power: 'electric', pack_qty: 1, evidence: [], confidence: 0.95, ...o })

// A small catalog with the cases the fill-up must handle.
function catalog() {
  const d1 = makeD1()
  seedBasics(d1)
  // #600: brandless, no span, no power, no roles → brand from a listing quote,
  //       span from two agreeing titles, power by rules, roles by AI
  addMaster(d1, { id: 600, brand: '', name: 'Sky Surfer', slug: 'sky-surfer', power: null })
  addOffer(d1, addSku(d1, { id: 1, title: 'X-UAV Sky Surfer 1400mm PNP', desc: 'X-UAV Sky Surfer, wingspan 1400mm, EPO foam FPV platform' }), 600, 'pnp')
  addOffer(d1, addSku(d1, { id: 2, source: 'shopb', title: 'Sky Surfer 1400mm kit' }), 600, 'kit')
  // #601 Mapbird vs #602/#603 MapBird: spelling
  addMaster(d1, { id: 601, brand: 'Mapbird', name: 'Skysurfer 1400mm Trainer', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing', 'Trainer'], roleSource: 'reviewed' })
  addMaster(d1, { id: 602, brand: 'MapBird', name: 'SkySurfer', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  addMaster(d1, { id: 603, brand: 'MapBird', name: 'Believer', specs: { spanMM: 1960 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  // #120: all-caps seller name → rename
  addMaster(d1, { id: 120, brand: 'Volantex', name: 'RC MUSTANG P-51D', specs: { spanMM: 750 }, roleTags: ['Warbird'], roleSource: 'reviewed' })
  addOffer(d1, addSku(d1, { id: 3, title: 'Volantex RC Mustang P-51D 750mm RTF' }), 120, 'rtf')
  // #344: "Chupito Set" smells; the clean name clashes with #43 → suggestion
  addMaster(d1, { id: 43, brand: 'TBS', name: 'Chupito', specs: { spanMM: 800 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  addMaster(d1, { id: 344, brand: 'TBS', name: 'Chupito Set', specs: { spanMM: '' }, roleTags: ['Sport / Park Flyer', 'FPV / Flying Wing'], roleSource: 'rules' })
  addOffer(d1, addSku(d1, { id: 4, title: 'TBS Chupito Set' }), 344, 'combo')
  // #700: Cessna on the rules catch-all; the AI's Trainer tag must not survive
  addMaster(d1, { id: 700, brand: 'FMS', name: 'Cessna 182', specs: { spanMM: 1500 }, roleTags: ['Sport / Park Flyer'], roleSource: 'rules' })
  addOffer(d1, addSku(d1, { id: 5, title: 'FMS Cessna 182 1500mm PNP beginner friendly' }), 700, 'pnp')
  // #701 reviewed and #702 human tags: never touched, even on the catch-all
  addMaster(d1, { id: 701, brand: 'FMS', name: 'Ranger 1220', specs: {}, roleTags: ['Sport / Park Flyer'], roleSource: 'reviewed' })
  addOffer(d1, addSku(d1, { id: 6, title: 'FMS Ranger 1220mm Trainer' }), 701, 'pnp')
  addMaster(d1, { id: 702, brand: 'FMS', name: 'Ranger 1800', specs: { spanMM: 1800 }, roleTags: ['Sport / Park Flyer'], roleSource: 'human' })
  addOffer(d1, addSku(d1, { id: 7, title: 'FMS Ranger 1800mm' }), 702, 'pnp')
  // #500: a helicopter that slipped in → not-fixed-wing escalation
  addMaster(d1, { id: 500, brand: 'ALIGN', name: 'T-REX 450', specs: {}, status: 'draft', roleTags: ['Sport / Park Flyer'], roleSource: 'rules' })
  addOffer(d1, addSku(d1, { id: 8, title: 'ALIGN T-REX 450 helicopter kit' }), 500, 'kit')
  // pending listings
  addSku(d1, { id: 20, source: 'shopb', title: 'Rc Airplane Sky Surfer Without Electronics', desc: 'Sky Surfer 1400mm wingspan EPO trainer airframe', guess: { brand: 'FMS', name: 'Sky Surfer Without Electronics', spanMM: 1400, config: 'kit', kind: null, via: 'page', at: 1 } })
  addSku(d1, { id: 21, source: 'shopb', title: 'Dualsky XM2830 motor 1100kv', desc: 'Brushless outrunner motor for 3D planes', guess: { brand: '', name: 'Dualsky XM2830 motor 1100kv', spanMM: null, config: 'kit', kind: null, via: 'none', at: 1 } })
  // an approved blurb and offer config that must never change
  d1.run(`UPDATE master_model SET blurb='Owner blurb' WHERE id=120`)
  return d1
}

// Answers for the double, keyed by what the curator sends.
const MASTER_ANSWERS = {
  'Sky Surfer': mOut({ brand: 'X-UAV', brand_quote: 'X-UAV Sky Surfer', model: 'Sky Surfer', span_mm: 1400, span_quote: 'wingspan 1400mm', roles: { fpv_intent: true, beginner_trainer: true, tags: ['FPV / Flying Wing', 'Trainer'] } }),
  'RC MUSTANG P-51D': mOut({ brand: 'Volantex', brand_quote: 'Volantex RC Mustang', model: 'Mustang P-51D', roles: { warbird: true, tags: ['Warbird'] } }),
  'Chupito Set': mOut({ brand: 'TBS', brand_quote: 'TBS Chupito', model: 'Chupito', roles: { fpv_intent: true, tags: ['FPV / Flying Wing'] } }),
  'Cessna 182': mOut({ brand: 'FMS', brand_quote: 'FMS Cessna', model: 'Cessna 182', span_mm: 1500, span_quote: '1500mm', roles: { scale_replica: true, beginner_trainer: true, tags: ['Trainer', 'Scale Civilian'] } }),
  'Ranger 1220': mOut({ brand: 'FMS', brand_quote: 'FMS Ranger', model: 'Ranger 1220', span_mm: 1220, span_quote: '1220mm', roles: { beginner_trainer: true, tags: ['Trainer'] } }),
  'T-REX 450': mOut({ brand: 'ALIGN', brand_quote: 'ALIGN T-REX', model: 'T-REX 450', fixed_wing: false }),
}
const LISTING_ANSWERS = {
  'Rc Airplane Sky Surfer Without Electronics': lOut({ model: 'Sky Surfer', config: 'kit', span_mm: 1400, span_quote: '1400mm wingspan', evidence: ['trainer airframe'], confidence: 0.93 }),
  'Dualsky XM2830 motor 1100kv': lOut({ kind: 'electronics', brand: 'Dualsky', brand_quote: 'Dualsky XM2830', model: '', confidence: 0.97, evidence: ['Brushless outrunner motor'] }),
}
function curatorAi({ master = MASTER_ANSWERS, listing = LISTING_ANSWERS, onMaster = null } = {}) {
  const reply = (body) => {
    const p = probeReply(body)
    if (p) return p
    const u = userOf({ body })
    if (u.startsWith('Title: ')) {
      const title = u.slice(7).split('\n')[0]
      return openai(listing[title] ?? lOut({ kind: 'other', confidence: 0.5 }))
    }
    const input = JSON.parse(u)
    if (onMaster) { const r = onMaster(input); if (r !== undefined) return r }
    return openai(master[input.name] ?? mOut({ confidence: { brand: 0.2, model: 0.2, span: 0.2, roles: 0.2 } }))
  }
  return aiDouble({ [GEMMA]: reply, [GLM]: reply, [LLAMA]: (b) => probeReply(b, 'legacy') ?? legacy({}), [BGE]: (b) => embedReply(b) })
}

// Run the curator to the end of its run, tick by tick (explicit ticks skip the
// slot and time gates). Returns the tick results.
async function runToEnd(env, { mode = 'live', now = DAY0, force = false, max = 60 } = {}) {
  const ticks = []
  for (let i = 0; i < max; i++) {
    const before = { stmts: env.CATALOG_DB.statements, ai: env.AI?.calls?.length ?? 0 }
    const r = await curatorSlice(env, 'manual', { explicit: true, mode, now: now + i * 60e3, force: force && i === 0 })
    ticks.push({ ...r, d1: env.CATALOG_DB.statements - before.stmts, aiCalls: (env.AI?.calls?.length ?? 0) - before.ai })
    if (!r || r.phase === 'done' || r.report || r.skipped) break
  }
  return ticks
}
const catalogHash = (d1) => JSON.stringify(['master_model', 'sku', 'offer', 'merge_candidate', 'slug_alias', 'observation'].map((t) => d1.sql(`SELECT * FROM ${t} ORDER BY rowid`)))
const master = (d1, id) => d1.one(`SELECT * FROM master_model WHERE id=?`, id)

// ============================================================ parsing (1)
test('parseOut reads OpenAI strings, llama-3.3 objects and fenced JSON; empty output is an error', () => {
  assert.deepEqual(parseOut(openai({ ok: true })), { ok: true })
  assert.deepEqual(parseOut(legacy({ ok: true })), { ok: true }, 'llama-3.3 returns an already-parsed object')
  assert.deepEqual(parseOut({ response: '{"ok":true}' }), { ok: true })
  assert.deepEqual(parseOut(fenced({ ok: true })), { ok: true })
  assert.throws(() => parseOut(openai(null, { finish: 'length' })), (e) => e instanceof AiError && /empty: length/.test(e.message))
  assert.throws(() => parseOut(openai('{"ok": tru')), SyntaxError)
})

test('buildInput uses each family\'s JSON-schema shape, thinking off, explicit output limits', () => {
  const t = PROBE_TASK
  const o = buildInput(GEMMA, { system: 's', user: 'u', schema: t.schema, maxOut: 20, name: 'probe' })
  assert.deepEqual(o.response_format, { type: 'json_schema', json_schema: { name: 'probe', schema: t.schema, strict: true } })
  assert.equal(o.max_completion_tokens, 20)
  assert.deepEqual(o.chat_template_kwargs, { enable_thinking: false })
  assert.equal(o.temperature, 0)
  const l = buildInput(LLAMA, { system: 's', user: 'u', schema: t.schema, maxOut: 20 })
  assert.deepEqual(l.response_format, { type: 'json_schema', json_schema: t.schema })
  assert.equal(l.max_tokens, 20, 'llama-3.3 defaults to 256 output tokens unless told')
  assert.throws(() => buildInput('@cf/meta/llama-3.1-8b-instruct', { user: 'u', schema: {}, maxOut: 1 }), /allowlisted/)
})

test('errors are classified by their Workers AI code', () => {
  assert.equal(classifyError(aiError(5028, '@cf/meta/infire-llama-3.1-8b-instruct was deprecated on 2026-05-30')).kind, 'deprecated')
  assert.equal(classifyError(aiError(5007, 'No such model')).kind, 'deprecated')
  assert.equal(classifyError(aiError(5035, 'requires a Workers Paid plan')).kind, 'paid')
  assert.equal(classifyError(aiError(3036, 'daily free allocation')).kind, 'exhausted')
  const busy = classifyError(aiError(3040, 'Capacity temporarily exceeded'))
  assert.equal(busy.kind, 'busy')
  assert.equal(busy.transient, true)
  assert.equal(classifyError(Object.assign(new Error('timeout after 30000 ms'), { kind: 'timeout' })).transient, true)
  assert.equal(classifyError(new Error('boom')).kind, 'other')
})

test('curator_models accepts only allowlisted models of the right kind', () => {
  assert.equal(resolveModels('{"primary":"@cf/zai-org/glm-4.7-flash"}').primary, GLM)
  assert.equal(resolveModels('{"primary":"@cf/moonshotai/kimi-k2.6"}').primary, GEMMA, 'not allowlisted: the default stays')
  assert.equal(resolveModels('{"embed":"@cf/google/gemma-4-26b-a4b-it"}').embed, BGE, 'a text model cannot embed')
  assert.equal(validModels('{"second":"@cf/meta/llama-3.3-70b-instruct-fp8-fast"}'), true)
  assert.equal(validModels('{"second":"@cf/meta/llama-3.1-8b-instruct"}'), false)
  assert.equal(validModels('not json'), false)
})

// ============================================================ client
const clientEnv = (responders, settings = {}) => {
  const d1 = makeD1()
  const env = { CATALOG_DB: d1, AI: aiDouble(responders) }
  return { d1, env, settings }
}

test('the client reads a llama-3.3 object response (the old aiRoleTags bug) and checks the schema', async () => {
  const { env } = clientEnv({ [LLAMA]: () => legacy({ ok: true }) })
  const ai = new AiClient({ env, now: DAY0 })
  const r = await ai.ask(PROBE_TASK, {}, { role: 'second' })
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.output, { ok: true })
  const bad = new AiClient({ env: { ...env, AI: aiDouble({ [GEMMA]: () => openai({ ok: 'yes' }) }) }, now: DAY0 })
  const { result, lines } = await withErrors(() => bad.ask(PROBE_TASK, {}))
  assert.equal(result.status, 'invalid')
  assert.equal(lines.length, 1, 'a schema failure is logged, never swallowed')
  assert.match(JSON.parse(lines[0]).msg, /expected boolean/)
})

test('a retired model (5028) falls back to the role\'s fallback, logged', async () => {
  const { env } = clientEnv({ [GEMMA]: () => { throw aiError(5028, 'deprecated') }, [GLM]: () => openai({ ok: true }) })
  const ai = new AiClient({ env, now: DAY0 })
  const { result, lines } = await withErrors(() => ai.ask(PROBE_TASK, {}))
  assert.equal(result.status, 'ok')
  assert.equal(result.model, GLM)
  assert.equal(ai.errors[0].code, 5028)
  assert.equal(lines.length, 1)
  assert.equal(ai.modelFor('primary'), GLM, 'the retired model stays out for the rest of the run')
  assert.equal(ai.modelFor('second'), LLAMA)
})

test('transient errors and timeouts defer the item and are never cached', async () => {
  let n = 0
  const { env } = clientEnv({ [GEMMA]: () => (++n === 1 ? never() : Promise.reject(aiError(3040, 'Capacity temporarily exceeded'))) })
  const ai = new AiClient({ env, now: DAY0, timeoutMs: 30 })
  const { result: a } = await withErrors(() => ai.ask(PROBE_TASK, {}))
  assert.equal(a.status, 'deferred')
  assert.equal(ai.errors[0].kind, 'timeout')
  const { result: b } = await withErrors(() => ai.ask(PROBE_TASK, {}))
  assert.equal(b.status, 'deferred')
  assert.equal(ai.writes.length, 0, 'nothing transient is cached')
})

// ============================================================ budget (3)
const bigTask = { task: 'budget', v: 'b1', system: '', maxOut: 1460, schema: PROBE_TASK.schema, user: (i) => 'x'.repeat(80 - String(i.n).length) + i.n }

test('Neuron cap: with a cap of 100 and 40-Neuron calls the third call is never made, and the ledger matches', async () => {
  assert.ok(Math.abs(estimateNeurons(GEMMA, 80, 1460) - 40) < 0.1)
  const { env, d1 } = clientEnv({ [GEMMA]: () => openai({ ok: true }, { u: { neurons: 40 } }) })
  const ai = new AiClient({ env, now: DAY0, settings: { curator_neuron_cap: '100' } })
  assert.equal((await ai.ask(bigTask, { n: 1 })).status, 'ok')
  assert.equal((await ai.ask(bigTask, { n: 2 })).status, 'ok')
  const third = await ai.ask(bigTask, { n: 3 })
  assert.equal(third.status, 'budget')
  assert.equal(env.AI.calls.length, 2, 'the third call is never made')
  await d1.batch(ai.pendingStatements())
  assert.equal(Number(d1.one(`SELECT v FROM setting WHERE k='ai_neurons:2026-10-01'`).v), 80)
  // the next client the same day starts from the ledger
  const again = new AiClient({ env, now: DAY0 + 3600e3, settings: { curator_neuron_cap: '100', 'ai_neurons:2026-10-01': '80' } })
  assert.equal((await again.ask(bigTask, { n: 4 })).status, 'budget')
  assert.equal(env.AI.calls.length, 2)
})

test('3036 (daily allocation used up) stops AI for the day', async () => {
  const { env, d1 } = clientEnv({ [GEMMA]: () => { throw aiError(3036, 'You have used up your daily free allocation of 10,000 neurons') } })
  const ai = new AiClient({ env, now: DAY0 })
  const { result } = await withErrors(() => ai.ask(PROBE_TASK, {}))
  assert.equal(result.status, 'budget')
  assert.equal((await ai.ask(listingTask(), { title: 't', shop: 's', text: '', configs: ['kit'] })).status, 'budget')
  assert.equal(env.AI.calls.length, 1)
  await d1.batch(ai.pendingStatements())
  assert.equal(d1.one(`SELECT v FROM setting WHERE k='ai_exhausted:2026-10-01'`).v, '1')
  const later = new AiClient({ env, now: DAY0 + 7200e3, settings: { 'ai_exhausted:2026-10-01': '1' } })
  assert.equal((await later.ask(PROBE_TASK, { again: 1 })).status, 'budget')
  assert.equal(env.AI.calls.length, 1, 'no more calls that day')
  const tomorrow = new AiClient({ env, now: DAY0 + 86400e3, settings: { 'ai_exhausted:2026-10-01': '1' } })
  assert.equal(tomorrow.exhausted, false)
})

test('curator_ai=0: the curator runs on rules only and env.AI is never called', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  d1.run(`UPDATE setting SET v='0' WHERE k='curator_ai'`)
  const ticks = await runToEnd(env, { mode: 'live' })
  assert.equal(ticks.at(-1).phase, 'done')
  assert.equal(env.AI.calls.length, 0)
  assert.equal(master(d1, 600).power, 'electric', 'rules still fill power')
  assert.equal(JSON.parse(master(d1, 600).specs).spanMM, 1400, 'and a wingspan two titles agree on')
  assert.equal(master(d1, 600).brand, '', 'but nothing the AI would have supplied')
})

// ============================================================ cache (4)
test('cache: the same input costs one call; a new prompt version or model asks again', async () => {
  const { env, d1 } = clientEnv({ [GEMMA]: () => openai({ ok: true }), [GLM]: () => openai({ ok: true }) })
  const ai = new AiClient({ env, now: DAY0 })
  await ai.ask(PROBE_TASK, { a: 1, b: [1, 2] })
  await d1.batch(ai.pendingStatements())
  const ai2 = new AiClient({ env, now: DAY0 })
  const hit = await ai2.ask(PROBE_TASK, { b: [1, 2], a: 1 })
  assert.equal(hit.cached, true, 'key order does not matter (canonical JSON)')
  assert.equal(env.AI.calls.length, 1)
  await ai2.ask({ ...PROBE_TASK, v: 'probe-v2' }, { a: 1, b: [1, 2] })
  assert.equal(env.AI.calls.length, 2, 'a new prompt version is a new key')
  const ai3 = new AiClient({ env, now: DAY0, settings: { curator_models: JSON.stringify({ primary: GLM }) } })
  await ai3.ask(PROBE_TASK, { a: 1, b: [1, 2] })
  assert.equal(env.AI.calls.at(-1).model, GLM)
  assert.notEqual(await cacheKey('probe', GEMMA, 'probe-v1', {}), await cacheKey('probe', GLM, 'probe-v1', {}))
  // invalid answers are cached too: asked again only under a new version
  const { env: e2, d1: d2 } = clientEnv({ [GEMMA]: () => openai('not json') })
  const bad = new AiClient({ env: e2, now: DAY0 })
  await withErrors(() => bad.ask(PROBE_TASK, { z: 1 }))
  await d2.batch(bad.pendingStatements())
  const bad2 = new AiClient({ env: e2, now: DAY0 })
  assert.equal((await bad2.ask(PROBE_TASK, { z: 1 })).status, 'invalid')
  assert.equal(e2.AI.calls.length, 1)
})

// ============================================================ validation (2)
test('listing checks: brand needs a quote from the listing, span a matching quote, names only listing words', () => {
  const input = { title: 'Rc Airplane Sky Surfer Without Electronics', shop: 'Havoc Hobby', text: 'Sky Surfer 1400mm wingspan EPO trainer airframe', configs: ['kit', 'pnp', 'rtf', 'combo'] }
  let c = checkListing(lOut({ brand: 'Havoc Hobby', brand_quote: 'Havoc Hobby', model: 'Sky Surfer', span_mm: 1400, span_quote: '1400mm wingspan' }), input)
  assert.equal(c.brand, '', "the shop's name is not in the listing text, so it is not the brand")
  assert.equal(c.model, 'Sky Surfer')
  assert.equal(c.spanMM, 1400)
  c = checkListing(lOut({ model: 'Sky Surfer Pro', span_mm: 1500, span_quote: '1400mm wingspan' }), input)
  assert.equal(c.model, '', 'an invented word drops the name')
  assert.equal(c.spanMM, null, 'a span that does not match its quote is dropped')
  c = checkListing(lOut({ model: 'Sky Surfer Without Electronics' }), input)
  assert.equal(c.model, '', 'a configuration phrase in the name drops it')
  assert.equal(checkListing(lOut({ span_mm: 1400, span_quote: '1400mm span' }), input).spanMM, null, 'the quote must be in the text')
  assert.equal(checkListing(lOut({ brand: 'Arf', brand_quote: 'Arf' }), { ...input, title: 'Arf Air Frame Canray' }).brand, '', 'a configuration word is not a brand')
})

test('configs: BNF and PNF are PNP, ARF a kit, an unknown config fails the schema', () => {
  const task = listingTask(['kit', 'pnp', 'rtf', 'combo'])
  const bnf = coerceListing(lOut({ config: 'BNF' }), ['kit', 'pnp', 'rtf', 'combo'])
  assert.equal(bnf.config, 'pnp')
  assert.equal(check(task.schema, bnf).ok, true)
  const odd = coerceListing(lOut({ config: 'glider' }), ['kit', 'pnp', 'rtf', 'combo'])
  assert.equal(check(task.schema, odd).ok, false, 'rejected: not one of the category configs')
  assert.equal(normConfig('ARF'), 'kit')
  assert.equal(checkListing(lOut({ config: 'unstated' }), { title: 'x', text: '', configs: ['kit'] }).config, null, 'unstated leaves the heuristic config')
})

test('role policy: off-list tags dropped; Trainer strict; FPV is intent; gliders are not trainers', () => {
  const titles = 'FMS Cessna 182 1500mm PNP beginner friendly'
  assert.deepEqual(coerceMaster(mOut({ roles: { tags: ['Racer', 'warbird'] } })).tags, ['Racer', 'Warbird'])
  assert.equal(check(MASTER_TASK.schema, coerceMaster(mOut({ roles: { tags: ['Racer'] } }))).ok, false, 'an off-list tag fails the schema')
  assert.deepEqual(rolePolicy({ ...ROLES0, beginner_trainer: true, scale_replica: true, tags: ['Trainer', 'Scale Civilian'] }, titles), ['Scale Civilian'], 'a Cessna marketed as easy is not a Trainer')
  assert.deepEqual(rolePolicy({ ...ROLES0, aerobatic: true, tags: ['FPV / Flying Wing', 'Aerobatic / 3D'] }, 'FunJet delta'), ['Aerobatic / 3D'], 'a delta without FPV intent is not FPV')
  assert.deepEqual(rolePolicy({ ...ROLES0, glider: true, beginner_trainer: true, tags: ['Glider / Sailplane', 'Trainer'] }, 'Radian glider'), ['Glider / Sailplane'], 'a glider is not a Trainer')
  assert.deepEqual(rolePolicy({ ...ROLES0, glider: true, beginner_trainer: true, tags: ['Glider / Sailplane', 'Trainer'] }, 'Glider trainer 1200'), ['Glider / Sailplane', 'Trainer'], 'unless a title says trainer')
  assert.deepEqual(rolePolicy({ ...ROLES0, beginner_trainer: true, tags: ['Trainer'] }, 'Aerostar foam'), ['Trainer'], 'budget beginner foamies stay Trainers')
  assert.deepEqual(rolePolicy({ ...ROLES0, tags: ['Glider / Sailplane'] }, ''), [], 'no glider fact, no glider tag')
})

test('brand keys, blank brands, name smells and quotes', () => {
  for (const [a, b] of [['Havoc Hobby', 'Havoc'], ['CARF-Models', 'CARF'], ['Robosynckits', 'Robosync'], ['VolantexRC', 'Volantex'], ['Mapbird', 'MapBird'], ['Aeromodelling Tutor', 'Aeromodellingtutor']]) assert.equal(brandKey(a), brandKey(b), `${a} ~ ${b}`)
  assert.equal(brandKey('DW Hobby'), 'dwhobby', 'a suffix stays when fewer than 4 characters would remain')
  for (const b of ['', 'Unbranded', 'generic', 'DIY', 'Arf', 'PNP', 'RC']) assert.equal(isBlankBrand(b), true, b)
  assert.equal(isBlankBrand('FMS'), false)
  assert.match(nameSmell('Chupito Set'), /configuration/)
  assert.match(nameSmell('Extra NG (Red)'), /colour/)
  assert.match(nameSmell('Rc Airplane Piper Cub'), /shop words|configuration/)
  assert.match(nameSmell('Volantex Ranger EX', 'Volantex'), /brand/)
  assert.match(nameSmell('sky surfer x8 kit epo'), /configuration/)
  assert.match(nameSmell('mapbird sky surfer long range'), /lower case/)
  assert.equal(nameSmell('Ranger 2000 (757-8)', 'Volantex'), '')
  assert.equal(checkName('SkySurfer 1400mm', 'MAPBIRD SKY SURFER 1400 MM trainer kit').name, 'SkySurfer 1400mm')
  assert.equal(checkName('Mustang P-51D', 'RC MUSTANG P51D 750mm').name, 'Mustang P-51D')
  assert.equal(quoteIn('Wingspan: 1400mm', 'The wingspan : 1400 mm, EPO'), true)
  assert.equal(quoteIn('TBS', 'tbsp of glue'), false, 'quotes match whole words')
  assert.equal(tokenSubset('Chupito', ''), false)
  assert.equal(spanFromQuote('40" wingspan'), 1016)
  assert.equal(checkSpan(1016, '40"', 'Ta Horizon 40" Stol X'), 1016)
  assert.equal(checkSpan(1100, '40"', 'Ta Horizon 40" Stol X'), null)
  assert.equal(checkBrand('X-UAV', 'X-UAV Sky Surfer', 'X-UAV Sky Surfer 1400mm'), 'X-UAV')
  assert.equal(checkBrand('X-UAV', 'Sky Surfer', 'X-UAV Sky Surfer 1400mm'), '', 'the quote must contain the brand')
})

// ============================================================ fill-up (live)
test('live run: fills blanks with provenance, cleans a seller name, applies the role policy, escalates the rest', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  const offersBefore = JSON.stringify(d1.sql(`SELECT * FROM offer ORDER BY sku_id`))
  const { result: ticks } = await withErrors(() => runToEnd(env, { mode: 'live' }))
  const last = ticks.at(-1)
  assert.equal(last.phase, 'done')
  assert.match(last.summary, /^Last run 2026-10-01 \(live\): 0 merged, \d+ filled, \d+ listings sorted, \d+ need you\./)

  // #600: brand from a verified quote, span from two agreeing titles, power by rules, roles by AI
  const m600 = master(d1, 600)
  assert.equal(m600.brand, 'X-UAV')
  assert.equal(m600.brand_norm, 'x uav')
  assert.equal(JSON.parse(m600.specs).spanMM, 1400)
  assert.equal(m600.power, 'electric')
  assert.deepEqual(JSON.parse(m600.role_tags), ['FPV / Flying Wing', 'Trainer'])
  assert.equal(m600.role_source, 'ai')
  const src = Object.fromEntries(d1.sql(`SELECT field, src FROM field_src WHERE entity='master' AND entity_id=600`).map((r) => [r.field, r.src]))
  assert.deepEqual(src, { brand: 'curator', 'specs.spanMM': 'rules', power: 'rules', role_tags: 'curator' })
  const brandAct = d1.one(`SELECT * FROM curator_action WHERE entity_id=600 AND kind='fill' AND json_extract(after,'$.field')='brand'`)
  assert.equal(brandAct.status, 'applied')
  assert.equal(JSON.parse(brandAct.before).value, '')
  assert.equal(JSON.parse(brandAct.evidence).quote, 'X-UAV Sky Surfer')
  assert.equal(JSON.parse(brandAct.evidence).prompt_v, 'master-v2')
  assert.ok(brandAct.confidence >= 0.9 && brandAct.input_hash)

  // brand spelling follows the majority
  assert.equal(master(d1, 601).brand, 'MapBird')
  // #120: the all-caps name is cleaned; its blurb and offers are untouched
  assert.equal(master(d1, 120).name, 'Mustang P-51D')
  assert.equal(master(d1, 120).blurb, 'Owner blurb')
  assert.equal(JSON.stringify(d1.sql(`SELECT * FROM offer ORDER BY sku_id`)), offersBefore, 'offer configs and pack sizes never change')
  // #344: "Chupito" would clash with #43 → a suggestion, not a rename
  assert.equal(master(d1, 344).name, 'Chupito Set')
  const sugg = d1.one(`SELECT * FROM curator_action WHERE entity_id=344 AND kind='escalate'`)
  assert.equal(JSON.parse(sugg.evidence).issue, 'name-suggestion')
  assert.equal(sugg.other_id, 43)
  // #700: Cessna keeps no Trainer tag; #701 reviewed and #702 human untouched
  assert.deepEqual(JSON.parse(master(d1, 700).role_tags), ['Scale Civilian'])
  assert.equal(master(d1, 701).role_source, 'reviewed')
  assert.deepEqual(JSON.parse(master(d1, 701).role_tags), ['Sport / Park Flyer'])
  assert.equal(master(d1, 702).role_source, 'human')
  // #500: a helicopter is escalated, never changed
  const heli = d1.one(`SELECT * FROM curator_action WHERE entity_id=500 AND kind='escalate' AND json_extract(evidence,'$.issue')='not-fixed-wing'`)
  assert.ok(heli)
  assert.equal(master(d1, 500).status, 'draft')

  // pending listings: the AI refreshes the Review prefill; page-chrome "FMS" is gone
  const g20 = JSON.parse(d1.one(`SELECT guess FROM sku WHERE id=20`).guess)
  assert.equal(g20.brand, '')
  assert.equal(g20.name, 'Sky Surfer')
  assert.equal(g20.kind, 'aircraft')
  assert.equal(g20.via, 'page+ai')
  assert.equal(g20.ai.confidence, 0.93)
  const g21 = JSON.parse(d1.one(`SELECT guess FROM sku WHERE id=21`).guess)
  assert.equal(g21.kind, 'accessory')
  assert.equal(g21.ai.kind, 'electronics')
  assert.equal(d1.one(`SELECT review_status FROM sku WHERE id=21`).review_status, 'new', 'triage never decides a listing here')

  // tick budgets
  for (const t of ticks) {
    assert.ok(t.d1 <= 34, `tick used ${t.d1} D1 statements`)
    assert.ok(t.aiCalls <= 6, `tick made ${t.aiCalls} AI calls`)
  }
  const run = d1.one(`SELECT * FROM curator_run WHERE id='2026-10-01'`)
  assert.equal(run.status, 'done')
  assert.equal(run.ai_calls, env.AI.calls.length)
  assert.ok(run.neurons > 0)
  assert.ok(Number(d1.one(`SELECT v FROM setting WHERE k='ai_neurons:2026-10-01'`).v) > 0)
  assert.equal(JSON.parse(d1.one(`SELECT v FROM setting WHERE k='curator_state'`).v).active, false)
})

test('owner locks: fields the owner set are never filled or renamed', async () => {
  const d1 = catalog()
  d1.run(`INSERT INTO field_src (entity, entity_id, field, src, at) VALUES ('master',120,'name','owner',1), ('master',600,'brand','owner',1), ('master',600,'specs.spanMM','directive',1)`)
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  await withErrors(() => runToEnd(env, { mode: 'live' }))
  assert.equal(master(d1, 120).name, 'RC MUSTANG P-51D', 'the owner-locked name stays')
  assert.equal(master(d1, 600).brand, '', 'an owner-locked blank brand stays blank')
  assert.equal(JSON.parse(master(d1, 600).specs).spanMM, undefined, 'a directive-locked span stays')
  assert.equal(master(d1, 600).power, 'electric', 'unlocked fields still fill')
  assert.equal(d1.one(`SELECT src FROM field_src WHERE entity_id=120 AND field='name'`).src, 'owner')
})

test('invalid AI output is logged and recorded as an error, and the page falls back to rules', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi({ onMaster: (i) => (i.name === 'Sky Surfer' ? openai('{"brand": "X-UAV", ') : undefined) }) }
  const { lines } = await withErrors(() => runToEnd(env, { mode: 'live' }))
  const err = d1.one(`SELECT * FROM curator_action WHERE kind='error' AND entity='master' AND entity_id=600`)
  assert.ok(err, 'an error action for the page')
  assert.equal(JSON.parse(err.evidence).kind, 'invalid')
  assert.ok(lines.some((l) => /"at":"curator"/.test(l) && /master:600/.test(l)))
  assert.equal(master(d1, 600).brand, '')
  assert.equal(master(d1, 600).power, 'electric')
  assert.ok(d1.one(`SELECT errors FROM curator_run`).errors >= 1)
})

// ============================================================ dry run + apply (11)
test('dry run changes no catalog table, records the plan; a second run the same day adds nothing and asks nothing', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  const before = catalogHash(d1)
  await withErrors(() => runToEnd(env, { mode: 'dry' }))
  assert.equal(catalogHash(d1), before, 'catalog tables unchanged')
  const planned = d1.sql(`SELECT * FROM curator_action WHERE status='planned' AND kind<>'escalate'`)
  assert.ok(planned.length >= 6, `${planned.length} planned changes`)
  assert.equal(d1.sql(`SELECT * FROM field_src`).length, 0, 'no provenance written in a dry run')
  const calls = env.AI.calls.length
  const actions = d1.one(`SELECT COUNT(*) n FROM curator_action`).n
  const again = await withErrors(() => runToEnd(env, { mode: 'dry', now: DAY0 + 3600e3, force: true }))
  assert.equal(again.result.at(-1).phase, 'done')
  assert.equal(again.result[0].run, '2026-10-01#2')
  assert.equal(env.AI.calls.length, calls, 'the second run makes 0 AI calls (cache, and the day\'s probe)')
  assert.equal(d1.one(`SELECT COUNT(*) n FROM curator_action`).n, actions, 'and 0 new actions')
  assert.equal(catalogHash(d1), before)
  // Run now once today's run has finished, without force: nothing starts
  const r = await curatorSlice(env, 'manual', { explicit: true, now: DAY0 + 7200e3 })
  assert.equal(r.report, true)
})

test('apply this plan: planned changes are applied, a field changed since is skipped as stale', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  await withErrors(() => runToEnd(env, { mode: 'dry' }))
  d1.run(`UPDATE master_model SET name='Mustang P51-D (owner)' WHERE id=120`) // the owner edits after planning
  d1.run(`UPDATE setting SET v=json_set(v,'$.apply',json('{"run":"2026-10-01"}')) WHERE k='curator_state'`)
  for (let i = 0; i < 10; i++) {
    const r = await curatorSlice(env, 'manual', { explicit: true, now: DAY0 + 3600e3 + i })
    if (r.done) break
  }
  assert.equal(master(d1, 600).brand, 'X-UAV')
  assert.equal(JSON.parse(master(d1, 600).specs).spanMM, 1400)
  assert.equal(master(d1, 601).brand, 'MapBird')
  assert.equal(d1.one(`SELECT src FROM field_src WHERE entity_id=600 AND field='brand'`).src, 'curator')
  assert.deepEqual(JSON.parse(master(d1, 700).role_tags), ['Scale Civilian'])
  assert.equal(master(d1, 700).role_source, 'ai')
  assert.equal(JSON.parse(d1.one(`SELECT guess FROM sku WHERE id=20`).guess).via, 'page+ai', 'listing prefills too')
  assert.equal(master(d1, 120).name, 'Mustang P51-D (owner)', "the owner's later edit wins")
  const stale = d1.one(`SELECT status FROM curator_action WHERE entity_id=120 AND kind='rename'`)
  assert.equal(stale.status, 'skipped')
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE status='planned' AND kind IN ('fill','rename','roles')`).length, 0)
  assert.equal(JSON.parse(d1.one(`SELECT v FROM setting WHERE k='curator_state'`).v).apply, null)
})

test('revert restores the old value and locks the field as the owner\'s', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  await withErrors(() => runToEnd(env, { mode: 'live' }))
  const a = d1.one(`SELECT id FROM curator_action WHERE entity_id=120 AND kind='rename' AND status='applied'`)
  const r = await revertAction(env, a.id, 'admin')
  assert.equal(r.ok, true)
  assert.equal(master(d1, 120).name, 'RC MUSTANG P-51D')
  assert.equal(d1.one(`SELECT src FROM field_src WHERE entity_id=120 AND field='name'`).src, 'owner')
  assert.equal(d1.one(`SELECT status FROM curator_action WHERE id=?`, a.id).status, 'undone')
  assert.equal(needsOf(master(d1, 120), new Map([[120, new Map([['name', 'owner']])]])).name, undefined, 'never renamed again')
  const roles = d1.one(`SELECT id FROM curator_action WHERE entity_id=700 AND kind='roles'`)
  await revertAction(env, roles.id, 'admin')
  assert.equal(master(d1, 700).role_source, 'human', 'reverted tags are the owner\'s')
  assert.equal((await revertAction(env, a.id, 'admin')).ok, false, 'an undone change cannot be undone twice')
})

// ============================================================ tick budgets (12)
test('tick budgets are counted, and a killed tick halves curator_scale', async () => {
  const meter = makeMeter(1)
  const env = budgetedEnv({ CATALOG_DB: makeD1(), AI: aiDouble({ '*': () => openai({ ok: true }) }) }, meter)
  for (let i = 0; i < 34; i++) await env.CATALOG_DB.prepare('SELECT 1').first()
  await assert.rejects(env.CATALOG_DB.prepare('SELECT 1').first(), BudgetExhausted)
  const m2 = makeMeter(1)
  const e2 = budgetedEnv({ CATALOG_DB: makeD1(), AI: aiDouble({ '*': () => openai({ ok: true }) }) }, m2)
  await e2.CATALOG_DB.batch([e2.CATALOG_DB.prepare('SELECT 1'), e2.CATALOG_DB.prepare('SELECT 2')])
  assert.equal(m2.stmts, 2, 'each statement in a batch counts')
  for (let i = 0; i < 6; i++) await e2.AI.run(GEMMA, {})
  await assert.rejects(e2.AI.run(GEMMA, {}), BudgetExhausted)
  assert.equal(makeMeter(10).lim.stmts, 340, 'curator_scale multiplies the budgets')

  const d1 = catalog()
  const envC = { CATALOG_DB: d1, AI: curatorAi() }
  await withErrors(() => curatorSlice(envC, 'manual', { explicit: true, mode: 'dry', now: DAY0 }))
  // simulate a tick that died before saving: its in-flight marker is still set
  d1.run(`UPDATE curator_run SET cursor=json_set(cursor,'$.inflight',json('{"t":1,"phase":"triage","idx":0}'))`)
  const { lines } = await withErrors(() => curatorSlice(envC, 'manual', { explicit: true, mode: 'dry', now: DAY0 + 60e3 }))
  assert.equal(d1.one(`SELECT v FROM setting WHERE k='curator_scale'`).v, '0.5')
  assert.ok(d1.one(`SELECT * FROM curator_action WHERE kind='error' AND json_extract(evidence,'$.kind')='killed'`))
  assert.ok(lines.some((l) => /killed/.test(l)))
})

test('an item that fails 3 ticks in a row is skipped with an error record', async () => {
  const { HANDLERS } = await import('../lib/curator/index.mjs')
  const saved = HANDLERS.triage
  let tries = 0
  HANDLERS.triage = async (ctx) => {
    ctx.cursor.queue ??= [21]
    while (ctx.cursor.idx < ctx.cursor.queue.length) {
      const out = await ctx.item('sku:21', async () => { tries++; throw new Error('boom') })
      if (out === 'stop') return 'more'
      ctx.cursor.idx++
    }
    return 'done'
  }
  try {
    const d1 = catalog()
    const env = { CATALOG_DB: d1, AI: curatorAi() }
    const { lines } = await withErrors(async () => {
      for (let i = 0; i < 4; i++) await curatorSlice(env, 'manual', { explicit: true, mode: 'dry', now: DAY0 + i })
    })
    assert.equal(tries, 3)
    const errs = d1.sql(`SELECT json_extract(evidence,'$.kind') k FROM curator_action WHERE kind='error' AND entity='sku' AND entity_id=21`).map((r) => r.k)
    assert.deepEqual(errs, ['exception', 'exception', 'exception', 'poison'])
    assert.ok(lines.filter((l) => /boom/.test(l)).length >= 3, 'each failure is logged')
    assert.notEqual(d1.one(`SELECT phase FROM curator_run`).phase, 'triage', 'the run moved on')
  } finally {
    HANDLERS.triage = saved
  }
})

test('cron gates: nothing before the scan is done, before 00:30 UTC, on even slots, or when paused', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  const odd = (t) => (Math.floor(t / 9e5) % 2 === 1 ? t : t + 9e5)
  assert.equal(await curatorSlice(env, 'cron', { scanDone: false, now: odd(DAY0) }), null)
  assert.equal(await curatorSlice(env, 'cron', { scanDone: true, now: odd(Date.UTC(2026, 9, 1, 0, 15)) }), null, 'before 00:30 UTC')
  assert.equal(await curatorSlice(env, 'cron', { scanDone: true, now: odd(DAY0) + 9e5 }), null, 'an even slot')
  d1.run(`UPDATE setting SET v='0' WHERE k='curator_enabled'`)
  assert.equal(await curatorSlice(env, 'cron', { scanDone: true, now: odd(DAY0) }), null, 'paused')
  d1.run(`UPDATE setting SET v='1' WHERE k='curator_enabled'`)
  const r = await withErrors(() => curatorSlice(env, 'cron', { scanDone: true, now: odd(DAY0) }))
  assert.equal(r.result.run, '2026-10-01', 'due: the run starts')
  assert.equal(d1.one(`SELECT mode FROM curator_run`).mode, 'dry', 'in the configured mode (migration default: dry)')
  const noTables = { CATALOG_DB: makeD1({ upTo: '0018_slug_alias.sql' }), AI: curatorAi() }
  assert.equal(await curatorSlice(noTables, 'cron', { scanDone: true, now: odd(DAY0) }), null, 'before migration 0019: nothing')
})

test('a scoped Run now checks only the named items and does not count as the day\'s run', async () => {
  const d1 = catalog()
  const env = { CATALOG_DB: d1, AI: curatorAi() }
  for (let i = 0; i < 20; i++) {
    const r = await withErrors(() => curatorSlice(env, 'manual', { explicit: true, mode: 'dry', now: DAY0 + i, scope: { skus: [20], masters: [120] } }))
    if (r.result.phase === 'done') break
  }
  const touched = d1.sql(`SELECT DISTINCT entity, entity_id FROM curator_action WHERE kind<>'error'`).map((r) => `${r.entity}:${r.entity_id}`).sort()
  assert.deepEqual(touched, ['master:120', 'sku:20'])
  assert.equal(d1.one(`SELECT id FROM curator_run`).id, '2026-10-01~1')
  const state = JSON.parse(d1.one(`SELECT v FROM setting WHERE k='curator_state'`).v)
  assert.equal(state.active, false)
  assert.equal(state.day, undefined, 'the daily run is still due')
  const odd = Math.floor(DAY0 / 9e5) % 2 === 1 ? DAY0 : DAY0 + 9e5
  const r = await withErrors(() => curatorSlice(env, 'cron', { scanDone: true, now: odd }))
  assert.equal(r.result.run, '2026-10-01')
})

// ============================================================ triage merge
test('mergeGuess keeps a house brand and heuristics where the AI has nothing checked', () => {
  const old = { brand: 'Aeromodellingtutor', name: 'Ultra Z Astro 810mm EPO RC Jet', spanMM: 810, config: 'pnp', kind: null, via: 'title', at: 5 }
  const c = checkListing(lOut({ model: 'Ultra Z Astro 810mm', config: 'unstated' }), { title: 'Ultra Z Astro 810mm EPO RC Jet – Kit / Pusher PNP', text: '', configs: ['kit', 'pnp'] })
  const g = mergeGuess(old, c, { title: 'Ultra Z Astro 810mm EPO RC Jet', text: '', sourceId: 'aeromodellingtutor', model: GEMMA, v: 'listing-v1' })
  assert.equal(g.brand, 'Aeromodellingtutor', "the shop's own planes keep its brand")
  assert.equal(g.name, 'Ultra Z Astro 810mm')
  assert.equal(g.config, 'pnp', 'unstated keeps the heuristic config')
  assert.equal(g.spanMM, 810)
  assert.equal(g.via, 'title+ai')
})

// ============================================================ admin endpoints
async function adminPost(env, ep, body) {
  const { handleCatalog } = await import('../lib/worker.mjs')
  const url = new URL(`https://www.narenana.com/api/${ep}`)
  const r = await handleCatalog(new Request(url, { method: 'POST', headers: { authorization: 'Basic ' + btoa('admin:pw'), 'content-type': 'application/json' }, body: JSON.stringify(body) }), url, env, { waitUntil() {} })
  return { status: r.status, body: await r.json() }
}

test('admin master edits lock each changed field as the owner\'s; role tags become the owner\'s', async () => {
  const d1 = catalog()
  const env = { ADMIN_PASS: 'pw', CATALOG_DB: d1 }
  let r = await adminPost(env, 'master', { id: 344, name: 'Chupito Classic', specs: JSON.stringify({ spanMM: 800, auwG: '', material: '' }) })
  assert.equal(r.status, 200)
  assert.deepEqual(d1.sql(`SELECT field, src FROM field_src WHERE entity_id=344 ORDER BY field`).map((x) => `${x.field}:${x.src}`), ['name:owner', 'specs.spanMM:owner'])
  r = await adminPost(env, 'master', { id: 344, role_tags: ['FPV / Flying Wing'] })
  assert.equal(r.status, 200)
  assert.equal(master(d1, 344).role_source, 'human')
  assert.equal((await adminPost(env, 'master', { id: 344, role_tags: ['Racer'] })).status, 400)
  // settings: curator keys are validated
  assert.equal((await adminPost(env, 'system', { k: 'curator_mode', v: 'wild' })).status, 400)
  assert.equal((await adminPost(env, 'system', { k: 'curator_mode', v: 'live' })).status, 200)
  assert.equal((await adminPost(env, 'system', { k: 'curator_neuron_cap', v: '200000' })).status, 400)
  assert.equal((await adminPost(env, 'system', { k: 'curator_scale', v: '0.5' })).status, 200)
  assert.equal((await adminPost(env, 'system', { k: 'curator_models', v: '{"primary":"@cf/moonshotai/kimi-k2.6"}' })).status, 400)
  assert.equal((await adminPost(env, 'system', { k: 'classify_paused', v: '1' })).status, 200)
})

test('Run now and the report go through the admin API', async () => {
  const d1 = catalog()
  const env = { ADMIN_PASS: 'pw', CATALOG_DB: d1, AI: curatorAi() }
  const { result: r } = await withErrors(() => adminPost(env, 'curator-run', { mode: 'dry' }))
  assert.equal(r.status, 200)
  assert.equal(r.body.job, 'curator')
  assert.equal(d1.one(`SELECT v FROM setting WHERE k='lease:jobs'`).v, '0', 'the lease is released')
  const rep = await curatorReport(env)
  assert.equal(rep.run.id, r.body.run)
  assert.equal(rep.run.mode, 'dry')
  assert.equal((await adminPost(env, 'curator-run', { mode: 'wild' })).status, 400)
})

// ============================================================ migration backfill
test('migration 0019 locks what the owner edited and marks what the owner approved', () => {
  const d1 = makeD1({ upTo: '0018_slug_alias.sql' })
  seedBasics(d1)
  addMaster(d1, { id: 1, brand: 'HEEWING', name: 'Hunter J20', slug: 'heewing-hunter-j20' })
  addMaster(d1, { id: 2, brand: 'FMS', name: 'Ranger', slug: 'fms-ranger' })
  addMaster(d1, { id: 3, brand: 'X', name: 'Y', slug: 'x-y-new' })
  d1.run(`INSERT INTO slug_alias (category_id, old_slug, master_model_id, created_at) VALUES ('wings','x-y-old',3,1)`)
  const aud = (actor, action, entity, id, detail) => d1.run(`INSERT INTO audit (at, actor, action, entity, entity_id, detail) VALUES (1,?,?,?,?,?)`, actor, action, entity, String(id), detail)
  aud('owner (seo-2026-09 names)', 'master-update', 'master_model', 1, '{"brand":"HEEWING","name":"Hunter J20","from":{"brand":"HEEWING","name":"hunter j20 pnp kit"}}')
  aud('admin', 'master-update', 'master_model', 2, '{"id":2,"specs":"{\\"spanMM\\":730}","status":"ready"}')
  aud('admin', 'master-update', 'master_model', 2, '{"id":2,"status":"ready"}')
  aud('admin', 'master-update', 'master_model', 3, '{"id":3,"specs":"{\\"spanMM\\":\\"\\",\\"auwG\\":\\"500\\"}"}')
  aud('assistant-batch', 'approve-new-master', 'sku', 99, '{"slug":"fms-ranger"}')
  aud('admin', 'approve-new-master', 'sku', 98, '{"slug":"x-y-old"}')
  aud('admin', 'approve-new-master', 'sku', 97, '{"slug":"trunc')
  d1.db.exec(readFileSync(fileURLToPath(new URL('../migrations/0019_curator.sql', import.meta.url)), 'utf8'))
  const got = d1.sql(`SELECT entity_id, field, src FROM field_src ORDER BY entity_id, field`).map((r) => `${r.entity_id}.${r.field}:${r.src}`)
  assert.deepEqual(got, [
    '1.brand:owner', '1.name:owner',
    '2.brand:owner-approved', '2.name:owner-approved', '2.slug:owner-approved', '2.specs.spanMM:owner',
    '3.brand:owner-approved', '3.name:owner-approved', '3.slug:owner-approved', '3.specs.spanMM:owner-approved',
  ])
  assert.equal(d1.sql(`SELECT * FROM curator_directive`).length, 4)
  assert.equal(d1.one(`SELECT v FROM setting WHERE k='curator_mode'`).v, 'dry')
})

test('brand spellings: the owner\'s spelling wins, else the majority', () => {
  const ms = [{ id: 1, brand: 'Mapbird' }, { id: 2, brand: 'MapBird' }, { id: 3, brand: 'MapBird' }, { id: 4, brand: 'Havoc' }, { id: 5, brand: 'Havoc Hobby' }, { id: 6, brand: 'FMS' }]
  assert.deepEqual(brandSpellings(ms, new Map()), { mapbird: 'MapBird', havoc: 'Havoc' })
  assert.deepEqual(brandSpellings(ms, new Map([[5, new Map([['brand', 'owner']])]])), { mapbird: 'MapBird', havoc: 'Havoc Hobby' })
})
