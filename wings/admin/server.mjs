// Wings admin — the human approval gate.
//
//   npm run wings:admin      -> http://127.0.0.1:8899
//
// Nothing reaches the site without passing through here. Discovery writes
// candidates; you approve or reject each one; approving appends a real entry to
// kits.json. Publishing is still a deliberate act (build + commit + push), so an
// accidental click can never put something live on its own.
//
// Local-only by design: binds to 127.0.0.1, no auth, no deploy button. The
// production write path stays git.

import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = new URL('../../', import.meta.url)
const p = (x) => fileURLToPath(new URL(x, ROOT))
const readJson = async (f) => JSON.parse(await readFile(p(f), 'utf8'))
const writeJson = async (f, d) => writeFile(p(f), JSON.stringify(d, null, 2) + '\n')

const PORT = 8899
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36'

// --- helpers --------------------------------------------------------------
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

// Guess a wingspan from the title so the reviewer usually just confirms.
const guessSpan = (t = '') => {
  const m = t.match(/(\d{3,4})\s*mm/i) || t.match(/\b[a-z]?(\d{3,4})\b(?!\s*kv)/i)
  const n = m ? +m[1] : 0
  return n >= 400 && n <= 3000 ? n : ''
}
const guessBrand = (t = '') => {
  const known = ['Vortex-RC', 'ATOMRC', 'HEEWING', 'SKYWALKER', 'Skywalker', 'ZOHD', 'TBS', 'LDARC', 'MAPBIRD', 'X-UAV', 'XUAV', 'SonicModell', 'Durafly', 'XFly', 'Top RC Hobby', 'FMS']
  const hit = known.find((k) => new RegExp(`\\b${k.replace('-', '.?')}\\b`, 'i').test(t))
  return hit ?? (t.trim().split(/[\s–—-]+/)[0] || '')
}
const cleanName = (t = '') =>
  t
    .replace(/\s*[|–—-]\s*(UAV Marketplace|Robosync|Vortex-RC|Anubis.*|In India).*$/i, '')
    .replace(/\b(PNP|KIT|RTF|BNF)\b.*$/i, (m) => m)
    .trim()
    .slice(0, 60)

// Thumbnails cost a full seller-page fetch each, so cap the wait: one slow shop
// must not stall the whole review queue. A missing thumb is survivable; a hung
// panel is not.
const imgCache = new Map()
async function ogImage(url) {
  if (imgCache.has(url)) return imgCache.get(url)
  try {
    const html = await (await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) })).text()
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/data-large_image=["']([^"']+)["']/i)
    const src = m ? new URL(m[1], url).toString() : null
    imgCache.set(url, src)
    return src
  } catch {
    imgCache.set(url, null)
    return null
  }
}

// Crude but useful: sort likely wings to the top rather than hiding anything.
const WING = /\bwing\b|delta|dart|interceptor|chiquita|micro ?bee|spec racer|speedster|batman|zohd|ar ?wing|mojito|talon|spear|efxtra|swift|glider|plank/i
const NOISE = /\b(fc|flight controller|motor|esc|propell|prop\b|battery|charger|servo|carbon|plywood|balsa|foam|wire|connector|magnet|film|tube|rod|glue|goggle|camera|vtx|antenna|receiver|transmitter|screw|skid|spare|package|accessor)/i
const score = (t = '') => (WING.test(t) ? 2 : 0) - (NOISE.test(t) ? 3 : 0)

// --- api ------------------------------------------------------------------
async function api(req, res, url) {
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }
  const body = async () => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    return JSON.parse(Buffer.concat(chunks).toString() || '{}')
  }

  if (url.pathname === '/api/candidates') {
    const { candidates } = await readJson('wings/data/candidates.json')
    const { kits } = await readJson('wings/data/kits.json')
    const pending = candidates
      .filter((c) => c.status === 'new')
      .map((c) => ({ ...c, score: score(c.title), guess: { brand: guessBrand(c.title), name: cleanName(c.title), spanMM: guessSpan(c.title), slug: slugify(c.title) } }))
      .sort((a, b) => b.score - a.score || (a.source > b.source ? 1 : -1))
    return send(200, {
      pending,
      counts: {
        pending: pending.length,
        likely: pending.filter((c) => c.score > 0).length,
        live: kits.length,
        rejected: candidates.filter((c) => c.status === 'rejected').length,
      },
    })
  }

  if (url.pathname === '/api/img') {
    const src = await ogImage(url.searchParams.get('u'))
    if (!src) return send(404, { error: 'no image' })
    try {
      const r = await fetch(src, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) })
      const buf = Buffer.from(await r.arrayBuffer())
      res.writeHead(200, { 'content-type': r.headers.get('content-type') ?? 'image/jpeg', 'cache-control': 'max-age=86400' })
      return res.end(buf)
    } catch {
      return send(404, { error: 'fetch failed' })
    }
  }

  if (url.pathname === '/api/decide' && req.method === 'POST') {
    const b = await body()
    const cands = await readJson('wings/data/candidates.json')
    const c = cands.candidates.find((x) => x.url === b.url)
    if (!c) return send(404, { error: 'unknown candidate' })

    if (b.decision === 'reject') {
      c.status = 'rejected'
      await writeJson('wings/data/candidates.json', cands)
      return send(200, { ok: true })
    }

    // approve -> real entry in kits.json
    const data = await readJson('wings/data/kits.json')
    if (data.kits.some((k) => k.slug === b.slug)) return send(409, { error: `slug "${b.slug}" already exists` })
    const src = (await readJson('wings/data/sources.json')).sources.find((s) => s.id === c.source)
    data.kits.push({
      slug: b.slug,
      brand: b.brand,
      name: b.name,
      airframe: 'flying-wing',
      spanMM: +b.spanMM || 0,
      madeIn: src?.madeInIndia ? 'IN' : 'CN',
      blurb: b.blurb || '',
      source: c.source,
      url: c.url,
      availability: 'domestic',
      taxIncluded: src?.taxIncluded !== false,
      checkedAt: new Date().toISOString().slice(0, 10),
      variants: c.priceINR ? [{ label: 'Standard', priceINR: c.priceINR, inStock: c.inStock !== false }] : [],
      addedBy: 'admin',
    })
    await writeJson('wings/data/kits.json', data)
    c.status = 'accepted'
    await writeJson('wings/data/candidates.json', cands)
    return send(200, { ok: true, live: data.kits.length })
  }

  if (url.pathname === '/api/build' && req.method === 'POST') {
    const run = (cmd, args) =>
      new Promise((resolve) => {
        const ps = spawn(cmd, args, { cwd: p('.'), shell: true })
        let out = ''
        ps.stdout.on('data', (d) => (out += d))
        ps.stderr.on('data', (d) => (out += d))
        ps.on('close', (code) => resolve({ code, out }))
      })
    const img = await run('node', ['wings/jobs/fetch-images.mjs'])
    const built = await run('node', ['wings/build.mjs'])
    return send(200, { ok: built.code === 0, out: (img.out + '\n' + built.out).slice(-1500) })
  }

  return send(404, { error: 'no route' })
}

// --- server ---------------------------------------------------------------
createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    const html = await readFile(p('wings/admin/ui.html'), 'utf8')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  wings admin -> http://127.0.0.1:${PORT}\n`)
})
