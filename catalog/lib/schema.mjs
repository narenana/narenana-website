// A small JSON-schema checker for the subset the curator's prompts use. No
// dependencies. It checks type (including an array of types, for nullable
// fields), enum, minimum/maximum, maxLength, maxItems, items, properties,
// required and additionalProperties:false. Anything else in a schema is
// ignored, so a schema can carry keywords a model understands but this
// checker does not.
//
// check(schema, value) → { ok, errors: ['$.span_mm: above maximum 4000', …] }

const typeOk = (t, v) => {
  switch (t) {
    case 'null': return v === null
    case 'boolean': return typeof v === 'boolean'
    case 'integer': return typeof v === 'number' && Number.isInteger(v)
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'string': return typeof v === 'string'
    case 'array': return Array.isArray(v)
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v)
    default: return false
  }
}

function walk(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return
  if (schema.type != null) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => typeOk(t, value))) {
      errors.push(`${path}: expected ${types.join('|')}`)
      return
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) {
    errors.push(`${path}: not one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`)
    return
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`)
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`)
  }
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength)
    errors.push(`${path}: longer than ${schema.maxLength}`)
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`)
    if (schema.items) value.forEach((v, i) => walk(schema.items, v, `${path}[${i}]`, errors))
  }
  if (typeOk('object', value)) {
    const props = schema.properties ?? {}
    for (const k of schema.required ?? []) if (!Object.hasOwn(value, k)) errors.push(`${path}.${k}: required`)
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k)) walk(props[k], v, `${path}.${k}`, errors)
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: not allowed`)
    }
  }
}

export function check(schema, value) {
  const errors = []
  walk(schema, value, '$', errors)
  return { ok: errors.length === 0, errors }
}
