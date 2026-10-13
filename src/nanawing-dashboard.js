// VENDORED from fpvsim-stats-work/stats-worker/src/dashboard.js (2026-10-13) to unify stats at
// www.narenana.com/stats/nanawing. Served by this worker (gated, src/stats.js); its public
// workers.dev home redirects here. ONLY change vs upstream: simQ() prepends the absolute
// fpvsim-stats API base so the client fetches cross-origin (CORS *) instead of same-origin.
// Re-sync from upstream by re-copying and re-applying that one-line simQ edit.
//
// The stats dashboard page (its own module since 2026-09 so routes and page change independently).
// One page, no framework, no CDN, strict CSP (inline style + script only), inline SVG charts.
// SECURITY: telemetry strings (gpu, os, browser, wing ids, examples…) are CLIENT-SUPPLIED and the ingest
// endpoints are public. esc() is the ONLY path into innerHTML — every string, server-generated labels
// included, goes through it. Chart helpers take numbers only.
// HONESTY: every panel says what it counts (real players / raw counter), its window, and its caveat; a
// route failure keeps the panel's last render and marks it stale, never a blank or a zero.
// String.raw so the regexes below keep single backslashes; the page must not contain a backtick or "${".
export const DASHBOARD = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Nanawing · flight stats</title>
<style>
:root{--ink:#0e1117;--surf:#161b22;--bd:#30363d;--tx:#e6edf3;--mut:#8b949e;--dim:#6b7480;--grid:#232b36;--axis:#39424e;--blue:#1f9bd9;--bluehi:#3eb5e8;--osd:#62e58a;--amber:#e3a83a;--red:#f0616d;--vio:#b58cf5}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--tx);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:860px;margin:0 auto;padding:56px 22px 80px}
.head{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.head .name{font-size:26px;font-weight:800;letter-spacing:-.01em}
.head .sub{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--mut);margin-top:5px}
h1{font-size:clamp(26px,5vw,38px);font-weight:800;letter-spacing:-.02em;margin:.4em 0 .1em}
h2{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);margin:38px 0 0;display:flex;align-items:center;gap:12px}
h2:after{content:"";flex:1;height:1px;background:var(--bd)}
.lede{color:#c9d4e0;max-width:60ch;margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:30px}
.tile{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:20px;min-width:0}
.sims{display:flex;gap:8px;margin:0 0 14px}
.sims button{background:var(--surf);border:1px solid var(--bd);color:var(--mut);border-radius:10px;padding:7px 13px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:baseline;gap:7px}
.sims button span{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.sims button[aria-selected="true"]{color:var(--tx);border-color:var(--blue);background:rgba(31,155,217,.1)}
.sims button:hover{color:var(--tx)}
.tile .k{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.tile .v{font-size:38px;font-weight:800;letter-spacing:-.02em;margin-top:8px;font-variant-numeric:tabular-nums;line-height:1.1}
.tile .v.blue{color:var(--bluehi)} .tile .v.good{color:var(--osd)}
.tile .u{font-size:13px;color:var(--mut);margin-top:2px}
.bar{height:8px;border-radius:5px;background:#0d131c;border:1px solid var(--bd);overflow:hidden;margin-top:12px;display:flex}
.bar i{display:block;height:100%} .bar .land{background:var(--osd)} .bar .crash{background:var(--red)}
.charts{margin-top:16px;display:grid;gap:16px}
.panel{background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:18px 18px 12px;min-width:0}
.ptitle{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;font-size:13.5px;font-weight:700;letter-spacing:.01em;color:var(--tx);margin-bottom:10px}
.psub{font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--mut);font-variant-numeric:tabular-nums;text-align:right}
.pill{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--osd);border:1px solid rgba(98,229,138,.35);background:rgba(98,229,138,.08);border-radius:20px;padding:1px 7px;margin-left:6px;vertical-align:middle;cursor:help}
.pill.raw{color:var(--amber);border-color:rgba(227,168,58,.35);background:rgba(227,168,58,.08)}
.pill.stale{color:var(--red);border-color:rgba(240,97,109,.35);background:rgba(240,97,109,.08)}
.chart{width:100%;position:relative}
.chart svg{display:block;width:100%;height:auto}
.chart rect.col{transition:opacity .1s}
.chload,.cherr,.empty{color:var(--mut);font-size:13px;padding:30px 4px;text-align:center}
.cherr{color:var(--red)}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 0}
.chips button{font:inherit;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--mut);background:#0d131c;border:1px solid var(--bd);border-radius:20px;padding:4px 12px;cursor:pointer}
.chips button:hover{color:var(--tx);border-color:#4b5563}
.chips button[aria-pressed="true"]{color:#06222e;background:var(--bluehi);border-color:var(--bluehi)}
.chips button:focus-visible{outline:2px solid var(--bluehi);outline-offset:2px}
.chips.sm{margin:0} .chips.sm button{font-size:11px;padding:2px 9px}
table.perf{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums}
table.perf th{font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);text-align:left;padding:5px 8px;border-bottom:1px solid var(--bd);white-space:nowrap}
table.perf td{padding:6px 8px;border-bottom:1px solid var(--grid);color:#c9d4e0;white-space:nowrap}
table.perf td.n{text-align:right} table.perf th.n{text-align:right}
table.perf td.gpu{max-width:210px;overflow:hidden;text-overflow:ellipsis;color:var(--tx)}
table.perf td.hd{color:var(--tx);font-weight:600}
table.perf .fps-good{color:var(--osd)} table.perf .fps-mid{color:var(--amber)} table.perf .fps-bad{color:var(--red)}
table.perf tr.dimrow td{color:var(--dim)}
table.perf details{display:inline} table.perf summary{cursor:pointer;color:var(--bluehi);list-style:none;font-weight:600}
table.perf summary::-webkit-details-marker{display:none}
table.perf .ex{display:block;white-space:normal;color:var(--mut);font-size:11.5px;max-width:520px;margin-top:4px}
.perfwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.cell{display:inline-block;min-width:52px;text-align:center;border-radius:6px;padding:2px 6px;font-weight:700}
.c-good{background:rgba(98,229,138,.16);color:var(--osd)} .c-mid{background:rgba(227,168,58,.18);color:var(--amber)} .c-bad{background:rgba(240,97,109,.18);color:var(--red)} .c-na{color:var(--dim)}
.vd{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:6px;padding:2px 6px}
.vd-locked{color:var(--osd);background:rgba(98,229,138,.12)} .vd-playable{color:#9ecbff;background:rgba(158,203,255,.12)} .vd-under{color:var(--amber);background:rgba(227,168,58,.14)} .vd-over{color:var(--red);background:rgba(240,97,109,.14)} .vd-floor{color:var(--red);background:rgba(240,97,109,.22)} .vd-thin,.vd-excluded{color:var(--dim);background:rgba(107,116,128,.14)}
.bl{display:grid;gap:7px;margin:4px 0 10px}
.bl .row{display:grid;grid-template-columns:minmax(90px,150px) 1fr auto;gap:10px;align-items:center;font-size:12.5px;font-variant-numeric:tabular-nums}
.bl .lab{color:var(--tx);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bl .trk{height:10px;background:#0d131c;border:1px solid var(--bd);border-radius:5px;overflow:hidden;position:relative}
.bl .trk i{display:block;height:100%;position:absolute;left:0;top:0}
.bl .val{color:var(--mut);white-space:nowrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px} @media (max-width:640px){.two{grid-template-columns:1fr}}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--mut);margin:2px 0 6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.callout{font-size:13px;color:#c9d4e0;background:#0d131c;border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin:6px 0 10px}
.callout b{color:var(--tx)}
ul.ins{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.ins li{font-size:13.5px;color:#c9d4e0;padding:10px 12px;background:#0d131c;border:1px solid var(--bd);border-radius:10px;border-left:3px solid var(--bluehi)}
ul.ins li.warn{border-left-color:var(--red)} ul.ins li.good{border-left-color:var(--osd)} ul.ins li.note{border-left-color:var(--amber)}
ul.ins li b{color:var(--tx)} ul.ins li .why{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.tabs{display:flex;flex-wrap:wrap;gap:4px;margin:30px 0 0;border-bottom:1px solid var(--bd)}
.tabs button{font:inherit;font-size:13px;font-weight:700;letter-spacing:.02em;color:var(--mut);background:none;border:0;border-bottom:2px solid transparent;padding:10px 14px;margin-bottom:-1px;cursor:pointer;white-space:nowrap}
.tabs button:hover{color:var(--tx)}
.tabs button[aria-selected="true"]{color:var(--tx);border-bottom-color:var(--bluehi)}
.tabs button:focus-visible{outline:2px solid var(--bluehi);outline-offset:-2px;border-radius:4px}
.tabs button .n{display:inline-block;min-width:16px;margin-left:6px;padding:0 5px;border-radius:9px;font-size:10px;line-height:16px;text-align:center;color:#06222e;background:var(--amber);vertical-align:1px}
.tab[hidden]{display:none}
.tab .lead{color:var(--mut);font-size:13px;margin:14px 0 0}
ul.ins li .go{display:inline-block;margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--bluehi);text-decoration:none}
ul.ins li .go:hover{text-decoration:underline}
.foot{margin-top:34px;color:var(--mut);font-size:13.5px;border-top:1px solid var(--bd);padding-top:18px}
.foot a{color:var(--bluehi);text-decoration:none} .foot a:hover{text-decoration:underline}
.live{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--osd);border:1px solid rgba(98,229,138,.35);background:rgba(98,229,138,.1);border-radius:20px;padding:3px 9px}
.mini{width:120px;height:26px;display:block}
@media (prefers-reduced-motion:reduce){.chart rect.col{transition:none}}
</style></head><body><div class="wrap">
<div class="head">
  <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0e1117"/><path d="M32 14 L56 42 L36 38 L32 45 L28 38 L8 42 Z" fill="#1f9bd9" stroke="#5fc4ef" stroke-width="1.5" stroke-linejoin="round"/><path d="M32 16 L32 43" stroke="#0a4a6a" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="32" cy="22" r="2.4" fill="#06222e" stroke="#cdeeff" stroke-width="1"/></svg>
  <div><div class="name">Nanawing</div><div class="sub">Flight stats</div></div>
  <a href="/stats" style="margin-left:auto;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--mut);text-decoration:none">← Portfolio stats</a>
  <span class="live" style="margin-left:14px">● Live</span>
</div>
<h1>Every flight, counted.</h1>
<nav class="sims" role="tablist" aria-label="Product">
  <button role="tab" data-sim="nanawing1">Nanawing 1 <span>FPV</span></button><button role="tab" data-sim="nanawing2">Nanawing 2 <span>line of sight</span></button>
</nav>
<p class="lede" id="lede"></p>
<div class="grid" id="grid"><div class="tile"><div class="k">Loading…</div></div></div>

<nav class="tabs" role="tablist" aria-label="Sections">
  <button role="tab" data-tab="summary">Summary</button><button role="tab" data-tab="activity">Activity</button><button role="tab" data-tab="racing">Racing</button><button role="tab" data-tab="wings">Wings</button><button role="tab" data-tab="hardware">Hardware</button><button role="tab" data-tab="audience">Audience</button>
</nav>

<section class="tab" id="tab-summary" role="tabpanel">
<div class="charts" style="margin-top:20px">
  <div class="panel"><div class="ptitle">What matters right now <span class="psub">the five findings that most deserve a look · each links to its section</span></div><div id="insightsTop"><div class="chload">Waiting for data…</div></div></div>
  <div class="panel"><div class="ptitle">Flights per day <span class="psub" id="subPulse">last 30 days</span></div><div class="chart" id="chPulse"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Unique pilots per day <span class="psub" id="subPulseP">last 30 days · identity is an IP hash</span></div><div class="chart" id="chPulseP"><div class="chload">Loading…</div></div></div>
</div>
</section>

<section class="tab" id="tab-activity" role="tabpanel" hidden>
<div id="ins-activity"></div>
<div class="chips" id="rangeChips" role="group" aria-label="Range">
  <button data-r="30">30 d</button><button data-r="90">90 d</button><button data-r="180">180 d</button><button data-r="365">1 y</button><button data-r="all">All</button>
</div>
<div class="charts">
  <div class="panel"><div class="ptitle"><span id="tFlights">Flights per day</span> <span class="psub" id="subFlights">…</span></div><div class="chart" id="chFlights"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle"><span id="tSessions">Sessions per day</span> <span class="psub" id="subSessions">30-min gap · counted on start day</span></div><div class="chart" id="chSessions"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle"><span id="tPilots">Unique pilots per day</span> <span class="psub" id="subPilots">daily unique · identity is an IP hash</span></div><div class="chart" id="chPilots"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">How flights end <span class="psub" id="subEnd">from perf records · since 30 Jul 2026 · resets are relaunches, not endings</span></div><div class="legend"><span><i style="background:var(--osd)"></i>landed</span><span><i style="background:var(--red)"></i>crashed + stalled</span><span><i style="background:var(--amber)"></i>reset</span><span><i style="background:#4b5563"></i>left mid-flight</span></div><div class="chart" id="chEnd"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">When people fly <span class="psub" id="subHeat">UTC · launches · selected range</span></div><div class="chart" id="chHeat"><div class="chload">Loading…</div></div></div>
</div>
</section>

<section class="tab" id="tab-racing" role="tabpanel" hidden>
<div id="ins-racing"></div>
<div class="charts" style="margin-top:20px">
  <div class="panel"><div class="ptitle">Laps completed, by track and wing <span class="psub">one row per pilot per board · laps = every submission · medians over personal bests</span></div><div id="chBoards"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Laps per day <span class="psub" id="subLaps">last 30 days · qualifying laps uploaded · lower bound</span></div><div class="legend" id="lapLegend"></div><div class="chart" id="chLaps"><div class="chload">Loading…</div></div></div>
</div>
</section>

<section class="tab" id="tab-wings" role="tabpanel" hidden>
<div id="ins-wings"></div>
<div class="chips sm" id="wingChips" role="group" aria-label="Window" style="margin-top:16px"><button data-d="14">14 d</button><button data-d="30">30 d</button><button data-d="90">90 d</button></div>
<div class="charts">
  <div class="panel"><div class="ptitle">Which wing people fly <span class="psub" id="subWings">all flights, not just laps · 120-day retention</span></div><div id="chWings"><div class="chload">Loading…</div></div></div>
  <div class="two">
    <div class="panel"><div class="ptitle">FPV vs chase <span class="psub">camera at launch</span></div><div id="chCam"><div class="chload">Loading…</div></div></div>
    <div class="panel"><div class="ptitle">How long a flight lasts <span class="psub">bins 0–15 · 15–30 · 30–60 · 60–120 · 120–300 · 300+ s</span></div><div id="chDur"><div class="chload">Loading…</div></div></div>
  </div>
</div>
</section>

<section class="tab" id="tab-hardware" role="tabpanel" hidden>
<div id="ins-hardware"></div>
<div class="chips sm" id="hwChips" role="group" aria-label="Window" style="margin-top:16px"><button data-d="14">14 d</button><button data-d="30">30 d</button><button data-d="90">90 d</button></div>
<div class="charts">
  <div class="panel"><div class="ptitle">Hardware, bucketed <span class="psub" id="subHw">median from 5-fps bins (±2.5) · p90/p99 = avg of per-flight percentiles</span></div><div id="chHw"><div class="chload">Loading…</div></div></div>
  <div class="panel"><div class="ptitle">Tier ladder health <span class="psub">cell = share of flights under 30 fps · a healthy ladder gives every bucket a tier above 30 · lite is the floor</span></div><div id="chLadder"><div class="chload">Loading…</div></div></div>
  <div class="two">
    <div class="panel"><div class="ptitle">On battery vs plugged in <span class="psub">Chromium Battery API only</span></div><div id="chBatt"><div class="chload">Loading…</div></div></div>
    <div class="panel"><div class="ptitle">Tier offers <span class="psub">the mid-flight up/down offer</span></div><div id="chOffer"><div class="chload">Loading…</div></div></div>
  </div>
  <div class="panel"><div class="ptitle">Top systems <span class="psub">raw GPU × OS × browser × tier · for the bug reports</span></div><div id="chPerf"><div class="chload">Loading…</div></div></div>
</div>
</section>

<section class="tab" id="tab-audience" role="tabpanel" hidden>
<div id="ins-audience"></div>
<div class="chips sm" id="audChips" role="group" aria-label="Window" style="margin-top:16px"><button data-d="14">14 d</button><button data-d="30">30 d</button><button data-d="90">90 d</button></div>
<div class="charts">
  <div class="two">
    <div class="panel"><div class="ptitle">Page load → first flight <span class="psub">perf sessions · a bench-driven reload counts twice</span></div><div id="chFunnel"><div class="chload">Loading…</div></div></div>
    <div class="panel"><div class="ptitle">Flights per session <span class="psub">per page load · a tab-close segment counts as a flight</span></div><div id="chFps"><div class="chload">Loading…</div></div></div>
  </div>
  <div class="two">
    <div class="panel"><div class="ptitle">Platforms <span class="psub">from the UA · iPad reports as macOS</span></div><div id="chPlat"><div class="chload">Loading…</div></div></div>
    <div class="panel"><div class="ptitle">Screens <span class="psub">CSS screen size · DPR</span></div><div id="chScreens"><div class="chload">Loading…</div></div></div>
  </div>
</div>
</section>

<div class="foot">Daily charts are UTC and begin 22 Jul 2026 (flights) / 30 Jul 2026 (perf). Real players = dev builds, ?tier= probe runs and software renderers excluded; identity is a salted IP hash (approximate). Perf records are kept 120 days; daily rollups are permanent. Hours flown are recorded but not shown yet. · <a href="https://sim.narenana.com">Fly Nanawing →</a></div>
</div>
<script>
"use strict";
var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var WD=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
var LB="https://fpvsim-leaderboard.narenana.workers.dev/summary";
function el(id){return document.getElementById(id);}
// XSS GUARD: esc() is the ONLY path into innerHTML for any string, server labels included.
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function num(v){return v==null||!isFinite(Number(v))?"—":String(Number(v));}
function fmtN(n){n=Number(n);return isFinite(n)?n.toLocaleString():"—";}
function fmtT(s){s=Math.round(s);var h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+"h "+m+"m":m?m+"m "+(s%60)+"s":s+"s";}
function fmtMs(ms){if(ms==null||!isFinite(ms))return "—";var s=ms/1000,m=Math.floor(s/60),r=s-m*60;return m+":"+(r<10?"0":"")+r.toFixed(2);}
function pc(v,d){return v==null||!isFinite(Number(v))?"—":Number(v).toFixed(d==null?0:d)+"%";}
function lbl(day){var p=String(day).split("-");return MON[(+p[1])-1]+" "+(+p[2]);}
function niceMax(v){if(v<=5)return 5;var pow=Math.pow(10,Math.floor(Math.log(v)/Math.LN10));var f=v/pow;var steps=[1,1.5,2,2.5,3,4,5,6,8,10],n=10;for(var i=0;i<steps.length;i++){if(f<=steps[i]){n=steps[i];break;}}return n*pow;}
function tile(k,v,u,cls,extra){return '<div class="tile"><div class="k">'+k+'</div><div class="v '+(cls||"")+'">'+v+'</div>'+(u?'<div class="u">'+u+'</div>':'')+(extra||'')+'</div>';}
function fpsCls(v){return v>=55?"fps-good":v>=30?"fps-mid":"fps-bad";}
function cellCls(p){return p==null?"c-na":p<=10?"c-good":p<=35?"c-mid":"c-bad";}
function store(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function load(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function gpuShort(g){
  if(!g)return "unknown";
  var m=/ANGLE \(([^,]+),\s*([^,]+)/.exec(g);
  var r=m?m[2].replace(/ANGLE Metal Renderer:\s*/,"").replace(/\s*Direct3D11.*$/,"").replace(/\s*\(0x[0-9A-Fa-f]+\).*$/,"").trim()||m[1]:g;
  return r.length>52?r.slice(0,52)+"…":r;
}
// Per-panel state: a failed refresh keeps the last render and marks the panel stale, never blanks it.
var rendered={};
function setStale(id,on){var t=el(id);if(!t)return;var p=t.parentNode.querySelector(".ptitle");if(!p)return;var s=p.querySelector(".pill.stale");if(on&&!s){s=document.createElement("span");s.className="pill stale";s.textContent="stale";s.title="The last refresh failed or the server served an old copy; the numbers may be behind.";p.appendChild(s);}if(!on&&s)s.remove();}
function fail(id,msg){if(rendered[id]){setStale(id,true);return;}el(id).innerHTML='<div class="cherr">'+esc(msg)+'</div>';}
function ok(id,html){el(id).innerHTML=html;rendered[id]=true;setStale(id,false);}
function realPill(n){return '<span class="pill" title="Excludes dev builds, forced-tier (?tier=) probe runs and software renderers.'+(n!=null?' '+esc(fmtN(n))+' sessions excluded in this window.':'')+'">real players</span>';}
// The two sims are stored separately and read independently. SIM comes from this page's own ?sim=,
// so a view is shareable, and rides on every SAME-ORIGIN stats request below. The leaderboard's
// /summary is absolute and racing-only, so it is deliberately left alone.
var SIMS=["nanawing1","nanawing2"];
var RACING; // set beside SIM below: racing belongs to Nanawing 1 only
var SIM=(function(){var q=new URLSearchParams(location.search).get("sim");return SIMS.indexOf(q)>=0?q:"nanawing1";})();
RACING=(SIM==="nanawing1");
function simQ(url){var u=url.charAt(0)==="/"?url+(url.indexOf("?")<0?"?":"&")+"sim="+SIM:url;return u.charAt(0)==="/"?"https://fpvsim-stats.narenana.workers.dev"+u:u;}
async function getJson(url){var r=await fetch(simQ(url),{cache:"no-store"});if(!r.ok)throw new Error(String(r.status));var b=await r.json();var st=r.headers.get("x-stats-stale")||r.headers.get("x-lb-stale");if(st)b.__stale=Number(st);return b;}
function staleMark(ids,d){ids.forEach(function(id){setStale(id,!!(d&&d.__stale));});}

// ---- charts (numbers only) -------------------------------------------------------------------
function keyLbl(k,weekly){return weekly?"wk of "+lbl(k):lbl(k);}
function chartW(host){return Math.max(320,Math.min(680,host.clientWidth||680));}
function barChart(host,rows,get,color,colorHi,unit,weekly){
  var W=chartW(host),H=190,L=36,R=10,T=14,B=26,pw=W-L-R,ph=H-T-B,n=rows.length;
  if(!n){host.innerHTML='<div class="empty">Nothing in this range yet.</div>';return;}
  var vals=rows.map(function(d){var v=get(d);return v==null?null:+v||0;});
  var max=niceMax(Math.max.apply(null,vals.map(function(v){return v||0;}).concat([1])));
  var band=pw/n,bw=Math.max(1,band-(n>60?1:3));
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(unit)+'">';
  var ticks=[0,max/2,max],t,gv,gy;
  for(t=0;t<ticks.length;t++){gv=ticks[t];gy=T+ph*(1-gv/max);
    s+='<line x1="'+L+'" y1="'+gy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+gy.toFixed(1)+'" stroke="var(--grid)" stroke-width="1"/>';
    s+='<text x="'+(L-6)+'" y="'+(gy+3.5).toFixed(1)+'" text-anchor="end" fill="var(--dim)" font-size="10" font-family="ui-monospace,monospace">'+(gv%1?gv.toFixed(1):gv)+'</text>';}
  var i,v,bh,x,y,fill,op;
  for(i=0;i<n;i++){v=vals[i]||0;bh=ph*(v/max);x=L+i*band+(band-bw)/2;y=T+ph-bh;fill=(i===n-1)?colorHi:color;op=vals[i]==null?0:(rows[i].partial?.55:1);
    s+='<rect class="col" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,bh).toFixed(1)+'" rx="2" fill="'+fill+'" opacity="'+(v?op:0)+'"/>';}
  s+='<line x1="'+L+'" y1="'+(T+ph)+'" x2="'+(W-R)+'" y2="'+(T+ph)+'" stroke="var(--axis)" stroke-width="1"/>';
  var idxs=n>2?[0,Math.floor((n-1)/2),n-1]:[0,n-1],j,ix,xx,anc;
  for(j=0;j<idxs.length;j++){ix=idxs[j];xx=L+ix*band+band/2;anc=j===0?"start":(j===idxs.length-1?"end":"middle");
    s+='<text x="'+xx.toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+anc+'" fill="var(--dim)" font-size="10" font-family="ui-monospace,monospace">'+esc(keyLbl(rows[ix].key,weekly))+'</text>';}
  for(i=0;i<n;i++){x=L+i*band;
    s+='<rect x="'+x.toFixed(1)+'" y="'+T+'" width="'+band.toFixed(1)+'" height="'+ph+'" fill="transparent"><title>'+esc(keyLbl(rows[i].key,weekly))+' · '+(vals[i]==null?"n/a":vals[i])+' '+esc(unit)+(rows[i].partial?' (partial)':'')+(rows[i].note?' · '+esc(rows[i].note):'')+'</title></rect>';}
  s+='</svg>';host.innerHTML=s;
}
function stackChart(host,rows,keys,colors,names,get,weekly,unit){
  var W=chartW(host),H=190,L=36,R=10,T=14,B=26,pw=W-L-R,ph=H-T-B,n=rows.length;
  if(!n){host.innerHTML='<div class="empty">Nothing in this range yet.</div>';return;}
  var tot=rows.map(function(r){var s=0;for(var k=0;k<keys.length;k++)s+=(+get(r,keys[k])||0);return s;});
  var max=niceMax(Math.max.apply(null,tot.concat([1])));
  var band=pw/n,bw=Math.max(1,band-(n>60?1:3));
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(unit)+'">';
  var ticks=[0,max/2,max],t,gv,gy;
  for(t=0;t<ticks.length;t++){gv=ticks[t];gy=T+ph*(1-gv/max);
    s+='<line x1="'+L+'" y1="'+gy.toFixed(1)+'" x2="'+(W-R)+'" y2="'+gy.toFixed(1)+'" stroke="var(--grid)" stroke-width="1"/>';
    s+='<text x="'+(L-6)+'" y="'+(gy+3.5).toFixed(1)+'" text-anchor="end" fill="var(--dim)" font-size="10" font-family="ui-monospace,monospace">'+(gv%1?gv.toFixed(1):gv)+'</text>';}
  var i,k,v,acc,bh,x,y;
  for(i=0;i<n;i++){acc=0;x=L+i*band+(band-bw)/2;
    for(k=0;k<keys.length;k++){v=+get(rows[i],keys[k])||0;if(!v)continue;bh=ph*(v/max);y=T+ph-ph*(acc/max)-bh;acc+=v;
      s+='<rect class="col" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" fill="'+colors[k]+'" opacity="'+(rows[i].partial?.55:1)+'"/>';}}
  s+='<line x1="'+L+'" y1="'+(T+ph)+'" x2="'+(W-R)+'" y2="'+(T+ph)+'" stroke="var(--axis)" stroke-width="1"/>';
  var idxs=n>2?[0,Math.floor((n-1)/2),n-1]:[0,n-1],j,ix,xx,anc;
  for(j=0;j<idxs.length;j++){ix=idxs[j];xx=L+ix*band+band/2;anc=j===0?"start":(j===idxs.length-1?"end":"middle");
    s+='<text x="'+xx.toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+anc+'" fill="var(--dim)" font-size="10" font-family="ui-monospace,monospace">'+esc(keyLbl(rows[ix].key,weekly))+'</text>';}
  for(i=0;i<n;i++){x=L+i*band;var tt=esc(keyLbl(rows[i].key,weekly));for(k=0;k<keys.length;k++){tt+=' · '+esc(names[k])+' '+(+get(rows[i],keys[k])||0);}
    s+='<rect x="'+x.toFixed(1)+'" y="'+T+'" width="'+band.toFixed(1)+'" height="'+ph+'" fill="transparent"><title>'+tt+(rows[i].partial?' (partial)':'')+(rows[i].note?' · '+esc(rows[i].note):'')+'</title></rect>';}
  s+='</svg>';host.innerHTML=s;
}
function heatGrid(host,heat){
  var W=chartW(host),H=200,L=36,T=8,cw=(W-L-8)/24,ch=(H-T-22)/7,max=0,d,h;
  for(d=0;d<7;d++)for(h=0;h<24;h++)max=Math.max(max,+heat[d][h]||0);
  if(!max){host.innerHTML='<div class="empty">Nothing in this range yet.</div>';return;}
  var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="launches by weekday and hour">';
  for(d=0;d<7;d++){s+='<text x="'+(L-8)+'" y="'+(T+d*ch+ch/2+3.5).toFixed(1)+'" text-anchor="end" fill="var(--dim)" font-size="10" font-family="ui-monospace,monospace">'+WD[d]+'</text>';
    for(h=0;h<24;h++){var v=+heat[d][h]||0,op=v?0.15+0.85*(v/max):0.04;
      s+='<rect x="'+(L+h*cw+1).toFixed(1)+'" y="'+(T+d*ch+1).toFixed(1)+'" width="'+(cw-2).toFixed(1)+'" height="'+(ch-2).toFixed(1)+'" rx="2" fill="var(--bluehi)" opacity="'+op.toFixed(3)+'"><title>'+WD[d]+' '+(h<10?"0":"")+h+':00 UTC · '+v+' launches</title></rect>';}}
  for(h=0;h<24;h+=6)s+='<text x="'+(L+h*cw+cw/2).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" fill="var(--dim)" font-size="10" font-family="ui-monospace,monospace">'+(h<10?"0":"")+h+':00</text>';
  s+='</svg>';host.innerHTML=s;
}
function barList(items,color,unitFn){
  var max=Math.max.apply(null,items.map(function(x){return +x.v||0;}).concat([1]));
  var h='<div class="bl">';
  for(var i=0;i<items.length;i++){var it=items[i],w=Math.max(0,Math.min(100,100*(+it.v||0)/max));
    h+='<div class="row"><span class="lab" title="'+esc(it.label)+'">'+esc(it.label)+'</span><span class="trk" title="'+esc(it.title||"")+'"><i style="width:'+w.toFixed(1)+'%;background:'+color+'"></i>'+(it.v2!=null?'<i style="width:'+Math.max(0,Math.min(100,100*(+it.v2||0)/max)).toFixed(1)+'%;background:'+esc(it.color2||"#1f5f7d")+'"></i>':'')+'</span><span class="val">'+esc(unitFn?unitFn(it):fmtN(it.v))+'</span></div>';}
  return h+'</div>';
}
function miniHist(bins,color){
  var W=120,H=26,n=bins.length,max=Math.max.apply(null,bins.concat([1])),bw=W/n-2,s='<svg class="mini" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">';
  for(var i=0;i<n;i++){var bh=(H-2)*((+bins[i]||0)/max);s+='<rect x="'+(i*(bw+2)).toFixed(1)+'" y="'+(H-bh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="1" fill="'+color+'" opacity="'+(bins[i]?1:.15)+'"/>';}
  return s+'</svg>';
}

// ---- state --------------------------------------------------------------------------------------
var S={stats:null,activity:null,pulse:null,summary:null,wings:null,hardware:null,audience:null};
var range=(function(){var r=load("nw.stats.range");return ["30","90","180","365","all"].indexOf(r)>=0?r:"30";})();
var wingsDays=30,hwDays=14,audDays=30;
function chips(id,attr,cur,onPick){var host=el(id),bs=host.querySelectorAll("button");for(var i=0;i<bs.length;i++){(function(b){b.setAttribute("aria-pressed",b.getAttribute(attr)===String(cur)?"true":"false");b.onclick=function(){onPick(b.getAttribute(attr));var all=host.querySelectorAll("button");for(var j=0;j<all.length;j++)all[j].setAttribute("aria-pressed",all[j]===b?"true":"false");};})(bs[i]);}}

// ---- totals --------------------------------------------------------------------------------------
function renderTiles(){
  var d=S.stats;if(!d)return;
  var flights=d.flights||0,air=d.air_seconds||0,land=d.landings||0,crash=(d.crashes||0)+(d.stalls||0),resets=d.resets||0,lefts=d.lefts||0;
  var done=land+crash,landPct=done?Math.round(land/done*100):0,ended=done+resets+lefts,avg=ended?air/ended:0;
  var raw='<span class="pill raw" title="All-time counters, every launch ever seen — not filtered to real players.">all-time · raw</span>';
  var wk=S.activity&&S.activity.latest_week,wkHtml;
  if(wk){var delta=wk.prev_pilots?Math.round((wk.pilots-wk.prev_pilots)/wk.prev_pilots*100):null;
    wkHtml=tile("Pilots last week",fmtN(wk.pilots),"exact unique · wk of "+esc(lbl(wk.week))+(delta==null?"":" · "+(delta>=0?"+":"")+delta+"% vs prior")+" · "+fmtN(wk.pilots_returning)+" returning","good");}
  else wkHtml=tile("Pilots last week","—","no closed week yet");
  // The leaderboard is Nanawing 1's, and its worker has no product dimension: this tile is racing
  // data and must never appear under another product, the way the Racing tab does not.
  var sm=S.summary&&S.summary.totals,smHtml=RACING?(sm?tile("Laps on the boards",fmtN(sm.laps_submitted),"all-time · "+fmtN(sm.pilots)+" pilots on "+fmtN(sm.board_rows>0?(S.summary.boards||[]).length:0)+" boards","blue"):tile("Laps on the boards","—","leaderboard unavailable")):"";
  el("grid").innerHTML=
    tile("Flights flown",fmtN(flights),raw,"blue")+
    tile("Total air-time",fmtT(air),raw)+
    tile("Avg flight",fmtT(avg),"per ended flight · resets and tab-closes included")+
    '<div class="tile"><div class="k">Landings vs crashes</div><div class="v good">'+landPct+'%</div><div class="u">clean landings</div>'+
      '<div class="bar"><i class="land" style="width:'+landPct+'%"></i><i class="crash" style="width:'+(100-landPct)+'%"></i></div>'+
      '<div class="u" style="margin-top:8px">'+fmtN(land)+' landed · '+fmtN(crash)+' crashed'+(resets||lefts?' · '+fmtN(resets)+' reset · '+fmtN(lefts)+' left':'')+'</div></div>'+
    wkHtml+smHtml;
}
async function loadTotals(){
  try{S.stats=await getJson("/stats");renderTiles();}
  catch(e){if(!S.stats)el("grid").innerHTML='<div class="tile"><div class="k">Could not load stats</div></div>';}
}

// ---- activity ------------------------------------------------------------------------------------
function renderActivity(){
  var d=S.activity,weekly=d.bucket==="week",rows=d.rows.slice();
  if(!weekly&&d.today)rows.push({key:d.today.key,flights:d.today.flights,sessions:d.today.sessions,pilots:d.today.pilots,partial:true,pf:null,note:"today so far"});
  var rlabel={30:"last 30 days",90:"last 90 days",180:"last 180 days",365:"last year",all:"since 22 Jul 2026"}[d.range]||d.range;
  var peak=function(k){return Math.max.apply(null,rows.map(function(r){return +r[k]||0;}).concat([0]));};
  el("tFlights").textContent=weekly?"Flights per week":"Flights per day";
  el("tSessions").textContent=weekly?"Sessions per week":"Sessions per day";
  el("tPilots").textContent=weekly?"Unique pilots per week":"Unique pilots per day";
  var pend=d.rollup_pending&&d.rollup_pending.length?" · "+d.rollup_pending.length+" day(s) not rolled up yet":"";
  el("subFlights").innerHTML=esc(rlabel+" · peak "+fmtN(peak("flights"))+(weekly?"/week":"/day")+(weekly?" · current week partial":"")+pend)+realPill();
  el("subSessions").innerHTML=esc("30-min gap · counted on start day"+(weekly?" · current week partial":""))+realPill();
  barChart(el("chFlights"),rows,function(r){return r.flights;},"#3eb5e8","#7cc9ef","flights",weekly);
  barChart(el("chSessions"),rows,function(r){return r.sessions;},"#e3a83a","#f3c256","sessions",weekly);
  if(weekly){
    el("subPilots").innerHTML=esc("exact per week · returning = also flew the previous week · partial week shows avg daily unique")+realPill();
    var prow=rows.map(function(r){return {key:r.key,partial:r.partial,ret:r.pilots_returning||0,other:r.pilots!=null?Math.max(0,r.pilots-(r.pilots_returning||0)):(r.pilots_daily_avg||0),note:r.pilots==null?"avg daily unique (partial week)":null};});
    stackChart(el("chPilots"),prow,["ret","other"],["#59d98a","#2c7a48"],["returning","new / other"],function(r,k){return r[k];},true,"pilots");
  }else{
    el("subPilots").innerHTML=esc("daily unique · identity is an IP hash · peak "+fmtN(peak("pilots"))+"/day")+realPill();
    barChart(el("chPilots"),rows,function(r){return r.pilots;},"#59d98a","#8ff0ac","pilots",weekly);
  }
  var pf=rows.filter(function(r){return r.pf;});
  if(pf.length){stackChart(el("chEnd"),pf,["landed","cr","reset","left"],["#62e58a","#f0616d","#e3a83a","#4b5563"],["landed","crashed+stalled","reset","left"],function(r,k){return k==="cr"?(r.pf.crashed||0)+(r.pf.stalled||0):r.pf[k];},weekly,"flights");}
  else el("chEnd").innerHTML='<div class="empty">No perf-era days in this range.</div>';
  el("subEnd").innerHTML=esc("from perf records · since 30 Jul 2026 · resets are relaunches, not endings")+realPill();
  heatGrid(el("chHeat"),d.heat);
  el("subHeat").innerHTML=esc("UTC · launches · "+rlabel+" · "+fmtN(d.totals.flights)+" launches, "+fmtN(d.totals.flights_probe)+" probe launches excluded")+realPill();
  rendered.chFlights=rendered.chSessions=rendered.chPilots=rendered.chEnd=rendered.chHeat=true;
  ["chFlights","chSessions","chPilots","chEnd","chHeat"].forEach(function(id){setStale(id,false);});
  renderTiles();renderInsights();
}
async function loadActivity(){
  try{var d=await getJson("/activity?range="+encodeURIComponent(range));if(d.range!==String(range))return;S.activity=d;renderActivity();staleMark(["chFlights","chSessions","chPilots","chEnd","chHeat"],d);}
  catch(e){["chFlights","chSessions","chPilots","chEnd","chHeat"].forEach(function(id){fail(id,"Could not load activity ("+e.message+").");});}
}
// The Summary tab's pulse is always the last 30 days, daily, whatever range the Activity tab is on.
function renderPulse(){
  var d=S.pulse;if(!d)return;
  var rows=d.rows.slice();if(d.today)rows.push({key:d.today.key,flights:d.today.flights,pilots:d.today.pilots,partial:true,note:"today so far"});
  var peak=function(k){return Math.max.apply(null,rows.map(function(r){return +r[k]||0;}).concat([0]));};
  el("subPulse").innerHTML=esc("last 30 days · peak "+fmtN(peak("flights"))+"/day")+realPill();
  el("subPulseP").innerHTML=esc("last 30 days · daily unique · identity is an IP hash · peak "+fmtN(peak("pilots"))+"/day")+realPill();
  barChart(el("chPulse"),rows,function(r){return r.flights;},"#3eb5e8","#7cc9ef","flights",false);
  barChart(el("chPulseP"),rows,function(r){return r.pilots;},"#59d98a","#8ff0ac","pilots",false);
  rendered.chPulse=rendered.chPulseP=true;setStale("chPulse",false);setStale("chPulseP",false);
  renderTiles();renderInsights();
}
async function loadPulse(){
  if(range==="30"&&S.activity){S.pulse=S.activity;renderPulse();return;} // same document: no second request
  try{var d=await getJson("/activity?range=30");S.pulse=d;renderPulse();staleMark(["chPulse","chPulseP"],d);}
  catch(e){fail("chPulse","Could not load activity ("+e.message+").");fail("chPulseP","Could not load.");}
}

// ---- racing (leaderboard /summary) ----------------------------------------------------------------
var CCOL={"windmill-run":"#3eb5e8","river-run":"#b58cf5"};
function cname(c){return c==="windmill-run"?"Windmill Run":c==="river-run"?"River Run":c;}
function renderSummary(){
  var d=S.summary,b=d.boards||[];
  if(!b.length){ok("chBoards",'<div class="empty">No laps on the boards yet.</div>');ok("chLaps",'<div class="empty">No laps yet.</div>');renderTiles();renderInsights();return;}
  var h=barList(b.map(function(x){return {label:cname(x.course)+" · "+x.aircraft,v:x.pilots,title:x.pilots+" pilots · "+x.laps_submitted+" laps"};}),"#3eb5e8",function(it){return fmtN(it.v)+" pilots";});
  h+='<div class="perfwrap"><table class="perf"><tr><th>Track</th><th>Wing</th><th class="n">Pilots</th><th class="n">Laps</th><th class="n">Best</th><th class="n">Median PB</th><th class="n">P90 PB</th><th class="n">Active 7 d</th><th class="n">New PBs 7 d</th><th class="n">Laps 30 d</th></tr>';
  for(var i=0;i<b.length;i++){var x=b[i];
    h+='<tr><td class="hd">'+esc(cname(x.course))+'</td><td>'+esc(x.aircraft)+'</td><td class="n">'+fmtN(x.pilots)+'</td><td class="n">'+fmtN(x.laps_submitted)+'</td><td class="n fps-good">'+esc(fmtMs(x.best_ms))+'</td><td class="n">'+esc(fmtMs(x.median_pb_ms))+'</td><td class="n">'+esc(fmtMs(x.p90_pb_ms))+'</td><td class="n">'+fmtN(x.active_7d)+'</td><td class="n">'+fmtN(x.pb_7d)+'</td><td class="n">'+fmtN(x.laps_30d)+'</td></tr>';}
  h+='</table></div><div class="callout"><b>'+fmtN(d.totals.pilots)+'</b> pilots on the boards · <b>'+fmtN(d.totals.multi_board)+'</b> on more than one board · <b>'+fmtN(d.totals.multi_course)+'</b> raced both tracks';
  for(var j=0;j<(d.by_course||[]).length;j++){var c=d.by_course[j];h+=' · '+esc(cname(c.course))+': <b>'+fmtN(c.pilots)+'</b> pilots, best <b>'+esc(fmtMs(c.best_ms))+'</b>';}
  h+='</div>';
  ok("chBoards",h);
  // laps per day, stacked by course
  var days={},k,r,courses=d.courses||[];
  for(k=0;k<(d.laps_by_day.rows||[]).length;k++){r=d.laps_by_day.rows[k];var e=days[r.day]||(days[r.day]={key:r.day});e[r.course]=(e[r.course]||0)+(+r.laps||0);}
  var rows=[],from=d.laps_by_day.from,to=d.laps_by_day.to,t=Date.parse(from+"T00:00:00Z");
  if(!from||!to||isNaN(t)){ok("chLaps",'<div class="cherr">Laps-per-day contract missing from the leaderboard summary.</div>');renderTiles();renderInsights();return;}
  for(var gi=0;gi<400;gi++){var day=new Date(t).toISOString().slice(0,10);rows.push(days[day]||{key:day});if(day>=to)break;t+=864e5;}
  var lg='';for(k=0;k<courses.length;k++)lg+='<span><i style="background:'+(CCOL[courses[k]]||"#888")+'"></i>'+esc(cname(courses[k]))+'</span>';
  el("lapLegend").innerHTML=lg;
  stackChart(el("chLaps"),rows,courses,courses.map(function(c){return CCOL[c]||"#888";}),courses.map(cname),function(rr,kk){return rr[kk];},false,"laps");
  rendered.chLaps=true;setStale("chLaps",false);
  renderTiles();renderInsights();
}
async function loadSummary(){
  if(!RACING){renderTiles();return;} // no leaderboard request at all for a non-racing product
  try{var d=await getJson(LB);S.summary=d;renderSummary();staleMark(["chBoards","chLaps"],d);}
  catch(e){fail("chBoards","Could not load the leaderboard summary ("+e.message+").");fail("chLaps","Could not load laps per day.");renderTiles();}
}

// ---- wings ----------------------------------------------------------------------------------------
var WCOL=["#3eb5e8","#b58cf5","#e3a83a","#59d98a","#f0616d","#9ecbff"];
function renderWings(){
  var d=S.wings,a=d.by_aircraft||[];
  el("subWings").innerHTML=esc("all flights, not just laps · last "+d.days+" days · "+fmtN(d.flights)+" flights · 120-day retention"+(d.truncated?" · window capped at 20k flights":""))+realPill();
  if(!a.length){ok("chWings",'<div class="empty">No flights in this window.</div>');ok("chCam",'<div class="empty">—</div>');ok("chDur",'<div class="empty">—</div>');renderInsights();return;}
  var h=barList(a.map(function(x,i){return {label:x.aircraft,v:x.flights,title:pc(x.share*100,1)+" of flights"};}),"#3eb5e8",function(it){return fmtN(it.v)+" flights";});
  var tbl=function(rows,keyName,keyLabel){var s='<div class="perfwrap"><table class="perf"><tr><th>'+esc(keyLabel)+'</th><th class="n">Flights</th><th class="n">Share</th><th class="n">Avg s</th><th class="n">≈Median s</th><th class="n">Landed</th><th class="n">Crashed</th><th class="n">Reset</th><th class="n">Avg fps</th><th class="n">&lt;30 fps</th></tr>';
    for(var i=0;i<rows.length;i++){var x=rows[i];
      s+='<tr><td class="hd">'+esc(x[keyName])+'</td><td class="n">'+fmtN(x.flights)+'</td><td class="n">'+esc(pc(x.share==null?null:x.share*100,1))+'</td><td class="n">'+esc(num(x.avg_s))+'</td><td class="n">'+esc(num(x.median_s_est))+'</td><td class="n fps-good">'+esc(pc(x.landing_rate==null?null:x.landing_rate*100))+'</td><td class="n fps-bad">'+esc(pc(x.crash_rate==null?null:x.crash_rate*100))+'</td><td class="n fps-mid">'+esc(pc(x.reset_rate==null?null:x.reset_rate*100))+'</td><td class="n '+fpsCls(+x.fps_avg||0)+'">'+esc(num(x.fps_avg))+'</td><td class="n">'+esc(pc(x.fps_lt30_share==null?null:x.fps_lt30_share*100))+'</td></tr>';}
    return s+'</table></div>';};
  ok("chWings",h+tbl(a,"aircraft","Wing")+'<div class="callout">Landed / crashed are shares of flights that ENDED (landed, crashed or stalled); reset = relaunched from the pad, as a share of all flights.</div>');
  ok("chCam",tbl(d.by_camera||[],"camera","Camera"));
  var dh='<div class="perfwrap"><table class="perf"><tr><th>Wing</th><th>Duration histogram</th><th class="n">≈Median</th><th class="n">300 s+</th></tr>';
  for(var i=0;i<a.length;i++){var x=a[i];dh+='<tr><td class="hd">'+esc(x.aircraft)+'</td><td>'+miniHist(x.dur_bins,WCOL[i%WCOL.length])+'</td><td class="n">'+esc(num(x.median_s_est))+' s</td><td class="n">'+esc(pc(x.flights?x.dur_bins[5]/x.flights*100:null))+'</td></tr>';}
  ok("chDur",dh+'</table></div>');
  renderInsights();
}
async function loadWings(){
  try{var d=await getJson("/wings?days="+wingsDays);if(d.days!==wingsDays)return;S.wings=d;renderWings();staleMark(["chWings","chCam","chDur"],d);}
  catch(e){fail("chWings","Could not load wings ("+e.message+").");fail("chCam","Could not load.");fail("chDur","Could not load.");}
}

// ---- hardware ---------------------------------------------------------------------------------------
function vdCls(v){return v==="locked"?"vd-locked":v==="playable"?"vd-playable":v==="under-tiered"?"vd-under":v==="over-tiered"?"vd-over":v==="below floor"?"vd-floor":v==="thin"?"vd-thin":"vd-excluded";}
function renderHardware(){
  var d=S.hardware,b=d.buckets||[];
  var exN=(d.excluded.sessions_probe_url||0)+(d.excluded.sessions_software||0);
  el("subHw").innerHTML=esc("last "+d.days+" days · median from 5-fps bins (±2.5) · p90/p99 = avg of per-flight percentiles"+(d.truncated?" · window capped at 20k flights":""))+realPill(exN);
  if(!b.length){ok("chHw",'<div class="empty">No hardware data in this window.</div>');ok("chLadder",'<div class="empty">—</div>');ok("chBatt",'<div class="empty">—</div>');ok("chOffer",'<div class="empty">—</div>');ok("chPerf",'<div class="empty">—</div>');renderInsights();return;}
  var h='<div class="perfwrap"><table class="perf"><tr><th>Bucket</th><th class="n">Sessions</th><th class="n">Flew</th><th class="n">Flights</th><th class="n">Median fps</th><th class="n">≥30</th><th class="n">≥55</th><th class="n">p90 ms</th><th class="n">p99 ms</th><th class="n">Choppy</th><th class="n">Battery</th><th>Tier</th><th>Verdict</th></tr>';
  for(var i=0;i<b.length;i++){var x=b[i],ex=(x.examples||[]).map(function(g){return '<span title="'+esc(g)+'">'+esc(gpuShort(g))+'</span>';}).join(" · ");
    h+='<tr'+(x.real?'':' class="dimrow"')+'><td class="hd"><details><summary title="click for the renderer strings behind this bucket">'+esc(x.label)+'</summary><span class="ex">'+(ex||"—")+'</span></details></td>'+
      '<td class="n">'+fmtN(x.sessions)+'</td><td class="n">'+esc(pc(x.sessions?x.flew/x.sessions*100:null))+'</td><td class="n">'+fmtN(x.flights)+'</td>'+
      '<td class="n '+fpsCls(+x.median_fps||0)+'">'+esc(num(x.median_fps))+'</td><td class="n">'+esc(pc(x.pct_ge30))+'</td><td class="n">'+esc(pc(x.pct_ge55))+'</td>'+
      '<td class="n">'+esc(num(x.p90_ms))+'</td><td class="n">'+esc(num(x.p99_ms))+'</td><td class="n" title="flights whose p90 frame was slower than 33.4 ms (≥10 % of frames under 30 fps)">'+esc(pc(x.pct_choppy))+'</td><td class="n" title="share of flights on battery (Chromium only)">'+esc(pc(x.pct_battery))+'</td>'+
      '<td>'+esc(x.tier_top||"—")+'</td><td><span class="vd '+vdCls(x.verdict)+'" title="'+esc(vdTitle(x.verdict))+'">'+esc(x.verdict)+'</span></td></tr>';}
  h+='</table></div><div class="callout">Bench floor: <b>'+esc(num(d.bench_pass_ms))+' ms</b> per frame is the first-run benchmark pass mark. '+
    'Verdicts — <b>locked</b>: ≥55 fps on ultra · <b>under-tiered</b>: ≥55 fps below ultra (headroom the bench did not give them) · <b>playable</b>: 30–55 · <b>over-tiered</b>: &lt;30 fps above lite · <b>below floor</b>: &lt;30 fps on lite, nothing lower to offer · <b>thin</b>: under 20 flights.</div>';
  ok("chHw",h);
  // ladder: bucket × tier, cell = share under 30 fps
  var tiers=["ultra","high","lite"],real=b.filter(function(x){return x.real&&x.flights>=5;});
  var lh='<div class="perfwrap"><table class="perf"><tr><th>Bucket</th>';
  for(var t=0;t<tiers.length;t++)lh+='<th class="n">'+tiers[t]+'</th>';
  lh+='<th class="n">Flights</th></tr>';
  for(i=0;i<real.length;i++){var x=real[i];lh+='<tr><td class="hd">'+esc(x.label)+'</td>';
    for(t=0;t<tiers.length;t++){var c=x.tiers_fps&&x.tiers_fps[tiers[t]];
      if(!c||c.flights<5)lh+='<td class="n"><span class="cell c-na" title="'+(c?c.flights+' flights: too few':'no flights on this tier')+'">'+(c?"·":"—")+'</span></td>';
      else lh+='<td class="n"><span class="cell '+cellCls(c.pct_lt30)+'" title="'+c.flights+' flights · median '+esc(num(c.median_fps))+' fps">'+esc(pc(c.pct_lt30))+'</span></td>';}
    lh+='<td class="n">'+fmtN(x.flights)+'</td></tr>';}
  lh+='</table></div>';
  var lad=d.ladder||[];if(lad.length){lh+='<div class="callout">';for(i=0;i<lad.length;i++){var l=lad[i];lh+=(i?' · ':'')+'<b>'+esc(l.tier)+'</b>: '+fmtN(l.flights)+' flights, median '+esc(num(l.median_fps))+' fps, '+esc(pc(l.pct_lt30))+' under 30'+(l.sub30_by&&l.sub30_by.length?' (mostly '+esc(l.sub30_by.map(function(s){return s.label;}).join(", "))+')':'');}lh+='</div>';}
  ok("chLadder",lh);
  var bt=d.battery||[],bh='<div class="perfwrap"><table class="perf"><tr><th>Power</th><th class="n">Flights</th><th class="n">Median fps</th><th class="n">≥30</th><th class="n">p90 ms</th></tr>';
  for(i=0;i<bt.length;i++){var y=bt[i];bh+='<tr><td class="hd">'+esc(y.label)+'</td><td class="n">'+fmtN(y.flights)+'</td><td class="n '+fpsCls(+y.median_fps||0)+'">'+esc(num(y.median_fps))+'</td><td class="n">'+esc(pc(y.pct_ge30))+'</td><td class="n">'+esc(num(y.p90_ms))+'</td></tr>';}
  ok("chBatt",bh+'</table></div><div class="callout">Compare within a bucket, not across: laptops on battery are also the cheaper laptops.</div>');
  var of=d.offers;
  if(of&&of.total){var oh='<div class="bl">';var keys=["accepted","kept","timeout","floor","none"],names={accepted:"accepted",kept:"kept their tier",timeout:"ignored (timed out)",floor:"under 30 on lite, nothing to offer",none:"no offer needed"};
    for(i=0;i<keys.length;i++){var v=of[keys[i]]||0;oh+='<div class="row"><span class="lab">'+esc(names[keys[i]])+'</span><span class="trk"><i style="width:'+(100*v/of.total).toFixed(1)+'%;background:'+(keys[i]==="floor"?"var(--red)":keys[i]==="accepted"?"var(--osd)":"#3eb5e8")+'"></i></span><span class="val">'+fmtN(v)+'</span></div>';}
    ok("chOffer",oh+'</div><div class="callout">'+fmtN(of.total)+' sessions reported an offer outcome · '+fmtN(of.down||0)+' down-offers · '+fmtN(of.up||0)+' up-offers</div>');}
  else ok("chOffer",'<div class="empty">No offer outcomes yet — arrives with the next client build.</div>');
  var rows=d.top_systems||[];
  if(!rows.length)ok("chPerf",'<div class="empty">No perf data in this window.</div>');
  else{var ph='<div class="perfwrap"><table class="perf"><tr><th>GPU</th><th>System</th><th>Tier</th><th class="n">Flights</th><th class="n">Avg fps</th><th class="n">p90 ms</th><th class="n">Worst-s fps</th></tr>';
    for(i=0;i<rows.length;i++){var z=rows[i];ph+='<tr><td class="gpu" title="'+esc(z.gpu)+'">'+esc(gpuShort(z.gpu))+'</td><td>'+esc(z.os||"?")+' · '+esc(z.browser||"?")+'</td><td>'+esc(z.tier||"?")+'</td><td class="n">'+fmtN(+z.flights||0)+'</td><td class="n '+fpsCls(+z.fps_avg||0)+'">'+esc(num(z.fps_avg))+'</td><td class="n">'+esc(num(z.ft_p90_ms))+'</td><td class="n">'+esc(num(z.worst1s_fps))+'</td></tr>';}
    ok("chPerf",ph+'</table></div>');}
  renderInsights();
}
function vdTitle(v){return {locked:"vsync-locked at the top tier",playable:"30–55 fps: fine","under-tiered":"≥55 fps below ultra — the benchmark placed them too low","over-tiered":"under 30 fps above lite — the tier is too heavy for this hardware","below floor":"under 30 fps on lite — the ladder has no rung low enough",thin:"fewer than 20 flights: no verdict",excluded:"not players (probe or software renderer)"}[v]||"";}
async function loadHardware(){
  try{var d=await getJson("/hardware?days="+hwDays);if(d.days!==hwDays)return;S.hardware=d;renderHardware();staleMark(["chHw","chLadder","chBatt","chOffer","chPerf"],d);}
  catch(e){["chHw","chLadder","chBatt","chOffer","chPerf"].forEach(function(id){fail(id,"Could not load hardware ("+e.message+").");});}
}

// ---- audience --------------------------------------------------------------------------------------
function renderAudience(){
  var d=S.audience,f=d.funnel||{};
  var exN=(d.excluded.sessions_probe_url||0)+(d.excluded.sessions_software||0);
  var fh=barList([{label:"Page loads",v:f.sessions},{label:"Flew ≥ 1",v:f.flew_1,title:pc(f.sessions?f.flew_1/f.sessions*100:null)+" of page loads"},{label:"Flew ≥ 3",v:f.flew_3,title:pc(f.sessions?f.flew_3/f.sessions*100:null)+" of page loads"}],"#3eb5e8");
  fh+='<div class="callout">'+esc(pc(f.sessions?(1-f.flew_1/f.sessions)*100:null))+' of page loads never launch · '+fmtN(d.touch.sessions)+' touch sessions, '+fmtN(d.touch.flew)+' flew · Intel guard path: '+fmtN(d.low_gpu.sessions)+' sessions, median '+esc(num(d.low_gpu.median_fps))+' fps'+(d.tier_src?' · tier source: '+esc(Object.keys(d.tier_src).map(function(k){return k+" "+d.tier_src[k];}).join(", ")):'')+' '+realPill(exN)+'</div>';
  ok("chFunnel",fh);
  var fps=d.flights_per_session||{},ks=["1","2","3-5","6-10","11+"];
  ok("chFps",barList(ks.map(function(k){return {label:k+(k==="1"?" flight":" flights"),v:fps[k]||0};}),"#e3a83a",function(it){return fmtN(it.v)+" sessions";}));
  var ph='<div class="legend"><span><i style="background:#3eb5e8"></i>sessions</span><span><i style="background:#1f5f7d"></i>of which flew</span></div>';
  ph+=barList((d.by_os||[]).map(function(x){return {label:x.os,v:x.sessions,v2:x.flew,title:x.flew+" of "+x.sessions+" flew"};}),"#3eb5e8",function(it){return fmtN(it.v)+" · "+fmtN(it.v2)+" flew";});
  ph+=barList((d.by_browser||[]).slice(0,8).map(function(x){return {label:x.browser,v:x.sessions,v2:x.flew,color2:"#2c7a48",title:x.flew+" of "+x.sessions+" flew"};}),"#59d98a",function(it){return fmtN(it.v)+" · "+fmtN(it.v2)+" flew";});
  ok("chPlat",ph);
  var sh='<div class="perfwrap"><table class="perf"><tr><th>Screen</th><th class="n">DPR</th><th class="n">Sessions</th></tr>';
  for(var i=0;i<(d.screens||[]).length;i++){var s=d.screens[i];sh+='<tr><td class="hd">'+esc(s.w+"×"+s.h)+'</td><td class="n">'+esc(num(s.dpr))+'</td><td class="n">'+fmtN(s.sessions)+'</td></tr>';}
  sh+='</table></div><div class="callout">Full-screen: <b>'+esc(pc(d.full_screen.of?d.full_screen.flights/d.full_screen.of*100:null))+'</b> of flights</div>';
  ok("chScreens",sh);
  renderInsights();
}
async function loadAudience(){
  try{var d=await getJson("/audience?days="+audDays);if(d.days!==audDays)return;S.audience=d;renderAudience();staleMark(["chFunnel","chFps","chPlat","chScreens"],d);}
  catch(e){["chFunnel","chFps","chPlat","chScreens"].forEach(function(id){fail(id,"Could not load audience ("+e.message+").");});}
}

// ---- insights: derived from whatever has loaded; thresholds keep them honest --------------------
// Every insight carries a score (how much it deserves a look: warnings and trends first, curiosities
// last) and the tab it belongs to. The Summary shows the five highest; each tab lists its own.
var TAB_NAMES={activity:"Activity",racing:"Racing",wings:"Wings",hardware:"Hardware",audience:"Audience"};
function renderInsights(){
  var out=[],A=S.pulse||S.activity,H=S.hardware,W=S.wings,U=S.audience,L=S.summary;
  function add(cls,head,why,tab,score){out.push({cls:cls,head:head,why:why,tab:tab||"activity",score:score!=null?score:(cls==="warn"?70:cls==="good"?55:35)});}
  if(A&&A.latest_week&&A.latest_week.pilots>=5&&A.latest_week.prev_pilots){var lw=A.latest_week,dl=Math.round((lw.pilots-lw.prev_pilots)/lw.prev_pilots*100);
    if(Math.abs(dl)>=10)add(dl>0?"good":"warn",fmtN(lw.pilots)+" pilots flew last week, "+(dl>0?"up ":"down ")+Math.abs(dl)+"% on the week before.","Exact weekly uniques (week of "+lbl(lw.week)+" vs "+fmtN(lw.prev_pilots)+" the week before).","activity",92);}
  if(A&&A.latest_week&&A.latest_week.pilots>=5){var w=A.latest_week,rr=Math.round(w.pilots_returning/w.pilots*100);
    add(rr>=30?"good":"warn",rr+"% of last week's "+fmtN(w.pilots)+" pilots had also flown the week before.",rr>=30?"Retention is real: a third or more come back week to week.":"Most pilots are new each week — acquisition is carrying the numbers, retention is not.","activity",90);}
  if(A&&A.rows&&A.rows.length>=8){var rows=A.rows.filter(function(r){return !r.partial;}),n=rows.length;if(n>=8){var half=Math.floor(n/2),a=0,b=0,i;for(i=0;i<half;i++)a+=rows[i].flights;for(i=n-half;i<n;i++)b+=rows[i].flights;var g=a?Math.round((b-a)/a*100):null;
    if(g!=null&&Math.abs(g)>=15)add(g>0?"good":"warn","Flights are "+(g>0?"up ":"down ")+Math.abs(g)+"% in the last "+half+" "+(A.bucket==="week"?"weeks":"days")+" vs the first "+half+".","Sum of launches, real players, equal halves of "+n+" closed "+(A.bucket==="week"?"weeks":"days")+(n%2?" (middle one skipped)":"")+".","activity",85);}}
  if(A&&A.heat){var best=null,d,h;for(d=0;d<7;d++)for(h=0;h<24;h++){var v=A.heat[d][h];if(!best||v>best.v)best={d:d,h:h,v:v};}
    var tot=0;for(d=0;d<7;d++)for(h=0;h<24;h++)tot+=A.heat[d][h];if(best&&tot>=50)add("note","Busiest hour: "+WD[best.d]+" "+(best.h<10?"0":"")+best.h+":00 UTC ("+fmtN(best.v)+" launches, "+Math.round(best.v/tot*100)+"% of the range).","Plan deploys and benchmarks away from it.","activity",20);}
  if(H){var bs=H.buckets.filter(function(x){return x.real;}),floor=bs.filter(function(x){return x.verdict==="below floor";}),over=bs.filter(function(x){return x.verdict==="over-tiered";}),under=bs.filter(function(x){return x.verdict==="under-tiered";});
    if(floor.length)add("warn",floor.map(function(x){return x.label;}).join(", ")+" run under 30 fps on lite — there is no lower tier to offer them.","Lite is the floor of the ladder; these players need a cheaper render path, not a different tier. "+fmtN(floor.reduce(function(s,x){return s+x.flights;},0))+" flights in the window.","hardware",95);
    if(over.length)add("warn",over.map(function(x){return x.label;}).join(", ")+" sit above lite but median under 30 fps.","The benchmark placed them too high — the mid-flight down-offer should be catching this; check the Tier offers panel.","hardware",80);
    if(under.length)add("note",under.map(function(x){return x.label;}).join(", ")+" hold ≥55 fps below ultra.","Headroom the first-run benchmark did not give them; an up-offer or a higher bench cut-off would move them.","hardware",45);
    var lt=H.ladder.filter(function(l){return l.tier==="lite";})[0];if(lt&&lt.flights>=20)add(lt.pct_lt30>=25?"warn":"good",pc(lt.pct_lt30)+" of lite flights run under 30 fps.",lt.pct_lt30>=25?"A quarter or more of the floor tier is still choppy: the cheapest path is not cheap enough for the machines that reach it.":"The floor tier mostly delivers 30 fps.","hardware",lt.pct_lt30>=25?75:40);
    var batt=H.battery||[],onb=batt.filter(function(x){return x.battery===1;})[0],plug=batt.filter(function(x){return x.battery===0;})[0];
    if(onb&&plug&&onb.flights>=20&&plug.flights>=20&&onb.median_fps!=null&&plug.median_fps!=null){var dd=Math.round(plug.median_fps-onb.median_fps);if(Math.abs(dd)>=5)add("note","On battery, the median flight runs "+Math.abs(dd)+" fps "+(dd>0?"slower":"faster")+" than plugged in.","Median "+onb.median_fps+" vs "+plug.median_fps+" fps · Chromium Battery API only · laptops on battery are also the cheaper laptops.","hardware",35);}}
  if(W&&W.flights>=100){var landed=0,ended=0;W.by_aircraft.forEach(function(x){landed+=x.outcomes.landed;ended+=x.outcomes.landed+x.outcomes.crashed+x.outcomes.stalled;});
    if(ended>=50){var lr=Math.round(landed/ended*100);add(lr<10?"warn":lr<30?"note":"good",(lr<30?"Only ":"")+lr+"% of ended flights are landings.","Landed as a share of landed + crashed + stalled, last "+W.days+" days, all wings."+(lr<10?" Landing is the hardest thing in the sim: nine in ten flights that end, end in a crash.":""),"wings",lr<10?88:50);}}
  if(W&&W.by_aircraft.length>=2){var a0=W.by_aircraft[0];add("note",a0.aircraft+" is the most flown wing at "+pc(a0.share*100)+" of flights ("+fmtN(a0.flights)+" in "+W.days+" days).","Share of all launches, not laps.","wings",42);
    var withEnds=W.by_aircraft.filter(function(x){return x.landing_rate!=null&&x.flights>=30;});if(withEnds.length>=2){withEnds.sort(function(x,y){return y.landing_rate-x.landing_rate;});var hi=withEnds[0],lo=withEnds[withEnds.length-1];if(hi.landing_rate-lo.landing_rate>=0.15)add("note",hi.aircraft+" lands "+pc(hi.landing_rate*100)+" of ended flights; "+lo.aircraft+" only "+pc(lo.landing_rate*100)+".","Handling difference or pilot self-selection — both are real; the reset rate ("+pc(lo.reset_rate*100)+" vs "+pc(hi.reset_rate*100)+") says which wing people bail on.","wings",60);}
    var resets=W.by_aircraft.reduce(function(s,x){return s+x.outcomes.reset;},0);if(W.flights>=100&&resets/W.flights>=0.1)add("note",Math.round(resets/W.flights*100)+"% of flights end in a relaunch from the pad, not a landing or a crash.","Share of all flights in the window. Resets are mostly racers restarting a lap; they were counted as crashes before Sep 2026.","wings",48);}
  if(U&&U.funnel.sessions>=50){var nf=Math.round((1-U.funnel.flew_1/U.funnel.sessions)*100);add(nf>=40?"warn":"good",nf+"% of page loads never launch a flight.",nf>=40?"Roughly "+(nf>=60?"two in three":"one in two")+" leave from the Hangar — the first-run benchmark and the controls card are the two things they see.":"Most page loads turn into a flight.","audience",nf>=40?86:40);
    var fps=U.flights_per_session,one=fps["1"]||0,many=(fps["3-5"]||0)+(fps["6-10"]||0)+(fps["11+"]||0),fl=U.funnel.flew_1;if(fl>=30)add("note",Math.round(many/fl*100)+"% of sessions that fly at all fly three times or more.","Per page load · "+Math.round(one/fl*100)+"% fly exactly once.","audience",30);
    if(U.touch.sessions>=10)add(U.touch.flew/U.touch.sessions<0.3?"warn":"note",fmtN(U.touch.sessions)+" touch sessions, "+Math.round(U.touch.flew/U.touch.sessions*100)+"% flew.","Phones and tablets have no sticks; a low share is the missing touch-control story.","audience",U.touch.flew/U.touch.sessions<0.3?58:30);}
  if(L&&L.boards.length){var tb=L.boards.slice().sort(function(x,y){return y.pilots-x.pilots;})[0];add("note",cname(tb.course)+" · "+tb.aircraft+" is the most raced board: "+fmtN(tb.pilots)+" pilots, best "+fmtMs(tb.best_ms)+", median PB "+fmtMs(tb.median_pb_ms)+".","Medians are over personal bests, one per pilot.","racing",44);
    var l7=L.boards.reduce(function(s,b){return s+b.laps_7d;},0),act7=L.boards.reduce(function(s,b){return s+b.active_7d;},0);if(L.laps_by_day&&L.laps_by_day.rows.length)add(l7?"note":"warn",fmtN(l7)+" qualifying laps uploaded in the last 7 days by "+fmtN(act7)+" active board entries.","Uploads are a lower bound (offline laps never arrive). Zero for a week means the race loop has gone quiet.","racing",l7?46:80);
    if(L.totals.pilots>=10&&L.by_course.length>=2){var mc=Math.round(L.totals.multi_course/L.totals.pilots*100);add(mc>=25?"good":"note",mc+"% of board pilots have raced both tracks.","River Run threading needs a second arch; the cross-over rate says whether people find it.","racing",38);}}
  out.sort(function(x,y){return y.score-x.score;});
  var li=function(it,withLink){return '<li class="'+it.cls+'"><b>'+esc(it.head)+'</b><span class="why">'+esc(it.why)+'</span>'+(withLink?'<a class="go" href="#'+it.tab+'" data-tab="'+it.tab+'">'+esc(TAB_NAMES[it.tab]||it.tab)+' →</a>':'')+'</li>';};
  el("insightsTop").innerHTML=out.length?'<ul class="ins">'+out.slice(0,5).map(function(it){return li(it,true);}).join("")+'</ul>':'<div class="empty">Not enough data for an insight yet.</div>';
  Object.keys(TAB_NAMES).forEach(function(t){var host=el("ins-"+t);if(!host)return;var mine=out.filter(function(it){return it.tab===t;});
    host.innerHTML=mine.length?'<div class="charts" style="margin-top:20px"><div class="panel"><div class="ptitle">Insights <span class="psub">from this section\'s data</span></div><ul class="ins">'+mine.map(function(it){return li(it,false);}).join("")+'</ul></div></div>':'';});
  var links=el("insightsTop").querySelectorAll("a.go");for(var k=0;k<links.length;k++){links[k].onclick=function(e){e.preventDefault();showTab(this.getAttribute("data-tab"));};}
  // a badge on each tab: how many warnings live inside it
  var bs=document.querySelectorAll(".tabs button");for(k=0;k<bs.length;k++){var tb=bs[k].getAttribute("data-tab"),nw=out.filter(function(it){return it.tab===tb&&it.cls==="warn";}).length,old=bs[k].querySelector(".n");
    if(old)old.remove();if(nw){var sp=document.createElement("span");sp.className="n";sp.textContent=String(nw);sp.title=nw+" warning"+(nw>1?"s":"");bs[k].appendChild(sp);}}
}

// ---- tabs -------------------------------------------------------------------------------------------
var TABS=["summary","activity","racing","wings","hardware","audience"];
var RERENDER={summary:function(){renderPulse();},activity:function(){if(S.activity)renderActivity();},racing:function(){if(S.summary)renderSummary();},wings:function(){if(S.wings)renderWings();},hardware:function(){if(S.hardware)renderHardware();},audience:function(){if(S.audience)renderAudience();}};
function showTab(name){
  if(TABS.indexOf(name)<0)name="summary";
  TABS.forEach(function(t){var sec=el("tab-"+t);if(sec)sec.hidden=t!==name;});
  var bs=document.querySelectorAll(".tabs button");for(var i=0;i<bs.length;i++)bs[i].setAttribute("aria-selected",bs[i].getAttribute("data-tab")===name?"true":"false");
  store("nw.stats.tab",name);
  try{if(location.hash!=="#"+name)history.replaceState(null,"","#"+name);}catch(e){}
  // charts size themselves from the host width, which is 0 while hidden: draw again now that it is visible
  try{RERENDER[name]();}catch(e){}
  window.scrollTo({top:Math.max(0,el("grid").getBoundingClientRect().bottom+window.scrollY-8),behavior:"instant"});
}
// ---- product switch -------------------------------------------------------------------------------
// The two sims are separate products in separate databases, read independently. Switching is a real
// navigation, not a client-side swap: every panel's data, memo and edge-cache entry is per product, so
// a reload is both simpler and impossible to get half-applied. Racing is Nanawing 1 only — Nanawing 2
// is line-of-sight with no courses and no laps — so the tab is removed rather than shown empty.
var SIM_COPY={
  nanawing1:{host:"sim.narenana.com",what:"FPV racing and freestyle"},
  nanawing2:{host:"nanawing2.narenana.com",what:"line of sight"}
};
(function(){
  var c=SIM_COPY[SIM]||SIM_COPY.nanawing1;
  var lede=el("lede");
  if(lede)lede.textContent="Live numbers across everyone flying "+c.what+" at "+c.host+". The totals count every launch ever; everything else counts real players only (dev builds, probe runs and software renderers filtered out).";
  var sb=document.querySelectorAll(".sims button");
  for(var i=0;i<sb.length;i++){
    var s=sb[i].getAttribute("data-sim");
    sb[i].setAttribute("aria-selected",s===SIM?"true":"false");
    sb[i].onclick=function(){
      var next=this.getAttribute("data-sim");
      if(next===SIM)return;
      var u=new URL(location.href);
      u.searchParams.set("sim",next);
      u.hash=location.hash; // keep the reader on the same section across the switch
      location.assign(u.href);
    };
  }
  if(SIM!=="nanawing1"){
    var rt=document.querySelector('.tabs button[data-tab="racing"]');
    if(rt)rt.remove();
    var rs=el("tab-racing");
    if(rs)rs.remove();
    var ix=TABS.indexOf("racing");
    if(ix>=0)TABS.splice(ix,1);
    delete TAB_NAMES.racing;
  }
})();
(function(){var bs=document.querySelectorAll(".tabs button");for(var i=0;i<bs.length;i++){bs[i].onclick=function(){showTab(this.getAttribute("data-tab"));};}
  var h=(location.hash||"").slice(1);var initial=TABS.indexOf(h)>=0?h:(TABS.indexOf(load("nw.stats.tab"))>=0?load("nw.stats.tab"):"summary");
  TABS.forEach(function(t){var sec=el("tab-"+t);if(sec)sec.hidden=t!==initial;});
  for(i=0;i<bs.length;i++)bs[i].setAttribute("aria-selected",bs[i].getAttribute("data-tab")===initial?"true":"false");
  window.addEventListener("hashchange",function(){var x=(location.hash||"").slice(1);if(TABS.indexOf(x)>=0)showTab(x);});
})();

// ---- boot -------------------------------------------------------------------------------------------
chips("rangeChips","data-r",range,function(v){range=v;store("nw.stats.range",v);loadActivity();});
chips("wingChips","data-d",wingsDays,function(v){wingsDays=+v;loadWings();});
chips("hwChips","data-d",hwDays,function(v){hwDays=+v;loadHardware();});
chips("audChips","data-d",audDays,function(v){audDays=+v;loadAudience();});
loadTotals();loadActivity().then(loadPulse);loadSummary();loadWings();loadHardware();loadAudience();
setInterval(loadTotals,8000);
setInterval(function(){loadActivity().then(loadPulse);},300000);
setInterval(loadSummary,300000);
setInterval(loadWings,1500000);
setInterval(loadHardware,1500000);
setInterval(loadAudience,1500000);
</script></body></html>`;
