// Shared presentation for the Nanawing 2 activity panel. Vendored into narenana-website.
// Uses the host dashboard's escaped chart/table helpers and selected product API routing.
export const PLAY_PANEL = String.raw`
<section class="tab" id="tab-play" role="tabpanel" hidden>
<div class="chips sm" id="playChips" role="group" aria-label="Play window" style="margin-top:16px"><button data-d="14">14 d</button><button data-d="30">30 d</button><button data-d="90">90 d</button></div>
<div class="charts">
  <div class="panel"><div class="ptitle">Free flight and landing challenge <span class="psub" id="subPlay">production launches · selected UTC window</span></div><div id="chPlay"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Landing grades <span class="psub">completed landings · calm challenge · rules v1</span></div><div id="chLandingGrades"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Touchdown quality <span class="psub">first-contact distance and descent · final bounce and outcome</span></div><div id="chLandingQuality"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Grades by aircraft and controls</div><div id="chLandingAircraft"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Landing grades per day <span class="psub">UTC · today is partial</span></div><div id="chLandingDays"><div class="chload">Loading…</div></div></div>
</div>
</section>`;

export const PLAY_SCRIPT = String.raw`
var playDays=30,playRequest=0;
var playPanels=["chPlaySummary","chPlay","chLandingGrades","chLandingQuality","chLandingAircraft","chLandingDays"];
function playTable(headers,rows){return '<div class="perfwrap"><table class="perf"><thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+esc(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
function playDecimal(n){return n==null?'—':Number(n).toFixed(2);}
function renderPlay(d){
  var modes=d.modes||[],pilots=d.pilots||{},q=d.quality||{},grades=d.grades||[];
  var modeRows=['free-flight','landing-challenge'].map(function(mode){var m=modes.find(function(x){return x.activity===mode;})||{};return [mode==='free-flight'?'Free flight':'Landing challenge',fmtN(m.pilots||0),fmtN(m.flights||0),fmtN(m.sessions||0)];});
  el('subPlaySummary').textContent='last '+d.days+' days · UTC';
  ok('chPlaySummary','<div class="grid">'+
    tile('Free-flight pilots',modeRows[0][1],modeRows[0][2]+' launches')+
    tile('Challenge pilots',modeRows[1][1],modeRows[1][2]+' launches')+
    tile('Completed landings',fmtN(q.landings||0),grades.map(function(g){return esc(g.grade)+': '+fmtN(g.landings);}).join(' · '))+
    '</div><p class="callout">Anonymous browser identities, with IP fallback; '+esc(fmtN(pilots.both||0))+' flew both modes.</p>');
  var fallback=modes.reduce(function(n,m){return n+(m.fallback_flights||0);},0);
  var unidentified=modes.reduce(function(n,m){return n+(m.unidentified_flights||0);},0);
  el('subPlay').textContent=d.from+' to '+d.to+' · production launches';
  ok('chPlay',playTable(['Mode','Unique pilots','Launches','Page sessions'],modeRows)+
    '<p>'+esc(fmtN(pilots.pilots||0))+' unique pilots: '+esc(fmtN(pilots.free_only||0))+' free flight only, '+esc(fmtN(pilots.challenge_only||0))+' challenge only, '+esc(fmtN(pilots.both||0))+' flew both.</p>'+
    '<p class="callout">Pilots are anonymous browsers, with a salted IP fallback when storage is unavailable. One person can appear on multiple devices or domains. Mode counts overlap; the total counts each identity once. Page sessions are page loads that launched.</p>'+
    '<p class="callout">'+esc(fmtN(fallback))+' launches used fallback identity, including '+esc(fmtN(unidentified))+' without a usable identity. '+esc(fmtN(d.unknown_flights||0))+' older or unclassified launches are excluded from the mode split.</p>'+
    '<p class="callout">'+(d.coverage_since?'Mode recording began '+esc(new Date(d.coverage_since).toISOString().slice(0,10))+'.':'No mode events received yet.')+' Offline events may arrive later. Blocked analytics and cleared storage can leave gaps.</p>');
  var attempts=d.attempts||[],count=function(s){return (attempts.find(function(x){return x.status===s;})||{}).attempts||0;};
  ok('chLandingGrades',playTable(['Grade','Landings','Share','Pilots'],['A','B','C'].map(function(g){var r=grades.find(function(x){return x.grade===g;})||{};return [g,fmtN(r.landings||0),pc(q.landings?(r.landings||0)/q.landings*100:null),fmtN(r.pilots||0)];}))+
    '<p>'+esc(fmtN(count('complete')))+' completed · '+esc(fmtN(count('interrupted')))+' interrupted during touchdown · '+esc(fmtN(count('observing')))+' awaiting a final result.</p>'+
    '<p class="callout">'+esc(fmtN(d.challenge_flights_without_touchdown||0))+' challenge launches have no recorded touchdown yet. They include ongoing flights and retries before landing. Only completed results enter grades; pilots may earn several grades.</p>'+
    '<p class="callout">A: within 3 m, descent at most 0.6 m/s, no bounce. B: within 8 m, at most 1.5 m/s, at most one bounce. The weakest criterion sets the grade; crashes and off-runway arrivals are C. A hard arrival cannot earn A.</p>');
  ok('chLandingQuality',playTable(['Measure','Result','Samples'],[
    ['Average distance from target',playDecimal(q.distance_avg)+' m',fmtN(q.distance_samples||0)],
    ['Average downward speed',playDecimal(q.descent_avg)+' m/s',fmtN(q.descent_samples||0)],
    ['Average bounces',playDecimal(q.bounces_avg),fmtN(q.landings||0)],
    ['No bounce',pc(q.landings?q.no_bounce/q.landings*100:null),fmtN(q.landings||0)],
    ['Crashes',fmtN(q.crashes||0),fmtN(q.landings||0)],
    ['Off runway',fmtN(q.off_runway||0),fmtN(q.landings||0)]
  ])+'<p class="callout">Missing measurements are excluded from averages. Crash and off-runway counts can overlap.</p>');
  var names={'sky-surfer':'NanaSurfer',nanajet:'NanaJet',nana3d:'Nana3D',nanatrainer:'NanaTrainer',nanasoar:'NanaSoar',nanaedge:'NanaEdge',nanadelta:'NanaDelta',nanaracer:'NanaRacer'};
  ok('chLandingAircraft',(d.aircraft||[]).length?playTable(['Aircraft','Controls','Landings','A','B','C','Avg distance (m)','Avg descent (m/s)','Avg bounces'],d.aircraft.map(function(r){return [Object.prototype.hasOwnProperty.call(names,r.aircraft)?names[r.aircraft]:r.aircraft,r.input,fmtN(r.landings),fmtN(r.a),fmtN(r.b),fmtN(r.c),playDecimal(r.distance_avg),playDecimal(r.descent_avg),playDecimal(r.bounces_avg)];})):'<p>No completed challenge landings in this window.</p>');
  ok('chLandingDays',(d.daily||[]).length?playTable(['Day (UTC)','Landings','A','B','C'],d.daily.map(function(r){return [r.day,fmtN(r.landings),fmtN(r.a),fmtN(r.b),fmtN(r.c)];})):'<p>No completed challenge landings in this window.</p>');
}
async function loadPlay(){
  if(SIM!=='nanawing2')return;
  var request=++playRequest;
  try{var d=await getJson('/play-summary?days='+playDays);if(request!==playRequest)return;renderPlay(d);staleMark(playPanels,d);}
  catch(e){if(request!==playRequest)return;playPanels.forEach(function(id){fail(id,'Play metrics unavailable ('+e.message+').');});}
}
`;
