// Discovery — walk each source's ROOT links into their subtree and find models
// we don't have yet.
//
//   npm run wings:discover
//
// Root links live in wings/data/sources.json as `listUrls`. This crawls them
// (following pagination), collects every product URL, drops the ones already in
// kits.json, and writes the rest to wings/data/candidates.json for review.
//
// It never edits kits.json. A human accepts candidates — that's the line that
// keeps the index trustworthy.

import { writeFile } from 'node:fs/promises'
import { fetchCatalog, get, norm, path, readJson, titleOf } from './lib.mjs'

const { sources } = await readJson('wings/data/sources.json')
const { kits } = await readJson('wings/data/kits.json')

let prevCandidates = []
try {
  prevCandidates = (await readJson('wings/data/candidates.json')).candidates ?? []
} catch {
  /* first run */
}

const known = new Set(kits.map((k) => norm(k.url)).filter(Boolean))
const dismissed = new Set(prevCandidates.filter((c) => c.status === 'rejected').map((c) => norm(c.url)))
const MAX_PAGES = 12

const active = sources.filter((s) => s.scrapable && (s.listUrls?.length ?? 0) > 0)
const skipped = sources.filter((s) => !s.scrapable || !(s.listUrls?.length ?? 0))

console.log(`discovering across ${active.length} sources\n`)

const found = []
for (const source of active) {
  const hits = new Map()
  const errors = []
  for (const listUrl of source.listUrls) {
    const { products, error } = await fetchCatalog(source, listUrl)
    if (error) errors.push(`${listUrl} — ${error}`)
    for (const p of products) if (!hits.has(p.url)) hits.set(p.url, p)
  }
  const fresh = [...hits.values()].filter((p) => !known.has(p.url) && !dismissed.has(p.url))
  console.log(`  ${source.id.padEnd(18)} ${String(hits.size).padStart(3)} products · ${String(fresh.length).padStart(3)} new`)
  for (const e of errors) console.log(`    ✗ BROKEN ROOT LINK: ${e}`)
  for (const p of fresh) found.push({ ...p, source: source.id })
}

// The feeds already give us titles; only fall back to fetching for HTML sources.
for (const c of found) {
  if (!c.title) {
    const html = await get(c.url)
    c.title = html ? titleOf(html).slice(0, 110) : '(could not fetch)'
  }
  c.status = 'new'
  c.seenAt = new Date().toISOString().slice(0, 10)
}

// Keep prior decisions; only add genuinely-new URLs.
const byUrl = new Map(prevCandidates.map((c) => [norm(c.url), c]))
for (const c of found) if (!byUrl.has(norm(c.url))) byUrl.set(norm(c.url), c)
const candidates = [...byUrl.values()]

await writeFile(
  path('wings/data/candidates.json'),
  JSON.stringify(
    {
      $comment:
        'Output of `npm run wings:discover` — product URLs found under the root listUrls that are not yet in kits.json. Review these: set status to "accepted" and copy into kits.json, or "rejected" to stop it resurfacing. This file is machine-written; kits.json is not.',
      updated: new Date().toISOString().slice(0, 10),
      candidates,
    },
    null,
    2,
  ) + '\n',
)

console.log(`\n${found.length} new candidate${found.length === 1 ? '' : 's'} -> wings/data/candidates.json`)
if (skipped.length) {
  console.log('\nnot crawled (by design):')
  for (const s of skipped) console.log(`  ${s.id.padEnd(16)} ${s.blocked ?? 'no listUrls yet'}`)
}
for (const c of found.slice(0, 25)) console.log(`  · ${c.title}\n    ${c.url}`)
