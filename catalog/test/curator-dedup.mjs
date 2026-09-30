// AI curator part 2 tests: directives, embeddings and candidates, the pair
// judge and the auto-merge gates (G1–G9), reversible merges, triage
// decisions, dry run + apply, and the admin endpoints. Real SQLite with every
// migration (d1-sqlite.mjs), and a test double for env.AI (ai-double.mjs).
//   npm run curator:test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeD1, seedBasics, addSku, addMaster, addOffer } from './d1-sqlite.mjs'
import { aiDouble, openai, legacy, userOf, probeReply } from './ai-double.mjs'
import { DEFAULT_MODELS } from '../lib/ai.mjs'
import { curatorSlice, curatorReport } from '../lib/curator/index.mjs'
import { mergeMasters, unmergeMasters, pickSurvivor, slugOk, slugMatches } from '../lib/curator/merge.mjs'
import { gates, nameParts, eff, rulesObvious } from '../lib/curator/dedup.mjs'
import { revertCuratorAction } from '../lib/curator/apply.mjs'
import { ruleAgrees } from '../lib/curator/triage.mjs'
import { quantize, decode, cosine } from '../lib/vectors.mjs'
import { checkName, checkBrand } from '../lib/curator/validate.mjs'
import { dedupSlice } from '../lib/jobs.mjs'

const GEMMA = DEFAULT_MODELS.primary
const GLM = DEFAULT_MODELS.fallback
const LLAMA = DEFAULT_MODELS.second
const BGE = DEFAULT_MODELS.embed
const DAY0 = Date.UTC(2026, 9, 1, 1, 0, 0) // 2026-10-01 01:00 UTC
const T = 1790000000000

async function quiet(fn) {
  const saved = console.error
  const lines = []
  console.error = (...a) => lines.push(a.join(' '))
  try { return { result: await fn(), lines } } finally { console.error = saved }
}

// --------------------------------------------------------------- AI double
const ROLES0 = { fpv_intent: false, beginner_trainer: false, glider: false, scale_replica: false, jet: false, warbird: false, aerobatic: false, airliner: false, sport: false, tags: [] }
const lowMaster = { brand: '', brand_quote: '', model: '', span_mm: null, span_quote: '', power: 'electric', fixed_wing: true, ...ROLES0, confidence_brand: 0.2, confidence_model: 0.2, confidence_span: 0.2, confidence_roles: 0.2 }
const lOut = (o = {}) => ({ kind: 'airframe', brand: '', brand_quote: '', model: '', config: 'unstated', span_mm: null, span_quote: '', power: 'electric', pack_qty: 1, evidence: [], confidence: 0.95, ...o })
export const same = (confidence = 0.96, o = {}) => ({ verdict: 'same', confidence, same_manufacturer: 'yes', same_size: 'yes', config_or_colour_only: true, differences: [], evidence: [], name: '', ...o })
export const different = (confidence = 0.95, differences = ['different model']) => ({ verdict: 'different', confidence, same_manufacturer: 'unknown', same_size: 'unknown', config_or_colour_only: false, differences, evidence: [], name: '' })
export const unsure = (confidence = 0.6) => ({ verdict: 'unsure', confidence, same_manufacturer: 'unknown', same_size: 'unknown', config_or_colour_only: false, differences: [], evidence: [], name: '' })

// A bag-of-words embedding: pages that share their model words point the same way.
const STOP = new Set(['set', 'kit', 'pnp', 'rtf', 'arf', 'combo', 'crash', 'a', 'lot', 'span', 'mm', 'rc', 'with', 'the', 'plane', 'airplane', 'unbranded'])
function bagEmbed(body) {
  const data = body.text.map((t) => {
    const v = Array.from({ length: 24 }, () => 0)
    const words = String(t).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w) && !/^\d/.test(w))
    for (const w of words) { let h = 7; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0; v[h % 24] += 1 }
    if (!words.length) v[23] = 1
    return v
  })
  return { shape: [data.length, 24], data, meta: { neurons: 0.01 } }
}

// pair(input, who) → the verdict object; who = 'primary' | 'second'
function brain({ pair = () => unsure(), listing = {}, master = {} } = {}) {
  const calls = { pair: [], second: [], listing: [], master: [] }
  const primary = (body) => {
    const p = probeReply(body)
    if (p) return p
    const u = userOf({ body })
    if (u.startsWith('Title: ')) {
      const title = u.slice(7).split('\n')[0]
      calls.listing.push(title)
      return openai(listing[title] ?? lOut({ kind: 'other', confidence: 0.5 }))
    }
    const input = JSON.parse(u.slice(0, u.lastIndexOf('}') + 1)) // pair-v2 closes with a rule line
    if (input.A && input.B) { calls.pair.push(`${input.A.name}~${input.B.name}`); return openai(pair(input, 'primary')) }
    calls.master.push(input.name)
    return openai(master[input.name] ?? lowMaster)
  }
  const second = (body) => {
    const p = probeReply(body, 'legacy')
    if (p) return p
    const u = userOf({ body })
    const input = JSON.parse(u.slice(0, u.lastIndexOf('}') + 1))
    calls.second.push(`${input.A.name}~${input.B.name}`)
    return legacy(pair(input, 'second'))
  }
  const ai = aiDouble({ [GEMMA]: primary, [GLM]: primary, [LLAMA]: second, [BGE]: bagEmbed })
  ai.seen = calls
  return ai
}
const namesOf = (i) => [i.A.name, i.B.name].map((x) => x.toLowerCase())
const bothMatch = (re) => (i) => namesOf(i).every((n) => re.test(n))

// ---------------------------------------------------------------- fixtures
function world({ directives = false } = {}) {
  const d1 = makeD1()
  seedBasics(d1)
  d1.run(`INSERT INTO source (id, name, home_url, platform, created_at, updated_at) VALUES ('shopc','Shop C','https://c.example','shopify',?,?)`, T, T)
  d1.run(`INSERT INTO source_url (id, source_id, url_canonical, url_raw, created_at) VALUES (3,'shopc','https://c.example/c','https://c.example/c',?)`, T)
  d1.run(`INSERT INTO source_url_category (source_url_id, category_id) VALUES (3,'wings')`)
  if (!directives) d1.run(`DELETE FROM curator_directive`)
  return d1
}
let skuN = 5000
const offer = (d1, masterId, title, { source = 'shopa', config = 'kit', inStock = 1 } = {}) => {
  const id = ++skuN
  addSku(d1, { id, source, title, inStock })
  addOffer(d1, id, masterId, config)
  return id
}
function chupito(d1) {
  addMaster(d1, { id: 43, brand: 'TBS', name: 'Chupito', slug: 'tbs-chupito', specs: { spanMM: 800 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 43, 'TBS Chupito FPV Wing 800mm', { source: 'shopa', config: 'pnp' })
  offer(d1, 43, 'TBS Chupito', { source: 'shopb' })
  offer(d1, 43, 'Team BlackSheep TBS Chupito 800mm', { source: 'shopa', inStock: 0 })
  addMaster(d1, { id: 344, brand: 'TBS', name: 'Chupito Set', slug: 'tbs-chupito-set', specs: { spanMM: '', auwG: '' }, roleTags: ['Sport / Park Flyer', 'FPV / Flying Wing'], roleSource: 'rules' })
  offer(d1, 344, 'TBS Chupito Set', { source: 'shopc', config: 'combo' })
  addMaster(d1, { id: 518, brand: 'TBS', name: 'Chupito Crash A Lot Set', slug: 'tbs-chupito-crash-a-lot-set', specs: { spanMM: 800 } })
  offer(d1, 518, 'TBS Chupito Crash A Lot Set 800mm', { source: 'shopc', config: 'combo' })
}
const chupitoBrain = (o = {}) => brain({ pair: (i) => (bothMatch(/chupito/)(i) ? same(0.97) : different()), ...o })

async function runToEnd(env, { mode = 'live', now = DAY0, force = false, max = 90 } = {}) {
  const ticks = []
  for (let i = 0; i < max; i++) {
    const before = { stmts: env.CATALOG_DB.statements, ai: env.AI?.calls?.length ?? 0, undo: env.CATALOG_DB.one(`SELECT COUNT(*) n FROM merge_undo`).n }
    const r = await curatorSlice(env, 'manual', { explicit: true, mode, now: now + i * 60e3, force: force && i === 0 })
    ticks.push({ ...r, d1: env.CATALOG_DB.statements - before.stmts, aiCalls: (env.AI?.calls?.length ?? 0) - before.ai, merges: env.CATALOG_DB.one(`SELECT COUNT(*) n FROM merge_undo`).n - before.undo })
    if (!r || r.phase === 'done' || r.report || r.skipped) break
  }
  return ticks
}
const m = (d1, id) => d1.one(`SELECT * FROM master_model WHERE id=?`, id)
const aliases = (d1) => Object.fromEntries(d1.sql(`SELECT old_slug, master_model_id FROM slug_alias`).map((r) => [r.old_slug, r.master_model_id]))
const catalogHash = (d1) => JSON.stringify(['master_model', 'sku', 'offer', 'merge_candidate', 'slug_alias', 'observation', 'master_video', 'field_src'].map((t) => d1.sql(`SELECT * FROM ${t} ORDER BY rowid`)))
const budgets = (ticks) => {
  for (const t of ticks) {
    assert.ok(t.d1 <= 34, `a tick used ${t.d1} D1 statements (phase ${t.phase})`)
    assert.ok(t.aiCalls <= 6, `a tick made ${t.aiCalls} AI calls`)
    assert.ok(t.merges <= 1, `a tick made ${t.merges} merges`)
  }
}

// ============================================================ pure helpers
test('vectors: int8 quantisation keeps the cosine; base64 round-trips', () => {
  const a = [0.1, -0.4, 0.8, 0.2, 0, -0.1]
  const b = [0.12, -0.38, 0.79, 0.25, 0.01, -0.12]
  const qa = quantize(a)
  const qb = quantize(b)
  const cos = cosine({ q: decode(qa.vec), scale: qa.scale }, { q: decode(qb.vec), scale: qb.scale })
  const dot = a.reduce((s, x, i) => s + x * b[i], 0) / Math.hypot(...a) / Math.hypot(...b)
  assert.ok(Math.abs(cos - dot) < 0.01, `${cos} ≈ ${dot}`)
  assert.equal(decode(qa.vec).length, 6)
  assert.ok(cosine({ q: decode(qa.vec), scale: qa.scale }, { q: decode(qa.vec), scale: qa.scale }) > 0.99)
})

test('name core (G4): config, colour and brand words go; versions and one-sided numbers stay', () => {
  assert.deepEqual([...nameParts('Chupito Crash A Lot Set', 'TBS').core], ['chupito'])
  assert.deepEqual([...nameParts('TBS Chupito Kit Only', 'TBS').core], ['chupito'])
  assert.deepEqual([...nameParts('Ranger 600 White Camo Scheme', 'Volantex').core], ['ranger'])
  assert.deepEqual([...nameParts('Sky Surfer X8', 'X-UAV').core].sort(), ['sky', 'surfer', 'x8'])
  const P = (id, name, span = null, o = {}) => eff({ id, category_id: 'wings', status: 'ready', brand: 'X-UAV', name, specs: span ? JSON.stringify({ spanMM: span }) : '{}', power: 'electric', titles: '', ...o })
  assert.match(gates(P(1, 'Sky Surfer X8', 1400), P(2, 'Sky Surfer V3', 1400)).join(), /G4 names differ/)
  assert.deepEqual(gates(P(1, 'Ranger 600', 600, { brand: 'Volantex' }), P(2, 'Ranger', 600, { brand: 'Volantex' })), [], 'a size the wingspan accounts for is not a new model')
  assert.match(gates(P(1, 'Ranger 2000 (757-8)', 2000), P(2, 'Ranger 2000', 2000)).join(), /G4 757, 8 on one side only/)
  assert.match(gates(P(1, 'Ranger', 1220), P(2, 'Ranger', 1263)).join(), /G3 wingspan 1220 vs 1263/, '3.5% apart')
  assert.deepEqual(gates(P(1, 'Ranger', 1220), P(2, 'Ranger', 1240)), [], 'within 25 mm')
  assert.match(gates(P(1, 'Ranger', 1220, { brand: '' }), P(2, 'Ranger', 1220, { brand: '' })).join(), /G2/, 'both brandless')
  assert.match(gates(P(1, 'Ranger', 1220, { brand: 'Havoc' }), P(2, 'Ranger', 1220, { brand: 'FMS' })).join(), /G2 brand Havoc vs FMS/)
  assert.deepEqual(gates(P(1, 'Ranger', 1220, { brand: 'Havoc' }), P(2, 'Ranger', 1220, { brand: 'Havoc Hobby' })), [], 'brandKey unifies spellings')
  assert.match(gates(P(1, 'Ranger', null), P(2, 'Ranger', null)).join(), /G3 no wingspan/, 'both unknown need a shared size')
  assert.match(gates(P(1, 'Ranger', 1220, { power: 'gas' }), P(2, 'Ranger', 1220)).join(), /G5/)
  assert.match(gates(P(1, 'Ranger', 1220, { role_source: 'reviewed', role_tags: '["Trainer"]' }), P(2, 'Ranger', 1220, { role_source: 'human', role_tags: '["Warbird"]' })).join(), /G6 your role tags differ/)
  assert.match(gates(P(1, 'Ranger', 1220), P(2, 'Ranger', 1220), { rejected: true }).join(), /G1 the owner rejected/)
  assert.match(gates(P(1, 'Ranger', 1220), P(2, 'Ranger', 1220), { directive: true }).join(), /G1 an open directive/)
  assert.equal(rulesObvious(P(1, 'Ranger 1220', null, { brand: 'FMS' }), P(2, 'Ranger 1220mm Premium RC Airplane', null, { brand: 'FMS' })), true)
})

test('G4: agreeing AI model names never excuse a version, mark or size on one side only', () => {
  const P = (id, brand, name, span = null, o = {}) => eff({ id, category_id: 'wings', status: 'ready', brand, name, specs: span ? JSON.stringify({ spanMM: span }) : '{}', power: 'electric', titles: '', ...o })
  const same = (x) => ({ modelA: x, modelB: x })
  // the AI dropped the version word from both checked names
  assert.match(gates(P(1, 'X-UAV', 'Mini Talon'), P(2, 'X-UAV', 'Talon', 1718), same('Talon')).join(), /G4 mini on one side only/)
  assert.match(gates(P(1, 'X-UAV', 'Sky Surfer V3', 1400), P(2, 'X-UAV', 'Sky Surfer X8', 1400), same('Sky Surfer')).join(), /G4 v3, x8 on one side only/)
  assert.match(gates(P(1, 'Volantex', 'Ranger Pro', 1600), P(2, 'Volantex', 'Ranger', 1600), same('Ranger')).join(), /G4 pro on one side only/)
  assert.match(gates(P(1, 'HobbyKing', 'Bixler 2', 1500), P(2, 'HobbyKing', 'Bixler', 1500), same('Bixler')).join(), /G4 2 on one side only/)
  assert.match(gates(P(1, 'X-UAV', 'Sky Surfer V4 1500mm'), P(2, 'X-UAV', 'Sky Surfer 1400mm'), same('Sky Surfer')).join(), /G3/)
  // what the checked names are for: shop words that are not a version
  assert.deepEqual(gates(P(1, 'Freewing', 'J11 Stunt Jet', 700), P(2, 'Freewing', 'J11 Fighter', 700), same('J11')), [])
  assert.deepEqual(gates(P(1, 'Volantex', 'Ranger 600', 600), P(2, 'Volantex', 'Ranger', 600), same('Ranger')), [], 'a size the wingspan accounts for is still fine')
})

test('G6: two names the owner set differently are the owner\'s call; one owner name is not', () => {
  const P = (id, name) => eff({ id, category_id: 'wings', status: 'ready', brand: 'TA Horizons', name, specs: JSON.stringify({ spanMM: 838 }), power: 'electric', titles: '' })
  const owner = new Map([['name', 'owner']])
  const a = P(460, 'Laser Z2300 33in (RT scheme)')
  const b = P(461, 'Laser Z2300 33in (SH scheme)')
  assert.match(gates(a, b, { locksA: owner, locksB: owner }).join(), /G6 you named them differently/)
  assert.deepEqual(gates(a, b, { locksA: owner, locksB: new Map() }), [], 'only one side is the owner\'s name: the livery rule applies')
  assert.deepEqual(gates(a, P(462, 'Laser Z2300 33in (RT scheme)'), { locksA: owner, locksB: owner }), [], 'the same owner name on both')
})

test('names: a size alone or an HTML character code is never a model name; a brand never carries one', () => {
  assert.equal(checkName('510mm', 'QIDI 510mm Gyro RTF Plane').name, '')
  assert.match(checkName('510mm', 'QIDI 510mm Gyro RTF Plane').why, /only a size/)
  assert.equal(checkName('.46', 'Lazer .46 ARF').name, '')
  assert.equal(checkName('Extra NG 37&quot;', 'Ta Horizons 37&quot; Extra Ng(Red) Kit').name, '')
  assert.match(checkName('Extra NG 37&quot;', 'Ta Horizons 37&quot; Extra Ng(Red) Kit').why, /HTML/)
  assert.equal(checkName('Trainer 60', 'Havoc Trainer 60 Nitro RC Plane').name, 'Trainer 60')
  assert.equal(checkName('Extra NG 37in', 'Ta Horizons 37in Extra NG kit').name, 'Extra NG 37in')
  assert.equal(checkBrand('TA &amp; Co', 'TA &amp; Co', 'TA &amp; Co Stol X'), '')
})

test('survivor: ready, live sellers, the owner\'s work, approved offers, clean name and slug, then the lower id', () => {
  const s = (o) => ({ id: 1, status: 'ready', live_sellers: 0, owner_work: 0, approved_offers: 0, name: 'Chupito', brand: 'TBS', slug: 'tbs-chupito', ...o })
  assert.equal(pickSurvivor([s({ id: 1, status: 'draft', live_sellers: 5 }), s({ id: 2 })]).id, 2, 'ready over draft')
  assert.equal(pickSurvivor([s({ id: 1 }), s({ id: 2, live_sellers: 1 })]).id, 2)
  assert.equal(pickSurvivor([s({ id: 120, name: 'RC MUSTANG P-51D', approved_offers: 3 }), s({ id: 141, name: 'P-51D Mustang 750mm (768-1)', owner_work: 2 })]).id, 141, "the owner's cleaned page survives (the 09-29 #141 case)")
  assert.equal(pickSurvivor([s({ id: 1, name: 'Chupito Set' }), s({ id: 2 })]).id, 2, 'a clean name over a seller-style one')
  assert.equal(pickSurvivor([s({ id: 5 }), s({ id: 3 })]).id, 3)
  assert.equal(slugOk('qidi-560-m7'), true)
  assert.equal(slugOk('qidi-560-m7-rtf-with-gyro-stabilizer-for-beginners-white-60c'), false)
  assert.equal(slugMatches('qidi-560-m7', 'QIDI', '560 M7'), true)
  assert.equal(slugMatches('x-uav-sky-surfer-x8', 'X-UAV', 'Sky Surfer V3'), false)
})

test('triage rule: an exclude keyword, or no aircraft word, agrees that a listing is not a plane', () => {
  const triage = { exclude: ['motor', 'servo', 'battery'], include: ['wing'] }
  assert.match(ruleAgrees('Dualsky XM2830 motor', triage), /exclude/)
  assert.match(ruleAgrees('DJI Avata 2 Fly More Combo RTF', triage), /no aircraft word/)
  assert.equal(ruleAgrees('Beginner RC Airplane Foamie', triage), '')
  assert.equal(ruleAgrees('ZOHD Dart XL Enhanced flying wing', triage), '')
})

// ============================================================ Chupito (6)
test('Chupito: #344 "Chupito Set" and #518 "Chupito Crash A Lot Set" merge into #43, within every tick budget', async () => {
  const d1 = world()
  chupito(d1)
  const env = { CATALOG_DB: d1, AI: chupitoBrain() }
  const { result: ticks } = await quiet(() => runToEnd(env))
  budgets(ticks)
  assert.equal(ticks.at(-1).phase, 'done')
  assert.equal(m(d1, 344), null)
  assert.equal(m(d1, 518), null)
  assert.equal(d1.sql(`SELECT * FROM offer WHERE master_model_id=43`).length, 5, 'every listing now on #43')
  assert.deepEqual(aliases(d1), { 'tbs-chupito-set': 43, 'tbs-chupito-crash-a-lot-set': 43 }, 'the old addresses 301 to #43')
  assert.equal(m(d1, 43).name, 'Chupito')
  assert.deepEqual(JSON.parse(m(d1, 43).role_tags), ['FPV / Flying Wing'], "the reviewed tags stay")
  const merges = d1.sql(`SELECT * FROM curator_action WHERE kind='merge' AND status='applied' ORDER BY other_id`)
  assert.deepEqual(merges.map((a) => [a.entity_id, a.other_id]), [[43, 344], [43, 518]])
  const ev = JSON.parse(merges[0].evidence)
  assert.equal(ev.primary.verdict, 'same')
  assert.equal(ev.second.verdict, 'same')
  assert.deepEqual(ev.gates, [])
  assert.equal(d1.sql(`SELECT * FROM merge_undo`).length, 2, 'each merge can be undone')
  assert.equal(d1.sql(`SELECT * FROM merge_candidate`).length, 0, 'no pair left to review')
  assert.match(ticks.at(-1).summary, /\(live\): 2 merged/)
  assert.ok(env.AI.seen.second.length >= 2, 'the second opinion was asked')
})

test('Chupito dry run: nothing changes, the merges are planned; Apply this plan merges them; a page changed since is skipped as stale', async () => {
  const d1 = world()
  chupito(d1)
  const env = { CATALOG_DB: d1, AI: chupitoBrain() }
  const before = catalogHash(d1)
  await quiet(() => runToEnd(env, { mode: 'dry' }))
  assert.equal(catalogHash(d1), before, 'catalog tables and merge_candidate unchanged')
  const planned = d1.sql(`SELECT entity_id, other_id FROM curator_action WHERE kind='merge' AND status='planned' ORDER BY other_id`)
  assert.deepEqual(planned.map((a) => [a.entity_id, a.other_id]), [[43, 344], [43, 518]])
  // a second dry run the same day asks nothing and adds nothing
  const calls = env.AI.calls.length
  const n = d1.one(`SELECT COUNT(*) n FROM curator_action`).n
  await quiet(() => runToEnd(env, { mode: 'dry', now: DAY0 + 3600e3, force: true }))
  assert.equal(env.AI.calls.length, calls)
  assert.equal(d1.one(`SELECT COUNT(*) n FROM curator_action`).n, n)
  // the owner renames #518 meanwhile: its merge is stale
  d1.run(`UPDATE master_model SET name='Chupito Crash Pack' WHERE id=518`)
  d1.run(`UPDATE setting SET v=json_set(v,'$.apply',json('{"run":"2026-10-01"}')) WHERE k='curator_state'`)
  for (let i = 0; i < 12; i++) {
    const r = await quiet(() => curatorSlice(env, 'manual', { explicit: true, now: DAY0 + 7200e3 + i }))
    if (r.result.done) break
  }
  assert.equal(m(d1, 344), null, 'the planned merge was applied')
  assert.ok(m(d1, 518), 'the stale one was not')
  assert.equal(d1.one(`SELECT status FROM curator_action WHERE kind='merge' AND other_id=518 AND run_id='2026-10-01'`).status, 'skipped')
  assert.equal(aliases(d1)['tbs-chupito-set'], 43)
})

test('a live merge is skipped when a page changed between the judge and the merge phase', async () => {
  const d1 = world()
  chupito(d1)
  const env = { CATALOG_DB: d1, AI: chupitoBrain() }
  const phase = () => d1.one(`SELECT phase FROM curator_run WHERE id='2026-10-01'`)?.phase
  const ticks = []
  await quiet(async () => {
    for (let i = 0; i < 90; i++) {
      const r = await curatorSlice(env, 'manual', { explicit: true, mode: 'live', now: DAY0 + i * 60e3 })
      ticks.push(r)
      if (phase() === 'merge' && !ticks.edited) {
        // judged obvious; now the owner fixes #518's wingspan before any merge lands
        assert.equal(d1.sql(`SELECT * FROM merge_undo`).length, 0, 'no merge yet')
        d1.run(`UPDATE master_model SET specs=json_set(specs,'$.spanMM',810) WHERE id=518`)
        ticks.edited = true
      }
      if (!r || r.phase === 'done') break
    }
  })
  assert.ok(ticks.edited, 'the run reached the merge phase')
  assert.equal(m(d1, 344), null, 'the unchanged pair merged')
  assert.ok(m(d1, 518), 'the changed page was not merged on the old verdict')
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE kind='merge' AND other_id=518`).length, 0)
  assert.ok(JSON.parse(d1.one(`SELECT counts FROM curator_run WHERE id='2026-10-01'`).counts).merge_stale >= 1)
})

test('undo round trip with manufacturer profiles and the slug rule: every table as before', async () => {
  const d1 = world()
  addMaster(d1, { id: 20, brand: 'QIDI', name: '560 M7', slug: 'qidi-560-m7-rtf-with-gyro-stabilizer-for-beginners-white-60c', specs: { spanMM: 560 } })
  addMaster(d1, { id: 21, brand: 'QIDI', name: '560 M7 Gyro', slug: 'qidi-560-m7', specs: { spanMM: 560 } })
  offer(d1, 20, 'QIDI 560 M7 RTF with gyro', { config: 'rtf' })
  offer(d1, 21, 'QIDI-560 M7 560mm', { source: 'shopb', config: 'rtf' })
  d1.run(`INSERT OR IGNORE INTO manufacturer (id, brand) VALUES (9001, 'QIDI test')`)
  d1.run(`INSERT INTO mfr_product (id, manufacturer_id, ext_id, title) VALUES (9091, 9001, 'm7', 'M7'), (9092, 9001, 'm7b', 'M7 B')`)
  d1.run(`INSERT INTO mfr_profile (master_model_id, source_mfr_product_id, overrides_json, created_at, updated_at, updated_by) VALUES
    (20, 9091, '{"wingspan":"560 mm"}', 1, 2, 'admin'), (21, 9091, '{"weight":"80 g","wingspan":null}', 3, 4, 'admin'), (21, 9092, '{"motor":"8520"}', 5, 6, 'admin')`)
  d1.run(`INSERT INTO slug_alias (category_id, old_slug, master_model_id, created_at) VALUES ('wings','qidi-m7-old',21,1)`)
  const TBL = [...TABLES, 'mfr_profile']
  const snap = () => Object.fromEntries(TBL.map((t) => [t, d1.sql(`SELECT * FROM ${t} ORDER BY rowid`).map((r) => JSON.stringify(r)).sort()]))
  const before = snap()
  const env = { CATALOG_DB: d1 }
  const r = await mergeMasters(env, 20, 21, 'curator', 'test')
  assert.equal(m(d1, 20).slug, 'qidi-560-m7', 'the survivor takes the clean address')
  assert.equal(aliases(d1)['qidi-560-m7-rtf-with-gyro-stabilizer-for-beginners-white-60c'], 20)
  assert.equal(aliases(d1)['qidi-m7-old'], 20)
  assert.deepEqual(JSON.parse(d1.one(`SELECT overrides_json FROM mfr_profile WHERE master_model_id=20 AND source_mfr_product_id=9091`).overrides_json), { wingspan: '560 mm', weight: '80 g' })
  assert.ok(d1.one(`SELECT 1 AS x FROM mfr_profile WHERE master_model_id=20 AND source_mfr_product_id=9092`))
  const u = await unmergeMasters(env, r.undoId, 'admin')
  assert.equal(u.ok, true, u.error)
  const after = snap()
  for (const t of TBL) {
    if (t === 'merge_candidate') continue
    assert.deepEqual(after[t], before[t], `${t} is as before`)
  }
  assert.deepEqual(d1.sql(`SELECT a_id, b_id, status, reason FROM merge_candidate`).map((x) => ({ ...x })), [{ a_id: 20, b_id: 21, status: 'rejected', reason: 'owner: unmerged' }])
})

// ================================================================ gates (6)
test('X8 vs V3 without a directive: the AI may say same, the name gate escalates it with the verdict', async () => {
  const d1 = world()
  addMaster(d1, { id: 66, brand: 'X-UAV', name: 'Sky Surfer X8', slug: 'x-uav-sky-surfer-x8', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 66, 'X-UAV SKY-SURFER X8 KIT (EPO FOAM)')
  addMaster(d1, { id: 67, brand: 'X-UAV', name: 'Sky Surfer V3', slug: 'x-uav-sky-surfer-v3', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 67, 'Sky Surfer V3 1400mm PNP', { source: 'shopb' })
  const env = { CATALOG_DB: d1, AI: brain({ pair: () => same(0.95) }) }
  await quiet(() => runToEnd(env))
  assert.ok(m(d1, 66) && m(d1, 67), 'nothing merged')
  const mc = d1.one(`SELECT * FROM merge_candidate WHERE a_id=66 AND b_id=67`)
  assert.equal(mc.status, 'pending')
  const v = JSON.parse(mc.ai_verdict)
  assert.equal(v.primary.verdict, 'same')
  assert.match(v.gates.join(), /G4 names differ/)
  assert.equal(v.second, null, 'no second opinion when a gate fails')
  assert.equal(mc.keep_id, 66, 'keep_id by the shared survivor rule (tie → lower id)')
  const esc = d1.one(`SELECT * FROM curator_action WHERE kind='escalate' AND entity_id=66 AND other_id=67`)
  assert.equal(JSON.parse(esc.evidence).issue, 'merge-review')
  assert.equal(env.AI.seen.second.length, 0)
})

test('STOL X 40" vs 37": a pair the owner rejected is never proposed or judged', async () => {
  const d1 = world()
  addMaster(d1, { id: 424, brand: 'Dynam', name: 'STOL X', slug: 'ta-stol-x-40', specs: { spanMM: 1016 } })
  offer(d1, 424, 'Ta Horizon 40" Stol X')
  addMaster(d1, { id: 455, brand: 'Dynam', name: 'STOL X V2', slug: 'dynam-stol-x-v2', specs: { spanMM: 940 } })
  offer(d1, 455, 'Dynam STOL X V2 940mm PNP')
  d1.run(`INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at) VALUES (424, 455, 0, 'owner: not duplicates', 'rejected', 1, 1)`)
  const env = { CATALOG_DB: d1, AI: brain({ pair: () => same(0.99) }) }
  await quiet(() => runToEnd(env))
  assert.equal(env.AI.seen.pair.length, 0, 'never judged')
  assert.equal(d1.one(`SELECT status FROM merge_candidate WHERE a_id=424`).status, 'rejected')
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE entity_id=424 AND other_id=455`).length, 0)
})

test('span 3.5% apart, both brandless, primary 0.89, second opinion unsure: each is escalated, never merged', async () => {
  const d1 = world()
  // span 1220 vs 1263 (3.5%)
  addMaster(d1, { id: 800, brand: 'FMS', name: 'Ranger', slug: 'fms-ranger', specs: { spanMM: 1220 } })
  offer(d1, 800, 'FMS Ranger 1220mm')
  addMaster(d1, { id: 801, brand: 'FMS', name: 'Ranger Trainer', slug: 'fms-ranger-trainer', specs: { spanMM: 1263 } })
  offer(d1, 801, 'FMS Ranger Trainer', { source: 'shopb' })
  // both brandless
  addMaster(d1, { id: 377, brand: '', name: 'J11-Pro', slug: 'j11-pro', specs: { spanMM: 700 } })
  offer(d1, 377, 'J11-Pro fighter jet 700mm')
  addMaster(d1, { id: 378, brand: 'Unbranded', name: 'J11 Pro', slug: 'unbranded-j11-pro', specs: { spanMM: 700 } })
  offer(d1, 378, 'J11 Pro 700mm jet', { source: 'shopb' })
  // primary 0.89
  addMaster(d1, { id: 900, brand: 'Volantex', name: 'Phoenix 2000', slug: 'volantex-phoenix-2000', specs: { spanMM: 2000 } })
  offer(d1, 900, 'Volantex Phoenix 2000 V2 glider')
  addMaster(d1, { id: 901, brand: 'Volantex', name: 'Phoenix 2000 Kit', slug: 'volantex-phoenix-2000-kit', specs: { spanMM: 2000 } })
  offer(d1, 901, 'Volantex Phoenix 2000mm kit', { source: 'shopb' })
  // second opinion unsure
  addMaster(d1, { id: 910, brand: 'ZOHD', name: 'Dart XL', slug: 'zohd-dart-xl', specs: { spanMM: 1000 } })
  offer(d1, 910, 'ZOHD Dart XL 1000mm PNP')
  addMaster(d1, { id: 911, brand: 'ZOHD', name: 'Dart XL Kit', slug: 'zohd-dart-xl-kit', specs: { spanMM: 1000 } })
  offer(d1, 911, 'ZOHD Dart XL kit', { source: 'shopb' })
  d1.run(`INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at) VALUES (800,801,0.8,'x','pending',1), (377,378,0.8,'x','pending',1)`)
  const pair = (i, who) => {
    const [a, b] = namesOf(i)
    if (a.includes('phoenix')) return same(0.89)
    if (a.includes('dart')) return who === 'second' ? unsure(0.6) : same(0.97)
    return same(0.97)
  }
  const env = { CATALOG_DB: d1, AI: brain({ pair }) }
  await quiet(() => runToEnd(env))
  for (const id of [800, 801, 377, 378, 900, 901, 910, 911]) assert.ok(m(d1, id), `#${id} still there`)
  const v = (a, b) => JSON.parse(d1.one(`SELECT ai_verdict FROM merge_candidate WHERE a_id=? AND b_id=?`, a, b).ai_verdict)
  assert.match(v(800, 801).gates.join(), /G3 wingspan 1220 vs 1263/)
  assert.match(v(377, 378).gates.join(), /G2/)
  assert.equal(v(900, 901).primary.confidence, 0.89)
  assert.equal(v(900, 901).second, null, 'below 0.90: no second opinion')
  assert.equal(v(910, 911).second.verdict, 'unsure')
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE kind='merge'`).length, 0)
  assert.equal(d1.sql(`SELECT * FROM merge_candidate WHERE status='pending' AND ai_verdict IS NOT NULL`).length, 4)
})

test('a chain A~B, B~C with A≁C merges B into A and never pulls in C', async () => {
  const d1 = world()
  addMaster(d1, { id: 1, brand: 'MFE', name: 'Striver', slug: 'mfe-striver', specs: { spanMM: 1600 } })
  offer(d1, 1, 'MFE Striver 1600mm PNP', { source: 'shopa' })
  offer(d1, 1, 'MakeFlyEasy Striver 1600mm', { source: 'shopb' })
  addMaster(d1, { id: 2, brand: 'MFE', name: 'Striver Kit', slug: 'mfe-striver-kit', specs: {} })
  offer(d1, 2, 'MFE Striver kit', { source: 'shopc' })
  addMaster(d1, { id: 3, brand: 'MFE', name: 'Striver PNP', slug: 'mfe-striver-pnp', specs: { spanMM: 1620 } })
  offer(d1, 3, 'MFE Striver PNP 1620mm', { source: 'shopc' })
  const pair = (i) => {
    const [a, b] = namesOf(i)
    return (a === 'striver' && b === 'striver pnp') ? unsure(0.6) : same(0.96)
  }
  const env = { CATALOG_DB: d1, AI: brain({ pair }) }
  await quiet(() => runToEnd(env))
  assert.equal(m(d1, 2), null, 'B merged into A')
  assert.ok(m(d1, 1))
  assert.ok(m(d1, 3), 'C stays: A and C were never judged the same')
  assert.equal(d1.one(`SELECT status FROM merge_candidate WHERE a_id=1 AND b_id=3`).status, 'pending')
})

test('the daily merge cap: the rest wait for tomorrow, and merge then from the cache', async () => {
  const d1 = world()
  chupito(d1)
  d1.run(`UPDATE setting SET v='1' WHERE k='curator_automerge_max'`)
  const env = { CATALOG_DB: d1, AI: chupitoBrain() }
  await quiet(() => runToEnd(env))
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE kind='merge' AND status='applied'`).length, 1)
  assert.equal([m(d1, 344), m(d1, 518)].filter(Boolean).length, 1, 'one waits')
  const calls = env.AI.seen.second.length
  await quiet(() => runToEnd(env, { now: DAY0 + 86400e3 }))
  assert.equal(m(d1, 344), null)
  assert.equal(m(d1, 518), null)
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE kind='merge' AND status='applied'`).length, 2)
  assert.ok(env.AI.seen.second.length >= calls)
})

test('AI off: only the rules-only obvious test (plus G1–G6) merges, and env.AI is never called', async () => {
  const d1 = world()
  addMaster(d1, { id: 29, brand: 'FMS', name: 'Ranger 1220', slug: 'fms-ranger-1220' })
  offer(d1, 29, 'FMS Ranger 1220 PNP', { source: 'shopa' })
  offer(d1, 29, 'FMS Ranger 1220mm', { source: 'shopb' })
  addMaster(d1, { id: 144, brand: 'FMS', name: 'Ranger 1220mm Premium RC Airplane', slug: 'fms-ranger-1220mm-premium-rc-airplane', status: 'draft' })
  offer(d1, 144, 'FMS Ranger 1220mm Premium RC Airplane', { source: 'shopc' })
  chupito(d1)
  d1.run(`UPDATE setting SET v='0' WHERE k='curator_ai'`)
  const env = { CATALOG_DB: d1, AI: chupitoBrain() }
  await quiet(() => runToEnd(env))
  assert.equal(env.AI.calls.length, 0)
  assert.equal(m(d1, 144), null, 'a shared size pins the obvious pair')
  assert.equal(aliases(d1)['fms-ranger-1220mm-premium-rc-airplane'], 29)
  assert.ok(m(d1, 344) && m(d1, 518), 'the Chupitos need the AI: no wingspan or size pins "Chupito Set"')
})

// ============================================================ undo (7)
function undoWorld() {
  const d1 = world()
  addMaster(d1, { id: 10, brand: 'Volantex', name: 'Ranger 2000', slug: 'volantex-ranger-2000', specs: { spanMM: 2000, auwG: '' }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  addMaster(d1, { id: 11, brand: 'Volantex', name: 'Ranger 2000 PNP', slug: 'volantex-ranger-2000-pnp', specs: { spanMM: '', auwG: 1500 }, roleTags: ['FPV / Flying Wing', 'Trainer'], roleSource: 'reviewed' })
  addMaster(d1, { id: 12, brand: 'Volantex', name: 'Ranger 1600', slug: 'volantex-ranger-1600', specs: { spanMM: 1600 } })
  d1.run(`UPDATE master_model SET blurb='Owner blurb for B', hero_image='https://img/b.jpg', pop_boost=1.5 WHERE id=11`)
  const a1 = offer(d1, 10, 'Volantex Ranger 2000 PNP', { config: 'pnp' })
  const b1 = offer(d1, 11, 'Volantex Ranger 2000 757-8 PNP', { source: 'shopb', config: 'pnp' })
  d1.run(`INSERT INTO offer (sku_id, master_model_id, config, pack_qty, note, created_at) VALUES (?, 11, 'kit', 2, 'shared', 5)`, a1) // a sku on both
  d1.run(`INSERT INTO master_video (master_model_id, video_id, title, channel, views, published_at, rank, pinned, excluded, fetched_at) VALUES
    (10,'v1','Ranger review','ch',100,1,0,0,0,1), (11,'v1','Ranger review','ch',150,1,1,1,0,2), (11,'v2','Ranger crash','ch2',50,1,2,0,1,2)`)
  d1.run(`INSERT INTO mfr_match (master_model_id, mfr_product_id, score, status, updated_at) VALUES (11, 77, 0.9, 'accepted', 3)`)
  d1.run(`INSERT INTO mfr_candidate (master_model_id, mfr_product_id, rank, score, name_score, tier, updated_at) VALUES (11, 77, 1, 0.9, 0.9, 'accept', 3)`)
  d1.run(`INSERT INTO slug_alias (category_id, old_slug, master_model_id, created_at) VALUES ('wings','volantex-ranger-2000-old',11,4)`)
  d1.run(`INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at) VALUES (11, 12, 0, 'owner: not duplicates', 'rejected', 6, 6), (10, 11, 0.9, 'x', 'pending', 7, NULL)`)
  d1.run(`INSERT INTO field_src (entity, entity_id, field, src, at) VALUES ('master', 11, 'blurb', 'owner', 8), ('master', 11, 'specs.auwG', 'owner', 8), ('master', 10, 'name', 'owner-approved', 8)`)
  return { d1, a1, b1 }
}
const TABLES = ['master_model', 'offer', 'master_video', 'mfr_match', 'mfr_candidate', 'slug_alias', 'merge_candidate', 'field_src']
const dump = (d1) => Object.fromEntries(TABLES.map((t) => [t, d1.sql(`SELECT * FROM ${t} ORDER BY rowid`).map((r) => JSON.stringify(r)).sort()]))

test('undo round trip: merge then unmerge restores every table, except the records and the (A, B) rejection', async () => {
  const { d1 } = undoWorld()
  const env = { CATALOG_DB: d1 }
  const before = dump(d1)
  const r = await mergeMasters(env, 10, 11, 'admin', 'test')
  // the merge itself
  assert.equal(m(d1, 11), null)
  const a = m(d1, 10)
  assert.equal(JSON.parse(a.specs).auwG, 1500, "B's value fills A's blank (\"\" is blank)")
  assert.equal(JSON.parse(a.specs).spanMM, 2000)
  assert.equal(a.blurb, 'Owner blurb for B', "B's blurb, A had none")
  assert.equal(a.hero_image, 'https://img/b.jpg')
  assert.equal(a.pop_boost, 1.5)
  assert.deepEqual(JSON.parse(a.role_tags), ['FPV / Flying Wing', 'Trainer'], 'both reviewed: tags united, the survivor\'s primary first')
  assert.equal(d1.one(`SELECT status FROM merge_candidate WHERE a_id=10 AND b_id=12`).status, 'rejected', 'the rejection of (B, C) is inherited by (A, C)')
  assert.equal(d1.one(`SELECT src FROM field_src WHERE entity_id=10 AND field='blurb'`).src, 'owner', "the blurb's provenance moved with it")
  assert.equal(d1.one(`SELECT master_model_id FROM mfr_match`).master_model_id, 10)
  assert.equal(aliases(d1)['volantex-ranger-2000-old'], 10)
  assert.equal(d1.one(`SELECT pinned FROM master_video WHERE master_model_id=10 AND video_id='v1'`).pinned, 1)
  assert.ok(r.undoId)
  // …and back
  const u = await unmergeMasters(env, r.undoId, 'admin')
  assert.equal(u.ok, true, u.error)
  const after = dump(d1)
  for (const t of TABLES) {
    if (t === 'merge_candidate') {
      const extra = after[t].filter((x) => !before[t].includes(x)).map((x) => JSON.parse(x))
      assert.deepEqual(extra.map((x) => [x.a_id, x.b_id, x.status, x.reason]), [[10, 11, 'rejected', 'owner: unmerged']], 'the only new row: (A, B) rejected')
      assert.deepEqual(before[t].filter((x) => !after[t].includes(x)).map((x) => JSON.parse(x)).map((x) => [x.a_id, x.b_id]), [[10, 11]], 'which replaced the pending (A, B) row')
      continue
    }
    assert.deepEqual(after[t], before[t], `${t} is as before`)
  }
  assert.equal(d1.one(`SELECT undone_at FROM merge_undo WHERE id=?`, r.undoId).undone_at > 0, true)
  assert.equal((await unmergeMasters(env, r.undoId, 'admin')).ok, false, 'an undo runs once')
})

test('undo refuses when B\'s address or name is someone else\'s now, and says who', async () => {
  const { d1 } = undoWorld()
  const env = { CATALOG_DB: d1 }
  const r = await mergeMasters(env, 10, 11, 'admin', 'test')
  addMaster(d1, { id: 50, brand: 'X', name: 'Other', slug: 'volantex-ranger-2000-pnp' })
  let u = await unmergeMasters(env, r.undoId, 'admin')
  assert.equal(u.ok, false)
  assert.match(u.error, /#50 "Other" now uses the address volantex-ranger-2000-pnp/)
  d1.run(`UPDATE master_model SET slug='other-50', brand='Volantex', brand_norm='volantex', name='Ranger 2000 PNP', name_norm='ranger 2000 pnp' WHERE id=50`)
  u = await unmergeMasters(env, r.undoId, 'admin')
  assert.match(u.error, /#50 .* same brand and name/)
  assert.equal(m(d1, 11), null, 'nothing changed')
})

test('after an owner edit on the survivor, undo keeps the edit and lists it', async () => {
  const { d1 } = undoWorld()
  const env = { CATALOG_DB: d1 }
  const r = await mergeMasters(env, 10, 11, 'admin', 'test')
  d1.run(`UPDATE master_model SET blurb='Newer owner blurb' WHERE id=10`)
  const u = await unmergeMasters(env, r.undoId, 'admin')
  assert.equal(u.ok, true)
  assert.ok(u.kept.includes('blurb'))
  assert.equal(m(d1, 10).blurb, 'Newer owner blurb')
  assert.ok(m(d1, 11))
})

// ========================================================= rejections (8)
test('rejections: inherited ones stop re-proposals; an unmerged pair is never proposed again; dismissed is not rejected', async () => {
  const d1 = world()
  chupito(d1)
  // the owner rejected (#344, #518): after #344 merges into #43, (#43, #518) is rejected too
  d1.run(`INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at) VALUES (344, 518, 0, 'owner: not duplicates', 'rejected', 1, 1)`)
  const env = { CATALOG_DB: d1, AI: chupitoBrain() }
  const r = await mergeMasters(env, 43, 344, 'admin', 'owner merge')
  assert.equal(d1.one(`SELECT reason FROM merge_candidate WHERE a_id=43 AND b_id=518`).reason, 'inherited from #344')
  await quiet(() => runToEnd(env))
  assert.ok(m(d1, 518), 'never merged')
  assert.ok(!env.AI.seen.pair.some((p) => /crash/i.test(p)), 'never judged')
  // unmerge (43, 344): the pair is rejected for good
  const u = await unmergeMasters(env, r.undoId, 'admin')
  assert.equal(u.ok, true, u.error)
  const pairs = env.AI.seen.pair.length
  await quiet(() => runToEnd(env, { now: DAY0 + 86400e3 }))
  assert.ok(m(d1, 344), 'not merged again')
  assert.equal(d1.one(`SELECT status, reason FROM merge_candidate WHERE a_id=43 AND b_id=344`).reason, 'owner: unmerged')
  assert.ok(!env.AI.seen.pair.slice(pairs).some((p) => /^chupito~chupito set$/i.test(p)), '(A, B) never judged again')
  // dismissed: hidden, but not a rejection — dedup keeps it and a changed pair is judged again
  addMaster(d1, { id: 999, brand: 'TBS', name: 'Chupito Racer', slug: 'tbs-chupito-racer', specs: { spanMM: 800 } })
  offer(d1, 999, 'TBS Chupito Racer 800mm', { source: 'shopb' })
  d1.run(`INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, ai_verdict) VALUES (344, 999, 0.8, 'AI: different', 'dismissed', 1, ?)`, JSON.stringify({ hash: 'old input', complete: true }))
  await quiet(() => dedupSlice({ CATALOG_DB: d1 }, 'manual', true))
  assert.equal(d1.one(`SELECT status FROM merge_candidate WHERE a_id=344 AND b_id=999`).status, 'dismissed', 'dedup leaves a dismissed pair as it is')
  const before = env.AI.seen.pair.length
  await quiet(() => runToEnd(env, { now: DAY0 + 2 * 86400e3 }))
  assert.ok(env.AI.seen.pair.slice(before).some((p) => /racer/i.test(p)), 'its input changed, so it is judged again; a rejection never would be')
})

// =================================================== dedupSlice FK (9)
test('dedupSlice never merges, and a pair naming a page deleted mid-pass does not throw; the other pairs land', async () => {
  const d1 = world()
  addMaster(d1, { id: 17, brand: 'QIDI', name: '560 M7', slug: 'qidi-560-m7' })
  addMaster(d1, { id: 248, brand: 'QIDI', name: '560 M7 RTF', slug: 'qidi-560-m7-rtf' })
  addMaster(d1, { id: 249, brand: 'QIDI', name: '560 M7 Gyro', slug: 'qidi-560-m7-gyro' })
  addMaster(d1, { id: 30, brand: 'Havoc Hobby', name: 'Raptor F22', slug: 'havoc-raptor-f22' })
  addMaster(d1, { id: 31, brand: 'Havoc', name: 'Raptor F22 RTF', slug: 'havoc-raptor-f22-rtf' })
  // a merge from the admin lands between the read and the inserts
  const realPrepare = d1.prepare
  const wrap = (st) => ({ bind: (...a) => wrap(st.bind(...a)), first: (c) => st.first(c), run: () => st.run(), all: async () => { const r = await st.all(); d1.run(`DELETE FROM master_model WHERE id=248`); return r } })
  d1.prepare = (sql) => (/SELECT m\.id, m\.slug, m\.brand, m\.name/.test(sql) ? wrap(realPrepare(sql)) : realPrepare(sql))
  const { result } = await quiet(() => dedupSlice({ CATALOG_DB: d1 }, 'manual', true))
  d1.prepare = realPrepare
  assert.equal(result.merged, 0)
  const pairs = d1.sql(`SELECT a_id, b_id, source FROM merge_candidate ORDER BY a_id, b_id`).map((r) => `${r.a_id}-${r.b_id}`)
  assert.ok(pairs.includes('17-249'), 'the other pairs land')
  assert.ok(pairs.includes('30-31'), 'Havoc and Havoc Hobby compare (brandKey)')
  assert.ok(!pairs.some((p) => p.includes('248')))
  assert.equal(d1.sql(`SELECT * FROM master_model`).length, 4, 'nothing merged')
})

// ======================================================== directives (10)
function skySurfer(d1) {
  addMaster(d1, { id: 66, brand: 'X-UAV', name: 'Sky Surfer X8', slug: 'x-uav-sky-surfer-x8', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 66, 'X-UAV SKY-SURFER X8 KIT (EPO FOAM)')
  addMaster(d1, { id: 67, brand: 'X-UAV', name: 'Sky Surfer V3', slug: 'x-uav-sky-surfer-v3', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 67, 'Sky Surfer V3 1400mm PNP', { source: 'shopb', config: 'pnp' })
  offer(d1, 67, 'X-UAV Original Sky Surfer X8 Sunny-Sky X2212 1400mm', { source: 'shopc' })
  addMaster(d1, { id: 193, brand: 'X-UAV', name: 'Sky Surfer Original 1400mm', slug: 'x-uav-sky-surfer-original-fm', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 193, 'X-UAV Original Sky Surfer - PNP', { config: 'pnp' })
  addMaster(d1, { id: 68, brand: 'MapBird', name: 'SkySurfer', slug: 'mapbird-skysurfer', specs: { spanMM: 1400 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 68, 'mapbird skysurfer 1400mm fpv uav trainer kit', { source: 'shopb' })
  addMaster(d1, { id: 423, brand: 'Mapbird', name: 'Skysurfer 1400mm Trainer', slug: 'mapbird-skysurfer-1400mm-trainer', specs: { spanMM: 1400 }, roleTags: ['Trainer'], roleSource: 'rules' })
  offer(d1, 423, 'MAPBIRD SKYSURFER TRAINER KIT', { source: 'shopc' })
}

test('Sky Surfer directives (seeded by migration 0019): #66 and #193 into #67, #67 renamed and readdressed, #423 into #68', async () => {
  const d1 = world({ directives: true })
  skySurfer(d1)
  const env = { CATALOG_DB: d1, AI: brain() }
  const { result: ticks } = await quiet(() => runToEnd(env))
  budgets(ticks)
  assert.deepEqual(d1.sql(`SELECT status FROM curator_directive ORDER BY id`).map((r) => r.status), ['applied', 'applied', 'applied', 'applied'])
  for (const id of [66, 193, 423]) assert.equal(m(d1, id), null, `#${id} merged`)
  const s67 = m(d1, 67)
  assert.equal(s67.name, 'Sky Surfer X8 1400mm')
  assert.equal(s67.slug, 'x-uav-sky-surfer-x8')
  assert.equal(m(d1, 68).brand, 'MapBird', '#68 keeps its brand')
  const al = aliases(d1)
  assert.equal(al['x-uav-sky-surfer-v3'], 67)
  assert.equal(al['x-uav-sky-surfer-original-fm'], 67)
  assert.equal(al['mapbird-skysurfer-1400mm-trainer'], 68)
  assert.equal(al['x-uav-sky-surfer-x8'], undefined, 'the new, live address is nobody\'s alias')
  assert.equal(d1.sql(`SELECT * FROM offer WHERE master_model_id=67`).length, 4)
  const src = Object.fromEntries(d1.sql(`SELECT field, src FROM field_src WHERE entity_id=67`).map((r) => [r.field, r.src]))
  assert.equal(src.name, 'directive')
  assert.equal(src.slug, 'directive')
  assert.equal(d1.sql(`SELECT * FROM merge_undo`).length, 3, 'each directive merge can be undone')
  // the old addresses 301 to the surviving pages
  const { handleCatalog } = await import('../lib/worker.mjs')
  const get = async (path) => { const url = new URL(`http://localhost${path}`); return handleCatalog(new Request(url), url, { CATALOG_DB: d1 }, { waitUntil() {} }) }
  let res = await get('/wings/x-uav-sky-surfer-v3/')
  assert.equal(res.status, 301)
  assert.equal(res.headers.get('location'), '/wings/x-uav-sky-surfer-x8/')
  res = await get('/wings/mapbird-skysurfer-1400mm-trainer/')
  assert.equal(res.headers.get('location'), '/wings/mapbird-skysurfer/')
  res = await get('/wings/x-uav-sky-surfer-x8/')
  assert.equal(res.status, 200)
})

// Production, 2026-09-30: at Workers Paid scale all four directives ran in one
// tick and the rename failed ("#66 uses the address x-uav-sky-surfer-x8")
// because #66's merge is only written at the end of that tick.
test('at Paid scale all Sky Surfer directives run in one tick: the rename takes the address its earlier merge freed', async () => {
  const d1 = world({ directives: true })
  skySurfer(d1)
  d1.run(`UPDATE setting SET v='10' WHERE k='curator_scale'`)
  const env = { CATALOG_DB: d1, AI: brain() }
  await quiet(() => runToEnd(env))
  assert.deepEqual(d1.sql(`SELECT status FROM curator_directive ORDER BY id`).map((r) => r.status), ['applied', 'applied', 'applied', 'applied'])
  assert.equal(m(d1, 67).slug, 'x-uav-sky-surfer-x8')
  assert.equal(m(d1, 67).name, 'Sky Surfer X8 1400mm')
  const al = aliases(d1)
  assert.equal(al['x-uav-sky-surfer-x8'], undefined, "the live address is no alias")
  assert.equal(al['x-uav-sky-surfer-v3'], 67)
})

test('a decision queued after the directives phase is applied on the next live tick', async () => {
  const d1 = world({ directives: false })
  skySurfer(d1)
  const env = { CATALOG_DB: d1, AI: brain() }
  const tick = (i) => quiet(() => curatorSlice(env, 'manual', { explicit: true, mode: 'live', now: DAY0 + i * 60e3 }))
  await tick(0)
  await tick(1)
  const phase = JSON.parse(d1.one(`SELECT cursor FROM curator_run`).cursor).phase
  assert.ok(!['probe', 'directives'].includes(phase), `the run is past its directives phase (${phase})`)
  d1.run(`INSERT INTO curator_directive (kind, payload, status, approved_by, approved_at, source) VALUES ('rename', ?, 'approved', 'owner', ?, 'test')`,
    JSON.stringify({ id: 68, name: 'SkySurfer 1400mm', expect: { slug: 'mapbird-skysurfer' } }), DAY0)
  await tick(2)
  assert.equal(d1.one(`SELECT status FROM curator_directive WHERE source='test'`).status, 'applied')
  assert.equal(m(d1, 68).name, 'SkySurfer 1400mm')
})

test('a directive whose expectations do not match fails with the reason, and nothing changes', async () => {
  const d1 = world({ directives: true })
  skySurfer(d1)
  d1.run(`UPDATE master_model SET slug='x-uav-sky-surfer-original' WHERE id=193`)
  const env = { CATALOG_DB: d1, AI: brain() }
  await quiet(() => runToEnd(env))
  const d2 = d1.one(`SELECT * FROM curator_directive WHERE id=2`)
  assert.equal(d2.status, 'failed')
  assert.match(JSON.parse(d2.result).error, /expected #193 at x-uav-sky-surfer-original-fm, found x-uav-sky-surfer-original/)
  assert.ok(m(d1, 193), '#193 untouched')
  assert.equal(d1.one(`SELECT status FROM curator_directive WHERE id=1`).status, 'applied', 'the others still apply')
})

test('dry run: directives are planned, not applied; their pages are left out of automatic dedup', async () => {
  const d1 = world({ directives: true })
  skySurfer(d1)
  const env = { CATALOG_DB: d1, AI: brain({ pair: () => same(0.99) }) }
  const before = catalogHash(d1)
  await quiet(() => runToEnd(env, { mode: 'dry' }))
  assert.equal(catalogHash(d1), before)
  assert.deepEqual(d1.sql(`SELECT status FROM curator_directive`).map((r) => r.status), ['approved', 'approved', 'approved', 'approved'])
  assert.equal(d1.sql(`SELECT * FROM curator_action WHERE kind='directive' AND status='planned'`).length, 4, 'the rename is planned too (#66\'s address is free once it merges)')
  assert.equal(env.AI.seen.pair.length, 0, 'pages with an open directive are not judged')
  // Apply this plan: the directives go through the same statements
  d1.run(`UPDATE setting SET v=json_set(v,'$.apply',json('{"run":"2026-10-01"}')) WHERE k='curator_state'`)
  for (let i = 0; i < 12; i++) {
    const r = await quiet(() => curatorSlice(env, 'manual', { explicit: true, now: DAY0 + 7200e3 + i }))
    if (r.result.done) break
  }
  assert.equal(m(d1, 67).slug, 'x-uav-sky-surfer-x8')
  assert.equal(m(d1, 66), null)
  assert.deepEqual(d1.sql(`SELECT status FROM curator_directive ORDER BY id`).map((r) => r.status), ['applied', 'applied', 'applied', 'applied'])
})

// ============================================================ triage (13)
test('triage: an accessory a rule agrees with is rejected; one the title calls a plane is asked; after Restore, never again', async () => {
  const d1 = world()
  chupito(d1)
  addSku(d1, { id: 70, title: 'Emax ES08MA 9g metal servo', desc: 'Metal gear micro servo' })
  addSku(d1, { id: 71, title: 'Beginner RC Airplane Canopy Hatch', desc: 'Canopy hatch for the beginner trainer' })
  const listing = {
    'Emax ES08MA 9g metal servo': lOut({ kind: 'electronics', confidence: 0.96, brand: 'Emax', brand_quote: 'Emax ES08MA' }),
    'Beginner RC Airplane Canopy Hatch': lOut({ kind: 'part', confidence: 0.95 }),
  }
  const env = { CATALOG_DB: d1, AI: chupitoBrain({ listing }) }
  await quiet(() => runToEnd(env))
  assert.deepEqual({ ...d1.one(`SELECT review_status, reject_reason FROM sku WHERE id=70`) }, { review_status: 'rejected', reject_reason: 'accessory' })
  assert.equal(d1.one(`SELECT review_status FROM sku WHERE id=71`).review_status, 'new', '"Airplane" in the title: no rule agrees')
  const ask = d1.one(`SELECT * FROM curator_action WHERE kind='escalate' AND entity='sku' AND entity_id=71`)
  assert.equal(JSON.parse(ask.evidence).issue, 'listing-review')
  // the owner restores #70 (Undo on the curator's reject): locked, never auto-rejected again
  const act = d1.one(`SELECT id FROM curator_action WHERE kind='reject' AND entity_id=70`)
  assert.equal((await revertCuratorAction(env, act.id, 'admin')).ok, true)
  assert.equal(d1.one(`SELECT src FROM field_src WHERE entity='sku' AND entity_id=70 AND field='review'`).src, 'owner')
  await quiet(() => runToEnd(env, { now: DAY0 + 86400e3 }))
  assert.equal(d1.one(`SELECT review_status FROM sku WHERE id=70`).review_status, 'new')
})

test('triage: a new seller\'s listing of an existing plane is attached with its config; an obvious new plane becomes a draft', async () => {
  const d1 = world()
  addMaster(d1, { id: 43, brand: 'TBS', name: 'Chupito', slug: 'tbs-chupito', specs: { spanMM: 800 }, roleTags: ['FPV / Flying Wing'], roleSource: 'reviewed' })
  offer(d1, 43, 'TBS Chupito FPV Wing 800mm', { source: 'shopa', config: 'pnp' })
  addMaster(d1, { id: 44, brand: 'ZOHD', name: 'Dart XL', slug: 'zohd-dart-xl', specs: { spanMM: 1000 } })
  offer(d1, 44, 'ZOHD Dart XL 1000mm', { source: 'shopa' })
  addSku(d1, { id: 80, source: 'shopb', title: 'TBS Chupito PNP 800mm', desc: 'TBS Chupito flying wing, wingspan 800mm, PNP' })
  addSku(d1, { id: 81, source: 'shopb', title: 'ZOHD Nano Talon Evo 860mm FPV', desc: 'ZOHD Nano Talon Evo, wingspan 860mm, AIO' })
  const listing = {
    'TBS Chupito PNP 800mm': lOut({ brand: 'TBS', brand_quote: 'TBS Chupito', model: 'Chupito', config: 'pnp', span_mm: 800, span_quote: 'wingspan 800mm', confidence: 0.97 }),
    'ZOHD Nano Talon Evo 860mm FPV': lOut({ brand: 'ZOHD', brand_quote: 'ZOHD Nano Talon', model: 'Nano Talon Evo', config: 'pnp', span_mm: 860, span_quote: 'wingspan 860mm', confidence: 0.97 }),
  }
  const env = { CATALOG_DB: d1, AI: chupitoBrain({ listing }) }
  const { result: ticks } = await quiet(() => runToEnd(env))
  budgets(ticks)
  assert.deepEqual({ ...d1.one(`SELECT master_model_id, config FROM offer WHERE sku_id=80`) }, { master_model_id: 43, config: 'pnp' })
  assert.equal(d1.one(`SELECT review_status FROM sku WHERE id=80`).review_status, 'approved')
  assert.equal(d1.one(`SELECT status FROM curator_action WHERE kind='attach' AND entity_id=80`).status, 'applied')
  const draft = d1.one(`SELECT * FROM master_model WHERE slug='zohd-nano-talon-evo'`)
  assert.ok(draft, 'a draft page')
  assert.equal(draft.status, 'draft', 'never public: the owner publishes')
  assert.equal(draft.brand, 'ZOHD')
  assert.equal(JSON.parse(draft.specs).spanMM, 860)
  assert.equal(d1.one(`SELECT config FROM offer WHERE sku_id=81`).config, 'pnp')
  assert.equal(d1.one(`SELECT src FROM field_src WHERE entity_id=? AND field='name'`, draft.id).src, 'curator')
  // Undo the attach: un-approved and locked
  const act = d1.one(`SELECT id FROM curator_action WHERE kind='attach' AND entity_id=80`)
  assert.equal((await revertCuratorAction(env, act.id, 'admin')).ok, true)
  assert.equal(d1.one(`SELECT review_status FROM sku WHERE id=80`).review_status, 'new')
  assert.equal(d1.sql(`SELECT * FROM offer WHERE sku_id=80`).length, 0)
  // Undo the draft: the page the curator made goes too
  const dr = d1.one(`SELECT id FROM curator_action WHERE kind='draft' AND entity_id=81`)
  assert.equal((await revertCuratorAction(env, dr.id, 'admin')).ok, true)
  assert.equal(d1.one(`SELECT * FROM master_model WHERE slug='zohd-nano-talon-evo'`), null)
})

// ======================================================== admin endpoints
async function admin(env, ep, body = null) {
  const { handleCatalog } = await import('../lib/worker.mjs')
  const url = new URL(`https://www.narenana.com/api/${ep}`)
  const init = body ? { method: 'POST', headers: { authorization: 'Basic ' + btoa('admin:pw'), 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: { authorization: 'Basic ' + btoa('admin:pw') } }
  const r = await handleCatalog(new Request(url, init), url, env, { waitUntil() {} })
  return { status: r.status, body: await r.json() }
}

test('admin: Duplicates carries the AI verdict and the shared keep; the merge button keeps an undo; directives queue; questions dismiss', async () => {
  const d1 = world()
  addMaster(d1, { id: 66, brand: 'X-UAV', name: 'Sky Surfer X8', slug: 'x-uav-sky-surfer-x8', specs: { spanMM: 1400 } })
  offer(d1, 66, 'X-UAV SKY-SURFER X8 KIT (EPO FOAM)')
  addMaster(d1, { id: 67, brand: 'X-UAV', name: 'Sky Surfer V3', slug: 'x-uav-sky-surfer-v3', specs: { spanMM: 1400 } })
  offer(d1, 67, 'Sky Surfer V3 1400mm PNP', { source: 'shopb' })
  offer(d1, 67, 'Sky Surfer V3 PNP', { source: 'shopc' })
  const env = { ADMIN_PASS: 'pw', CATALOG_DB: d1, AI: brain({ pair: () => same(0.95) }) }
  await quiet(() => runToEnd(env))
  let r = await admin(env, 'duplicates')
  assert.equal(r.status, 200)
  const c = r.body.candidates.find((x) => x.a_id === 66)
  assert.equal(c.ai.primary.verdict, 'same')
  assert.equal(c.keepId, 67, 'more live sellers')
  // the owner merges from Duplicates: the same merge, with an undo
  r = await admin(env, 'merge', { aId: 67, bId: 66 })
  assert.equal(r.status, 200)
  assert.ok(r.body.undoId)
  assert.equal(d1.one(`SELECT status FROM curator_action WHERE kind='escalate' AND entity_id=66`).status, 'skipped', 'the question is closed')
  r = await admin(env, 'duplicates')
  assert.equal(r.body.merges[0].absorbed_id, 66)
  r = await admin(env, 'unmerge', { undoId: r.body.merges[0].id })
  assert.equal(r.status, 200, r.body.error)
  assert.ok(m(d1, 66))
  // directives: queued with the current slugs as expectations
  r = await admin(env, 'directive', { kind: 'rename', id: 67, name: 'Sky Surfer X8 1400mm' })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.payload, { id: 67, name: 'Sky Surfer X8 1400mm', expect: { slug: 'x-uav-sky-surfer-v3' } })
  assert.equal((await admin(env, 'directive', { kind: 'merge', keep: 67, absorb: 67 })).status, 400)
  r = await admin(env, 'directive')
  assert.equal(r.body.directives[0].status, 'approved')
  // the report and the tab label
  const rep = await curatorReport(env)
  assert.ok(rep.run && Array.isArray(rep.needsYou) && Array.isArray(rep.merges) && Array.isArray(rep.directives))
  assert.equal((await admin(env, 'curator?brief=1')).body.needs, rep.needsYou.length)
  // dismiss a question
  addMaster(d1, { id: 70, brand: 'X', name: 'Thing Set', slug: 'x-thing-set' })
  d1.run(`INSERT INTO curator_action (run_id, kind, entity, entity_id, status, created_at) VALUES ('2026-10-01','escalate','master',70,'planned',1)`)
  const q = d1.one(`SELECT id FROM curator_action WHERE entity_id=70`)
  assert.equal((await admin(env, 'curator-dismiss', { actionId: q.id })).status, 200)
  assert.equal(d1.one(`SELECT status FROM curator_action WHERE id=?`, q.id).status, 'skipped')
  // AI says different: hidden under its own filter, never a rejection
  d1.run(`UPDATE merge_candidate SET status='dismissed' WHERE a_id=66`)
  r = await admin(env, 'duplicates?view=dismissed')
  assert.equal(r.body.view, 'dismissed')
  assert.equal(r.body.candidates.length, 1)
})

// ============================================== slug after merge, and more
test('slug after merge: a survivor with a seller-style address takes the absorbed page\'s clean one; undo gives it back', async () => {
  const d1 = world()
  addMaster(d1, { id: 123, brand: 'QIDI', name: '560 M7', slug: 'qidi-560-m7-rtf-with-6-axis-gyro-stabilizer-for-beginners-white' })
  offer(d1, 123, 'QIDI 560 M7 RTF', { source: 'shopa' })
  offer(d1, 123, 'QIDI 560 M7 RTF gyro', { source: 'shopb' })
  addMaster(d1, { id: 17, brand: 'QIDI', name: '560 M7 Gyro', slug: 'qidi-560-m7' })
  offer(d1, 17, 'QIDI 560 M7 gyro RTF', { source: 'shopc', inStock: 0 })
  const env = { CATALOG_DB: d1 }
  const r = await mergeMasters(env, 123, 17, 'admin', 'test')
  assert.equal(r.slug, 'qidi-560-m7')
  assert.equal(m(d1, 123).slug, 'qidi-560-m7')
  assert.deepEqual(aliases(d1), { 'qidi-560-m7-rtf-with-6-axis-gyro-stabilizer-for-beginners-white': 123 }, 'the old long address redirects')
  // a directive states its own slug: the rule is off for directives
  const u = await unmergeMasters(env, r.undoId, 'admin')
  assert.equal(u.ok, true, u.error)
  assert.equal(m(d1, 123).slug, 'qidi-560-m7-rtf-with-6-axis-gyro-stabilizer-for-beginners-white')
  assert.equal(m(d1, 17).slug, 'qidi-560-m7')
  assert.deepEqual(aliases(d1), {})
})

test('admin: Undo on an automatic merge unmerges it; Review shows the curator\'s matches; Catalog shows who set each field', async () => {
  const d1 = world()
  chupito(d1)
  addSku(d1, { id: 90, source: 'shopb', title: 'TBS Chupito combo', desc: 'TBS Chupito, all electronics' })
  const listing = { 'TBS Chupito combo': lOut({ brand: 'TBS', brand_quote: 'TBS Chupito', model: 'Chupito', config: 'combo', confidence: 0.7 }) }
  const env = { ADMIN_PASS: 'pw', CATALOG_DB: d1, AI: chupitoBrain({ listing }) }
  await quiet(() => runToEnd(env))
  const a = d1.one(`SELECT id FROM curator_action WHERE kind='merge' AND other_id=344`)
  const r = await admin(env, 'curator-revert', { actionId: a.id })
  assert.equal(r.status, 200, r.body.error)
  assert.ok(m(d1, 344), '#344 is back')
  assert.equal(d1.one(`SELECT status FROM curator_action WHERE id=?`, a.id).status, 'undone')
  assert.equal(d1.one(`SELECT reason FROM merge_candidate WHERE a_id=43 AND b_id=344`).reason, 'owner: unmerged')
  // Review: the listing the curator was not sure about carries its reading
  const rv = await admin(env, 'review?status=new&stock=all')
  const k = rv.body.skus.find((x) => x.id === 90)
  assert.ok(k.ai, 'the curator\'s note')
  assert.match(k.ai.why, /not sure it is a plane/)
  // Catalog: provenance badges
  d1.run(`INSERT INTO field_src (entity, entity_id, field, src, confidence, at) VALUES ('master', 43, 'name', 'owner', NULL, 1)`)
  const ct = await admin(env, 'catalog?q=Chupito')
  const row = ct.body.masters.find((x) => x.id === 43)
  assert.equal(row.field_src.name.src, 'owner')
})

test('report suggestions: a clean address for a seller-style slug, and the owner\'s name an old automatic merge carried away', async () => {
  const d1 = world()
  addMaster(d1, { id: 120, brand: 'Volantex', name: 'RC MUSTANG P-51D', slug: 'volantex-rc-mustang-p-51d', specs: { spanMM: 750 } })
  offer(d1, 120, 'Volantex RC Mustang P-51D 750mm RTF')
  addMaster(d1, { id: 70, brand: 'X-UAV', name: 'Talon GT', slug: 'x-uav-talon-gt-rebel-pnp-kit-with-motor-esc-and-servos-grey-camo' })
  offer(d1, 70, 'X-UAV Talon GT Rebel', { source: 'shopb' })
  d1.run(`INSERT INTO audit (at, actor, action, entity, entity_id, detail) VALUES
    (1790650000000, 'owner (seo-2026-09 names)', 'master-update', 'master_model', '141', '{"brand":"Volantex","name":"P-51D Mustang 750mm (768-1)"}'),
    (1790660000000, 'auto', 'merge-master', 'master_model', '141', '{"into":120,"reason":"obvious duplicate","slug":"volantex-p-51d-mustang-750mm"}')`)
  const env = { CATALOG_DB: d1, AI: brain() }
  await quiet(() => runToEnd(env, { mode: 'dry' }))
  const slug = d1.one(`SELECT * FROM curator_action WHERE entity_id=70 AND json_extract(evidence,'$.issue')='slug-suggestion'`)
  assert.equal(JSON.parse(slug.after).value, 'x-uav-talon-gt')
  const name = d1.one(`SELECT * FROM curator_action WHERE entity_id=120 AND json_extract(evidence,'$.issue')='name-suggestion' AND json_extract(after,'$.value')='P-51D Mustang 750mm (768-1)'`)
  assert.ok(name, 'restore your name on #120?')
  assert.match(JSON.parse(name.evidence).why, /#141/)
  assert.equal(m(d1, 70).slug, 'x-uav-talon-gt-rebel-pnp-kit-with-motor-esc-and-servos-grey-camo', 'a suggestion changes nothing')
})
