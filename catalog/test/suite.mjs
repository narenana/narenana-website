// Catalog platform test suite.
//   npm run catalog:test                        (read-only + guards)
//   CATALOG_TEST_MUTATE=1 npm run catalog:test  (+ lifecycle round-trips;
//                                                run against LOCAL dev only)
// Env: CATALOG_BASE (default http://127.0.0.1:8787), CATALOG_PASS (devpass)

import { test } from 'node:test'
import assert from 'node:assert/strict'

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
