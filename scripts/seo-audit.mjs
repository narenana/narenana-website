// Read-only production inventory audit. Does not change or submit anything.
import { writeFileSync, mkdirSync } from 'node:fs'
const maps = ['https://www.narenana.com/sitemap.xml', 'https://www.narenana.com/log-viewer/sitemap.xml', 'https://sim.narenana.com/sitemap.xml', 'https://nanawing2.narenana.com/sitemap.xml']
const local = process.argv.includes('--local')
const localUrl = url => url.replace('https://www.narenana.com/log-viewer', 'http://localhost:8790').replace('https://sim.narenana.com', 'http://localhost:8788').replace('https://nanawing2.narenana.com', 'http://localhost:8789').replace('https://www.narenana.com', 'http://localhost:8787')
const get = async url => {
  const r = await fetch(local ? localUrl(url) + (url.includes('?') ? '&' : '?') + 'audit=share2' : url, { signal: AbortSignal.timeout(20000) })
  return { status: r.status, url: r.url, headers: r.headers, html: await r.text() }
}
const inventories = await Promise.all(maps.map(async url => {
  try { const r = await get(url); return {url, status:r.status, urls:[...r.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1].replaceAll('&amp;','&'))} }
  catch(e) { return {url,error:e.message,urls:[]} }
}))
const urls = [...new Set(inventories.flatMap(i=>i.urls))]
let next = 0
const results = []
await Promise.all(Array.from({length:6}, async () => {
  while(next < urls.length) {
    const url = urls[next++]
    try {
      const r = await get(url)
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.html)?.[1]?.trim()
      const canonical = /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i.exec(r.html)?.[1]
      const description = /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)/i.exec(r.html)?.[1]
      const meta = name => [...r.html.matchAll(/<meta\b[^>]*>/gi)].find(m=>new RegExp('(?:name|property)=["\']'+name+'["\']').test(m[0]))?.[0].match(/content=["']([^"']*)/)?.[1]
      const social = Object.fromEntries(['og:title','og:description','og:image','og:url','twitter:card'].map(k=>[k,meta(k)]))
      const shareScript = r.html.includes('preview-links') || r.html.includes('/assets/index-')
      const h1 = (r.html.match(/<h1\b/gi)||[]).length
      const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(r.html) || (!local && /noindex/i.test(r.headers.get('x-robots-tag')||''))
      let schemaErrors = 0
      for(const m of r.html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{JSON.parse(m[1])}catch{schemaErrors++}
      results.push({url,status:r.status,finalUrl:r.url,title,description,canonical,social,shareScript,h1,noindex,schemaErrors,htmlBytes:Buffer.byteLength(r.html)})
    }catch(e){results.push({url,error:e.message})}
  }
}))
results.sort((a,b)=>a.url.localeCompare(b.url))
mkdirSync('docs', {recursive:true})
writeFileSync(local ? 'docs/seo-local-crawl.json' : 'docs/seo-production-crawl.json',JSON.stringify({checkedAt:new Date().toISOString(),inventories,results},null,2)+'\n')
const issues=results.filter(r=>r.error||r.status!==200||!r.title||!r.description||!r.canonical||r.canonical!==r.url||r.noindex||r.schemaErrors||r.h1!==1||Object.values(r.social||{}).some(v=>!v)||r.social?.['og:url']!==r.canonical)
console.log(JSON.stringify({urls:urls.length,completed:results.length,issues},null,2))
