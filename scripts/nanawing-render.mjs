// Shared rendering for the Nanawing content pages on www (scripts/build-nanawing-pages.mjs,
// scripts/build-nanawing-landing.mjs): the escapes, number formats, aircraft images and the
// spec card, so the hangar page and an aircraft's landing page show the same figures the
// same way.
import sharp from 'sharp';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const ext = 'target="_blank" rel="noopener"';
// The sim's play link for an aircraft (facts.playUrl), as an attribute value.
export const play = (facts, id) => facts.playUrl.replace('{id}', id).replace(/&/g, '&amp;');
export const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const weight = (kg) => (kg < 1 ? `${fmt(kg * 1000)}&nbsp;g` : `${fmt(kg, 1)}&nbsp;kg`);
// A number never wraps away from its unit; values break only at the ' · ' separators.
export const battery = (b) => esc(b).replace(/ (mAh|A)\b/g, '&nbsp;$1');
export const IMG = (id, w) => `/assets/nanawing/aircraft/${id}-${w}.webp`;

export const ALT = {
  desertwing: 'Nanawing One, a blue flying wing with a single pusher prop',
  morok: 'Morok UAV, a silver swept wing with a single fin and a pusher prop',
  sukhoi: 'Sukhoi S-70 Okhotnik, a grey, angular flying wing',
  spectre: 'WUDFLY Spectre, a white and yellow twin-motor flying wing with SPECTRE and WUDFLY lettering',
  chupito: 'TBS Chupito, a dark grey flying wing with a single fin, a red pusher prop and white logos and lettering',
  darkwing: 'Darkwing, a glossy black 3D-printed flying wing with two blue pusher props',
};

// Real pixel sizes, so every <img> reserves its space (no layout shift).
export async function imageDims(aircraft) {
  const dims = {};
  for (const a of aircraft) {
    const m = await sharp(`site${IMG(a.id, 900)}`).metadata();
    dims[a.id] = { w: m.width, h: m.height };
  }
  return dims;
}
export const img = (a, dims, sizes, { eager = false, cls = '' } = {}) =>
  `<img${cls ? ` class="${cls}"` : ''} src="${IMG(a.id, 900)}" srcset="${IMG(a.id, 560)} 560w, ${IMG(a.id, 900)} 900w, ${IMG(a.id, 1400)} 1400w" sizes="${sizes}" alt="${esc(ALT[a.id])}" width="${dims[a.id].w}" height="${dims[a.id].h}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;

export function credit(a) {
  const c = a.credit;
  if (c.kind === 'cc-by') return `Model: <a href="${c.source}" ${ext}>“${esc(c.title)}”</a> by ${esc(c.author)}, <a href="${c.licenseUrl}" ${ext}>${esc(c.license)}</a>. Modified for Nanawing.`;
  if (c.kind === 'designer') return `Aircraft design by <a href="${c.designerUrl}" ${ext}>${esc(c.designer)}</a>.`;
  // A real airframe Nanawing recreates with its maker's permission (the TBS Chupito): credit the maker and
  // link their product page wherever the aircraft is shown (Team BlackSheep's terms, 15 Oct 2026).
  if (c.kind === 'reference') return `Reference airframe by <a href="${c.url}" ${ext}>${esc(c.designer)}</a>.`;
  return esc(c.text);
}

export const specRows = [
  ['Top speed', (a) => `${fmt(a.topSpeedKmh)}&nbsp;km/h`],
  ['Stall speed', (a) => `${fmt(a.stallSpeedKmh)}&nbsp;km/h`],
  ['Roll rate', (a) => `${fmt(a.rollRateDegS)}°/s`],
  ['Climb rate', (a) => `${fmt(a.climbRateMs, 1)}&nbsp;m/s`],
  ['Wingspan', (a) => `${fmt(a.spanM, 2)}&nbsp;m`],
  ['Weight', (a) => weight(a.massKg)],
  // Whole newtons stay whole (26 N); the Chupito's 14.71 N shows as the Hangar shows it, not rounded to 15.
  ['Thrust', (a) => `${fmt(a.thrustN, Number.isInteger(a.thrustN) ? 0 : 2)}&nbsp;N`],
  ['Battery', (a) => battery(a.battery)],
];
