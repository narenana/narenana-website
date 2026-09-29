// Embeddings for finding duplicate model pages (design § 6).
//
//   text      a master: "brand | name | span NNNmm | up to 5 distinct offer
//             titles" (300 characters); a pending listing: "brand guess |
//             title | span". Re-embedded only when sha256(text) changes.
//   storage   embedding.vec: the L2-normalised vector quantised to int8 with a
//             per-row scale (max |x| / 127), as base64 TEXT (about 1.4 KB at
//             1,024 dimensions). Base64 because D1 returns BLOBs over its JSON
//             wire (not settled in the docs), and atob decodes in a tight loop.
//   compare   dot products of int8 vectors in the Worker, times both scales:
//             the cosine of the two normalised vectors. Blocked (same
//             category, compatible brand key, spans within 10% or unknown), so
//             a steady-state day compares only changed pages with the rest.
//
// Vectorize could replace nearest() with no change to its callers; below
// about 10,000 pages it is not needed.

export const TITLES = 5
export const TITLE_CHARS = 300
export const NEIGHBOUR_MIN = 0.8 // cosine for a candidate pair
export const TOP_K = 5

const spanText = (mm) => (Number(mm) > 0 ? `span ${Math.round(Number(mm))}mm` : '')
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

export function masterText(m, titles = [], spanMM = null) {
  const seen = new Set()
  const list = []
  for (const t of titles) {
    const c = clean(t)
    if (!c || seen.has(c.toLowerCase())) continue
    seen.add(c.toLowerCase())
    list.push(c)
    if (list.length >= TITLES) break
  }
  return [clean(m.brand), clean(m.name), spanText(spanMM), list.join(' ; ').slice(0, TITLE_CHARS)].join(' | ')
}

export const listingText = ({ brand, title, spanMM }) => [clean(brand), clean(title), spanText(spanMM)].join(' | ')

// ------------------------------------------------------------ int8 + base64
export function quantize(vec) {
  let n = 0
  for (const x of vec) n += x * x
  n = Math.sqrt(n) || 1
  let mx = 0
  for (const x of vec) mx = Math.max(mx, Math.abs(x / n))
  const scale = mx > 0 ? mx / 127 : 1
  const bytes = new Uint8Array(vec.length)
  for (let i = 0; i < vec.length; i++) bytes[i] = Math.max(-127, Math.min(127, Math.round(vec[i] / n / scale))) & 0xff
  let s = ''
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 4096))
  return { scale, vec: btoa(s) }
}

export function decode(b64) {
  const s = atob(b64)
  const out = new Int8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = (s.charCodeAt(i) << 24) >> 24
  return out
}

// Cosine of two quantised, normalised vectors.
export function cosine(a, b) {
  const x = a.q
  const y = b.q
  const n = Math.min(x.length, y.length)
  let d = 0
  for (let i = 0; i < n; i++) d += x[i] * y[i]
  return d * a.scale * b.scale
}

// The top k of `pool` for `item` with cosine ≥ min, among those block() lets
// through. Returns { top: [{id, cos}], compared }.
export function nearest(item, pool, { k = TOP_K, min = NEIGHBOUR_MIN, block = () => true } = {}) {
  const top = []
  let compared = 0
  for (const p of pool) {
    if (p.id === item.id || !block(item, p)) continue
    compared++
    const c = cosine(item, p)
    if (c < min) continue
    top.push({ id: p.id, cos: Math.round(c * 1e4) / 1e4 })
  }
  top.sort((a, b) => b.cos - a.cos)
  return { top: top.slice(0, k), compared }
}
