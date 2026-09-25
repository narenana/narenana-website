// Serve built product apps locally with the same extensionless static routes as Pages.
import http from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import {resolve,join,extname,sep} from 'node:path'
const base=resolve(process.argv[2] || '../site-theme-work')
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain','.glb':'model/gltf-binary'}
for(const [app,port] of [['fpvsim',8788],['nanawing2',8789],['log-viewer',8790]]){
  const root=join(base,app,'dist')
  http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname)
      const target=resolve(root,'.'+path)
      if(target!==root&&!target.startsWith(root+sep)){res.writeHead(400).end();return}
      const candidates=[target,join(target,'index.html'),target+'.html']
      let file
      for(const candidate of candidates)if((await stat(candidate).catch(()=>null))?.isFile()){file=candidate;break}
      const status=file?200:404
      file ||= join(root,'404.html')
      const body=await readFile(file).catch(()=>Buffer.from('Page not found'))
      res.writeHead(status,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'})
      res.end(req.method==='HEAD'?undefined:body)
    }catch{res.writeHead(400).end('Invalid request')}
  }).listen(port,'127.0.0.1',()=>console.log(`${app}: http://localhost:${port}/`))
}
