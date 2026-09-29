// The curator's prompts and output schemas, versioned. Each task's `v` is part
// of the AI cache key (ai.mjs): change a prompt or a schema, bump its `v`, and
// only the items that task touches are asked again. Seller text is data inside
// the user message; nothing a model returns takes effect without the checks in
// validate.mjs.

import { ROLE_TAGS } from '../public.mjs'

const strict = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const str = (maxLength) => ({ type: 'string', maxLength })
const quotes = (maxItems, maxLength = 120) => ({ type: 'array', maxItems, items: str(maxLength) })
const unit = { type: 'number', minimum: 0, maximum: 1 }
const span = { type: ['integer', 'null'], minimum: 150, maximum: 4000 }

export const KINDS = ['airframe', 'multirotor', 'helicopter', 'part', 'electronics', 'power', 'radio', 'tool', 'other']

// ------------------------------------------------------------ listing-v1
// One pending listing. `configs` is the category's own list (category.configs,
// migration 0002) plus 'unstated', so the schema follows the data.
const LISTING_LINES = [
  'You read one listing from an Indian RC hobby shop and return facts for a price-comparison catalog of fixed-wing RC aircraft. Use only the text you are given. If the text does not state something, return "" or null. Do not guess.',
  'kind: "airframe" = a fixed-wing RC airplane, flying wing or glider sold as a kit, ARF, PNP, BNF or RTF. "multirotor" = drones and quadcopters. "helicopter". "part" = spare or repair parts for a plane (wing, fuselage, canopy, landing gear, decals). "electronics" = motors, ESCs, servos, flight controllers, receivers, cameras, VTX. "power" = batteries, chargers. "radio" = transmitters, goggles, radio modules. "tool" = tools, glue, foam board, balsa or carbon stock, hardware. "other".',
  "brand: the aircraft manufacturer, copied as written, only if the text names it. A shop's own name is not the brand unless the shop makes the plane. brand_quote: the exact words you took it from.",
  'model: the plane\'s model name as written, without the brand, the configuration (kit, ARF, PNP, PNF, BNF, RTF, combo, set, "crash a lot" pack, "with electronics"), colour, livery or paint scheme, radio details, and shop words ("RC airplane", "for beginners", "India", "buy"). Keep the words that identify the airframe: version and mark (V2, X8, Mk II, Pro), size (1400mm, 37in, 40", .46 size) and series codes (F959S, 761-5). Do not add words that are not in the text. Use normal capitalisation, not ALL CAPS.',
  'config: kit (airframe only, ARF, kit only), pnp (motor, ESC and servos fitted, no radio; BNF and PNF count as pnp), rtf (includes a transmitter), combo (a bundle: "combo", "set", "crash a lot" pack, with electronics or spares), unstated.',
  'span_mm: wingspan in millimetres only when stated (inches × 25.4, cm × 10), not the length. span_quote: the exact words.',
  'power: electric, gas (glow, nitro, petrol, a cc or .NN engine size) or unknown. pack_qty: aircraft in the listing, normally 1. evidence: up to 3 short exact quotes supporting kind and model. confidence: 0 to 1 for kind and model together.',
]
const LISTING_SYSTEM = LISTING_LINES.join('\n')
// The brand, model, span and power rules, which master-v1 refers to.
const LISTING_RULES = [LISTING_LINES[2], LISTING_LINES[3], LISTING_LINES[5], 'power: electric, gas (glow, nitro, petrol, a cc or .NN engine size) or unknown.']

export const LISTING_TEXT_CHARS = 1200

export function listingTask(configs = ['kit', 'pnp', 'rtf', 'combo']) {
  return {
    task: 'listing',
    v: 'listing-v1',
    maxOut: 400,
    system: LISTING_SYSTEM,
    schema: strict({
      kind: { enum: KINDS },
      brand: str(40),
      brand_quote: str(80),
      model: str(60),
      config: { enum: [...configs, 'unstated'] },
      span_mm: span,
      span_quote: str(80),
      power: { enum: ['electric', 'gas', 'unknown'] },
      pack_qty: { type: 'integer', minimum: 1, maximum: 10 },
      evidence: quotes(3),
      confidence: unit,
    }),
    // input: { title, shop, text, configs } — configs is hashed, not shown
    user: (i) => `Title: ${i.title}\nShop: ${i.shop}\nListing text: ${String(i.text ?? '').slice(0, LISTING_TEXT_CHARS)}`,
  }
}

// ------------------------------------------------------------- master-v1
// One model page: fill, name and roles in a single call.
const ROLE_FLAGS = ['fpv_intent', 'beginner_trainer', 'glider', 'scale_replica', 'jet', 'warbird', 'aerobatic', 'airliner', 'sport']
const MASTER_SYSTEM = [
  'You review one model page of a price-comparison catalog of fixed-wing RC aircraft sold in India: its current brand, name and wingspan and the shop listings attached to it. Use only this text. brand/brand_quote, model, span_mm/span_quote and power follow the listing rules. fixed_wing: false if the listings are a helicopter, multirotor or not a fixed-wing aircraft. Role facts, from the text and your knowledge of the model: fpv_intent = sold or designed for FPV, long-range or survey flying; a flying-wing shape alone is not FPV. beginner_trainer = a purpose-built learn-to-fly model (high-wing trainer lines, gyro-stabilised beginner RTFs, classic .40 trainers, budget beginner foamies); a scale model marketed as easy (Cessna, Cub, Maule) is NOT a trainer. glider = glider or sailplane. scale_replica, jet (jet or EDF), warbird, aerobatic (built for aerobatics/3D), airliner, sport (general sport or park flyer). tags: role tags from this list only: [ROLE_TAGS], most defining first. confidence for brand, model, span and roles (confidence_brand, confidence_model, confidence_span, confidence_roles), each 0 to 1.',
  // "The listing rules" above, copied word for word from listing-v1, because
  // this call does not see that prompt.
  'The listing rules:',
  ...LISTING_RULES,
].join('\n').replace('[ROLE_TAGS]', ROLE_TAGS.map((t) => JSON.stringify(t)).join(', '))

export const MASTER_LISTINGS = 5
export const MASTER_TEXT_CHARS = 400

// The schema is flat: the design's nested {roles:{…}, confidence:{…}} sent
// gemma-4 into a whitespace loop inside the nested object on 2 of 5 real calls
// (finish_reason 'length' at 450 tokens, 2026-09-30); the same fields flat
// finished in ~210 tokens. Hence v2: the v1 wording, a flat schema.
export const MASTER_TASK = {
  task: 'master',
  v: 'master-v2',
  maxOut: 450,
  system: MASTER_SYSTEM,
  schema: strict({
    brand: str(40),
    brand_quote: str(80),
    model: str(60),
    span_mm: span,
    span_quote: str(80),
    power: { enum: ['electric', 'gas', 'unknown'] },
    fixed_wing: { type: 'boolean' },
    ...Object.fromEntries(ROLE_FLAGS.map((f) => [f, { type: 'boolean' }])),
    tags: { type: 'array', maxItems: 3, items: { enum: ROLE_TAGS } },
    confidence_brand: unit,
    confidence_model: unit,
    confidence_span: unit,
    confidence_roles: unit,
  }),
  // input: { brand, name, span_mm, power, tags, listings: [{shop,title,config,text}] }
  user: (i) => JSON.stringify(i),
}

// --------------------------------------------------------------- pair-v1
// Two entries: master vs master, or a listing vs a master.
const PAIR_SYSTEM = [
  'You decide whether two entries in a catalog of fixed-wing RC aircraft are the same model: the same airframe from the same manufacturer. Use only this text and what you reliably know about these models.',
  'These do NOT make a different model: configuration (kit, ARF, PNP, BNF, RTF, combo, "set", "crash a lot" pack, with or without electronics), colour, livery or paint scheme, bundled radio or electronics, pack size, and how shops word their titles.',
  'These DO make a different model: a different wingspan or size class (40in vs 37in), a different version or mark (V2 vs V3, X8 vs V3, Mk I vs Mk II) unless the listings show they are one airframe, a different manufacturer, glow or gas vs electric.',
  'Answer "unsure" when the text cannot settle it. Do not answer "same" just because the names are similar.',
  'Return verdict (same/different/unsure), confidence 0–1, same_manufacturer and same_size (yes/no/unknown), config_or_colour_only (true if the only differences are of the "do NOT" kind), differences (up to 4, e.g. "V3 vs X8"), evidence (up to 3 exact quotes from the titles), name (the plain shared model name if same: no brand, configuration or colour, 45 characters or fewer, words from the titles only; else "").',
].join('\n')

const yesNo = { enum: ['yes', 'no', 'unknown'] }
export const PAIR_TASK = {
  task: 'pair',
  v: 'pair-v1',
  maxOut: 400,
  system: PAIR_SYSTEM,
  schema: strict({
    verdict: { enum: ['same', 'different', 'unsure'] },
    confidence: unit,
    same_manufacturer: yesNo,
    same_size: yesNo,
    config_or_colour_only: { type: 'boolean' },
    differences: quotes(4, 60),
    evidence: quotes(3),
    name: str(45),
  }),
  // input: { A: {brand,name,span_mm,power,listings:[{shop,title,config}]}, B: {…} }
  user: (i) => JSON.stringify(i),
}

// -------------------------------------------------------------- probe-v1
// Model health, first phase of every run. Never cached.
export const PROBE_TASK = {
  task: 'probe',
  v: 'probe-v1',
  maxOut: 20,
  system: '',
  schema: strict({ ok: { type: 'boolean' } }),
  user: () => 'Reply with the JSON object {"ok": true}.',
}

export { ROLE_FLAGS }
