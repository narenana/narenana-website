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
test('manufacturer physical overrides and explicit clears override harvested facts',()=>{
 const row={match_status:'accepted',url:'https://manufacturer.example/wing',title:'Wing',body_text:'Minimum 4 channels.',overrides_json:JSON.stringify({channels:6,motorCount:null})};
 assert.equal(manufacturerReference(row).properties.find(p=>p.name==='Minimum channels')?.value,6);
 const cleared=manufacturerReference({...row,overrides_json:JSON.stringify({channels:null})});
 assert.ok(!cleared.properties.some(p=>p.name==='Minimum channels'));
});
