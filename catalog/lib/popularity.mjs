// Popularity scoring — pure, deterministic, no I/O. The poll job (jobs.mjs)
// gathers the inputs (YouTube video stats + a master's seller/stock signals from
// D1); this module turns them into the two scores the catalog sorts and
// prioritizes by. Kept separate so the formula is unit-testable and re-tunable
// without touching the fetch / quota machinery.
//
//   pop_raw   — raw audience interest. log-compressed so ONE viral video can't
//               dwarf a well-covered model, plus a breadth term (how many
//               distinct reviews exist) and a recency nudge (currently-hot).
//   pop_score — pop_raw × an availability factor, so the BUYABLE grid never ranks
//               a model nobody in India sells above one that's in stock. Content
//               priority reads pop_raw; the default grid sort reads pop_score.
//
// Absolute magnitudes don't matter (sorting is comparative) — the terms are
// weighted for legibility in pop_signals, not calibrated to any 0..100 scale.

export const POP_WEIGHTS = {
  views: 12, // weight on log10(1 + total views across the top videos)
  breadth: 8, // weight on log10(1 + distinct non-excluded videos)
  recencyMax: 10, // max bonus for very recent coverage, decaying by half every RECENCY_HALFLIFE
}
export const RECENCY_HALFLIFE = 180 * 86400e3 // 180 days
export const TOP_N = 10 // sum views over at most this many (top) videos

const round2 = (n) => Math.round(n * 100) / 100

// availability: { sellers, anyStock }. A model with no live in-stock offer is
// heavily damped (still discoverable, just not topping the shop); each seller
// nudges it up a little — breadth of who bothers to stock it is real demand.
export function availabilityFactor({ sellers = 0, anyStock = 0 } = {}) {
  const base = anyStock ? 1 : 0.35 // OOS / import-gap → damped for the buyable grid
  return base * (1 + Math.min(sellers, 5) * 0.05) // up to +25% for broad stocking
}

// videos: [{ views, published_at, excluded? }]. nowMs: current epoch ms.
// Returns { raw, score, signals } — signals is the transparent breakdown stored
// in master_model.pop_signals.
export function popScores({ videos = [], sellers = 0, anyStock = 0, nowMs }) {
  const vids = videos.filter((v) => !v.excluded)
  const top = [...vids].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, TOP_N)
  const viewSum = top.reduce((n, v) => n + (v.views || 0), 0)
  const videoCount = vids.length
  const newest = vids.length ? Math.max(...vids.map((v) => v.published_at || 0)) : 0

  const vTerm = Math.log10(1 + viewSum) * POP_WEIGHTS.views
  const bTerm = Math.log10(1 + videoCount) * POP_WEIGHTS.breadth
  const age = newest ? Math.max(0, nowMs - newest) : Infinity
  const rTerm = Number.isFinite(age) ? POP_WEIGHTS.recencyMax * Math.pow(0.5, age / RECENCY_HALFLIFE) : 0
  const raw = round2(vTerm + bTerm + rTerm)

  const avail = availabilityFactor({ sellers, anyStock })
  const score = round2(raw * avail)
  return {
    raw,
    score,
    signals: {
      viewSum,
      videoCount,
      newest,
      sellers,
      anyStock: anyStock ? 1 : 0,
      avail: round2(avail),
      terms: { views: round2(vTerm), breadth: round2(bTerm), recency: round2(rTerm) },
      at: nowMs,
    },
  }
}
