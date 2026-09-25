import {readFileSync,writeFileSync} from 'node:fs';
const rows=JSON.parse(readFileSync('docs/seo-local-crawl.json','utf8')).results;
const map=u=>u.replace('https://www.narenana.com/log-viewer','http://localhost:8790').replace('https://sim.narenana.com','http://localhost:8788').replace('https://nanawing2.narenana.com','http://localhost:8789').replace('https://www.narenana.com','http://localhost:8787').replace('https://narenana.com','http://localhost:8787');
// Same floor as seo-audit.mjs: the sitemap is in-stock only, so it moves with stock.
if(rows.length<Number(process.env.SEO_MIN_URLS || 150))throw new Error('Sitemap inventory too small; run seo-audit first');
const links=new Map();let i=0;
await Promise.all(Array.from({length:6},async()=>{while(i<rows.length){const row=rows[i++];const h=await(await fetch(map(row.url))).text();for(const m of h.matchAll(/<a\b[^>]*href=["']([^"']+)/g)){try{const u=new URL(m[1].replaceAll('&amp;','&'),row.url);if(!['www.narenana.com','narenana.com','sim.narenana.com','nanawing2.narenana.com'].includes(u.hostname)||u.pathname.includes('$'))continue;u.hash='';if(!links.has(u.href))links.set(u.href,row.url)}catch{}}}}));
const entries=[...links];i=0;const bad=[];await Promise.all(Array.from({length:6},async()=>{while(i<entries.length){const [url,from]=entries[i++];try{const r=await fetch(map(url),{signal:AbortSignal.timeout(20000)});if(!r.ok)bad.push({url,from,status:r.status});await r.body.cancel()}catch(e){bad.push({url,from,error:e.message})}}}));
const out={pages:rows.length,links:entries.length,bad};writeFileSync('docs/release-link-audit.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));

if(bad.length)process.exitCode=1;
