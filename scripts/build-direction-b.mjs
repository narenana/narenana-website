// Local design study. The current homepage remains untouched.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const source = readFileSync('site/index.html', 'utf8');
const navigation = source.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
const lower = source.slice(source.indexOf('      <section class="los-section'), source.indexOf('    </main>'));
const footer = source.match(/<footer class="footer">[\s\S]*?<\/footer>/)[0];
mkdirSync('site/direction-b', { recursive: true });
writeFileSync('site/direction-b/index.html', `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#087bc1">
<title>narenana — The flight journal · Direction B</title>
<meta name="description" content="Fly Nanawing, the free browser FPV wing simulator. Discover Nanawing 2, compare RC aircraft in India, and explore your flight logs.">
<link rel="icon" href="/assets/avatar.jpg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/direction-b.css?v=4"><link rel="preload" as="image" href="/assets/shot-nanawing.webp">
<script defer src="/assets/home.js"></script><script defer src="/assets/direction-b.js"></script>
</head><body id="top"><a class="skip" href="#main">Skip to content</a>
<div class="preview-bar"><span>DESIGN STUDY / B — THE FLIGHT JOURNAL</span><a href="/">Compare with direction A ↗</a></div>
${navigation}
<main id="main">
<section class="flight-cover" id="nanawing" aria-labelledby="hero-title">
<div class="cover-intro"><span class="eyebrow">BUILT BY A PILOT. OPEN TO EVERYONE.</span><span class="eyebrow">SIMULATORS / AIRCRAFT / FIELD NOTES</span></div>
<div class="cover-heading"><h1 id="hero-title">LESS SCROLL.<br>MORE <em>FLIGHT.</em></h1><div class="cover-copy"><span class="eyebrow">01 / NANAWING</span><h2>Nanawing.<br>Your FPV playground.</h2><p>Meet Nanawing. A free FPV flying-wing simulator, right in your browser. Pick your line. Chase the gates. Go again.</p><a class="button" href="https://sim.narenana.com/" target="_blank" rel="noopener">Launch Nanawing <span aria-hidden="true">↗</span></a><span class="cover-note">NO DOWNLOAD. NO SIGNUP. JUST FLY.</span></div></div>
<div class="flight-window"><a class="flight-screen" href="https://sim.narenana.com/" target="_blank" rel="noopener" aria-label="Launch Nanawing FPV simulator"><img data-drift="22" src="/assets/shot-nanawing.webp" width="1200" height="750" alt="Nanawing simulator: a flying wing racing toward a gate over sunlit hills" fetchpriority="high"><span class="screen-label">ACTUAL SIMULATOR CAPTURE</span><span class="flight-launch">LET’S FLY <span aria-hidden="true">↗</span></span></a><div class="flight-margin"><span>NANAWING / FPV SIMULATOR</span><span>KEYBOARD · GAMEPAD · RC RADIO</span><a href="#review">THE GIZ FPV REVIEW ↓</a></div></div>
</section>
<section class="review-section" id="review" aria-labelledby="review-title"><div class="wrap">
<div class="editorial-label"><span>02 / THE PILOT’S PERSPECTIVE</span><span>GIZ FPV × NANAWING</span></div>
<div class="review-layout"><div class="review-copy"><span class="eyebrow">DON’T JUST TAKE MY WORD FOR IT</span><h2 id="review-title">A pilot.<br>A wing.<br><em>An honest review.</em></h2><p>Watch Giz FPV take Nanawing for a flight. The full review, playable right here.</p><a class="text-link" href="https://sim.narenana.com/" target="_blank" rel="noopener">Then take the controls ↗</a></div><div class="review-film"><div class="review-player"><iframe src="https://www.youtube-nocookie.com/embed/3x8sWLL6EhI?rel=0" title="Giz FPV reviews Nanawing — full review" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><div class="review-caption"><span>PRESS PLAY. GET THE PILOT’S VIEW.</span><a href="https://www.youtube.com/watch?v=3x8sWLL6EhI" target="_blank" rel="noopener">Watch on YouTube ↗</a></div></div></div></div></section>
${lower}
</main>${footer}</body></html>`);
