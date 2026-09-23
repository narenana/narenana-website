import { extractManufacturerFacts, PROFILE_FIELDS } from './mfr-profile.mjs'

// Only explicit, physical facts from an accepted manufacturer identity are
// public. Handling/difficulty recommendations remain editorial review work.
const publicKeys = new Set(['channels','motorCount','propulsionType','recommendedAuwMinG','recommendedAuwMaxG','maxAuwG','payloadG'])
export function manufacturerReference(row) {
  if (!row || row.match_status !== 'accepted' || !/^https:\/\//.test(row.url || '')) return null
  const facts = extractManufacturerFacts({title:row.title,bodyText:row.body_text})
  const properties = []
  if (Number.isFinite(row.span_mm) && row.span_mm > 0) properties.push({name:'Wingspan',value:row.span_mm,unit:'mm'})
  for (const f of PROFILE_FIELDS) {
    if (!publicKeys.has(f.key) || facts.sources[f.key]?.confidence !== 'explicit') continue
    const value = facts.suggestions[f.key]
    if (value == null) continue
    const display = f.options ? f.options.find(o=>o.value===value)?.label : value
    if (display != null) properties.push({name:f.label.replace('Good AUW','Recommended all-up weight'),value:display,unit:f.unit || ''})
  }
  return {url:row.url,properties,checked:row.fetched_at}
}
export function productOverview(model, offers) {
  if (model.blurb?.trim()) return model.blurb.trim()
  let specs={};try{specs=JSON.parse(model.specs||'{}')}catch{}
  const span=Number(specs.spanMM)
  const name=[model.brand,model.name].filter(Boolean).join(' ')
  const configs=[...new Set(offers.filter(o=>!o.dead).map(o=>o.config).filter(Boolean))]
  const sellers=new Set(offers.filter(o=>!o.dead).map(o=>o.source_name).filter(Boolean)).size
  const detail=Number.isFinite(span)&&span>0?` The catalog lists a ${span.toLocaleString('en-IN')} mm wingspan.`:''
  const availability=configs.length?` Compare ${configs.join(', ')} listings${sellers?` from ${sellers} Indian seller${sellers===1?'':'s'}`:''}, with prices and stock checks below.`:' Current and last-seen seller offers are listed below.'
  return `${name}.${detail}${availability} Check each package’s included equipment before choosing.`
}
