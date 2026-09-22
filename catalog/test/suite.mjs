// Catalog platform test suite.
//   npm run catalog:test                        (read-only + guards)
//   CATALOG_TEST_MUTATE=1 npm run catalog:test  (+ lifecycle round-trips;
//                                                run against LOCAL dev only)
// Env: CATALOG_BASE (default http://127.0.0.1:8787), CATALOG_PASS (devpass)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSpanMM, detectConfig, cartSignals, isChallenge, checkWooProduct, magentoPage } from '../lib/adapters.mjs'
import { compare, findDuplicates, bestSurvivor } from '../lib/dedup.mjs'
import { powerType, conditionOf, roleTags } from '../lib/public.mjs'
import { popScores, availabilityFactor } from '../lib/popularity.mjs'
import { renderGridNext, searchRows } from '../lib/grid-next.mjs'
import { ADMIN_HTML } from '../lib/admin-ui.mjs'
import { configAgreement as mfrConfigAgreement, configTypes as mfrConfigTypes, isAircraft as isMfrAircraft, nameSim as mfrNameSim, rankCandidates } from '../lib/mfr-match.mjs'
import { fetchStrategyPage, STRATEGIES } from '../lib/mfr-strategies.mjs'
import { enqueueManufacturerHarvests, MFR_WEEKLY_CRON } from '../lib/mfr-jobs.mjs'
import { extractManufacturerFacts, mergeProfile, normalizeProfilePatch, PROFILE_FIELDS, validateProfileValues } from '../lib/mfr-profile.mjs'
import { fetchWithAllowedRedirects, imageCacheHeaders } from '../lib/util.mjs'

const BASE = process.env.CATALOG_BASE ?? 'http://127.0.0.1:8787'
const PASS = process.env.CATALOG_PASS ?? 'devpass'
const MUTATE = process.env.CATALOG_TEST_MUTATE === '1'
const AUTH = 'Basic ' + Buffer.from(`admin:${PASS}`).toString('base64')

const get = (p, headers = {}) => fetch(BASE + p, { headers, redirect: 'manual' })
const api = async (p, body) => {
  const res = await fetch(BASE + '/api/' + p, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: AUTH, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// ------------------------------------------------------ enrich extraction
test('extractSpanMM: units, order, sanity bounds', () => {
  assert.equal(extractSpanMM('ZOHD Dart 800mm Wingspan FPV Wing'), 800)
  assert.equal(extractSpanMM('Wingspan: 1,200 mm | Length 830mm'), 1200)
  assert.equal(extractSpanMM('Wing span 98 cm EPP trainer'), 980)
  assert.equal(extractSpanMM('wingspan 1.2m powered glider'), 1200)
  assert.equal(extractSpanMM('Wingspan: 39.4 inches'), 1001)
  assert.equal(extractSpanMM('3.5mm gold connector pack'), null, 'connector size must not become a span')
  assert.equal(extractSpanMM('M3 nylon bolts 20mm x 50'), null, 'hardware sizes rejected by sanity bounds')
  assert.equal(extractSpanMM(''), null)
})

test('detectConfig: rtf > pnp > combo > kit', () => {
  assert.equal(detectConfig('Dolphin 845mm PNP'), 'pnp')
  assert.equal(detectConfig('Trainer Ready To Fly with remote'), 'rtf')
  assert.equal(detectConfig('Wing combo with motor and ESC'), 'combo')
  assert.equal(detectConfig('Balsa kit — laser cut'), 'kit')
  assert.equal(detectConfig('Plug and play version'), 'pnp')
})

// ------------------------------------------------ manufacturer harvesting
test('manufacturer matcher keeps numeric model identities distinct', () => {
  assert.equal(mfrNameSim('Ranger 757-4', 'VOLANTEXRC Ranger 2000 75708 PNP', ['volantexrc']), 0.5)
  assert.equal(mfrNameSim('Ranger 600', 'VolantexRC Ranger 600S RTF', ['volantexrc']), 1)
})

test('manufacturer matcher ranks exact SKU and reviews span conflicts', () => {
  const candidates = [
    { id: 1, title: 'Hunter H1 Humi PNP', span: 680 },
    { id: 2, title: 'Hunter F22 PNP', span: 400 },
    { id: 3, title: 'Hunter H1 Humi spare fuselage', span: 680 },
  ]
  const exact = rankCandidates({ name: 'Hunter F22', span: 400 }, candidates, ['heewing'], 3)
  assert.equal(exact[0].product.id, 2)
  assert.equal(exact[0].tier, 'accept')
  const conflict = rankCandidates({ name: 'Hunter F22', span: 680 }, candidates, ['heewing'], 3)
  assert.equal(conflict[0].product.id, 2, 'exact model identity still wins')
  assert.equal(conflict[0].tier, 'review', 'an exact name with conflicting span must be reviewed')
  assert.equal(isMfrAircraft('Dolphin PNP fixed wing'), true)
  assert.equal(isMfrAircraft('Dolphin replacement fuselage'), false)
})

test('manufacturer matcher uses kit/config type to rank exact variants', () => {
  const candidates = [
    { id: 1, title: 'Dolphin 845mm ARF', span: 845 },
    { id: 2, title: 'Dolphin 845mm PNP', span: 845 },
  ]
  const ranked = rankCandidates({ name: 'Dolphin', span: 845, configs: ['pnp'] }, candidates, [], 2)
  assert.equal(ranked[0].product.id, 2, 'the matching PNP SKU ranks above the ARF variant')
  assert.equal(ranked[0].config_agree, 1)
  assert.equal(ranked[1].config_agree, 0)
  assert.equal(ranked[1].tier, 'review', 'a conflicting kit/config variant cannot auto-accept')
  assert.deepEqual(mfrConfigTypes('Almost Ready-to-Fly (ARF)'), ['arf'])
  assert.deepEqual(mfrConfigTypes('Plug-N-Play combo'), ['pnp', 'combo'])
  assert.equal(mfrConfigAgreement(['kit'], ['arf']), 1, 'catalog kit includes seller listings classified as ARF')
  assert.equal(mfrConfigAgreement(['pnp'], ['bnf']), null, 'unsupported BNF remains unknown, not a false conflict')
  const titleWins = rankCandidates(
    { name: 'Dolphin', span: 845, configs: ['pnp'] },
    [{ id: 3, title: 'Dolphin PNP', body_text: 'The kit includes a motor and ESC.', span: 845 }],
  )[0]
  assert.deepEqual(titleWins.config_types, ['pnp'], 'description wording cannot override an explicit title config')
  assert.equal(titleWins.config_agree, 1)
})

test('Shopify manufacturer harvesting is cursor-paged', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      products: String(url).includes('page=1')
        ? [
            { id: 1, title: 'Alpha Plane PNP', handle: 'alpha', body_html: 'Wingspan 900mm', images: [] },
            { id: 2, title: 'Beta Plane PNP', handle: 'beta', body_html: 'Wingspan 1000mm', images: [] },
            { id: 3, title: 'Gamma Plane PNP', handle: 'gamma', body_html: 'Wingspan 1100mm', images: [] },
          ]
        : [],
    }),
  })
  try {
    const page = await fetchStrategyPage('heewing.com', 'HEEWING', { offset: 1, limit: 1 })
    assert.equal(page.total, 3)
    assert.equal(page.products[0].title, 'Beta Plane PNP')
    assert.equal(page.nextOffset, 2)
    assert.equal(page.done, false)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('JSON-LD harvesting extracts an unlabelled wingspan from the product title before the long description', async () => {
  const realFetch = globalThis.fetch
  const productUrl = 'https://motionrc.com/products/fms-1400mm-p-40b-warhawk-pnp'
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    sku: 'FMS081P',
    name: 'FMS 1400mm P-40B Warhawk PNP',
    brand: { name: 'FMS' },
    // Deliberately long and full of unrelated dimensions. Passing title + body
    // to spanOf() as one string makes its safe bare-number fallback unavailable.
    description: 'Detailed scale aircraft with a 425 mm fuselage panel, 85 mm wheels, removable landing gear, lights, flaps, servos, motor, ESC, and ample battery access for field setup.',
  }
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    text: async () => String(url).endsWith('/sitemap.xml')
      ? `<urlset><url><loc>${productUrl}</loc></url></urlset>`
      : `<script type="application/ld+json">${JSON.stringify(product)}</script>`,
  })
  try {
    const page = await fetchStrategyPage('motionrc.com', 'FMS', { offset: 0, limit: 1 })
    assert.equal(page.products.length, 1)
    assert.equal(page.products[0].span, 1400)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('Horizon JSON-LD discovery prefers the configured aircraft listing and filters terminal SKUs', async () => {
  const realFetch = globalThis.fetch
  const cfg = STRATEGIES['horizonhobby.com']
  const realListingPageSize = cfg.listingPageSize
  cfg.listingPageSize = 1
  const listingUrl = (start) => {
    const url = new URL(cfg.brandListingUrls.eflite, 'https://horizonhobby.com')
    url.searchParams.set('start', String(start))
    url.searchParams.set('sz', '1')
    return url.href
  }
  const listingUrls = [listingUrl(0), listingUrl(1)]
  const first = 'https://horizonhobby.com/product/alpha-trainer-bnf/EFL10010.html'
  const second = 'https://horizonhobby.com/product/bravo-sport-pnp/EFL10020.html'
  const accessory = 'https://horizonhobby.com/product/e-flite-control-arm/DUB930.html'
  const requests = []
  const fetchedProducts = []
  const productHtml = (url) => `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    sku: url === first ? 'EFL10010' : 'EFL10020',
    name: url === first ? 'E-flite Alpha Trainer BNF' : 'E-flite Bravo Sport PNP',
    brand: { name: 'E-flite' },
    description: 'A complete electric aircraft.',
  })}</script>`
  globalThis.fetch = async (url) => {
    const href = String(url)
    requests.push(href)
    if (href === listingUrls[0]) return {
      ok: true,
      status: 200,
      text: async () => `<div class="result-count">1-1 of 2 Results</div><div class="product-grid"><a href="/product/alpha-trainer-bnf/EFL10010.html">Alpha</a><a href='/product/e-flite-control-arm/DUB930.html'>Accessory</a></div>`,
    }
    if (href === listingUrls[1]) return {
      ok: true,
      status: 200,
      text: async () => '<div class="result-count">2-2 of 2 Results</div><div class="product-grid"><a href="/product/bravo-sport-pnp/EFL10020.html">Bravo</a></div>',
    }
    if (href.includes('sitemap')) throw new Error('valid aircraft listing must not fall back to sitemaps')
    fetchedProducts.push(href)
    return { ok: true, status: 200, text: async () => productHtml(href) }
  }
  try {
    const firstPage = await fetchStrategyPage('horizonhobby.com', 'E-flite', { offset: 0, limit: 1 })
    assert.deepEqual(firstPage.cursorUrls, [first, second])
    assert.deepEqual(fetchedProducts, [first])
    assert.equal(firstPage.cursorUrls.includes(accessory), false, 'brand mention cannot override a foreign terminal SKU')
    assert.equal(requests.some((url) => url.includes('sitemap')), false)

    const listingFetchCount = requests.filter((url) => listingUrls.includes(url)).length
    assert.equal(listingFetchCount, 2, 'discovery must visit both aircraft listing pages')
    const secondPage = await fetchStrategyPage('horizonhobby.com', 'E-flite', {
      offset: firstPage.nextOffset,
      limit: 1,
      cursorUrls: firstPage.cursorUrls,
    })
    assert.deepEqual(secondPage.products.map((product) => product.ext_id), ['ld:EFL10020'])
    assert.deepEqual(fetchedProducts, [first, second])
    assert.equal(secondPage.done, true)
    assert.equal(requests.filter((url) => listingUrls.includes(url)).length, listingFetchCount, 'continuation must reuse the listing cursor')
    assert.equal(requests.some((url) => url.includes('sitemap')), false)
  } finally {
    cfg.listingPageSize = realListingPageSize
    globalThis.fetch = realFetch
  }
})

test('Horizon required aircraft listing fails closed without consulting broad product sitemaps', async () => {
  const realFetch = globalThis.fetch
  const cfg = STRATEGIES['horizonhobby.com']
  const listingUrl = new URL(cfg.brandListingUrls.eflite, 'https://horizonhobby.com').href
  try {
    for (const html of [
      '',
      '<div>1-2 Results</div><a href="/product/alpha-trainer-bnf/EFL10010.html">Alpha</a>',
    ]) {
      const requests = []
      globalThis.fetch = async (url) => {
        const href = String(url)
        requests.push(href)
        if (href === listingUrl) return { ok: true, status: 200, text: async () => html }
        throw new Error('required listing failure must not fall back to a sitemap')
      }
      await assert.rejects(
        () => fetchStrategyPage('horizonhobby.com', 'E-flite', { offset: 0, limit: 1 }),
        /listing|result/i,
      )
      assert.equal(requests.some((url) => url.includes('sitemap')), false)
    }
  } finally {
    globalThis.fetch = realFetch
  }
})

test('manufacturer harvesting uses one weekly production trigger', () => {
  assert.equal(MFR_WEEKLY_CRON, '7 3 * * SUN')
})

test('weekly manufacturer enqueue skips manual-only strategies and still queues harvestable manufacturers', async () => {
  const calls = []
  const sent = []
  const manufacturers = [
    { id: 11, brand: 'FMS', domain: 'fmshobby.com', status: 'active' },
    { id: 12, brand: 'HEEWING', domain: 'heewing.com', status: 'active' },
  ]
  const env = {
    CATALOG_DB: {
      prepare(sql) {
        return {
          bind(...params) {
            calls.push({ sql, params })
            return {
              first: async () => null,
              all: async () => ({ results: /FROM manufacturer/.test(sql) ? manufacturers : [] }),
              run: async () => ({ success: true, meta: { changes: 1 } }),
            }
          },
        }
      },
    },
    MFR_HARVEST_QUEUE: {
      async sendBatch(messages) { sent.push(...messages) },
    },
  }

  const result = await enqueueManufacturerHarvests(env, { trigger: 'cron' })
  assert.equal(result.queued, 1)
  assert.deepEqual(sent.map((message) => message.body.manufacturerId), [12])
  const queuedUpdate = calls.find(({ sql }) => /UPDATE manufacturer\s+SET last_harvest_status='queued'/.test(sql))
  assert.deepEqual(JSON.parse(queuedUpdate.params[1]), [12], 'manual-only manufacturer must not be marked queued')
})

test('manufacturer profile schema has stable unique keys', () => {
  const keys = PROFILE_FIELDS.map((field) => field.key)
  assert.equal(new Set(keys).size, keys.length)
  for (const key of [
    'controlLayout', 'motorCount', 'propulsionPosition', 'difficulty',
    'recommendedAuwMinG', 'maxAuwG', 'fpvReadiness', 'fcReadiness',
    'lowSpeedBehavior', 'fieldRequirement',
  ]) assert.ok(keys.includes(key), key)
})

test('manufacturer profile extracts only explicit controls, weights, FPV/FC and field facts', () => {
  const fish = extractManufacturerFacts({
    title: 'Flying Fish dual motor FPV aircraft',
    bodyText: 'True 4-channel control over Aileron, Elevator, Throttle and Rudder. ' +
      'Included FPV camera mounts. Suitable for beginners or intermediate users. ' +
      'Recommend take off weight: 250g. Max. take off weight: 280g.',
  })
  assert.equal(fish.suggestions.controlLayout, 'conventional')
  assert.deepEqual(fish.suggestions.controlSurfaces, ['aileron', 'elevator', 'rudder'])
  assert.equal(fish.suggestions.channels, 4)
  assert.equal(fish.suggestions.motorCount, 2)
  assert.equal(fish.suggestions.difficulty, 'beginner')
  assert.equal(fish.suggestions.recommendedAuwMinG, 250)
  assert.equal(fish.suggestions.recommendedAuwMaxG, 250)
  assert.equal(fish.suggestions.maxAuwG, 280)
  assert.equal(fish.suggestions.fpvReadiness, 'purpose_built')
  assert.match(fish.evidence.maxAuwG, /Max\. take off weight/i)
  assert.deepEqual(fish.sources.difficulty, {
    kind: 'manufacturer_text',
    confidence: 'manufacturer_claim',
  })

  const whale = extractManufacturerFacts({
    bodyText: 'Twin motor pusher. Exclusive installation positions for the flight controller, VTX and antenna. ' +
      '3KG Payload Capacity. OFF-Road Landing Gear.',
  })
  assert.equal(whale.suggestions.motorCount, 2)
  assert.equal(whale.suggestions.propulsionPosition, 'pusher')
  assert.equal(whale.suggestions.fcReadiness, 'purpose_built')
  assert.equal(whale.suggestions.fpvReadiness, 'purpose_built')
  assert.equal(whale.suggestions.payloadG, 3000)
  assert.equal(whale.suggestions.fieldRequirement, 'rough_grass_ok')
  assert.deepEqual(whale.suggestions.landingMethods, ['wheels'])
})

test('manufacturer profile handles AUW ranges and does not promote package prose into facts', () => {
  const range = extractManufacturerFacts({ bodyText: 'AUW: 350 - 420 g. Flying skill level intermediate/advanced.' })
  assert.equal(range.suggestions.recommendedAuwMinG, 350)
  assert.equal(range.suggestions.recommendedAuwMaxG, 420)
  assert.equal(range.suggestions.difficulty, 'intermediate_advanced')

  const maxOnly = extractManufacturerFacts({ bodyText: 'Max. take off weight: 2500g. Item weight: 1.76kg. Easy assembly.' })
  assert.equal(maxOnly.suggestions.maxAuwG, 2500)
  assert.equal('recommendedAuwMinG' in maxOnly.suggestions, false, 'max weight is not also a recommended AUW')
  assert.equal('difficulty' in maxOnly.suggestions, false, 'easy assembly says nothing about flying difficulty')

  const mentionsOnly = extractManufacturerFacts({
    title: 'FPV fixed wing',
    bodyText: 'Item weight: 1.6kg. Includes landing gear.',
  })
  assert.equal('fpvReadiness' in mentionsOnly.suggestions, false, 'a bare FPV label does not prove accommodation')
  assert.equal('recommendedAuwMinG' in mentionsOnly.suggestions, false, 'item/package weight is not AUW')
  assert.equal('fieldRequirement' in mentionsOnly.suggestions, false, 'landing gear alone does not prove grass suitability')
  const genericSpace = extractManufacturerFacts({
    bodyText: 'There is enough space for all necessary electronics inside the canopy.',
  })
  assert.equal('fpvReadiness' in genericSpace.suggestions, false, 'generic electronics space is not explicit FPV accommodation')
  assert.equal('fcReadiness' in genericSpace.suggestions, false, 'generic electronics space is not explicit FC accommodation')
  const fcOnly = extractManufacturerFacts({
    bodyText: 'A dedicated mounting position is provided for the flight controller.',
  })
  assert.equal(fcOnly.suggestions.fcReadiness, 'purpose_built')
  assert.equal('fpvReadiness' in fcOnly.suggestions, false, 'an FC mount alone does not prove FPV accommodation')

  assert.equal(
    'difficulty' in extractManufacturerFacts({
      title: 'Advanced aerobatic plane',
      bodyText: 'This aircraft is not for beginners.',
    }).suggestions,
    false,
    'a negated beginner phrase is never a beginner recommendation',
  )
  assert.equal(
    extractManufacturerFacts({ title: 'Beginner RC Airplane Trainer' }).suggestions.difficulty,
    'beginner',
    'an explicit manufacturer title claim is usable',
  )
  assert.equal(
    extractManufacturerFacts({
      title: 'Ranger 2400 PNP 5CH',
      bodyText: 'Use a 5 channel or more than 5 channel receiver.',
    }).suggestions.channels,
    5,
    'an exact title/spec count wins over later receiver-flexibility prose',
  )
  assert.equal(
    extractManufacturerFacts({ bodyText: 'Requires more than 5 channels.' }).suggestions.channels,
    6,
    'a standalone more-than requirement still raises the minimum',
  )
})

test('manufacturer profile patch normalization validates enums, numbers and explicit clears', () => {
  assert.deepEqual(
    normalizeProfilePatch({
      controlLayout: 'V-tail',
      channels: '4',
      launchMethods: ['Hand launch', 'ground-roll', 'Hand launch'],
      fieldNotes: '  Short grass tested manually.  ',
      maxAuwG: null,
    }),
    {
      controlLayout: 'v_tail',
      channels: 4,
      launchMethods: ['hand_launch', 'ground_roll'],
      fieldNotes: 'Short grass tested manually.',
      maxAuwG: null,
    },
  )
  assert.throws(() => normalizeProfilePatch({ mystery: 1 }), /unknown profile field/)
  assert.throws(() => normalizeProfilePatch({ constructor: null }), /unknown profile field/)
  assert.throws(() => normalizeProfilePatch({ toString: null }), /unknown profile field/)
  assert.throws(() => normalizeProfilePatch(JSON.parse('{"__proto__":null}')), /unknown profile field/)
  assert.throws(() => normalizeProfilePatch({ channels: 0 }), /integer from 1 to 32/)
  assert.throws(() => normalizeProfilePatch({ difficulty: 'very hard' }), /must be one of/)
  assert.throws(() => normalizeProfilePatch({ landingMethods: ['parachute'] }), /unsupported value/)
})

test('manufacturer profile validates AUW relationships', () => {
  const valid = { recommendedAuwMinG: 350, recommendedAuwMaxG: 420, maxAuwG: 500 }
  assert.equal(validateProfileValues(valid), valid)
  assert.throws(
    () => validateProfileValues({ recommendedAuwMinG: 450, recommendedAuwMaxG: 400 }),
    /minimum cannot exceed good AUW maximum/,
  )
  assert.throws(
    () => validateProfileValues({ recommendedAuwMaxG: 600, maxAuwG: 500 }),
    /Good AUW maximum cannot exceed maximum AUW/,
  )
  assert.throws(
    () => validateProfileValues({ recommendedAuwMinG: 600, maxAuwG: 500 }),
    /Good AUW minimum cannot exceed maximum AUW/,
  )
  assert.doesNotThrow(() => validateProfileValues({
    recommendedAuwMinG: null,
    recommendedAuwMaxG: null,
    maxAuwG: 500,
  }))
})

test('manual manufacturer profile overrides win, including explicit null', () => {
  const suggestions = { channels: 4, difficulty: 'beginner', maxAuwG: 280 }
  const overrides = { difficulty: 'intermediate', maxAuwG: null }
  assert.deepEqual(mergeProfile(suggestions, overrides), {
    channels: 4,
    difficulty: 'intermediate',
    maxAuwG: null,
  })
  assert.equal(suggestions.difficulty, 'beginner', 'merge does not mutate suggestions')
})

// ------------------------------------------------------ popularity scoring
test('popScores: more views + broader coverage ranks higher', () => {
  const now = 1_750_000_000_000
  const recent = now - 10 * 86400e3
  const popular = popScores({ videos: [{ views: 500000, published_at: recent }, { views: 120000, published_at: recent }, { views: 40000, published_at: recent }], sellers: 3, anyStock: 1, nowMs: now })
  const niche = popScores({ videos: [{ views: 800, published_at: recent }], sellers: 1, anyStock: 1, nowMs: now })
  assert.ok(popular.raw > niche.raw, 'view sum + breadth lifts raw score')
  assert.ok(popular.score > niche.score)
})

test('popScores: one viral video cannot dwarf broad coverage (log compression)', () => {
  const now = 1_750_000_000_000
  const at = now - 30 * 86400e3
  const oneViral = popScores({ videos: [{ views: 5_000_000, published_at: at }], sellers: 1, anyStock: 1, nowMs: now })
  const manyReviews = popScores({ videos: Array.from({ length: 12 }, () => ({ views: 60000, published_at: at })), sellers: 1, anyStock: 1, nowMs: now })
  // both are "popular"; log-compression + breadth keep them within a factor of ~2, not 10x
  assert.ok(manyReviews.raw > oneViral.raw * 0.6 && oneViral.raw > manyReviews.raw * 0.6)
})

test('popScores: empty coverage scores zero', () => {
  const r = popScores({ videos: [], sellers: 2, anyStock: 1, nowMs: 1_750_000_000_000 })
  assert.equal(r.raw, 0)
  assert.equal(r.score, 0)
})

test('popScores: excluded videos do not count', () => {
  const now = 1_750_000_000_000
  const withExcluded = popScores({ videos: [{ views: 999999, published_at: now, excluded: 1 }, { views: 1000, published_at: now }], sellers: 1, anyStock: 1, nowMs: now })
  const withoutIt = popScores({ videos: [{ views: 1000, published_at: now }], sellers: 1, anyStock: 1, nowMs: now })
  assert.equal(withExcluded.raw, withoutIt.raw)
})

test('availabilityFactor: OOS is damped, in-stock + sellers is boosted', () => {
  const now = 1_750_000_000_000
  const vids = [{ views: 100000, published_at: now }, { views: 100000, published_at: now }]
  const oos = popScores({ videos: vids, sellers: 0, anyStock: 0, nowMs: now })
  const inStock = popScores({ videos: vids, sellers: 4, anyStock: 1, nowMs: now })
  assert.equal(oos.raw, inStock.raw, 'raw interest is identical — availability only affects the buyable score')
  assert.ok(inStock.score > oos.score, 'in-stock + multi-seller outranks OOS on the buyable grid')
  assert.ok(availabilityFactor({ sellers: 0, anyStock: 0 }) < availabilityFactor({ sellers: 5, anyStock: 1 }))
})

test('isChallenge: bot walls are recognised, real pages are not', () => {
  assert.equal(isChallenge('<title>Just a moment...</title>'), true)
  assert.equal(isChallenge('<h1>Checking your browser before accessing</h1>'), true)
  assert.equal(isChallenge('<script src="https://challenges.cloudflare.com/turnstile"></script>'), true)
  assert.equal(isChallenge('<h1>ATOMRC Penguin</h1><span class="price">₹8,999</span>'), false)
})

test('magentoPage: parses listing (url/pid/price/stock), stops on clamp', async () => {
  const item = (pid, slug, name, price, stock) =>
    `<a title="${name}" href="https://shop.example/cat/${slug}.html" class="product-image">` +
    `<img id="product-collection-image-${pid}" class="defaultImage" src="https://shop.example/media/${slug}.jpg"/></a>` +
    `<h2 class="product-name ff"><a href="https://shop.example/cat/${slug}.html">${name}</a></h2>` +
    `<div class="price-box"><span class="regular-price" id="product-price-${pid}"><span class="price">₹${price}.00</span></span></div>` +
    `<div class="actions">${stock ? '<button class="btn-cart">Add to Cart</button>' : '<p>Out of stock</p>'}</div>`
  const html = item(11, 'talon', 'X-UAV Talon', '13,500', true) + item(12, 'cub', 'Piper Cub', '14,000', false)
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => html })
  try {
    const src = { home_url: 'https://shop.example', platform: 'magento' }
    const r = await magentoPage(src, 'https://shop.example/cat.html', null)
    assert.equal(r.products.length, 2)
    assert.equal(r.products[0].priceINR, 13500)
    assert.equal(r.products[0].inStock, true)
    assert.equal(r.products[1].inStock, false)
    assert.ok(r.products[0].url.endsWith('/cat/talon.html'))
    // page 2 re-serves the same first pid → walker must stop
    const p2 = await magentoPage(src, 'https://shop.example/cat.html', { page: 2, lastFirst: '11' })
    assert.equal(p2.nextCursor, null)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('checkWooProduct: unreachable API is blocked (preserve), never gone', async () => {
  // A host that refuses/errored must NOT downgrade a listing — it returns
  // {blocked} so verify keeps the last-known price.
  const r = await checkWooProduct('https://catalog-test.invalid', '123')
  assert.equal(r.blocked, true)
  assert.notEqual(r.gone, true)
})

test('checkWooProduct: pid absent from API → disambiguate via product page', async () => {
  const realFetch = globalThis.fetch
  // API returns 200 [] (product not in feed); product page status decides.
  const stub = (pageStatus, pageBody = '<h1>ok</h1>') => async (u) =>
    String(u).includes('/wp-json/')
      ? { ok: true, status: 200, json: async () => [] }
      : { ok: pageStatus < 400, status: pageStatus, text: async () => pageBody }
  try {
    globalThis.fetch = stub(404)
    assert.deepEqual(await checkWooProduct('https://s.example', '9', 'https://s.example/p/x'), { gone: true }, '404 page → gone (auto-remove path)')
    globalThis.fetch = stub(200)
    assert.deepEqual(await checkWooProduct('https://s.example', '9', 'https://s.example/p/x'), { missing: true }, 'live page but absent from feed → missing (owner confirms)')
    globalThis.fetch = stub(403)
    assert.deepEqual(await checkWooProduct('https://s.example', '9', 'https://s.example/p/x'), { blocked: true }, '403 page → blocked (preserve)')
    globalThis.fetch = stub(200, '<title>Just a moment...</title>')
    assert.deepEqual(await checkWooProduct('https://s.example', '9', 'https://s.example/p/x'), { blocked: true }, '200 challenge → blocked (preserve)')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('cartSignals: element-level add-to-cart detection (Zoho)', () => {
  const real = '<div class="theme-cart-button zpbutton" data-zs-add-to-cart data-zs-product-variant-id="1"></div><span class="theme-product-price">₹4,999.00</span>'
  assert.deepEqual(cartSignals(real), { inStock: true, priceINR: 4999 })
  assert.equal(cartSignals('<script>document.querySelectorAll("[data-zs-add-to-cart]")</script><p>Add to Cart</p>'), null, 'JS template strings must not count')
  assert.equal(cartSignals('<h2>Request Quote</h2>'), null)
})

test('dedup.compare: obvious / doubtful / distinct', () => {
  const m = (id, brand, name, span) => ({ id, brand, brand_norm: brand.toLowerCase(), name, name_norm: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), specs: span ? JSON.stringify({ spanMM: span }) : '{}', status: 'ready', offers: 1 })
  // same model, one raw title — OBVIOUS (shared size 1220)
  assert.equal(compare(m(1, 'FMS', 'Ranger 1220'), m(2, 'FMS', 'Ranger 1220mm Premium RC Airplane')).obvious, true)
  // colourway variants of one model — OBVIOUS (size 600 + core 'ranger')
  assert.equal(compare(m(3, 'Volantex', 'RC Ranger 600'), m(4, 'Volantex', 'RC Airplane Volantex Ranger 600 White Stunt RTF')).obvious, true)
  // different sizes — NOT a duplicate
  assert.equal(compare(m(5, 'Volantex', 'Ranger 600', 600), m(6, 'Volantex', 'Ranger 2400', 2400)).score, 0)
  // different brand — NOT a duplicate
  assert.equal(compare(m(7, 'HEEWING', 'T1 Ranger'), m(8, 'FMS', 'Ranger 1220')).score, 0)
  // same brand, name overlap but no size/span pin, extra distinguishing word — DOUBTFUL (flag, not auto)
  const doubtful = compare(m(9, 'Volantex', 'Ranger EP V2'), m(10, 'Volantex', 'Ranger'))
  assert.equal(doubtful.obvious, false)
  assert.ok(doubtful.score > 0)
})

test('dedup.findDuplicates: obvious cluster picks ready survivor; 3-way collapses', () => {
  const M = (id, brand, name, span, status = 'ready', offers = 1) => ({ id, brand, brand_norm: brand.toLowerCase(), name, name_norm: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), specs: span ? JSON.stringify({ spanMM: span }) : '{}', status, offers })
  const masters = [
    M(29, 'FMS', 'Ranger 1220', null, 'ready', 2),
    M(144, 'FMS', 'Ranger 1220mm Premium RC Airplane', null, 'draft', 1),
    M(15, 'HEEWING', 'T1 Ranger', null),
    // 3-way colourway dup — must land in ONE cluster, not 3 pairs
    M(122, 'Volantex', 'Ranger 600 White', 600, 'draft'),
    M(125, 'Volantex', 'Ranger 600 Black', 600, 'draft'),
    M(129, 'Volantex', 'RC Ranger 600', 600, 'draft'),
  ]
  const { obviousClusters, candidatePairs } = findDuplicates(masters)
  const fms = obviousClusters.find((c) => c.some((m) => m.id === 29))
  assert.ok(fms && fms.length === 2, 'FMS Ranger pair is one obvious cluster')
  assert.equal(bestSurvivor(fms).id, 29, 'ready master with more offers survives')
  const volantex = obviousClusters.find((c) => c.some((m) => m.id === 122))
  assert.equal(volantex.length, 3, 'the three Ranger 600 colourways form ONE cluster')
})

test('powerType: gas markers vs electric default', () => {
  assert.equal(powerType('Extreme Flight Slick 104in 100cc'), 'gas')
  assert.equal(powerType('SEAGULL Boomerang V3 Trainer 61" ARF .46 2-stroke'), 'gas')
  assert.equal(powerType('Cap 232 .46 Size ARF'), 'gas')
  assert.equal(powerType('Westland Lysander 118in 50-60cc'), 'gas')
  assert.equal(powerType('SKYWING Extra NG 74in 35cc/120E'), 'gas', 'gas-class airframe even with an electric option')
  assert.equal(powerType('ATOMRC Dolphin Pro 800mm PNP'), 'electric')
  assert.equal(powerType('FMS Viper 70mm EDF Jet'), 'electric')
  assert.equal(powerType('ZOHD Dart XL 1000mm brushless'), 'electric')
  assert.equal(powerType('QIDI 510mm Gyro RTF Plane'), 'electric')
  // combustion-engine words + brands (no cc/nitro marker in the title)
  assert.equal(powerType('Seagull Extreme Decathlon 79 with DLE20RA Engine'), 'gas')
  assert.equal(powerType('Dhansu Danda By Airhawk Models 54.99in with NGH GT9 Pro'), 'gas')
  assert.equal(powerType('Decathlon DLE 30'), 'gas')
  assert.equal(powerType('Extra 300 DA-50 Gasser'), 'gas')
  assert.equal(powerType('Saito FG-60 powered Cub'), 'gas')
  assert.equal(powerType('Freewing F-16 90mm EDF brushless motor'), 'electric', 'electric uses a motor, not an engine')
})

test('conditionOf: pre-owned vs new', () => {
  assert.equal(conditionOf('Senior Telemaster (Pre-owned)'), 'used')
  assert.equal(conditionOf('Havoc Raptor F22 RTF (Quality Pre Owned)'), 'used')
  assert.equal(conditionOf('PT19 Sparingly used model like NEW'), 'used')
  assert.equal(conditionOf('FMS 1500mm Cessna 182 PNP RC Airplane'), 'new')
  assert.equal(conditionOf('Brand new unused EDF jet'), 'new', 'bare "unused" must not read as used')
})

test('roleTags: multi-tag role classification', () => {
  const tags = (s) => roleTags(s).tags
  assert.deepEqual(tags('North American P-51 Mustang 1100mm PNP'), ['Warbird'])
  assert.deepEqual(tags('Freewing F-16 Fighting Falcon 70mm EDF'), ['Jet / EDF', 'Warbird'], 'military jet is both a jet and a warbird')
  assert.deepEqual(tags('FMS Cessna 182 Skylane 1500mm PNP'), ['Scale Civilian'])
  assert.deepEqual(tags('Extreme Flight Extra 330SC 3D Aerobatic'), ['Aerobatic / 3D'])
  assert.deepEqual(tags('ATOMRC Dolphin FPV Fixed Wing 845mm'), ['FPV / Flying Wing'])
  assert.deepEqual(tags('Volantex Ranger 2000 FPV Platform'), ['FPV / Flying Wing'])
  assert.deepEqual(tags('E-flite Radian XL 2.6m Glider'), ['Glider / Sailplane'])
  assert.deepEqual(tags('Airbus A320 Twin 70mm EDF Airliner'), ['Jet / EDF', 'Airliner'])
  // combo prune the owner requested: Warbird/Scale never keep a "Trainer" secondary
  assert.ok(!tags('FMS T-28 Trojan Warbird Trainer 1400mm').includes('Trainer'), 'T-28 stays Warbird, not Trainer')
  assert.ok(!tags('FMS PA-18 Super Cub Trainer 1300mm').includes('Trainer'), 'Cub stays Scale Civilian, not Trainer')
  // unknown foamie name → Sport/Park default, flagged low-confidence for the AI fallback
  const d = roleTags('Guinea Pig 900mm foamy')
  assert.deepEqual(d.tags, ['Sport / Park Flyer'])
  assert.equal(d.confident, false, 'unknown name is not confident → AI fallback eligible')
})

test('renderGridNext: isolated faceted grid — reuse, contextual facets, server filter', () => {
  const cat = { name: 'Fixed-wing RC planes', path_prefix: '/wings' }
  // new_stock / preowned_stock are per-offer in-stock condition signals (a master can be both).
  const rows = [
    { id: 1, slug: 'mig', brand: '', name: 'MiG-29', power: 'electric', role_tags: '["Jet / EDF","Warbird"]', specs: '{"spanMM":600}', sellers: 1, hero_any: null, min_price: 4500, span_mm: 600, new_stock: 1, preowned_stock: 0 },
    { id: 2, slug: 'cub', brand: 'FMS', name: 'Sport Cub', power: 'electric', role_tags: '["Scale Civilian","Trainer"]', specs: '{"spanMM":1400}', sellers: 1, hero_any: null, min_price: 12000, span_mm: 1400, new_stock: 1, preowned_stock: 0 },
    { id: 3, slug: 'tele', brand: '', name: 'Telemaster', power: 'electric', role_tags: '["Scale Civilian"]', specs: '{"spanMM":1900}', sellers: 1, hero_any: null, min_price: 6000, span_mm: 1900, new_stock: 0, preowned_stock: 1 },
    // mixed: has BOTH a new and a used in-stock offer; span exactly 1500mm; a junk role tag
    { id: 4, slug: 'mix', brand: '', name: 'Extra 300', power: 'electric', role_tags: '["Aerobatic / 3D","Other","</script>x"]', specs: '{"spanMM":1500}', sellers: 2, hero_any: null, min_price: 9000, span_mm: 1500, new_stock: 1, preowned_stock: 1 },
  ]
  const cnt = { electric: 4, gas: 0 }
  // 'popular' is the DEFAULT sort (DEFAULT_SORT in grid-next.mjs) — the default
  // state must be indexable; any explicit non-default sort must be noindex.
  const base = { power: 'electric', roles: [], sizes: [], cond: 'all', sort: 'popular', counts: cnt }
  const out = renderGridNext(cat, rows, base)
  assert.ok(out.includes('class="prods" id="fx-grid"'), 'reuses the live .prods grid class')
  assert.ok(!out.includes('class="filt"'), 'does NOT emit the live power-filter markup')
  assert.ok(!out.includes('name="robots" content="noindex"'), 'default grid must be indexable (not noindex)')
  assert.ok(renderGridNext(cat, rows, { ...base, sort: 'price-desc' }).includes('name="robots" content="noindex"'), 'non-default sort state is noindex')
  assert.ok(out.includes('var FX_DATA='), 'embeds the client dataset')
  assert.ok(!out.includes('data-v="FPV / Flying Wing"'), 'a role with no models is not offered (contextual)')

  // fix #4: junk / breakout role tags are vocab-filtered out of the embed, '<' is escaped
  assert.ok(!/<\/script>x/.test(out), 'no </script> breakout from a poisoned role_tags value')
  assert.ok(!out.includes('"Other"') && !out.includes('data-v="Other"'), '"Other" is not a filter chip')

  // fix #1: the mixed master (new + used) is present under BOTH New and Pre-owned
  const outNew = renderGridNext(cat, rows, { ...base, cond: 'new' })
  assert.ok(/id="fx-nres">3</.test(outNew), 'New keeps every master with an in-stock new offer (3: mig, cub, mix)')
  const outUsed = renderGridNext(cat, rows, { ...base, cond: 'pre-owned' })
  assert.ok(/id="fx-nres">2</.test(outUsed), 'Pre-owned = masters with an in-stock used offer (2: tele, mix)')

  // fix #2: 1500mm is 'medium' (not 'large') — matches the "1–1.5 m" label
  const outLarge = renderGridNext(cat, rows, { ...base, sizes: ['large'] })
  assert.ok(/id="fx-nres">1</.test(outLarge), '1500mm bucketed as medium → only the 1900mm plane is Large')

  // fix #3: server hides non-matching cards so the no-JS count matches the grid
  const outWb = renderGridNext(cat, rows, { ...base, roles: ['Warbird'] })
  assert.ok(/id="fx-nres">1</.test(outWb) && outWb.includes('style="display:none"'), 'filtered link hides non-matching cards server-side')
})

test('catalog search: name/brand/type matching + search-mode grid', () => {
  const rows = [
    { id: 1, slug: 'volantex-ranger-600', brand: 'Volantex', name: 'RC Ranger 600', power: 'electric', role_tags: '["Trainer"]' },
    { id: 2, slug: 'heewing-t1-ranger', brand: 'HEEWING', name: 'T1 Ranger', power: 'electric', role_tags: '["FPV / Flying Wing"]' },
    { id: 3, slug: 'seagull-p51', brand: 'Seagull Models', name: 'P-51D Mustang', power: 'gas', role_tags: '["Warbird"]' },
    { id: 4, slug: 'fms-viper', brand: 'FMS', name: 'Viper 70mm EDF Jet', power: 'electric', role_tags: '["Jet / EDF"]' },
  ]
  const ids = (q) => searchRows(rows, q).map((m) => m.id).join(',')
  assert.equal(ids('ranger'), '1,2', 'name substring matches both Rangers')
  assert.equal(ids('heewing ranger'), '2', 'brand + name narrows (flattened brand also matches "hee wing" style splits)')
  assert.equal(ids('fms'), '4', 'manufacturer alone matches')
  assert.equal(ids('warbird'), '3', 'craft-type word maps to the role tag')
  assert.equal(ids('nitro warbird'), '3', 'power word + role word combine')
  assert.equal(ids('electric trainer'), '1', 'trainer role + electric power')
  assert.equal(ids('jet'), '4', 'jet maps to Jet / EDF role (also name hit)')
  assert.equal(ids('mustang seagull'), '3', 'every token must match the same row')
  assert.equal(ids('zzz'), '', 'no match → empty')
  assert.equal(searchRows(rows, '').length, 4, 'empty query returns everything')

  // Search-mode grid: rows arrive power=all, renderer filters + flags noindex.
  const cat = { name: 'Fixed-wing RC planes', path_prefix: '/wings' }
  const full = rows.map((m) => ({ ...m, specs: '{}', sellers: 1, hero_any: null, min_price: 5000, span_mm: 1000, new_stock: 1, preowned_stock: 0 }))
  const out = renderGridNext(cat, full, { power: 'electric', q: 'ranger', counts: { electric: 3, gas: 1 } })
  assert.ok(/id="fx-nres">2</.test(out), 'search result count reflects the query')
  assert.ok(out.includes('name="robots" content="noindex"'), 'search pages are noindex')
  assert.ok(out.includes('value="ranger"'), 'search box retains the query')
  assert.ok(out.includes('class="fx-qclear"'), 'search mode offers a clear link')
  const plain = renderGridNext(cat, full.filter((m) => m.power === 'electric'), { power: 'electric', counts: { electric: 3, gas: 1 } })
  assert.ok(plain.includes('class="fx-qform"') && !plain.includes('class="fx-qclear"'), 'normal grid shows the search box, no clear link')
})

// The admin SPA is a huge inline <script> inside a backtick template. A stray
// escaping bug there (e.g. \' vs \\' inside a single-quoted string) is a syntax
// error the browser hits at parse time — the whole panel dies, silently, and
// node --check / SSR tests never see it. Parse every embedded script here.
test('admin client script parses (no embedded-JS syntax errors)', () => {
  const scripts = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.ok(scripts.length, 'ADMIN_HTML must contain an inline <script>')
  for (const s of scripts) assert.doesNotThrow(() => new Function(s), 'inline admin script must parse')
})

test('manufacturer admin binds details and safe links to the selected candidate', () => {
  assert.match(ADMIN_HTML, /mfrChoices/, 'selected SKU state must survive card rerenders')
  assert.match(ADMIN_HTML, /var active=cs\.find/, 'card facts must resolve an active candidate')
  assert.match(ADMIN_HTML, /data-mfr-candidate/, 'candidate picker must use rich, clickable SKU cards')
  assert.match(ADMIN_HTML, /mf-choice-img/, 'candidate cards must include manufacturer thumbnails')
  assert.match(ADMIN_HTML, /aria-pressed/, 'candidate selection must be exposed to assistive technology')
  assert.match(ADMIN_HTML, /root\.outerHTML=card\(row\)/, 'selection should rerender only its model card')
  assert.match(ADMIN_HTML, /product=\+\(F\.mfrChoices\[master\]\|\|0\)/, 'accept must use selected-card state')
  assert.doesNotMatch(ADMIN_HTML, /<select class="mf-pick"/, 'a native select cannot present photos and match evidence')
  assert.doesNotMatch(ADMIN_HTML, /querySelector\('\[data-choice\]'\)/, 'save must not read the removed dropdown')
  assert.match(ADMIN_HTML, /safeUrl/, 'official URLs must pass protocol validation')
  assert.doesNotMatch(ADMIN_HTML, /mfr_url\|\|'#'/, 'missing official links must never navigate to #')
  assert.match(ADMIN_HTML, /\/img\/master\//)
  assert.match(ADMIN_HTML, /\/img\/mfr\//)
})

test('aircraft-data admin exposes editable sourced facts and the full protected gallery', () => {
  assert.match(ADMIN_HTML, /data-tab="mfrdata">Aircraft data/)
  assert.match(ADMIN_HTML, /api\('mfr-profiles'\)/)
  assert.match(ADMIN_HTML, /renderMfrProfiles/)
  for (const label of [
    'Control layout',
    'Motor \\/ engine count',
    'Pilot level',
    'Good AUW minimum',
    'Maximum AUW',
    'FPV readiness',
    'Flight-controller readiness',
    'Low-speed behavior',
    'Field requirement',
  ]) assert.match(ADMIN_HTML, new RegExp(label))
  assert.match(ADMIN_HTML, /Manufacturer text/)
  assert.match(ADMIN_HTML, /Unknown \/ needs input/)
  assert.match(ADMIN_HTML, /data-mp-save/)
  assert.match(ADMIN_HTML, /mfrProductId:\+r\.mfr_product_id,overrides:over/)
  assert.match(ADMIN_HTML, /\/img\/mfr\/'?\+r\.mfr_product_id\+'?\/'?\+i/)
  assert.match(ADMIN_HTML, /Shared mapping:/)
  assert.match(ADMIN_HTML, /Mapping changed:/)
})

// ---------------------------------------------------------------- public
test('category grid renders (SSR), stylesheet served', async () => {
  const res = await get('/wings/')
  assert.equal(res.status, 200)
  assert.match(await res.text(), /shop-h1/)
  const css = await get('/catalog.css')
  assert.equal(css.status, 200)
  assert.match(css.headers.get('content-type'), /text\/css/)
})

test('unknown master slug → 404 with grid body', async () => {
  const res = await get('/wings/no-such-model-xyz/')
  assert.equal(res.status, 404)
})

test('homepage and other site routes untouched by catalog router', async () => {
  assert.equal((await get('/')).status, 200)
  assert.equal((await get('/videos.json')).status, 200)
})

// ------------------------------------------------------------------ auth
test('admin + api are Basic-auth gated; wrong creds 401 with challenge', async () => {
  for (const p of ['/admin', '/api/review']) {
    const bare = await get(p)
    assert.equal(bare.status, 401, p)
    assert.match(bare.headers.get('www-authenticate') ?? '', /Basic/, p)
    const wrong = await get(p, { authorization: 'Basic ' + Buffer.from('admin:nope').toString('base64') })
    assert.equal(wrong.status, 401, p)
  }
  const ok = await get('/admin', { authorization: AUTH })
  assert.equal(ok.status, 200)
})

test('authenticated admin mutations reject cross-site and non-JSON requests', async () => {
  const crossSite = await fetch(BASE + '/api/mfr-profile', {
    method: 'POST',
    headers: {
      authorization: AUTH,
      'content-type': 'application/json',
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    },
    body: '{}',
  })
  assert.equal(crossSite.status, 403)
  const simple = await fetch(BASE + '/api/mfr-profile', {
    method: 'POST',
    headers: { authorization: AUTH, 'content-type': 'text/plain' },
    body: '{}',
  })
  assert.equal(simple.status, 415)
})

// -------------------------------------------------------------- img proxy
test('img proxy: bad path 400, unknown id 404', async () => {
  assert.equal((await get('/img/whatever')).status, 400)
  assert.equal((await get('/img/sku/999999')).status, 404)
  assert.equal((await get('/img/mfr/999999')).status, 401, 'manufacturer review images stay admin-only')
  assert.equal((await get('/img/mfr/999999', { authorization: AUTH })).status, 404)
  assert.equal((await get('/img/mfr/999999/1')).status, 401, 'every gallery image stays admin-only')
  assert.equal((await get('/img/mfr/999999/1', { authorization: AUTH })).status, 404)
  assert.equal((await get('/img/mfr/999999/20', { authorization: AUTH })).status, 400, 'gallery index is bounded to the harvested cap')
})

test('manufacturer images cannot be reused by a shared HTTP cache', () => {
  assert.match(imageCacheHeaders('master')['cache-control'], /^public,/)
  assert.match(imageCacheHeaders('mfr')['cache-control'], /^private,/)
  assert.equal(imageCacheHeaders('mfr').vary, 'authorization')
})

test('image redirects are allowlisted before the redirected request is sent', async () => {
  const calls = []
  const blocked = await fetchWithAllowedRedirects('https://allowed.example/image.jpg', {
    allowed: (host) => host === 'allowed.example',
    fetcher: async (url, init) => {
      calls.push({ url, redirect: init.redirect })
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
    },
  })
  assert.equal(blocked.blocked, true)
  assert.equal(calls.length, 1, 'the disallowed redirect target is never requested')
  assert.equal(calls[0].redirect, 'manual')

  const followedCalls = []
  const followed = await fetchWithAllowedRedirects('https://allowed.example/start', {
    allowed: (host) => host === 'allowed.example' || host === 'cdn.example',
    fetcher: async (url) => {
      followedCalls.push(url)
      return followedCalls.length === 1
        ? new Response(null, { status: 301, headers: { location: 'https://cdn.example/image.jpg' } })
        : new Response('image', { status: 200, headers: { 'content-type': 'image/jpeg' } })
    },
  })
  assert.equal(followed.response.status, 200)
  assert.deepEqual(followedCalls, [
    'https://allowed.example/start',
    'https://cdn.example/image.jpg',
  ])
})

test('manufacturer admin payload carries comparison and selected-candidate details', async () => {
  const { status, body } = await api('mfr-matches?status=pending')
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.matches))
  for (const row of body.matches.slice(0, 10)) {
    assert.ok('model_image' in row)
    assert.ok('model_configs' in row)
    assert.ok(Array.isArray(row.candidates))
    for (const candidate of row.candidates) {
      assert.ok('ext_id' in candidate)
      assert.ok('body_preview' in candidate)
      assert.ok(Array.isArray(candidate.config_types))
      assert.ok(candidate.config_agree === null || candidate.config_agree === 0 || candidate.config_agree === 1)
    }
  }
})

test('aircraft-data payload contains only published accepted manufacturer mappings', async () => {
  const { status, body } = await api('mfr-profiles')
  assert.equal(status, 200)
  assert.ok(Array.isArray(body.profiles))
  assert.ok(Array.isArray(body.fields))
  assert.equal(body.count, body.profiles.length)
  for (const row of body.profiles) {
    assert.equal(row.model_status, 'ready')
    assert.equal(row.match_status, 'accepted')
    assert.ok(Number.isInteger(row.master_model_id) && row.master_model_id > 0)
    assert.ok(Number.isInteger(row.mfr_product_id) && row.mfr_product_id > 0)
    assert.equal(typeof row.suggestions, 'object')
    assert.equal(typeof row.evidence, 'object')
    assert.equal(typeof row.overrides, 'object')
    assert.equal(typeof row.values, 'object')
    assert.ok(Array.isArray(row.images))
    for (const image of row.images)
      assert.match(image.url, /^\/img\/mfr\/\d+\/(?:[0-9]|1[0-9])$/)
  }
})

test('aircraft-data save rejects invalid and stale requests without writing', async () => {
  assert.equal((await api('mfr-profile', {})).status, 400)
  const profiles = (await api('mfr-profiles')).body.profiles
  if (!profiles.length) return
  const row = profiles[0]
  assert.equal((await api('mfr-profile', {
    masterId: row.master_model_id,
    mfrProductId: row.mfr_product_id,
    overrides: {},
  })).status, 400)
  assert.equal((await api('mfr-profile', {
    masterId: row.master_model_id,
    mfrProductId: row.mfr_product_id,
    overrides: { notARealField: 'x' },
  })).status, 400)
  assert.equal((await api('mfr-profile', {
    masterId: row.master_model_id,
    mfrProductId: row.mfr_product_id + 1,
    overrides: { channels: 4 },
  })).status, 409)
})

// ---------------------------------------------------------------- review
test('review payload shape: counts, skus with guess + score + suggestions', async () => {
  const { status, body } = await api('review?stock=all')
  assert.equal(status, 200)
  assert.equal(typeof body.counts, 'object')
  assert.ok(Array.isArray(body.skus))
  for (const k of body.skus.slice(0, 10)) {
    assert.ok(k.url_canonical && k.source_id)
    assert.ok(k.guess && typeof k.guess.slug === 'string')
    assert.equal(typeof k.score, 'number')
    assert.ok(Array.isArray(k.suggestions))
  }
})

test('popularity admin reports consumer-visible score coverage', async () => {
  const { status, body } = await api('catalog?sort=pop&page=1')
  assert.equal(status, 200)
  assert.equal(typeof body.popCoverage, 'object')
  const coverage = body.popCoverage
  for (const key of ['total', 'scored', 'nonzero', 'zero', 'unscored'])
    assert.equal(typeof coverage[key], 'number', key)
  assert.equal(coverage.scored + coverage.unscored, coverage.total)
  assert.equal(coverage.nonzero + coverage.zero, coverage.scored)
})

test('strict stock filter: default review view only shows in_stock=1', async () => {
  const { body } = await api('review')
  for (const k of body.skus) assert.equal(k.in_stock, 1, `${k.id} not verified in-stock in default view`)
})

// ---------------------------------------------------------------- guards
test('decide guards: unknown sku 404, unknown action 400, bad approve 400', async () => {
  assert.equal((await api('decide', { skuId: 999999, action: 'reject' })).status, 404)
  const any = (await api('review?stock=all')).body.skus[0]
  if (!any) return
  assert.equal((await api('decide', { skuId: any.id, action: 'frobnicate' })).status, 400)
  const bad = await api('decide', { skuId: any.id, action: 'approve', master: { brand: '', name: '', slug: 'BAD SLUG' } })
  assert.equal(bad.status, 400)
})

test('sources add: invalid URL 400; broken root rejected at add-time', async () => {
  assert.equal((await api('sources', { url: 'not a url', categories: ['wings'] })).status, 400)
  const dead = await api('sources', { url: 'https://example.com/definitely-not-a-shop/', categories: ['wings'] })
  assert.equal(dead.status, 400, 'dry-run must reject a URL with no products')
})

test('system settings: only known pause flags accepted', async () => {
  assert.equal((await api('system', { k: 'evil_key', v: '1' })).status, 400)
})

// ------------------------------------------------- lifecycle (opt-in, local)
test('lifecycle: approve→draft→publish-gate→ready→public→unapprove', { skip: !MUTATE && 'set CATALOG_TEST_MUTATE=1' }, async () => {
  // Unique per run: a retired master from a previous run still owns its
  // brand+name / slug uniqueness, so a fixed name 409s on the second run.
  const RUN = Date.now().toString(36)
  const SLUG = `zz-suite-master-${RUN}`
  const q = (await api('review?stock=all')).body
  const cand = q.skus.find((k) => k.score <= 0) ?? q.skus[0]
  assert.ok(cand, 'need a sku to play with')

  // approve → creates DRAFT master + offer atomically
  const ap = await api('decide', { skuId: cand.id, action: 'approve', config: 'kit', master: { brand: 'ZTEST', name: 'Suite Master '+RUN, slug: SLUG, specs: {} } })
  assert.equal(ap.status, 200)

  // draft is NOT public
  const grid1 = await (await get('/wings/')).text()
  assert.doesNotMatch(grid1, new RegExp(SLUG))

  // publish without required specs must refuse
  const m = (await api('catalog')).body.masters.find((x) => x.slug === SLUG)
  const refuse = await api('master', { id: m.id, status: 'ready' })
  assert.equal(refuse.status, 400)
  assert.match(refuse.body.error, /spanMM/)

  // fill specs → publish → public page live
  assert.equal((await api('master', { id: m.id, specs: JSON.stringify({ spanMM: 999 }), status: 'ready' })).status, 200)
  assert.equal((await get(`/wings/${SLUG}/`)).status, 200)

  // duplicate slug approve → 409
  const other = q.skus.find((k) => k.id !== cand.id)
  if (other) {
    const dup = await api('decide', { skuId: other.id, action: 'approve', master: { brand: 'ZTEST', name: 'Suite Master '+RUN, slug: SLUG } })
    assert.equal(dup.status, 409)
  }

  // unapprove → offer gone → master has no offers → grid empty of it
  assert.equal((await api('decide', { skuId: cand.id, action: 'unapprove' })).status, 200)
  const grid2 = await (await get('/wings/')).text()
  assert.doesNotMatch(grid2, new RegExp(SLUG), 'master without offers must not render in grid')

  // cleanup: retire the test master
  await api('master', { id: m.id, status: 'retired' })

  // reject + restore round trip
  assert.equal((await api('decide', { skuId: cand.id, action: 'reject', reason: 'junk' })).status, 200)
  assert.equal((await api('decide', { skuId: cand.id, action: 'restore' })).status, 200)
})
