// Pull the primary product image for each kit from its seller's page.
//   node wings/jobs/fetch-images.mjs
// Writes site/wings/img/<slug>.jpg and reports what it couldn't get.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../../', import.meta.url)
const OUT = fileURLToPath(new URL('wings/img/', ROOT))
const kits = JSON.parse(await readFile(fileURLToPath(new URL('wings/data/kits.json', ROOT)), 'utf8')).kits

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

await mkdir(OUT, { recursive: true })

const pick = (html) => {
  // og:image is the seller's own canonical product shot — most reliable.
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  if (og) return og[1]
  const og2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  if (og2) return og2[1]
  // WooCommerce gallery fallback
  const woo = html.match(/data-large_image=["']([^"']+)["']/i)
  if (woo) return woo[1]
  return null
}

const results = []
for (const kit of kits) {
  if (!kit.url) {
    results.push([kit.slug, 'no-url'])
    continue
  }
  try {
    const res = await fetch(kit.url, { headers: { 'user-agent': UA }, redirect: 'follow' })
    if (!res.ok) {
      results.push([kit.slug, `page HTTP ${res.status}`])
      continue
    }
    const html = await res.text()
    const src = pick(html)
    if (!src) {
      results.push([kit.slug, 'no og:image found'])
      continue
    }
    const abs = new URL(src, kit.url).toString()
    const img = await fetch(abs, { headers: { 'user-agent': UA, referer: kit.url } })
    if (!img.ok) {
      results.push([kit.slug, `img HTTP ${img.status}`])
      continue
    }
    const buf = Buffer.from(await img.arrayBuffer())
    if (buf.length < 3000) {
      results.push([kit.slug, `img too small (${buf.length}B) — probably a placeholder`])
      continue
    }
    await writeFile(fileURLToPath(new URL(`${kit.slug}.src`, `file://${OUT.replace(/\\/g, '/')}/`)), buf)
    results.push([kit.slug, `OK ${(buf.length / 1024).toFixed(0)}KB ${abs.split('/').pop().slice(0, 40)}`])
  } catch (e) {
    results.push([kit.slug, `ERR ${e.message}`])
  }
}

for (const [slug, note] of results) console.log(`${note.startsWith('OK') ? '  ok ' : ' MISS'} ${slug.padEnd(30)} ${note}`)
console.log(`\n${results.filter((r) => r[1].startsWith('OK')).length}/${kits.length} images fetched`)
