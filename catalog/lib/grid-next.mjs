// NEW faceted catalog grid — served ONLY behind ?ui=next. Fully additive and
// isolated so the live site and its stylesheet are never touched:
//   • reuses catalog.css design tokens + .shop-head / .prod / .prods classes
//     (catalog.css itself is edited 0 bytes)
//   • all new chrome is styled by a namespaced inline <style> (.fx-*) that ships
//     only on this page
//   • reads role_tags (JSON array already stored on masters; [0] = primary)
//   • power switch = server navigation; role/size/condition/sort = client-side
//     instant filtering over an embedded dataset (progressive enhancement:
//     no-JS still gets a consistent, filtered in-stock grid for the chosen power)
import { esc, inr } from './util.mjs'
import { all } from './db.mjs'
import { page } from './public.mjs'

const ROLE_VOCAB = ['Trainer', 'Sport / Park Flyer', 'Aerobatic / 3D', 'Warbird', 'Jet / EDF', 'Glider / Sailplane', 'FPV / Flying Wing', 'Scale Civilian', 'Airliner']
const SIZE_BUCKETS = [['small', 'Small · under 1 m'], ['medium', 'Medium · 1–1.5 m'], ['large', 'Large · over 1.5 m']]
const SORTS = ['price-desc', 'price-asc', 'span-desc', 'span-asc', 'name']
// boundary is inclusive of the label ranges: medium = [1000, 1500], large = >1500
const sizeOf = (mm) => (!mm ? '' : mm < 1000 ? 'small' : mm <= 1500 ? 'medium' : 'large')
const ri = (t) => ROLE_VOCAB.indexOf(t)
// JSON embedded in an inline <script> must not let a '<' start a </script> break-out.
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, '\\u003c')

const specLine = (m) => {
  try {
    const s = JSON.parse(m.specs || '{}')
    return [s.spanMM && `${s.spanMM}mm`, s.auwG && `${s.auwG}g`].filter(Boolean).join(' · ')
  } catch { return '' }
}

// All in-stock ready masters for one power (no pagination — the client filters).
// Condition is derived per-offer and split into two in-stock signals so a master
// with BOTH a new and a used listing is correctly filterable as either.
export async function gridDataNext(env, cat, power) {
  const USED = `(LOWER(k.title) LIKE '%pre-owned%' OR LOWER(k.title) LIKE '%pre owned%' OR LOWER(k.title) LIKE '%preowned%'
                 OR LOWER(k.title) LIKE '%sparingly used%' OR LOWER(k.title) LIKE '%(used)%' OR LOWER(k.title) LIKE '%refurbished%')`
  return all(
    env,
    `SELECT m.id, m.slug, m.brand, m.name, m.power, m.role_tags, m.specs, m.hero_image,
            COUNT(DISTINCT k.source_id) AS sellers,
            COALESCE(m.hero_image, MIN(CASE WHEN k.dead=0 THEN k.image_url END)) AS hero_any,
            MIN(CASE WHEN k.in_stock=1 AND k.dead=0 AND o.pack_qty=1 THEN k.price_inr END) AS min_price,
            CAST(json_extract(m.specs,'$.spanMM') AS INTEGER) AS span_mm,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 AND ${USED} THEN 1 ELSE 0 END) AS preowned_stock,
            MAX(CASE WHEN k.in_stock=1 AND k.dead=0 AND NOT ${USED} THEN 1 ELSE 0 END) AS new_stock
     FROM master_model m
     JOIN offer o ON o.master_model_id = m.id
     JOIN sku k ON k.id = o.sku_id AND k.review_status='approved'
     WHERE m.category_id=? AND m.status='ready' AND COALESCE(m.power,'electric')=?
     GROUP BY m.id
     HAVING MAX(CASE WHEN k.in_stock=1 AND k.dead=0 THEN 1 ELSE 0 END) = 1`,
    cat.id, power,
  )
}

const chip = (f, v, label, count, on, extra = '') =>
  `<button class="fx-chip ${extra} ${on ? 'is-on' : ''}" role="checkbox" aria-checked="${on ? 'true' : 'false'}" data-f="${f}" data-v="${esc(v)}">` +
  `${extra.includes('cb') ? '<span class="fx-cbx" aria-hidden="true"></span>' : ''}${esc(label)}<b class="fx-n">${count}</b></button>`

function cardNext(it, pref, hidden) {
  const m = it.m
  const hero = m.hero_any ?? m.hero_image
  const price = m.min_price
  const preOwnedOnly = it.cp && !it.cn // only obtainable pre-owned → surface the tag
  return `<li class="prod" data-id="${m.id}"${hidden ? ' style="display:none"' : ''}>
    <a class="prod-link" href="${pref}/${esc(m.slug)}/">
      <div class="prod-img">${hero ? `<img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" width="800" height="600" loading="lazy" />` : '<div class="prod-noimg">No image</div>'}${preOwnedOnly ? '<span class="prod-tag" style="position:absolute;top:8px;left:8px;font-size:10px;font-weight:700;letter-spacing:.04em;color:#7a4a00;background:#f7e2b8;border-radius:5px;padding:2px 7px">PRE-OWNED</span>' : ''}</div>
      <div class="prod-body">
        <p class="prod-brand">${esc(m.brand)}</p>
        <h3 class="prod-name">${esc(m.name)}</h3>
        <p class="prod-spec">${esc(specLine(m))}</p>
        <div class="prod-price">${price ? `<div class="price"><span class="price-pre">from</span> ${inr(price)}</div>` : '<div class="price is-muted">—</div>'}${m.sellers > 1 ? `<span class="mrp" style="text-decoration:none">${m.sellers} sellers</span>` : ''}</div>
      </div>
      <span class="prod-cta">${m.sellers > 1 ? `Compare ${m.sellers} sellers` : 'View & buy'}</span>
    </a></li>`
}

export function renderGridNext(cat, rows, opts = {}) {
  const power = opts.power === 'gas' ? 'gas' : 'electric'
  const sort = SORTS.includes(opts.sort) ? opts.sort : 'price-desc'
  const cond = ['new', 'pre-owned'].includes(opts.cond) ? opts.cond : 'all'
  const selRoles = (opts.roles || []).filter((t) => ROLE_VOCAB.includes(t))
  const selSizes = (opts.sizes || []).filter((k) => SIZE_BUCKETS.some((s) => s[0] === k))
  const counts = opts.counts || { electric: 0, gas: 0 }
  const pref = cat.path_prefix

  const items = rows.map((m) => {
    let tags = []
    try { tags = JSON.parse(m.role_tags || '[]') } catch {}
    tags = (Array.isArray(tags) ? tags : []).filter((t) => ROLE_VOCAB.includes(t)) // vocab-only (drops "Other"; hardens the embed)
    return { m, tags, size: sizeOf(m.span_mm), cn: !!m.new_stock, cp: !!m.preowned_stock, price: m.min_price ?? null, span: m.span_mm || 0 }
  })

  const mRoles = (it) => !selRoles.length || selRoles.some((t) => it.tags.includes(t))
  const mSizes = (it) => !selSizes.length || selSizes.includes(it.size)
  const mCond = (it) => cond === 'all' || (cond === 'new' ? it.cn : it.cp)
  const visible = (it) => mRoles(it) && mSizes(it) && mCond(it)
  const resultN = items.filter(visible).length

  // contextual facets present in this power
  const rolesPresent = ROLE_VOCAB.filter((t) => items.some((it) => it.tags.includes(t)))
  const sizesPresent = SIZE_BUCKETS.filter(([k]) => items.some((it) => it.size === k))
  const hasCond = items.some((it) => it.cp) // only offer the condition facet when some listing is pre-owned

  // server-side facet counts (mirror the client; keeps no-JS correct)
  const roleCount = (t) => items.filter((it) => it.tags.includes(t) && mSizes(it) && mCond(it)).length
  const sizeCount = (k) => items.filter((it) => it.size === k && mRoles(it) && mCond(it)).length
  const condCount = (c) => items.filter((it) => (c === 'new' ? it.cn : it.cp) && mRoles(it) && mSizes(it)).length

  // server initial order (client re-sorts identically)
  const cmp = (a, b) => {
    if (sort === 'name') return a.m.name.localeCompare(b.m.name)
    if (sort === 'span-desc') return (b.span || 0) - (a.span || 0)
    if (sort === 'span-asc') return (a.span || 1e9) - (b.span || 1e9)
    const pa = a.price ?? (sort === 'price-asc' ? 1e12 : -1), pb = b.price ?? (sort === 'price-asc' ? 1e12 : -1)
    return sort === 'price-asc' ? pa - pb : pb - pa
  }
  const ordered = [...items].sort(cmp)

  const powerHref = (p) => {
    const qs = new URLSearchParams()
    if (p !== 'electric') qs.set('power', p)
    if (sort !== 'price-desc') qs.set('sort', sort)
    const s = qs.toString()
    return `${pref}/${s ? '?' + s : ''}`
  }
  const powerSeg = (id) => `<div class="fx-seg" id="${id}" role="tablist" aria-label="Power category">` +
    `<a class="fx-seg-b ${power === 'electric' ? 'is-on' : ''}" href="${powerHref('electric')}">Electric <span>${counts.electric}</span></a>` +
    `<a class="fx-seg-b ${power === 'gas' ? 'is-on' : ''}" href="${powerHref('gas')}">Nitro / Gas <span>${counts.gas}</span></a></div>`

  const roleChips = rolesPresent.map((t) => chip('role', t, t, roleCount(t), selRoles.includes(t), `fx-cb fx-r-${ri(t)}`)).join('')
  const sizeChips = sizesPresent.map(([k, label]) => chip('size', k, label, sizeCount(k), selSizes.includes(k), 'fx-cb fx-size')).join('')
  const condChips = `${chip('cond', 'all', 'All', items.filter(mRoles).filter(mSizes).length, cond === 'all')}${chip('cond', 'new', 'New', condCount('new'), cond === 'new')}${chip('cond', 'pre-owned', 'Pre-owned', condCount('pre-owned'), cond === 'pre-owned')}`

  const sortSel = `<select id="fx-sort" class="fx-sortsel" aria-label="Sort">${[['price-desc', 'Price: high to low'], ['price-asc', 'Price: low to high'], ['span-desc', 'Wingspan: large to small'], ['span-asc', 'Wingspan: small to large'], ['name', 'Name: A → Z']].map(([v, t]) => `<option value="${v}"${sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`

  const condLabel = (c) => (c === 'new' ? 'New' : 'Pre-owned')
  const nActive = selRoles.length + selSizes.length + (cond !== 'all' ? 1 : 0)
  const activeTags = [...selRoles.map((t) => ['role', t, t]), ...selSizes.map((k) => ['size', k, SIZE_BUCKETS.find((s) => s[0] === k)[1]]), ...(cond !== 'all' ? [['cond', cond, condLabel(cond)]] : [])]
    .map(([f, v, label]) => `<span class="fx-atag" data-f="${f}" data-v="${esc(v)}">${esc(label)}<button aria-label="Remove">×</button></span>`).join('')

  const fxData = items.map((it) => ({ i: it.m.id, t: it.tags, s: it.size, cn: it.cn, cp: it.cp, sp: it.span, p: it.price }))

  const body = `
  <div class="shop-head"><div class="shop-head-in">
    <p class="shop-kicker">narenana catalog</p>
    <h1 class="shop-h1">${esc(cat.name)} in India</h1>
    <p class="shop-sub" id="fx-sub">${power === 'electric' ? 'Electric' : 'Nitro / gas'} aircraft · live prices from Indian sellers</p>
    <div class="fx-bar">${powerSeg('fx-powmain')}<button class="fx-fbtn" id="fx-open" aria-haspopup="dialog" aria-expanded="false">Filter &amp; Sort<span class="fx-badge" id="fx-badge"${nActive ? '' : ' hidden'}>${nActive}</span></button></div>
  </div></div>
  <main class="shop">
    <div class="fx-summary">
      <span class="fx-rescount"><b id="fx-nres">${resultN}</b> models</span>
      <div class="fx-active" id="fx-active">${activeTags}</div>
      <button class="fx-clear" id="fx-clear"${nActive ? '' : ' hidden'}>Clear all</button>
    </div>
    <ul class="prods" id="fx-grid">${ordered.map((it) => cardNext(it, pref, !visible(it))).join('')}</ul>
    <p class="empty" id="fx-empty"${resultN ? ' hidden' : ''}>No models match — try removing a filter.</p>

    <div class="fx-backdrop" id="fx-backdrop" hidden>
      <div class="fx-modal" role="dialog" aria-modal="true" aria-labelledby="fx-mtitle">
        <header class="fx-modal-head"><h2 id="fx-mtitle">Filter &amp; Sort</h2><button class="fx-mx" id="fx-mx" aria-label="Close">×</button></header>
        <div class="fx-modal-body">
          <div class="fx-frow"><span class="fx-fgl">Category</span>${powerSeg('fx-powmodal')}</div>
          <div class="fx-frow"><span class="fx-fgl">Type <em id="fx-rolehint"></em></span><div class="fx-chips" id="fx-roles">${roleChips}</div></div>
          <div class="fx-frow"><span class="fx-fgl">Size</span><div class="fx-chips" id="fx-sizes">${sizeChips}</div></div>
          <div class="fx-frow" id="fx-condwrap"${hasCond ? '' : ' hidden'}><span class="fx-fgl">Condition</span><div class="fx-chips" id="fx-conds">${condChips}</div></div>
          <div class="fx-frow"><span class="fx-fgl">Sort</span>${sortSel}</div>
        </div>
        <footer class="fx-modal-foot"><button class="fx-mclear" id="fx-mclear">Clear all</button><button class="fx-mshow" id="fx-mshow">Show <b id="fx-mshown">${resultN}</b> models</button></footer>
      </div>
    </div>
  </main>
  <style>${FX_CSS}</style>
  <script>var FX_DATA=${jsonSafe(fxData)},FX_POWER=${jsonSafe(power)},FX_SORT=${jsonSafe(sort)},FX_INIT=${jsonSafe({ roles: selRoles, sizes: selSizes, cond })},FX_PREF=${jsonSafe(pref)};</script>
  <script>${FX_JS}</script>`

  return page({
    title: `${esc(cat.name)} in India — compare live prices | narenana`,
    desc: `Compare live prices on ${power === 'gas' ? 'nitro/gas' : 'electric'} ${cat.name.toLowerCase()} from Indian sellers.`,
    path: `${pref}/`,
    body,
  })
}

// ---- namespaced styles (reuse catalog.css tokens; --line→--faint, --good→--green) ----
const FX_CSS = `
.fx-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px}
.fx-seg{display:inline-flex;border:2px solid var(--ink);border-radius:999px;overflow:hidden;background:var(--card)}
.fx-seg-b{text-decoration:none;border-right:2px solid var(--ink);color:var(--muted);font-family:'Hanken Grotesk',system-ui,sans-serif;font-weight:700;font-size:.9rem;padding:9px 18px;white-space:nowrap}
.fx-seg-b:last-child{border-right:none}
.fx-seg-b:hover{color:var(--ink)}
.fx-seg-b.is-on{background:var(--orange);color:var(--ink-2)}
.fx-seg-b span{font-family:'JetBrains Mono',monospace;font-size:.7rem;opacity:.6;margin-left:4px}
.fx-fbtn{margin-left:auto;display:inline-flex;align-items:center;gap:7px;border:2px solid var(--ink);background:var(--card);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;font-weight:800;font-size:.9rem;padding:8px 16px;border-radius:999px;cursor:pointer;white-space:nowrap}
.fx-fbtn:hover,.fx-fbtn[aria-expanded="true"]{background:var(--ink);color:var(--card)}
.fx-badge{background:var(--orange);color:#fff;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:800;font-family:'JetBrains Mono',monospace}
.fx-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.fx-rescount{color:var(--muted);font-size:.95rem}
.fx-rescount b{color:var(--ink);font-size:1.1rem;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.fx-active{display:flex;gap:6px;flex-wrap:wrap}
.fx-atag{display:inline-flex;align-items:center;gap:5px;background:color-mix(in srgb,var(--orange) 15%,transparent);color:var(--orange-deep);border-radius:999px;padding:3px 6px 3px 11px;font-size:12px;font-weight:700}
.fx-atag button{border:none;background:none;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:0 2px}
.fx-clear{border:none;background:none;color:var(--muted);font-family:inherit;font-weight:700;font-size:12.5px;text-decoration:underline;cursor:pointer}
.fx-chip{appearance:none;display:inline-flex;align-items:center;border:1.5px solid var(--faint);background:transparent;color:var(--muted);border-radius:999px;padding:6px 12px;font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.fx-chip .fx-n{opacity:.55;margin-left:5px;font-weight:700}
.fx-chip:hover:not(:disabled){border-color:var(--ink);color:var(--ink)}
.fx-chip.is-on{color:#fff;border-color:transparent;background:var(--ink)}
.fx-chip:disabled{opacity:.32;cursor:not-allowed;text-decoration:line-through}
.fx-cb{padding-left:9px}
.fx-cbx{display:inline-block;width:13px;height:13px;border:1.6px solid currentColor;border-radius:3px;margin-right:7px;position:relative;opacity:.5;flex:none}
.fx-chip.is-on .fx-cbx{opacity:1;background:#fff;border-color:#fff}
.fx-chip.is-on .fx-cbx::after{content:"";position:absolute;left:3.5px;top:.5px;width:4px;height:8px;border:solid var(--ink);border-width:0 2px 2px 0;transform:rotate(45deg)}
.fx-r-0.is-on{background:#3a7d44}.fx-r-1.is-on{background:#7a8b3a}.fx-r-2.is-on{background:#c8641a}.fx-r-3.is-on{background:#8a5a2b}.fx-r-4.is-on{background:#3b6ea5}.fx-r-5.is-on{background:#4aa3a0}.fx-r-6.is-on{background:#6a5acd}.fx-r-7.is-on{background:#b0873a}.fx-r-8.is-on{background:#5b6b7a}
.fx-backdrop{position:fixed;inset:0;background:rgba(15,44,57,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px}
.fx-backdrop[hidden]{display:none}
.fx-modal{background:var(--card);border:2px solid var(--ink);border-radius:16px;width:100%;max-width:540px;max-height:85vh;min-height:min(664px,85vh);display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden}
.fx-modal-head{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:2px solid var(--ink)}
.fx-modal-head h2{margin:0;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:1.15rem;font-weight:800}
.fx-mx{border:none;background:none;color:var(--muted);font-size:26px;line-height:1;cursor:pointer;padding:0 4px}
.fx-mx:hover{color:var(--ink)}
.fx-modal-body{overflow-y:auto;flex:1 1 auto;min-height:0;padding:18px 20px;display:flex;flex-direction:column;gap:18px}
.fx-frow{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.fx-fgl{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.fx-fgl em{font-style:normal;opacity:.7;text-transform:none;letter-spacing:0;font-weight:400}
.fx-chips{display:flex;gap:6px;flex-wrap:wrap}
.fx-sortsel{appearance:none;-webkit-appearance:none;font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:.85rem;font-weight:700;color:var(--ink);background-color:var(--card);border:2px solid var(--ink);border-radius:999px;padding:9px 34px 9px 16px;cursor:pointer;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%230F2C39' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 12px center}
.fx-modal-foot{display:flex;align-items:center;gap:12px;padding:14px 20px;border-top:1.5px solid var(--faint)}
.fx-mclear{border:none;background:none;color:var(--muted);font-family:inherit;font-weight:700;font-size:13px;text-decoration:underline;cursor:pointer}
.fx-mshow{margin-left:auto;border:2px solid var(--orange-deep);background:var(--orange);color:#fff;border-radius:999px;padding:10px 24px;font-family:inherit;font-weight:800;cursor:pointer}
.fx-mshow:hover{background:var(--orange-deep)}
@media(max-width:640px){.fx-backdrop{align-items:flex-end;padding:0}.fx-modal{max-width:none;border-radius:16px 16px 0 0;max-height:90vh}}
`

// ---- client engine (reads the FX_* globals; no template-literal interpolation) ----
const FX_JS = `(function(){
  var state={roles:new Set(FX_INIT.roles),sizes:new Set(FX_INIT.sizes),cond:FX_INIT.cond||'all',sort:FX_SORT};
  var SIZELABEL={small:'Small · under 1 m',medium:'Medium · 1–1.5 m',large:'Large · over 1.5 m'};
  var CONDLABEL={'new':'New','pre-owned':'Pre-owned'};
  var grid=document.getElementById('fx-grid');
  var cardEls={}; [].slice.call(grid.querySelectorAll('.prod')).forEach(function(c){cardEls[c.getAttribute('data-id')]=c;});
  function mRoles(d){if(!state.roles.size)return true;for(var i=0;i<d.t.length;i++)if(state.roles.has(d.t[i]))return true;return false;}
  function mSizes(d){return state.sizes.size===0||state.sizes.has(d.s);}
  function mCond(d){return state.cond==='all'||(state.cond==='new'?d.cn:d.cp);}
  function results(){return FX_DATA.filter(function(d){return mRoles(d)&&mSizes(d)&&mCond(d);});}
  function cmp(a,b){
    if(state.sort==='name'){return (cardEls[a.i].querySelector('.prod-name').textContent).localeCompare(cardEls[b.i].querySelector('.prod-name').textContent);}
    if(state.sort==='span-desc'){return (b.sp||0)-(a.sp||0);}
    if(state.sort==='span-asc'){return (a.sp||1e9)-(b.sp||1e9);}
    var pa=a.p==null?(state.sort==='price-asc'?1e12:-1):a.p, pb=b.p==null?(state.sort==='price-asc'?1e12:-1):b.p;
    return state.sort==='price-asc'?pa-pb:pb-pa;
  }
  function setChip(btn,on){btn.classList.toggle('is-on',on);btn.setAttribute('aria-checked',on?'true':'false');}
  function render(){
    var res=results();
    var vis={}; res.forEach(function(d){vis[d.i]=1;});
    [].slice.call(document.querySelectorAll('#fx-roles .fx-chip')).forEach(function(btn){
      var v=btn.getAttribute('data-v');
      var n=FX_DATA.filter(function(d){return d.t.indexOf(v)>-1&&mSizes(d)&&mCond(d);}).length;
      btn.querySelector('.fx-n').textContent=n; btn.disabled=n===0&&!state.roles.has(v); setChip(btn,state.roles.has(v));
    });
    [].slice.call(document.querySelectorAll('#fx-sizes .fx-chip')).forEach(function(btn){
      var v=btn.getAttribute('data-v');
      var n=FX_DATA.filter(function(d){return d.s===v&&mRoles(d)&&mCond(d);}).length;
      btn.querySelector('.fx-n').textContent=n; btn.disabled=n===0&&!state.sizes.has(v); setChip(btn,state.sizes.has(v));
    });
    [].slice.call(document.querySelectorAll('#fx-conds .fx-chip')).forEach(function(btn){
      var v=btn.getAttribute('data-v');
      var n=v==='all'?FX_DATA.filter(function(d){return mRoles(d)&&mSizes(d);}).length:FX_DATA.filter(function(d){return (v==='new'?d.cn:d.cp)&&mRoles(d)&&mSizes(d);}).length;
      btn.querySelector('.fx-n').textContent=n; setChip(btn,state.cond===v);
    });
    var hint=document.getElementById('fx-rolehint'); if(hint)hint.textContent=state.roles.size?'· '+state.roles.size+' selected':'· tick any that apply';
    res.sort(cmp);
    for(var id in cardEls){cardEls[id].style.display=vis[id]?'':'none';}
    res.forEach(function(d){grid.appendChild(cardEls[d.i]);});
    document.getElementById('fx-nres').textContent=res.length;
    document.getElementById('fx-mshown').textContent=res.length;
    document.getElementById('fx-empty').hidden=res.length>0;
    var act=document.getElementById('fx-active'); act.innerHTML='';
    function atag(f,v,label){var s=document.createElement('span');s.className='fx-atag';s.textContent=label;var x=document.createElement('button');x.setAttribute('aria-label','Remove');x.textContent='×';x.onclick=function(){toggle(f,v,true);};s.appendChild(x);act.appendChild(s);}
    state.roles.forEach(function(v){atag('role',v,v);});
    state.sizes.forEach(function(v){atag('size',v,SIZELABEL[v]||v);});
    if(state.cond!=='all')atag('cond',state.cond,CONDLABEL[state.cond]||state.cond);
    var nA=state.roles.size+state.sizes.size+(state.cond!=='all'?1:0);
    document.getElementById('fx-clear').hidden=!nA;
    var badge=document.getElementById('fx-badge'); badge.hidden=!nA; badge.textContent=nA;
    try{var p=new URLSearchParams();if(FX_POWER!=='electric')p.set('power',FX_POWER);
      if(state.roles.size)p.set('role',Array.from(state.roles).join(','));
      if(state.sizes.size)p.set('size',Array.from(state.sizes).join(','));
      if(state.cond!=='all')p.set('cond',state.cond);
      if(state.sort!=='price-desc')p.set('sort',state.sort);
      history.replaceState(null,'',FX_PREF+'/?'+p.toString());}catch(e){}
  }
  function toggle(f,v,off){
    if(f==='role'){state.roles.has(v)?state.roles.delete(v):(off?state.roles.delete(v):state.roles.add(v));}
    else if(f==='size'){state.sizes.has(v)?state.sizes.delete(v):(off?state.sizes.delete(v):state.sizes.add(v));}
    else if(f==='cond'){state.cond=(off||state.cond===v)?'all':v;}
    render();
  }
  document.getElementById('fx-roles').addEventListener('click',function(e){var b=e.target.closest('.fx-chip');if(b&&!b.disabled)toggle('role',b.getAttribute('data-v'));});
  document.getElementById('fx-sizes').addEventListener('click',function(e){var b=e.target.closest('.fx-chip');if(b&&!b.disabled)toggle('size',b.getAttribute('data-v'));});
  document.getElementById('fx-conds').addEventListener('click',function(e){var b=e.target.closest('.fx-chip');if(b)toggle('cond',b.getAttribute('data-v'));});
  document.getElementById('fx-sort').addEventListener('change',function(e){state.sort=e.target.value;render();});
  var bd=document.getElementById('fx-backdrop'),ob=document.getElementById('fx-open');
  function setModal(o){bd.hidden=!o;ob.setAttribute('aria-expanded',o?'true':'false');document.body.style.overflow=o?'hidden':'';if(o){var x=document.getElementById('fx-mx');if(x)x.focus();}}
  ob.onclick=function(){setModal(true);};
  document.getElementById('fx-mx').onclick=function(){setModal(false);};
  document.getElementById('fx-mshow').onclick=function(){setModal(false);};
  bd.onclick=function(e){if(e.target===bd)setModal(false);};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!bd.hidden)setModal(false);});
  var ca=function(){state.roles.clear();state.sizes.clear();state.cond='all';render();};
  document.getElementById('fx-clear').onclick=ca;
  document.getElementById('fx-mclear').onclick=ca;
  render();
})();`
