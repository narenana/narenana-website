import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { comparableOfferSchema, comparableOffers, renderMaster } from '../lib/public.mjs'
import { manufacturerReference, productOverview } from '../lib/product-overview.mjs'

const offer = (changes = {}) => ({ price_inr: 1000, in_stock: 1, config: 'KIT', pack_qty: 1, title: 'Test wing', url_canonical: 'https://seller.example/wing', source_name: 'Seller', ...changes })
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
test('homepage edge cache: healthy renders cached, degraded renders not', async () => {
  const { default: worker } = await import('../../src/index.js')
  const puts = []
  const saved = { caches: globalThis.caches, HTMLRewriter: globalThis.HTMLRewriter }
  globalThis.caches = { default: { match: async () => undefined, put: async (k) => { puts.push(k.url) } } }
  globalThis.HTMLRewriter = class { on() { return this } transform(r) { return r } }
  const html = () => new Response('<html><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } })
  const db = (fail) => ({
    prepare: () => { if (fail) throw new Error('D1 down'); return { bind() { return this }, all: async () => ({ results: [{ id: 'wings', path_prefix: '/wings' }] }) } },
    batch: async () => [{ results: [{ n: 3 }] }, { results: [{ id: 1, slug: 'a', brand: 'B', name: 'N', specs: '{}', hero: 'x', price: 100, checked_at: 1 }] }],
  })
  const run = async (env) => {
    const waits = []
    const r = await worker.fetch(new Request('https://www.narenana.com/'), { ASSETS: { fetch: async () => html() }, ...env }, { waitUntil: (p) => waits.push(p) })
    await Promise.all(waits)
    return r
  }
  try {
    await run({ VIDEOS_KV: { get: async () => JSON.stringify({ videos: [{ id: 'abc', title: 't' }] }) }, CATALOG_DB: db(false) })
    assert.equal(puts.length, 1, 'healthy render is cached')
    await run({ VIDEOS_KV: { get: async () => { throw new Error('KV down') } }, CATALOG_DB: db(false) })
    await run({ VIDEOS_KV: { get: async () => null }, CATALOG_DB: db(true) })
    assert.equal(puts.length, 1, 'KV or D1 failure renders are not cached')
    assert.ok(puts[0].includes('__release='), 'cache key carries the release tag')
  } finally {
    globalThis.caches = saved.caches
    globalThis.HTMLRewriter = saved.HTMLRewriter
  }
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

  // Only live listing is flagged: in stock, price under review, no Product.
  let html = page([offer({ flagged: 'price_jump', price_inr: 2599 })])
  assert.ok(html.includes('price under review') && !html.includes('last seen'), 'flagged-only in-stock model says price under review')
  assert.equal(product(html), null, 'no Product without a publishable offer')

  // Flagged live listing + older unflagged out-of-stock listing (the
  // fms-cessna-182 case): must not claim OutOfStock or show "last seen".
  html = page([offer({ flagged: 'price_jump', price_inr: 28765 }), offer({ in_stock: 0, price_inr: 33010 })])
  assert.ok(html.includes('price under review') && !html.includes('last seen'), 'in-stock model is never shown as last seen')
  assert.equal(product(html), null, 'no OutOfStock Product for an in-stock model')

  // Every listing gone: no Product with an empty offers field.
  assert.equal(product(page([offer({ dead: 1 })])), null, 'no empty Product when all listings are dead')

  // Genuinely out of stock (unflagged): Product kept, OutOfStock, last seen.
  html = page([offer({ in_stock: 0, price_inr: 9499 })])
  assert.ok(html.includes('last seen'), 'out-of-stock model shows last seen')
  assert.deepEqual(availability(product(html)), ['schema.org/OutOfStock'], 'out-of-stock Product keeps OutOfStock availability')

  // Normal in-stock: Product with InStock price; a flagged sibling price never leaks.
  html = page([offer({ price_inr: 2599 }), offer({ flagged: 'price_jump', price_inr: 999 })])
  assert.ok(html.includes('from</span> ₹2,599'), 'headline uses the unflagged live price')
  assert.ok(!html.includes('999</'), 'flagged price is not published')
  assert.deepEqual([...new Set(availability(product(html)))], ['schema.org/InStock'])
})

test('manufacturer physical overrides and explicit clears override harvested facts',()=>{
 const row={match_status:'accepted',url:'https://manufacturer.example/wing',title:'Wing',body_text:'Minimum 4 channels.',overrides_json:JSON.stringify({channels:6,motorCount:null})};
 assert.equal(manufacturerReference(row).properties.find(p=>p.name==='Minimum channels')?.value,6);
 const cleared=manufacturerReference({...row,overrides_json:JSON.stringify({channels:null})});
 assert.ok(!cleared.properties.some(p=>p.name==='Minimum channels'));
});
