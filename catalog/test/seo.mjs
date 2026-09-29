import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { comparableOfferSchema, comparableOffers, renderMaster } from '../lib/public.mjs'
import { manufacturerReference, productOverview } from '../lib/product-overview.mjs'

const offer = (changes = {}) => ({ price_inr: 1000, in_stock: 1, config: 'KIT', pack_qty: 1, title: 'Test wing', url_canonical: 'https://seller.example/wing', source_name: 'Seller', ...changes })
// The one category the Worker unit tests below serve (worker.mjs caches the
// category list per isolate, so every test here must hand it the same rows).
const CAT = { id: 'wings', path_prefix: '/wings', live: 1, name: 'RC planes', spec_schema: '[]' }
test('manufacturer facts require accepted identity and never publish inferred handling claims', () => {
  const row={match_status:'accepted',url:'https://manufacturer.example/model',title:'Test model',span_mm:1000,body_text:'Minimum 4 channels. Ideal for beginners and gentle stalls.'}
  assert.equal(manufacturerReference({...row,match_status:'pending'}),null)
  const reference=manufacturerReference(row)
  assert.ok(reference.properties.some(p=>p.name==='Wingspan'&&p.value===1000))
  assert.ok(!reference.properties.some(p=>/stall|difficulty|speed/i.test(p.name)))
  assert.equal(manufacturerReference({...row,url:'javascript:alert(1)'}),null)
  assert.match(productOverview({brand:'Brand',name:'Wing',specs:'{"spanMM":1000}'},[offer()]),/1,000 mm wingspan/)
})
test('offer prices exclude suspicious listings and different configurations, packs and conditions', () => {
  const schema = comparableOfferSchema([offer(), offer({ price_inr: 1200 }), offer({ price_inr: 100, flagged: 'price_jump' }), offer({ price_inr: 50, dead: 1 }), offer({ price_inr: null }), offer({ price_inr: 5000, config: 'PNP' }), offer({ price_inr: 2000, pack_qty: 2 }), offer({ price_inr: 900, title: 'Pre-owned Test wing' })])
  assert.equal(schema['@type'], 'AggregateOffer')
  assert.equal(schema.lowPrice, 1000)
  assert.equal(schema.highPrice, 1200)
  assert.equal(schema.offerCount, 2)
  assert.equal(schema.offers.length, 2)
})
// SEO rec 5: 'kit' is detectConfig's fallback, so a stored kit shows as what
// the listing says (RTF here) or 'Configuration not stated', never a false kit.
test('product pages label a listing with the configuration it states', () => {
  const cat = { name: 'RC planes', path_prefix: '/wings', spec_schema: '[]' }
  const m = { id: 9, brand: 'Volantex', name: 'Ranger 600', slug: 'ranger-600', specs: '{}', power: 'electric', role_tags: '["Trainer"]' }
  const ld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'].find((n) => n['@type'] === 'Product').offers
  let html = renderMaster(cat, m, [offer({ config: 'kit', price_inr: 13500, title: 'Volantex RC Ranger 600 | Ready-to-Fly Glider Plane' })])
  assert.match(html, /<p class="price-context">RTF · 1 unit\(s\) · New<\/p>/)
  assert.equal(ld(html).name, 'RTF · 1 unit(s)')
  assert.match(html, /<td>RTF<\/td>/)
  html = renderMaster(cat, m, [offer({ config: 'kit', title: 'VT-Simple Trainer' })])
  assert.match(html, /<p class="price-context">Configuration not stated · /)
  assert.equal(ld(html).name, 'Configuration not stated · 1 unit(s)')
  assert.match(html, /<td>Not stated<\/td>/)
  assert.ok(!/Compare kit \(airframe\)/.test(html), 'the lede does not call it a kit either')
  assert.match(renderMaster(cat, m, [offer({ config: 'kit', title: 'Ranger 600 airframe kit' })]), /<p class="price-context">Kit · /)
})
test('unavailable products never advertise an in-stock structured offer', () => {
  assert.equal(comparableOfferSchema([offer({ in_stock: 0 })]).availability, 'https://schema.org/OutOfStock')
  assert.equal(comparableOfferSchema([offer({ price_inr: null })]), null)
  assert.equal(comparableOfferSchema([offer({ config: null }), offer({ config: null, price_inr: 1200 })])['@type'], 'Offer')
})
test('staging router excludes both forwarded applications from indexing', async () => {
  const source = await readFile('latest-router/src/index.js', 'utf8')
  const {default: router} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('preview', {status:200})
  try {
    for (const path of ['/', '/log-viewer/']) {
      const r = await router.fetch(new Request('https://latest.narenana.com' + path), {})
      assert.equal(r.status, 200)
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow')
    }
  } finally { globalThis.fetch = original }
})
// latest-router forwards latest.narenana.com to the main Worker's workers.dev
// host, so THAT is the hostname the main Worker must mark noindex (plus the
// workers.dev mirror itself). www must stay indexable.
test('main Worker: staging and workers.dev hosts are noindex, www is not', async () => {
  const { default: worker } = await import('../../src/index.js')
  const env = { ASSETS: { fetch: async () => new Response('User-agent: *\n', { status: 200, headers: { 'content-type': 'text/plain' } }) } }
  const ctx = { waitUntil() {} }
  for (const host of ['narenana-website.narenana.workers.dev', 'latest.narenana.com']) {
    const r = await worker.fetch(new Request(`https://${host}/robots.txt`), env, ctx)
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', host + ' must be noindex')
  }
  const www = await worker.fetch(new Request('https://www.narenana.com/robots.txt'), env, ctx)
  assert.ok(!www.headers.get('x-robots-tag')?.includes('noindex'), 'www stays indexable')
})

// The homepage is edge-cached, but a render that fell back because KV or D1
// failed must never be cached (it would pin a page with no prices/videos).
test('homepage edge cache: healthy renders cached, degraded renders not, HEAD shares the entry', async () => {
  const { default: worker } = await import('../../src/index.js')
  const puts = []
  const store = new Map()
  const saved = { caches: globalThis.caches, HTMLRewriter: globalThis.HTMLRewriter }
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { puts.push(k.url); store.set(k.url, r) } } }
  globalThis.HTMLRewriter = class { on() { return this } transform(r) { return r } }
  const assetCalls = []
  const html = (req) => { assetCalls.push(req.method); return new Response('<html><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } }) }
  const db = (fail) => ({
    prepare: () => { if (fail) throw new Error('D1 down'); return { bind() { return this }, all: async () => ({ results: [CAT] }) } },
    batch: async () => [{ results: [{ n: 3 }] }, { results: [{ id: 1, slug: 'a', brand: 'B', name: 'N', specs: '{}', hero: 'x', price: 100, checked_at: 1 }] }],
  })
  const run = async (env, path = '/', method = 'GET') => {
    const waits = []
    const r = await worker.fetch(new Request('https://www.narenana.com' + path, { method }), { ASSETS: { fetch: async (req) => html(req) }, CF_VERSION_METADATA: { id: 'v1' }, ...env }, { waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    return r
  }
  const healthy = { VIDEOS_KV: { get: async () => JSON.stringify({ videos: [{ id: 'abc', title: 't' }] }) }, CATALOG_DB: db(false) }
  try {
    await run(healthy)
    assert.equal(puts.length, 1, 'healthy render is cached')
    store.clear()
    await run({ VIDEOS_KV: { get: async () => { throw new Error('KV down') } }, CATALOG_DB: db(false) })
    await run({ VIDEOS_KV: { get: async () => null }, CATALOG_DB: db(true) })
    assert.equal(puts.length, 1, 'KV or D1 failure renders are not cached')
    assert.ok(puts[0].includes('__release=') && puts[0].includes('.v1'), 'cache key carries the release tag and the deployed version')
    await run(healthy, '/?fbclid=abc&utm_source=x')
    assert.equal(puts[1], puts[0], 'query strings share one cache key (no cache-busting via random params)')

    // HEAD (uptime monitors): served from the GET entry with no body and no render.
    const renders = assetCalls.length
    let r = await run(healthy, '/', 'HEAD')
    assert.equal(r.status, 200)
    assert.equal(await r.text(), '', 'HEAD has no body')
    assert.equal(assetCalls.length, renders, 'HEAD on a cached homepage does not render')
    // HEAD on a miss renders the GET once and caches it for everyone.
    store.clear()
    r = await run(healthy, '/', 'HEAD')
    assert.equal(await r.text(), '')
    assert.deepEqual(assetCalls.slice(renders), ['GET'], 'a HEAD miss renders the page as GET, once')
    assert.equal(puts.at(-1), puts[0], 'and stores it under the GET key')
    await run(healthy)
    assert.equal(assetCalls.length, renders + 1, 'the following GET is a cache hit')

    // A new deploy never reads the previous deploy's entry.
    await run({ ...healthy, CF_VERSION_METADATA: { id: 'v2' } })
    assert.notEqual(puts.at(-1), puts[0], 'each deployed version has its own homepage key')
  } finally {
    globalThis.caches = saved.caches
    globalThis.HTMLRewriter = saved.HTMLRewriter
  }
})

// Catalog pages: page parameters are the whole key (tracking/junk parameters
// and a hand-made __release can't split or select entries), HEAD shares the GET
// entry, and every unknown slug shares ONE 404 entry, so junk URLs can't force
// a D1 grid render each.
test('catalog edge cache: page-parameter keys, HEAD, one shared 404, per-deploy keys', async () => {
  const { handleCatalog, publicCacheKey, PUBLIC_CACHE_RELEASE } = await import('../lib/worker.mjs')
  const store = new Map()
  const saved = globalThis.caches
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r) } } }
  let gridQueries = 0
  const env = (id = 'v1') => ({
    CF_VERSION_METADATA: { id },
    CATALOG_DB: { prepare: (sql) => ({ bind() { return this }, first: async () => null,
      all: async () => { if (/GROUP BY m\.id/.test(sql)) gridQueries++; return { results: /FROM category/.test(sql) ? [CAT] : [] } } }) },
  })
  const go = async (path, { method = 'GET', id } = {}) => {
    const url = new URL('https://www.narenana.com' + path)
    const waits = []
    const r = await handleCatalog(new Request(url, { method }), url, env(id), { waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    return r
  }
  try {
    const u = new URL('https://www.narenana.com/wings/?utm_source=x&power=gas&fbclid=1&__release=planted')
    assert.equal(publicCacheKey(u, env()).url, `https://www.narenana.com/wings/?power=gas&__release=${PUBLIC_CACHE_RELEASE}.v1`)
    assert.notEqual(publicCacheKey(u, env('v2')).url, publicCacheKey(u, env()).url, 'each deployed version has its own keys')

    let r = await go('/wings/?power=gas')
    assert.equal(r.status, 200)
    let before = gridQueries
    r = await go('/wings/?fbclid=abc&power=gas&utm_source=x')
    assert.equal(gridQueries, before, 'tracking parameters are served from the same entry')
    r = await go('/wings/?power=gas', { method: 'HEAD' })
    assert.equal(r.status, 200)
    assert.equal(await r.text(), '', 'HEAD has no body')
    assert.equal(gridQueries, before, 'HEAD is served from the GET entry')

    r = await go('/wings/no-such-model/')
    assert.equal(r.status, 404)
    assert.match(await r.text(), /<html/, '404 still renders the real grid page')
    before = gridQueries
    for (const junk of ['/wings/another-junk-slug/', '/wings/wp-login.php/?x=1']) {
      r = await go(junk)
      assert.equal(r.status, 404)
      assert.match(await r.text(), /<html/)
    }
    r = await go('/wings/third-junk/', { method: 'HEAD' })
    assert.equal(r.status, 404)
    assert.equal(gridQueries, before, 'every unknown slug is served from one shared 404 entry')
    assert.equal((await go('/wings/?__entry=not-found')).status, 200, 'the 404 entry is unreachable through a page URL')

    await go('/wings/no-such-model/', { id: 'v2' })
    assert.ok(gridQueries > before, 'a new deploy renders its own 404 entry')
  } finally {
    globalThis.caches = saved
  }
})

// SEO rec 2 (2026-09): electric-X 301s to the all-power X while nitro-X is too
// thin to be its own page. The redirect is edge-cached AS a redirect (never
// replayed as a 200 page), HEAD shares it, the 404 and noindex pages keep their
// own behaviour, and it undoes itself once nitro stock arrives.
test('landing merge: electric-X 301s to X only while nitro-X is thin, cached as a redirect', async () => {
  const { handleCatalog, catalogScheduled } = await import('../lib/worker.mjs')
  const store = new Map()
  const saved = globalThis.caches
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r) } } }
  const model = (id, power, role) => ({ id, slug: `model-${id}`, brand: 'Test', name: `Model ${id}`, power, role_tags: JSON.stringify([role]), specs: '{}', sellers: 1, min_price: 5000, span_mm: 900, new_stock: 1, preowned_stock: 0, any_stock: 1 })
  let rows = [model(1, 'electric', 'Jet / EDF'), model(2, 'electric', 'Jet / EDF'), model(3, 'electric', 'Jet / EDF'), model(4, 'gas', 'Jet / EDF'),
    model(5, 'gas', 'Trainer'), model(6, 'gas', 'Trainer'), model(7, 'electric', 'Airliner')]
  let gridQueries = 0
  const env = (id) => ({
    CF_VERSION_METADATA: { id },
    CATALOG_DB: { prepare: (sql) => ({ bind() { return this }, first: async () => null,
      all: async () => { if (/GROUP BY m\.id/.test(sql)) { gridQueries++; return { results: rows } } return { results: /FROM category/.test(sql) ? [CAT] : [] } } }) },
  })
  const go = async (path, { method = 'GET', id = 'merge-1' } = {}) => {
    const url = new URL('https://www.narenana.com' + path)
    const waits = []
    const r = await handleCatalog(new Request(url, { method }), url, env(id), { waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    return r
  }
  try {
    let r = await go('/wings/electric-jets/?utm_source=x')
    assert.equal(r.status, 301)
    assert.equal(r.headers.get('location'), '/wings/jets/', 'relative Location, no query string carried into a shared entry')
    const before = gridQueries
    r = await go('/wings/electric-jets/')
    assert.equal(r.status, 301, 'the cached entry is replayed as a redirect, not a 200 page')
    assert.equal(r.headers.get('location'), '/wings/jets/')
    assert.equal(r.headers.get('x-cat-status'), null, 'the internal status marker never reaches the client')
    r = await go('/wings/electric-jets/', { method: 'HEAD' })
    assert.equal(r.status, 301)
    assert.equal(await r.text(), '', 'HEAD has no body')
    assert.equal(gridQueries, before, 'repeat GET and HEAD are served from the cache')

    r = await go('/wings/jets/')
    assert.equal(r.status, 200)
    const jets = await r.text()
    assert.ok(!jets.includes('/wings/electric-jets/'), 'the surviving page does not link the folded one')
    assert.match(jets, /href="\/wings\/nitro\/">Nitro \/ Gas <span>1</, 'Nitro tab: the role\'s count, linking /wings/nitro/')
    assert.equal((await go('/wings/nitro-gliders/')).status, 404, 'a landing with no models is a 404, not a redirect')
    r = await go('/wings/airliners/')
    assert.equal(r.status, 200)
    assert.match(await r.text(), /name="robots" content="noindex,follow"/, 'a thin landing serves noindex,follow')
    let xml = await (await go('/sitemap.xml')).text()
    assert.ok(xml.includes('/wings/jets/</loc>') && !xml.includes('/wings/electric-jets/</loc>') && !xml.includes('/wings/airliners/</loc>'))
    // IndexNow's first run submits the same landing set as the sitemap.
    const original = globalThis.fetch
    let submitted = []
    globalThis.fetch = async (u, init) => { submitted = JSON.parse(init.body).urlList; return new Response('', { status: 200 }) }
    try {
      const waits = []
      const db = env('merge-1').CATALOG_DB
      catalogScheduled({ cron: '0 * * * *' }, { CATALOG_DB: { prepare: (sql) => ({ ...db.prepare(sql), run: async () => ({}) }) } }, { waitUntil: (p) => waits.push(p) })
      await Promise.all(waits)
    } finally { globalThis.fetch = original }
    assert.ok(submitted.includes('https://www.narenana.com/wings/jets/'), 'IndexNow submits the surviving landing')
    assert.ok(!submitted.some((u) => /\/wings\/(electric-jets|airliners)\/$/.test(u)), 'and never the redirected or thin one')

    // Two more nitro jets: nitro-jets qualifies, so electric-jets is its own page
    // again (live once the 15-minute entry expires; a new deploy's keys here).
    rows = [...rows, model(8, 'gas', 'Jet / EDF'), model(9, 'gas', 'Jet / EDF')]
    r = await go('/wings/electric-jets/', { id: 'merge-2' })
    assert.equal(r.status, 200)
    assert.ok(!/name="robots" content="noindex/.test(await r.text()), 'electric-jets is indexable again')
    xml = await (await go('/sitemap.xml', { id: 'merge-2' })).text()
    assert.ok(xml.includes('/wings/electric-jets/</loc>') && xml.includes('/wings/nitro-jets/</loc>'))
  } finally {
    globalThis.caches = saved
  }
})

// SEO rec 5 (2026-09): the hub is the electric grid, so /electric/ 301s to it
// (cached as a redirect like the other landing folds) and leaves the sitemap
// and IndexNow; the hub carries its editorial and names the seller count
// worked out from the live, priced listings, never a stored number.
test('hub: /electric/ folds into it, its editorial moves, its seller count is computed', async () => {
  const { handleCatalog, catalogScheduled } = await import('../lib/worker.mjs')
  const store = new Map()
  const saved = globalThis.caches
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r) } } }
  const listing = (s, p, t = 'Wing kit') => ({ s, p, q: 1, c: 'kit', t, u: `https://${s}.example/p`, at: Date.UTC(2026, 8, 28, 10) })
  const model = (id, power, role, offers) => ({ id, slug: `model-${id}`, brand: 'Test', name: `Model ${id}`, power, role_tags: JSON.stringify([role]), specs: '{}', sellers: 1, min_price: 5000, span_mm: 900, new_stock: 1, preowned_stock: 0, any_stock: 1, live_offers: JSON.stringify(offers) })
  const rows = [
    model(1, 'electric', 'Trainer', [listing('a', 1650), listing('b', 1900)]),
    model(2, 'electric', 'Trainer', [listing('c', 7790, 'Cub RTF')]),
    model(3, 'electric', 'Trainer', []),
    model(4, 'gas', 'Trainer', [listing('a', 15500, 'Trainer ARF')]),
  ]
  let gridQueries = 0
  const env = (id) => ({
    CF_VERSION_METADATA: { id },
    CATALOG_DB: { prepare: (sql) => ({ bind(...args) { this.args = args; return this },
      first: async function () { return /FROM landing_page/.test(sql) && this.args?.[0] === 'electric' ? { body: '<p>Electric editorial.</p>' } : null },
      all: async () => { if (/GROUP BY m\.id/.test(sql)) { gridQueries++; return { results: rows } } return { results: /FROM category/.test(sql) ? [CAT] : [] } } }) },
  })
  const go = async (path, { method = 'GET', id = 'hub-1' } = {}) => {
    const url = new URL('https://www.narenana.com' + path)
    const waits = []
    const r = await handleCatalog(new Request(url, { method }), url, env(id), { waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    return r
  }
  try {
    let r = await go('/wings/electric/')
    assert.equal(r.status, 301)
    assert.equal(r.headers.get('location'), '/wings/')
    const before = gridQueries
    r = await go('/wings/electric/')
    assert.equal(r.status, 301, 'replayed from the cache as a redirect')
    assert.equal(r.headers.get('location'), '/wings/')
    assert.equal(gridQueries, before)

    const hub = await (await go('/wings/')).text()
    assert.match(hub, /<title>RC plane prices in India: 3 sellers compared \| narenana<\/title>/, 'sellers a, b, c: counted from the live, priced listings')
    assert.match(hub, /<h1 class="shop-h1">RC plane prices in India<\/h1>/)
    assert.ok(hub.includes('<section class="fx-content"><p>Electric editorial.</p></section>'), 'the /electric/ editorial is on the hub')
    assert.match(hub, /<meta name="description" content="4 RC planes in stock at 3 Indian sellers: electric from ₹1,650, nitro and gas from ₹15,500\. Prices as last checked 28 Sep 2026\."/)
    assert.ok(!hub.includes('/wings/electric/'), 'nothing links the folded page')
    const nitro = await (await go('/wings/nitro/')).text()
    assert.ok(!nitro.includes('/wings/electric/') && /class="fx-seg-b " href="\/wings\/">Electric/.test(nitro), "/nitro/'s Electric tab links the hub")

    const xml = await (await go('/sitemap.xml')).text()
    assert.ok(xml.includes('/wings/</loc>') && !xml.includes('/wings/electric/</loc>'))
    const original = globalThis.fetch
    let submitted = []
    globalThis.fetch = async (u, init) => { submitted = JSON.parse(init.body).urlList; return new Response('', { status: 200 }) }
    try {
      const waits = []
      const db = env('hub-1').CATALOG_DB
      catalogScheduled({ cron: '0 * * * *' }, { CATALOG_DB: { prepare: (sql) => ({ ...db.prepare(sql), run: async () => ({}) }) } }, { waitUntil: (p) => waits.push(p) })
      await Promise.all(waits)
    } finally { globalThis.fetch = original }
    assert.ok(submitted.includes('https://www.narenana.com/wings/') && !submitted.includes('https://www.narenana.com/wings/electric/'), 'IndexNow never submits the folded page')
  } finally {
    globalThis.caches = saved
  }
})

test('sitemap preserves editorial dates in the Worker and static fallback', async () => {
  const { handleCatalog } = await import('../lib/worker.mjs')
  const editedAt = Date.UTC(2026, 8, 20, 12)
  const env = { CATALOG_DB: { prepare: (sql) => ({
    bind() { return this },
    all: async () => ({ results: /FROM category/.test(sql) ? [CAT] : [
      { slug: 'available-wing', any_stock: 1, updated_at: editedAt },
      { slug: 'sold-out-wing', any_stock: 0, updated_at: editedAt },
    ] }),
  }) } }
  const url = new URL('http://localhost/sitemap.xml')
  const response = await handleCatalog(new Request(url), url, env, { waitUntil() {} })
  assert.equal(response.status, 200)
  const xml = await response.text()
  const entries = (text) => new Map([...text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, entry]) => [
    /<loc>(.*?)<\/loc>/.exec(entry)[1], /<lastmod>(.*?)<\/lastmod>/.exec(entry)?.[1],
  ]))
  const live = entries(xml)
  const fallback = entries(await readFile('site/sitemap.xml', 'utf8'))
  for (const [loc, date] of fallback) {
    assert.ok(live.has(loc), `${loc} must survive the Worker route`)
    assert.equal(live.get(loc), date, `${loc} has the same editorial date`)
  }
  assert.match(live.get('https://www.narenana.com/'), /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(live.get('https://www.narenana.com/') <= new Date().toISOString().slice(0, 10))
  assert.equal(live.get('https://www.narenana.com/wings/available-wing/'), '2026-09-20')
  assert.ok(!live.has('https://www.narenana.com/wings/sold-out-wing/'))
})

const base = process.env.CATALOG_BASE || 'http://localhost:8787'
const pages = ['/', '/videos/nanawing-giz-fpv-review/', '/videos/log-viewer-walkthrough/', '/catalog-methodology/']
for (const path of pages) test(`indexable HTML and valid metadata: ${path}`, async () => {
  const response = await fetch(base + path)
  assert.equal(response.status, 200)
  assert.ok(!response.headers.get('x-robots-tag')?.includes('noindex'))
  const html = await response.text()
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.ok(html.includes(`href="https://www.narenana.com${path}"`))
  assert.match(html, /<meta name="description" content="[^"]+"/)
  assert.ok(!/<meta[^>]+content="noindex/.test(html))
  const graphs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
  assert.ok(graphs.length)
  if (path.includes('/videos/')) {
    const objects = graphs.flatMap(g => g['@graph'] || [g])
    const video = objects.find(o => o['@type'] === 'VideoObject')
    assert.ok(video?.uploadDate && video?.duration && video?.embedUrl)
    assert.match(html, /<iframe[^>]+youtube/)
  }
})
test('redirect, genuine 404, staging-only preview exclusion and sitemap discovery', async () => {
  const redirect = await fetch(base + '/index.html?source=test', { redirect: 'manual' })
  assert.equal(redirect.status, 301)
  assert.equal(new URL(redirect.headers.get('location'), base).pathname, '/')
  assert.equal(new URL(redirect.headers.get('location'), base).search, '?source=test')
  assert.equal((await fetch(base + '/this-page-does-not-exist-seo-check')).status, 404)
  assert.equal((await fetch(base + '/direction-b/')).status,404)
  const robots = await (await fetch(base + '/robots.txt')).text()
  assert.ok(robots.includes('log-viewer/sitemap.xml') && robots.includes('nanawing2.narenana.com/sitemap.xml'))
  const sitemap = await (await fetch(base + '/sitemap.xml')).text()
  for (const path of pages) assert.ok(sitemap.includes(`https://www.narenana.com${path}</loc>`))
})
test('all inline homepage/watch-page JavaScript parses', async () => {
  for (const path of ['site/index.html', 'site/videos/nanawing-giz-fpv-review/index.html', 'site/videos/log-viewer-walkthrough/index.html']) {
    const html = await readFile(path, 'utf8')
    for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (m[1].includes('ld+json')) JSON.parse(m[2])
      else if (!m[1].includes('src=')) new Function(m[2])
    }
  }
})

test('headline uses the same eligible seed as structured offers', () => {
 const cases = [
  [offer({flagged:'review',price_inr:1}),offer()],
  [offer({price_inr:-1}),offer({price_inr:0}),offer()],
  [offer({price_inr:100,title:'Pre-owned Wing'}),offer()],
  [offer({price_inr:200,pack_qty:2}),offer()],
  [offer({config:null}),offer({config:null,price_inr:1200})],
  [offer({in_stock:0}),offer({dead:1,price_inr:2})],
  [offer({dead:1})],
 ];
 for(const offers of cases){
  const {seed}=comparableOffers(offers),schema=comparableOfferSchema(offers);
  const html=renderMaster({name:'Wings',path_prefix:'/wings',spec_schema:'[]'}, {id:999,brand:'Test',name:'Wing',slug:'test',specs:'{}'},offers);
  if(seed){assert.equal(schema.price??schema.lowPrice,seed.price_inr);assert.ok(html.includes(seed.price_inr.toLocaleString('en-IN')));}
  else assert.equal(schema,null);
  assert.ok(!html.includes('from</span> ₹1</div>'));
 }
});
test('flagged listings: stock is kept, price withheld, never a false or empty Product', () => {
  const page = (offers) => renderMaster({ name: 'Wings', path_prefix: '/wings', spec_schema: '[]' }, { id: 999, brand: 'Test', name: 'Wing', slug: 'test', specs: '{}' }, offers)
  const product = (html) => {
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const graph = [].concat(JSON.parse(m[1])['@graph'] || JSON.parse(m[1]))
      const p = graph.find((n) => n['@type'] === 'Product')
      if (p) return p
    }
    return null
  }
  const availability = (p) => JSON.stringify(p?.offers || {}).match(/schema\.org\/(InStock|OutOfStock)/g) || []
  // A withheld amount must not appear in ANY form: formatted or raw, in the
  // offers table, the headline or the JSON-LD.
  const leaks = (html, n) => html.includes(n.toLocaleString('en-IN')) || html.includes(String(n))

  // Only live listing is flagged: in stock, price under review, no Product.
  let html = page([offer({ flagged: 'price_jump', price_inr: 2599 })])
  assert.ok(html.includes('price under review') && !html.includes('last seen'), 'flagged-only in-stock model says price under review')
  assert.equal(product(html), null, 'no Product without a publishable offer')
  assert.ok(!leaks(html, 2599), 'flagged amount is not published anywhere on the page')
  assert.ok(html.includes('Price under review</span>') && html.includes('In stock</span>'), 'flagged row keeps its stock badge, withholds its price')

  // Flagged live listing + older unflagged out-of-stock listing (the
  // fms-cessna-182 case): must not claim OutOfStock or show "last seen".
  html = page([offer({ flagged: 'price_jump', price_inr: 28765 }), offer({ in_stock: 0, price_inr: 33010 })])
  assert.ok(html.includes('price under review') && !html.includes('last seen'), 'in-stock model is never shown as last seen')
  assert.equal(product(html), null, 'no OutOfStock Product for an in-stock model')
  assert.ok(!leaks(html, 28765), 'flagged amount is not published anywhere on the page')

  // Every listing gone: no Product with an empty offers field.
  assert.equal(product(page([offer({ dead: 1 })])), null, 'no empty Product when all listings are dead')

  // Genuinely out of stock (unflagged): Product kept, OutOfStock, last seen.
  html = page([offer({ in_stock: 0, price_inr: 9499 })])
  assert.ok(html.includes('last seen'), 'out-of-stock model shows last seen')
  assert.deepEqual(availability(product(html)), ['schema.org/OutOfStock'], 'out-of-stock Product keeps OutOfStock availability')

  // Normal in-stock: Product with InStock price; a flagged sibling price never leaks.
  // The flagged sibling is the CHEAPEST row as the query orders it; it must not
  // lead the table either.
  html = page([offer({ flagged: 'price_jump', price_inr: 1733 }), offer({ price_inr: 2599 })])
  assert.ok(html.includes('from</span> ₹2,599'), 'headline uses the unflagged live price')
  assert.ok(!leaks(html, 1733), 'flagged price is not published')
  const tbody = html.slice(html.indexOf('<tbody>'))
  assert.ok(tbody.indexOf('₹2,599') < tbody.indexOf('Price under review'), 'priced rows come before rows under review')
  assert.deepEqual([...new Set(availability(product(html)))], ['schema.org/InStock'])
})

// SEO rec 4 (2026-09): product names and snippets. A brandless model never
// renders a leading space or an empty Brand; the title and description come
// from our own price, stock and check date, and a withheld price never shows.
test('product names and snippets: no empty brand, our own price, stock and date, no withheld amount', async () => {
  const { displayName } = await import('../lib/product-overview.mjs')
  const cat = { name: 'Fixed-wing RC planes', path_prefix: '/wings', spec_schema: '[]' }
  const day = Date.UTC(2026, 8, 28, 9)
  const model = (changes = {}) => ({ id: 7, brand: 'FMS', name: 'Ranger 1220', slug: 'fms-ranger-1220', specs: '{"spanMM":1220}', power: 'electric', role_tags: '["Sport / Park Flyer","Trainer"]', hero_image: 'https://seller.example/wing.jpg', ...changes })
  const sold = (changes = {}) => offer({ last_checked: day, ...changes })
  const head = (html) => ({
    title: html.match(/<title>([^<]*)<\/title>/)[1],
    desc: html.match(/<meta name="description" content="([^"]*)"/)[1].replace(/&amp;/g, '&'),
    h1: html.match(/<h1 class="kit-h">([^<]*)<\/h1>/)[1],
    graph: JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'],
  })
  const product = (h) => h.graph.find((n) => n['@type'] === 'Product')

  assert.equal(displayName({ brand: '', name: 'Sky Surfer' }), 'Sky Surfer')
  assert.equal(displayName({ brand: 'Unbranded', name: 'Sky Surfer V4' }), 'Sky Surfer V4')
  assert.equal(displayName({ brand: ' X-UAV ', name: ' Sky Surfer V3 ' }), 'X-UAV Sky Surfer V3')

  // Brandless: no leading space anywhere, no Brand in the Product.
  for (const brand of ['', 'Unbranded']) {
    const html = renderMaster(cat, model({ brand, name: 'Sky Surfer' }), [sold({ in_stock: 0, price_inr: 13760, source_name: 'havochobby.in' })])
    const h = head(html)
    assert.equal(h.title, 'Sky Surfer price in India | narenana')
    assert.equal(h.h1, 'Sky Surfer')
    assert.ok(html.includes('<img src="/img/master/7" alt="Sky Surfer"'), 'image alt has no leading space')
    assert.equal(product(h).name, 'Sky Surfer')
    assert.ok(!('brand' in product(h)), `no Brand for brand ${JSON.stringify(brand)}`)
    assert.equal(h.desc, 'Sky Surfer, 1220mm electric trainer. Out of stock at the 1 Indian seller we check; last seen at ₹13,760 on 28 Sep 2026.')
    assert.ok(!/\bUnbranded\b/.test(html.slice(html.indexOf('<main'))), 'Unbranded never shows as part of the name')
  }
  assert.equal(product(head(renderMaster(cat, model(), [sold()]))).brand.name, 'FMS', 'a real brand is kept')

  // In stock at 2 sellers, the cheapest of them flagged: its amount is withheld
  // everywhere, the snippet quotes the cheapest publishable price, the title
  // counts the sellers and never shows a ₹ figure.
  let h = head(renderMaster(cat, model(), [
    sold({ flagged: 'price_jump', price_inr: 21733, source_name: 'robosynckits.in' }),
    sold({ price_inr: 28999, source_name: 'robosynckits.in' }),
    sold({ price_inr: 32000, source_name: 'flyingmachines.in' }),
    sold({ price_inr: 25000, dead: 1, source_name: 'gone.example' }),
  ]))
  assert.equal(h.title, 'FMS Ranger 1220 price in India: 2 sellers compared | narenana')
  assert.equal(h.desc, 'FMS Ranger 1220, 1220mm electric trainer. From ₹28,999 at robosynckits.in, in stock when last checked on 28 Sep 2026. In stock at 2 Indian sellers.')
  assert.ok(!h.desc.includes('21,733') && !h.title.includes('₹'))

  // One seller: no count in the title.
  h = head(renderMaster(cat, model(), [sold({ price_inr: 28999, source_name: 'robosynckits.in' })]))
  assert.equal(h.title, 'FMS Ranger 1220 price in India | narenana')
  // A pre-owned unit is the only one on offer: the snippet says so.
  assert.match(head(renderMaster(cat, model(), [sold({ price_inr: 9000, title: 'FMS Ranger 1220 (pre-owned)', source_name: 'a.example' })])).desc, /From ₹9,000 \(pre-owned\) at a\.example, in stock/)

  // Only live listing flagged: in stock, price under review, no amount.
  h = head(renderMaster(cat, model(), [sold({ flagged: 'price_jump', price_inr: 2599, source_name: 'a.example' }), sold({ in_stock: 0, price_inr: 3010, source_name: 'b.example' })]))
  assert.equal(h.desc, 'FMS Ranger 1220, 1220mm electric trainer. In stock at 1 Indian seller when last checked on 28 Sep 2026; price under review.')
  assert.equal(h.title, 'FMS Ranger 1220 price in India | narenana')

  // Every listing gone.
  assert.equal(head(renderMaster(cat, model(), [sold({ dead: 1 })])).desc, 'FMS Ranger 1220, 1220mm electric trainer. No Indian seller we check lists it right now.')
  // Span already in the name is not repeated; nitro models say so.
  assert.match(head(renderMaster(cat, model({ name: 'Sky Surfer V4 1500mm', specs: '{"spanMM":1500}', power: 'gas' }), [sold()])).desc, /^FMS Sky Surfer V4 1500mm, nitro\/gas trainer\. From/)

  // A long seller-title name still fits in 155 characters.
  const long = 'Phoenix 2000 V2: Soar to New Heights with Precision and Performance Glider 2000mm EPO PNP Kit'
  for (const offers of [[sold({ source_name: 'aeromodellingtutor.in' }), sold({ source_name: 'robosynckits.in', price_inr: 1200 })], [sold({ in_stock: 0 })], [sold({ flagged: 'x' })]]) {
    const d = head(renderMaster(cat, model({ brand: 'Volantex RC', name: long }), offers)).desc
    assert.ok(d.length <= 155, `${d.length}: ${d}`)
    assert.ok(d.startsWith('Volantex RC Phoenix 2000 V2'), d)
  }
})

// SEO rec 3 (2026-09): every product page links its role landing through a
// 4-level breadcrumb and a Type row, choosing the role by the fixed priority
// among the STORED tags and linking only valid (indexable) landings.
test('product pages link their role and power landings, valid landings only', async () => {
  const { productLandings, validLandings } = await import('../lib/grid-next.mjs')
  const cat = { name: 'Fixed-wing RC planes', path_prefix: '/wings', spec_schema: '[]' }
  const row = (power, tags) => ({ power, role_tags: JSON.stringify(tags), any_stock: 1 })
  const rows = [...Array(3)].flatMap(() => [row('electric', ['Trainer']), row('gas', ['Trainer']), row('electric', ['Sport / Park Flyer']), row('electric', ['Jet / EDF'])])
  rows.push(row('gas', ['Warbird']), row('electric', ['Airliner']))
  const valid = new Set(validLandings(rows))
  assert.ok(valid.has('trainers') && valid.has('electric-trainers') && valid.has('nitro-trainers') && valid.has('sport-planes') && valid.has('jets') && valid.has('nitro'))
  assert.ok(!valid.has('airliners') && !valid.has('warbirds') && !valid.has('electric-jets'))

  const page = (m) => renderMaster(cat, { id: 1, brand: 'FMS', name: 'Ranger', slug: 'r', specs: '{}', ...m }, [offer()], [], [], null, productLandings(cat, m, valid))
  const crumbs = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'][0].itemListElement
  const hrefs = (html) => [...html.slice(html.indexOf('<main'), html.indexOf('</main>')).matchAll(/href="(\/wings\/[a-z-]+\/)"/g)].map((x) => x[1])

  // Stored order is Sport first; the fixed priority puts Trainer first.
  let html = page({ power: 'electric', role_tags: '["Sport / Park Flyer","Trainer"]' })
  assert.deepEqual(crumbs(html).map((c) => c.name), ['narenana', 'Fixed-wing RC planes in India', 'Trainer RC planes', 'FMS Ranger'])
  assert.equal(crumbs(html)[2].item, 'https://www.narenana.com/wings/trainers/')
  assert.ok(!('item' in crumbs(html)[3]), 'the current page has no item')
  assert.match(html, /<nav class="crumb" aria-label="Breadcrumb"><a href="\/">narenana<\/a> <i>›<\/i> <a href="\/wings\/">Fixed-wing RC planes<\/a> <i>›<\/i> <a href="\/wings\/trainers\/">Trainer RC planes<\/a> <i>›<\/i> <span aria-current="page">FMS Ranger<\/span><\/nav>/)
  assert.match(html, /<dt>Type<\/dt><dd><a href="\/wings\/trainers\/">Trainer<\/a>, <a href="\/wings\/sport-planes\/">Sport &amp; park flyer<\/a><\/dd>/)
  assert.match(html, /<dt>Power<\/dt><dd><a href="\/wings\/electric-trainers\/">Electric<\/a><\/dd>/, 'electric-trainers is valid beside nitro-trainers')
  assert.match(html, /<p class="similar-more"><a href="\/wings\/trainers\/">More trainer RC planes in India →<\/a><\/p>/)

  // A jet with no valid electric-jets: Power stays plain text.
  html = page({ power: 'electric', role_tags: '["Jet / EDF","Airliner"]' })
  assert.equal(crumbs(html)[2].name, 'Jet & EDF RC planes')
  assert.match(html, /<dt>Type<\/dt><dd><a href="\/wings\/jets\/">Jet &amp; EDF<\/a>, Airliner<\/dd>/, 'a thin landing (airliners) is named, not linked')
  assert.match(html, /<dt>Power<\/dt><dd>Electric<\/dd>/)
  assert.match(html, /More jet &amp; EDF RC planes in India →/)

  // A nitro warbird: warbirds is thin, so no role level; Power links /nitro/.
  html = page({ power: 'gas', role_tags: '["Warbird"]' })
  assert.equal(crumbs(html).length, 3, 'no valid role landing: the breadcrumb stops at the category')
  assert.match(html, /<dt>Type<\/dt><dd>Warbird<\/dd>/)
  assert.match(html, /<dt>Power<\/dt><dd><a href="\/wings\/nitro\/">Nitro \/ gas<\/a><\/dd>/)
  assert.ok(!html.includes('similar-more'))
  // A nitro trainer links nitro-trainers.
  assert.match(page({ power: 'gas', role_tags: '["Trainer"]' }), /<dt>Power<\/dt><dd><a href="\/wings\/nitro-trainers\/">Nitro \/ gas<\/a><\/dd>/)
  // Unknown tags ('Other') give no Type row and no role level.
  html = page({ power: 'electric', role_tags: '["Other"]' })
  assert.ok(!html.includes('<dt>Type</dt>') && crumbs(html).length === 3)
  for (const tags of [['Sport / Park Flyer', 'Trainer'], ['Jet / EDF', 'Airliner'], ['Warbird'], ['Other']])
    for (const href of hrefs(page({ power: 'electric', role_tags: JSON.stringify(tags) })))
      assert.ok(href === '/wings/' || valid.has(href.slice(7, -1)), `${href} is a valid landing`)
})

// The product route must not add a catalog-wide query per render: the landing
// set is computed once per cache cycle (per deploy), and the routes that
// compute it anyway (hub, landings, browse, sitemap) refresh it for free.
test('product pages reuse one landing set per cache cycle', async () => {
  const { handleCatalog } = await import('../lib/worker.mjs')
  const store = new Map()
  const saved = globalThis.caches
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r) } } }
  const model = (id, power, role) => ({ id, slug: `model-${id}`, brand: 'Test', name: `Model ${id}`, power, role_tags: JSON.stringify([role]), specs: '{}', sellers: 1, min_price: 5000, span_mm: 900, new_stock: 1, preowned_stock: 0, any_stock: 1, status: 'ready' })
  const rows = [model(1, 'electric', 'Trainer'), model(2, 'electric', 'Trainer'), model(3, 'electric', 'Trainer'), model(4, 'electric', 'Glider / Sailplane')]
  let landingQueries = 0
  const env = (id) => ({
    CF_VERSION_METADATA: { id },
    CATALOG_DB: { prepare: (sql) => ({ bind(...args) { this.args = args; return this },
      first: async function () { return /FROM master_model WHERE category_id=\? AND slug=\?/.test(sql) ? rows.find((r) => r.slug === this.args[1]) ?? null : null },
      all: async () => {
        if (/SELECT COALESCE\(m\.power,'electric'\) AS power, m\.role_tags\s+FROM master_model/.test(sql)) { landingQueries++; return { results: rows } }
        if (/FROM offer o JOIN sku k/.test(sql)) return { results: [offer({ source_name: 'seller.example' })] }
        if (/GROUP BY m\.id/.test(sql)) return { results: rows }
        return { results: /FROM category/.test(sql) ? [CAT] : [] }
      } }) },
  })
  const go = async (path, id) => {
    const url = new URL('https://www.narenana.com' + path)
    const waits = []
    const r = await handleCatalog(new Request(url), url, env(id), { waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    return r
  }
  try {
    let r = await go('/wings/model-1/', 'landing-1')
    assert.equal(r.status, 200)
    const html = await r.text()
    assert.ok(html.includes('<a href="/wings/trainers/">Trainer RC planes</a>'), 'breadcrumb links the valid role landing')
    assert.equal(landingQueries, 1)
    await go('/wings/model-2/', 'landing-1')
    await go('/wings/model-4/', 'landing-1')
    assert.equal(landingQueries, 1, 'later product renders in the same cycle reuse the set')
    const glider = await (await go('/wings/model-4/', 'landing-9')).text()
    assert.equal(landingQueries, 2, 'a new deploy works the set out again')
    assert.ok(!glider.includes('/wings/gliders/'), 'a thin role landing (1 glider) is not linked')
    await go('/wings/', 'landing-2')
    await go('/wings/model-3/', 'landing-2')
    assert.equal(landingQueries, 2, 'the hub render refreshed the set, so the product did not query')
  } finally {
    globalThis.caches = saved
  }
})

test('manufacturer physical overrides and explicit clears override harvested facts',()=>{
 const row={match_status:'accepted',url:'https://manufacturer.example/wing',title:'Wing',body_text:'Minimum 4 channels.',overrides_json:JSON.stringify({channels:6,motorCount:null})};
 assert.equal(manufacturerReference(row).properties.find(p=>p.name==='Minimum channels')?.value,6);
 const cleared=manufacturerReference({...row,overrides_json:JSON.stringify({channels:null})});
 assert.ok(!cleared.properties.some(p=>p.name==='Minimum channels'));
});

// Owner decision (2026-09-25): WhatsApp/Facebook shares of the homepage describe
// narenana.com as a whole (RC sims + RC plane prices), while <title> stays
// Nanawing-first for search. The two are deliberately different; PR #3 "aligned"
// them once by mistake.
test('homepage share tags describe narenana.com as a whole, not one product', async () => {
  const html = await readFile(new URL('../../site/index.html', import.meta.url), 'utf8')
  const meta = (attr, key) => (html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`)) || [])[1]
  const og = meta('property', 'og:title')
  assert.equal(meta('name', 'twitter:title'), og, 'og:title and twitter:title match')
  assert.match(og, /^narenana /, 'the share title leads with the narenana brand')
  assert.match(og, /simulators/i, 'names the simulators')
  assert.match(og, /RC plane prices/i, 'names RC plane buying')
  assert.match(meta('property', 'og:description'), /Indian sellers/, 'description covers buying too')
  assert.equal(meta('property', 'og:image'), 'https://www.narenana.com/og.jpg', 'the umbrella card')
  assert.match((html.match(/<title>([^<]*)<\/title>/) || [])[1], /^Nanawing/, '<title> stays Nanawing-first')
})
