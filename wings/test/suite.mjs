// narenana Wings — end-to-end test suite (public pages + admin API + lifecycle).
//
//   npm run wings:test                       read-only checks
//   WINGS_TEST_MUTATE=1 npm run wings:test   + mutation lifecycle (approve/
//                                              unapprove/reject/restore round
//                                              trips; leaves state as it found it)
//
// Env:
//   WINGS_BASE   target (default http://127.0.0.1:8787) — point at a preview
//                deploy to test prod-like; do NOT run mutations against the
//                real production admin unless you mean it.
//   WINGS_TOKEN  admin token (default devtoken — the .dev.vars value)
//
// Uses node's built-in test runner: zero dependencies.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.WINGS_BASE ?? 'http://127.0.0.1:8787'
const TOKEN = process.env.WINGS_TOKEN ?? 'devtoken'
const MUTATE = process.env.WINGS_TEST_MUTATE === '1'

const get = (p, headers = {}) => fetch(BASE + p, { headers, redirect: 'manual' })
const auth = { authorization: `Bearer ${TOKEN}` }
const api = async (p, opts = {}) => {
  const res = await fetch(BASE + '/wings/api/' + p, {
    ...opts,
    headers: { 'content-type': 'application/json', ...auth, ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { status: res.status, body }
}

// ---------------------------------------------------------------- public pages
test('shop index renders server-side with product grid', async () => {
  const res = await get('/wings/')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/html/)
  const html = await res.text()
  assert.match(html, /class="shop-h1"/, 'shop header present')
  assert.match(html, /class="prod"/, 'at least one product card')
  assert.match(html, /id="sort"/, 'sort control present')
})

test('every out-of-stock card says "was", never "from" (price honesty)', async () => {
  const html = await (await get('/wings/')).text()
  const cards = html.split('<li class="prod').slice(1)
  for (const card of cards) {
    if (/data-stock="0"/.test(card)) {
      assert.doesNotMatch(card, /price-pre">from</, 'OOS card must not advertise a "from" price')
    }
  }
})

test('kit page renders with Product JSON-LD; unknown slug is 404', async () => {
  const { body } = await api('candidates')
  const liveCount = body.counts.live
  assert.ok(liveCount > 0, 'catalogue has live kits')
  // find a live slug via the index page links
  const html = await (await get('/wings/')).text()
  const m = html.match(/href="\/wings\/([a-z0-9-]+)\/"/)
  assert.ok(m, 'index links to a kit page')
  const page = await get(`/wings/${m[1]}/`)
  assert.equal(page.status, 200)
  const kitHtml = await page.text()
  assert.match(kitHtml, /application\/ld\+json/, 'kit page carries JSON-LD')
  const missing = await get('/wings/definitely-not-a-real-slug/')
  assert.equal(missing.status, 404, 'unknown slug returns 404 (with index body)')
})

test('stylesheet served with correct content-type', async () => {
  const res = await get('/wings/wings.css')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/css/)
})

// ---------------------------------------------------------------------- auth
test('admin APIs are token-gated: no token and wrong token both 401', async () => {
  for (const headers of [{}, { authorization: 'Bearer wrong-token' }]) {
    const res = await fetch(BASE + '/wings/api/candidates', { headers })
    assert.equal(res.status, 401)
  }
})

test('admin panel HTML itself is public (gate is client-side; APIs are the wall)', async () => {
  const res = await get('/wings/admin')
  assert.equal(res.status, 200)
})

// --------------------------------------------------------------- image proxy
test('image proxy refuses non-seller hosts (no open proxy)', async () => {
  const res = await get('/wings/api/img?img=' + encodeURIComponent('https://example.com/x.jpg'))
  assert.equal(res.status, 403)
})

test('image proxy serves a live kit image (or 404 if none resolvable)', async () => {
  const html = await (await get('/wings/')).text()
  const m = html.match(/src="\/wings\/img\/([a-z0-9-]+)"/)
  if (!m) return // no image-bearing kits; nothing to assert
  const res = await get(`/wings/img/${m[1]}`)
  assert.ok([200, 404, 502].includes(res.status), `proxy answered ${res.status}`)
  if (res.status === 200) assert.match(res.headers.get('content-type') ?? '', /image\//)
})

// --------------------------------------------------------- candidates: shape
test('candidates payload: counts, statuses, guesses, interleaving', async () => {
  const { status, body } = await api('candidates')
  assert.equal(status, 200)
  for (const k of ['new', 'accepted', 'rejected', 'likely', 'live']) {
    assert.equal(typeof body.counts[k], 'number', `counts.${k}`)
  }
  assert.ok(Array.isArray(body.candidates))
  for (const c of body.candidates.slice(0, 20)) {
    assert.ok(c.url && c.source, 'candidate has url + source')
    assert.ok(['new', 'accepted', 'rejected'].includes(c.status ?? 'new'))
    assert.ok(c.guess && typeof c.guess.slug === 'string', 'has a slug guess')
  }
  // interleave: with >1 source, the first 12 rows must not be one seller
  const first = body.candidates.slice(0, 12).map((c) => c.source)
  if (new Set(body.candidates.map((c) => c.source)).size > 1) {
    assert.ok(new Set(first).size > 1, 'page 1 mixes sellers')
  }
})

test('strict stock semantics: quote-only is never in stock', async () => {
  const { body } = await api('candidates')
  for (const c of body.candidates) {
    if (c.quoteOnly) assert.notEqual(c.inStock, true, `${c.url} is quoteOnly but inStock`)
  }
})

// ------------------------------------------------------------ decide: guards
test('decide: unknown candidate 404; bad decision 400', async () => {
  assert.equal((await api('decide', { method: 'POST', body: { url: 'https://nope.example/x', decision: 'reject' } })).status, 404)
  const { body } = await api('candidates')
  const any = body.candidates.find((c) => c.status === 'new')
  assert.equal((await api('decide', { method: 'POST', body: { url: any.url, decision: 'frobnicate' } })).status, 400)
})

test('approve validation: slug format, brand/name, span range enforced server-side', async () => {
  const { body } = await api('candidates')
  const c = body.candidates.find((x) => x.status === 'new')
  const cases = [
    [{ decision: 'approve' }, /slug/],
    [{ decision: 'approve', slug: 'ok-slug', brand: '', name: 'X', spanMM: 900 }, /brand/],
    [{ decision: 'approve', slug: 'ok-slug', brand: 'B', name: 'N', spanMM: 5 }, /spanMM/],
    [{ decision: 'approve', slug: 'BAD SLUG!', brand: 'B', name: 'N', spanMM: 900 }, /slug/],
  ]
  for (const [extra, want] of cases) {
    const r = await api('decide', { method: 'POST', body: { url: c.url, ...extra } })
    assert.equal(r.status, 400, JSON.stringify(extra))
    assert.match(r.body.error, want)
  }
})

// ------------------------------------------------- mutation lifecycle (opt-in)
test('lifecycle: approve → live page → un-approve → gone; reject → restore', { skip: !MUTATE && 'set WINGS_TEST_MUTATE=1' }, async () => {
  const SLUG = 'zz-test-suite-kit'
  const before = (await api('candidates')).body
  // pick a junk candidate so a mid-test crash never leaves a plausible fake live
  const c = before.candidates.find((x) => x.status === 'new' && x.score <= 0)
  assert.ok(c, 'need a junk candidate to play with')

  // approve → live
  const ok = await api('decide', { method: 'POST', body: { url: c.url, decision: 'approve', slug: SLUG, brand: 'TEST', name: 'Suite Kit', spanMM: 999, blurb: 'test artifact — remove me' } })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.live, before.counts.live + 1, 'live count incremented')
  assert.equal((await get(`/wings/${SLUG}/`)).status, 200, 'kit page live immediately')

  // duplicate slug → 409
  const dup = await api('decide', { method: 'POST', body: { url: c.url, decision: 'approve', slug: SLUG, brand: 'B', name: 'N', spanMM: 900 } })
  assert.equal(dup.status, 409)

  // shows as accepted with liveSlug
  const mid = (await api('candidates')).body
  const acc = mid.candidates.find((x) => x.url === c.url)
  assert.equal(acc.status, 'accepted')
  assert.equal(acc.liveSlug, SLUG)

  // un-approve → gone from live, back to new
  const un = await api('decide', { method: 'POST', body: { url: c.url, decision: 'unapprove' } })
  assert.equal(un.status, 200)
  assert.equal(un.body.live, before.counts.live, 'live count restored')
  assert.equal((await get(`/wings/${SLUG}/`)).status, 404, 'kit page gone')
  assert.equal((await api('candidates')).body.candidates.find((x) => x.url === c.url).status, 'new')

  // reject → rejected → restore → new
  assert.equal((await api('decide', { method: 'POST', body: { url: c.url, decision: 'reject' } })).status, 200)
  assert.equal((await api('candidates')).body.candidates.find((x) => x.url === c.url).status, 'rejected')
  assert.equal((await api('decide', { method: 'POST', body: { url: c.url, decision: 'restore' } })).status, 200)
  const after = (await api('candidates')).body
  assert.equal(after.candidates.find((x) => x.url === c.url).status, 'new')
  assert.deepEqual(after.counts, before.counts, 'all counts exactly as we found them')
})
