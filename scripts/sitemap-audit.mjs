// Local, read-only sitemap coverage gate across the four release checkouts.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
const apps=resolve(process.env.SITE_THEME_ROOT || '../site-theme-work');
const surfaces=[
 {name:'Website and Wings',root:resolve('site'),base:'https://www.narenana.com',local:'http://localhost:8787'},
 {name:'Nanawing',root:join(apps,'fpvsim/public'),entry:join(apps,'fpvsim/index.html'),base:'https://sim.narenana.com',local:'http://localhost:8788'},
 {name:'Nanawing 2',root:join(apps,'nanawing2/public'),entry:join(apps,'nanawing2/index.html'),base:'https://nanawing2.narenana.com',local:'http://localhost:8789'},
 {name:'Log viewer',root:join(apps,'log-viewer/public'),entry:join(apps,'log-viewer/index.html'),base:'https://www.narenana.com/log-viewer',local:'http://localhost:8790'},
];
async function htmlFiles(root){
 const out=[];
 for(const e of await readdir(root,{withFileTypes:true})){
  if(e.isDirectory()) out.push(...await htmlFiles(join(root,e.name)));
  else if(e.name.endsWith('.html')) out.push(join(root,e.name));
 }
 return out;
}
const errors=[], reports=[];
for(const surface of surfaces){
 try{
  const response=await fetch(surface.local+'/sitemap.xml',{signal:AbortSignal.timeout(20000)});
  const xml=await response.text();
  if(response.status!==200 || !xml.includes('<urlset')) throw Error('Sitemap must return a 200 XML URL set');
  const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1].replaceAll('&amp;','&'));
  const unique=new Set(urls);
  if(!urls.length || unique.size!==urls.length) errors.push(surface.name+': empty or duplicate inventory');
  for(const url of urls){
   const u=new URL(url);
   if(!url.startsWith(surface.base+'/') || u.search || u.hash || /\/(?:admin|api|stats|radio-bridge)(?:[/.]|$)/.test(u.pathname)) errors.push('Unexpected sitemap URL: '+url);
  }
  for(const [,date] of xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || date>new Date().toISOString().slice(0,10)) errors.push('Invalid/future lastmod: '+date);
  }
  const robotsResponse=await fetch(surface.local+'/robots.txt');
  const robots=await robotsResponse.text();
  if(robotsResponse.status!==200 || !robots.includes('Sitemap: '+surface.base+'/sitemap.xml')) errors.push(surface.name+': missing robots discovery');
  const files=await htmlFiles(surface.root);
  if(surface.entry)files.push(surface.entry);
  let expected=0;
  for(const file of files){
   const html=await readFile(file,'utf8');
   if(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html))continue;
   const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
   if(canonical?.startsWith(surface.base+'/')){
    expected++;
    if(!unique.has(canonical))errors.push('Missing canonical page: '+canonical+' ('+file+')');
   }
  }
  reports.push({name:surface.name,sitemap:surface.base+'/sitemap.xml',urls:urls.length,staticCanonicalPages:expected});
 }catch(e){errors.push(surface.name+': '+e.message);}
}
const result={checkedAt:new Date().toISOString(),reports,errors};
await writeFile('docs/sitemap-readiness.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
