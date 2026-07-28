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
  <h1>Catalog <span style="opacity:.4;font-size:.7rem">v14</span></h1>
  <button class="on" data-tab="review">Review</button>
  <button data-tab="catalog">Catalog</button>
  <button data-tab="popularity">Popularity</button>
  <button data-tab="dupes">Duplicates</button>
  <button data-tab="mfr">Manufacturer</button>
  <button data-tab="mfrdata">Aircraft data</button>
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
let tab='review',F={status:'new',stock:'in',src:'',page:1,mfrChoices:{},mfrDataFilter:'all',mfrProfileDrafts:{},mfrProfileSaved:{},mfrProfileSaving:{},mfrProfileNotice:''},data=null,reqSeq=0;

// URL state: /admin?tab=&status=&stock=&src=&page= — filters are linkable and
// survive refresh / back-button.
function syncURL(){var p=new URLSearchParams();p.set('tab',tab);
  if(tab==='review'){p.set('status',F.status);if(F.status==='new')p.set('stock',F.stock);if(F.src)p.set('src',F.src)}
  if(tab==='mfrdata'&&F.mfrDataFilter!=='all')p.set('view',F.mfrDataFilter);
  if(F.page>1)p.set('page',F.page);
  try{history.replaceState(null,'','/admin?'+p.toString())}catch(e){}}
function readURL(){var p=new URLSearchParams(location.search);
  if(p.get('tab'))tab=p.get('tab');
  if(p.get('status'))F.status=p.get('status');
  if(p.get('stock'))F.stock=p.get('stock');
  if(p.get('src')!=null)F.src=p.get('src');
  if(['all','needs','complete'].includes(p.get('view')))F.mfrDataFilter=p.get('view');
  F.page=Math.max(1,parseInt(p.get('page')||'1',10)||1);}
function markTab(){document.querySelectorAll('header button[data-tab]').forEach((x)=>x.classList.toggle('on',x.dataset.tab===tab))}
function hasProfileDrafts(){return Object.values(F.mfrProfileDrafts).some(function(x){return x&&Object.keys(x.overrides||{}).length})}
function hasProfileSaves(){return Object.keys(F.mfrProfileSaving).length>0}
document.querySelectorAll('header button[data-tab]').forEach((b)=>b.onclick=()=>{if(hasProfileSaves())return;if(tab==='mfrdata'&&b.dataset.tab!==tab&&hasProfileDrafts()){if(!confirm('Discard unsaved aircraft-data changes?'))return;F.mfrProfileDrafts={}}tab=b.dataset.tab;F.page=1;markTab();load()});
window.addEventListener('popstate',()=>{if(hasProfileSaves()){syncURL();return}readURL();markTab();load()});
window.addEventListener('beforeunload',(e)=>{if(hasProfileDrafts()||hasProfileSaves()){e.preventDefault();e.returnValue=''}});
$('#run').onclick=async()=>{if(hasProfileSaves())return;$('#log').hidden=false;$('#log').textContent='running slice…';try{const d=await api('run',{});$('#log').textContent=JSON.stringify(d,null,1)}catch(e){$('#log').textContent=e.message}if(!hasProfileSaves())load()};

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
  if(hasProfileSaves())return;
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
    else if(tab==='mfrdata')d=await api('mfr-profiles');
    else if(tab==='system')d=await api('system');
    if(my!==reqSeq||hasProfileSaves())return; // a newer load/save superseded this one
    data=d;
    if(tab==='review'){renderFilters();renderReview()}
    else if(tab==='sources')renderSources();
    else if(tab==='catalog')renderCatalog();
    else if(tab==='popularity')renderPopularity();
    else if(tab==='dupes')renderDupes();
    else if(tab==='mfr')renderMfr();
    else if(tab==='mfrdata')renderMfrProfiles();
    else if(tab==='system')renderSystem();
    $('#view').removeAttribute('aria-busy');
  }catch(e){if(my===reqSeq&&!hasProfileSaves()){$('#view').innerHTML='<p class="empty">'+esc(e.message||'load error')+'</p>';$('#view').removeAttribute('aria-busy')}}
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
    +(k.image_url?'<img class="thumb" loading="lazy" src="/img/sku/'+k.id+'" onerror="this.outerHTML=\\'<div class=noimg>no image</div>\\'"/>':'<div class="noimg">no image</div>')
    +'<div><p class="title">'+esc(k.title||'(untitled)')+' '+(k.guess.kind==='accessory'||k.guess.kind==='other'?'<span class="tag" style="color:var(--warn)">AI: not aircraft</span>':k.score>0||k.guess.kind==='aircraft'?'<span class="tag w">likely</span>':'<span class="tag">unsure</span>')+'</p>'
    +'<p class="meta"><span class="tag">'+esc(k.source_id)+'</span> '+(k.price_inr?'<span class="price">'+inr(k.price_inr)+'</span>':'no price')+' '+stock
    +(k.master?' · mapped to <b>'+esc(k.master)+'</b>':'')+' · <a href="'+esc(k.url_canonical)+'" target="_blank" rel="noopener">seller page ↗</a></p>'
    +mapUI+'</div><div class="acts">'+acts+'</div></div>';
}
function renderReview(){
  const rows=data.skus;
  // Pager total must respect the ACTIVE filters — the per-status count alone
  // overstates pages when the default stock=in (or a seller) filter is on.
  const total=(F.src&&data.srcCounts&&data.srcCounts[F.src]!=null)?data.srcCounts[F.src]
    :(F.status==='new'&&data.stockCounts&&data.stockCounts[F.stock]!=null)?data.stockCounts[F.stock]
    :(data.counts&&(data.counts[F.status]!=null?data.counts[F.status]:0))||rows.length;
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
    // Never lose an edit silently: flash saved/failed on the input itself.
    try{await api('master',body);i.style.outline='2px solid #3fb950';setTimeout(()=>{i.style.outline=''},900)}
    catch(e){i.style.outline='2px solid #f85149';alert('NOT saved: '+e.message)}
  });
}

// ------- Popularity (admin preview — not yet exposed to customers) -------
function renderPopularity(){
  const rows=data.masters||[];
  const start=((data.page||1)-1)*(data.pageSize||50);
  const pc=data.popCoverage||{};
  const coverage=pc.total
    ? '<p style="margin:6px 0"><b>'+pc.scored+'/'+pc.total+' in-stock models scored</b> · '+pc.unscored+' remaining · '+pc.nonzero+' non-zero · '+pc.zero+' checked with no match</p>'
    : '';
  const head='<div style="margin-bottom:14px"><p class="title" style="margin:0 0 2px">Popularity ranking <span class="tag w">admin preview</span></p>'
    +coverage
    +'<p class="meta" style="max-width:700px"><b>Score</b> = YouTube interest (views · breadth · recency) × availability. The poll spends quota only on published, approved, live in-stock models. It fills every NULL score first; numeric zero means checked with no matching videos. After full coverage, in-stock scores refresh weekly. Not exposed to customers yet.</p></div>';
  if(!rows.length){$('#view').innerHTML=head+'<p class="empty">No models yet.</p>';return}
  $('#view').innerHTML=head+'<table class="t"><thead><tr><th style="width:30px">#</th><th>Model</th><th style="width:118px">Score</th><th>Matched YouTube videos</th><th style="width:64px">Offers</th></tr></thead><tbody>'
    +rows.map((m,i)=>{
      const vids=(m.videos||[]).map((v)=>'<div class="meta" style="'+(v.excluded?'opacity:.4;text-decoration:line-through':'')+'">'+(v.pinned?'📌 ':'▸ ')
        +'<a href="https://youtu.be/'+esc(v.video_id)+'" target="_blank" rel="noopener">'+esc((v.title||'(untitled)').slice(0,64))+'</a> · '+fmtViews(v.views)+' views'+(v.channel?' · '+esc(v.channel):'')
        +' <button class="chip" data-vf="pinned" data-m="'+m.id+'" data-v="'+esc(v.video_id)+'" data-val="'+(v.pinned?0:1)+'" title="pin: survives re-searches">'+(v.pinned?'unpin':'pin')+'</button>'
        +'<button class="chip'+(v.excluded?' on':'')+'" data-vf="excluded" data-m="'+m.id+'" data-v="'+esc(v.video_id)+'" data-val="'+(v.excluded?0:1)+'" title="exclude: wrong video — drop from scoring">'+(v.excluded?'include':'✕ wrong')+'</button></div>').join('')
        ||'<span class="meta">'+(m.pop_updated_at?'no videos matched':'not polled yet')+'</span>';
      const score=m.pop_score!=null
        ? '<b style="font-size:1rem">'+(Math.round(m.pop_score*10)/10)+'</b><div class="meta">raw '+(Math.round((m.pop_raw||0)*10)/10)+' · '+ago(m.pop_updated_at)+'</div>'
          +'<div class="meta" title="owner boost: multiplies the score (0.5–2, 1 = neutral)">boost <input class="inline" type="number" step="0.05" min="0.5" max="2" value="'+(m.pop_boost??1)+'" data-boost="'+m.id+'" style="width:58px;padding:2px 4px"/></div>'
        : '<span class="tag">—</span>';
      return '<tr><td class="meta">'+(m.pop_score!=null?start+i+1:'')+'</td>'
        +'<td style="min-width:150px"><b>'+esc(m.brand||'')+'</b> '+esc(m.name||'')+'<div class="meta"><span class="tag">'+esc(m.category_id)+'/'+esc(m.slug)+'</span> · '+esc(m.status)+' · <a href="'+esc(m.path)+'" target="_blank">page ↗</a></div></td>'
        +'<td>'+score+'</td><td style="min-width:260px">'+vids+'</td>'
        +'<td class="meta">'+m.offers+' ('+m.live_offers+')</td></tr>'}).join('')
    +'</tbody></table>'+pager(data.total,data.pageSize,data.page||1);
  wirePager();
  document.querySelectorAll('button[data-vf]').forEach((b)=>b.onclick=async()=>{
    b.disabled=true;
    try{await api('video-flag',{masterId:+b.dataset.m,videoId:b.dataset.v,field:b.dataset.vf,value:+b.dataset.val});load()}
    catch(e){alert(e.message);b.disabled=false}
  });
  document.querySelectorAll('input[data-boost]').forEach((i)=>i.onchange=async()=>{
    try{await api('pop-boost',{masterId:+i.dataset.boost,boost:+i.value});load()}
    catch(e){alert('NOT saved: '+e.message);i.style.outline='2px solid #f85149'}
  });
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
const MFR_CSS='<style>.mf-pair{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px;background:var(--card)}'
  +'.mf-top{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.mf-top .meta{margin:0}'
  +'.mf-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.03em;text-transform:uppercase}'
  +'.mf-accept{background:#123d29;color:#3fb950}.mf-review{background:#3d3312;color:#d29922}.mf-conflict{background:#3d1212;color:#f85149}'
  +'.mf-picker-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0 7px}.mf-picker-head b{font-size:11px;letter-spacing:.05em;text-transform:uppercase}.mf-picker-head span{font-size:11px;color:var(--muted)}'
  +'.mf-candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}'
  +'.mf-choice{position:relative;display:block;min-width:0;padding:7px;text-align:left;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:9px;font-weight:400;overflow:hidden}'
  +'.mf-choice:hover{color:var(--fg);border-color:var(--accent-bright);transform:translateY(-1px)}.mf-choice:focus-visible{outline:2px solid var(--accent-bright);outline-offset:2px}'
  +'.mf-choice.selected{border:2px solid var(--accent-bright);padding:6px;background:rgba(31,155,217,.09);box-shadow:0 0 0 2px rgba(31,155,217,.13)}'
  +'.mf-choice-img-wrap{height:88px;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:7px}.mf-choice-img{width:100%;height:100%;object-fit:contain}.mf-choice-img-wrap .mf-noimg{font-size:10px;text-align:center;padding:5px}'
  +'.mf-choice-line{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:4px}.mf-choice-rank{font-size:10px;font-weight:700;color:var(--accent-bright);text-transform:uppercase}.mf-choice-score{font-size:10px;color:var(--muted)}'
  +'.mf-choice-title{font-size:12px;font-weight:650;line-height:1.25;height:2.5em;overflow:hidden;margin-bottom:4px}.mf-choice-sku{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}.mf-choice-data{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px}'
  +'.mf-mini{font-size:9px;line-height:1.3;padding:2px 5px;border:1px solid var(--border);border-radius:999px;color:var(--muted)}.mf-mini.match{color:var(--ok);border-color:rgba(63,185,80,.4)}.mf-mini.conflict{color:var(--bad);border-color:rgba(248,81,73,.45)}'
  +'.mf-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mf-side{font-size:13px;min-width:0;border:1px solid var(--border);border-radius:9px;padding:10px;background:rgba(14,17,23,.35)}'
  +'.mf-lbl{font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.06em}.mf-nm{font-weight:650;font-size:15px;margin:3px 0 8px}'
  +'.mf-photo-wrap{height:190px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:10px}'
  +'.mf-photo{width:100%;height:100%;object-fit:contain}.mf-noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#777;background:#f0f2f4;font-size:12px}'
  +'.mf-facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 10px;margin:8px 0;font-size:12px}.mf-facts dt{color:var(--muted)}.mf-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}'
  +'.mf-link{display:inline-block;margin-top:5px;color:var(--accent-bright);font-weight:600}.mf-missing{display:inline-block;margin-top:5px;color:var(--bad)}'
  +'.mf-desc{font-size:12px;color:var(--muted);margin-top:9px;line-height:1.45;max-height:88px;overflow:auto;border-top:1px dashed var(--border);padding-top:8px}'
  +'.mf-compare{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.mf-stat{border:1px solid var(--border);border-radius:7px;padding:8px 10px;font-size:11px}.mf-stat b{display:block;font-size:12px}.mf-stat.match{border-color:rgba(63,185,80,.45);background:rgba(63,185,80,.08)}.mf-stat.conflict{border-color:rgba(248,81,73,.5);background:rgba(248,81,73,.08)}.mf-stat.unknown{color:var(--muted)}'
  +'.mf-note{font-size:11px;color:var(--warn);margin-top:7px}.mf-foot{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}'
  +'.mf-health{margin:8px 0 14px;font-size:11px;color:var(--muted)}'
  +'@media(max-width:700px){.mf-candidates{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:76%;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 8px}.mf-choice{scroll-snap-align:start}.mf-cols,.mf-compare{grid-template-columns:1fr}.mf-photo-wrap{height:165px}}</style>';
function renderMfr(){
  var rows=(data.matches||[]),c=(data.counts||{}),cur=(F.mfrStatus||'pending');
  var span=function(sp){try{var v=JSON.parse(sp||'{}').spanMM;return v>0?v:null}catch(e){return null}};
  var tags=function(v){if(Array.isArray(v))return v;try{var j=JSON.parse(v||'[]');if(Array.isArray(j))return j}catch(e){}return String(v||'').split(',').map(function(x){return x.trim()}).filter(Boolean)};
  var configs=function(v){return String(v||'').split(',').map(function(x){return x.trim().toUpperCase()}).filter(Boolean)};
  var hasImage=function(v){try{var j=Array.isArray(v)?v:JSON.parse(v||'[]');return !!(j&&j[0])}catch(e){return false}};
  var safeUrl=function(v){try{var u=new URL(v);return (u.protocol==='http:'||u.protocol==='https:')?u.href:''}catch(e){return ''}};
  var val=function(v,fallback){return v==null||v===''?(fallback||'—'):v};
  var photo=function(src,alt,missing){return src?'<div class="mf-photo-wrap"><img class="mf-photo mf-load-img" src="'+esc(src)+'" alt="'+esc(alt)+'" loading="lazy" decoding="async"/><div class="mf-noimg" style="display:none">'+esc(missing)+'</div></div>':'<div class="mf-photo-wrap"><div class="mf-noimg">'+esc(missing)+'</div></div>'};
  var facts=function(items){return '<dl class="mf-facts">'+items.map(function(x){return '<dt>'+esc(x[0])+'</dt><dd>'+esc(val(x[1]))+'</dd>'}).join('')+'</dl>'};
  var stat=function(kind,title,detail){return '<div class="mf-stat '+kind+'"><b>'+esc(title)+'</b>'+esc(detail)+'</div>'};
  var tab=function(k,l){return '<button class="chip'+(cur===k?' on':'')+'" data-mfrs="'+k+'">'+l+' '+(c[k]||0)+'</button>'};
  var card=function(r){
    var os=span(r.specs),cs=(r.candidates||[]),saved=+(F.mfrChoices[r.master_model_id]||0);
    var active=cs.find(function(x){return +x.mfr_product_id===saved})
      ||cs.find(function(x){return +x.mfr_product_id===+r.mfr_product_id})||cs[0]||null;
    if(active)F.mfrChoices[r.master_model_id]=+active.mfr_product_id;
    var persisted=cur==='accepted'&&active&&+active.mfr_product_id===+r.mfr_product_id;
    var ms=active&&active.span_mm,delta=os&&ms?Math.round(Math.abs(os-ms)/Math.max(os,ms)*1000)/10:null;
    var spanKind=delta==null?'unknown':(delta<=3?'match':'conflict');
    var spanTitle=spanKind==='match'?'Wingspan matches':spanKind==='conflict'?'Wingspan conflict':'Wingspan unknown';
    var spanDetail='Our '+val(os,'?')+' mm / manufacturer '+val(ms,'?')+' mm'+(delta==null?'':' / '+delta+'% delta');
    var ca=active&&active.config_agree,configKind=ca===1?'match':ca===0?'conflict':'unknown';
    var configTitle=configKind==='match'?'Kit type matches':configKind==='conflict'?'Kit type conflict':'Kit type unknown';
    var ourConfigs=configs(r.model_configs),theirConfigs=active&&active.config_types||[];
    var configDetail='Our '+(ourConfigs.join(', ')||'?')+' / manufacturer '+(theirConfigs.map(function(x){return String(x).toUpperCase()}).join(', ')||'?');
    var bcls=active&&active.tier==='accept'?'mf-accept':((active&&active.span_agree===0)||ca===0?'mf-conflict':'mf-review');
    var choices=cs.map(function(x){
      var selected=active&&+x.mfr_product_id===+active.mfr_product_id;
      var rank=x.rank===0?'saved':'#'+x.rank;
      var ct=(x.config_types||[]).map(function(t){return String(t).toUpperCase()}).join('+')||'?';
      var thumb=hasImage(x.image_urls)?'<img class="mf-choice-img mf-load-img" src="/img/mfr/'+x.mfr_product_id+'" alt="" loading="lazy" decoding="async"/><div class="mf-noimg" style="display:none">No photo</div>':'<div class="mf-noimg">No photo</div>';
      var spanSignal=x.span_agree===1?'<span class="mf-mini match">Wingspan match</span>':x.span_agree===0?'<span class="mf-mini conflict">Wingspan conflict</span>':'<span class="mf-mini">Span unknown</span>';
      var configSignal=x.config_agree===1?'<span class="mf-mini match">Kit match</span>':x.config_agree===0?'<span class="mf-mini conflict">Kit conflict</span>':'<span class="mf-mini">Kit unknown</span>';
      var nameSignal=x.name_score==null?'':'<span class="mf-mini">Name '+Math.round(x.name_score*100)+'%</span>';
      return '<button type="button" class="mf-choice'+(selected?' selected':'')+'" data-mfr-candidate data-master="'+r.master_model_id+'" data-product="'+x.mfr_product_id+'" aria-pressed="'+(selected?'true':'false')+'" aria-label="Select '+esc(rank+' '+x.title)+'">'
        +'<div class="mf-choice-img-wrap">'+thumb+'</div><div class="mf-choice-line"><span class="mf-choice-rank">'+esc(rank)+(selected?(persisted?' · mapped':' · selected'):'')+'</span><span class="mf-choice-score">score '+Number(x.score||0).toFixed(2)+'</span></div>'
        +'<div class="mf-choice-title">'+esc(x.title)+'</div><div class="mf-choice-sku">SKU '+esc(val(x.ext_id))+'</div><div class="mf-choice-data"><span class="mf-mini">'+esc(ct)+'</span><span class="mf-mini">'+esc((x.span_mm||'?')+' mm')+'</span>'+nameSignal+'</div>'
        +'<div class="mf-choice-data">'+spanSignal+configSignal+'</div></button>';
    }).join('');
    var picker=choices?'<div class="mf-picker-head"><b>Choose manufacturer SKU</b><span>'+cs.length+' candidate'+(cs.length===1?'':'s')+' · '+(persisted?'current mapping':'selection not mapped yet')+'</span></div><div class="mf-candidates" role="group" aria-label="Manufacturer SKU candidates">'+choices+'</div>':'<div class="mf-note">No credible SKU candidates harvested yet.</div>';
    var controls='<div class="mf-foot"><button class="ok" data-mfr="accept" data-id="'+r.master_model_id+'"'+(active?'':' disabled')+'>'+((cur==='accepted')?'Save mapping':'Map & accept')+'</button>'
      +(cur!=='rejected'?'<button class="no" data-mfr="reject" data-id="'+r.master_model_id+'">Reject</button>':'')
      +(cur!=='pending'?'<button data-mfr="reopen" data-id="'+r.master_model_id+'">Reopen</button>':'')+'</div>';
    var official=active&&safeUrl(active.url),roles=tags(r.role_tags);
    var modelLink='<a class="mf-link" href="'+esc(r.path_prefix)+'/'+esc(r.slug)+'/" target="_blank" rel="noopener noreferrer">Open model page ↗</a>';
    var officialLink=official?'<a class="mf-link" href="'+esc(official)+'" target="_blank" rel="noopener noreferrer">Open official product ↗</a>':'<span class="mf-missing">Official product link unavailable</span>';
    var topTier=active&&active.tier||r.tier||'review';
    var topMeta=active?('Candidate '+(active.rank===0?'saved':('#'+active.rank))+' · ranking score '+Number(active.score||0).toFixed(2)+' · '+val(active.mfr_brand,r.mfr_brand||'manufacturer')):'No candidate selected';
    var rightPhoto=active&&hasImage(active.image_urls)?'/img/mfr/'+active.mfr_product_id:'';
    return '<div class="mf-pair" data-mfr-pair="'+r.master_model_id+'"><div class="mf-top"><span class="mf-badge '+bcls+'">'+esc(topTier)+'</span><span class="meta">'+esc(topMeta)+'</span></div>'
      +picker
      +'<div class="mf-cols"><section class="mf-side"><div class="mf-lbl">OUR MODEL</div><div class="mf-nm">'+esc(r.brand)+' '+esc(r.name)+'</div>'
      +photo(r.model_image?'/img/master/'+r.master_model_id:'',r.brand+' '+r.name,'No model photo')
      +facts([['Wingspan',os?os+' mm':'—'],['Offer kit type',ourConfigs.join(', ')||'—'],['Power',r.power],['Roles',roles.join(', ')||'—']])+modelLink+'</section>'
      +'<section class="mf-side"><div class="mf-lbl">MANUFACTURER PRODUCT</div><div class="mf-nm">'+esc(active&&active.title||'No candidate')+'</div>'
      +photo(rightPhoto,active&&active.title||'Manufacturer product','No manufacturer photo')
      +facts([['Wingspan',ms?ms+' mm':'—'],['Kit / config',theirConfigs.map(function(x){return String(x).toUpperCase()}).join(', ')||'—'],['Manufacturer',active&&active.mfr_brand||r.mfr_brand],['Manufacturer SKU',active&&active.ext_id],['Source',active&&active.strategy||r.strategy]])+officialLink
      +(active&&active.body_preview?'<div class="mf-desc">'+esc(active.body_preview.slice(0,500))+'</div>':'')+'</section></div>'
      +'<div class="mf-compare">'+stat(spanKind,spanTitle,spanDetail)+stat(configKind,configTitle,configDetail)+'</div>'
      +((active&&active.reason)||r.note?'<div class="mf-note">'+esc(active&&active.reason||r.note)+'</div>':'')+controls+'</div>';
  };
  var hs=(data.harvest||[]),bad=hs.filter(function(x){return x.last_harvest_status==='error'}).length;
  var health='<div class="mf-health">'+hs.length+' manufacturers on weekly queue-backed harvesting (Sunday 03:07 UTC)'+(bad?' · '+bad+' need attention':' · all last runs healthy')+'</div>';
  $('#view').innerHTML=MFR_CSS+'<div class="bar" style="border:none">'+tab('pending','Pending')+' '+tab('accepted','Accepted')+' '+tab('rejected','Rejected')+'<span class="meta" style="align-self:center;margin-left:8px">choose the exact official SKU, then map it; accepted content remains private.</span></div>'
    +'<div class="bar" style="border:none"><button id="mfr-rebuild-all" class="go">Match newly added models</button><button id="mfr-harvest-now">Harvest now</button><span class="meta">Matching is fast and uses stored manufacturer products. Harvesting queues a fresh crawl of all official sites.</span></div>'
    +health+(rows.length?rows.map(card).join(''):'<p class="empty">No '+cur+' matches.</p>');
  document.querySelectorAll('button[data-mfrs]').forEach(function(b){b.onclick=function(){F.mfrStatus=b.dataset.mfrs;load()}});
  var wirePair=function(root){
    root.querySelectorAll('[data-mfr-candidate]').forEach(function(b){b.onclick=function(){
      var master=+b.dataset.master,product=+b.dataset.product,row=rows.find(function(x){return +x.master_model_id===master});
      F.mfrChoices[master]=product;
      if(!row)return;
      root.outerHTML=card(row);
      var next=document.querySelector('[data-mfr-pair="'+master+'"]');
      if(next){wirePair(next);var selected=next.querySelector('[data-mfr-candidate][data-product="'+product+'"]');if(selected)selected.focus({preventScroll:true})}
    }});
    root.querySelectorAll('.mf-load-img').forEach(function(img){img.onerror=function(){img.style.display='none';if(img.nextElementSibling)img.nextElementSibling.style.display='flex'}});
    root.querySelectorAll('button[data-mfr]').forEach(function(b){b.onclick=async function(){b.disabled=true;try{var master=+b.dataset.id,product=+(F.mfrChoices[master]||0);await api('mfr-decide',{masterId:master,decision:b.dataset.mfr,mfrProductId:b.dataset.mfr==='accept'?product:null});delete F.mfrChoices[master];load()}catch(e){alert(e.message);b.disabled=false}}});
  };
  document.querySelectorAll('[data-mfr-pair]').forEach(wirePair);
  $('#mfr-rebuild-all').onclick=async function(){var b=this;b.disabled=true;b.textContent='matching…';try{var d=await api('mfr-rebuild-all',{});alert('Matched '+d.masters+' models against '+d.candidates+' ranked candidates.');load()}catch(e){alert(e.message);b.disabled=false;b.textContent='Match newly added models'}};
  $('#mfr-harvest-now').onclick=async function(){if(!confirm('Queue a fresh crawl of all manufacturer sites now?'))return;var b=this;b.disabled=true;b.textContent='queueing…';try{var d=await api('mfr-harvest',{});alert(d.paused?'Manufacturer harvesting is paused.':'Queued '+d.queued+' manufacturer harvests.');load()}catch(e){alert(e.message);b.disabled=false;b.textContent='Harvest now'}};
}

// ------- Aircraft data (published + accepted manufacturer mappings only) -------
const MFR_PROFILE_CSS='<style>'
  +'.mp-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px;flex-wrap:wrap}.mp-intro .title{font-size:17px}.mp-intro .meta{max-width:700px;margin:2px 0 0}'
  +'.mp-filterbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.mp-filterbar .meta{margin:0 0 0 5px}'
  +'.mp-notice{margin:0 0 12px;padding:8px 10px;border:1px solid rgba(63,185,80,.4);border-radius:8px;background:rgba(63,185,80,.08);color:var(--ok);font-size:11px}.mp-notice.error{border-color:rgba(248,81,73,.4);background:rgba(248,81,73,.08);color:var(--bad)}'
  +'.mp-card{border:1px solid var(--border);border-radius:13px;background:var(--card);margin-bottom:16px;overflow:visible}.mp-card:focus{outline:2px solid rgba(62,181,232,.55);outline-offset:2px}.mp-card.dirty{border-color:rgba(210,153,34,.72);box-shadow:0 0 0 2px rgba(210,153,34,.08)}'
  +'.mp-card-head{display:flex;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap}.mp-card-head .mp-name{font-size:15px;font-weight:700;margin:0}.mp-card-head .meta{margin:0}.mp-head-actions{margin-left:auto;display:flex;align-items:center;gap:8px}'
  +'.mp-completion{font-size:11px;border:1px solid rgba(210,153,34,.45);color:var(--warn);border-radius:999px;padding:3px 8px;white-space:nowrap}.mp-completion.complete{border-color:rgba(63,185,80,.45);color:var(--ok)}'
  +'.mp-summary{display:grid;grid-template-columns:minmax(180px,.72fr) minmax(0,1.55fr);gap:12px;padding:12px 14px}.mp-panel{min-width:0;border:1px solid var(--border);border-radius:9px;padding:10px;background:rgba(14,17,23,.34)}'
  +'.mp-label{font-size:10px;font-weight:750;letter-spacing:.06em;color:var(--muted);text-transform:uppercase}.mp-product-title{font-size:14px;font-weight:680;margin:3px 0 8px;line-height:1.3}.mp-model-photo{height:175px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}.mp-model-photo img{width:100%;height:100%;object-fit:contain}.mp-photo-empty{height:100%;width:100%;display:flex;align-items:center;justify-content:center;background:#f0f2f4;color:#777;font-size:11px;text-align:center;padding:8px}'
  +'.mp-links{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}.mp-link{font-size:12px;color:var(--accent-bright);font-weight:650}.mp-link-missing{font-size:11px;color:var(--bad);margin-top:8px;display:inline-block}'
  +'.mp-gallery-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.mp-gallery{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(128px,31%);gap:7px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 1px 8px}.mp-gallery a{height:138px;border-radius:7px;background:#fff;display:flex;overflow:hidden;scroll-snap-align:start;border:1px solid transparent}.mp-gallery a:hover{border-color:var(--accent-bright)}.mp-gallery img{width:100%;height:100%;object-fit:contain}'
  +'.mp-shared{margin:0 14px 12px;padding:8px 10px;border:1px solid rgba(210,153,34,.4);border-radius:8px;background:rgba(210,153,34,.08);color:var(--warn);font-size:11px}'
  +'.mp-form{border-top:1px solid var(--border);padding:13px 14px 14px}.mp-section{margin:0 0 16px}.mp-section-title{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent-bright);font-weight:750;margin:0 0 7px}.mp-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}'
  +'.mp-field{min-width:0;border:1px solid var(--border);border-radius:8px;padding:8px;background:rgba(14,17,23,.33)}.mp-field.wide{grid-column:1/-1}.mp-field-top{display:flex;align-items:center;gap:6px;justify-content:space-between;flex-wrap:wrap;margin-bottom:5px}.mp-field-label{font-size:11px;font-weight:650;color:var(--fg)}'
  +'.mp-source{max-width:100%;font-size:9px;line-height:1.2;border:1px solid var(--border);border-radius:999px;padding:2px 5px;color:var(--muted);white-space:normal;overflow-wrap:anywhere}.mp-source.harvested{color:var(--accent-bright);border-color:rgba(62,181,232,.4)}.mp-source.manual{color:var(--ok);border-color:rgba(63,185,80,.4)}.mp-source.edited{color:var(--warn);border-color:rgba(210,153,34,.5)}.mp-source.unknown{color:var(--muted)}'
  +'.mp-field select,.mp-field input[type=number],.mp-field textarea{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:7px 8px;font:inherit;font-size:12px}.mp-field textarea{min-height:68px;resize:vertical}.mp-field select:focus,.mp-field input:focus,.mp-field textarea:focus{outline:2px solid rgba(62,181,232,.55);outline-offset:1px}'
  +'.mp-unit{font-size:10px;color:var(--muted);margin-top:3px}.mp-options{display:flex;gap:5px;flex-wrap:wrap}.mp-option{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:999px;padding:3px 7px;font-size:10px;color:var(--muted);cursor:pointer}.mp-option:has(input:checked){border-color:rgba(62,181,232,.6);color:var(--fg);background:rgba(31,155,217,.09)}.mp-option input{accent-color:var(--accent-bright);margin:0}'
  +'.mp-evidence{font-size:10px;color:var(--muted);line-height:1.35;margin-top:6px;padding-top:5px;border-top:1px dashed var(--border)}.mp-evidence b{color:var(--fg);font-weight:620}.mp-unknown-note{font-size:10px;color:var(--muted);margin-top:5px}'
  +'.mp-savebar{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;justify-content:flex-end;gap:9px;margin:4px -14px -14px;padding:10px 14px;background:rgba(22,27,34,.96);border-top:1px solid var(--border)}.mp-save-state{font-size:11px;color:var(--muted)}.mp-save-state.unsaved{color:var(--warn)}.mp-save-state.error{color:var(--bad)}.mp-save-state.saved{color:var(--ok)}'
  +'@media(max-width:760px){.mp-summary{grid-template-columns:1fr}.mp-fields{grid-template-columns:1fr}.mp-field.wide{grid-column:auto}.mp-gallery{grid-auto-columns:72%}.mp-card-head .mp-head-actions{width:100%;margin-left:0;justify-content:space-between}}</style>';

const MFR_PROFILE_FIELDS=[
  {section:'Controls',key:'controlLayout',label:'Control layout',kind:'select',options:[['conventional','Conventional'],['v_tail','V-tail'],['elevon','Elevon / flying wing'],['rudder_elevator','Rudder + elevator'],['differential_thrust','Differential thrust'],['mixed_vtol','Mixed / VTOL'],['other','Other']]},
  {section:'Controls',key:'channels',label:'Minimum channels',kind:'number',min:1,max:32,step:1,unit:'channels'},
  {section:'Controls',key:'controlSurfaces',label:'Control surfaces',kind:'multi',options:[['aileron','Ailerons'],['elevator','Elevator'],['rudder','Rudder'],['elevon','Elevons'],['flaps','Flaps'],['spoilers','Spoilers'],['differential_thrust','Differential thrust']]},
  {section:'Propulsion',key:'motorCount',label:'Motor / engine count',kind:'number',min:0,max:16,step:1},
  {section:'Propulsion',key:'propulsionType',label:'Propulsion type',kind:'select',options:[['propeller','Propeller'],['edf','EDF'],['turbine','Turbine'],['unpowered','Unpowered'],['mixed','Mixed'],['other','Other']]},
  {section:'Propulsion',key:'propulsionPosition',label:'Propulsion position',kind:'select',options:[['tractor','Tractor'],['pusher','Pusher'],['mixed','Mixed'],['not_applicable','Not applicable'],['other','Other']]},
  {section:'Flying difficulty',key:'difficulty',label:'Pilot level',kind:'select',options:[['beginner','Beginner'],['intermediate','Intermediate'],['intermediate_advanced','Intermediate to advanced'],['advanced','Advanced']]},
  {section:'Flying difficulty',key:'stabilization',label:'Stabilization',kind:'select',options:[['included','Included'],['optional','Optional'],['none','None']]},
  {section:'Flying difficulty',key:'difficultyNotes',label:'Why it is easy or difficult',kind:'text',wide:true},
  {section:'Weight',key:'recommendedAuwMinG',label:'Good AUW minimum',kind:'number',min:1,max:200000,step:1,unit:'grams'},
  {section:'Weight',key:'recommendedAuwMaxG',label:'Good AUW maximum',kind:'number',min:1,max:200000,step:1,unit:'grams'},
  {section:'Weight',key:'maxAuwG',label:'Maximum AUW',kind:'number',min:1,max:250000,step:1,unit:'grams'},
  {section:'Weight',key:'payloadG',label:'Payload capacity',kind:'number',min:0,max:200000,step:1,unit:'grams'},
  {section:'FPV and flight controller',key:'fpvReadiness',label:'FPV readiness',kind:'select',options:[['purpose_built','Purpose-built space'],['easy_fit','Easy to fit'],['modification_needed','Modification needed'],['not_recommended','Not recommended']]},
  {section:'FPV and flight controller',key:'fcReadiness',label:'Flight-controller readiness',kind:'select',options:[['purpose_built','Purpose-built space'],['easy_fit','Easy to fit'],['modification_needed','Modification needed'],['not_recommended','Not recommended']]},
  {section:'FPV and flight controller',key:'fpvFcNotes',label:'Space, access, cooling and CG notes',kind:'text',wide:true},
  {section:'Slow flight',key:'lowSpeedBehavior',label:'Low-speed behavior',kind:'select',options:[['excellent','Excellent'],['good','Good'],['average','Average'],['demanding','Demanding']]},
  {section:'Slow flight',key:'stallBehavior',label:'Stall behavior',kind:'select',options:[['gentle','Gentle'],['moderate','Moderate'],['sharp','Sharp']]},
  {section:'Slow flight',key:'lowSpeedNotes',label:'Slow-flight and stall notes',kind:'text',wide:true},
  {section:'Launch and landing',key:'launchMethods',label:'Launch methods',kind:'multi',options:[['hand_launch','Hand launch'],['ground_roll','Ground roll'],['bungee','Bungee'],['vtol','VTOL'],['water','Water']]},
  {section:'Launch and landing',key:'landingMethods',label:'Landing methods',kind:'multi',options:[['wheels','Wheels'],['belly','Belly'],['skid','Skid'],['vtol','VTOL'],['water','Water'],['hand_catch','Hand catch']]},
  {section:'Launch and landing',key:'fieldRequirement',label:'Field requirement',kind:'select',options:[['rough_grass_ok','Rough grass is okay'],['mown_grass_ok','Mown grass is okay'],['smooth_runway_recommended','Smooth runway recommended'],['paved_runway_required','Paved runway required'],['no_runway_needed','No runway needed'],['water_only','Water only']]},
  {section:'Launch and landing',key:'fieldNotes',label:'Takeoff and landing notes',kind:'text',wide:true}
];
const MFR_PROFILE_ESSENTIALS=[
  {label:'controls',keys:['controlLayout','channels','controlSurfaces'],all:true},
  {label:'propulsion',keys:['motorCount','propulsionType','propulsionPosition'],all:true},
  {label:'difficulty',keys:['difficulty']},
  {label:'good AUW',keys:['recommendedAuwMinG','recommendedAuwMaxG']},
  {label:'maximum AUW',keys:['maxAuwG']},
  {label:'FPV',keys:['fpvReadiness']},
  {label:'flight controller',keys:['fcReadiness']},
  {label:'low speed',keys:['lowSpeedBehavior']},
  {label:'landing field',keys:['landingMethods','fieldRequirement'],all:true}
];

function renderMfrProfiles(){
  var rows=Array.isArray(data)?data:(data.profiles||data.rows||data.models||[]);
  var asObj=function(v){if(v&&typeof v==='object')return v;try{var j=JSON.parse(v||'{}');return j&&typeof j==='object'?j:{}}catch(e){return {}}};
  var safeUrl=function(v){try{var u=new URL(v);return (u.protocol==='http:'||u.protocol==='https:')?u.href:''}catch(e){return ''}};
  var own=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)};
  var suggestionValue=function(v){return v&&typeof v==='object'&&own(v,'value')?v.value:v};
  var sourceKind=function(v){return v&&typeof v==='object'?(v.kind||v.source||v.type||''):String(v||'')};
  var sourceConfidence=function(v){return v&&typeof v==='object'?(v.confidence||''):''};
  var meaningful=function(v){return v!==null&&v!==undefined&&v!==''&&v!=='unknown'&&(!Array.isArray(v)||v.length>0)};
  var baseValue=function(r,k){
    var vals=asObj(r.values);
    if(own(vals,k))return vals[k];
    var sug=asObj(r.suggestions);
    return own(sug,k)?suggestionValue(sug[k]):null;
  };
  var shownValue=function(r,k){
    var draft=F.mfrProfileDrafts[r.master_model_id],over=draft&&draft.overrides||{};
    return own(over,k)?over[k]:baseValue(r,k);
  };
  var completion=function(r){
    var done=MFR_PROFILE_ESSENTIALS.filter(function(g){
      var states=g.keys.map(function(k){return meaningful(shownValue(r,k))});
      return g.all?states.every(Boolean):states.some(Boolean);
    });
    return {done:done.length,total:MFR_PROFILE_ESSENTIALS.length,complete:done.length===MFR_PROFILE_ESSENTIALS.length};
  };
  var sourceInfo=function(r,k){
    var draft=F.mfrProfileDrafts[r.master_model_id],over=draft&&draft.overrides||{};
    if(own(over,k))return {label:over[k]===null?'Cleared (unsaved)':'Edited',cls:'edited'};
    var stored=asObj(r.overrides);
    if(own(stored,k))return {label:stored[k]===null?'Cleared manually':'Manual',cls:'manual'};
    var src=asObj(r.sources)[k],kind=sourceKind(src).toLowerCase(),conf=sourceConfidence(src);
    if(/manual|human|admin/.test(kind))return {label:'Manual',cls:'manual'};
    if(/manufacturer|harvest|extract|text|image|visual|inference|derived/.test(kind)){
      var label=/image|visual/.test(kind)?'Manufacturer photo':'Manufacturer text';
      return {label:label+(conf?' · '+String(conf).replace(/_/g,' '):''),cls:'harvested'};
    }
    if(meaningful(suggestionValue(asObj(r.suggestions)[k])))return {label:'Harvested suggestion',cls:'harvested'};
    return {label:'Unknown',cls:'unknown'};
  };
  var evidenceText=function(r,k){
    var ev=asObj(r.evidence)[k],sug=asObj(r.suggestions)[k];
    if(ev&&typeof ev==='object')ev=ev.text||ev.excerpt||ev.evidence||'';
    if(!ev&&sug&&typeof sug==='object')ev=sug.evidence||sug.excerpt||'';
    if(Array.isArray(ev))ev=ev.join(' · ');
    return String(ev||'').slice(0,260);
  };
  var optionList=function(f,v){
    return '<option value="">Unknown / needs input</option>'+f.options.map(function(o){return '<option value="'+esc(o[0])+'"'+(String(v??'')===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'}).join('');
  };
  var displayValue=function(f,v){
    if(!meaningful(v))return '';
    if(f.kind==='multi')return (Array.isArray(v)?v:[]).map(function(x){var o=f.options.find(function(y){return y[0]===x});return o?o[1]:x}).join(', ');
    if(f.options){var o=f.options.find(function(x){return String(x[0])===String(v)});if(o)return o[1]}
    return String(v)+(f.unit?' '+f.unit:'');
  };
  var fieldHtml=function(r,f){
    var v=shownValue(r,f.key),src=sourceInfo(r,f.key),ev=evidenceText(r,f.key),ctrl='';
    var draft=F.mfrProfileDrafts[r.master_model_id],draftOver=draft&&draft.overrides||{},storedOver=asObj(r.overrides);
    var isManual=own(draftOver,f.key)||own(storedOver,f.key),suggested=suggestionValue(asObj(r.suggestions)[f.key]),fid='mp-'+r.master_model_id+'-'+f.key;
    if(f.kind==='select')ctrl='<select id="'+fid+'" data-mp-field="'+f.key+'">'+optionList(f,v)+'</select>';
    else if(f.kind==='number')ctrl='<input id="'+fid+'" type="number" data-mp-field="'+f.key+'" min="'+f.min+'" max="'+f.max+'" step="'+f.step+'" value="'+(v==null?'':esc(v))+'"/>'+(f.unit?'<div class="mp-unit">'+esc(f.unit)+'</div>':'');
    else if(f.kind==='text')ctrl='<textarea id="'+fid+'" data-mp-field="'+f.key+'" maxlength="1200" placeholder="Unknown / add notes">'+esc(v==null?'':v)+'</textarea>';
    else {
      var selected=Array.isArray(v)?v:[];
      ctrl='<div class="mp-options" data-mp-multi="'+f.key+'" role="group" aria-labelledby="'+fid+'-label">'+f.options.map(function(o){
        return '<label class="mp-option"><input type="checkbox" data-mp-field="'+f.key+'" value="'+esc(o[0])+'"'+(selected.includes(o[0])?' checked':'')+'/> '+esc(o[1])+'</label>';
      }).join('')+'</div>';
    }
    var label=f.kind==='multi'?'<span class="mp-field-label" id="'+fid+'-label">'+esc(f.label)+'</span>':'<label class="mp-field-label" for="'+fid+'">'+esc(f.label)+'</label>';
    return '<div class="mp-field'+(f.wide?' wide':'')+'" data-mp-field-wrap="'+f.key+'"><div class="mp-field-top">'+label+'<span class="mp-source '+src.cls+'" data-mp-source="'+f.key+'">'+esc(src.label)+'</span></div>'
      +ctrl
      +(meaningful(suggested)?'<div class="mp-evidence" data-mp-suggestion="'+f.key+'"'+(isManual?'':' hidden')+'><b>Manufacturer suggested:</b> '+esc(displayValue(f,suggested))+'</div>':'')
      +(ev?'<div class="mp-evidence"><b>Manufacturer evidence:</b> '+esc(ev)+'</div>':'<div class="mp-unknown-note">No explicit manufacturer evidence yet.</div>')+'</div>';
  };
  var safeLocal=function(prefix,slug){
    var p=String(prefix||'').replace(/\\/+$/,'')+'/'+String(slug||'').replace(/^\\/+|\\/+$/g,'')+'/';
    return p.startsWith('/')?p:'';
  };
  var safeImage=function(v){
    if(!v)return '';
    var s=String(v);
    if(/^\\/img\\/mfr\\/\\d+(?:\\/\\d+)?$/.test(s))return s;
    try{var u=new URL(s,location.origin);return u.origin===location.origin&&/^\\/img\\/mfr\\/\\d+(?:\\/\\d+)?$/.test(u.pathname)?u.pathname:''}catch(e){return ''}
  };
  var galleryUrls=function(r){
    var raw=r.images;
    if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch(e){raw=[]}}
    if(!Array.isArray(raw))raw=[];
    var count=Math.max(raw.length,Math.max(0,Math.min(20,Number(r.image_count)||0))),out=[];
    for(var i=0;i<count;i++){
      var item=raw[i],protectedUrl=item&&typeof item==='object'?item.url:item;
      out.push(safeImage(protectedUrl)||('/img/mfr/'+r.mfr_product_id+'/'+i));
    }
    return out;
  };
  var sections=[...new Set(MFR_PROFILE_FIELDS.map(function(f){return f.section}))];
  var card=function(r){
    var id=+r.master_model_id,comp=completion(r),draft=F.mfrProfileDrafts[id],dirty=!!(draft&&Object.keys(draft.overrides||{}).length);
    var saved=F.mfrProfileSaved[id],official=safeUrl(r.mfr_url),modelHref=safeLocal(r.path_prefix,r.slug),imgs=galleryUrls(r);
    var imageHtml=imgs.length?'<div class="mp-gallery" role="region" aria-label="Manufacturer photo gallery">'+imgs.map(function(src,i){return '<a href="'+esc(src)+'" target="_blank" rel="noopener noreferrer" title="Open photo '+(i+1)+'"><img class="mp-gallery-img" src="'+esc(src)+'" alt="'+esc((r.mfr_title||r.name||'Manufacturer model')+' photo '+(i+1))+'" loading="lazy" decoding="async"/></a>'}).join('')+'</div>':'<div class="mp-photo-empty" style="height:138px">No manufacturer photos harvested.</div>';
    var groups=sections.map(function(s){return '<section class="mp-section"><h3 class="mp-section-title">'+esc(s)+'</h3><div class="mp-fields">'+MFR_PROFILE_FIELDS.filter(function(f){return f.section===s}).map(function(f){return fieldHtml(r,f)}).join('')+'</div></section>'}).join('');
    var share=Number(r.shared_mapping_count)||0;
    var saveState=dirty?'Unsaved changes':saved?'Saved just now':r.updated_at?('Saved '+ago(r.updated_at)):'Not edited yet';
    return '<article class="mp-card'+(dirty?' dirty':'')+'" data-mp-card="'+id+'" aria-labelledby="mp-card-title-'+id+'"><div class="mp-card-head"><h2 class="mp-name" id="mp-card-title-'+id+'">'+esc((r.brand?r.brand+' ':'')+(r.name||''))+'</h2><span class="meta">'+esc(r.mfr_brand||'Manufacturer')+' · mapped product '+esc(r.mfr_product_id)+'</span><span class="mp-head-actions"><span class="mp-completion'+(comp.complete?' complete':'')+'" data-mp-completion>'+comp.done+'/'+comp.total+' essentials</span></span></div>'
      +'<div class="mp-summary"><section class="mp-panel"><div class="mp-label">OUR PUBLISHED MODEL</div><div class="mp-product-title">'+esc((r.brand?r.brand+' ':'')+(r.name||''))+'</div>'
      +'<div class="mp-model-photo">'+(r.model_image?'<img class="mp-model-img" src="/img/master/'+id+'" alt="'+esc((r.brand?r.brand+' ':'')+(r.name||''))+'" loading="lazy" decoding="async"/><div class="mp-photo-empty" style="display:none">No model photo</div>':'<div class="mp-photo-empty">No model photo</div>')+'</div>'
      +(modelHref?'<div class="mp-links"><a class="mp-link" href="'+esc(modelHref)+'" target="_blank" rel="noopener noreferrer">Open published model ↗</a></div>':'')+'</section>'
      +'<section class="mp-panel"><div class="mp-gallery-head"><div><div class="mp-label">MATCHED MANUFACTURER PRODUCT</div><div class="mp-product-title">'+esc(r.mfr_title||'Untitled manufacturer product')+'</div></div><span class="meta">'+imgs.length+' photo'+(imgs.length===1?'':'s')+'</span></div>'
      +imageHtml+(official?'<div class="mp-links"><a class="mp-link" href="'+esc(official)+'" target="_blank" rel="noopener noreferrer">Open official product ↗</a></div>':'<span class="mp-link-missing">Official product link unavailable</span>')+'</section></div>'
      +(share>1?'<div class="mp-shared"><b>Shared mapping:</b> this manufacturer product is mapped to '+share+' catalog models. These edits apply only to '+esc(r.name||'this model')+'.</div>':'')
      +(r.source_changed?'<div class="mp-shared"><b>Mapping changed:</b> earlier manual values were set aside. Review this manufacturer product before saving new values.</div>':'')
      +'<form class="mp-form" data-mp-form="'+id+'">'+groups+'<div class="mp-savebar"><span class="mp-save-state'+(dirty?' unsaved':saved?' saved':'')+'" data-mp-save-state aria-live="polite">'+esc(saveState)+'</span><button type="submit" class="go" data-mp-save'+(dirty?'':' disabled')+'>Save model data</button></div></form></article>';
  };
  var allCount=rows.length,completeCount=rows.filter(function(r){return completion(r).complete}).length,needsCount=allCount-completeCount,cur=F.mfrDataFilter||'all';
  var filtered=rows.filter(function(r){var c=completion(r).complete;return cur==='complete'?c:cur==='needs'?!c:true});
  var filter=function(k,l,n){return '<button class="chip'+(cur===k?' on':'')+'" data-mp-filter="'+k+'" aria-pressed="'+(cur===k?'true':'false')+'">'+l+' <span>'+n+'</span></button>'};
  $('#view').innerHTML=MFR_PROFILE_CSS+'<div class="mp-intro"><div><p class="title">Aircraft data</p><p class="meta">Only published models with an accepted manufacturer mapping appear here. Harvested facts remain visibly sourced; fill the unknowns and save one model at a time.</p></div><span class="tag w">admin only</span></div>'
    +(F.mfrProfileNotice?'<p class="mp-notice'+(F.mfrProfileNotice.kind==='error'?' error':'')+'" role="status" aria-live="polite">'+esc(F.mfrProfileNotice.text||F.mfrProfileNotice)+'</p>':'')
    +'<div class="mp-filterbar">'+filter('all','All',allCount)+filter('needs','Needs input',needsCount)+filter('complete','Complete',completeCount)+'<span class="meta">'+filtered.length+' shown</span></div>'
    +(filtered.length?filtered.map(card).join(''):'<p class="empty">No models in this view.</p>');

  var fieldByKey=function(k){return MFR_PROFILE_FIELDS.find(function(f){return f.key===k})};
  var readControl=function(root,f){
    if(f.kind==='multi'){
      var checked=[...root.querySelectorAll('input[data-mp-field="'+f.key+'"]:checked')].map(function(x){return x.value});
      return checked.length?checked:null;
    }
    var el=root.querySelector('[data-mp-field="'+f.key+'"]'),raw=el?el.value:'';
    if(raw==='')return null;
    return f.kind==='number'?Number(raw):raw;
  };
  var equal=function(a,b){return JSON.stringify(a)===JSON.stringify(b)};
  var updateDirtyUi=function(root,r,k){
    var id=+r.master_model_id,draft=F.mfrProfileDrafts[id],dirty=!!(draft&&Object.keys(draft.overrides||{}).length),comp=completion(r);
    root.classList.toggle('dirty',dirty);
    var save=root.querySelector('[data-mp-save]');if(save)save.disabled=!dirty;
    var state=root.querySelector('[data-mp-save-state]');if(state){state.className='mp-save-state'+(dirty?' unsaved':'');state.textContent=dirty?'Unsaved changes':(r.updated_at?'Saved '+ago(r.updated_at):'Not edited yet')}
    var badge=root.querySelector('[data-mp-source="'+k+'"]'),info=sourceInfo(r,k);if(badge){badge.className='mp-source '+info.cls;badge.textContent=info.label}
    var suggestion=root.querySelector('[data-mp-suggestion="'+k+'"]'),stored=asObj(r.overrides),draftOver=draft&&draft.overrides||{};if(suggestion)suggestion.hidden=!(own(stored,k)||own(draftOver,k));
    var meter=root.querySelector('[data-mp-completion]');if(meter){meter.className='mp-completion'+(comp.complete?' complete':'');meter.textContent=comp.done+'/'+comp.total+' essentials'}
  };
  var wireCard=function(root,r){
    root.querySelectorAll('[data-mp-field]').forEach(function(el){el.oninput=function(){
      var f=fieldByKey(el.dataset.mpField);if(!f)return;
      var id=+r.master_model_id,draft=F.mfrProfileDrafts[id]||(F.mfrProfileDrafts[id]={mfrProductId:+r.mfr_product_id,overrides:{}});
      var next=readControl(root,f),base=baseValue(r,f.key);
      if(equal(next,base))delete draft.overrides[f.key];else draft.overrides[f.key]=next;
      if(!Object.keys(draft.overrides).length)delete F.mfrProfileDrafts[id];
      updateDirtyUi(root,r,f.key);
    }});
    root.querySelectorAll('.mp-gallery-img').forEach(function(img){img.onerror=function(){var a=img.closest('a');if(a)a.style.display='none'}});
    root.querySelectorAll('.mp-model-img').forEach(function(img){img.onerror=function(){img.style.display='none';if(img.nextElementSibling)img.nextElementSibling.style.display='flex'}});
    var form=root.querySelector('[data-mp-form]');if(form)form.onsubmit=async function(e){
      e.preventDefault();
      var id=+r.master_model_id,draft=F.mfrProfileDrafts[id],over=JSON.parse(JSON.stringify(draft&&draft.overrides||{})),saveData=data;
      if(!Object.keys(over).length)return;
      var btn=root.querySelector('[data-mp-save]'),state=root.querySelector('[data-mp-save-state]');
      F.mfrProfileSaving[id]=true;
      reqSeq++; // invalidate any load that began before this save
      $('#view').removeAttribute('aria-busy');
      document.querySelectorAll('header button[data-tab],#run,.mp-filterbar button,[data-mp-card] input,[data-mp-card] select,[data-mp-card] textarea,[data-mp-card] button').forEach(function(el){el.disabled=true});
      btn.textContent='Saving…';state.className='mp-save-state';state.textContent='Saving changes…';
      try{
        var d=await api('mfr-profile',{masterId:id,mfrProductId:+r.mfr_product_id,overrides:over});
        if(d.profile&&typeof d.profile==='object')Object.assign(r,d.profile);
        else if(d.row&&typeof d.row==='object')Object.assign(r,d.row);
        else {
          var vals=asObj(r.values),sources=asObj(r.sources);
          Object.keys(over).forEach(function(k){vals[k]=over[k];sources[k]={kind:'manual',confidence:'reviewed'}});
          r.values=vals;r.sources=sources;r.updated_at=d.updated_at||Date.now();
        }
        if(d.overrides){
          r.overrides=d.overrides;
          var normalized=asObj(r.values);
          Object.keys(over).forEach(function(k){if(own(d.overrides,k))normalized[k]=d.overrides[k]});
          r.values=normalized;
        }
        if(d.values)r.values=d.values;if(d.sources)r.sources=d.sources;if(d.evidence)r.evidence=d.evidence;if(d.suggestions)r.suggestions=d.suggestions;
        r.source_changed=false;
        F.mfrProfileNotice={kind:'saved',text:'Saved aircraft data for '+((r.brand?r.brand+' ':'')+(r.name||'model'))+'.'};
        delete F.mfrProfileDrafts[id];delete F.mfrProfileSaving[id];F.mfrProfileSaved[id]=Date.now();
        document.querySelectorAll('header button[data-tab],#run').forEach(function(el){el.disabled=false});
        if(tab==='mfrdata'&&data===saveData){var y=window.scrollY;renderMfrProfiles();requestAnimationFrame(function(){window.scrollTo(0,y);var fresh=document.querySelector('[data-mp-card="'+id+'"]');if(fresh)fresh.focus({preventScroll:true})})}
      }catch(err){
        delete F.mfrProfileSaving[id];
        F.mfrProfileNotice={kind:'error',text:'Could not save '+((r.brand?r.brand+' ':'')+(r.name||'model'))+': '+(err.message||'Save failed')};
        document.querySelectorAll('header button[data-tab],#run').forEach(function(el){el.disabled=false});
        if(tab==='mfrdata'&&data===saveData){
          var y=window.scrollY;renderMfrProfiles();requestAnimationFrame(function(){
            window.scrollTo(0,y);
            var fresh=document.querySelector('[data-mp-card="'+id+'"]'),freshState=fresh&&fresh.querySelector('[data-mp-save-state]');
            if(freshState){freshState.className='mp-save-state error';freshState.textContent=err.message||'Save failed'}
            if(fresh)fresh.focus({preventScroll:true});
          });
        }
      }
    };
  };
  document.querySelectorAll('[data-mp-card]').forEach(function(root){root.tabIndex=-1;var id=+root.dataset.mpCard,row=rows.find(function(x){return +x.master_model_id===id});if(row)wireCard(root,row)});
  document.querySelectorAll('[data-mp-filter]').forEach(function(b){b.onclick=function(){if(hasProfileSaves())return;F.mfrDataFilter=b.dataset.mpFilter;syncURL();renderMfrProfiles()}});
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
  // Last cron slice outcome (persisted by runSliceLogged) — the only way to
  // see that the */15 pipeline is alive and what it last did.
  let lastJob='';try{const j=JSON.parse(s['job:last']||'null');if(j)lastJob='<p class="meta">last cron slice: <b>'+esc(j.job)+'</b> '+ago(j.at)+' <pre style="display:inline">'+esc(JSON.stringify(j.res||{}).slice(0,160))+'</pre></p>'}catch(e){}
  let lastErr='';try{const j=JSON.parse(s['job:last_error']||'null');if(j)lastErr='<p class="meta" style="color:var(--bad)">last slice ERROR '+ago(j.at)+': '+esc(j.msg)+'</p>'}catch(e){}
  $('#view').innerHTML='<p>'+tog('scan_paused','Daily scan')+' '+tog('enrich_paused','Enrich')+' '+tog('dedup_paused','Dedup')+' '+tog('verify_paused','Verify')+' '+tog('popularity_paused','Popularity')+' '+tog('mfr_paused','Manufacturer harvest')+' <button class="no" disabled>URL discovery: PAUSED (by design)</button></p>'
    +lastJob+lastErr
    +'<p class="meta">scan cursor: <pre>'+esc(s.scan_cursor||'—')+'</pre></p>'
    +healthTable
    +'<h3>Recent audit</h3><table class="t"><tbody>'
    +data.audit.map((a)=>'<tr><td>'+new Date(a.at).toISOString().slice(0,16).replace('T',' ')+'</td><td>'+esc(a.actor)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.entity)+' '+esc(a.entity_id||'')+'</td></tr>').join('')
    +'</tbody></table>';
  document.querySelectorAll('button[data-set]').forEach((b)=>b.onclick=async()=>{await api('system',{k:b.dataset.set,v:b.dataset.v});load()});
}

readURL();markTab();load();
</script></body></html>`
