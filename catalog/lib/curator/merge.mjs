// Merging model pages, and undoing a merge (design § 7). The one write path for
// every merge: the curator, the admin's Merge button and the owner's
// directives.
//
// A hard merge plus a complete snapshot, chosen over a soft merge: keeping B's
// row as status='merged' would keep holding B's slug and its (brand_norm,
// name_norm) under the UNIQUE constraints (0001_init.sql), which would block
// the approved Sky Surfer rename (#67 taking #66's slug), and every public,
// grid, dedup, popularity and manufacturer query would have to learn a new
// status. Here every read path stays as it is, and one click still undoes it.
//
// mergeMasters(env, A, B) — one read (the snapshot), then one batch:
//   1  INSERT merge_undo: B's row and A's row before, B's offers (and the skus
//      both carried), B's videos and A's rows for the same videos, both sides'
//      mfr_match / mfr_candidate / mfr_profile, the aliases pointing at B,
//      every merge_candidate row that mentions either, both sides' field_src
//   2  inherit rejections: each pair the owner rejected with B is rejected
//      with A too ("inherited from #B"), so a rejected pair never comes back
//   3  move offers, videos, manufacturer rows and aliases (as before)
//   4  DELETE the candidate rows that mention B, close the curator's open
//      escalations about B, DELETE B
//   5  THEN update A with the reconciled fields (after the DELETE, so taking
//      B's name or slug cannot hit a UNIQUE conflict), the slug-after-merge
//      rule, field_src, the audit row
// Field reconciliation: each field takes the value with the higher source —
// the owner's > accepted at approval > a directive > the curator at ≥ 0.9 >
// rules / unknown > blank; on a tie the survivor's. Brand and name move as a
// pair; specs key by key ("", null and 0 are blank); blurb, pop_boost and
// hero_image are the survivor's unless blank; role tags by source, united
// when both are the owner's (keeping the survivor's primary tag); power is
// re-derived from all titles.

import { normName, slugify } from '../util.mjs'
import { powerType, normalizeRoleTags } from '../public.mjs'
import { nameLint } from '../product-overview.mjs'
import { nameSmell, CONFIG_WORDS, COLOUR_WORDS } from './validate.mjs'
import { audit } from '../db.mjs'

const q = (env, sql, ...a) => env.CATALOG_DB.prepare(sql).bind(...a)
const parse = (s, d) => { try { return s == null ? d : JSON.parse(s) } catch { return d } }

// True once migration 0018 (slug_alias) is applied. Probed, not assumed.
export const hasSlugAlias = (env) => env.CATALOG_DB.prepare(`SELECT 1 AS ok FROM slug_alias LIMIT 1`).first().then(() => true, () => false)

const OFFER_COLS = ['sku_id', 'config', 'pack_qty', 'note', 'created_at']
const VIDEO_COLS = ['video_id', 'title', 'channel', 'views', 'published_at', 'rank', 'pinned', 'excluded', 'fetched_at']
const MATCH_COLS = ['mfr_product_id', 'score', 'span_agree', 'tier', 'status', 'decided_by', 'decided_at', 'updated_at', 'note']
const MCAND_COLS = ['mfr_product_id', 'rank', 'score', 'name_score', 'span_agree', 'tier', 'reason', 'updated_at']
const PROFILE_COLS = ['source_mfr_product_id', 'overrides_json', 'created_at', 'updated_at', 'updated_by']
const ALIAS_COLS = ['category_id', 'old_slug', 'created_at']
const CAND_COLS = ['id', 'a_id', 'b_id', 'score', 'reason', 'status', 'created_at', 'decided_at', 'ai_verdict', 'keep_id', 'source']
const FSRC_COLS = ['field', 'src', 'confidence', 'run_id', 'at']
const jo = (alias, cols) => `json_object(${cols.map((c) => `'${c}',${alias}.${c}`).join(',')})`
const jx = (cols) => cols.map((c) => `json_extract(value,'$.${c}')`).join(',')
const agg = (alias, cols, from) => `COALESCE((SELECT json_group_array(${jo(alias, cols)}) FROM ${from}),'[]')`

// ------------------------------------------------------------- snapshot
// One statement: both rows (every column, via m.*) with their related rows as
// JSON. Throws when migration 0019 is not applied (merge_undo, field_src).
export async function loadMergeSnapshot(env, aId, bId) {
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT m.*,
       ${agg('o', OFFER_COLS, 'offer o WHERE o.master_model_id=m.id')} AS x_offers,
       (SELECT GROUP_CONCAT(k.title, ' ') FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id) AS x_titles,
       ${agg('v', VIDEO_COLS, 'master_video v WHERE v.master_model_id=m.id AND (m.id=? OR v.video_id IN (SELECT video_id FROM master_video WHERE master_model_id=?))')} AS x_videos,
       ${agg('x', MATCH_COLS, 'mfr_match x WHERE x.master_model_id=m.id')} AS x_match,
       ${agg('x', MCAND_COLS, 'mfr_candidate x WHERE x.master_model_id=m.id')} AS x_mcand,
       ${agg('x', PROFILE_COLS, 'mfr_profile x WHERE x.master_model_id=m.id')} AS x_profile,
       ${agg('s', ALIAS_COLS, 'slug_alias s WHERE s.master_model_id=m.id')} AS x_aliases,
       ${agg('c', CAND_COLS, 'merge_candidate c WHERE c.a_id=m.id OR c.b_id=m.id')} AS x_cands,
       ${agg('f', FSRC_COLS, "field_src f WHERE f.entity='master' AND f.entity_id=m.id")} AS x_fsrc
     FROM master_model m WHERE m.id IN (?, ?)`,
  ).bind(bId, bId, aId, bId).all()).results ?? []
  const split = (r) => {
    if (!r) return null
    const row = {}
    const x = {}
    for (const [k, v] of Object.entries(r)) {
      if (k.startsWith('x_')) x[k.slice(2)] = k === 'x_titles' ? v ?? '' : parse(v, [])
      else row[k] = v
    }
    return { row, x }
  }
  const a = split(rows.find((r) => r.id === aId))
  const b = split(rows.find((r) => r.id === bId))
  if (!a || !b) return null
  return { a, b }
}

// ------------------------------------------------------- field sources
const BLANK = (v) => v == null || (typeof v === 'string' && v.trim() === '') || v === 0 || v === '0'
const SRC_RANK = { owner: 6, 'owner-approved': 5, directive: 4, rules: 2 }
function rankOf(fs, field, value) {
  const r = fs.get(field)
  if (r && (r.src === 'owner' || r.src === 'directive')) return SRC_RANK[r.src] // the owner's word, blank or not
  if (BLANK(value)) return 0
  if (!r) return 2 // set before provenance existed: like rules
  if (r.src === 'curator') return (r.confidence ?? 0) >= 0.9 ? 3 : 2
  return SRC_RANK[r.src] ?? 2
}
const PROTECTED = new Set(['reviewed', 'human'])
const roleRank = (m) => (!m.role_tags ? 0 : PROTECTED.has(m.role_source) ? 6 : m.role_source === 'ai' ? 3 : m.role_source === 'rules' ? 2 : 1)

// Slugs: 45 characters or fewer, no configuration or colour words.
export const slugOk = (s) => {
  const t = String(s ?? '')
  const words = t.replace(/-/g, ' ')
  return t.length > 0 && t.length <= 45 && !CONFIG_WORDS.test(words) && !COLOUR_WORDS.test(words)
}
// A slug "matches" a name when it names the model and adds nothing:
// qidi-560-m7 for QIDI "560 M7".
export function slugMatches(slug, brand, name) {
  const st = new Set(String(slug).split('-').filter(Boolean))
  const full = new Set(slugify(`${brand ?? ''} ${name ?? ''}`).split('-').filter(Boolean))
  const nm = slugify(String(name ?? '')).split('-').filter(Boolean)
  return st.size > 0 && [...st].every((x) => full.has(x)) && nm.every((x) => st.has(x))
}

// ----------------------------------------------------------- the plan
// What A becomes. opts.slugRule (default on): when A's slug fails slugOk and
// B's passes and matches the final name, A takes B's slug (a directive states
// its own slug, so directives turn this off). Returns {set, before, took,
// slugFrom, slugTo, fsrcTake, fsrcDrop}.
export function planMerge(snap, { slugRule = true } = {}) {
  const A = snap.a.row
  const B = snap.b.row
  const fa = new Map(snap.a.x.fsrc.map((r) => [r.field, r]))
  const fb = new Map(snap.b.x.fsrc.map((r) => [r.field, r]))
  const set = {}
  const took = []
  // brand + name, as a pair
  const pair = (m, fs) => Math.max(rankOf(fs, 'brand', m.brand), rankOf(fs, 'name', m.name))
  if (pair(B, fb) > pair(A, fa) && (B.brand !== A.brand || B.name !== A.name)) {
    Object.assign(set, { brand: B.brand, name: B.name, brand_norm: B.brand_norm, name_norm: B.name_norm })
    took.push('brand', 'name')
  }
  // specs, key by key
  const sa = parse(A.specs, {}) ?? {}
  const sb = parse(B.specs, {}) ?? {}
  const specs = { ...sa }
  let specsChanged = false
  for (const k of Object.keys(sb)) {
    const f = `specs.${k}`
    if (BLANK(sb[k]) || String(sa[k] ?? '') === String(sb[k])) continue
    const ra = rankOf(fa, f, sa[k])
    const rb = rankOf(fb, f, sb[k])
    if (rb > ra) {
      specs[k] = sb[k]
      specsChanged = true
      took.push(f)
    }
  }
  if (specsChanged) set.specs = JSON.stringify(specs)
  // blurb, pop_boost, hero image: the survivor's unless blank
  if (BLANK(A.blurb) && !BLANK(B.blurb) && rankOf(fa, 'blurb', A.blurb) < 6) { set.blurb = B.blurb; took.push('blurb') }
  if (A.pop_boost == null && B.pop_boost != null) set.pop_boost = B.pop_boost
  if (A.hero_image == null && B.hero_image != null) set.hero_image = B.hero_image
  // role tags by source; both the owner's → united, the survivor's primary first
  const ra = roleRank(A)
  const rb = roleRank(B)
  if (ra === 6 && rb === 6) {
    const ta = parse(A.role_tags, []) ?? []
    const tb = parse(B.role_tags, []) ?? []
    let u = normalizeRoleTags([...ta, ...tb])
    if (ta[0] && u[0] !== ta[0] && u.includes(ta[0])) u = [ta[0], ...u.filter((x) => x !== ta[0])]
    const tags = JSON.stringify(u)
    if (tags !== A.role_tags) { set.role_tags = tags; took.push('role_tags') }
  } else if (rb > ra) {
    set.role_tags = B.role_tags
    set.role_source = B.role_source
    took.push('role_tags')
  }
  // power from every title the survivor will carry, unless a person set it:
  // an owner or directive lock wins (the survivor's first), and travels with
  // the value (2026-09-30: merges re-derived 'electric' over a locked 'gas').
  const LOCKED = ['owner', 'directive']
  const aPowerLocked = LOCKED.includes(fa.get('power')?.src)
  const bPowerLocked = LOCKED.includes(fb.get('power')?.src)
  const power = aPowerLocked ? A.power : bPowerLocked ? B.power : powerType(`${snap.a.x.titles ?? ''} ${snap.b.x.titles ?? ''}`)
  if (power !== A.power) { set.power = power; if (!aPowerLocked && bPowerLocked) took.push('power') }
  // slug after merge
  let slugTo = null
  const finalBrand = set.brand ?? A.brand
  const finalName = set.name ?? A.name
  const aSlugLocked = ['owner', 'directive'].includes(fa.get('slug')?.src)
  if (slugRule && !aSlugLocked && !slugOk(A.slug) && slugOk(B.slug) && slugMatches(B.slug, finalBrand, finalName)) {
    slugTo = B.slug
    set.slug = B.slug
    took.push('slug')
  }
  const before = Object.fromEntries(Object.keys(set).map((k) => [k, A[k] ?? null]))
  // provenance: a field taken from B takes B's field_src row (or loses A's)
  const fsrcTake = []
  const fsrcDrop = []
  for (const f of took) {
    if (fb.has(f)) fsrcTake.push(fb.get(f))
    else if (fa.has(f)) fsrcDrop.push(f)
  }
  return { set, before, took, slugFrom: slugTo ? A.slug : null, slugTo, fsrcTake, fsrcDrop }
}

// ---------------------------------------------------------- statements
// The merge batch. opts: { actor, reason, t, aliases (slug_alias exists) }.
// Returns { stmts, doc } (doc = the snapshot stored in merge_undo).
export function mergeStatements(env, snap, plan, { actor = 'admin', reason = '', t = Date.now(), aliases = true } = {}) {
  const A = snap.a.row
  const B = snap.b.row
  const aId = A.id
  const bId = B.id
  const lo = (x, y) => [Math.min(x, y), Math.max(x, y)]
  // rejections to inherit: each (B, X) the owner rejected becomes (A, X)
  const candA = new Map(snap.a.x.cands.map((c) => [`${c.a_id}:${c.b_id}`, c]))
  const inserted = []
  const upgraded = []
  for (const c of snap.b.x.cands) {
    if (c.status !== 'rejected') continue
    const x = c.a_id === bId ? c.b_id : c.a_id
    if (x === aId) continue
    const [p, r] = lo(aId, x)
    const have = candA.get(`${p}:${r}`)
    if (!have) { if (!inserted.some(([i, j]) => i === p && j === r)) inserted.push([p, r]) }
    else if (have.status !== 'rejected' && !upgraded.some((u) => u.id === have.id)) upgraded.push({ id: have.id, status: have.status, reason: have.reason, decided_at: have.decided_at })
  }
  const aSkus = new Set(snap.a.x.offers.map((o) => o.sku_id))
  const shared = snap.b.x.offers.filter((o) => aSkus.has(o.sku_id))
  const doc = {
    v: 1,
    a: A,
    b: B,
    offersB: snap.b.x.offers,
    shared: shared.map((o) => o.sku_id),
    videosB: snap.b.x.videos, // B's rows
    videosA: snap.a.x.videos, // A's rows for the same videos (the snapshot query selects only those)
    mfrA: { match: snap.a.x.match, cand: snap.a.x.mcand, profile: snap.a.x.profile },
    mfrB: { match: snap.b.x.match, cand: snap.b.x.mcand, profile: snap.b.x.profile },
    aliasesB: snap.b.x.aliases,
    candsA: snap.a.x.cands,
    candsB: snap.b.x.cands,
    fsrcA: snap.a.x.fsrc,
    fsrcB: snap.b.x.fsrc,
    wrote: { ...plan.set, updated_at: t },
    before: { ...plan.before, updated_at: A.updated_at },
    took: plan.took,
    slugFrom: plan.slugFrom,
    slugTo: plan.slugTo,
    inherited: { inserted, upgraded },
    reason,
  }
  const stmts = [
    q(env, `INSERT INTO merge_undo (action_id, survivor_id, absorbed_id, actor, snapshot, created_at) VALUES (NULL,?,?,?,?,?)`, aId, bId, actor, JSON.stringify(doc), t),
  ]
  if (inserted.length)
    stmts.push(q(env, `INSERT OR IGNORE INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at, source)
      SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), 0, ?, 'rejected', ?, ?, 'owner' FROM json_each(?)
      WHERE EXISTS (SELECT 1 FROM master_model WHERE id=json_extract(value,'$[0]')) AND EXISTS (SELECT 1 FROM master_model WHERE id=json_extract(value,'$[1]'))`,
    `inherited from #${bId}`, t, t, JSON.stringify(inserted)))
  if (upgraded.length)
    stmts.push(q(env, `UPDATE merge_candidate SET status='rejected', reason=?, decided_at=? WHERE id IN (SELECT value FROM json_each(?)) AND status<>'rejected'`,
      `inherited from #${bId}`, t, JSON.stringify(upgraded.map((u) => u.id))))
  // offers: free B's offers from any sku A already carries, re-home the rest
  stmts.push(
    q(env, `DELETE FROM offer WHERE master_model_id=? AND sku_id IN (SELECT sku_id FROM offer WHERE master_model_id=?)`, bId, aId),
    q(env, `UPDATE offer SET master_model_id=? WHERE master_model_id=?`, aId, bId),
    // videos: re-home, merging overlaps without dropping either side's pin/exclude intent
    q(env, `INSERT INTO master_video (master_model_id,video_id,title,channel,views,published_at,rank,pinned,excluded,fetched_at)
       SELECT ?,video_id,title,channel,views,published_at,rank,CASE WHEN excluded=1 THEN 0 ELSE pinned END,excluded,fetched_at
       FROM master_video WHERE master_model_id=?
       ON CONFLICT(master_model_id,video_id) DO UPDATE SET
         title=COALESCE(NULLIF(master_video.title,''),excluded.title),
         channel=COALESCE(NULLIF(master_video.channel,''),excluded.channel),
         views=CASE WHEN master_video.views IS NULL THEN excluded.views WHEN excluded.views IS NULL THEN master_video.views ELSE MAX(master_video.views,excluded.views) END,
         published_at=COALESCE(master_video.published_at,excluded.published_at),
         rank=CASE WHEN master_video.rank IS NULL THEN excluded.rank WHEN excluded.rank IS NULL THEN master_video.rank ELSE MIN(master_video.rank,excluded.rank) END,
         pinned=CASE WHEN MAX(master_video.excluded,excluded.excluded)=1 THEN 0 ELSE MAX(master_video.pinned,excluded.pinned) END,
         excluded=MAX(master_video.excluded,excluded.excluded),
         fetched_at=MAX(master_video.fetched_at,excluded.fetched_at)`, aId, bId),
    q(env, `DELETE FROM master_video WHERE master_model_id=?`, bId),
  )
  // manufacturer rows (only when B has any): B's accepted decision survives
  // when A has none; A stays canonical otherwise
  if (snap.b.x.match.length) {
    stmts.push(
      q(env, `INSERT INTO mfr_match (master_model_id,mfr_product_id,score,span_agree,tier,status,decided_by,decided_at,updated_at,note)
         SELECT ?,mfr_product_id,score,span_agree,tier,status,decided_by,decided_at,updated_at,note FROM mfr_match WHERE master_model_id=? AND status='accepted'
         ON CONFLICT(master_model_id) DO UPDATE SET mfr_product_id=excluded.mfr_product_id, score=excluded.score, span_agree=excluded.span_agree, tier=excluded.tier,
           status=excluded.status, decided_by=excluded.decided_by, decided_at=excluded.decided_at, updated_at=excluded.updated_at, note=excluded.note
         WHERE COALESCE(mfr_match.status,'pending')<>'accepted'`, aId, bId),
      q(env, `INSERT OR IGNORE INTO mfr_match (master_model_id,mfr_product_id,score,span_agree,tier,status,decided_by,decided_at,updated_at,note)
         SELECT ?,mfr_product_id,score,span_agree,tier,status,decided_by,decided_at,updated_at,note FROM mfr_match WHERE master_model_id=?`, aId, bId),
      q(env, `DELETE FROM mfr_match WHERE master_model_id=?`, bId),
    )
  }
  if (snap.b.x.mcand.length) stmts.push(q(env, `DELETE FROM mfr_candidate WHERE master_model_id=?`, bId))
  if (snap.b.x.profile.length) {
    stmts.push(
      q(env, `UPDATE mfr_profile AS survivor
         SET overrides_json=COALESCE((
               SELECT json_group_object(key, json(CASE type WHEN 'text' THEN json_quote(value) WHEN 'null' THEN 'null' WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE value END))
               FROM (
                 SELECT dv.key, dv.value, dv.type FROM mfr_profile dp, json_each(dp.overrides_json) dv
                 WHERE dp.master_model_id=? AND dp.source_mfr_product_id=survivor.source_mfr_product_id
                   AND NOT EXISTS (SELECT 1 FROM json_each(survivor.overrides_json) sv WHERE sv.key=dv.key)
                 UNION ALL SELECT key, value, type FROM json_each(survivor.overrides_json))),'{}'),
             created_at=MIN(survivor.created_at, COALESCE((SELECT dp.created_at FROM mfr_profile dp WHERE dp.master_model_id=? AND dp.source_mfr_product_id=survivor.source_mfr_product_id), survivor.created_at)),
             updated_at=MAX(survivor.updated_at+1, COALESCE((SELECT dp.updated_at+1 FROM mfr_profile dp WHERE dp.master_model_id=? AND dp.source_mfr_product_id=survivor.source_mfr_product_id),0), ?),
             updated_by=?
         WHERE survivor.master_model_id=? AND EXISTS (SELECT 1 FROM mfr_profile dp WHERE dp.master_model_id=? AND dp.source_mfr_product_id=survivor.source_mfr_product_id)`,
      bId, bId, bId, t, actor, aId, bId),
      q(env, `INSERT OR IGNORE INTO mfr_profile (master_model_id,source_mfr_product_id,overrides_json,created_at,updated_at,updated_by)
         SELECT ?,source_mfr_product_id,overrides_json,created_at,updated_at,updated_by FROM mfr_profile WHERE master_model_id=?`, aId, bId),
      q(env, `DELETE FROM mfr_profile WHERE master_model_id=?`, bId),
    )
  }
  // B's public URL keeps working: its slug, and every older slug that pointed
  // at B, now 301 to A. Before the DELETE (slug_alias cascades on delete).
  if (aliases) {
    stmts.push(q(env, `UPDATE slug_alias SET master_model_id=? WHERE master_model_id=?`, aId, bId))
    if (plan.slugTo) {
      // A takes B's slug: A's old address becomes the alias instead
      stmts.push(q(env, `INSERT INTO slug_alias (category_id, old_slug, master_model_id, created_at) VALUES (?,?,?,?)
        ON CONFLICT(category_id, old_slug) DO UPDATE SET master_model_id=excluded.master_model_id, created_at=excluded.created_at`, A.category_id, A.slug, aId, t))
    } else {
      stmts.push(q(env, `INSERT INTO slug_alias (category_id, old_slug, master_model_id, created_at) VALUES (?,?,?,?)
        ON CONFLICT(category_id, old_slug) DO UPDATE SET master_model_id=excluded.master_model_id, created_at=excluded.created_at`, B.category_id, B.slug, aId, t))
    }
  }
  stmts.push(
    q(env, `DELETE FROM merge_candidate WHERE a_id=? OR b_id=?`, bId, bId),
    q(env, `UPDATE curator_action SET status='skipped', evidence=json_set(COALESCE(evidence,'{}'),'$.closed',?)
      WHERE status='planned' AND kind='escalate' AND entity='master' AND (entity_id=? OR other_id=?)`, `#${bId} was merged into #${aId}`, bId, bId),
    q(env, `DELETE FROM master_model WHERE id=?`, bId),
  )
  // A, after B is gone
  const cols = Object.keys(plan.set)
  stmts.push(q(env, `UPDATE master_model SET ${[...cols.map((c) => `${c}=?`), 'updated_at=?', 'pop_score=NULL', 'pop_raw=NULL', 'pop_updated_at=NULL', 'pop_signals=NULL'].join(', ')} WHERE id=?`,
    ...cols.map((c) => plan.set[c]), t, aId))
  // provenance moves with the values
  if (plan.fsrcTake.length)
    stmts.push(q(env, `INSERT INTO field_src (entity, entity_id, field, src, confidence, run_id, at)
      SELECT 'master', ?, ${jx(FSRC_COLS)} FROM json_each(?) WHERE 1
      ON CONFLICT(entity, entity_id, field) DO UPDATE SET src=excluded.src, confidence=excluded.confidence, run_id=excluded.run_id, at=excluded.at`, aId, JSON.stringify(plan.fsrcTake)))
  if (plan.fsrcDrop.length) stmts.push(q(env, `DELETE FROM field_src WHERE entity='master' AND entity_id=? AND field IN (SELECT value FROM json_each(?))`, aId, JSON.stringify(plan.fsrcDrop)))
  if (snap.b.x.fsrc.length) stmts.push(q(env, `DELETE FROM field_src WHERE entity='master' AND entity_id=?`, bId))
  stmts.push(audit(env, actor, 'merge-master', 'master_model', bId, { into: aId, reason, slug: B.slug, took: plan.took, ...(plan.slugTo ? { newSlug: plan.slugTo } : {}) }))
  return { stmts, doc }
}

// Merge master B into A. Same signature as before, used by every caller.
// opts: { slugRule, t }. Returns { survivor, absorbed, took, slug, undoId } or
// null when either is missing. Throws a clear error before migration 0019.
export async function mergeMasters(env, aId, bId, actor, reason, opts = {}) {
  if (aId === bId) return null
  let snap
  try {
    snap = await loadMergeSnapshot(env, aId, bId)
  } catch (e) {
    if (/no such (table|column)/i.test(String(e?.message ?? e))) throw new Error('Apply migration 0019_curator first: a merge now keeps a snapshot so it can be undone.')
    throw e
  }
  if (!snap) return null
  const t = opts.t ?? Date.now()
  const plan = planMerge(snap, opts)
  const { stmts } = mergeStatements(env, snap, plan, { actor, reason, t, aliases: true })
  await env.CATALOG_DB.batch(stmts)
  const undo = await env.CATALOG_DB.prepare(`SELECT id FROM merge_undo WHERE survivor_id=? AND absorbed_id=? AND undone_at IS NULL ORDER BY id DESC LIMIT 1`).bind(aId, bId).first()
  return { survivor: aId, absorbed: bId, took: plan.took, slug: plan.slugTo, undoId: undo?.id ?? null }
}

// ---------------------------------------------------------------- undo
// POST /api/unmerge {undoId}. One read of the page in the way, then one batch.
// Refuses when the snapshot is already undone, A is gone (merged on), or B's
// slug or (brand, name) is now someone else's (the error names the page).
// Each of A's fields is reverted only if it still holds the value the merge
// wrote; later edits are kept and listed. The pair is then rejected
// ('owner: unmerged'), so it is never proposed or merged again.
export async function unmergeMasters(env, undoId, actor = 'admin', t = Date.now()) {
  const u = await env.CATALOG_DB.prepare(`SELECT * FROM merge_undo WHERE id=?`).bind(undoId).first()
  if (!u) return { ok: false, status: 404, error: 'unknown merge' }
  if (u.undone_at) return { ok: false, status: 409, error: 'this merge was already undone' }
  const s = parse(u.snapshot, null)
  if (!s?.a || !s?.b) return { ok: false, status: 500, error: 'the merge snapshot is unreadable' }
  const A = s.a
  const B = s.b
  const cur = (await env.CATALOG_DB.prepare(
    `SELECT * FROM master_model WHERE id=? OR id=? OR (category_id=? AND (slug=? OR (brand_norm=? AND name_norm=?)))`,
  ).bind(A.id, B.id, B.category_id, B.slug, B.brand_norm, B.name_norm).all()).results ?? []
  const aNow = cur.find((r) => r.id === A.id)
  if (!aNow) return { ok: false, status: 409, error: `#${A.id} no longer exists; undo the later merge that absorbed it first` }
  if (cur.some((r) => r.id === B.id)) return { ok: false, status: 409, error: `#${B.id} exists again` }
  // A after the revert: each written column goes back only if still as written
  const wrote = s.wrote ?? {}
  const before = s.before ?? {}
  const aAfter = { ...aNow }
  const kept = []
  for (const [c, v] of Object.entries(wrote)) {
    if (c === 'updated_at') continue
    if (aNow[c] === v) aAfter[c] = before[c] ?? null
    else kept.push(c)
  }
  const other = cur.find((r) => r.id !== A.id && r.id !== B.id && r.slug === B.slug) ?? (aAfter.slug === B.slug ? aNow : null)
  if (other) return { ok: false, status: 409, error: `#${other.id} "${other.name}" now uses the address ${B.slug}` }
  const clash = cur.find((r) => r.id !== A.id && r.id !== B.id && r.brand_norm === B.brand_norm && r.name_norm === B.name_norm) ??
    (aAfter.brand_norm === B.brand_norm && aAfter.name_norm === B.name_norm ? aNow : null)
  if (clash) return { ok: false, status: 409, error: `#${clash.id} "${clash.name}" now has the same brand and name as #${B.id}` }

  const stmts = []
  // 1 A's fields (CAS on the written values; updated_at too)
  const revertCols = Object.keys(wrote).filter((c) => c === 'updated_at' || !kept.includes(c))
  if (revertCols.length) {
    const sets = []
    const args = []
    for (const c of revertCols) {
      sets.push(`${c} = CASE WHEN ${c} IS ? THEN ? ELSE ${c} END`)
      args.push(wrote[c], before[c] ?? null)
    }
    stmts.push(q(env, `UPDATE master_model SET ${sets.join(', ')}, pop_score=NULL, pop_raw=NULL, pop_updated_at=NULL, pop_signals=NULL WHERE id=?`, ...args, A.id))
  }
  // 2 B back, with its id and every column (popularity cleared)
  const bCols = Object.keys(B).filter((c) => /^[a-z_][a-z0-9_]*$/.test(c))
  const bRow = { ...B, pop_score: null, pop_raw: null, pop_updated_at: null, pop_signals: null }
  stmts.push(q(env, `INSERT INTO master_model (${bCols.join(',')}) VALUES (${bCols.map(() => '?').join(',')})`, ...bCols.map((c) => bRow[c] ?? null)))
  // 3 addresses: B's slug is live again; its old aliases point at B again
  stmts.push(q(env, `DELETE FROM slug_alias WHERE category_id=? AND old_slug=?`, B.category_id, B.slug))
  if (s.slugFrom && !kept.includes('slug')) stmts.push(q(env, `DELETE FROM slug_alias WHERE category_id=? AND old_slug=? AND master_model_id=?`, A.category_id, s.slugFrom, A.id))
  if (s.aliasesB?.length)
    stmts.push(q(env, `UPDATE slug_alias SET master_model_id=? WHERE master_model_id=? AND old_slug IN (SELECT json_extract(value,'$.old_slug') FROM json_each(?))`, B.id, A.id, JSON.stringify(s.aliasesB)))
  // 4 offers: B's move back from A (only those still on A); shared ones are re-inserted
  const shared = new Set(s.shared ?? [])
  const own = (s.offersB ?? []).filter((o) => !shared.has(o.sku_id)).map((o) => o.sku_id)
  if (own.length) stmts.push(q(env, `UPDATE offer SET master_model_id=? WHERE master_model_id=? AND sku_id IN (SELECT value FROM json_each(?))`, B.id, A.id, JSON.stringify(own)))
  const sharedRows = (s.offersB ?? []).filter((o) => shared.has(o.sku_id))
  if (sharedRows.length)
    stmts.push(q(env, `INSERT OR IGNORE INTO offer (sku_id, master_model_id, config, pack_qty, note, created_at)
      SELECT json_extract(value,'$.sku_id'), ?, json_extract(value,'$.config'), json_extract(value,'$.pack_qty'), json_extract(value,'$.note'), json_extract(value,'$.created_at')
      FROM json_each(?) WHERE EXISTS (SELECT 1 FROM offer o WHERE o.master_model_id=? AND o.sku_id=json_extract(value,'$.sku_id'))`, B.id, JSON.stringify(sharedRows), A.id))
  // 5 videos: B's rows, and A's rows as they were before the merge
  if (s.videosB?.length) {
    stmts.push(q(env, `DELETE FROM master_video WHERE master_model_id=? AND video_id IN (SELECT json_extract(value,'$.video_id') FROM json_each(?))`, A.id, JSON.stringify(s.videosB)))
    if (s.videosA?.length) stmts.push(q(env, `INSERT OR REPLACE INTO master_video (master_model_id, ${VIDEO_COLS.join(',')}) SELECT ?, ${jx(VIDEO_COLS)} FROM json_each(?)`, A.id, JSON.stringify(s.videosA)))
    stmts.push(q(env, `INSERT OR REPLACE INTO master_video (master_model_id, ${VIDEO_COLS.join(',')}) SELECT ?, ${jx(VIDEO_COLS)} FROM json_each(?)`, B.id, JSON.stringify(s.videosB)))
  }
  // 6 manufacturer rows: both sides as before (only if the merge touched them)
  const mB = s.mfrB ?? {}
  const mA = s.mfrA ?? {}
  if (mB.match?.length) {
    stmts.push(q(env, `DELETE FROM mfr_match WHERE master_model_id=?`, A.id))
    if (mA.match?.length) stmts.push(q(env, `INSERT INTO mfr_match (master_model_id, ${MATCH_COLS.join(',')}) SELECT ?, ${jx(MATCH_COLS)} FROM json_each(?)`, A.id, JSON.stringify(mA.match)))
    stmts.push(q(env, `INSERT OR REPLACE INTO mfr_match (master_model_id, ${MATCH_COLS.join(',')}) SELECT ?, ${jx(MATCH_COLS)} FROM json_each(?)`, B.id, JSON.stringify(mB.match)))
  }
  if (mB.cand?.length) stmts.push(q(env, `INSERT OR REPLACE INTO mfr_candidate (master_model_id, ${MCAND_COLS.join(',')}) SELECT ?, ${jx(MCAND_COLS)} FROM json_each(?)`, B.id, JSON.stringify(mB.cand)))
  if (mB.profile?.length) {
    stmts.push(q(env, `DELETE FROM mfr_profile WHERE master_model_id=?`, A.id))
    if (mA.profile?.length) stmts.push(q(env, `INSERT INTO mfr_profile (master_model_id, ${PROFILE_COLS.join(',')}) SELECT ?, ${jx(PROFILE_COLS)} FROM json_each(?) WHERE EXISTS (SELECT 1 FROM mfr_product p WHERE p.id=json_extract(value,'$.source_mfr_product_id'))`, A.id, JSON.stringify(mA.profile)))
    stmts.push(q(env, `INSERT OR REPLACE INTO mfr_profile (master_model_id, ${PROFILE_COLS.join(',')}) SELECT ?, ${jx(PROFILE_COLS)} FROM json_each(?) WHERE EXISTS (SELECT 1 FROM mfr_product p WHERE p.id=json_extract(value,'$.source_mfr_product_id'))`, B.id, JSON.stringify(mB.profile)))
  }
  // 7 candidates: drop what this merge inherited, restore what it changed and
  // B's own rows, then reject the pair for good
  const inh = s.inherited ?? {}
  if (inh.inserted?.length)
    stmts.push(q(env, `DELETE FROM merge_candidate WHERE reason=? AND status='rejected' AND EXISTS (SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$[0]')=merge_candidate.a_id AND json_extract(j.value,'$[1]')=merge_candidate.b_id)`,
      `inherited from #${B.id}`, JSON.stringify(inh.inserted)))
  if (inh.upgraded?.length)
    stmts.push(q(env, `UPDATE merge_candidate SET status=json_extract(j.value,'$.status'), reason=json_extract(j.value,'$.reason'), decided_at=json_extract(j.value,'$.decided_at')
      FROM json_each(?) j WHERE merge_candidate.id=json_extract(j.value,'$.id') AND merge_candidate.reason=?`, JSON.stringify(inh.upgraded), `inherited from #${B.id}`))
  if (s.candsB?.length)
    stmts.push(q(env, `INSERT OR IGNORE INTO merge_candidate (${CAND_COLS.join(',')}) SELECT ${jx(CAND_COLS)} FROM json_each(?)
      WHERE EXISTS (SELECT 1 FROM master_model WHERE id=json_extract(value,'$.a_id')) AND EXISTS (SELECT 1 FROM master_model WHERE id=json_extract(value,'$.b_id'))`, JSON.stringify(s.candsB)))
  const [lo, hi] = [Math.min(A.id, B.id), Math.max(A.id, B.id)]
  stmts.push(q(env, `INSERT INTO merge_candidate (a_id, b_id, score, reason, status, created_at, decided_at, source) VALUES (?,?,0,'owner: unmerged','rejected',?,?,'owner')
    ON CONFLICT(a_id, b_id) DO UPDATE SET status='rejected', reason='owner: unmerged', decided_at=excluded.decided_at`, lo, hi, t, t))
  // 8 provenance: B's rows back; A's rows for the reverted fields as before
  if (s.fsrcB?.length) stmts.push(q(env, `INSERT OR REPLACE INTO field_src (entity, entity_id, ${FSRC_COLS.join(',')}) SELECT 'master', ?, ${jx(FSRC_COLS)} FROM json_each(?)`, B.id, JSON.stringify(s.fsrcB)))
  const revertedFields = (s.took ?? []).filter((f) => {
    const col = f.startsWith('specs.') ? 'specs' : f === 'role_tags' ? 'role_tags' : f
    return !kept.includes(col)
  })
  if (revertedFields.length) {
    stmts.push(q(env, `DELETE FROM field_src WHERE entity='master' AND entity_id=? AND field IN (SELECT value FROM json_each(?))`, A.id, JSON.stringify(revertedFields)))
    const aRows = (s.fsrcA ?? []).filter((r) => revertedFields.includes(r.field))
    if (aRows.length) stmts.push(q(env, `INSERT OR REPLACE INTO field_src (entity, entity_id, ${FSRC_COLS.join(',')}) SELECT 'master', ?, ${jx(FSRC_COLS)} FROM json_each(?)`, A.id, JSON.stringify(aRows)))
  }
  // 9 records
  stmts.push(
    q(env, `UPDATE merge_undo SET undone_at=? WHERE id=? AND undone_at IS NULL`, t, u.id),
    q(env, `UPDATE curator_action SET status='undone', undone_at=?, undone_by=? WHERE kind IN ('merge','directive') AND status='applied' AND entity='master' AND entity_id=? AND other_id=?`, t, actor, A.id, B.id),
    audit(env, actor, 'unmerge', 'master_model', B.id, { from: A.id, undo: u.id, kept }),
  )
  await env.CATALOG_DB.batch(stmts)
  return { ok: true, survivor: A.id, restored: B.id, slug: B.slug, kept }
}

// ------------------------------------------------------- attach, rename
// Attach a listing to a model page (the admin's attach, and the curator's
// auto-attach). onlyNew: the listing must still be pending (the curator's
// compare-and-set). Returns the statements.
export function attachSku(env, skuId, masterId, config = 'kit', packQty = 1, actor = 'admin', { t = Date.now(), onlyNew = false } = {}) {
  if (onlyNew)
    return [
      q(env, `UPDATE sku SET review_status='approved', reviewed_at=? WHERE id=? AND review_status='new'`, t, skuId),
      q(env, `INSERT OR IGNORE INTO offer (sku_id, master_model_id, config, pack_qty, created_at) SELECT ?,?,?,?,?
        WHERE EXISTS (SELECT 1 FROM sku WHERE id=? AND review_status='approved' AND reviewed_at=?) AND EXISTS (SELECT 1 FROM master_model WHERE id=?)`,
      skuId, masterId, config, packQty, t, skuId, t, masterId),
      q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) SELECT id, ?, NULL, price_inr, in_stock FROM sku WHERE id=? AND reviewed_at=?`, t, skuId, t),
      audit(env, actor, 'approve-attach', 'sku', skuId, { master: masterId, config, packQty }),
    ]
  return [
    q(env, `INSERT OR IGNORE INTO offer (sku_id, master_model_id, config, pack_qty, created_at) VALUES (?,?,?,?,?)`, skuId, masterId, config, packQty, t),
    q(env, `UPDATE sku SET review_status='approved', reviewed_at=? WHERE id=?`, t, skuId),
    // snapshot the good price at approval: a guaranteed D1 recovery point
    q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) SELECT id, ?, NULL, price_inr, in_stock FROM sku WHERE id=?`, t, skuId),
    audit(env, actor, 'approve-attach', 'sku', skuId, { master: masterId }),
  ]
}

// Rename (name and/or slug and/or brand) with the admin's alias statements:
// the old address 301s to the page, the new one is nobody's alias.
export function renameStatements(env, m, { name = null, slug = null, brand = null } = {}, t = Date.now()) {
  const sets = []
  const args = []
  if (name != null && name !== m.name) { sets.push('name=?', 'name_norm=?'); args.push(name, normName(name)) }
  if (brand != null && brand !== m.brand) { sets.push('brand=?', 'brand_norm=?'); args.push(brand, normName(brand)) }
  const newSlug = slug && slug !== m.slug ? slug : null
  if (newSlug) { sets.push('slug=?'); args.push(newSlug) }
  if (!sets.length) return []
  const out = [q(env, `UPDATE master_model SET ${sets.join(', ')}, updated_at=? WHERE id=?`, ...args, t, m.id)]
  if (newSlug)
    out.push(
      q(env, `INSERT INTO slug_alias (category_id, old_slug, master_model_id, created_at) VALUES (?,?,?,?)
        ON CONFLICT(category_id, old_slug) DO UPDATE SET master_model_id=excluded.master_model_id, created_at=excluded.created_at`, m.category_id, m.slug, m.id, t),
      q(env, `DELETE FROM slug_alias WHERE category_id=? AND old_slug=?`, m.category_id, newSlug),
    )
  return out
}

// A new DRAFT page from a pending listing (never public; the owner
// publishes). The same SQL as the admin's approve, CAS'd on the listing still
// being pending. Returns the statements.
export function draftStatements(env, d, t = Date.now()) {
  const specs = JSON.stringify({ spanMM: d.spanMM })
  return [
    q(env, `UPDATE sku SET review_status='approved', reviewed_at=? WHERE id=? AND review_status='new'`, t, d.skuId),
    q(env, `INSERT INTO master_model (category_id, slug, brand, name, brand_norm, name_norm, specs, hero_image, status, power, created_at, updated_at)
      SELECT ?,?,?,?,?,?,?,?,'draft',?,?,? WHERE EXISTS (SELECT 1 FROM sku WHERE id=? AND review_status='approved' AND reviewed_at=?)`,
    d.catId, d.slug, d.brand, d.name, normName(d.brand), normName(d.name), specs, d.image ?? null, d.power ?? 'electric', t, t, d.skuId, t),
    q(env, `INSERT INTO offer (sku_id, master_model_id, config, pack_qty, created_at) SELECT ?, id, ?, ?, ? FROM master_model WHERE category_id=? AND slug=? AND created_at=?`,
      d.skuId, d.config ?? 'kit', d.packQty ?? 1, t, d.catId, d.slug, t),
    q(env, `INSERT INTO observation (sku_id, at, vkey, price_inr, in_stock) SELECT id, ?, NULL, price_inr, in_stock FROM sku WHERE id=? AND reviewed_at=?`, t, d.skuId, t),
    q(env, `INSERT OR IGNORE INTO field_src (entity, entity_id, field, src, confidence, run_id, at)
      SELECT 'master', m.id, f.field, 'curator', ?, ?, ? FROM master_model m
      CROSS JOIN (SELECT 'brand' AS field UNION ALL SELECT 'name' UNION ALL SELECT 'slug' UNION ALL SELECT 'specs.spanMM') f
      WHERE m.category_id=? AND m.slug=? AND m.created_at=?`, d.confidence ?? null, d.runId ?? null, t, d.catId, d.slug, t),
    audit(env, d.actor ?? 'curator', 'curator-draft', 'sku', d.skuId, { slug: d.slug }),
  ]
}

// ------------------------------------------------------------ survivor
// Which page stays (design § 6), highest first: ready over draft; more live
// sellers; the owner's work on the page (locked fields, reviewed or human
// role tags, pinned videos, an accepted manufacturer match); more approved
// offers; a name that passes nameLint and does not smell of a seller title; a
// slug of 45 characters or fewer with no configuration or colour words; the
// lower id (the older URL). The curator, the Duplicates tab and
// merge_candidate.keep_id all use this.
export const nameOk = (m) => !nameLint(m.name) && !nameSmell(m.name, m.brand)
export const survivorRank = (m) => [
  m.status === 'ready' ? 0 : 1,
  -(m.live_sellers ?? 0),
  -(m.owner_work ?? 0),
  -(m.approved_offers ?? m.offers ?? 0),
  nameOk(m) ? 0 : 1,
  slugOk(m.slug) ? 0 : 1,
  m.id,
]
export function pickSurvivor(list) {
  return list.reduce((x, y) => {
    const rx = survivorRank(x)
    const ry = survivorRank(y)
    for (let i = 0; i < rx.length; i++) if (rx[i] !== ry[i]) return rx[i] < ry[i] ? x : y
    return x
  })
}

// The facts pickSurvivor needs, for a set of ids, in one statement.
export async function survivorInfo(env, ids, { fieldSrc = true } = {}) {
  const list = [...new Set(ids)].filter((x) => Number.isInteger(x))
  if (!list.length) return new Map()
  const rows = (await env.CATALOG_DB.prepare(
    `SELECT m.id, m.status, m.brand, m.name, m.slug, m.role_source, m.category_id,
       (SELECT COUNT(DISTINCT k.source_id) FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id AND k.review_status='approved' AND k.in_stock=1 AND k.dead=0) AS live_sellers,
       (SELECT COUNT(*) FROM offer o JOIN sku k ON k.id=o.sku_id WHERE o.master_model_id=m.id AND k.review_status='approved') AS approved_offers,
       (CASE WHEN m.role_source IN ('reviewed','human') THEN 1 ELSE 0 END)
         + (SELECT COUNT(*) FROM master_video v WHERE v.master_model_id=m.id AND v.pinned=1)
         + (SELECT COUNT(*) FROM mfr_match x WHERE x.master_model_id=m.id AND x.status='accepted')
         ${fieldSrc ? "+ (SELECT COUNT(*) FROM field_src f WHERE f.entity='master' AND f.entity_id=m.id AND f.src IN ('owner','directive'))" : ''} AS owner_work
     FROM master_model m WHERE m.id IN (${list.map(() => '?').join(',')})`,
  ).bind(...list).all()).results ?? []
  return new Map(rows.map((r) => [r.id, r]))
}
