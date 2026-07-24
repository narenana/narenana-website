// Admin panel v2 — Review · Sources · Catalog · System. Served at /admin
// behind HTTP Basic auth (the browser manages the credential; same-origin
// fetches attach it automatically, so there is no token in page storage).
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Catalog admin</title>
<style>
:root{--bg:#0e1117;--fg:#e6edf3;--muted:#8b949e;--accent:#1f9bd9;--accent-bright:#3eb5e8;--card:#161b22;--border:#30363d;--ok:#3fb950;--bad:#f85149;--warn:#d29922}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(14,17,23,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
h1{font-size:1rem;margin:0 8px 0 0}.grow{flex:1}
button{font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;border-radius:7px;border:1px solid var(--border);background:var(--card);color:var(--muted);padding:7px 12px}
button:hover{color:var(--fg);border-color:var(--accent)}button.on{background:var(--accent);border-color:var(--accent);color:#06222e}
button.go{background:var(--accent-bright);border-color:var(--accent-bright);color:#06222e}button.ok{background:var(--ok);border-color:var(--ok);color:#04260c}button.no{border-color:rgba(248,81,73,.4);color:var(--bad)}
button span{opacity:.6;margin-left:4px;font-weight:500}
.bar{display:flex;gap:6px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border);background:rgba(22,27,34,.5)}
.chip{font-size:.74rem;padding:5px 10px}
.tsep{width:1px;align-self:stretch;background:var(--border);margin:2px 4px}
.fgrp{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
.flabel{font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);opacity:.8;margin-right:1px}
.fsep{width:1px;align-self:stretch;background:var(--border);margin:0 6px}
.wrap{max-width:980px;margin:0 auto;padding:16px 16px 90px}
.row{display:grid;grid-template-columns:110px 1fr auto;gap:14px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;align-items:start}
.row.gone{opacity:.35;transition:opacity .2s}
.thumb{width:110px;height:84px;background:#fff;border-radius:8px;object-fit:contain}
.noimg{width:110px;height:84px;background:#f2f2f2;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:.68rem}
.title{font-weight:600;font-size:.9rem;margin:0 0 3px}.meta{font-size:.74rem;color:var(--muted);margin:0 0 8px}.meta a{color:var(--accent-bright)}
.price{color:var(--ok);font-weight:700}.oos{color:var(--bad)}.unk{color:var(--warn)}
.tag{font-size:.62rem;text-transform:uppercase;letter-spacing:.04em;padding:1px 6px;border-radius:4px;border:1px solid var(--border);color:var(--muted)}.tag.w{color:var(--accent-bright);border-color:rgba(62,181,232,.4)}
.map{border-top:1px dashed var(--border);margin-top:8px;padding-top:8px}
.map .sugg{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.fields{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.fields input,.fields select{background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:.78rem;width:100%}
.fields .wide{grid-column:1/-1}
.acts{display:flex;flex-direction:column;gap:6px}.acts button{width:112px}
pre,#log{font-family:ui-monospace,monospace;font-size:.72rem;color:var(--muted);white-space:pre-wrap}
#log{padding:8px 16px;max-height:150px;overflow:auto}
.empty{text-align:center;color:var(--muted);padding:44px 0}
table.t{width:100%;border-collapse:collapse;font-size:.82rem}table.t td,table.t th{padding:8px 6px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
input.inline{background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:.8rem}
</style></head><body>
<header>
  <h1>Catalog <span style="opacity:.4;font-size:.7rem">v12</span></h1>
  <button class="on" data-tab="review">Review</button>
  <button data-tab="catalog">Catalog</button>
  <button data-tab="popularity">Popularity</button>
  <button data-tab="dupes">Duplicates</button>
  <button data-tab="mfr">Manufacturer</button>
  <span class="tsep"></span>
  <button data-tab="sources">Sources</button>
  <button data-tab="system">System</button>
  <span class="grow"></span>
  <button id="run" class="go">Run job slice</button>
</header>
<div id="log" hidden></div>
<div class="bar" id="filters" style="display:none"></div>
<div class="wrap"><div id="view">loading…</div></div>
<script>
const $=(s)=>document.querySelector(s);
const esc=(s)=>(s??'').toString().replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr=(n)=>'₹'+Number(n).toLocaleString('en-IN');
const ago=(ms)=>{if(!ms)return 'never';const h=Math.round((Date.now()-ms)/3.6e6);return h<1?'<1h ago':h<48?h+'h ago':Math.round(h/24)+'d ago'};
const fmtViews=(n)=>n==null?'—':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n);
// Resolve against location.origin, NOT the document URL: if the page was
// opened as http://user:pass@host/admin the document base carries credentials
// and fetch() refuses to construct the request — the panel dies looking empty.
const api=async(p,body)=>{const r=await fetch(new URL('/api/'+p,location.origin),body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d};
let tab='review',F={status:'new',stock:'in',src:'',page:1},data=null,reqSeq=0;

// URL state: /admin?tab=&status=&stock=&src=&page= — filters are linkable and
// survive refresh / back-button.
function syncURL(){var p=new URLSearchParams();p.set('tab',tab);
  if(tab==='review'){p.set('status',F.status);if(F.status==='new')p.set('stock',F.stock);if(F.src)p.set('src',F.src)}
  if(F.page>1)p.set('page',F.page);
  try{history.replaceState(null,'','/admin?'+p.toString())}catch(e){}}
function readURL(){var p=new URLSearchParams(location.search);
  if(p.get('tab'))tab=p.get('tab');
  if(p.get('status'))F.status=p.get('status');
  if(p.get('stock'))F.stock=p.get('stock');
  if(p.get('src')!=null)F.src=p.get('src');
  F.page=Math.max(1,parseInt(p.get('page')||'1',10)||1);}
function markTab(){document.querySelectorAll('header button[data-tab]').forEach((x)=>x.classList.toggle('on',x.dataset.tab===tab))}
document.querySelectorAll('header button[data-tab]').forEach((b)=>b.onclick=()=>{tab=b.dataset.tab;F.page=1;markTab();load()});
window.addEventListener('popstate',()=>{readURL();markTab();load()});
$('#run').onclick=async()=>{$('#log').hidden=false;$('#log').textContent='running slice…';try{const d=await api('run',{});$('#log').textContent=JSON.stringify(d,null,1)}catch(e){$('#log').textContent=e.message}load()};

// SPA pager: total/pageSize/current → buttons that set F.page and reload.
function pager(total,pageSize,page){
  const tp=Math.max(1,Math.ceil((total||0)/(pageSize||40)));
  if(tp<=1)return '';
  const b=(pg,txt,cur)=>cur?'<span class="chip on">'+txt+'</span>':(pg<1||pg>tp?'<span class="chip" style="opacity:.4">'+txt+'</span>':'<button class="chip" data-page="'+pg+'">'+txt+'</button>');
  let out='<div class="bar" style="justify-content:center;border:none">'+b(page-1,'← Prev')+' <span class="meta" style="align-self:center">page '+page+' / '+tp+'</span> '+b(page+1,'Next →')+'</div>';
  return out;
}
function wirePager(){document.querySelectorAll('button[data-page]').forEach((b)=>b.onclick=()=>{F.page=+b.dataset.page;load();window.scrollTo(0,0)})}

async function load(){
  const my=++reqSeq;               // stale responses from an old tab must not render
  syncURL();
  $('#filters').style.display=tab==='review'?'flex':'none';
  $('#view').setAttribute('aria-busy','1');
  try{
    let d;
    if(tab==='review')d=await api('review?status='+F.status+'&stock='+F.stock+'&src='+encodeURIComponent(F.src)+'&page='+F.page);
    else if(tab==='sources')d=await api('sources');
    else if(tab==='catalog')d=await api('catalog?page='+F.page+(F.anomaly?'&anomaly=1':''));
    else if(tab==='popularity')d=await api('catalog?sort=pop&page='+F.page);
    else if(tab==='dupes')d=await api('duplicates');
    else if(tab==='mfr')d=await api('mfr-matches?status='+(F.mfrStatus||'pending'));
    else if(tab==='system')d=await api('system');
    if(my!==reqSeq)return;          // a newer load() superseded this one
    data=d;
    if(tab==='review'){renderFilters();renderReview()}
    else if(tab==='sources')renderSources();
    else if(tab==='catalog')renderCatalog();
    else if(tab==='popularity')renderPopularity();
    else if(tab==='dupes')renderDupes();
    else if(tab==='mfr')renderMfr();
    else if(tab==='system')renderSystem();
  }catch(e){if(my===reqSeq)$('#view').innerHTML='<p class="empty">'+esc(e.message||'load error')+'</p>'}
}

// ------- Review -------
function renderFilters(){
  const c=data.counts,sc=data.srcCounts||{},stc=data.stockCounts||{};
  const btn=(grp,val,label,count)=>'<button class="chip '+(F[grp]===val?'on':'')+'" data-g="'+grp+'" data-v="'+val+'">'+label+(count!=null?' <span>'+(count??0)+'</span>':'')+'</button>';
  const srcTotal=Object.values(sc).reduce((a,b)=>a+b,0);
  // Grouped + labelled so the row reads as Status / Stock / Seller, not one chip soup.
  const grp=(label,inner)=>'<span class="fgrp"><span class="flabel">'+label+'</span>'+inner+'</span>';
  const statusChips=btn('status','new','New',c.new)+btn('status','missing','Missing',c.missing)+btn('status','flagged','Flagged',c.flagged)+btn('status','approved','Approved',c.approved)+btn('status','rejected','Rejected',c.rejected)+btn('status','removed','Removed',c.removed);
  const stockChips=btn('stock','in','In stock',stc.in)+btn('stock','out','Not in stock',stc.out)+btn('stock','all','Any',stc.all);
  const sellerChips=btn('src','','All',srcTotal)+data.sources.map((s)=>btn('src',s.id,s.id,sc[s.id]||0)).join('');
  $('#filters').innerHTML=grp('Status',statusChips)
    +(F.status==='new'?'<span class="fsep"></span>'+grp('Stock',stockChips):'')
    +'<span class="fsep"></span>'+grp('Seller',sellerChips);
  document.querySelectorAll('#filters .chip').forEach((b)=>b.onclick=()=>{F[b.dataset.g]=b.dataset.v;F.page=1;load()});
}
function skuRow(k){
  let flg=null;try{flg=k.flagged?JSON.parse(k.flagged):null}catch(e){}
  const stock=flg?(flg.kind==='missing'?'<span class="oos">⚑ missing from seller'+(flg.detail?' ('+esc(flg.detail)+')':'')+'</span>':'<span class="unk">⚑ '+esc(flg.kind)+(flg.detail?': '+esc(flg.detail):'')+'</span>'):(k.quote_only&&k.price_inr==null)?'<span class="unk">quote only</span>':k.in_stock===1?'':k.in_stock===0?'<span class="oos">out of stock</span>':'<span class="unk">stock unverified</span>';
  const sugg=(k.suggestions||[]).map((m)=>'<button class="chip" data-a="attach" data-sku="'+k.id+'" data-master="'+m.id+'">→ '+esc(m.brand+' '+m.name)+'</button>').join('');
  const mapUI=F.status==='new'?'<div class="map"><div class="sugg">'+(sugg||'<span class="tag">no master match — create one:</span>')+'</div>'
    +'<div class="fields"><input data-f="brand" value="'+esc(k.guess.brand)+'" placeholder="Brand"/><input data-f="name" value="'+esc(k.guess.name)+'" placeholder="Model name"/><input data-f="slug" value="'+esc(k.guess.slug)+'" placeholder="slug"/><select data-f="config">'+(((data.cat||{}).configs)||[]).map((c)=>'<option'+(c===(k.guess.config||'kit')?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select>'
    +(data.specFields||[]).map((f)=>'<input data-f="spec:'+f.key+'" value="'+esc(k.guess.specs[f.key]??'')+'" placeholder="'+esc(f.label)+(f.required?' *':'')+'"/>').join('')
    +'</div></div>':'';
  const acts=F.status==='new'
    ?'<button class="ok" data-a="approve" data-sku="'+k.id+'">Approve new</button><button class="no" data-a="reject" data-sku="'+k.id+'" data-r="accessory">Accessory</button><button class="no" data-a="reject" data-sku="'+k.id+'" data-r="out-of-scope">Out of scope</button><button class="no" data-a="reject" data-sku="'+k.id+'" data-r="junk">Junk</button>'
    :F.status==='rejected'?'<button data-a="restore" data-sku="'+k.id+'">Restore</button>'
    :F.status==='approved'?'<button class="no" data-a="unapprove" data-sku="'+k.id+'">Un-approve</button>'
    :F.status==='missing'?'<button class="ok" data-a="unflag" data-sku="'+k.id+'">Still available (keep)</button><button class="no" data-a="confirm-gone" data-sku="'+k.id+'">Confirm removal</button>'
    :F.status==='removed'?'<button class="ok" data-a="restore-live" data-sku="'+k.id+'">Restore</button>'
    :F.status==='flagged'?'<button class="ok" data-a="unflag" data-sku="'+k.id+'">Accept change</button><button class="no" data-a="unapprove" data-sku="'+k.id+'">Un-approve</button>':'';
  return '<div class="row" data-sku="'+k.id+'">'
    +(k.image_url?'<img class="thumb" loading="lazy" src="'+esc(k.image_url)+'" onerror="this.outerHTML=\\'<div class=noimg>no image</div>\\'"/>':'<div class="noimg">no image</div>')
    +'<div><p class="title">'+esc(k.title||'(untitled)')+' '+(k.guess.kind==='accessory'||k.guess.kind==='other'?'<span class="tag" style="color:var(--warn)">AI: not aircraft</span>':k.score>0||k.guess.kind==='aircraft'?'<span class="tag w">likely</span>':'<span class="tag">unsure</span>')+'</p>'
    +'<p class="meta"><span class="tag">'+esc(k.source_id)+'</span> '+(k.price_inr?'<span class="price">'+inr(k.price_inr)+'</span>':'no price')+' '+stock
    +(k.master?' · mapped to <b>'+esc(k.master)+'</b>':'')+' · <a href="'+esc(k.url_canonical)+'" target="_blank" rel="noopener">seller page ↗</a></p>'
    +mapUI+'</div><div class="acts">'+acts+'</div></div>';
}
function renderReview(){
  const rows=data.skus;
  const total=(data.counts&&(data.counts[F.status]!=null?data.counts[F.status]:0))||rows.length;
  $('#view').innerHTML=(rows.length?rows.map(skuRow).join(''):'<p class="empty">Queue is clear.</p>')+pager(total,data.pageSize,data.page||1);
  wirePager();
}
document.addEventListener('click',async(e)=>{
  const b=e.target.closest('button[data-a]');if(!b)return;
  const row=b.closest('.row');const skuId=+b.dataset.sku;
  const body={skuId,action:b.dataset.a};
  if(b.dataset.a==='reject')body.reason=b.dataset.r;
  if(b.dataset.a==='attach')body.masterId=+b.dataset.master;
  if(b.dataset.a==='approve'){
    body.master={specs:{}};
    row.querySelectorAll('[data-f]').forEach((i)=>{const f=i.dataset.f;if(f.startsWith('spec:'))body.master.specs[f.slice(5)]=i.value.trim();else if(f==='config')body.config=i.value;else body.master[f]=i.value.trim()});
    if(!body.master.brand||!body.master.name||!body.master.slug)return alert('Brand, name, slug required');
  }
  if(b.dataset.a==='attach'){const sel=row.querySelector('[data-f="config"]');body.config=sel?sel.value:'kit'}
  if(b.dataset.a==='unapprove'&&!confirm('Remove this offer from the live site?'))return;
  if(b.dataset.a==='confirm-gone'&&!confirm('Confirm this product is gone and remove it from the live site? (the record is kept and can be restored)'))return;
  b.disabled=true;
  try{await api('decide',body);row.classList.add('gone');setTimeout(load,250)}catch(err){alert(err.message);b.disabled=false}
});

// ------- Sources -------
function renderSources(){
  $('#view').innerHTML='<div class="row" style="grid-template-columns:1fr auto"><div><p class="title">Add a scannable URL</p>'
    +'<div class="fields"><input id="newurl" class="wide" placeholder="https://seller.example/category-or-collection-url"/>'
    +data.categories.map((c,i)=>'<label style="font-size:.8rem"><input type="checkbox" value="'+c.id+'" '+(i===0?'checked':'')+'/> '+esc(c.name)+'</label>').join('')
    +'</div><p class="meta">The system probes the platform and dry-runs a scan before saving — a broken URL is rejected here, not discovered weeks later.</p></div>'
    +'<div class="acts"><button id="addurl" class="go">Probe & add</button></div></div>'
    +'<table class="t"><thead><tr><th>Seller</th><th>URL</th><th>Status</th><th>Last scan</th><th></th></tr></thead><tbody>'
    +data.urls.map((u)=>'<tr><td>'+esc(u.source_id)+'<br/><span class="tag">'+esc(u.platform||'?')+'</span></td>'
      +'<td style="max-width:340px;overflow-wrap:anywhere"><a href="'+esc(u.url_canonical)+'" target="_blank">'+esc(u.url_canonical)+'</a><br/><span class="tag">'+esc(u.cats||'')+'</span></td>'
      +'<td>'+esc(u.status)+'</td><td><pre>'+esc(u.last_scan_note||'—')+'</pre></td>'
      +'<td><button data-su="'+u.id+'" data-st="'+(u.status==='active'?'paused':'active')+'">'+(u.status==='active'?'Pause':'Activate')+'</button></td></tr>').join('')
    +'</tbody></table>';
  $('#addurl').onclick=async()=>{
    const url=$('#newurl').value.trim();if(!url)return;
    const cats=[...document.querySelectorAll('#view input[type=checkbox]:checked')].map((i)=>i.value);
    $('#addurl').disabled=true;$('#addurl').textContent='probing…';
    try{const d=await api('sources',{url,categories:cats});alert('Added ('+d.platform+'): '+d.found+' products found, '+(d.seeded||0)+' queued now'+(d.subtree>1?', subtree of '+d.subtree+' pages/categories will be scanned':''));load()}
    catch(e){alert(e.message)}finally{$('#addurl').disabled=false;$('#addurl').textContent='Probe & add'}
  };
  document.querySelectorAll('button[data-su]').forEach((b)=>b.onclick=async()=>{await api('source-url',{id:+b.dataset.su,status:b.dataset.st});load()});
}

// ------- Catalog -------
function renderCatalog(){
  $('#view').innerHTML='<table class="t"><thead><tr><th>Model</th><th>Status</th><th>Offers</th><th>Specs · Blurb</th><th></th></tr></thead><tbody>'
    +data.masters.map((m)=>{
      let sp={};try{sp=JSON.parse(m.specs||'{}')}catch(e){}
      const specIn='<div style="display:flex;gap:4px;margin-bottom:4px">'
        +'<input class="inline" style="width:70px" data-m="'+m.id+'" data-f="brand" value="'+esc(m.brand)+'" placeholder="Brand"/>'
        +'<input class="inline" style="flex:1" data-m="'+m.id+'" data-f="name" value="'+esc(m.name)+'" placeholder="Name"/>'
        +'<input class="inline" style="width:78px" data-m="'+m.id+'" data-f="spec:spanMM" value="'+esc(sp.spanMM??'')+'" placeholder="span mm"/></div>';
      const anom=(function(){if(!m.anomaly)return '';var a;try{a=JSON.parse(m.anomaly)}catch(e){return ''}return '<div class="unk" style="margin-top:3px;font-size:11px" title="detected by dedup finder">⚑ '+esc(a.detail||a.kind)+'</div>'})();
      return '<tr'+(m.anomaly?' style="background:rgba(198,59,46,.06)"':'')+'><td style="min-width:120px"><span class="tag">'+esc(m.category_id)+'/'+esc(m.slug)+'</span>'+anom+'</td>'
      +'<td>'+esc(m.status)+'</td><td>'+m.offers+' ('+m.live_offers+' live)</td>'
      +'<td style="min-width:280px">'+specIn+'<input class="inline" style="width:100%" data-m="'+m.id+'" data-f="blurb" value="'+esc(m.blurb||'')+'" placeholder="one-line blurb"/></td>'
      +'<td style="white-space:nowrap"><button data-mm="'+m.id+'" data-st="'+(m.status==='ready'?'draft':'ready')+'">'+(m.status==='ready'?'Unpublish':'Publish')+'</button> '
      +'<a class="tag" href="'+esc(m.path)+'" target="_blank">view ↗</a></td></tr>'}).join('')
    +'</tbody></table><div style="margin:8px 0"><button id="anomToggle" class="chip'+(F.anomaly?' on':'')+'">⚑ '+(data.anomalyCount||0)+' flagged'+(F.anomaly?' — showing only these (clear)':' — show')+'</button></div>'
    +'<p class="meta">Edit brand / name / wingspan / blurb inline — saves on blur. Publish requires the required specs (the API refuses otherwise). '+(data.total||0)+' models'+(F.anomaly?' flagged':' total')+'.</p>'+pager(data.total,data.pageSize,data.page||1);
  wirePager();
  (function(){var at=$('#anomToggle');if(at)at.onclick=()=>{F.anomaly=!F.anomaly;F.page=1;load()}})();
  document.querySelectorAll('button[data-mm]').forEach((b)=>b.onclick=async()=>{try{await api('master',{id:+b.dataset.mm,status:b.dataset.st});load()}catch(e){alert(e.message)}});
  document.querySelectorAll('input[data-m]').forEach((i)=>i.onchange=async()=>{
    const id=+i.dataset.m,f=i.dataset.f,body={id};
    if(f.startsWith('spec:')){const row=data.masters.find((x)=>x.id===id);let sp={};try{sp=JSON.parse(row.specs||'{}')}catch(e){}sp[f.slice(5)]=i.value.trim();row.specs=JSON.stringify(sp);body.specs=row.specs}
    else body[f]=i.value;
    await api('master',body);
  });
}

// ------- Popularity (admin preview — not yet exposed to customers) -------
function renderPopularity(){
  const rows=data.masters||[];
  const start=((data.page||1)-1)*(data.pageSize||50);
  const head='<div style="margin-bottom:14px"><p class="title" style="margin:0 0 2px">Popularity ranking <span class="tag w">admin preview</span></p>'
    +'<p class="meta" style="max-width:640px"><b>Score</b> = YouTube interest (views · breadth of coverage · recency) × availability (in-stock &amp; sellers). <b>Raw</b> is interest alone — the content-priority signal (stays high for import-gap models). Not exposed to customers yet: validate the ordering and the matched videos here. Un-polled models sort last; the poll refreshes ~89 models/day (YouTube quota), so a full first pass takes a day or two.</p></div>';
  if(!rows.length){$('#view').innerHTML=head+'<p class="empty">No models yet.</p>';return}
  $('#view').innerHTML=head+'<table class="t"><thead><tr><th style="width:30px">#</th><th>Model</th><th style="width:118px">Score</th><th>Matched YouTube videos</th><th style="width:64px">Offers</th></tr></thead><tbody>'
    +rows.map((m,i)=>{
      const vids=(m.videos||[]).map((v)=>'<div class="meta" style="'+(v.excluded?'opacity:.4;text-decoration:line-through':'')+'">'+(v.pinned?'📌 ':'▸ ')
        +'<a href="https://youtu.be/'+esc(v.video_id)+'" target="_blank" rel="noopener">'+esc((v.title||'(untitled)').slice(0,64))+'</a> · '+fmtViews(v.views)+' views'+(v.channel?' · '+esc(v.channel):'')+'</div>').join('')
        ||'<span class="meta">'+(m.pop_updated_at?'no videos matched':'not polled yet')+'</span>';
      const score=m.pop_score!=null
        ? '<b style="font-size:1rem">'+(Math.round(m.pop_score*10)/10)+'</b><div class="meta">raw '+(Math.round((m.pop_raw||0)*10)/10)+' · '+ago(m.pop_updated_at)+'</div>'
        : '<span class="tag">—</span>';
      return '<tr><td class="meta">'+(m.pop_score!=null?start+i+1:'')+'</td>'
        +'<td style="min-width:150px"><b>'+esc(m.brand||'')+'</b> '+esc(m.name||'')+'<div class="meta"><span class="tag">'+esc(m.category_id)+'/'+esc(m.slug)+'</span> · '+esc(m.status)+' · <a href="'+esc(m.path)+'" target="_blank">page ↗</a></div></td>'
        +'<td>'+score+'</td><td style="min-width:260px">'+vids+'</td>'
        +'<td class="meta">'+m.offers+' ('+m.live_offers+')</td></tr>'}).join('')
    +'</tbody></table>'+pager(data.total,data.pageSize,data.page||1);
  wirePager();
}

// ------- Duplicates -------
const DD_CSS='<style>.dd-pair{border:1px solid var(--line,#e5ddc9);border-radius:10px;padding:12px;margin-bottom:14px;background:var(--card,#fcf9f1)}'
  +'.dd-cols{display:flex;gap:10px;align-items:flex-start}.dd-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}'
  +'.dd-side.keep{outline:2px solid #2e7d5b55;border-radius:8px;padding:6px;background:#f2f8f4}'
  +'.dd-lbl{font-size:10px;letter-spacing:.06em;font-weight:700;color:var(--muted,#8a7f66)}'
  +'.dd-img{width:100%;height:140px;object-fit:contain;background:#f3eee0;border-radius:6px}.dd-img.dd-noimg{visibility:hidden;height:0}'
  +'.dd-nm{font-size:14px;font-weight:600;line-height:1.25}.dd-offers{display:flex;flex-direction:column;gap:4px;margin-top:3px}'
  +'.dd-offer{font-size:12px;border-left:3px solid #e0d9c8;padding-left:7px}.dd-offer.dd-dead{opacity:.4}'
  +'.dd-t{color:var(--muted,#8a7f66);font-size:11px;line-height:1.3}.dd-oos{color:#c63b2e;font-weight:600}'
  +'.dd-arrow{align-self:center;text-align:center;color:var(--muted,#8a7f66);font-size:11px;white-space:nowrap;min-width:46px}'
  +'.dd-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap}.dd-foot .acts{display:flex;gap:8px}'
  +'.dd-prio{font-size:10px;font-weight:700;color:#2e7d5b;background:#e6f2ea;border-radius:4px;padding:2px 6px;letter-spacing:.04em;margin-right:6px}'
  +'.dd-cosmetic{font-size:10px;font-weight:600;color:var(--muted,#8b949e);margin-right:6px}'
  +'.dd-divider{font-size:11px;font-weight:600;color:var(--muted,#8b949e);text-align:center;margin:2px 0 14px;padding-top:12px;border-top:1px dashed var(--border,#30363d)}</style>';
function renderDupes(){
  const rows=data.candidates||[];
  const span=(sp)=>{try{const v=JSON.parse(sp||'{}').spanMM;return v?v+'mm':''}catch(e){return ''}};
  const money=(n)=>n?'₹'+Number(n).toLocaleString('en-IN'):'—';
  const offerLine=(o)=>'<div class="dd-offer'+(o.dead?' dd-dead':'')+'"><div><a href="'+esc(o.url_canonical)+'" target="_blank" rel="noopener nofollow">'+esc(o.source_name||'seller')+' ↗</a> · <b>'+money(o.price_inr)+'</b>'+(o.in_stock===0?' <span class="dd-oos">out</span>':'')+'</div><div class="dd-t">'+esc((o.title||'').slice(0,90))+'</div></div>';
  const side=(r,pre,label,keep)=>'<div class="dd-side'+(keep?' keep':'')+'"><div class="dd-lbl">'+label+'</div>'
    +'<img class="dd-img" src="/img/master/'+r[pre+'id']+'" loading="lazy" alt="" onerror="this.classList.add(\\'dd-noimg\\')"/>'
    +'<div class="dd-nm"><span class="tag">'+esc(r[pre+'brand']||'—')+'</span> '+esc(r[pre+'name'])+'</div>'
    +'<div class="meta">'+esc(r[pre+'status'])+' · '+esc(span(r[pre+'specs'])||'no span')+' · '+esc(r[pre+'power']||'?')+' · '+((r[pre+'offers']||[]).length)+' offer(s) · <a href="'+esc(r.prefix)+'/'+esc(r[pre+'slug'])+'/" target="_blank" rel="noopener">page ↗</a></div>'
    +'<div class="dd-offers">'+(r[pre+'offers']||[]).map(offerLine).join('')+'</div></div>';
  const card=(r)=>{const keepA=r.keepId===r.a_id;const K=keepA?'a_':'b_',M=keepA?'b_':'a_';const dropId=keepA?r.b_id:r.a_id;
    return '<div class="dd-pair"><div class="dd-cols">'+side(r,K,'✔ KEEP',true)+'<div class="dd-arrow">◀ merge<br>into keep</div>'+side(r,M,'MERGE IN',false)
      +'</div><div class="dd-foot"><span class="meta">'+(r.both_in_stock?'<span class="dd-prio">★ both in stock</span>':'<span class="dd-cosmetic">one side out · cosmetic</span>')+esc(r.reason)+' · '+Math.round(r.score*100)+'%</span>'
      +'<span class="acts"><button class="ok" data-dd="merge" data-keep="'+r.keepId+'" data-drop="'+dropId+'">✓ Same — merge</button>'
      +'<button class="no" data-dd="reject" data-keep="'+r.a_id+'" data-drop="'+r.b_id+'">✕ Different</button></span></div></div>';};
  const prio=rows.filter((r)=>r.both_in_stock).length;
  let divShown=false;
  const listHtml=rows.map((r)=>{let pre='';if(!r.both_in_stock&&!divShown){divShown=true;pre='<div class="dd-divider">↓ below: one side is already out of stock — merging is cosmetic (does not change what shoppers see), safe to skip</div>';}return pre+card(r);}).join('');
  $('#view').innerHTML=DD_CSS+'<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><button id="ddrun" class="go">Scan for duplicates now</button>'
    +'<span class="meta">'+rows.length+' pair(s) · <b>'+prio+' with both sides in stock</b> (shown first — these are the ones that change what shoppers see). Confirm only if the two are the SAME product from different sellers.</span></div>'
    +(rows.length?listHtml:'<p class="empty">No duplicate pairs awaiting review. The cron re-checks every few hours.</p>');
  $('#ddrun').onclick=async()=>{$('#ddrun').disabled=true;$('#ddrun').textContent='scanning…';try{const d=await api('dedup-run',{});alert('Auto-merged '+(d.merged||0)+', flagged '+(d.flagged||0)+' for review, '+(d.anomalies||0)+' anomalies')}catch(e){alert(e.message)}load()};
  document.querySelectorAll('button[data-dd]').forEach((b)=>b.onclick=async()=>{
    const keep=+b.dataset.keep,drop=+b.dataset.drop;
    if(b.dataset.dd==='merge'&&!confirm('Merge these into ONE product page? The "MERGE IN" master is absorbed into the "KEEP" one; its offers move over. Recorded in audit.'))return;
    b.disabled=true;
    try{await api(b.dataset.dd==='merge'?'merge':'reject-merge',{aId:keep,bId:drop});load()}catch(e){alert(e.message);b.disabled=false}
  });
}

// ------- Manufacturer matches (admin verify; no consumer surface) -------
const MFR_CSS='<style>.mf-pair{border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px;background:var(--card)}'
  +'.mf-top{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}'
  +'.mf-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.03em}'
  +'.mf-accept{background:#123d29;color:#3fb950}.mf-review{background:#3d3312;color:#d29922}.mf-conflict{background:#3d1212;color:#f85149}'
  +'.mf-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mf-side{font-size:13px;min-width:0}'
  +'.mf-lbl{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em}.mf-nm{font-weight:600;margin:2px 0}'
  +'.mf-img{max-width:100%;max-height:110px;object-fit:contain;background:#fff;border-radius:6px;margin-top:6px}'
  +'.mf-desc{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.4;max-height:60px;overflow:hidden}'
  +'.mf-pick{width:100%;margin-top:8px;padding:7px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px}'
  +'.mf-note{font-size:11px;color:var(--warn);margin-top:6px}.mf-foot{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}'
  +'.mf-ok{color:var(--ok)}.mf-bad{color:var(--bad);font-weight:700}.mf-health{margin:8px 0 14px;font-size:11px;color:var(--muted)}</style>';
function renderMfr(){
  var rows=(data.matches||[]),c=(data.counts||{}),cur=(F.mfrStatus||'pending');
  var span=function(sp){try{var v=JSON.parse(sp||'{}').spanMM;return v>0?v:null}catch(e){return null}};
  var tab=function(k,l){return '<button class="chip'+(cur===k?' on':'')+'" data-mfrs="'+k+'">'+l+' '+(c[k]||0)+'</button>'};
  var card=function(r){
    var os=span(r.specs),ms=r.mfr_span,cs=(r.candidates||[]);
    var sc=os&&ms?(os===ms?'<span class="mf-ok">span '+os+' ✓</span>':'<span class="mf-bad">span '+os+' vs '+ms+' ⚠</span>'):'span '+(os||'?')+'/'+(ms||'?');
    var img='';try{var im=JSON.parse(r.image_urls||'[]');if(im[0])img='<img class="mf-img" src="'+esc(im[0])+'" loading="lazy"/>'}catch(e){}
    var bcls=r.tier==='accept'?'mf-accept':(r.span_agree===0?'mf-conflict':'mf-review');
    var opts=cs.map(function(x){var sel=+x.mfr_product_id===+r.mfr_product_id?' selected':'';return '<option value="'+x.mfr_product_id+'"'+sel+'>#'+x.rank+' / '+Math.round(x.score*100)+'% / '+esc(x.title)+' / span '+(x.span_mm||'?')+'</option>'}).join('');
    var picker=opts?'<select class="mf-pick" data-choice>'+opts+'</select>':'<div class="mf-note">No credible SKU candidates harvested yet.</div>';
    var controls='<div class="mf-foot"><button class="ok" data-mfr="accept" data-id="'+r.master_model_id+'"'+(opts?'':' disabled')+'>'+((cur==='accepted')?'Save mapping':'Map & accept')+'</button>'
      +(cur!=='rejected'?'<button class="no" data-mfr="reject" data-id="'+r.master_model_id+'">Reject</button>':'')
      +(cur!=='pending'?'<button data-mfr="reopen" data-id="'+r.master_model_id+'">Reopen</button>':'')+'</div>';
    return '<div class="mf-pair"><div class="mf-top"><span class="mf-badge '+bcls+'">'+esc(r.tier)+'</span><span class="meta">'+sc+' · '+Math.round(r.score*100)+'% · '+esc(r.mfr_brand||'')+' ('+esc(r.strategy||'')+')</span></div>'
      +'<div class="mf-cols"><div class="mf-side"><div class="mf-lbl">OUR MODEL</div><div class="mf-nm">'+esc(r.brand)+' '+esc(r.name)+'</div><div class="meta">span '+(os||'—')+' · <a href="'+esc(r.path_prefix)+'/'+esc(r.slug)+'/" target="_blank">page ↗</a></div></div>'
      +'<div class="mf-side"><div class="mf-lbl">CURRENT / RECOMMENDED SKU</div><div class="mf-nm">'+esc(r.mfr_title||'—')+'</div><div class="meta">span '+(ms||'—')+' · <a href="'+esc(r.mfr_url||'#')+'" target="_blank" rel="noopener">official ↗</a> · '+(r.body_len||0)+'c</div>'+img+'<div class="mf-desc">'+esc((r.body_preview||'').slice(0,300))+'</div></div></div>'
      +picker+(r.note?'<div class="mf-note">'+esc(r.note)+'</div>':'')+controls+'</div>';
  };
  var hs=(data.harvest||[]),bad=hs.filter(function(x){return x.last_harvest_status==='error'}).length;
  var health='<div class="mf-health">'+hs.length+' manufacturers on weekly queue-backed harvesting (Sunday 03:07 UTC)'+(bad?' · '+bad+' need attention':' · all last runs healthy')+'</div>';
  $('#view').innerHTML=MFR_CSS+'<div class="bar" style="border:none">'+tab('pending','Pending')+' '+tab('accepted','Accepted')+' '+tab('rejected','Rejected')+'<span class="meta" style="align-self:center;margin-left:8px">choose the exact official SKU, then map it; accepted content remains private.</span></div>'
    +'<div class="bar" style="border:none"><button id="mfr-rebuild-all" class="go">Match newly added models</button><button id="mfr-harvest-now">Harvest now</button><span class="meta">Matching is fast and uses stored manufacturer products. Harvesting queues a fresh crawl of all official sites.</span></div>'
    +health+(rows.length?rows.map(card).join(''):'<p class="empty">No '+cur+' matches.</p>');
  document.querySelectorAll('button[data-mfrs]').forEach(function(b){b.onclick=function(){F.mfrStatus=b.dataset.mfrs;load()}});
  document.querySelectorAll('button[data-mfr]').forEach(function(b){b.onclick=async function(){b.disabled=true;try{var p=b.closest('.mf-pair'),s=p&&p.querySelector('[data-choice]');await api('mfr-decide',{masterId:+b.dataset.id,decision:b.dataset.mfr,mfrProductId:s?+s.value:null});load()}catch(e){alert(e.message);b.disabled=false}}});
  $('#mfr-rebuild-all').onclick=async function(){var b=this;b.disabled=true;b.textContent='matching…';try{var d=await api('mfr-rebuild-all',{});alert('Matched '+d.masters+' models against '+d.candidates+' ranked candidates.');load()}catch(e){alert(e.message);b.disabled=false;b.textContent='Match newly added models'}};
  $('#mfr-harvest-now').onclick=async function(){if(!confirm('Queue a fresh crawl of all manufacturer sites now?'))return;var b=this;b.disabled=true;b.textContent='queueing…';try{var d=await api('mfr-harvest',{});alert(d.paused?'Manufacturer harvesting is paused.':'Queued '+d.queued+' manufacturer harvests.');load()}catch(e){alert(e.message);b.disabled=false;b.textContent='Harvest now'}};
}

// ------- System -------
function renderSystem(){
  const s=data.settings;
  const tog=(k,label)=>'<button data-set="'+k+'" data-v="'+(s[k]==='1'?'0':'1')+'" class="'+(s[k]==='1'?'no':'ok')+'">'+label+': '+(s[k]==='1'?'PAUSED':'running')+'</button>';
  const ago=(ms)=>{if(!ms)return '—';const h=Math.round((Date.now()-ms)/3.6e6);return (h<1?'<1h':h<48?h+'h':Math.round(h/24)+'d')+' ago';};
  const health=(data.health||[]);
  const healthTable='<h3>Source health</h3><table class="t"><thead><tr><th>Source</th><th>Last scan</th><th>Oldest verify</th><th>Live</th><th>Flagged</th><th>Removed</th></tr></thead><tbody>'
    +health.map((r)=>{const stale=r.last_scan&&(Date.now()-r.last_scan)>36*3.6e6;return '<tr><td>'+esc(r.source_id)+'</td><td'+(stale?' style="color:var(--bad)"':'')+'>'+ago(r.last_scan)+'</td><td>'+ago(r.oldest_verify)+'</td><td>'+(r.live||0)+'</td><td'+(r.flagged>0?' style="color:var(--warn)"':'')+'>'+(r.flagged||0)+'</td><td>'+(r.removed||0)+'</td></tr>'}).join('')
    +'</tbody></table>';
  $('#view').innerHTML='<p>'+tog('scan_paused','Daily scan')+' '+tog('enrich_paused','Enrich')+' '+tog('dedup_paused','Dedup')+' '+tog('verify_paused','Verify')+' '+tog('popularity_paused','Popularity')+' '+tog('mfr_paused','Manufacturer harvest')+' <button class="no" disabled>URL discovery: PAUSED (by design)</button></p>'
    +'<p class="meta">scan cursor: <pre>'+esc(s.scan_cursor||'—')+'</pre></p>'
    +healthTable
    +'<h3>Recent audit</h3><table class="t"><tbody>'
    +data.audit.map((a)=>'<tr><td>'+new Date(a.at).toISOString().slice(0,16).replace('T',' ')+'</td><td>'+esc(a.actor)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.entity)+' '+esc(a.entity_id||'')+'</td></tr>').join('')
    +'</tbody></table>';
  document.querySelectorAll('button[data-set]').forEach((b)=>b.onclick=async()=>{await api('system',{k:b.dataset.set,v:b.dataset.v});load()});
}

readURL();markTab();load();
</script></body></html>`
