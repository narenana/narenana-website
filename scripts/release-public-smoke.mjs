// Read-only checks of existing public services. This does not deploy, submit
// forms, publish scores, trigger jobs or modify production data.
import {writeFile} from 'node:fs/promises';
const checks=[
 ['website','https://www.narenana.com/',200],
 ['catalog','https://www.narenana.com/wings/',200],
 ['feed','https://www.narenana.com/videos.json',200],
 ['log viewer','https://www.narenana.com/log-viewer/',200],
 ['FPV','https://sim.narenana.com/',200],
 ['LOS','https://nanawing2.narenana.com/',200],
 ['admin authentication','https://www.narenana.com/admin',401],
 ['review API authentication','https://www.narenana.com/api/review',401],
 ['missing route','https://www.narenana.com/release-check-missing-20260924/',404],
];
const results=[];
for(const [name,url,expected] of checks){
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(25000)});
  const body=await r.text();
  const row={name,url,status:r.status,expected,ok:r.status===expected};
  if(name==='feed'){
   const data=JSON.parse(body);
   row.feedEntries=Array.isArray(data)?data.length:(data.videos||data.items||[]).length;
   row.ok &&= row.feedEntries>0;
  }
  results.push(row);
 }catch(e){results.push({name,url,ok:false,error:e.message});}
}
const report={checkedAt:new Date().toISOString(),scope:'Existing production only; candidate is local and not deployed',results};
await writeFile('docs/release-public-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
