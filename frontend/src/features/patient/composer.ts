/**
 * Patient message composer — a pure state machine.
 * The final message is assembled ONLY from the patient's explicit selections using static templates.
 */
import {
  type CoreItem, type Lang, QUALITIES, QUICK_SENTENCE, REGION_LABEL, REGION_ORDER, type Region, SUB_REGIONS,
  type SubRegion, intensitySentence, painLocationSentence,
} from '../../lib/i18n'

export type Option = {
  id: string; text: string; label: string; clinician_label: string; pictogram_id?: string | null
  category?: string; anatomical_region?: string; response_type?: string; score?: number | null
}
export type Turn = {
  id: string; original_text: string; translated_text: string; simplified_text: string; ai_engine: string
  intent: { response_type?: string; intent?: string; translation_unavailable?: boolean; [k: string]: unknown }
  options: Option[]; created_at?: string
}
export type Sel = { step: string; phrase_id?: string | null; label: string; clinician_label: string }
export type Stage = 'idle' | 'options' | 'region' | 'subregion' | 'intensity' | 'quality' | 'review' | 'sent'

export type ComposerState = {
  stage: Stage
  turn: Turn | null
  region: Region | null
  regions: Region[]
  scaleOnly: boolean
  selections: Sel[]
  patientParts: string[]
  clinicianParts: string[]
  prev: ComposerState | null
}

export const initialComposer: ComposerState = {
  stage: 'idle', turn: null, region: null, regions: [], scaleOnly: false, selections: [], patientParts: [],
  clinicianParts: [], prev: null,
}

const DEFAULT_REGIONS: Region[] = ['head', 'chest', 'stomach', 'back', 'arms', 'legs', 'other']
const punct = (s: string) => (/[.!?。！？।]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`)

function push(s: ComposerState, patch: Partial<ComposerState>): ComposerState {
  return { ...s, ...patch, prev: s }
}

export type Ctx = { pl: Lang; cl: Lang }

export function onQuestion(_s: ComposerState, turn: Turn): ComposerState {
  const rt = turn.intent.response_type
  const base: ComposerState = { ...initialComposer, turn }
  if (rt === 'body_location') {
    const fromOptions = turn.options
      .map((o) => o.anatomical_region as Region)
      .filter((r): r is Region => REGION_ORDER.includes(r))
    const regions = REGION_ORDER.filter((r) => fromOptions.includes(r))
    return { ...base, stage: 'region', regions: regions.length >= 3 ? regions : DEFAULT_REGIONS }
  }
  if (rt === 'scale') return { ...base, stage: 'intensity', scaleOnly: true }
  return { ...base, stage: 'options' }
}

export function startPainFlow(s: ComposerState): ComposerState {
  return push(s, { stage: 'region', regions: DEFAULT_REGIONS, selections: [], patientParts: [], clinicianParts: [] })
}

export function chooseRegion(s: ComposerState, region: Region, c: Ctx): ComposerState {
  const sel: Sel = { step: 'location', phrase_id: `pain-${region}`, label: REGION_LABEL[c.pl][region], clinician_label: REGION_LABEL[c.cl][region] }
  const hasSub = !!SUB_REGIONS[region]
  if (hasSub) return push(s, { stage: 'subregion', region, selections: [...s.selections, sel] })
  return push(s, {
    stage: 'intensity', region, selections: [...s.selections, sel],
    patientParts: [painLocationSentence(c.pl, region)], clinicianParts: [painLocationSentence(c.cl, region)],
  })
}

export function chooseSub(s: ComposerState, sub: SubRegion | null, c: Ctx): ComposerState {
  const region = s.region!
  const selections = sub ? [...s.selections, { step: 'sub_location', label: sub.label[c.pl], clinician_label: sub.label[c.cl] }] : s.selections
  return push(s, {
    stage: 'intensity', selections,
    patientParts: [painLocationSentence(c.pl, region, sub?.label[c.pl])],
    clinicianParts: [painLocationSentence(c.cl, region, sub?.label[c.cl])],
  })
}

export function chooseIntensity(s: ComposerState, n: number, c: Ctx): ComposerState {
  const patientParts = [...s.patientParts, intensitySentence(c.pl, n)]
  const clinicianParts = [...s.clinicianParts, intensitySentence(c.cl, n)]
  const selections = [...s.selections, { step: 'intensity', label: `${n}/10`, clinician_label: `${n}/10` }]
  const next: Stage = s.scaleOnly || n === 0 ? 'review' : 'quality'
  return push(s, { stage: next, patientParts, clinicianParts, selections })
}

export function chooseQuality(s: ComposerState, key: string | null, c: Ctx): ComposerState {
  if (!key) return push(s, { stage: 'review' })
  const q = QUALITIES.find((x) => x.key === key)!
  return push(s, {
    stage: 'review',
    patientParts: [...s.patientParts, q.sentence[c.pl]],
    clinicianParts: [...s.clinicianParts, q.sentence[c.cl]],
    selections: [...s.selections, { step: 'quality', label: q.label[c.pl], clinician_label: q.label[c.cl] }],
  })
}

export function chooseOption(s: ComposerState, o: Option): ComposerState {
  return push(s, {
    stage: 'review',
    patientParts: [punct(o.label)], clinicianParts: [punct(o.clinician_label || o.text)],
    selections: [{ step: 'phrase', phrase_id: o.id, label: o.label, clinician_label: o.clinician_label || o.text }],
  })
}

export function chooseCore(s: ComposerState, item: CoreItem, c: Ctx): ComposerState {
  if (item.flow === 'pain') return startPainFlow(s)
  return push(s, {
    stage: 'review', patientParts: [item.sentence[c.pl]], clinicianParts: [item.sentence[c.cl]],
    selections: [{ step: 'core', phrase_id: item.id, label: item.label[c.pl], clinician_label: item.label[c.cl] }],
  })
}

export function chooseQuick(s: ComposerState, k: 'yes' | 'no' | 'unsure', c: Ctx): ComposerState {
  return push(s, {
    stage: 'review', patientParts: [QUICK_SENTENCE[k][c.pl]], clinicianParts: [QUICK_SENTENCE[k][c.cl]],
    selections: [{ step: 'quick', phrase_id: `gc-${k}`, label: QUICK_SENTENCE[k][c.pl], clinician_label: QUICK_SENTENCE[k][c.cl] }],
  })
}

export function back(s: ComposerState): ComposerState {
  return s.prev ?? { ...initialComposer, turn: s.turn, stage: s.turn ? onQuestion(initialComposer, s.turn).stage : 'idle' }
}

export function reset(s: ComposerState): ComposerState {
  return s.turn ? onQuestion(initialComposer, s.turn) : initialComposer
}

export function markSent(_s: ComposerState): ComposerState {
  return { ...initialComposer, stage: 'sent', turn: null }
}

export const patientMessage = (s: ComposerState) => s.patientParts.join(' ')
export const clinicianMessage = (s: ComposerState) => s.clinicianParts.join(' ')
