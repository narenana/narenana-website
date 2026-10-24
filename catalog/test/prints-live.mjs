// The weekly check on the landing pages' 3D prints (src/prints-live.js): its rules as unit tests,
// and, against the local dev server, a retired print really leaving the Chupito page.
// Run: node --test catalog/test/prints-live.mjs (the server part needs `wrangler dev` on :8787).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  KEY, SLICE, FIRST_HOUR, PRINT_PAGES, allPrints, classifyPage, classifyImage, combine,
  sliceFor, record, retiredIds, checkPrintsSlice,
} from '../../src/prints-live.js'

const mw = { id: 'mw-1719772', title: 'TBS Chupito 800 Pan-Tower', href: 'https://makerworld.com/en/models/1719772-tbs-chupito-800-pan-tower', image: 'https://makerworld.bblmw.com/x.jpg' }
const tv = { id: 'tv-7271567', title: 'TBS Chupito camera pod with a lock', href: 'https://www.thingiverse.com/thing:7271567', image: 'https://cdn.thingiverse.com/x.png' }
const page = (title, ogImage, ogUrl = '') => `<html><head><title>${title}</title><meta property="og:image" content="${ogImage}"/>${ogUrl ? `<meta property="og:url" content="${ogUrl}"/>` : ''}</head></html>`

test('prints check: a page is ok, gone or unknown, and only definite signs count as gone', () => {
  assert.equal(classifyPage(mw, 200, page('TBS Chupito 800 Pan-Tower - Free 3D Print Model - MakerWorld', 'https://makerworld.bblmw.com/a.jpg')).state, 'ok')
  assert.equal(classifyPage(tv, 200, page('TBS Chupito camera pod with a lock by DJISilesia - Thingiverse', 'https://cdn.thingiverse.com/a.png')).state, 'ok')
  // A renamed print still counts as there when its page carries its own model number.
  assert.equal(classifyPage(mw, 200, page('Pan tower v2 - MakerWorld', 'https://makerworld.bblmw.com/a.jpg', 'https://makerworld.com/en/models/1719772')).state, 'ok')
  // Thingiverse answers a removed thing with 200 and its generic page: a soft 404.
  assert.equal(classifyPage(tv, 200, page('Thingiverse - The community for Open Hardware', 'https://cdn.thingiverse.com/site/img/ThingiverseOpenGraph.webp')).state, 'gone')
  assert.equal(classifyPage(mw, 404).state, 'gone')
  assert.equal(classifyPage(mw, 410).state, 'gone')
  // Bot checks, refusals, server errors and timeouts prove nothing.
  assert.equal(classifyPage(mw, 403, '<title>Just a moment...</title>').state, 'unknown')
  assert.equal(classifyPage(mw, 200, '<title>Just a moment...</title>').state, 'unknown')
  for (const s of [0, 403, 429, 500, 503]) assert.equal(classifyPage(mw, s).state, 'unknown', `page ${s}`)
  assert.equal(classifyImage(200, 'image/webp').state, 'ok')
  assert.equal(classifyImage(404).state, 'gone')
  assert.equal(classifyImage(200, 'text/html').state, 'unknown', 'a page in place of a picture is not proof')
  for (const s of [0, 403, 500]) assert.equal(classifyImage(s).state, 'unknown')
  assert.equal(combine({ state: 'ok' }, { state: 'gone', reason: 'image 404' }).state, 'gone', 'a missing picture retires the print')
  assert.equal(combine({ state: 'ok' }, { state: 'unknown' }).state, 'unknown')
  assert.equal(combine({ state: 'ok' }, { state: 'ok' }).state, 'ok')
})

test('prints check: weekly slices from Sunday 04:00 UTC cover every print once', () => {
  const prints = allPrints()
  assert.ok(prints.length >= 10 && prints.every((p) => p.id && p.href), 'every print has an id')
  assert.equal(new Set(prints.map((p) => p.id)).size, prints.length, 'ids are unique')
  const sunday = (h) => Date.UTC(2026, 9, 25, h, 0, 0) // 25 Oct 2026 is a Sunday
  assert.deepEqual(sliceFor(Date.UTC(2026, 9, 24, FIRST_HOUR), prints), [], 'not on a Saturday')
  assert.deepEqual(sliceFor(sunday(FIRST_HOUR - 1), prints), [], 'not before the window')
  const seen = []
  for (let h = FIRST_HOUR; h < 24; h++) seen.push(...sliceFor(sunday(h), prints))
  assert.deepEqual(seen.map((p) => p.id), prints.map((p) => p.id), 'each print exactly once a week')
  assert.ok(sliceFor(sunday(FIRST_HOUR), prints).length <= SLICE, `at most ${SLICE} prints, ${SLICE * 2} requests, per hourly run`)
})

test('prints check: an unknown result keeps the last state; gone retires, ok restores', () => {
  const now = '2026-10-25T04:00:00.000Z'
  let s = record({}, mw, { state: 'unknown', reason: 'bot check' }, now)
  assert.equal(s.prints[mw.id].state, 'ok', 'never retired on a first unknown')
  s = record(s, mw, { state: 'gone', reason: 'page 404' }, now)
  assert.deepEqual([...retiredIds(s)], [mw.id])
  s = record(s, mw, { state: 'unknown', reason: 'timeout' }, '2026-11-01T04:00:00.000Z')
  assert.equal(s.prints[mw.id].state, 'gone', 'a retired print stays retired on an unknown')
  assert.equal(s.prints[mw.id].since, now, 'since keeps the day it was retired')
  s = record(s, mw, { state: 'ok', reason: 'ok' }, '2026-11-08T04:00:00.000Z')
  assert.equal(retiredIds(s).size, 0, 'it comes back when it is healthy again')
})

test('prints check: a slice confirms a gone print once, then stores the result in KV', async () => {
  const kv = new Map()
  const env = { VIDEOS_KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v) } } }
  const prints = [mw, tv]
  const calls = []
  const check = async (p) => { calls.push(p.id); return p.id === mw.id ? { state: 'gone', reason: 'page 404' } : { state: 'ok', reason: 'ok' } }
  const out = await checkPrintsSlice(env, Date.UTC(2026, 9, 25, FIRST_HOUR), { check, prints })
  assert.deepEqual(calls, [mw.id, mw.id, tv.id], 'the gone print is looked at twice')
  assert.deepEqual([...retiredIds(JSON.parse(kv.get(KEY)))], [mw.id])
  assert.equal(out.checked, '2026-10-25T04:00:00.000Z')
  assert.equal(await checkPrintsSlice(env, Date.UTC(2026, 9, 26, FIRST_HOUR), { check, prints }), null, 'nothing on a Monday')
})

// Against the local dev server: retire one print and a whole group in local KV, then the page
// must drop the card, the empty group and their ItemList entries. Skipped without a server.
const base = process.env.CATALOG_BASE || 'http://localhost:8787'
// A fresh connection per request: the dev server drops idle keep-alive sockets while the CLI writes KV.
const get = async (url) => { for (let i = 0; ; i++) { try { return await (await fetch(url, { headers: { connection: 'close' } })).text() } catch (e) { if (i >= 2) throw e; await new Promise((r) => setTimeout(r, 1500)) } } }
const up = await fetch(base + '/nanawing/chupito-simulator/', { headers: { connection: 'close' } }).then((r) => r.ok).catch(() => false)
const wrangler = (...args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'kv', 'key', ...args, '--binding', 'VIDEOS_KV', '--local'], { stdio: 'pipe', shell: process.platform === 'win32' })

test('prints check: a retired print leaves the served page and its ItemList', { skip: !up && 'no local server' }, async () => {
  const copy = PRINT_PAGES['/nanawing/chupito-simulator/']
  const lone = copy.prints.groups.findIndex((g) => g.items.length === 1)
  const loneId = copy.prints.groups[lone].items[0].id
  const other = copy.prints.groups[0].items[0]
  const stored = { prints: { [loneId]: { state: 'gone' }, [other.id]: { state: 'gone' } } }
  // The record goes through a file: a JSON argument loses its quotes in the Windows shell.
  const file = join(mkdtempSync(join(tmpdir(), 'prints-')), 'status.json')
  writeFileSync(file, JSON.stringify(stored))
  wrangler('put', KEY, '--path', file)
  try {
    const html = await get(base + copy.path)
    assert.ok(!html.includes(`data-print="${other.id}"`), 'the retired card is gone')
    assert.ok(!html.includes(`data-print-group="${lone}"`), 'a group left empty is gone')
    assert.ok(html.includes(`data-print="${copy.prints.groups[0].items[1].id}"`), 'its neighbour stays')
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph']
    const urls = graph.find((e) => e['@type'] === 'ItemList').itemListElement.map((e) => e.url)
    assert.ok(!urls.includes(other.href) && !urls.includes(copy.prints.groups[lone].items[0].href), 'the ItemList drops them')
    assert.equal(urls.length, allPrints().length - 2)
  } finally {
    wrangler('delete', KEY)
  }
  const after = await get(base + copy.path)
  assert.ok(after.includes(`data-print="${other.id}"`), 'with no record every print is back')
})
