// Discovery + availability refresh — the content logic, as pure functions so
// the same code runs in the Worker (cron + admin button) and the CLI. Neither
// touches storage here; callers persist the returned data (KV in prod, files in
// dev). Discovery only ever PROPOSES candidates; it never writes the catalogue.

import { fetchCatalog, fetchOfferForUrl, norm } from './catalog.mjs'

const today = () => new Date().toISOString().slice(0, 10)

// Walk each scrapable source's root listUrls, collect products, drop anything
// already live or already-rejected. Returns fresh candidates + per-source stats.
export async function discover(sources, kits, priorCandidates = []) {
  const known = new Set(kits.map((k) => norm(k.url)).filter(Boolean))
  const dismissed = new Set(priorCandidates.filter((c) => c.status === 'rejected').map((c) => norm(c.url)))
  const byUrl = new Map(priorCandidates.map((c) => [norm(c.url), c]))

  const stats = []
  const found = []
  for (const source of sources.filter((s) => s.scrapable && (s.listUrls?.length ?? 0))) {
    const hits = new Map()
    const errors = []
    for (const listUrl of source.listUrls) {
      const { products, error } = await fetchCatalog(source, listUrl)
      if (error) errors.push(`${listUrl}: ${error}`)
      for (const p of products) if (!hits.has(p.url)) hits.set(p.url, p)
    }
    const fresh = [...hits.values()].filter((p) => !known.has(p.url) && !dismissed.has(p.url) && !byUrl.has(p.url))
    for (const p of fresh) {
      const c = { ...p, source: source.id, status: 'new', seenAt: today() }
      byUrl.set(p.url, c)
      found.push(c)
    }
    stats.push({ source: source.id, total: hits.size, fresh: fresh.length, errors })
  }
  return { candidates: [...byUrl.values()], found, stats }
}

// Re-check price/stock for live kits. Returns a NEW kits array (unchanged where
// nothing moved) plus a human-readable change/problem log. Only ever mutates
// variants / inStock / checkedAt — never identity.
export async function refresh(kits, sourceById) {
  const out = []
  const changes = []
  const problems = []
  for (const kit of kits) {
    const src = sourceById[kit.source]
    if (!kit.url || !src || src.scrapable === false || src.pricePublished === false) {
      out.push(kit)
      if (kit.url && src && (src.scrapable === false || src.pricePublished === false)) problems.push(`${kit.slug}: skipped (${src.blocked ?? 'no published price'})`)
      continue
    }
    const { variants, error } = await fetchOfferForUrl(kit.url, src)
    if (error) {
      problems.push(`${kit.slug}: ${error}`)
      out.push(kit)
      continue
    }
    const before = kit.variants ?? []
    const bMin = Math.min(Infinity, ...before.filter((v) => v.inStock).map((v) => v.priceINR))
    const aMin = Math.min(Infinity, ...variants.filter((v) => v.inStock).map((v) => v.priceINR))
    if (bMin !== aMin) {
      changes.push(`${kit.slug}: ${bMin === Infinity ? `back in stock ₹${aMin}` : aMin === Infinity ? `now OUT OF STOCK (was ₹${bMin})` : `₹${bMin} → ₹${aMin}`}`)
    }
    out.push({
      ...kit,
      checkedAt: today(),
      variants: variants.map((v) => {
        const old = before.find((b) => b.priceINR === v.priceINR)
        return { label: old?.label ?? v.label, priceINR: v.priceINR, inStock: v.inStock, ...(old?.mrpINR ? { mrpINR: old.mrpINR } : {}) }
      }),
    })
  }
  return { kits: out, changes, problems }
}

// Turn an approved candidate into a real kit entry.
export function candidateToKit(c, form, source) {
  return {
    slug: form.slug,
    brand: form.brand,
    name: form.name,
    airframe: 'flying-wing',
    spanMM: +form.spanMM || 0,
    madeIn: source?.madeInIndia ? 'IN' : 'CN',
    blurb: form.blurb || '',
    source: c.source,
    url: c.url,
    availability: 'domestic',
    taxIncluded: source?.taxIncluded !== false,
    checkedAt: today(),
    imgUrl: c.img || null,
    variants: c.priceINR ? [{ label: 'Standard', priceINR: c.priceINR, inStock: c.inStock !== false }] : [],
    addedBy: 'admin',
    addedAt: today(),
  }
}
