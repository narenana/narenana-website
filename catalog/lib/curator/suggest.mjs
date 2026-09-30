// Report-time suggestions for the owner (design § 6 "Slug after a merge",
// § 17). Nothing here changes a page; each is a one-click item in the AI
// curator tab.
//
//   slug-suggestion   a page whose address fails the slug check (over 45
//                     characters, or configuration or colour words) and was
//                     not merged: its clean address, when free and not
//                     reserved. Pages never get a new slug automatically.
//   name-suggestion   (restore) an old automatic merge (dedup, before the
//                     curator) absorbed a page whose name the owner had
//                     cleaned, and the survivor still has another name:
//                     "restore your name 'P-51D Mustang 750mm (768-1)' on
//                     #120?".

import { slugOk } from './merge.mjs'
import { slugify } from '../util.mjs'
import { resolveLanding } from '../grid-next.mjs'
import { inputHash } from '../ai.mjs'
import { openActionKeys, actionKey, loadLocks, isLocked } from './store.mjs'

const parse = (s, d) => { try { return s ? JSON.parse(s) : d } catch { return d } }
const MAX_PER_RUN = 20 // slug suggestions per run: low priority, a few at a time
const HUMAN = ['admin', 'owner (seo-2026-09 names)', 'owner (seo-2026-09 aliases)']

export async function suggestPhase(ctx) {
  if (ctx.cursor.scope || ctx.cursor.suggested) return
  ctx.cursor.suggested = true
  const env = ctx.env
  const masters = (await env.CATALOG_DB.prepare(`SELECT id, category_id, slug, brand, name FROM master_model WHERE status IN ('ready','draft')`).all()).results ?? []
  const taken = new Map()
  for (const m of masters) taken.set(`${m.category_id}|${m.slug}`, m.id)
  const aliases = new Map(((await env.CATALOG_DB.prepare(`SELECT category_id, old_slug, master_model_id FROM slug_alias`).all()).results ?? []).map((a) => [`${a.category_id}|${a.old_slug}`, a.master_model_id]))
  const absorbed = new Set(ctx.cursor.absorbed ?? [])
  const out = []
  for (const m of masters) {
    if (out.length >= MAX_PER_RUN) break
    if (absorbed.has(m.id) || slugOk(m.slug)) continue
    const to = slugify(`${m.brand ?? ''} ${m.name ?? ''}`)
    if (!to || to === m.slug || !/^[a-z0-9-]{3,60}$/.test(to) || !slugOk(to) || to === 'browse' || resolveLanding(to)) continue
    const other = taken.get(`${m.category_id}|${to}`)
    const alias = aliases.get(`${m.category_id}|${to}`)
    if ((other && other !== m.id) || (alias && alias !== m.id)) continue
    out.push({ m, to })
  }
  // restore the owner's names that an old automatic merge carried away
  const lost = (await env.CATALOG_DB.prepare(
    `SELECT a.entity_id AS absorbed, CASE WHEN json_valid(a.detail) THEN json_extract(a.detail,'$.into') END AS survivor, a.at,
       (SELECT u.detail FROM audit u WHERE u.action='master-update' AND u.entity_id=a.entity_id AND u.actor IN (${HUMAN.map(() => '?').join(',')})
          AND u.detail LIKE '%"name":%' ORDER BY u.id DESC LIMIT 1) AS edit
     FROM audit a WHERE a.action='merge-master' AND a.actor='auto' ORDER BY a.id DESC LIMIT 50`,
  ).bind(...HUMAN).all()).results ?? []
  const byId = new Map(masters.map((m) => [m.id, m]))
  const restore = []
  for (const r of lost) {
    const name = parse(r.edit, null)?.name
    const s = byId.get(Number(r.survivor))
    if (!s || typeof name !== 'string' || !name.trim() || name === s.name) continue
    restore.push({ m: s, name: name.trim(), absorbed: r.absorbed, at: r.at })
  }
  const ids = [...new Set([...out.map((x) => x.m.id), ...restore.map((x) => x.m.id)])]
  if (!ids.length) return
  const seen = await openActionKeys(env, 'master', ids)
  const locks = await loadLocks(env, 'master', ids)
  for (const { m, to } of out) {
    if (isLocked(locks, m.id, 'slug')) continue
    const hash = await inputHash({ issue: 'slug-suggestion', slug: m.slug, to })
    if (seen.has(actionKey('escalate', m.id, 'slug', 'slug-suggestion', hash))) continue
    ctx.escalate({ entity: 'master', entityId: m.id, inputHash: hash, before: { field: 'slug', value: m.slug }, after: { field: 'slug', value: to },
      evidence: { issue: 'slug-suggestion', why: `the address "${m.slug}" ${m.slug.length > 45 ? 'is over 45 characters' : 'has configuration or colour words'}; the old one would redirect`, priority: 'low' } })
    ctx.count('slug_suggestions')
  }
  for (const { m, name, absorbed, at } of restore) {
    if (isLocked(locks, m.id, 'name')) continue
    const hash = await inputHash({ issue: 'name-restore', name, cur: m.name })
    if (seen.has(actionKey('escalate', m.id, 'name', 'name-suggestion', hash))) continue
    ctx.escalate({ entity: 'master', entityId: m.id, otherId: null, inputHash: hash, before: { field: 'name', value: m.name }, after: { field: 'name', value: name },
      evidence: { issue: 'name-suggestion', why: `restore your name for #${absorbed} ("${name}"): an automatic merge on ${new Date(at).toISOString().slice(0, 10)} kept #${m.id}'s name instead` } })
    ctx.count('name_restores')
  }
}
