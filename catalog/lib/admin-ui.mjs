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
  <h1>Catalog <span style="opacity:.4;font-size:.7rem">v6</span></h1>
  <button class="on" data-tab="review">Review</button>
  <button data-tab="sources">Sources</button>
  <button data-tab="catalog">Catalog</button>
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
// Resolve against location.origin, NOT the document URL: if the page was
// opened as http://user:pass@host/admin the document base carries credentials
// and fetch() refuses to construct the request — the panel dies looking empty.
const api=async(p,body)=>{const r=await fetch(new URL('/api/'+p,location.origin),body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d};
let tab='review',F={status:'new',stock:'in',src:''},data=null;

document.querySelectorAll('header button[data-tab]').forEach((b)=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('header button[data-tab]').forEach((x)=>x.classList.toggle('on',x===b));load()});
$('#run').onclick=async()=>{$('#log').hidden=false;$('#log').textContent='running slice…';try{const d=await api('run',{});$('#log').textContent=JSON.stringify(d,null,1)}catch(e){$('#log').textContent=e.message}load()};

async function load(){
  $('#filters').style.display=tab==='review'?'flex':'none';
  try{
    if(tab==='review'){data=await api('review?status='+F.status+'&stock='+F.stock+'&src='+encodeURIComponent(F.src));renderFilters();renderReview()}
    if(tab==='sources'){data=await api('sources');renderSources()}
    if(tab==='catalog'){data=await api('catalog');renderCatalog()}
    if(tab==='system'){data=await api('system');renderSystem()}
  }catch(e){$('#view').innerHTML='<p class="empty">'+esc(e.message)+'</p>'}
}

// ------- Review -------
function renderFilters(){
  const c=data.counts;
  const btn=(grp,val,label,count)=>'<button class="chip '+(F[grp]===val?'on':'')+'" data-g="'+grp+'" data-v="'+val+'">'+label+(count!=null?' <span>'+(count??0)+'</span>':'')+'</button>';
  $('#filters').innerHTML=
    btn('status','new','New',c.new)+btn('status','flagged','Flagged',c.flagged)+btn('status','approved','Approved',c.approved)+btn('status','rejected','Rejected',c.rejected)
    +'<span style="width:10px"></span>'+btn('stock','in','In stock')+btn('stock','out','Not in stock')+btn('stock','all','Any')
    +'<span style="width:10px"></span>'+btn('src','','All sellers')+data.sources.map((s)=>btn('src',s.id,s.id)).join('');
  document.querySelectorAll('#filters .chip').forEach((b)=>b.onclick=()=>{F[b.dataset.g]=b.dataset.v;load()});
}
function skuRow(k){
  const stock=k.flagged?'<span class="unk">⚑ flagged: '+esc(JSON.parse(k.flagged).kind)+'</span>':k.quote_only?'<span class="unk">quote only</span>':k.in_stock===1?'':k.in_stock===0?'<span class="oos">out of stock</span>':'<span class="unk">stock unverified</span>';
  const sugg=(k.suggestions||[]).map((m)=>'<button class="chip" data-a="attach" data-sku="'+k.id+'" data-master="'+m.id+'">→ '+esc(m.brand+' '+m.name)+'</button>').join('');
  const mapUI=F.status==='new'?'<div class="map"><div class="sugg">'+(sugg||'<span class="tag">no master match — create one:</span>')+'</div>'
    +'<div class="fields"><input data-f="brand" value="'+esc(k.guess.brand)+'" placeholder="Brand"/><input data-f="name" value="'+esc(k.guess.name)+'" placeholder="Model name"/><input data-f="slug" value="'+esc(k.guess.slug)+'" placeholder="slug"/><select data-f="config">'+(((data.cat||{}).configs)||[]).map((c)=>'<option>'+esc(c)+'</option>').join('')+'</select>'
    +(data.specFields||[]).map((f)=>'<input data-f="spec:'+f.key+'" value="'+esc(k.guess.specs[f.key]??'')+'" placeholder="'+esc(f.label)+(f.required?' *':'')+'"/>').join('')
    +'</div></div>':'';
  const acts=F.status==='new'
    ?'<button class="ok" data-a="approve" data-sku="'+k.id+'">Approve new</button><button class="no" data-a="reject" data-sku="'+k.id+'" data-r="accessory">Accessory</button><button class="no" data-a="reject" data-sku="'+k.id+'" data-r="out-of-scope">Out of scope</button><button class="no" data-a="reject" data-sku="'+k.id+'" data-r="junk">Junk</button>'
    :F.status==='rejected'?'<button data-a="restore" data-sku="'+k.id+'">Restore</button>'
    :F.status==='approved'?'<button class="no" data-a="unapprove" data-sku="'+k.id+'">Un-approve</button>'
    :F.status==='flagged'?'<button class="ok" data-a="unflag" data-sku="'+k.id+'">Accept change</button><button class="no" data-a="unapprove" data-sku="'+k.id+'">Un-approve</button>':'';
  return '<div class="row" data-sku="'+k.id+'">'
    +(k.image_url?'<img class="thumb" loading="lazy" src="'+esc(k.image_url)+'" onerror="this.outerHTML=\\'<div class=noimg>no image</div>\\'"/>':'<div class="noimg">no image</div>')
    +'<div><p class="title">'+esc(k.title||'(untitled)')+' '+(k.score>0?'<span class="tag w">likely</span>':'<span class="tag">unsure</span>')+'</p>'
    +'<p class="meta"><span class="tag">'+esc(k.source_id)+'</span> '+(k.price_inr?'<span class="price">'+inr(k.price_inr)+'</span>':'no price')+' '+stock
    +(k.master?' · mapped to <b>'+esc(k.master)+'</b>':'')+' · <a href="'+esc(k.url_canonical)+'" target="_blank" rel="noopener">seller page ↗</a></p>'
    +mapUI+'</div><div class="acts">'+acts+'</div></div>';
}
function renderReview(){
  const rows=data.skus;
  $('#view').innerHTML=rows.length?rows.map(skuRow).join(''):'<p class="empty">Queue is clear.</p>';
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
      return '<tr><td style="min-width:120px"><span class="tag">'+esc(m.category_id)+'/'+esc(m.slug)+'</span></td>'
      +'<td>'+esc(m.status)+'</td><td>'+m.offers+' ('+m.live_offers+' live)</td>'
      +'<td style="min-width:280px">'+specIn+'<input class="inline" style="width:100%" data-m="'+m.id+'" data-f="blurb" value="'+esc(m.blurb||'')+'" placeholder="one-line blurb"/></td>'
      +'<td style="white-space:nowrap"><button data-mm="'+m.id+'" data-st="'+(m.status==='ready'?'draft':'ready')+'">'+(m.status==='ready'?'Unpublish':'Publish')+'</button> '
      +'<a class="tag" href="'+esc(m.path)+'" target="_blank">view ↗</a></td></tr>'}).join('')
    +'</tbody></table><p class="meta">Edit brand / name / wingspan / blurb inline — saves on blur. Publish requires the required specs (the API refuses otherwise).</p>';
  document.querySelectorAll('button[data-mm]').forEach((b)=>b.onclick=async()=>{try{await api('master',{id:+b.dataset.mm,status:b.dataset.st});load()}catch(e){alert(e.message)}});
  document.querySelectorAll('input[data-m]').forEach((i)=>i.onchange=async()=>{
    const id=+i.dataset.m,f=i.dataset.f,body={id};
    if(f.startsWith('spec:')){const row=data.masters.find((x)=>x.id===id);let sp={};try{sp=JSON.parse(row.specs||'{}')}catch(e){}sp[f.slice(5)]=i.value.trim();row.specs=JSON.stringify(sp);body.specs=row.specs}
    else body[f]=i.value;
    await api('master',body);
  });
}

// ------- System -------
function renderSystem(){
  const s=data.settings;
  const tog=(k,label)=>'<button data-set="'+k+'" data-v="'+(s[k]==='1'?'0':'1')+'" class="'+(s[k]==='1'?'no':'ok')+'">'+label+': '+(s[k]==='1'?'PAUSED':'running')+'</button>';
  $('#view').innerHTML='<p>'+tog('scan_paused','Daily scan')+' '+tog('verify_paused','Verify')+' <button class="no" disabled>URL discovery: PAUSED (by design)</button></p>'
    +'<p class="meta">scan cursor: <pre>'+esc(s.scan_cursor||'—')+'</pre></p>'
    +'<h3>Recent audit</h3><table class="t"><tbody>'
    +data.audit.map((a)=>'<tr><td>'+new Date(a.at).toISOString().slice(0,16).replace('T',' ')+'</td><td>'+esc(a.actor)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.entity)+' '+esc(a.entity_id||'')+'</td></tr>').join('')
    +'</tbody></table>';
  document.querySelectorAll('button[data-set]').forEach((b)=>b.onclick=async()=>{await api('system',{k:b.dataset.set,v:b.dataset.v});load()});
}

load();
</script></body></html>`
