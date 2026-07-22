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
import { renderGridNext } from '../lib/grid-next.mjs'
import { ADMIN_HTML } from '../lib/admin-ui.mjs'

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
  const base = { power: 'electric', roles: [], sizes: [], cond: 'all', sort: 'price-desc', counts: cnt }
  const out = renderGridNext(cat, rows, base)
  assert.ok(out.includes('class="prods" id="fx-grid"'), 'reuses the live .prods grid class')
  assert.ok(!out.includes('class="filt"'), 'does NOT emit the live power-filter markup')
  assert.ok(!out.includes('name="robots" content="noindex"'), 'default grid must be indexable (not noindex)')
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

// The admin SPA is a huge inline <script> inside a backtick template. A stray
// escaping bug there (e.g. \' vs \\' inside a single-quoted string) is a syntax
// error the browser hits at parse time — the whole panel dies, silently, and
// node --check / SSR tests never see it. Parse every embedded script here.
test('admin client script parses (no embedded-JS syntax errors)', () => {
  const scripts = [...ADMIN_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.ok(scripts.length, 'ADMIN_HTML must contain an inline <script>')
  for (const s of scripts) assert.doesNotThrow(() => new Function(s), 'inline admin script must parse')
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

// -------------------------------------------------------------- img proxy
test('img proxy: bad path 400, unknown id 404', async () => {
  assert.equal((await get('/img/whatever')).status, 400)
  assert.equal((await get('/img/sku/999999')).status, 404)
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
