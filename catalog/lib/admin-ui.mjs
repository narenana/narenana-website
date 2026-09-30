// Admin panel v2 — Review · Sources · Catalog · AI curator · System. Served at /admin
// behind HTTP Basic auth (the browser manages the credential; same-origin
// fetches attach it automatically, so there is no token in page storage).
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Catalog admin</title>
<link rel="stylesheet" href="/assets/family/fonts.css?v=c848c473a8"><style>
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
body{font-family:"DM Sans",sans-serif}h1{font-family:"Barlow Condensed",sans-serif;font-size:26px}:root{--accent:#ff8500;--accent-bright:#80c9f5;--bg:#15191c;--card:#20272d}button{border-radius:3px}header:before{content:"";display:block;width:32px;height:32px;border-radius:50%;background:url(/assets/avatar.jpg?v=49424a6497) center/cover}
a{color:var(--accent-bright);overflow-wrap:anywhere}.row>*{min-width:0}.fields{grid-template-columns:repeat(4,minmax(0,1fr))}.ct-f{min-width:0}input,select,textarea{max-width:100%}.table-scroll{max-width:100%;overflow-x:auto}.table-scroll table{min-width:620px}
@media(max-width:640px){.row{grid-template-columns:72px minmax(0,1fr);gap:10px}.thumb,.noimg{width:72px;height:64px}.acts{grid-column:1/-1;flex-direction:row;flex-wrap:wrap}.acts button{width:auto;min-height:44px}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}.ct-edit .fields,.ct-fields{grid-template-columns:1fr!important}.wrap{padding:12px 12px 90px}.ct-f input{width:100%}header{position:relative}}
</style></head><body>
<header>
  <h1>Catalog <span style="opacity:.4;font-size:.7rem">v14</span></h1>
  <button class="on" data-tab="review">Review</button>
  <button data-tab="catalog">Catalog</button>
  <button data-tab="popularity">Popularity</button>
  <button data-tab="dupes">Duplicates</button>
  <button data-tab="mfr">Manufacturer</button>
  <button data-tab="mfrdata">Aircraft data</button>
  <button data-tab="curator">AI curator <span id="cu-needs"></span></button>
  <span class="tsep"></span>
  <button data-tab="sources">Sources</button>
  <button data-tab="system">System</button>
  <span class="grow"></span>
  <button id="run" class="go">Run job slice</button>
</header>
<div id="log" hidden></div><p id="save-status" role="status" aria-live="polite" style="margin:0;padding:8px 16px"></p>
<div class="bar" id="filters" style="display:none"></div>
<div class="wrap"><div id="view">loading…</div></div>
<script>
function labelAdminControls(){
 document.querySelectorAll('#view input,#view select,#view textarea').forEach(function(el,i){
  if(el.labels&&el.labels.length||el.hasAttribute('aria-label'))return;
  var caption=el.parentElement.classList.contains('ct-f')?el.parentElement.querySelector('label'):null;
  if(caption){if(!el.id)el.id='admin-field-'+i;caption.htmlFor=el.id;return;}
  var name=el.placeholder||el.dataset.f||(el.dataset.boost?'Popularity boost':null)||el.name||el.id;
  if(name)el.setAttribute('aria-label',name);
 });
 document.querySelectorAll('#view table.t').forEach(function(table){if(table.parentElement.classList.contains('table-scroll'))return;var wrap=document.createElement('div');wrap.className='table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable data table');table.before(wrap);wrap.append(table);});
}
new MutationObserver(labelAdminControls).observe(document.getElementById('view'),{childList:true,subtree:true});

const $=(s)=>document.querySelector(s);
const esc=(s)=>(s??'').toString().replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const inr=(n)=>'₹'+Number(n).toLocaleString('en-IN');
const ago=(ms)=>{if(!ms)return 'never';const h=Math.round((Date.now()-ms)/3.6e6);return h<1?'<1h ago':h<48?h+'h ago':Math.round(h/24)+'d ago'};
const fmtViews=(n)=>n==null?'—':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n);
// Resolve against location.origin, NOT the document URL: if the page was
// opened as http://user:pass@host/admin the document base carries credentials
// and fetch() refuses to construct the request — the panel dies looking empty.
const api=async(p,body)=>{const r=await fetch(new URL('/api/'+p,location.origin),body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d};
let tab='review',F={status:'new',stock:'in',src:'',page:1,cq:'',cstatus:'',cstock:'',mfrChoices:{},mfrDataFilter:'all',mfrProfileDrafts:{},mfrProfileSaved:{},mfrProfileSaving:{},mfrProfileNotice:''},data=null,reqSeq=0;

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
    else if(tab==='catalog')d=await api('catalog?page='+F.page+(F.anomaly?'&anomaly=1':'')+(F.cq?'&q='+encodeURIComponent(F.cq):'')+(F.cstatus?'&mstatus='+F.cstatus:'')+(F.cstock?'&stock='+F.cstock:''));
    else if(tab==='popularity')d=await api('catalog?sort=pop&page='+F.page);
    else if(tab==='dupes')d=await api('duplicates'+(F.ddView==='dismissed'?'?view=dismissed':''));
    else if(tab==='curator')d=await api('curator');
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
    else if(tab==='curator')renderCurator();
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
  const sugg=(k.suggestions||[]).map((m)=>'<button class="chip" data-a="attach" data-sku="'+k.id+'" data-master="'+m.id+'">→ '+esc(m.brand+' '+m.name)+(m.cos!=null?' <span>'+Math.round(m.cos*100)+'%</span>':'')+'</button>').join('');
  const aiLine=k.ai?'<p class="meta" style="margin:-4px 0 8px"><span class="tag w">AI curator</span> '+esc(k.ai.kind||'')+(k.ai.confidence!=null?' '+Math.round(k.ai.confidence*100)+'%':'')+(k.ai.why?' · '+esc(k.ai.why):'')+'</p>':'';
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
    +aiLine+mapUI+'</div><div class="acts">'+acts+'</div></div>';
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
const CAT_CSS='<style>'
  +'.ct-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px}'
  +'.ct-search{background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:8px;padding:8px 12px;font-family:inherit;font-size:.85rem;width:230px}'
  +'.ct-row{display:grid;grid-template-columns:96px 1fr auto;gap:14px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;align-items:start}'
  +'.ct-row.is-flag{border-color:rgba(248,81,73,.5)}'
  +'.ct-thumb{width:96px;height:72px;background:#fff;border-radius:8px;object-fit:contain}'
  +'.ct-nothumb{width:96px;height:72px;background:var(--bg);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.65rem}'
  +'.ct-title{font-weight:700;font-size:.95rem}.ct-title a{color:var(--accent-bright);text-decoration:none;font-weight:500;font-size:.75rem;margin-left:6px}'
  +'.ct-badge{font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:99px;margin-left:8px;vertical-align:2px}'
  +'.ct-badge.rdy{background:rgba(63,185,80,.15);color:var(--ok)}.ct-badge.drf{background:rgba(210,153,34,.15);color:var(--warn)}'
  +'.ct-meta{font-size:.76rem;color:var(--muted);margin:3px 0 9px}.ct-meta b{color:var(--fg)}.ct-meta .bad{color:var(--bad);font-weight:600}'
  +'.ct-fields{display:grid;grid-template-columns:130px 1fr 110px;gap:6px;max-width:640px}'
  +'.ct-f label{display:block;font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 3px 2px}'
  +'.ct-f input{width:100%}.ct-f.wide{grid-column:1/-1}'
  +'.ct-acts{display:flex;flex-direction:column;gap:6px;align-items:stretch;min-width:104px}'
  +'@media(max-width:640px){.ct-row{grid-template-columns:60px minmax(0,1fr)!important}.ct-row>*{min-width:0}.ct-thumb,.ct-nothumb{width:60px!important;height:60px!important}.ct-acts{grid-column:1/-1;flex-direction:row;min-width:0}.ct-title{overflow-wrap:anywhere}.ct-search{min-width:0;width:100%}.ct-bar{min-width:0}}'
  +'</style>';
function renderCatalog(){
  const c=data.chips||{};
  const chip=(key,val,label,n)=>'<button class="chip'+(F[key]===val?' on':'')+'" data-cf="'+key+'" data-cv="'+val+'">'+label+(n!=null?' <span>'+n+'</span>':'')+'</button>';
  const bar='<div class="ct-bar">'
    +'<input class="ct-search" id="ct-q" type="search" placeholder="Search brand, model or slug…" value="'+esc(F.cq||'')+'"/>'
    +chip('cstatus','','All',(c.ready||0)+(c.draft||0))
    +chip('cstatus','ready','Published',c.ready)
    +chip('cstatus','draft','Drafts',c.draft)
    +chip('cstock','none','No live stock',c.readyNoStock)
    +'<button class="chip'+(F.anomaly?' on':'')+'" id="anomToggle">⚑ Flagged <span>'+(data.anomalyCount||0)+'</span></button>'
    +'<span class="meta" style="margin-left:auto">'+(data.total||0)+' shown · newest edits first</span></div>';
  // Who set each field: "you" (locked), "directive", "approved", "curator 94%", "rules".
  const src=(m,f)=>{const x=(m.field_src||{})[f];if(!x)return '';
    const lbl=x.src==='owner'?'you':x.src==='owner-approved'?'approved':x.src==='curator'?'curator'+(x.confidence!=null?' '+Math.round(x.confidence*100)+'%':''):x.src;
    return ' <span class="tag'+(x.src==='curator'||x.src==='rules'?' w':'')+'" title="who set this field">'+esc(lbl)+'</span>'+(x.action?' <button class="chip" data-revert="'+x.action+'" title="Undo the curator\u2019s change and lock the field as yours">Revert</button>':'')};
  const row=(m)=>{
    let sp={};try{sp=JSON.parse(m.specs||'{}')}catch(e){}
    let anom='';if(m.anomaly){var a={};try{a=JSON.parse(m.anomaly)}catch(e){}anom='<span class="bad" title="detected by the dedup finder"> · ⚑ '+esc(a.detail||a.kind||'flagged')+'</span>'}
    const price=m.min_price?'from <b>'+inr(m.min_price)+'</b>':(m.status==='ready'?'<span class="bad">no live stock</span>':'—');
    const pop=m.pop_score!=null?' · pop '+Math.round(m.pop_score):'';
    return '<div class="ct-row'+(m.anomaly?' is-flag':'')+'" >'
      +'<img class="ct-thumb" src="/img/master/'+m.id+'" loading="lazy" alt="" onerror="this.outerHTML=\\'<div class=ct-nothumb>no image</div>\\'"/>'
      +'<div><div class="ct-title">'+esc(m.brand||'(no brand)')+' '+esc(m.name)
        +'<span class="ct-badge '+(m.status==='ready'?'rdy':'drf')+'">'+(m.status==='ready'?'live':'draft')+'</span>'
        +'<a href="'+esc(m.path)+'" target="_blank" rel="noopener">open page ↗</a></div>'
      +'<div class="ct-meta">'+m.offers+' seller offer'+(m.offers===1?'':'s')+' · <b>'+m.live_offers+' in stock</b> · '+price+pop+anom+'</div>'
      +'<div class="ct-fields">'
        +'<div class="ct-f"><label>Brand'+src(m,'brand')+'</label><input class="inline" data-m="'+m.id+'" data-f="brand" value="'+esc(m.brand)+'"/></div>'
        +'<div class="ct-f"><label>Model name'+src(m,'name')+'</label><input class="inline" data-m="'+m.id+'" data-f="name" value="'+esc(m.name)+'"/></div>'
        +'<div class="ct-f"><label>Page address (slug)'+src(m,'slug')+'</label><input class="inline" data-m="'+m.id+'" data-f="slug" value="'+esc(m.slug)+'" title="Renaming keeps the old address working: it redirects here."/></div>'
        +'<div class="ct-f"><label>Wingspan mm'+src(m,'specs.spanMM')+'</label><input class="inline" data-m="'+m.id+'" data-f="spec:spanMM" value="'+esc(sp.spanMM??'')+'"/></div>'
        +'<div class="ct-f wide"><label>One-line blurb (shows on the product page)'+src(m,'blurb')+'</label><input class="inline" data-m="'+m.id+'" data-f="blurb" value="'+esc(m.blurb||'')+'" placeholder="e.g. Stable 1400mm high-wing trainer with flaps"/></div>'
        +(m.role_tags?'<div class="ct-f wide"><label>Role tags'+src(m,'role_tags')+'</label><span class="meta">'+esc((()=>{try{return JSON.parse(m.role_tags).join(' · ')}catch(e){return ''}})())+' <span class="tag">'+esc(m.role_source||'')+'</span></span></div>':'')
      +'</div></div>'
      +'<div class="ct-acts">'
        +(m.status==='ready'
          ?'<button class="no" data-mm="'+m.id+'" data-st="draft" title="Take the page off the public site">Unpublish</button>'
          :'<button class="ok" data-mm="'+m.id+'" data-st="ready" title="Make the page public (needs required specs)">Publish</button>')
      +'</div></div>';};
  $('#view').innerHTML=CAT_CSS+bar
    +(data.masters.length?data.masters.map(row).join(''):'<p class="empty">Nothing matches this filter.</p>')
    +'<p class="meta">Fields save when you click away — green flash = saved, red = failed. Publish needs the required specs (the API refuses otherwise).</p>'
    +pager(data.total,data.pageSize,data.page||1);
  wirePager();
  document.querySelectorAll('button[data-cf]').forEach((b)=>b.onclick=()=>{F[b.dataset.cf]=(F[b.dataset.cf]===b.dataset.cv&&b.dataset.cv!=='')?'':b.dataset.cv;if(b.dataset.cf==='cstatus'&&b.dataset.cv==='')F.cstatus='';F.page=1;load()});
  (function(){var q=$('#ct-q');if(!q)return;var t;q.oninput=()=>{clearTimeout(t);t=setTimeout(()=>{F.cq=q.value.trim();F.page=1;load()},350)};
    q.onkeydown=(e)=>{if(e.key==='Enter'){clearTimeout(t);F.cq=q.value.trim();F.page=1;load()}};
    // keep focus through the re-render triggered by a search load
    if(F.cq){q.focus();try{q.setSelectionRange(q.value.length,q.value.length)}catch(e){}}})();
  (function(){var at=$('#anomToggle');if(at)at.onclick=()=>{F.anomaly=!F.anomaly;F.page=1;load()}})();
  document.querySelectorAll('button[data-mm]').forEach((b)=>b.onclick=async()=>{try{await api('master',{id:+b.dataset.mm,status:b.dataset.st});load()}catch(e){alert(e.message)}});
  document.querySelectorAll('button[data-revert]').forEach((b)=>b.onclick=async()=>{if(!confirm('Put the old value back? The field is then locked as yours, so the curator never fills it again.'))return;b.disabled=true;try{await api('curator-revert',{actionId:+b.dataset.revert});load()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('input[data-m]').forEach((i)=>i.onchange=async()=>{
    const id=+i.dataset.m,f=i.dataset.f,body={id};
    if(f.startsWith('spec:')){const row=data.masters.find((x)=>x.id===id);let sp={};try{sp=JSON.parse(row.specs||'{}')}catch(e){}sp[f.slice(5)]=i.value.trim();row.specs=JSON.stringify(sp);body.specs=row.specs}
    else body[f]=i.value;
    // Never lose an edit silently: flash saved/failed on the input itself.
    try{await api('master',body);$('#save-status').textContent='Saved '+(i.getAttribute('aria-label')||i.labels?.[0]?.textContent||f)+'.';i.style.outline='2px solid #3fb950';setTimeout(()=>{i.style.outline=''},900);if(f==='slug')load()}
    catch(e){$('#save-status').textContent='Not saved: '+e.message;i.style.outline='2px solid #f85149';alert('NOT saved: '+e.message)}
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
    const ai=r.ai?'<div class="meta" style="margin-top:8px"><span class="tag w">AI curator</span> '+cuVerdict(r.ai)+(r.ai.gates&&r.ai.gates.length?' · '+esc(r.ai.gates.join('; ')):'')+(r.ai.primary&&r.ai.primary.evidence&&r.ai.primary.evidence.length?' · “'+esc(r.ai.primary.evidence.join('”, “'))+'”':'')+'</div>':'';
    return '<div class="dd-pair"><div class="dd-cols">'+side(r,K,'✔ KEEP',true)+'<div class="dd-arrow">◀ merge<br>into keep</div>'+side(r,M,'MERGE IN',false)
      +'</div>'+ai+'<div class="dd-foot"><span class="meta">'+(r.both_in_stock?'<span class="dd-prio">★ both in stock</span>':'<span class="dd-cosmetic">one side out · cosmetic</span>')+esc(r.reason)+' · '+Math.round(r.score*100)+'%</span>'
      +'<span class="acts"><button class="ok" data-dd="merge" data-keep="'+r.keepId+'" data-drop="'+dropId+'">✓ Same — merge</button>'
      +'<button class="no" data-dd="reject" data-keep="'+r.a_id+'" data-drop="'+r.b_id+'">✕ Different</button></span></div></div>';};
  const prio=rows.filter((r)=>r.both_in_stock).length;
  let divShown=false;
  const listHtml=rows.map((r)=>{let pre='';if(!r.both_in_stock&&!divShown){divShown=true;pre='<div class="dd-divider">↓ below: one side is already out of stock — merging is cosmetic (does not change what shoppers see), safe to skip</div>';}return pre+card(r);}).join('');
  const view=data.view||'pending';
  const merges=(data.merges||[]).map((u)=>'<div class="cu-row"><div>#'+u.absorbed_id+' '+esc((u.absorbed_brand?u.absorbed_brand+' ':'')+(u.absorbed_name||''))+' → #'+u.survivor_id+' '+esc((u.survivor_brand?u.survivor_brand+' ':'')+(u.survivor_name||''))+'<div class="meta">'+esc(u.actor)+' · '+ago(u.created_at)+(u.undone_at?' · undone':'')+'</div></div>'+(u.undone_at?'':'<span class="cu-acts"><button data-unmerge="'+u.id+'">Undo</button></span>')+'</div>').join('');
  $('#view').innerHTML=CU_CSS+DD_CSS+'<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><button id="ddrun" class="go">Scan for duplicates now</button>'
    +'<button class="chip'+(view==='pending'?' on':'')+'" data-ddv="pending">To review</button><button class="chip'+(view==='dismissed'?' on':'')+'" data-ddv="dismissed" title="The AI said these are different planes. Hidden by default; not your rejection.">AI says different <span>'+(data.dismissed||0)+'</span></button>'
    +'<span class="meta">'+rows.length+' pair(s) · <b>'+prio+' with both sides in stock</b> (shown first — these are the ones that change what shoppers see). Confirm only if the two are the SAME product from different sellers. The daily AI curator merges only the obvious ones; the rest are here with its verdict.</span></div>'
    +(rows.length?listHtml:'<p class="empty">No duplicate pairs awaiting review. The cron re-checks every few hours.</p>')
    +(merges?'<details class="cu"><summary>Recent merges ('+(data.merges||[]).length+') · each can be undone</summary>'+merges+'</details>':'');
  $('#ddrun').onclick=async()=>{$('#ddrun').disabled=true;$('#ddrun').textContent='scanning…';try{const d=await api('dedup-run',{});alert('Recorded '+(d.flagged||0)+' new pair(s) for review and '+(d.anomalies||0)+' anomalies. Nothing is merged here: the daily AI curator merges only the obvious ones.')}catch(e){alert(e.message)}load()};
  document.querySelectorAll('button[data-ddv]').forEach((b)=>b.onclick=()=>{F.ddView=b.dataset.ddv;load()});
  document.querySelectorAll('button[data-unmerge]').forEach((b)=>b.onclick=async()=>{if(!confirm('Undo this merge? The absorbed page comes back with its listings and address, and the pair is marked as not duplicates.'))return;b.disabled=true;try{const d=await api('unmerge',{undoId:+b.dataset.unmerge});alert('Restored #'+d.restored+(d.kept&&d.kept.length?' (kept your later edits: '+d.kept.join(', ')+')':''));load()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('button[data-dd]').forEach((b)=>b.onclick=async()=>{
    const keep=+b.dataset.keep,drop=+b.dataset.drop;
    if(b.dataset.dd==='merge'&&!confirm('Merge these into ONE product page? The "MERGE IN" master is absorbed into the "KEEP" one; its offers move over. Recorded in audit.'))return;
    b.disabled=true;
    try{const d=await api(b.dataset.dd==='merge'?'merge':'reject-merge',{aId:keep,bId:drop});if(d.undoId)$('#save-status').textContent='Merged. Undo it from Recent merges below if it was wrong.';load()}catch(e){alert(e.message);b.disabled=false}
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
  $('#view').innerHTML=MFR_PROFILE_CSS+'<div class="mp-intro"><div><p class="title">Aircraft data</p><p class="meta">Only published models with an accepted manufacturer mapping appear here. Harvested facts remain visibly sourced; fill the unknowns and save one model at a time. Nothing here is shown on public product pages yet: manufacturer data is admin-only until the owner decides how it is published (PUBLIC_MANUFACTURER_FACTS in catalog/lib/worker.mjs).</p></div><span class="tag w">curated aircraft data</span></div>'
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
        var d=await api('mfr-profile',{masterId:id,mfrProductId:+r.mfr_product_id,expectedUpdatedAt:r.updated_at??null,overrides:over});
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

// ------- AI curator (curator/index.mjs) -------
const CU_CSS='<style>'
  +'.cu-top{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px}'
  +'.cu-line{font-size:1rem;font-weight:650;margin:0 0 4px}'
  +'.cu-ctl{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px}'
  +'.cu-ctl input{background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:.78rem;width:96px}'
  +'.cu-chip{display:inline-block;font-size:.68rem;padding:2px 8px;border-radius:99px;border:1px solid var(--border);margin:6px 6px 0 0}'
  +'.cu-chip.ok{color:var(--ok);border-color:rgba(63,185,80,.5)}.cu-chip.bad{color:var(--bad);border-color:rgba(248,81,73,.6)}'
  +'details.cu{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-bottom:10px}'
  +'details.cu>summary{cursor:pointer;font-weight:700;font-size:.9rem}'
  +'.cu-h{font-size:.66rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:12px 0 2px}'
  +'.cu-row{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;border-top:1px dashed var(--border);padding:8px 0;font-size:.82rem}'
  +'.cu-row>div{min-width:0;overflow-wrap:anywhere}.cu-row .meta{margin:2px 0 0}.cu-acts{display:flex;gap:6px;flex-shrink:0;align-items:flex-start}.cu-acts button{white-space:nowrap}'
  +'.cu-form{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}'
  +'.cu-form input,.cu-form select{background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:.78rem;width:auto;max-width:220px}'
  +'.cu-v{font-size:.66rem;font-weight:700;padding:1px 6px;border-radius:4px;border:1px solid var(--border);margin-right:4px;white-space:nowrap}'
  +'.cu-v.same{color:var(--ok);border-color:rgba(63,185,80,.5)}.cu-v.different{color:var(--bad);border-color:rgba(248,81,73,.5)}.cu-v.unsure{color:var(--warn);border-color:rgba(210,153,34,.5)}'
  +'@media(max-width:640px){.cu-row{flex-direction:column}.cu-acts{flex-wrap:wrap}.cu-acts button{min-height:40px}}'
  +'</style>';
function cuName(id,fb){const m=(data&&data.masters||{})[id];return m?'#'+id+' '+esc((m.brand?m.brand+' ':'')+m.name):'#'+id+(fb?' '+esc(fb):'')}
function cuSku(id){const k=(data&&data.skus||{})[id];return 'listing #'+id+(k?' '+esc(String(k.title||'').slice(0,80)):'')}
function cuVal(v){if(v==null||v==='')return '—';if(typeof v==='object')return esc(JSON.stringify(v).slice(0,100));return esc(String(v))}
function cuVerdict(ev){
  if(!ev)return '';
  const p=ev.primary,s2=ev.second;let out='';
  if(p)out+='<span class="cu-v '+esc(p.verdict)+'">'+esc(p.verdict)+' '+Math.round((p.confidence||0)*100)+'%</span>';
  if(s2)out+='<span class="cu-v '+esc(s2.verdict)+'">2nd opinion: '+esc(s2.verdict)+' '+Math.round((s2.confidence||0)*100)+'%</span>';
  if(ev.verdict==='rules-only')out+='<span class="cu-v">rules only (AI unavailable)</span>';
  const d=(p&&p.differences)||[];if(d.length)out+=' '+esc(d.join(', '));
  if(ev.outcome==='waiting')out+=' <span class="meta">second opinion unavailable; asked again tomorrow</span>';
  return out}
function cuDescribe(a){
  const ev=a.evidence||{},af=a.after||{},bf=a.before||{};
  if(a.kind==='merge'){const ab=(bf.value&&bf.value.absorb)||{};const took=(af.value&&af.value.took)||[];return 'Merged #'+a.other_id+' '+esc((ab.brand?ab.brand+' ':'')+(ab.name||''))+' into '+cuName(a.entity_id)+'<div class="meta">'+cuVerdict(ev)+(took.length?' · took '+esc(took.join(', ')):'')+(ab.slug?' · /'+esc(ab.slug)+'/ now redirects':'')+'</div>'}
  if(a.kind==='directive'){const p=ev.payload||{};return 'Your directive #'+esc(ev.directive)+': '+(ev.kind==='merge'?'#'+esc(p.absorb)+' into '+cuName(p.keep):ev.kind==='rename'?cuName(p.id)+' → '+esc(p.name||'')+(p.slug?' at /'+esc(p.slug)+'/':''):cuName(p.id)+' brand '+esc(p.brand||''))+(ev.error?'<div class="meta" style="color:var(--bad)">'+esc(ev.error)+'</div>':'')}
  if(a.kind==='reject')return 'Rejected '+cuSku(a.entity_id)+' as '+esc(af.reason||'')+'<div class="meta">AI: '+esc(ev.kind||'')+' '+Math.round((a.confidence||0)*100)+'% · '+esc(ev.rule||'')+'</div>';
  if(a.kind==='attach')return 'Attached '+cuSku(a.entity_id)+' to '+cuName(af.master)+' ('+esc(af.config||'kit')+')<div class="meta">'+cuVerdict(ev)+'</div>';
  if(a.kind==='draft'){const d=af.draft||{};return 'New draft page from '+cuSku(a.entity_id)+': '+esc((d.brand||'')+' '+(d.name||''))+' · '+esc(d.spanMM)+' mm · /'+esc(d.slug)+'/'}
  if(a.kind==='dismiss')return 'AI says different: '+cuName(a.entity_id)+' / '+cuName(a.other_id)+'<div class="meta">'+cuVerdict(ev)+'</div>';
  if(a.kind==='error')return '<span style="color:var(--bad)">'+esc(ev.phase||'')+' · '+esc(ev.item||'')+' · '+esc(ev.kind||'')+(ev.code?' '+esc(ev.code):'')+'</span><div class="meta">'+esc(String(ev.msg||'').slice(0,220))+'</div>';
  if(a.entity==='sku'&&af.field==='guess'){const g=af.value||{};return 'Review prefill for '+cuSku(a.entity_id)+'<div class="meta">'+esc(g.brand||'')+' '+esc(g.name||'')+(g.spanMM?' · '+esc(g.spanMM)+' mm':'')+' · '+esc(g.kind||'')+'</div>'}
  const subj=a.entity==='master'?cuName(a.entity_id):a.entity==='sku'?cuSku(a.entity_id):'';
  return subj+' · '+esc(af.field||'')+': '+cuVal(bf.value)+' → '+cuVal(af.value)+(a.confidence!=null?' <span class="meta">('+Math.round(a.confidence*100)+'%)</span>':'')+(ev.quote?'<div class="meta">“'+esc(ev.quote)+'”</div>':ev.why?'<div class="meta">'+esc(ev.why)+'</div>':'')}
function cuAsk(a){
  const ev=a.evidence||{},af=a.after||{},bf=a.before||{};
  const i=ev.issue;
  if(i==='merge-review')return 'Same plane? '+cuName(a.entity_id)+' / '+cuName(a.other_id)+'<div class="meta">'+cuVerdict(ev)+(ev.gates&&ev.gates.length?' · '+esc(ev.gates.join('; ')):'')+'</div>';
  if(i==='listing-review')return cuSku(a.entity_id)+'<div class="meta">'+esc(ev.why||'')+(ev.matches&&ev.matches.length?' · closest: '+ev.matches.map((x)=>cuName(x.id)+' '+Math.round(x.cos*100)+'%').join(', '):'')+'</div>';
  if(i==='source-all-rejected')return 'Source <b>'+esc(ev.source_id)+'</b><div class="meta">'+esc(ev.why||'')+'</div>';
  return cuName(a.entity_id)+' · '+esc((i||'').replace(/-/g,' '))+': '+esc(af.field||'')+' '+cuVal(bf.value)+' → '+cuVal(af.value)+'<div class="meta">'+esc(ev.why||'')+(ev.quote?' “'+esc(ev.quote)+'”':'')+(ev.quotes&&ev.quotes.length?' “'+esc(ev.quotes.join('”, “'))+'”':'')+'</div>'}
const CU_GROUPS=[
  ['Merges to decide',['merge-review'],'dupes'],
  ['Listings to decide',['listing-review'],'review'],
  ['Conflicts',['ai-brand-conflict','ai-span-conflict','power-mismatch','not-fixed-wing'],null],
  ['Suggestions',null,null],
];
function renderCurator(){
  const s=data.settings||{},run=data.run,st=data.state||{};
  const needs=data.needsYou||[];
  $('#cu-needs').textContent=needs.length?String(needs.length):'';
  const mode=s.curator_mode==='live'?'live':'dry';
  const on=s.curator_enabled!=='0',ai=s.curator_ai!=='0',drafts=s.curator_drafts!=='0';
  const line=run&&run.summary?esc(run.summary):run?'Run '+esc(run.id)+' ('+esc(run.mode)+'): '+esc(run.status)+(run.status==='running'?', at '+esc(run.phase):''):'No run yet. The first daily run starts after the scan, no earlier than 06:00 IST.';
  const health=run&&run.cursor&&run.cursor.health;
  const chips=health&&!health.off?Object.entries(health).map(([id,h])=>'<span class="cu-chip '+(h.ok?'ok':'bad')+'" title="'+esc(h.msg||'')+'">'+esc(h.role)+': '+esc(id.split('/').pop())+(h.ok?' ✓':' ✕ '+esc(h.code||h.kind||''))+'</span>').join(''):health&&health.off?'<span class="cu-chip">AI off</span>':'';
  const neurons=Number(s['ai_neurons:'+new Date().toISOString().slice(0,10)]||0);
  const top='<div class="cu-top"><p class="cu-line">'+line+'</p>'
    +'<p class="meta">Mode <b>'+mode+'</b>'+(mode==='dry'?' (plans only: nothing changes until you apply the plan or switch to live)':' (applies changes as it goes; every change can be undone)')+(on?'':' · <b style="color:var(--bad)">paused</b>')+(st.active?' · a run is in progress':'')+(st.apply?' · applying a plan':'')+' · today '+Math.round(neurons).toLocaleString('en-US')+' of '+Number(s.curator_neuron_cap||8000).toLocaleString('en-US')+' Neurons</p>'
    +(chips?'<div>'+chips+'</div>':'')
    +'<div class="cu-ctl"><button class="go" id="cu-run">Run now</button><button id="cu-dry" title="Start another run today in dry-run mode: a plan and a report, no changes">Dry run</button>'
    +'<span class="tsep"></span>'
    +'<button data-cus="curator_mode" data-v="'+(mode==='live'?'dry':'live')+'" class="'+(mode==='live'?'ok':'')+'">Mode: '+mode+'</button>'
    +'<button data-cus="curator_enabled" data-v="'+(on?'0':'1')+'" class="'+(on?'':'no')+'">'+(on?'Pause curator':'Resume curator')+'</button>'
    +'<button data-cus="curator_ai" data-v="'+(ai?'0':'1')+'">AI: '+(ai?'on':'off')+'</button>'
    +'<button data-cus="curator_drafts" data-v="'+(drafts?'0':'1')+'" title="New draft pages for obvious new planes (never public until you publish)">New drafts: '+(drafts?'on':'off')+'</button>'
    +'<label class="meta">Neuron cap <input id="cu-cap" type="number" min="0" max="100000" step="500" value="'+esc(s.curator_neuron_cap||'8000')+'"/></label><button id="cu-cap-save">Save</button>'
    +'</div></div>';
  // needs you
  const grouped=CU_GROUPS.map(([title,issues,link])=>{
    const rows=needs.filter((a)=>issues?issues.includes((a.evidence||{}).issue):!CU_GROUPS.some((g)=>g[1]&&g[1].includes((a.evidence||{}).issue)));
    if(!rows.length)return '';
    return '<p class="cu-h">'+esc(title)+' ('+rows.length+')'+(link?' · <a href="/admin?tab='+link+'" data-cugo="'+link+'">open '+(link==='dupes'?'Duplicates':'Review')+'</a>':'')+'</p>'
      +rows.slice(0,60).map((a)=>{const ev=a.evidence||{};
        const acts=ev.issue==='merge-review'?'<button class="ok" data-cumerge="'+a.id+'" data-keep="'+(ev.keep_id||a.entity_id)+'" data-drop="'+((ev.keep_id||a.entity_id)===a.entity_id?a.other_id:a.entity_id)+'">Same: merge</button><button class="no" data-cureject="'+a.id+'" data-a="'+a.entity_id+'" data-b="'+a.other_id+'">Different</button>':'';
        return '<div class="cu-row"><div>'+cuAsk(a)+'</div><span class="cu-acts">'+acts+'<button data-cudismiss="'+a.id+'" title="Close this without acting; it is not raised again for the same input">Dismiss</button></span></div>'}).join('')
      +(rows.length>60?'<p class="meta">…and '+(rows.length-60)+' more</p>':'');
  }).join('');
  const drafts2=(data.drafts||[]);
  const draftsHtml=drafts2.length?'<p class="cu-h">Drafts to publish ('+drafts2.length+') · <a href="/admin?tab=catalog" data-cugo="catalog">open Catalog</a></p>'+drafts2.map((d)=>'<div class="cu-row"><div>#'+d.id+' '+esc((d.brand||'')+' '+d.name)+'<div class="meta">made by the curator from a new listing; publish it from the Catalog tab</div></div></div>').join(''):'';
  const needsHtml='<details class="cu" open><summary>Needs you ('+needs.length+')</summary>'+(grouped+draftsHtml||'<p class="meta">Nothing waiting for you.</p>')+'</details>';
  // this run's changes
  const acts=(data.actions||[]);
  const done=acts.filter((a)=>a.status==='applied'&&a.kind!=='escalate'&&a.kind!=='error');
  const planned=acts.filter((a)=>a.status==='planned'&&a.kind!=='escalate');
  const errs=acts.filter((a)=>a.kind==='error');
  const other=acts.filter((a)=>['skipped','failed','undone'].includes(a.status)&&a.kind!=='error');
  const undoable=(a)=>['merge','attach','reject','draft','fill','rename','roles'].includes(a.kind)||(a.kind==='directive');
  const list=(rows,btn)=>rows.slice(0,200).map((a)=>'<div class="cu-row"><div>'+cuDescribe(a)+'</div><span class="cu-acts">'+(btn&&undoable(a)?'<button data-curevert="'+a.id+'">Undo</button>':'')+'</span></div>').join('')+(rows.length>200?'<p class="meta">…and '+(rows.length-200)+' more</p>':'');
  const doneHtml='<details class="cu"'+(done.length?' open':'')+'><summary>Done automatically ('+done.length+')</summary>'+(done.length?list(done,true):'<p class="meta">Nothing changed in this run.</p>')+'</details>';
  const planHtml=planned.length?'<details class="cu" open><summary>Planned by this dry run ('+planned.length+')</summary><p class="meta">Nothing here has changed yet. Apply this plan and the next ticks make exactly these changes; any whose page changed since are skipped as stale.</p><p><button class="go" id="cu-apply" data-run="'+esc(run?run.id:'')+'">Apply this plan</button></p>'+list(planned,false)+'</details>':'';
  const otherHtml=other.length?'<details class="cu"><summary>Skipped, failed or undone ('+other.length+')</summary>'+other.slice(0,120).map((a)=>'<div class="cu-row"><div>'+cuDescribe(a)+'<div class="meta">'+esc(a.status)+((a.evidence||{}).skipped?': '+esc(a.evidence.skipped):'')+((a.evidence||{}).error?': '+esc(a.evidence.error):'')+'</div></div></div>').join('')+'</details>':'';
  const errHtml='<details class="cu"'+(errs.length?' open':'')+'><summary>Errors ('+errs.length+')</summary>'+(errs.length?list(errs,false):'<p class="meta">No errors.</p>')+'</details>';
  // directives
  const dirs=(data.directives||[]);
  const dirHtml='<details class="cu"><summary>Your decisions queue ('+dirs.filter((d)=>d.status==='approved').length+' waiting)</summary>'
    +'<p class="meta">Decisions you have made, applied first in the next run (dry runs plan them). Each checks that the pages still have the addresses they had when you queued it.</p>'
    +'<div class="cu-form"><select id="cu-dk"><option value="merge">Merge: keep #A, absorb #B</option><option value="rename">Rename #A</option><option value="brand">Set brand of #A</option></select>'
    +'<input id="cu-d1" type="number" placeholder="#A (keep / page)"/><input id="cu-d2" placeholder="#B to absorb, or new name / brand"/><input id="cu-d3" placeholder="new address (rename, optional)"/><button id="cu-dadd" class="go">Queue</button></div>'
    +dirs.map((d)=>{const p=d.payload||{};return '<div class="cu-row"><div>#'+d.id+' '+esc(d.kind)+': '+(d.kind==='merge'?'#'+esc(p.absorb)+' into #'+esc(p.keep):'#'+esc(p.id)+' '+esc(p.name||p.brand||'')+(p.slug?' at /'+esc(p.slug)+'/':''))+'<div class="meta">'+esc(d.status)+' · '+esc(d.approved_by)+(d.result&&d.result.error?' · <span style="color:var(--bad)">'+esc(d.result.error)+'</span>':'')+'</div></div></div>'}).join('')+'</details>';
  // recent merges + history
  const merges=(data.merges||[]).map((u)=>'<div class="cu-row"><div>#'+u.absorbed_id+' '+esc((u.absorbed_brand?u.absorbed_brand+' ':'')+(u.absorbed_name||''))+' → #'+u.survivor_id+' '+esc((u.survivor_brand?u.survivor_brand+' ':'')+(u.survivor_name||''))+'<div class="meta">'+esc(u.actor)+' · '+ago(u.created_at)+(u.undone_at?' · undone':'')+'</div></div>'+(u.undone_at?'':'<span class="cu-acts"><button data-unmerge="'+u.id+'">Undo</button></span>')+'</div>').join('');
  const mergesHtml='<details class="cu"><summary>Recent merges ('+(data.merges||[]).length+')</summary>'+(merges||'<p class="meta">No merges yet.</p>')+'</details>';
  const hist=(data.history||[]);
  const histHtml='<details class="cu"><summary>Run history ('+hist.length+')</summary><table class="t"><thead><tr><th>Run</th><th>Mode</th><th>Status</th><th>Ticks</th><th>AI calls</th><th>Neurons</th><th>Errors</th></tr></thead><tbody>'
    +hist.map((h)=>'<tr><td><a href="#" data-curun="'+esc(h.id)+'">'+esc(h.id)+'</a></td><td>'+esc(h.mode)+'</td><td>'+esc(h.status)+(h.status==='running'?' · '+esc(h.phase):'')+'</td><td>'+h.ticks+'</td><td>'+h.ai_calls+' ('+h.cache_hits+' cached)</td><td>'+Math.round(h.neurons)+'</td><td>'+h.errors+'</td></tr>').join('')+'</tbody></table></details>';
  $('#view').innerHTML=CU_CSS+top+needsHtml+planHtml+doneHtml+errHtml+otherHtml+dirHtml+mergesHtml+histHtml;
  // wiring
  const say=(d)=>{$('#log').hidden=false;$('#log').textContent=JSON.stringify(d,null,1)};
  $('#cu-run').onclick=async()=>{$('#cu-run').disabled=true;try{say(await api('curator-run',{}))}catch(e){alert(e.message)}load()};
  $('#cu-dry').onclick=async()=>{$('#cu-dry').disabled=true;try{say(await api('curator-run',{mode:'dry',force:true}))}catch(e){alert(e.message)}load()};
  document.querySelectorAll('button[data-cus]').forEach((b)=>b.onclick=async()=>{
    if(b.dataset.cus==='curator_mode'&&b.dataset.v==='live'&&!confirm('Switch to live? The next runs apply changes as they go (each can be undone).'))return;
    try{await api('system',{k:b.dataset.cus,v:b.dataset.v});load()}catch(e){alert(e.message)}});
  $('#cu-cap-save').onclick=async()=>{try{await api('system',{k:'curator_neuron_cap',v:String(Math.round(+$('#cu-cap').value))});load()}catch(e){alert(e.message)}};
  const ap=$('#cu-apply');if(ap)ap.onclick=async()=>{if(!confirm('Apply this plan? The next curator ticks make these changes (Run now speeds it up).'))return;ap.disabled=true;try{say(await api('curator-apply',{run:ap.dataset.run}))}catch(e){alert(e.message)}load()};
  document.querySelectorAll('button[data-curevert]').forEach((b)=>b.onclick=async()=>{if(!confirm('Undo this change?'))return;b.disabled=true;try{say(await api('curator-revert',{actionId:+b.dataset.curevert}));load()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('button[data-cudismiss]').forEach((b)=>b.onclick=async()=>{b.disabled=true;try{await api('curator-dismiss',{actionId:+b.dataset.cudismiss});b.closest('.cu-row').remove()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('button[data-cumerge]').forEach((b)=>b.onclick=async()=>{if(!confirm('Merge these into one page? The absorbed page 301s to the one kept; you can undo it.'))return;b.disabled=true;try{await api('merge',{aId:+b.dataset.keep,bId:+b.dataset.drop});load()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('button[data-cureject]').forEach((b)=>b.onclick=async()=>{b.disabled=true;try{await api('reject-merge',{aId:+b.dataset.a,bId:+b.dataset.b});load()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('button[data-unmerge]').forEach((b)=>b.onclick=async()=>{if(!confirm('Undo this merge? The absorbed page comes back with its listings and address, and the pair is marked as not duplicates.'))return;b.disabled=true;try{say(await api('unmerge',{undoId:+b.dataset.unmerge}));load()}catch(e){alert(e.message);b.disabled=false}});
  document.querySelectorAll('a[data-cugo]').forEach((x)=>x.onclick=(e)=>{e.preventDefault();tab=x.dataset.cugo;F.page=1;markTab();load()});
  document.querySelectorAll('a[data-curun]').forEach((x)=>x.onclick=async(e)=>{e.preventDefault();try{data=await api('curator?run='+encodeURIComponent(x.dataset.curun));renderCurator()}catch(err){alert(err.message)}});
  $('#cu-dadd').onclick=async()=>{
    const k=$('#cu-dk').value,a=+$('#cu-d1').value,b=$('#cu-d2').value.trim(),c=$('#cu-d3').value.trim();
    const body=k==='merge'?{kind:k,keep:a,absorb:+b}:k==='rename'?{kind:k,id:a,name:b,slug:c}:{kind:k,id:a,brand:b};
    try{const d=await api('directive',body);alert('Queued. '+(d.note||''));load()}catch(e){alert(e.message)}};
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
  // The last 10 slice errors (the latest used to overwrite the one before).
  let ring='';try{const r=JSON.parse(s['job:errors']||'[]');if(r.length)ring='<details><summary class="meta" style="color:var(--bad)">last '+r.length+' slice errors</summary>'+r.map((e)=>'<p class="meta">'+ago(e.at)+': '+esc(e.msg)+'</p>').join('')+'</details>'}catch(e){}
  let cur='';try{const c=JSON.parse(s.curator_state||'null');cur='<p class="meta">AI curator: '+(s.curator_enabled==='0'?'<b style="color:var(--bad)">paused</b>':'<b>'+esc(s.curator_mode||'dry')+'</b> mode')+(c&&c.run?' · last run '+esc(c.run)+(c.active?' (running)':''):' · no run yet')+(s.curator_ai==='0'?' · AI off':'')+' · <a href="/admin?tab=curator">open the AI curator tab</a></p>'}catch(e){}
  $('#view').innerHTML='<p>'+tog('scan_paused','Daily scan')+' '+tog('enrich_paused','Enrich')+' '+tog('dedup_paused','Dedup')+' '+tog('classify_paused','Classify')+' '+tog('verify_paused','Verify')+' '+tog('warm_paused','Image backup')+' '+tog('popularity_paused','Popularity')+' '+tog('mfr_paused','Manufacturer harvest')+' <button class="no" disabled>URL discovery: PAUSED (by design)</button></p>'
    +cur+lastJob+lastErr+ring
    +'<p class="meta">scan cursor: <pre>'+esc(s.scan_cursor||'—')+'</pre></p>'
    +healthTable
    +'<h3>Recent audit</h3><table class="t"><tbody>'
    +data.audit.map((a)=>'<tr><td>'+new Date(a.at).toISOString().slice(0,16).replace('T',' ')+'</td><td>'+esc(a.actor)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.entity)+' '+esc(a.entity_id||'')+'</td></tr>').join('')
    +'</tbody></table>';
  document.querySelectorAll('button[data-set]').forEach((b)=>b.onclick=async()=>{await api('system',{k:b.dataset.set,v:b.dataset.v});load()});
}

readURL();markTab();load();
api('curator?brief=1').then((d)=>{$('#cu-needs').textContent=d.needs?String(d.needs):''}).catch(()=>{});
</script></body></html>`
