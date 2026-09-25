import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {handleStats} from '../src/stats.js';
const root=resolve('site');
const snapshot=()=>JSON.stringify({v:1,generatedAt:Date.now(),windowDays:28,...Object.fromEntries(['ga','gsc','cf','lastcall','nanawing','youtube'].map(k=>[k,{error:'Local preview: live service is not connected'}]))});
const assets={fetch:async request=>{const url=new URL(request.url),path=resolve(root,'.'+url.pathname);if(!path.startsWith(root+sep))return new Response('',{status:404});try{return new Response(await readFile(path),{headers:{'content-type':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'application/octet-stream'}})}catch{return new Response('',{status:404})}}};
const env={STATS_BASIC_PASS:'devpass',VIDEOS_KV:{get:async()=>snapshot()},ASSETS:assets};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1:8792');const request=new Request(url,{headers:req.headers,method:req.method});const response=url.pathname.startsWith('/stats')?await handleStats(request,env,{waitUntil:()=>{}},url):await assets.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.writeHead(500);res.end(String(e));}}).listen(8792,'127.0.0.1',()=>console.log('Local stats fixture on 8792; no upstream calls'));
