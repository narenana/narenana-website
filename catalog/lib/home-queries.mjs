// Homepage catalog queries. The homepage is not a catalog route, so it runs on
// every uncached view: keep these cheap and PIN the join order.
//
// SQLite picks join order per query. For the seller count it chose
// sku → (every ready model) → offer probe: a near-cartesian loop costing
// ~474,000 D1 row reads per homepage view (584 approved skus × 406 models × 2),
// which would exhaust the Free plan's 5M/day read quota in ~10 views and take
// every D1 query in the account down with it. CROSS JOIN forces the order
// master_model → offer (idx_offer_master) → sku (primary key): ~1,600 rows.

// A listing that proves a model is buyable right now: approved, still listed,
// in stock, not held for review, with a real price.
const LIVE_PRICED = `k.review_status='approved' AND k.dead=0 AND k.in_stock=1
  AND COALESCE(k.flagged,'')='' AND k.price_inr>0`

const USED = `(LOWER(k.title) LIKE '%pre-owned%' OR LOWER(k.title) LIKE '%pre owned%'
  OR LOWER(k.title) LIKE '%preowned%' OR LOWER(k.title) LIKE '%sparingly used%'
  OR LOWER(k.title) LIKE '%(used)%' OR LOWER(k.title) LIKE '%refurbished%')`

// Sellers with at least one live, priced listing on a published model.
export const HOME_SELLER_COUNT_SQL = `SELECT COUNT(DISTINCT k.source_id) AS n
  FROM master_model m
  CROSS JOIN offer o ON o.master_model_id=m.id
  CROSS JOIN sku k ON k.id=o.sku_id
  WHERE m.category_id=? AND m.status='ready' AND ${LIVE_PRICED}`

// Four most popular in-stock models with a live price and an image. Price
// prefers a new single unit, falling back to any live priced listing.
export const HOME_CARDS_SQL = `SELECT m.id, m.slug, m.brand, m.name, m.specs,
    COALESCE(m.hero_image, MIN(CASE WHEN k.dead=0 THEN k.image_url END)) AS hero,
    COALESCE(
      MIN(CASE WHEN ${LIVE_PRICED} AND o.pack_qty=1 AND NOT ${USED} THEN k.price_inr END),
      MIN(CASE WHEN ${LIVE_PRICED} THEN k.price_inr END)) AS price,
    MIN(CASE WHEN ${LIVE_PRICED} THEN COALESCE(k.last_checked,k.last_seen) END) AS checked_at
  FROM master_model m
  CROSS JOIN offer o ON o.master_model_id=m.id
  CROSS JOIN sku k ON k.id=o.sku_id AND k.review_status='approved'
  WHERE m.category_id=? AND m.status='ready'
  GROUP BY m.id HAVING price IS NOT NULL AND hero IS NOT NULL
  ORDER BY COALESCE(m.pop_score, 0) DESC, m.id ASC LIMIT 4`

// One D1 round trip for both.
export const homeCatalogQueries = (db, catId) => [
  db.prepare(HOME_SELLER_COUNT_SQL).bind(catId),
  db.prepare(HOME_CARDS_SQL).bind(catId),
]
