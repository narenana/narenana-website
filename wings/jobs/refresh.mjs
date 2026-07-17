// Availability + price refresh for everything already in the index.
//
//   npm run wings:refresh          check and report, write nothing
//   npm run wings:refresh -- --write   apply the changes to kits.json
//
// This job may ONLY ever touch price / inStock / checkedAt on an existing kit.
// It cannot add, rename or delete a kit — discovery proposes, humans accept.
// That boundary is what stops a bad scrape from quietly rewriting the catalogue.

import { writeFile } from 'node:fs/promises'
import { get, parsePrice, path, readJson, norm } from './lib.mjs'

const WRITE = process.argv.includes('--write')
const { sources } = await readJson('wings/data/sources.json')
const data = await readJson('wings/data/kits.json')
const sourceById = Object.fromEntries(sources.map((s) => [s.id, s]))
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN')
const today = new Date().toISOString().slice(0, 10)

const changes = []
const problems = []

for (const kit of data.kits) {
  const source = sourceById[kit.source]
  if (!kit.url || !source) continue
  if (!source.scrapable) {
    problems.push([kit.slug, `skipped — ${source.blocked ?? 'not scrapable'}`])
    continue
  }
  if (source.pricePublished === false) {
    problems.push([kit.slug, 'skipped — seller publishes no price'])
    continue
  }

  const html = await get(kit.url)
  if (!html) {
    problems.push([kit.slug, 'FETCH FAILED — check the link is still alive'])
    continue
  }

  const live = parsePrice(html, source)
  if (!live?.length) {
    problems.push([kit.slug, 'could not parse a price — adapter may need updating'])
    continue
  }

  // Match live variants to stored ones by price; report anything that moved.
  const before = kit.variants ?? []
  const beforeMin = Math.min(...before.filter((v) => v.inStock).map((v) => v.priceINR), Infinity)
  const afterMin = Math.min(...live.filter((v) => v.inStock).map((v) => v.priceINR), Infinity)

  const stockFlips = before.filter((b) => {
    const m = live.find((l) => l.priceINR === b.priceINR)
    return m && m.inStock !== b.inStock
  })

  if (beforeMin !== afterMin) {
    changes.push([
      kit.slug,
      beforeMin === Infinity
        ? `back in stock at ${inr(afterMin)}`
        : afterMin === Infinity
          ? `now fully OUT OF STOCK (was ${inr(beforeMin)})`
          : `${inr(beforeMin)} -> ${inr(afterMin)}`,
    ])
  } else if (stockFlips.length) {
    changes.push([kit.slug, `${stockFlips.length} variant stock change(s)`])
  }

  if (WRITE) {
    // Preserve our curated labels where the price still matches; otherwise take
    // the seller's own variant list as truth.
    kit.variants = live.map((l) => {
      const old = before.find((b) => b.priceINR === l.priceINR)
      return { label: old?.label ?? l.label, priceINR: l.priceINR, inStock: l.inStock, ...(old?.mrpINR ? { mrpINR: old.mrpINR } : {}) }
    })
    kit.checkedAt = today
  }
}

console.log(`checked ${data.kits.filter((k) => k.url).length} kits\n`)
if (changes.length) {
  console.log('CHANGED:')
  for (const [slug, note] of changes) console.log(`  ${slug.padEnd(30)} ${note}`)
} else {
  console.log('no price or stock changes')
}
if (problems.length) {
  console.log('\nNEEDS ATTENTION:')
  for (const [slug, note] of problems) console.log(`  ${slug.padEnd(30)} ${note}`)
}

if (WRITE) {
  await writeFile(path('wings/data/kits.json'), JSON.stringify(data, null, 2) + '\n')
  console.log(`\nwrote kits.json (checkedAt -> ${today}). Re-run \`npm run wings:build\`.`)
} else if (changes.length) {
  console.log('\ndry run — pass --write to apply')
}
