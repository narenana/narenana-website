// A D1-compatible database for unit tests: real SQLite (node:sqlite) with
// every migration in catalog/migrations applied and foreign keys on, as in
// D1. Implements the part of the D1 API the catalog uses: prepare, bind,
// first, all, run, raw and batch (atomic).
//
//   const db = makeD1()            // all migrations
//   const env = { CATALOG_DB: db }
//   db.sql('SELECT …')             // test helper: rows, no D1 wrapping

import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url))

// D1 rejects undefined and converts booleans; node:sqlite accepts neither.
const bindable = (v, i) => {
  if (v === undefined) throw new TypeError(`D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined' (parameter ${i + 1})`)
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}
const returnsRows = (sql) => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql)

class Stmt {
  constructor(d1, sql, args = []) {
    this.d1 = d1
    this.sql = sql
    this.args = args
  }
  bind(...args) { return new Stmt(this.d1, this.sql, args.map(bindable)) }
  #prep() { this.d1.statements++; return this.d1.db.prepare(this.sql) }
  async first(col) {
    const row = this.#prep().get(...this.args) ?? null
    return row && col ? row[col] ?? null : row
  }
  async all() { return this._all() }
  _all() {
    const p = this.#prep()
    if (returnsRows(this.sql)) return { success: true, results: p.all(...this.args), meta: {} }
    const r = p.run(...this.args)
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }
  }
  async run() { return this._all() }
  async raw() { return this._all().results.map((r) => Object.values(r)) }
}

export function makeD1({ migrations = true, upTo = null, path = ':memory:' } = {}) {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  const d1 = {
    db,
    statements: 0,
    batches: 0,
    prepare: (sql) => new Stmt(d1, sql),
    async batch(stmts) {
      d1.batches++
      db.exec('BEGIN')
      try {
        const out = stmts.map((s) => s._all())
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    async exec(sql) { db.exec(sql); return { count: 1 } },
    // test helpers
    sql: (q, ...args) => db.prepare(q).all(...args.map(bindable)),
    one: (q, ...args) => db.prepare(q).get(...args.map(bindable)) ?? null,
    run: (q, ...args) => db.prepare(q).run(...args.map(bindable)),
  }
  if (migrations) {
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
      if (upTo && f > upTo) break
      db.exec(readFileSync(MIGRATIONS + f, 'utf8'))
    }
    // The curator tests are written against migration 0019's Free-plan
    // defaults; 0020 tunes production for Workers Paid (scale 10, cap 20000).
    db.exec(`UPDATE setting SET v='1' WHERE k='curator_scale'; UPDATE setting SET v='8000' WHERE k='curator_neuron_cap'`)
  }
  return d1
}

// Minimal fixtures: a source + URL in the wings category, then masters,
// listings and offers. Returns the ids.
export function seedBasics(d1, t = 1790000000000) {
  d1.run(`INSERT INTO source (id, name, home_url, platform, created_at, updated_at) VALUES ('shopa','Shop A','https://a.example','shopify',?,?), ('shopb','Shop B','https://b.example','shopify',?,?)`, t, t, t, t)
  d1.run(`INSERT INTO source_url (id, source_id, url_canonical, url_raw, created_at) VALUES (1,'shopa','https://a.example/c','https://a.example/c',?), (2,'shopb','https://b.example/c','https://b.example/c',?)`, t, t)
  d1.run(`INSERT INTO source_url_category (source_url_id, category_id) VALUES (1,'wings'), (2,'wings')`)
}

let skuSeq = 0
export function addSku(d1, { id, source = 'shopa', title, status = 'new', inStock = 1, guess = null, desc = null, enriched = true, t = 1790000000000 }) {
  const sid = id ?? 1000 + ++skuSeq
  d1.run(`INSERT INTO sku (id, source_id, source_url_id, url_canonical, url_raw, title, price_inr, in_stock, review_status, first_seen, last_seen, guess, enriched_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    sid, source, source === 'shopa' ? 1 : 2, `https://${source}.example/p/${sid}`, `https://${source}.example/p/${sid}`, title, 5000, inStock, status, t + sid, t, guess ? JSON.stringify(guess) : null, enriched ? t : null)
  if (desc) d1.run(`INSERT INTO sku_snapshot (sku_id, hash, description, fetched_at, updated_at) VALUES (?,?,?,?,?)`, sid, 'h' + sid, desc, t, t)
  return sid
}

export function addMaster(d1, { id, brand = '', name, slug, specs = {}, status = 'ready', power = 'electric', roleTags = null, roleSource = null, t = 1790000000000 }) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  d1.run(`INSERT INTO master_model (id, category_id, slug, brand, name, brand_norm, name_norm, specs, status, power, role_tags, role_source, created_at, updated_at)
          VALUES (?, 'wings', ?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, slug ?? `m-${id}`, brand, name, norm(brand), norm(name), JSON.stringify(specs), status, power, roleTags ? JSON.stringify(roleTags) : null, roleSource, t, t)
  return id
}

export function addOffer(d1, skuId, masterId, config = 'kit', t = 1790000000000) {
  d1.run(`UPDATE sku SET review_status='approved' WHERE id=?`, skuId)
  d1.run(`INSERT INTO offer (sku_id, master_model_id, config, pack_qty, created_at) VALUES (?,?,?,1,?)`, skuId, masterId, config, t)
}
