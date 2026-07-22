#!/usr/bin/env node
// Local-machine pull for CDN/WAF-blocked catalog images.
//
// The cron warm slice (catalog/lib/jobs.mjs) proactively copies seller images
// into R2 so a down/slow/blocked seller can't blank the catalog. But some
// origins (e.g. anubisrc) 403 ANY datacenter/Worker fetch by IP or TLS
// fingerprint, so the slice can't retrieve them — it records those in the
// `image_cache` ledger as status='blocked'.
//
// This script closes that gap: run it from a real *residential* connection
// (which those WAFs allow), and it pulls every blocked image, uploads it to R2
// under the exact imgKey the /img proxy serves, and flags it 'ok' in the ledger.
// Idempotent and safe to re-run — it only ever touches rows still 'blocked'.
//
//   Usage:   node catalog/tools/pull-blocked.mjs
//   Needs:   wrangler auth (same as `wrangler deploy`), Node 18+ (global fetch).
//
// New blocked images appear whenever the daily crawler finds products on a
// WAF-guarded seller; re-run this periodically (or after the warm slice reports
// blocked>0) to keep the catalog fully imaged.

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

const BUCKET = 'narenana-images'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// MUST match imgKey in catalog/lib/util.mjs (the R2 key the /img proxy reads).
const imgKey = (src) => {
  let h = 0x811c9dc5
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return 'i/' + (h >>> 0).toString(16)
}

// Trust magic bytes over the origin's content-type (some serve images as text/plain).
const sniff = (b) => {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png'
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (b.slice(4, 8).toString('latin1') === 'ftyp') return 'image/avif' // avif/heif ftyp box
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  return null
}

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })

const q = (sql, extra = []) => wrangler(['d1', 'execute', 'catalog', '--remote', ...extra, '--command', sql])

// 1. blocked images from the ledger
const blocked = JSON.parse(q("SELECT src FROM image_cache WHERE status='blocked'", ['--json']))[0].results.map((r) => r.src)
console.log(`blocked in image_cache: ${blocked.length}`)
if (!blocked.length) process.exit(0)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pullblk-'))
const ok = [], bad = []
for (const src of blocked) {
  try {
    const r = await fetch(src, { headers: { 'user-agent': UA, referer: 'https://' + new URL(src).host + '/' } })
    if (!r.ok) { bad.push([src, 'http ' + r.status]); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    const ct = sniff(buf)
    if (!ct) { bad.push([src, `not an image (${buf.length}B)`]); continue }
    const key = imgKey(src)
    const f = path.join(tmp, key.replace('/', '_'))
    fs.writeFileSync(f, buf)
    wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', f, '--content-type', ct, '--remote'])
    ok.push({ src, key, ct, bytes: buf.length })
    console.log('  OK', key, ct, buf.length + 'B', src.split('/').pop())
  } catch (e) { bad.push([src, String(e.message || e).slice(0, 100)]) }
}

// 2. flag the pulled ones 'ok' (the warm slice would also reconcile via its R2
//    head-check, but marking them here stops the next sweep re-fetching → re-403).
if (ok.length) {
  const t = Date.now()
  const sql = ok.map((o) => `UPDATE image_cache SET status='ok', http=200, bytes=${o.bytes}, updated_at=${t} WHERE src='${o.src.replace(/'/g, "''")}';`).join('\n')
  const sf = path.join(tmp, 'mark_ok.sql')
  fs.writeFileSync(sf, sql)
  wrangler(['d1', 'execute', 'catalog', '--remote', '--file', sf])
}
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`\nuploaded ${ok.length}  failed ${bad.length}`)
bad.forEach(([s, r]) => console.log('  FAIL', r, '::', s))
