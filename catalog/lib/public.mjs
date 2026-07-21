// Public pages, rendered from D1 at request time.
//   /<prefix>/            category grid of LIVE master models
//   /<prefix>/<slug>/     master page: specs + config-grouped offers table
//
// Liveness is DERIVED: a master renders when status='ready' AND it has ≥1
// approved offer. A master whose offers are all dead/OOS keeps its page with
// "last seen ₹X on <date>" — pages only vanish when the owner retires them.

import { esc, inr } from './util.mjs'
import { CSS_VER } from './styles.mjs'

// Site IDENTITY (domain, analytics id) is code config; all product/market
// content — masters, offers, recipes, components — arrives as arguments,
// straight from D1. This module holds zero content.
const SITE = 'https://www.narenana.com'
const dateOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—')

export function page({ title, desc, path, body, jsonld, noindex, image }) {
  const url = `${SITE}${path}`
  const og = image ?? `${SITE}/assets/og.jpg`
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#F3EEE0" />
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><link rel="canonical" href="${url}" />${noindex ? '<meta name="robots" content="noindex" />' : ''}
<link rel="icon" href="/favicon.ico" sizes="any" /><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="narenana" /><meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:image" content="${esc(og)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${esc(og)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&family=Grand+Hotel&family=Hanken+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
<script>if(location.hostname==='www.narenana.com'){var _g=document.createElement('script');_g.async=1;_g.src='https://www.googletagmanager.com/gtag/js?id=G-1KY518LPBH';document.head.appendChild(_g);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","G-1KY518LPBH")}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<link rel="stylesheet" href="/catalog.css?v=${CSS_VER}" />
</head><body>
<header class="nav"><a class="nav-back" href="/">narenana</a><span class="nav-sep">/</span><a class="nav-here" href="${esc(path.split('/').slice(0, 2).join('/'))}/">${esc(path.split('/')[1])}</a>
<span class="nav-grow"></span>
<div class="shr"><button id="shr-btn" class="shr-btn" aria-haspopup="true" aria-expanded="false"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6h14v-6"/></svg>Share</button>
<div id="shr-menu" class="shr-menu" role="menu">
<p class="shr-k">Share this page</p>
<a id="shr-wa" target="_blank" rel="noopener" role="menuitem"><svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.3c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.6.8 1.9.8 2 .1.1.1.3 0 .5-.3.6-.7.9-.5 1.2.7 1.2 1.6 2 2.8 2.6.3.2.5.1.7-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.4 0 .1 0 .7-.2 1.3z"/></svg>WhatsApp</a>
<a id="shr-x" target="_blank" rel="noopener" role="menuitem"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-6.8 7.8L23.3 22h-6.3l-4.9-6.4L6.5 22H3.4l7.3-8.3L1 2h6.4l4.4 5.9L18.9 2zm-1.1 18h1.7L7.3 3.7H5.5L17.8 20z"/></svg>X / Twitter</a>
<button id="shr-cp" role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>Copy link</button>
<button id="shr-nt" role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>More options</button>
</div></div></header>
${body}
<footer class="foot"><p>Prices come from each seller's live listing and carry the date we last confirmed them — always check the seller's page before paying.</p>
<p><a class="wordmark" href="/">narenana</a> &nbsp;·&nbsp; <a href="/log-viewer/">RC Log Viewer</a> · <a href="https://sim.narenana.com">Nanawing simulator</a> · <a href="https://www.youtube.com/@narenana" rel="noopener">YouTube</a></p></footer>
<script>(function(){var b=document.getElementById('shr-btn'),m=document.getElementById('shr-menu');if(!b)return;
function u(s){var x=new URL(location.origin+location.pathname);x.searchParams.set('utm_source',s);x.searchParams.set('utm_medium','share');x.searchParams.set('utm_campaign','wings');return x.toString()}
var t=document.title.replace(/\\s*\\|[^|]*$/,'').trim();
b.onclick=function(e){e.stopPropagation();var on=m.classList.toggle('on');b.setAttribute('aria-expanded',on)};
document.addEventListener('click',function(){m.classList.remove('on');b.setAttribute('aria-expanded','false')});
m.addEventListener('click',function(e){e.stopPropagation()});
document.getElementById('shr-wa').href='https://wa.me/?text='+encodeURIComponent(t+' — '+u('whatsapp'));
document.getElementById('shr-x').href='https://twitter.com/intent/tweet?text='+encodeURIComponent(t)+'&url='+encodeURIComponent(u('x'));
document.getElementById('shr-cp').onclick=function(){var el=this;navigator.clipboard.writeText(u('copy')).then(function(){el.textContent='Copied ✓';setTimeout(function(){el.textContent='Copy link'},1400)})};
var n=document.getElementById('shr-nt');
if(navigator.share){n.onclick=function(){navigator.share({title:t,url:u('native')}).catch(function(){})}}else{n.style.display='none'}
})()</script>
</body></html>`
}

// Power class from a listing's text. LOGIC is in code; the text (engine
// markers — displacement, glow size, fuel) is DATA, living in seller titles.
// gas/nitro when such a marker is present; electric is the common default
// (foam, PNP, EDF, brushless).
// Condition from a seller title. Pre-owned/used units are distinct listings the
// buyer should see flagged; default is a new item. Deliberately does NOT match a
// bare "used" (too many false hits like "unused" / "used for") — only explicit
// second-hand phrasing sellers actually write.
export function conditionOf(text = '') {
  return /\b(pre[\s-]?owned|second[\s-]?hand|sparingly\s+used|gently\s+used|quality\s+pre\b|refurbished|\(used\))/i.test(String(text)) ? 'used' : 'new'
}

export function powerType(text = '') {
  const t = String(text).toLowerCase()
  if (/\b\d{2,3}\s*cc\b/.test(t)) return 'gas' // 35cc, 100cc, 60cc (covers 50-60cc)
  if (/(^|[\s(/])\.\d{2}\b/.test(t)) return 'gas' // .46, .61 glow engine size
  if (/\b(nitro|glow|petrol|gasoline|gasser|engine|2[\s-]?stroke|4[\s-]?stroke)\b/.test(t)) return 'gas'
  // combustion-engine brands — a plane specced with one is glow/gas ("Decathlon
  // DLE 30", "…with NGH GT9", "DA-50"). In RC, electric uses a "motor", not an
  // "engine", so these tokens never name an electric aircraft.
  if (/\b(dle|dla|saito|zenoah|ngh|moki|3w|da[\s-]?\d{2})\b/.test(t)) return 'gas'
  return 'electric'
}

// Role / type — the going-forward classifier for inbound models. Multi-label: a
// listing can carry several tags (a MiG-29 is a jet AND a warbird; a Piper Cub is
// scale civilian). tags[0] is the primary (card) label. Pure & deterministic like
// powerType/conditionOf. The existing catalog was seeded from a reviewed pass; new
// masters get rules here, and the classify slice falls back to Workers AI only when
// a listing is not confidently placed (`confident:false`).
export const ROLE_TAGS = ['Trainer', 'Sport / Park Flyer', 'Aerobatic / 3D', 'Warbird', 'Jet / EDF', 'Glider / Sailplane', 'FPV / Flying Wing', 'Scale Civilian', 'Airliner']

// [tag, regex]. Rules fire independently (multi-tag); a model name/title is matched
// on aircraft-type knowledge (designations, platform brands, keywords) — general
// knowledge, not catalog content. Listing order also sets primary precedence.
const ROLE_RULES = [
  ['Jet / EDF', /\bedf\b|ducted[\s-]?fan|\bturbine\b|\bjet\b|\bf-?1[45678]\b|\bf-?22\b|\bf-?35\b|\bmig-?\d|\bsu-?\d\d|\bj-?20\b|\bj-?11\b|rafale|typhoon|viggen|mirage|tornado|\bl-?39\b|\ba-?10\b|\bt-?45\b|mb-?339|\bviper\b|goshawk|funjet|albatross/],
  ['Warbird', /mustang|\bp-?51\b|spitfire|corsair|f4u|\bzero\b|a6m|bf-?109|fw-?190|messerschmitt|\bp-?47\b|\bp-?40\b|\bp-?39\b|\bp-?38\b|\bt-?28\b|trojan|\bstuka\b|hurricane|mosquito|lancaster|\bb-?17\b|\bb-?25\b|texan|\bat-?6\b|warbird|\bmig-?\d|\bsu-?\d\d|\bf-?1[45678]\b|\bf-?22\b|rafale|viggen|mirage|tornado|\bl-?39\b|\ba-?10\b|\bt-?45\b|goshawk|mb-?339|\bj-?20\b|hansa|\bpc-?9\b/],
  ['Airliner', /airbus|\ba3\d0\b|boeing|\b7[0-9]7\b|\b747\b|\b737\b|airliner|globemaster|emirates/],
  ['Glider / Sailplane', /glider|sailplane|\bsoar|\bdlg\b|hand[\s-]?launch|radian|discus|\bsalto\b|motor[\s-]?glider|thermal|\bbixler\b/],
  ['FPV / Flying Wing', /\bfpv\b|flying[\s-]?wing|\btalon\b|sky[\s-]?surfer|\branger\b|\bzohd\b|atomrc|heewing|skywalker|x-?uav|mapbird|believer|striver|\bdart\b|swordfish|\bdolphin\b|\bpenguin\b|\bmobula\b|vortex-?rc|batman|\bplank\b|caipirinha|reptile|makeflyeasy/],
  ['Aerobatic / 3D', /\b3d\b|aerobatic|extra[\s-]?\d|edge[\s-]?540|edge[\s-]?\d|yak-?\d|\bmxs\b|slick|pitts|sbach|\blaser[\s-]?\d|acromaster|katana|addiction|revolto|\bcrack\b|\b260\b|\b330\b|dirty[\s-]?birdy|vanquish|gee[\s-]?bee/],
  ['Scale Civilian', /cessna|piper|\bcub\b|decathlon|beaver|otter|\bwaco\b|pilatus|kingfisher|telemaster|tiger[\s-]?moth|skylane|\bsr22\b|carbon[\s-]?cub|space[\s-]?walker|stinson|\bj-?3\b|maule|\bchamp\b|bird[\s-]?dog|\bdraco\b|columbia/],
  ['Trainer', /trainer|beginner|apprentice|easy[\s-]?trainer|first[\s-]?step|\bcadet\b|\bkadet\b|challenger|allrounder|boomerang|arising[\s-]?star|school[\s-]?marm/],
  ['Sport / Park Flyer', /sport|park[\s-]?flyer|fun[\s-]?cub|foam[\s-]?board|depron|gyro[\s-]?rtf|allrounder|wingnetic/],
]
// Primary precedence when several tags match (jets lead over their warbird tag; a
// scale civilian outranks a bare "trainer"; sport is the catch-all).
const ROLE_PRIMARY = ['Jet / EDF', 'Warbird', 'Airliner', 'Glider / Sailplane', 'FPV / Flying Wing', 'Aerobatic / 3D', 'Scale Civilian', 'Trainer', 'Sport / Park Flyer']

// Dedup, validate against the vocabulary, pick a primary, drop the combos the owner
// removed (no Warbird+Trainer, no Scale Civilian+Trainer — keep the primary), and
// return with primary first. Shared by the rule classifier and the AI fallback.
export function normalizeRoleTags(tags) {
  let t = [...new Set((tags || []).filter((x) => ROLE_TAGS.includes(x)))]
  if (!t.length) return []
  const primary = ROLE_PRIMARY.find((p) => t.includes(p)) ?? t[0]
  for (const other of ['Warbird', 'Scale Civilian']) {
    if (t.includes(other) && t.includes('Trainer')) t = t.filter((x) => x !== (primary === 'Trainer' ? other : 'Trainer'))
  }
  return [primary, ...t.filter((x) => x !== primary)]
}

export function roleTags(text = '') {
  const s = String(text).toLowerCase()
  const tags = normalizeRoleTags(ROLE_RULES.filter(([, re]) => re.test(s)).map(([tag]) => tag))
  // Nothing distinctive matched → default to the sport/park catch-all, but mark it
  // low-confidence so the classify slice can ask the AI.
  return tags.length ? { tags, confident: true } : { tags: ['Sport / Park Flyer'], confident: false }
}

// Card price: cheapest orderable across base-config offers. Never a pack/combo
// price masquerading as the unit price.
function masterCard(m, prefix) {
  const price = m.min_price
  const oos = !m.any_stock
  const hero = m.hero_any ?? m.hero_image // hero_any = offer-sku fallback (grid query)
  return `
    <li class="prod">
      <a class="prod-link" href="${prefix}/${esc(m.slug)}/">
        <div class="prod-img">
          ${hero ? `<img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" width="800" height="600" loading="lazy" />` : '<div class="prod-noimg">No image</div>'}
          ${oos ? '<span class="prod-veil">Out of stock</span>' : ''}
          ${m.preowned ? '<span class="prod-tag" style="position:absolute;top:8px;left:8px;font-size:10px;font-weight:700;letter-spacing:.04em;color:#7a4a00;background:#f7e2b8;border-radius:5px;padding:2px 7px">PRE-OWNED</span>' : ''}
        </div>
        <div class="prod-body">
          <p class="prod-brand">${esc(m.brand)}</p>
          <h3 class="prod-name">${esc(m.name)}</h3>
          <p class="prod-spec">${esc(specLine(m))}</p>
          <div class="prod-price">${price ? `<div class="price"><span class="price-pre">${oos ? 'was' : 'from'}</span> ${inr(price)}</div>` : '<div class="price is-muted">—</div>'}
            ${m.sellers > 1 ? `<span class="mrp" style="text-decoration:none">${m.sellers} sellers</span>` : ''}</div>
        </div>
        <span class="prod-cta ${oos ? 'is-off' : ''}">${oos ? 'See details' : m.sellers > 1 ? `Compare ${m.sellers} sellers` : 'View & buy'}</span>
      </a>
    </li>`
}

const specLine = (m) => {
  try {
    const s = JSON.parse(m.specs || '{}')
    return [s.spanMM && `${s.spanMM}mm`, s.auwG && `${s.auwG}g`].filter(Boolean).join(' · ')
  } catch {
    return ''
  }
}

export function renderGrid(cat, masters, opts = {}) {
  // Power + pageNo come from the server (SQL filters + paginates). Masters here
  // are already the current pageNo for the current power filter.
  const { power = 'electric', page: pageNo = 1, sort = 'price-desc', counts = { electric: masters.length, gas: 0, all: masters.length, pageSize: 24 } } = opts
  const total = power === 'all' ? counts.all : counts[power] ?? masters.length
  const pageSize = counts.pageSize || 24
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const label = power === 'gas' ? 'gas / nitro' : power === 'all' ? '' : 'electric'
  const pref = cat.path_prefix
  // URL for a (power, pageNo, sort): defaults (electric, p1, price-desc) drop out
  // so the base category path stays clean.
  const href = (p, pg, srt = sort) => {
    const qs = new URLSearchParams()
    if (p !== 'electric') qs.set('power', p)
    if (srt && srt !== 'price-desc') qs.set('sort', srt)
    if (pg > 1) qs.set('page', String(pg))
    const s = qs.toString()
    return `${pref}/${s ? '?' + s : ''}`
  }
  const chip = (p, text, n) => `<a class="filt-b ${power === p ? 'is-on' : ''}" href="${href(p, 1)}">${text} <span>${n}</span></a>`
  const filt = `<div class="filt" role="tablist" aria-label="Power type">${chip('electric', 'Electric', counts.electric)}${chip('gas', 'Gas / Nitro', counts.gas)}${chip('all', 'All', counts.all)}</div>`
  const sortOpts = [['price-desc', 'Price: high to low'], ['price-asc', 'Price: low to high'], ['span-desc', 'Wingspan: large to small'], ['span-asc', 'Wingspan: small to large']]
  const sortCtl = `<label class="sortsel"><span class="sortsel-lbl">Sort</span><select class="sortsel-in" aria-label="Sort products" onchange="if(this.value)location.href=this.value">${sortOpts.map(([v, t]) => `<option value="${href(power, 1, v)}"${sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`

  const pageLink = (pg, text, cls = '') => (pg < 1 || pg > totalPages || pg === pageNo ? `<span class="pg ${cls} is-off">${text}</span>` : `<a class="pg ${cls}" href="${href(power, pg)}">${text}</a>`)
  const nums = []
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - pageNo) <= 1) nums.push(p === pageNo ? `<span class="pg is-cur">${p}</span>` : `<a class="pg" href="${href(power, p)}">${p}</a>`)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const pager = totalPages > 1
    ? `<nav class="pager" aria-label="Pagination">${pageLink(pageNo - 1, '← Prev', 'pg-prev')}${nums.map((n) => (n === '…' ? '<span class="pg is-off">…</span>' : n)).join('')}${pageLink(pageNo + 1, 'Next →', 'pg-next')}</nav>`
    : ''

  const body = `
  <div class="shop-head"><div class="shop-head-in">
    <p class="shop-kicker">narenana catalog</p>
    <h1 class="shop-h1">${esc(cat.name)} in India</h1>
    <p class="shop-sub">${total} ${label} in stock · live prices from Indian sellers${totalPages > 1 ? ` · page ${pageNo} of ${totalPages}` : ''}</p>
    <p class="shop-intro">Kits, PNP and ready-to-fly aircraft from Indian hobby shops, in one place. Prices and stock come from each seller's live listing and are re-checked through the day — every card opens a spec sheet, and every offer links straight to the seller.</p>
    <div class="filt-row" style="display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center">${filt}${sortCtl}</div>
  </div></div>
  <main class="shop">
    <ul class="prods" id="grid">${masters.map((m) => masterCard(m, pref)).join('')}</ul>
    ${masters.length === 0 ? '<p class="empty">Nothing in this category right now.</p>' : ''}
    <div id="grid-more" data-power="${power}" data-sort="${sort}" data-page="${pageNo}" data-pages="${totalPages}" data-prefix="${pref}"></div>
    ${pager}
  </main>
  <script>(function(){
    var more=document.getElementById('grid-more'),grid=document.getElementById('grid');
    if(!more||!grid)return;
    var page=+more.dataset.page,pages=+more.dataset.pages,power=more.dataset.power,sort=more.dataset.sort,prefix=more.dataset.prefix,loading=false,done=page>=pages;
    var pgr=document.querySelector('.pager');if(pgr)pgr.style.display='none';
    var end=document.createElement('p');end.className='empty';end.hidden=true;
    end.textContent="That's every "+(power==='gas'?'gas / nitro ':power==='all'?'':'electric ')+"aircraft in stock.";
    more.after(end);
    var spin=document.createElement('p');spin.className='empty';spin.hidden=true;spin.textContent='Loading more…';more.after(spin);
    function href(p){var qs=[];if(power!=='electric')qs.push('power='+power);if(sort&&sort!=='price-desc')qs.push('sort='+sort);qs.push('page='+p);return prefix+'/?'+qs.join('&')}
    function near(){return more.getBoundingClientRect().top-window.innerHeight<700}
    function loadMore(){
      if(loading||done)return;loading=true;spin.hidden=false;
      fetch(href(page+1)).then(function(r){return r.text()}).then(function(t){
        var doc=new DOMParser().parseFromString(t,'text/html');
        doc.querySelectorAll('.prods .prod').forEach(function(c){grid.appendChild(document.importNode(c,true))});
        page++;loading=false;spin.hidden=true;
        try{history.replaceState(null,'',href(page).replace(/&?page=1$/,'').replace(/\\?$/,''))}catch(e){}
        if(page>=pages){done=true;end.hidden=false;teardown()}else check();
      }).catch(function(){loading=false;spin.hidden=true});
    }
    function check(){if(!done&&!loading&&near())loadMore()}
    // Primary: IntersectionObserver. Fallback: throttled scroll/resize — the pager is hidden,
    // so loading must never depend on the observer alone. Initial check() auto-fills a tall viewport.
    var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)loadMore()})},{rootMargin:'700px'}):null;
    if(io)io.observe(more);
    var t;function onScroll(){if(t)return;t=setTimeout(function(){t=0;check()},150)}
    function teardown(){if(io)io.disconnect();removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll)}
    addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll,{passive:true});
    check();
  })()</script>`
  const jsonld = masters.length
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'narenana', item: `${SITE}/` },
              { '@type': 'ListItem', position: 2, name: `${cat.name} in India` },
            ],
          },
          {
            '@type': 'ItemList',
            name: `${cat.name} in India`,
            numberOfItems: total,
            itemListElement: masters.map((m, i) => ({
              '@type': 'ListItem',
              position: (pageNo - 1) * pageSize + i + 1,
              name: `${m.brand} ${m.name}`,
              url: `${SITE}${pref}/${m.slug}/`,
            })),
          },
        ],
      }
    : null
  // Page 2+ and non-default filters are noindex (canonical stays the base grid).
  const canonicalDefault = power === 'electric' && pageNo === 1
  return page({
    title: `${cat.name} in India — compare live prices | narenana`,
    desc: `Every ${cat.name.toLowerCase()} you can buy in India — kits, PNP and RTF, with live prices and stock compared across Indian hobby shops.`,
    path: `${pref}/`,
    body,
    jsonld,
    noindex: masters.length === 0 || !canonicalDefault,
  })
}

function recipesFor(recipes, components) {
  if (!recipes?.length) return ''
  const panel = (r, active) => {
    let picks = []
    try {
      picks = JSON.parse(r.picks)
    } catch {}
    picks = picks.map((p) => ({ ...p, c: components[p.component_id] })).filter((p) => p.c)
    const parts = picks.reduce((n, p) => n + (p.c.price_inr ?? 0), 0)
    return `<div class="rp" data-panel="${r.id}" ${active ? '' : 'hidden'}>
      <p class="rp-sum">${esc(r.summary ?? '')}</p>
      <table class="vars rp-table"><tbody>
        ${picks.map((p) => `<tr><td class="rp-role">${esc(p.role)}</td><td><a href="${esc(p.c.url)}" target="_blank" rel="noopener nofollow">${esc(p.c.name)}</a><span class="rp-vendor">${esc(p.c.vendor ?? '')}</span></td><td>${p.c.price_inr ? inr(p.c.price_inr) : '—'}</td></tr>`).join('')}
      </tbody><tfoot><tr class="rp-total"><td colspan="2">Electronics ≈</td><td>${inr(parts)}</td></tr></tfoot></table>
    </div>`
  }
  return `<section class="recipes"><h2 class="sec">What to put in it</h2>
    <div class="tabs">${recipes.map((r, i) => `<button class="tab ${i === 0 ? 'is-on' : ''}" data-tab="${r.id}">${esc(r.label)}</button>`).join('')}</div>
    ${recipes.map((r, i) => panel(r, i === 0)).join('')}
    <script>document.querySelectorAll('.tab').forEach((t)=>t.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach((x)=>x.classList.toggle('is-on',x===t));document.querySelectorAll('.rp').forEach((p)=>{p.hidden=p.dataset.panel!==t.dataset.tab})}))</script>
  </section>`
}

export function renderMaster(cat, m, offers, recipes = [], components = {}) {
  let specs = {}
  try {
    specs = JSON.parse(m.specs || '{}')
  } catch {}
  const schema = (() => {
    try {
      return JSON.parse(cat.spec_schema)
    } catch {
      return []
    }
  })()

  const liveOffers = offers.filter((o) => !o.dead && o.in_stock)
  const configs = [...new Set(offers.map((o) => o.config))]
  // Min over PRESENT prices only — data-poor offers (price NULL until a scan
  // or verify fills it) must render as "—", never as ₹∞ from Math.min().
  const minOf = (arr) => {
    const v = arr.map((o) => o.price_inr).filter(Boolean)
    return v.length ? Math.min(...v) : null
  }
  const liveMin = minOf(liveOffers)
  const seenMin = minOf(offers)
  const offerRow = (o) => `
    <tr class="${o.dead || !o.in_stock ? 'is-dim' : ''}">
      <td>${o.dead ? esc(o.source_name) : `<a class="offer-seller" href="${esc(o.url_canonical)}" target="_blank" rel="noopener nofollow">${esc(o.source_name)} ↗</a>`}${o.grey_import ? ' <span class="badge warn badge-sm">import</span>' : ''}${o.made_in_india ? ' <span class="badge made badge-sm">Made in India</span>' : ''}${conditionOf(o.title) === 'used' ? ' <span class="badge warn badge-sm">pre-owned</span>' : ''}</td>
      <td>${esc(o.config)}${o.pack_qty > 1 ? ` ×${o.pack_qty}` : ''}</td>
      <td>${o.flagged ? `<span title="price under review">${o.price_inr ? inr(o.price_inr) : '—'}*</span>` : o.price_inr ? inr(o.price_inr) : '—'}<span class="rp-note">as of ${dateOf(o.last_checked ?? o.last_seen)}</span></td>
      <td>${o.dead ? '<span class="badge bad badge-sm">gone</span>' : o.in_stock ? '<span class="badge ok badge-sm">In stock</span>' : '<span class="badge bad badge-sm">Out of stock</span>'}</td>
      <td>${o.dead ? '' : `<a class="cta cta-buy" href="${esc(o.url_canonical)}" target="_blank" rel="noopener nofollow">Buy&nbsp;→</a>`}</td>
    </tr>`

  const productLd = liveOffers.length && liveMin ? {
    '@type': 'Product',
    name: `${m.brand} ${m.name}`, brand: { '@type': 'Brand', name: m.brand }, description: m.blurb ?? undefined,
    image: m.hero_image ? `${SITE}/img/master/${m.id}` : undefined,
    offers: {
      '@type': 'AggregateOffer', priceCurrency: 'INR',
      lowPrice: liveMin,
      highPrice: Math.max(...liveOffers.map((o) => o.price_inr).filter(Boolean)),
      offerCount: liveOffers.length, availability: 'https://schema.org/InStock',
    },
  } : null
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'narenana', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: `${cat.name} in India`, item: `${SITE}${cat.path_prefix}/` },
          { '@type': 'ListItem', position: 3, name: `${m.brand} ${m.name}` },
        ],
      },
      ...(productLd ? [productLd] : []),
    ],
  }

  const body = `
  <main class="wrap">
    <a class="crumb" href="${cat.path_prefix}/">← all ${esc(cat.name.toLowerCase())}</a>
    <h1 class="kit-h">${esc(m.brand)} ${esc(m.name)}</h1>
    ${m.blurb ? `<p class="lede">${esc(m.blurb)}</p>` : ''}
    <div class="kit-key">
      ${m.hero_image || offers.some((o) => o.image_url) ? `<div class="kit-img"><img src="/img/master/${m.id}" alt="${esc(m.brand)} ${esc(m.name)}" width="800" height="600" /></div>` : ''}
      ${liveMin
        ? `<div class="price price-lg"><span class="price-pre">from</span> ${inr(liveMin)}</div>`
        : seenMin
          ? `<div class="price price-lg is-muted"><span class="price-pre">last seen</span> ${inr(seenMin)}</div>`
          : ''}
      <dl class="spec">
        ${schema.filter((f) => specs[f.key] != null && specs[f.key] !== '').map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(String(specs[f.key]))}${f.unit ?? ''}</dd></div>`).join('')}
      </dl>
    </div>
    <h2 class="sec">Where to buy${configs.length > 1 ? ' <span class="count">by configuration</span>' : ''}</h2>
    <table class="vars"><thead><tr><th>Seller</th><th>Config</th><th>Price</th><th>Stock</th><th></th></tr></thead>
      <tbody>${offers.map(offerRow).join('')}</tbody></table>
    ${offers.some((o) => o.tax_included === 0) ? '<p class="tax">Some sellers list prices <strong>excluding tax/duty</strong> — checkout totals will be higher.</p>' : ''}
    ${recipesFor(recipes, components)}
  </main>`
  return page({
    title: `${m.brand} ${m.name} — price in India | narenana`,
    desc: m.blurb || `${m.brand} ${m.name}: prices compared across ${offers.length} Indian seller listing${offers.length === 1 ? '' : 's'}.`,
    path: `${cat.path_prefix}/${m.slug}/`,
    body, jsonld,
    image: m.hero_image ? `${SITE}/img/master/${m.id}` : undefined,
  })
}
