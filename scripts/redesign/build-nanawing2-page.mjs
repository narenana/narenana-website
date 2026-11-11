// Assemble site/nanawing2/index.html from nanawing2-page.template.html, the shared family shell and the page data below.
// Edit copy HERE (fleet, FAQ, description, share text) or in the template, never in site/nanawing2/index.html, then run:
//   node scripts/redesign/build-nanawing2-page.mjs && npm run assets:version
// The FAQ feeds both the visible answers and the FAQPage JSON-LD, so they cannot drift.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { familyNav, familyFooter } from '../brand-shell.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fleet = [
  ['sky-surfer', 'Sky Surfer X8', 'Foam pusher · Hand-tossed', 'A familiar 1480mm foam pusher. Start here for orientation, gentle circuits and belly landings.'],
  ['nanatrainer', 'NanaTrainer', 'High wing · Landing flaps', 'A high-wing runway trainer with a steerable nose wheel and flaps. Practise circuits, gentle approaches and touch-and-goes.'],
  ['nanajet', 'NanaJet', '6S EDF sport jet', 'Retract the wheels, line up a fast pass and hear the fan sweep past. Use the flaps on the approach back to the runway.'],
  ['nana3d', 'Nana3D', 'Lightweight 3D', 'Slow down, roll over and practise prop-hanging with a 940mm foam plane. Go gently on the sticks.'],
  ['nanasoar', 'NanaSoar', 'Powered sailplane · Crow brakes', 'A 3 m electric sailplane. Climb under power, then practise soaring and quiet approaches.'],
  ['nanaedge', 'NanaEdge', '35 cc petrol · Aerobatic', 'A 2 m petrol aerobat with a tailwheel. Fly big aerobatic manoeuvres, then keep it straight on the roll-out.'],
  ['nanadelta', 'NanaDelta', 'Pusher wing · Elevons', 'A broad 1.5 m pusher wing. Hand-launch, bank to turn and finish with a smooth belly landing.'],
  ['nanaracer', 'NanaRacer', '4S racer · Hand-tossed', 'A compact 4-channel racer. Build confidence on broad passes, then try tight turns and fast power-off approaches.'],
];
const altFor = { 'sky-surfer': 'The Sky Surfer X8, a white and orange foam pusher trainer', nanatrainer: 'The NanaTrainer, a high-wing trainer with a nose wheel', nanajet: 'The NanaJet, a sport jet with retractable wheels', nana3d: 'The Nana3D, a light foam 3D plane with large control surfaces', nanasoar: 'The NanaSoar, a 3 m electric sailplane', nanaedge: 'The NanaEdge, a 2 m petrol aerobatic plane with a tailwheel', nanadelta: 'The NanaDelta, a broad pusher flying wing', nanaracer: 'The NanaRacer, a compact electric racer' };
const card = ([id, name, kind, line]) => `            <li><a class="craft" href="https://nanawing2.narenana.com/?play&amp;aircraft=${id}" target="_blank" rel="noopener"><div class="shot"><img src="/assets/nanawing2/aircraft/${id}.webp" width="1600" height="900" alt="${esc(altFor[id])}" loading="lazy"></div><span class="kind">${esc(kind)}</span><h3>${esc(name)}</h3><p>${esc(line)}</p><span class="spec"><span>Fly the <b>${esc(name)}</b></span></span><span class="go" aria-hidden="true">↗</span></a></li>`;
const faq = [
  ['Is it really free?', ['Yes. No install, no login, no ads and no paid aircraft. It’s a personal project by narenana, an RC pilot.']],
  ['Do I need an RC radio or a gamepad?', ['No. All four flight controls work on a keyboard. A gamepad or an RC radio gives you sticks to practise with; set them up under Controls in the Hangar.']],
  ['Can I use my RadioMaster or EdgeTX radio?', ['Yes, in USB joystick mode. Plug it in and follow the calibration wizard: it maps the four flight controls, with optional trim buttons. If the wizard can’t see your radio, check its USB mode or try another browser.']],
  ['Can I fly offline?', ['Yes, once it has loaded fully online. Settings in the sim shows when it’s ready to fly offline. Keep the site data for nanawing2.narenana.com and it stays ready.']],
  ['Will it work on my phone?', ['To fly Nanawing 2, use a computer or a large tablet with a keyboard, gamepad or USB RC radio. On your phone, tap “Send it to your computer” and open the link there. Nanawing, the FPV sim, flies on a phone with two thumb sticks.']],
  ['Does it fly exactly like my real model?', ['Not exactly: your own plane will handle differently. Use it to practise orientation, control and approaches until they come naturally at the field.']],
  ['What’s the difference between Nanawing and Nanawing 2?', ['Nanawing 2 is line of sight: you stand beside the runway and watch the model. Nanawing puts you on board an FPV wing and lets you race other pilots. Both are free, with no install or login.']],
];
const faqHtml = faq.map(([q, a]) => `            <details><summary>${esc(q)}</summary><div>${a.map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>`).join('\n');
const description = 'Fly RC planes free in your browser with Nanawing 2. Hand-launch a trainer, fly circuits from the field and practise landings. No install, no login.';
const share = 'Stand on the field with your radio and fly line of sight: start on a foam trainer, then work up to a 2 m petrol aerobat. No install, no login.';
const url = 'https://www.narenana.com/nanawing2/';
const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': url + '#page', url, name: 'Nanawing 2: free RC plane simulator in your browser', description, inLanguage: 'en', isPartOf: { '@id': 'https://www.narenana.com/#website' }, about: { '@id': 'https://nanawing2.narenana.com/#app' }, primaryImageOfPage: 'https://www.narenana.com/assets/nanawing2/og.jpg', breadcrumb: { '@id': url + '#breadcrumbs' } },
    { '@type': 'BreadcrumbList', '@id': url + '#breadcrumbs', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.narenana.com/' }, { '@type': 'ListItem', position: 2, name: 'Nanawing 2', item: url }] },
    { '@type': 'SoftwareApplication', '@id': 'https://nanawing2.narenana.com/#app', name: 'Nanawing 2', url: 'https://nanawing2.narenana.com/?play', applicationCategory: 'GameApplication', operatingSystem: 'Web browser (Windows, macOS, Linux, ChromeOS) on a computer or a large tablet', browserRequirements: 'Requires WebGL2. No install, no login.', description: 'Free line-of-sight RC flight simulator in your browser. Stand on the field and practise hand launches, runway take-offs, circuits and landings on 8 aircraft, with a keyboard, a gamepad or a USB RC radio.', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@id': 'https://www.narenana.com/#org' } },
    { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.join(' ') } })) },
  ],
};
for (const [k, v] of [['description', description], ['share', share]]) console.log(k, v.length);
let html = readFileSync(new URL('./nanawing2-page.template.html', import.meta.url), 'utf8');
html = html.replace('@@HEADER@@', '    ' + familyNav({ home: '', avatar: '/assets/family/avatar.jpg' }))
  .replace('@@FOOTER@@', '    ' + familyFooter({ home: '' }))
  .replace('@@FLEET@@', fleet.map(card).join('\n'))
  .replace('@@FAQ@@', faqHtml)
  .replace('@@DESCRIPTION@@', esc(description))
  .replaceAll('@@SHARE@@', esc(share))
  .replace('@@JSONLD@@', JSON.stringify(jsonld, null, 2).replace(/</g, '\\u003c'));
if (/@@[A-Z]+@@/.test(html)) throw new Error('unfilled placeholder');
mkdirSync(join(ROOT, 'site', 'nanawing2'), { recursive: true });
writeFileSync(join(ROOT, 'site', 'nanawing2', 'index.html'), html);
console.log('written', html.length, 'bytes');
