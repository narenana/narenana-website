// Per-product page snapshot: a chrome-free extract of the product core, plus a
// content hash so a daily re-fetch only re-processes when the product actually
// changed (page chrome — cart counts, session tokens, rotating "related items"
// — must NOT flip the hash). The extract is what we re-run classifiers over
// (power, brand, span, config) WITHOUT re-fetching the seller. Optionally the
// full gzipped page is archived to R2 for fields we don't parse yet.

import { one, run } from './db.mjs'

// FNV-1a — small, stable, dependency-free. Not cryptographic; we only need
// "did the product core change?".
function fnv1a(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return ('00000000' + h.toString(16)).slice(-8)
}

// Pull the product-specific text: the Product JSON-LD block (name + full
// description + offers) and the og/meta description. All product-scoped — none
// of the nav / "related products" / footer that pollutes whole-page scans.
export function extractSnapshot(html = '') {
  const h = String(html)
  let jsonld = ''
  for (const b of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/"@type"\s*:\s*"Product"/i.test(b[1])) { jsonld = b[1].trim().slice(0, 12000); break }
  }
  const meta = (re) => h.match(re)?.[1] ?? ''
  const parts = [
    meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i),
    meta(/<meta[^>]+(?:name|property)=["']og:description["'][^>]+content=["']([^"']*)/i),
    meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i),
  ]
  // JSON-LD "description" is often the full product copy incl. the spec block.
  const ld = jsonld.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/i)?.[1]
  if (ld) parts.push(ld.replace(/\\u003c[^>]*\\u003e|<[^>]+>/g, ' ').replace(/\\"/g, '"').replace(/\\n/g, ' '))
  const description = parts.filter(Boolean).join(' · ')
    .replace(/&(amp|nbsp|#\d+);/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000)
  return { jsonld, description, hash: fnv1a(jsonld + '|' + description) }
}

// Store/refresh a product snapshot. Hash-gated: an unchanged product core → no
// write at all (the "replace only if changed" the owner asked for). Changed or
// new → upsert the extract in D1 and, if the R2 SNAPSHOTS binding exists,
// archive the gzipped raw page. NEVER throws to the caller — a snapshot failure
// must not break scan / enrich / verify.
export async function storeSnapshot(env, skuId, html, now) {
  try {
    if (!html || html.length < 200) return { changed: false }
    const s = extractSnapshot(html)
    // A WAF wall / soft-404 carries no product core — never let it overwrite a
    // good snapshot with junk (mirrors verify's preserve-on-block rule).
    if (!s.jsonld && s.description.length < 50) return { changed: false }
    const prev = await one(env, 'SELECT hash FROM sku_snapshot WHERE sku_id=?', skuId)
    if (prev?.hash === s.hash) return { changed: false, hash: s.hash } // unchanged → skip
    const t = now ?? Date.now()
    let r2Key = null
    if (env.SNAPSHOTS) {
      try {
        r2Key = `sku/${skuId}.html.gz`
        const gz = new Response(html).body.pipeThrough(new CompressionStream('gzip'))
        await env.SNAPSHOTS.put(r2Key, gz, { httpMetadata: { contentType: 'text/html', contentEncoding: 'gzip' } })
      } catch { r2Key = null }
    }
    await run(env,
      `INSERT INTO sku_snapshot (sku_id, hash, jsonld, description, r2_key, fetched_at, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(sku_id) DO UPDATE SET hash=excluded.hash, jsonld=excluded.jsonld,
         description=excluded.description, r2_key=COALESCE(excluded.r2_key, sku_snapshot.r2_key), updated_at=excluded.updated_at`,
      skuId, s.hash, s.jsonld || null, s.description || null, r2Key, t, t)
    return { changed: true, hash: s.hash }
  } catch {
    return { changed: false }
  }
}
