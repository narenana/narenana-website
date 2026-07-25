// Structured, editable facts derived from an accepted manufacturer product.
//
// The extractor is deliberately conservative: silence is unknown, marketing
// claims remain claims, and generic package/item weights never become AUW.
// The admin stores only manual overrides; suggestions are regenerated from the
// currently accepted product. A present override key always wins, including an
// explicit JSON null used to clear a suggestion.

const option = (value, label) => ({ value, label })

export const PROFILE_FIELDS = [
  {
    key: 'controlLayout',
    label: 'Control layout',
    group: 'Aircraft',
    type: 'enum',
    options: [
      option('conventional', 'Conventional'),
      option('v_tail', 'V-tail'),
      option('elevon', 'Elevon / flying wing'),
      option('rudder_elevator', 'Rudder + elevator'),
      option('differential_thrust', 'Differential thrust'),
      option('mixed_vtol', 'Mixed / VTOL'),
      option('other', 'Other'),
    ],
  },
  { key: 'channels', label: 'Minimum channels', group: 'Aircraft', type: 'integer', min: 1, max: 32 },
  {
    key: 'controlSurfaces',
    label: 'Control surfaces',
    group: 'Aircraft',
    type: 'multi',
    options: [
      option('aileron', 'Ailerons'),
      option('elevator', 'Elevator'),
      option('rudder', 'Rudder'),
      option('elevon', 'Elevons'),
      option('flaps', 'Flaps'),
      option('spoilers', 'Spoilers'),
      option('differential_thrust', 'Differential thrust'),
    ],
  },
  { key: 'motorCount', label: 'Motor / engine count', group: 'Aircraft', type: 'integer', min: 0, max: 16 },
  {
    key: 'propulsionType',
    label: 'Propulsion type',
    group: 'Aircraft',
    type: 'enum',
    options: [
      option('propeller', 'Propeller'),
      option('edf', 'EDF'),
      option('turbine', 'Turbine'),
      option('unpowered', 'Unpowered'),
      option('mixed', 'Mixed'),
      option('other', 'Other'),
    ],
  },
  {
    key: 'propulsionPosition',
    label: 'Propulsion position',
    group: 'Aircraft',
    type: 'enum',
    options: [
      option('tractor', 'Tractor'),
      option('pusher', 'Pusher'),
      option('mixed', 'Mixed'),
      option('not_applicable', 'Not applicable'),
      option('other', 'Other'),
    ],
  },
  {
    key: 'difficulty',
    label: 'Flying difficulty',
    group: 'Flying',
    type: 'enum',
    options: [
      option('beginner', 'Beginner-friendly'),
      option('intermediate', 'Intermediate'),
      option('intermediate_advanced', 'Intermediate / advanced'),
      option('advanced', 'Advanced'),
    ],
  },
  {
    key: 'stabilization',
    label: 'Stabilization',
    group: 'Flying',
    type: 'enum',
    options: [
      option('included', 'Included'),
      option('optional', 'Optional'),
      option('none', 'None'),
    ],
  },
  { key: 'difficultyNotes', label: 'Difficulty notes', group: 'Flying', type: 'text', maxLength: 1200 },
  { key: 'recommendedAuwMinG', label: 'Good AUW minimum', group: 'Weight', type: 'integer', unit: 'g', min: 1, max: 200000 },
  { key: 'recommendedAuwMaxG', label: 'Good AUW maximum', group: 'Weight', type: 'integer', unit: 'g', min: 1, max: 200000 },
  { key: 'maxAuwG', label: 'Maximum AUW', group: 'Weight', type: 'integer', unit: 'g', min: 1, max: 250000 },
  { key: 'payloadG', label: 'Payload', group: 'Weight', type: 'integer', unit: 'g', min: 0, max: 200000 },
  {
    key: 'fpvReadiness',
    label: 'FPV readiness',
    group: 'FPV / FC',
    type: 'enum',
    options: [
      option('purpose_built', 'Purpose-built'),
      option('easy_fit', 'Easy fit'),
      option('modification_needed', 'Modification needed'),
      option('not_recommended', 'Not recommended'),
    ],
  },
  {
    key: 'fcReadiness',
    label: 'Flight-controller readiness',
    group: 'FPV / FC',
    type: 'enum',
    options: [
      option('purpose_built', 'Purpose-built'),
      option('easy_fit', 'Easy fit'),
      option('modification_needed', 'Modification needed'),
      option('not_recommended', 'Not recommended'),
    ],
  },
  { key: 'fpvFcNotes', label: 'FPV / FC notes', group: 'FPV / FC', type: 'text', maxLength: 1200 },
  {
    key: 'lowSpeedBehavior',
    label: 'Low-speed behaviour',
    group: 'Field use',
    type: 'enum',
    options: [
      option('excellent', 'Excellent'),
      option('good', 'Good / forgiving'),
      option('average', 'Average'),
      option('demanding', 'Demanding'),
    ],
  },
  {
    key: 'stallBehavior',
    label: 'Stall behaviour',
    group: 'Field use',
    type: 'enum',
    options: [
      option('gentle', 'Gentle'),
      option('moderate', 'Moderate'),
      option('sharp', 'Sharp / tip-stall prone'),
    ],
  },
  { key: 'lowSpeedNotes', label: 'Low-speed notes', group: 'Field use', type: 'text', maxLength: 1200 },
  {
    key: 'launchMethods',
    label: 'Take-off / launch',
    group: 'Field use',
    type: 'multi',
    options: [
      option('hand_launch', 'Hand launch'),
      option('ground_roll', 'Ground roll'),
      option('bungee', 'Bungee / catapult'),
      option('vtol', 'VTOL'),
      option('water', 'Water'),
    ],
  },
  {
    key: 'landingMethods',
    label: 'Landing method',
    group: 'Field use',
    type: 'multi',
    options: [
      option('wheels', 'Wheels'),
      option('belly', 'Belly'),
      option('skid', 'Skid'),
      option('vtol', 'VTOL'),
      option('water', 'Water'),
      option('hand_catch', 'Hand catch'),
    ],
  },
  {
    key: 'fieldRequirement',
    label: 'Field / runway requirement',
    group: 'Field use',
    type: 'enum',
    options: [
      option('rough_grass_ok', 'Rough grass is okay'),
      option('mown_grass_ok', 'Mown grass is okay'),
      option('smooth_runway_recommended', 'Smooth runway recommended'),
      option('paved_runway_required', 'Paved runway required'),
      option('no_runway_needed', 'No runway needed'),
      option('water_only', 'Water only'),
    ],
  },
  { key: 'fieldNotes', label: 'Field notes', group: 'Field use', type: 'text', maxLength: 1200 },
]

export const PROFILE_SCHEMA = Object.freeze(
  Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, Object.freeze(field)])),
)

const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key)
const compact = (value) =>
  String(value ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const firstMatch = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match
  }
  return null
}

const evidenceExcerpt = (text, match, max = 190) => {
  if (!match) return ''
  const index = Math.max(0, match.index ?? text.indexOf(match[0]))
  const before = Math.max(0, index - 55)
  const after = Math.min(text.length, index + match[0].length + 90)
  let excerpt = compact(text.slice(before, after))
  if (before > 0) excerpt = '…' + excerpt
  if (after < text.length) excerpt += '…'
  return excerpt.slice(0, max)
}

const grams = (raw, unit) => {
  const value = Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(value) || value < 0) return null
  const u = String(unit).toLowerCase()
  const factor =
    /^(?:kg|kilogram)/.test(u) ? 1000 :
      /^(?:lb|pound)/.test(u) ? 453.59237 :
        /^(?:oz|ounce)/.test(u) ? 28.349523125 : 1
  return Math.round(value * factor)
}

const readSpecs = (specs) => {
  if (!specs) return {}
  if (typeof specs === 'object' && !Array.isArray(specs)) return specs
  try {
    const parsed = JSON.parse(specs)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Derive high-confidence, manufacturer-backed suggestions.
 *
 * Returns:
 *   suggestions: {fieldKey: normalizedValue}
 *   evidence:    {fieldKey: short supporting excerpt}
 *   sources:     {fieldKey: {kind:'manufacturer_text', confidence:'explicit'}}
 */
export function extractManufacturerFacts({ title = '', bodyText = '', spanMM = null, specs = {} } = {}) {
  // Parse for caller tolerance even though the current profile does not duplicate
  // wingspan/material fields already shown elsewhere in the admin.
  void spanMM
  void readSpecs(specs)

  const text = compact([title, bodyText].filter(Boolean).join(' | '))
  const suggestions = {}
  const evidence = {}
  const sources = {}

  const suggest = (key, value, match, confidence = 'explicit') => {
    if (!PROFILE_SCHEMA[key] || value == null || own(suggestions, key)) return
    suggestions[key] = value
    evidence[key] = evidenceExcerpt(text, match)
    sources[key] = { kind: 'manufacturer_text', confidence }
  }

  // Controls: feature words are useful on their own; the overall layout is
  // assigned only when the manufacturer says enough to support it.
  const surfacePatterns = [
    ['aileron', [/\bailerons?\b/i]],
    ['elevator', [/\belevators?\b/i, /\bfull[- ]flying stab(?:ilizer)?\b/i]],
    ['rudder', [/\brudders?\b/i]],
    ['elevon', [/\belevons?\b/i, /\belevens?\b/i]],
    ['flaps', [/\bflaps?\b/i]],
    ['spoilers', [/\bspoilers?\b/i]],
    ['differential_thrust', [/\bdifferential[- ]thrust\b/i]],
  ]
  const surfaces = []
  let surfaceEvidence = null
  for (const [surface, patterns] of surfacePatterns) {
    const match = firstMatch(text, patterns)
    if (match) {
      surfaces.push(surface)
      surfaceEvidence ||= match
    }
  }
  if (surfaces.length) suggest('controlSurfaces', surfaces, surfaceEvidence)

  const vtol = firstMatch(text, [/\bVTOL\b/i, /\bvertical take[- ]?off and landing\b/i])
  const differential = firstMatch(text, [/\bdifferential[- ]thrust\b/i])
  const vTail = firstMatch(text, [/\bV[- ]?tail\b/i])
  const elevon = firstMatch(text, [/\belevons?\b/i, /\belevens?\b/i])
  if (vtol) suggest('controlLayout', 'mixed_vtol', vtol)
  else if (differential) suggest('controlLayout', 'differential_thrust', differential)
  else if (vTail) suggest('controlLayout', 'v_tail', vTail)
  else if (elevon) suggest('controlLayout', 'elevon', elevon)
  else if (surfaces.includes('aileron') && surfaces.includes('elevator') && surfaces.includes('rudder'))
    suggest('controlLayout', 'conventional', surfaceEvidence)
  else if (!surfaces.includes('aileron') && surfaces.includes('elevator') && surfaces.includes('rudder'))
    suggest('controlLayout', 'rudder_elevator', surfaceEvidence)

  const moreThanChannels = text.match(/\bmore than\s+(\d{1,2})\s*(?:-| )?(?:ch|channels?)\b/i)
  const exactChannels = text.match(/\b(\d{1,2})\s*(?:-| )?(?:ch|channels?)\b/i)
  // Prefer the first stated fact. Product titles/spec headers commonly say
  // "5CH" before body copy such as "5 channel or more than 5 channel"; the
  // latter describes receiver flexibility and must not inflate the aircraft's
  // minimum channel count to six. A standalone "more than 5 channels" still
  // correctly becomes six.
  const useMoreThan =
    moreThanChannels &&
    (!exactChannels || (moreThanChannels.index ?? Infinity) < (exactChannels.index ?? Infinity))
  const channelMatch = useMoreThan ? moreThanChannels : exactChannels
  if (channelMatch) {
    const count = Number(channelMatch[1]) + (useMoreThan ? 1 : 0)
    if (count >= 1 && count <= 32) suggest('channels', count, channelMatch)
  }

  // Propulsion is decomposed so "twin pusher propeller" does not need a huge
  // combinatorial enum.
  const edf = firstMatch(text, [/\bEDF\b/i, /\belectric ducted fan\b/i, /\bducted[- ]fan\b/i])
  const turbine = firstMatch(text, [/\bturbine(?: powered)?\b/i])
  const propeller = firstMatch(text, [
    /\bpropellers?\b/i,
    /\bprop\b/i,
    /\b(?:brushless|coreless|electric)\s+motors?\b/i,
    /\bmotors?\b/i,
    /\bengines?\b/i,
  ])
  if (edf) suggest('propulsionType', 'edf', edf)
  else if (turbine) suggest('propulsionType', 'turbine', turbine)
  else if (propeller) suggest('propulsionType', 'propeller', propeller)

  const twinMotor = firstMatch(text, [
    /\b(?:twin|dual)[-\s]*(?:engine|motor)s?\b/i,
    /\b(?:twin|dual)\b[^.;]{0,18}\bEDF\b/i,
    /\b(?:engine|motor)s?\b[^.;]{0,12}\b(?:twin|dual)\b/i,
  ])
  const countedMotor = firstMatch(text, [
    /\b([2-9])\s*[x×]\s*[^.;]{0,25}\b(?:motors?|engines?|EDF)\b/i,
    /\b(?:motors?|engines?)\s*[:=][^.;]{0,28}[*x×]\s*([2-9])\b/i,
  ])
  const singleMotor = firstMatch(text, [/\bsingle[-\s]*(?:engine|motor)\b/i, /\bone[-\s]*(?:engine|motor)\b/i])
  if (twinMotor) suggest('motorCount', 2, twinMotor)
  else if (countedMotor) suggest('motorCount', Number(countedMotor[1]), countedMotor)
  else if (singleMotor) suggest('motorCount', 1, singleMotor)

  const pusher = firstMatch(text, [/\bpusher(?: design| glider| configuration)?\b/i, /\brear[- ]mounted prop(?:eller)?\b/i])
  const tractor = firstMatch(text, [/\btractor(?: design| configuration)?\b/i, /\bfront[- ]mounted prop(?:eller)?\b/i])
  if (pusher && tractor) suggest('propulsionPosition', 'mixed', pusher)
  else if (pusher) suggest('propulsionPosition', 'pusher', pusher)
  else if (tractor) suggest('propulsionPosition', 'tractor', tractor)
  else if (edf) suggest('propulsionPosition', 'not_applicable', edf)

  // Difficulty remains explicitly a manufacturer claim. Avoid "easy assembly"
  // and other phrases that say nothing about flying.
  const intermediateAdvanced = firstMatch(text, [
    /\bflying skill level\s*:?\s*intermediate\s*[/&-]\s*advanced\b/i,
    /\bfor intermediate\s*[/&-]\s*advanced pilots?\b/i,
  ])
  const notForBeginners = firstMatch(text, [
    /\b(?:not|unsuitable)\s+for beginners?\b/i,
    /\bnot (?:a )?beginner[- ]friendly\b/i,
  ])
  const beginner = notForBeginners ? null : firstMatch(text, [
    /\bflying skill level\s*:?\s*beginner\b/i,
    /\bbeginner[- ]friendly\b/i,
    /\bbeginner (?:RC )?(?:trainer|plane|airplane|glider|warbird|jet)\b/i,
    /\b(?:designed|engineered|suitable|ideal|perfect)\b[^.;]{0,65}\bfor (?:absolute )?beginners?\b/i,
    /\b(?:easy|simple)\s+to\s+(?:fly|control)\b/i,
    /\bblessing for beginners?\b/i,
  ])
  const advanced = firstMatch(text, [
    /\bflying skill level\s*:?\s*advanced\b/i,
    /\b(?:requires?|for)\s+(?:an?\s+)?(?:advanced|experienced)\s+pilots?\b/i,
  ])
  const intermediate = firstMatch(text, [
    /\bflying skill level\s*:?\s*intermediate\b/i,
    /\bfor intermediate (?:users?|pilots?)\b/i,
  ])
  if (intermediateAdvanced) suggest('difficulty', 'intermediate_advanced', intermediateAdvanced, 'manufacturer_claim')
  else if (beginner) suggest('difficulty', 'beginner', beginner, 'manufacturer_claim')
  else if (advanced) suggest('difficulty', 'advanced', advanced, 'manufacturer_claim')
  else if (intermediate) suggest('difficulty', 'intermediate', intermediate, 'manufacturer_claim')

  const noStabilization = firstMatch(text, [/\b(?:no|without)\s+(?:gyro|stabili[sz](?:ation|er))\b/i])
  const optionalStabilization = firstMatch(text, [/\boptional\s+(?:gyro|stabili[sz](?:ation|er))\b/i])
  const includedStabilization = firstMatch(text, [
    /\bXpilot\b/i,
    /\b(?:built[- ]in|integrated|included|equipped with)\b[^.;]{0,55}\b(?:gyro|stabili[sz](?:ation|er))\b/i,
    /\b(?:gyro|stabili[sz](?:ation|er))\b[^.;]{0,35}\b(?:built[- ]in|integrated|included)\b/i,
  ])
  if (noStabilization) suggest('stabilization', 'none', noStabilization)
  else if (optionalStabilization) suggest('stabilization', 'optional', optionalStabilization)
  else if (includedStabilization) suggest('stabilization', 'included', includedStabilization)

  // Only labels that unambiguously describe flying/take-off weight qualify.
  // Bare "weight" and "item weight" are intentionally ignored.
  const number = String.raw`(\d[\d,]*(?:\.\d+)?)`
  const unit = String.raw`(kilograms?|kg|grams?|g|pounds?|lbs?|ounces?|oz)`
  const goodWeightLabel = String.raw`(?:recommend(?:ed)?\s+)?(?:AUW|all[- ]?up weight|flying weight|flight weight|take[- ]?off weight)`
  const maxWeight = text.match(new RegExp(
    String.raw`\bmax(?:imum)?\.?\s*(?:recommended\s+)?(?:take[- ]?off|flying|flight|all[- ]?up)?\s*weight\b[^0-9]{0,20}${number}\s*${unit}`,
    'i',
  ))
  if (maxWeight) suggest('maxAuwG', grams(maxWeight[1], maxWeight[2]), maxWeight)

  const weightRange = text.match(new RegExp(
    String.raw`\b${goodWeightLabel}\b[^0-9]{0,20}${number}\s*(?:-|to)\s*${number}\s*${unit}`,
    'i',
  ))
  const weightSingle = weightRange ? null : text.match(new RegExp(
    String.raw`\b${goodWeightLabel}\b[^0-9]{0,20}${number}\s*${unit}`,
    'i',
  ))
  const maxContext = (match) =>
    !!match && /\bmax(?:imum)?\.?\s*$/i.test(text.slice(Math.max(0, (match.index ?? 0) - 15), match.index ?? 0))
  if (weightRange && !maxContext(weightRange)) {
    const a = grams(weightRange[1], weightRange[3])
    const b = grams(weightRange[2], weightRange[3])
    if (a != null && b != null) {
      suggest('recommendedAuwMinG', Math.min(a, b), weightRange)
      suggest('recommendedAuwMaxG', Math.max(a, b), weightRange)
    }
  } else if (weightSingle && !maxContext(weightSingle)) {
    const value = grams(weightSingle[1], weightSingle[2])
    if (value != null) {
      suggest('recommendedAuwMinG', value, weightSingle)
      suggest('recommendedAuwMaxG', value, weightSingle)
    }
  }

  const payloadAfter = text.match(new RegExp(
    String.raw`\b(?:maximum|max\.?\s*)?payload(?: capacity)?\b[^0-9]{0,20}${number}\s*${unit}`,
    'i',
  ))
  const payloadBefore = payloadAfter ? null : text.match(new RegExp(
    String.raw`\b${number}\s*${unit}\s+payload(?: capacity)?\b`,
    'i',
  ))
  const payload = payloadAfter || payloadBefore
  if (payload) suggest('payloadG', grams(payload[1], payload[2]), payload)

  // FPV/FC suitability needs structural evidence; a bare "FPV" in a product
  // title does not prove that there is usable room or a mount.
  const fpvPurpose = firstMatch(text, [
    /\b(?:purpose[- ]built|specially designed|designed)\b[^.;]{0,65}\bfor (?:long[- ]range )?FPV\b/i,
    /\b(?:FPV|camera|VTX)\s+(?:bay|compartment|slot|mount(?:ing)?(?: platform)?)\b/i,
    /\bFPV\s+camera\s+mounts?\b/i,
    /\b(?:pre[- ]cut hole|flat bed)\b[^.;]{0,75}\b(?:FPV|camera)\b/i,
    /\bpre[- ]installed camera cable\b/i,
    /\bexclusive installation positions?\b[^.;]{0,90}\b(?:FPV|VTX|camera)\b/i,
  ])
  const fpvEasy = firstMatch(text, [
    /\b(?:room|space|capacity)\b[^.;]{0,60}\bfor\b[^.;]{0,45}\b(?:FPV|camera|VTX)\b/i,
    /\bcompatible with\b[^.;]{0,55}\b(?:FPV|video transmission|camera|GoPro)\b/i,
    /\bFPV[- ]capable\b/i,
  ])
  const fpvModify = firstMatch(text, [/\b(?:FPV|camera)\b[^.;]{0,45}\b(?:requires?|needs?)\s+(?:cutting|modification)\b/i])
  const fpvNo = firstMatch(text, [/\b(?:not compatible|not recommended|does not support)\b[^.;]{0,45}\b(?:FPV|camera|VTX)\b/i])
  if (fpvNo) suggest('fpvReadiness', 'not_recommended', fpvNo)
  else if (fpvModify) suggest('fpvReadiness', 'modification_needed', fpvModify)
  else if (fpvPurpose) suggest('fpvReadiness', 'purpose_built', fpvPurpose)
  else if (fpvEasy) suggest('fpvReadiness', 'easy_fit', fpvEasy)

  const fcPurpose = firstMatch(text, [
    /\b(?:dedicated|exclusive|reserved)\b[^.;]{0,45}\b(?:position|space|bay|mount|slot)s?\b[^.;]{0,55}\bflight controller\b/i,
    /\bflight controller\s+(?:bay|compartment|slot|mount(?:ing)?(?: position)?)\b/i,
    /\bexclusive installation positions?\b[^.;]{0,90}\bflight controller\b/i,
  ])
  const fcEasy = firstMatch(text, [
    /\b(?:room|space)\b[^.;]{0,55}\b(?:flight controllers?|autopilot)\b/i,
    /\b(?:flight controller|flight control equipment)\b[^.;]{0,55}\b(?:easy to (?:install|fit)|installation)\b/i,
  ])
  const fcModify = firstMatch(text, [/\bflight controller\b[^.;]{0,45}\b(?:requires?|needs?)\s+(?:cutting|modification)\b/i])
  const fcNo = firstMatch(text, [/\b(?:not compatible|not recommended|does not support)\b[^.;]{0,45}\b(?:flight controller|autopilot)\b/i])
  if (fcNo) suggest('fcReadiness', 'not_recommended', fcNo)
  else if (fcModify) suggest('fcReadiness', 'modification_needed', fcModify)
  else if (fcPurpose) suggest('fcReadiness', 'purpose_built', fcPurpose)
  else if (fcEasy) suggest('fcReadiness', 'easy_fit', fcEasy)

  const excellentLowSpeed = firstMatch(text, [/\bexcellent\b[^.;]{0,35}\blow[- ]speed\b/i, /\blow[- ]speed\b[^.;]{0,35}\bexcellent\b/i])
  const goodLowSpeed = firstMatch(text, [
    /\b(?:enhanced|excellent|good)\s+low[- ]speed\b[^.;]{0,30}\b(?:stability|handling|flight)\b/i,
    /\b(?:stable|forgiving|predictable)\b[^.;]{0,35}\b(?:at )?low[- ]speed\b/i,
    /\blow[- ]speed\b[^.;]{0,35}\b(?:stable|forgiving|predictable)\b/i,
    /\bcruise slowly\b/i,
    /\bfly stable\b[^.;]{0,45}\blow[- ]speed\b/i,
  ])
  const demandingLowSpeed = firstMatch(text, [
    /\b(?:poor|demanding|unstable)\b[^.;]{0,35}\blow[- ]speed\b/i,
    /\b(?:requires?|needs?)\b[^.;]{0,30}\bhigh landing speed\b/i,
  ])
  if (excellentLowSpeed) suggest('lowSpeedBehavior', 'excellent', excellentLowSpeed, 'manufacturer_claim')
  else if (goodLowSpeed) suggest('lowSpeedBehavior', 'good', goodLowSpeed, 'manufacturer_claim')
  else if (demandingLowSpeed) suggest('lowSpeedBehavior', 'demanding', demandingLowSpeed, 'manufacturer_claim')

  const gentleStall = firstMatch(text, [/\b(?:gentle|forgiving|predictable)\s+stall(?:ing)?\b/i])
  const sharpStall = firstMatch(text, [/\b(?:sharp|sudden|violent)\s+stall(?:ing)?\b/i, /\btip[- ]stall(?:ing)?\b/i])
  const moderateStall = firstMatch(text, [/\bmoderate\s+stall(?:ing)?\b/i])
  if (gentleStall) suggest('stallBehavior', 'gentle', gentleStall, 'manufacturer_claim')
  else if (sharpStall) suggest('stallBehavior', 'sharp', sharpStall, 'manufacturer_claim')
  else if (moderateStall) suggest('stallBehavior', 'moderate', moderateStall, 'manufacturer_claim')

  const launchPatterns = [
    ['hand_launch', [/\bhand[- ]launch(?:ed|ing)?\b/i, /\bhand (?:throw|thrown)\b/i]],
    ['ground_roll', [/\bground take[- ]?off\b/i, /\b(?:runway|rolling) take[- ]?off\b/i]],
    ['bungee', [/\b(?:bungee|catapult) launch(?:ed|ing)?\b/i]],
    ['vtol', [/\bVTOL\b/i, /\bvertical take[- ]?off\b/i]],
    ['water', [/\bwater take[- ]?off\b/i, /\bseaplane\b/i]],
  ]
  const launchMethods = []
  let launchEvidence = null
  for (const [method, patterns] of launchPatterns) {
    const match = firstMatch(text, patterns)
    if (match) {
      launchMethods.push(method)
      launchEvidence ||= match
    }
  }
  if (launchMethods.length) suggest('launchMethods', launchMethods, launchEvidence)

  const landingPatterns = [
    ['wheels', [/\blanding gear\b/i, /\bundercarriage\b/i]],
    ['belly', [/\bbelly[- ]land(?:ed|ing)?\b/i]],
    ['skid', [/\blanding skid\b/i]],
    ['vtol', [/\bVTOL\b/i, /\bvertical take[- ]?off and landing\b/i]],
    ['water', [/\bwater landing\b/i, /\bseaplane\b/i]],
    ['hand_catch', [/\bhand[- ]catch(?:ing)?\b/i]],
  ]
  const landingMethods = []
  let landingEvidence = null
  for (const [method, patterns] of landingPatterns) {
    const match = firstMatch(text, patterns)
    if (match) {
      landingMethods.push(method)
      landingEvidence ||= match
    }
  }
  if (landingMethods.length) suggest('landingMethods', landingMethods, landingEvidence)

  const roughGrass = firstMatch(text, [/\brough grass\b/i, /\brough[- ]field\b/i, /\boff[- ]road landing gear\b/i])
  const mownGrass = firstMatch(text, [/\b(?:short|mown|cut) grass\b/i, /\bgrass (?:field|runway)\b/i])
  const paved = firstMatch(text, [/\b(?:paved|asphalt|tarmac) runway (?:is )?required\b/i])
  const smooth = firstMatch(text, [/\b(?:smooth|good) runway (?:is )?(?:recommended|required)\b/i])
  const noRunway = firstMatch(text, [/\bno runway (?:is )?(?:needed|required)\b/i])
  const waterOnly = firstMatch(text, [/\bwater[- ]only\b/i])
  if (roughGrass) suggest('fieldRequirement', 'rough_grass_ok', roughGrass)
  else if (mownGrass) suggest('fieldRequirement', 'mown_grass_ok', mownGrass)
  else if (paved) suggest('fieldRequirement', 'paved_runway_required', paved)
  else if (smooth) suggest('fieldRequirement', 'smooth_runway_recommended', smooth)
  else if (noRunway) suggest('fieldRequirement', 'no_runway_needed', noRunway)
  else if (waterOnly) suggest('fieldRequirement', 'water_only', waterOnly)

  return { suggestions, evidence, sources }
}

const enumValues = (field) => new Set((field.options || []).map((item) => item.value))
const enumToken = (value) => compact(value).toLowerCase().replace(/[\s-]+/g, '_')

/**
 * Validate and normalize a partial manual override patch.
 * A null is retained intentionally: it means "clear the harvested suggestion".
 */
export function normalizeProfilePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('profile patch must be an object')

  const out = {}
  for (const [key, raw] of Object.entries(input)) {
    if (!own(PROFILE_SCHEMA, key)) throw new TypeError(`unknown profile field "${key}"`)
    const field = PROFILE_SCHEMA[key]
    if (raw === null) {
      out[key] = null
      continue
    }

    if (field.type === 'integer') {
      if (typeof raw === 'string' && !raw.trim()) {
        out[key] = null
        continue
      }
      const value = typeof raw === 'number' ? raw : Number(compact(raw).replace(/,/g, ''))
      if (!Number.isInteger(value) || value < field.min || value > field.max)
        throw new TypeError(`${key} must be an integer from ${field.min} to ${field.max}`)
      out[key] = value
      continue
    }

    if (field.type === 'text') {
      if (typeof raw !== 'string') throw new TypeError(`${key} must be text or null`)
      const value = raw.trim()
      if (!value) {
        out[key] = null
        continue
      }
      if (value.length > field.maxLength)
        throw new TypeError(`${key} must be at most ${field.maxLength} characters`)
      out[key] = value
      continue
    }

    if (field.type === 'enum') {
      if (typeof raw !== 'string') throw new TypeError(`${key} must be one of its supported values`)
      const value = enumToken(raw)
      if (!enumValues(field).has(value))
        throw new TypeError(`${key} must be one of: ${[...enumValues(field)].join(', ')}`)
      out[key] = value
      continue
    }

    if (field.type === 'multi') {
      const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : null
      if (!values) throw new TypeError(`${key} must be an array`)
      const allowed = enumValues(field)
      const normalized = [...new Set(values.map(enumToken).filter(Boolean))]
      const bad = normalized.find((value) => !allowed.has(value))
      if (bad) throw new TypeError(`${key} contains unsupported value "${bad}"`)
      out[key] = normalized
      continue
    }

    throw new TypeError(`unsupported profile field type for "${key}"`)
  }
  return out
}

/**
 * Validate relationships that cannot be checked one field at a time.
 * Returns the original object so callers can validate inline before storing.
 */
export function validateProfileValues(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new TypeError('profile values must be an object')
  const minimum = values.recommendedAuwMinG
  const recommendedMaximum = values.recommendedAuwMaxG
  const absoluteMaximum = values.maxAuwG
  if (minimum != null && recommendedMaximum != null && minimum > recommendedMaximum)
    throw new TypeError('Good AUW minimum cannot exceed good AUW maximum')
  if (minimum != null && absoluteMaximum != null && minimum > absoluteMaximum)
    throw new TypeError('Good AUW minimum cannot exceed maximum AUW')
  if (recommendedMaximum != null && absoluteMaximum != null && recommendedMaximum > absoluteMaximum)
    throw new TypeError('Good AUW maximum cannot exceed maximum AUW')
  return values
}

/**
 * Overlay manual overrides on harvested suggestions without treating null as
 * missing. Unknown keys are ignored defensively.
 */
export function mergeProfile(suggestions = {}, overrides = {}) {
  const merged = {}
  for (const { key } of PROFILE_FIELDS) {
    if (own(suggestions, key)) merged[key] = suggestions[key]
    if (own(overrides, key)) merged[key] = overrides[key]
  }
  return merged
}
