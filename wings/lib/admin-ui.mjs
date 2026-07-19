// The admin panel, served by the Worker at /wings/admin (behind a token). This
// is the human approval gate: discovery proposes candidates, you approve here,
// and an approve writes straight to the live KV catalogue — no rebuild, no push.
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Wings admin</title>
<style>
:root{--bg:#0e1117;--fg:#e6edf3;--muted:#8b949e;--accent:#1f9bd9;--accent-bright:#3eb5e8;--card:#161b22;--border:#30363d;--ok:#3fb950;--bad:#f85149;--warn:#d29922}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:rgba(14,17,23,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
h1{font-size:1rem;margin:0}.stats{display:flex;gap:14px;font-size:.82rem;color:var(--muted)}.stats b{color:var(--fg)}.grow{flex:1}
button{font-family:inherit;font-size:.82rem;font-weight:600;cursor:pointer;border-radius:7px;border:1px solid var(--border);background:var(--card);color:var(--muted);padding:7px 12px}
button:hover{color:var(--fg);border-color:var(--accent)}button.on{background:var(--accent);border-color:var(--accent);color:#06222e}button.go{background:var(--accent-bright);border-color:var(--accent-bright);color:#06222e}
.wrap{max-width:940px;margin:0 auto;padding:18px 20px 80px}
.row{display:grid;grid-template-columns:132px 1fr auto;gap:16px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;align-items:start}
.row.likely{border-color:rgba(31,155,217,.4)}.row.gone{opacity:.35}
.thumb{width:132px;height:100px;background:#fff;border-radius:8px;object-fit:contain}
.noimg{width:132px;height:100px;background:#f2f2f2;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;font-size:.7rem}
.title{font-weight:600;font-size:.92rem;margin:0 0 4px}.meta{font-size:.74rem;color:var(--muted);margin:0 0 8px}.meta a{color:var(--accent-bright)}
.price{color:var(--ok);font-weight:700}.oos{color:var(--bad)}
.fields{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.fields input{background:var(--bg);border:1px solid var(--border);color:var(--fg);border-radius:6px;padding:6px 8px;font-family:inherit;font-size:.78rem;width:100%}
.fields input:focus{outline:none;border-color:var(--accent)}.fields .wide{grid-column:1/-1}
.acts{display:flex;flex-direction:column;gap:6px}.acts button{width:104px}.ok{background:var(--ok);border-color:var(--ok);color:#04260c}.no{border-color:rgba(248,81,73,.4);color:var(--bad)}
.tag{font-size:.6rem;text-transform:uppercase;letter-spacing:.05em;padding:1px 6px;border-radius:4px;border:1px solid var(--border);color:var(--muted)}.tag.w{color:var(--accent-bright);border-color:rgba(62,181,232,.4)}
#log{font-family:ui-monospace,monospace;font-size:.72rem;color:var(--muted);white-space:pre-wrap;padding:10px 20px;max-height:120px;overflow:auto}
.empty{text-align:center;color:var(--muted);padding:50px 0}
.srcbar{display:flex;gap:6px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--border);background:rgba(22,27,34,.5)}
.schip{font-size:.74rem;padding:5px 10px}.schip span{opacity:.55;margin-left:3px}.schip.on{background:var(--accent);border-color:var(--accent);color:#06222e}
.vdiv{width:1px;background:var(--border);align-self:stretch;margin:0 4px}
.unk{font-size:.6rem;color:var(--warn);border:1px solid rgba(210,153,34,.4);border-radius:4px;padding:1px 5px;margin-left:6px}
.gate{max-width:340px;margin:80px auto;text-align:center}.gate input{width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);font-size:1rem;margin:12px 0}
</style></head><body>
<div id="app"></div>
<script>
const TK='wingsAdminToken';let token=localStorage.getItem(TK)||'';let all=[],perSource=[],mode='likely',srcFilter='',stockF='in',limit=12;
const scoreOk=(c)=>mode==='all'||c.score>0;
// STRICT: "In stock" = verified purchasable only. Unknown stock and
// quote-only listings ("Request Quote") are NOT in stock.
const stockOk=(c)=>stockF==='all'||(stockF==='in'?c.inStock===true:c.inStock!==true);
const $=(s)=>document.querySelector(s);
const esc=(s)=>(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const api=(p,o={})=>fetch('/wings/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer '+token,...(o.headers||{})}});
function gate(msg){$('#app').innerHTML='<div class="gate"><h1>Wings admin</h1>'+(msg?'<p style="color:var(--bad)">'+msg+'</p>':'')+'<input id="tk" type="password" placeholder="Admin token" /><button class="go" onclick="setTok()">Enter</button></div>';}
window.setTok=()=>{token=$('#tk').value.trim();localStorage.setItem(TK,token);load();};
async function load(){
  const r=await api('candidates');
  if(r.status===401||r.status===403)return gate(token?'Wrong token.':'');
  if(r.status===503)return $('#app').innerHTML='<div class="gate"><h1>Admin not configured</h1><p style="color:var(--muted)">Set the WINGS_ADMIN_TOKEN secret on the Worker to enable approvals.</p></div>';
  const d=await r.json();all=d.pending;perSource=d.perSource||[];shell(d.counts);render();
}
function srcbar(){
  const el=$('#srcbar');if(!el)return;
  const base=all.filter((c)=>scoreOk(c)&&stockOk(c)); // counts reflect the active mode + stock filter
  const cnt=(id)=>base.filter((c)=>c.source===id).length;
  el.innerHTML='<button class="schip'+(srcFilter===''?' on':'')+'" data-s="">All sellers <span>'+base.length+'</span></button>'+perSource.map((s)=>'<button class="schip'+(srcFilter===s.id?' on':'')+'" data-s="'+s.id+'">'+s.id+' <span>'+cnt(s.id)+'</span></button>').join('');
  el.querySelectorAll('.schip').forEach((b)=>b.onclick=()=>{srcFilter=b.dataset.s;limit=12;srcbar();render()});
}
function shell(c){
  $('#app').innerHTML='<header><h1>Wings admin</h1><div class="stats"><span><b>'+c.live+'</b> live</span><span><b>'+c.pending+'</b> pending</span><span><b>'+c.likely+'</b> likely wings</span><span><b>'+c.rejected+'</b> rejected</span></div><span class="grow"></span><button id="fL" class="on">Likely wings</button><button id="fA">Everything</button><span class="vdiv"></span><button id="sIn" class="on">In stock</button><button id="sOut">Not in stock</button><button id="sAll">Any</button><span class="grow"></span><button id="disc" class="go">Run discovery</button></header><div class="srcbar" id="srcbar"></div><div id="log"></div><div class="wrap"><div id="list"></div></div>';
  const on=(id,grp)=>grp.forEach((x)=>$('#'+x).classList.toggle('on',x===id));
  $('#fL').onclick=()=>{mode='likely';limit=12;on('fL',['fL','fA']);srcbar();render()};
  $('#fA').onclick=()=>{mode='all';limit=12;on('fA',['fL','fA']);srcbar();render()};
  $('#sIn').onclick=()=>{stockF='in';limit=12;on('sIn',['sIn','sOut','sAll']);srcbar();render()};
  $('#sOut').onclick=()=>{stockF='out';limit=12;on('sOut',['sIn','sOut','sAll']);srcbar();render()};
  $('#sAll').onclick=()=>{stockF='all';limit=12;on('sAll',['sIn','sOut','sAll']);srcbar();render()};
  $('#disc').onclick=async()=>{$('#log').textContent='crawling root links…';const d=await(await api('discover',{method:'POST'})).json();$('#log').textContent=(d.stats||[]).map((s)=>s.source+': '+s.total+' products, '+s.fresh+' new'+(s.errors&&s.errors.length?'  ✗ '+s.errors.join('; '):'')).join('\\n')+'\\n\\n'+(d.foundCount||0)+' new candidates.';load()};
  srcbar();
}
function render(){
  const pool=all.filter((c)=>scoreOk(c)&&stockOk(c)&&(!srcFilter||c.source===srcFilter));const rows=pool.slice(0,limit);
  if(!rows.length){$('#list').innerHTML='<p class="empty">Nothing to review. Hit <b>Run discovery</b>.</p>';return}
  $('#list').innerHTML=rows.map((c)=>'<div class="row '+(c.score>0?'likely':'')+'" data-url="'+esc(c.url)+'"><img class="thumb" loading="lazy" src="'+(c.img?esc(c.img):'/wings/api/img?u='+encodeURIComponent(c.url))+'" data-proxy="'+(c.img?'/wings/api/img?img='+encodeURIComponent(c.img)+'&u='+encodeURIComponent(c.url):'')+'" /><div><p class="title">'+esc(c.title)+' '+(c.score>0?'<span class="tag w">likely wing</span>':'<span class="tag">unsure</span>')+'</p><p class="meta"><span class="tag">'+esc(c.source)+'</span> '+(c.priceINR?'<span class="price">₹'+c.priceINR.toLocaleString('en-IN')+'</span>':'<span>no price</span>')+(c.quoteOnly?' <span class="unk">quote only — not buyable online</span>':c.inStock===false?' <span class="oos">out of stock</span>':c.inStock==null?' <span class="unk">stock unverified</span>':'')+' · <a href="'+esc(c.url)+'" target="_blank" rel="noopener">open seller page ↗</a></p><div class="fields"><input data-f="brand" value="'+esc(c.guess.brand)+'" placeholder="Brand" /><input data-f="name" value="'+esc(c.guess.name)+'" placeholder="Name" /><input data-f="spanMM" value="'+esc(String(c.guess.spanMM))+'" placeholder="Span mm" /><input data-f="slug" value="'+esc(c.guess.slug)+'" placeholder="slug" /><input data-f="blurb" class="wide" placeholder="One line: what it is (e.g. 1000mm EPP flying-wing kit, PNP)" /></div></div><div class="acts"><button class="ok" data-a="approve">Approve</button><button class="no" data-a="reject">Reject</button></div></div>').join('')+(pool.length>rows.length?'<p class="empty"><button id="more">Show more ('+(pool.length-rows.length)+' left)</button></p>':'');
  const m=$('#more');if(m)m.onclick=()=>{limit+=12;render()};
}
// Thumbnail fallback: seller feed image -> og:image proxy -> "no image".
// Delegated + capture (img error events don't bubble).
document.addEventListener('error',(e)=>{
  const t=e.target;if(!(t.classList&&t.classList.contains('thumb')))return;
  if(t.dataset.tried||!t.dataset.proxy){const d=document.createElement('div');d.className='noimg';d.textContent='no image';t.replaceWith(d)}
  else{t.dataset.tried='1';t.src=t.dataset.proxy}
},true);
document.addEventListener('click',async(e)=>{
  const b=e.target.closest('button[data-a]');if(!b)return;
  const row=b.closest('.row'),body={url:row.dataset.url,decision:b.dataset.a};
  if(body.decision==='approve'){row.querySelectorAll('input').forEach((i)=>body[i.dataset.f]=i.value.trim());if(!body.brand||!body.name||!body.slug)return alert('Brand, name and slug are required.');if(!body.spanMM)return alert('Wingspan is required — check the seller page.')}
  b.disabled=true;const r=await api('decide',{method:'POST',body:JSON.stringify(body)});const d=await r.json();
  if(!r.ok){alert(d.error||'failed');b.disabled=false;return}
  row.classList.add('gone');setTimeout(()=>{row.remove();load()},220);
});
token?load():gate();
</script></body></html>`
