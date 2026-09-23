// Fetch the OFL Google Fonts used by the approved homepage for same-origin use.
import {mkdirSync,writeFileSync} from 'node:fs'
const dir='site/assets/family';mkdirSync(dir,{recursive:true})
const url='https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}})
if(!response.ok)throw Error(response.status)
const css=await response.text(), blocks=[...css.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/g)]
let local='/* Self-hosted Latin fonts; OFL notices accompany these files. */\n'
const sources=[]
for(const [,block] of blocks){const family=/font-family: '([^']+)'/.exec(block)[1],weight=/font-weight: ([^;]+)/.exec(block)[1],source=/url\(([^)]+)\)/.exec(block)[1];const name=family.replaceAll(' ','')+'-'+weight.replaceAll(' ','-')+'.woff2';const r=await fetch(source);if(!r.ok)throw Error(source);writeFileSync(dir+'/'+name,Buffer.from(await r.arrayBuffer()));local+=block.replace(source,'./'+name)+'\n';sources.push({family,weight,file:name,source})}
for(const family of ['barlowcondensed','dmsans','jetbrainsmono']){const r=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`);if(!r.ok)throw Error(family);writeFileSync(`${dir}/${family}-OFL.txt`,await r.text())}
writeFileSync(dir+'/fonts.css',local);writeFileSync(dir+'/font-sources.json',JSON.stringify(sources,null,2)+'\n');console.log('Downloaded '+blocks.length+' self-hosted font faces with licences.')
