/**
 * Flight Debrief payload validator — SERVER side.
 *
 * ⚠ KEEP IN SYNC with edgetx-log-parser/src/debrief/payload.js
 * (validatePayload + the constants). The client builds and pre-validates
 * the payload; this mirror re-validates independently because the
 * endpoint is public and curl doesn't run our client. Hostile-but-valid
 * fixtures in scripts/debrief-api-check.mjs exercise every rule.
 */
export const FINDING_IDS = ['L0', 'B0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'R1', 'R2', 'R3', 'R4', 'B1', 'B2', 'B3', 'B4', 'M1', 'M2', 'X1', 'X2']
export const CLASSES = ['electrical', 'link', 'battery', 'mechanical', 'meta']
export const SEVERITIES = ['info', 'notice', 'warning', 'critical']

export const EVIDENCE_KEYS = {
  E1: ['end_marker', 'dropped_main', 'dropped_gps', 'pad_bytes'],
  E2: ['alt_agl_at_end', 'gspd_at_end'],
  E3: ['sag_vbat_final_v', 'temp_step_c', 'invalid_flag_count'],
  E4: ['ends_midair', 'unterminated', 'death_rattle', 'vbat_stable_before', 'vbat_sigma_v', 'amps_at_cutoff', 'alt_agl_at_end'],
  E5: ['impedance_baseline_mohm', 'impedance_late_mohm'],
  E6: ['dip_v', 'recovered_v', 'cells'],
  R1: ['count', 'first_phase', 'airborne'],
  R2: ['window_count', 'longest_s', 'loss_slant_m', 'max_slant_m', 'slant_ratio', 'pattern'],
  R3: ['metric', 'flight_median', 'late_median', 'distance_correlated'],
  R4: ['window_count', 'longest_s', 'median_rate'],
  B1: ['ir_per_cell_mohm', 'punch_count', 'chemistry'],
  B2: ['end_v_per_cell', 'cells', 'chemistry'],
  B3: ['gap_growth_per_cell_v'],
  B4: ['duration_s', 'mah_used', 'avg_current_a', 'end_v_per_cell', 'cells'],
  M1: ['high_vib_total_s', 'longest_s', 'vib_median'],
  M2: ['window_count', 'longest_s'],
  X1: [], X2: ['skipped_count'],
  L0: ['max_slant_m', 'edge_min_lq'],
  B0: ['max_current_a', 'at_throttle_pct', 'full_throttle_current_a'],
}
const EVIDENCE_ENUMS = {
  metric: ['lq', 'rssi'],
  chemistry: ['lipo', 'liion', 'unknown'],
  pattern: ['range_boundary', 'close_in', 'mixed'],
}
const MAX_FINDINGS = 24
export const MAX_PAYLOAD_BYTES = 8192

export function validatePayload(p) {
  const errs = []
  const push = m => errs.push(m)
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['payload: not an object']
  const topKeys = ['v', 'context', 'findings', 'clean']
  for (const k of Object.keys(p)) if (!topKeys.includes(k)) push(`unknown top-level key: ${k}`)
  if (p.v !== 1) push('v: must be 1')
  if (typeof p.clean !== 'boolean') push('clean: must be boolean')

  const c = p.context
  if (!c || typeof c !== 'object') push('context: missing')
  else {
    const ck = ['source', 'fw', 'target', 'duration_s', 'cells', 'has_gps']
    for (const k of Object.keys(c)) if (!ck.includes(k)) push(`context: unknown key ${k}`)
    if (!['blackbox', 'edgetx-csv'].includes(c.source)) push('context.source: bad enum')
    if (c.fw != null && !/^(INAV|Betaflight|EmuFlight) \d+\.\d+\.\d+$/.test(c.fw)) push('context.fw: bad format')
    if (c.target != null && !/^[A-Z0-9_]{1,30}$/.test(c.target)) push('context.target: bad format')
    if (c.duration_s != null && !(Number.isFinite(c.duration_s) && c.duration_s >= 0 && c.duration_s < 86400)) push('context.duration_s: out of range')
  }

  if (!Array.isArray(p.findings)) push('findings: not an array')
  else {
    if (p.findings.length > MAX_FINDINGS) push(`findings: more than ${MAX_FINDINGS}`)
    const seen = new Set()
    for (const f of p.findings) {
      if (!f || typeof f !== 'object') { push('finding: not an object'); continue }
      const fk = ['id', 'class', 'severity', 'confidence', 't', 'evidence']
      for (const k of Object.keys(f)) if (!fk.includes(k)) push(`finding ${f.id}: unknown key ${k}`)
      if (!FINDING_IDS.includes(f.id)) { push(`finding: unknown id ${f.id}`); continue }
      if (seen.has(f.id) && f.id !== 'B2') push(`finding: duplicate id ${f.id}`)
      seen.add(f.id)
      if (!CLASSES.includes(f.class)) push(`finding ${f.id}: bad class`)
      if (!SEVERITIES.includes(f.severity)) push(`finding ${f.id}: bad severity`)
      if (!(f.confidence >= 0 && f.confidence <= 1)) push(`finding ${f.id}: bad confidence`)
      if (f.t != null && !(Array.isArray(f.t) && f.t.length === 2 && f.t.every(x => Number.isFinite(x) && x >= 0 && Number.isInteger(x)))) push(`finding ${f.id}: bad t`)
      const allowed = EVIDENCE_KEYS[f.id] || []
      if (f.evidence && typeof f.evidence === 'object' && !Array.isArray(f.evidence)) {
        for (const [k, v] of Object.entries(f.evidence)) {
          if (!allowed.includes(k)) push(`finding ${f.id}: evidence key ${k} not allowed`)
          else if (typeof v === 'string' && !(EVIDENCE_ENUMS[k] || []).includes(v)) push(`finding ${f.id}: evidence ${k} string not in enum`)
          else if (!['number', 'boolean', 'string'].includes(typeof v)) push(`finding ${f.id}: evidence ${k} bad type`)
          else if (typeof v === 'number' && !Number.isFinite(v)) push(`finding ${f.id}: evidence ${k} not finite`)
        }
      } else if (f.evidence != null) push(`finding ${f.id}: evidence not an object`)
    }
  }
  if (errs.length === 0 && JSON.stringify(p).length > MAX_PAYLOAD_BYTES) push('payload: exceeds 8KB')
  return errs
}
