// One-off production repair/backfill for ranked manufacturer candidates.
//
// It deliberately reuses the same pure rebuild function as the Worker cron.
// Human decisions (decided_at IS NOT NULL) are preserved.
//
//   node catalog/tools/mfr/rebuild-remote.mjs --apply

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rebuildManufacturerMatches } from '../../lib/mfr-jobs.mjs'

if (!process.argv.includes('--apply')) {
  console.error('Refusing to write production. Re-run with --apply.')
  process.exit(2)
}

const here = path.dirname(fileURLToPath(import.meta.url))
const wranglerBin = path.resolve(here, '../../../node_modules/wrangler/bin/wrangler.js')
const quote = (value) => {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return "'" + String(value).replace(/'/g, "''") + "'"
}
const bindSql = (sql, params) => {
  let i = 0
  const bound = sql.replace(/\?/g, () => {
    if (i >= params.length) throw new Error('not enough SQL parameters')
    return quote(params[i++])
  })
  if (i !== params.length) throw new Error('too many SQL parameters')
  return bound
}
const execute = async (sql) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const output = execFileSync(
        process.execPath,
        [wranglerBin, 'd1', 'execute', 'catalog', '--remote', '--json', '--command', sql],
        { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
      )
      const parsed = JSON.parse(output)
      const first = parsed[0]
      if (!first?.success) throw new Error(output)
      return first
    } catch (error) {
      const detail = String(error?.stdout || error?.message || error)
      if (attempt === 5 || !/fetch failed|network|timed out|timeout/i.test(detail)) throw error
      const delay = 1000 * 2 ** (attempt - 1)
      console.warn(`Transient remote D1 failure; retrying in ${delay}ms (${attempt}/5)`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

const db = {
  prepare(sql) {
    return {
      bind(...params) {
        const bound = bindSql(sql, params)
        return {
          async all() {
            const result = await execute(bound)
            return { results: result.results || [], meta: result.meta }
          },
          async first() {
            return ((await execute(bound)).results || [])[0] ?? null
          },
          async run() {
            const result = await execute(bound)
            return { results: result.results || [], meta: result.meta }
          },
        }
      },
      async all() {
        const result = await execute(sql)
        return { results: result.results || [], meta: result.meta }
      },
      async first() {
        return ((await execute(sql)).results || [])[0] ?? null
      },
      async run() {
        const result = await execute(sql)
        return { results: result.results || [], meta: result.meta }
      },
    }
  },
}

const env = { CATALOG_DB: db }
const manufacturers = (await execute(
  `SELECT * FROM manufacturer WHERE status='active' ORDER BY id`,
)).results || []

for (const manufacturer of manufacturers) {
  const result = await rebuildManufacturerMatches(env, manufacturer, Date.now())
  console.log(`${manufacturer.brand}: ${result.masters} masters, ${result.candidates} candidates, ${result.automatic} automatic rows`)
}
