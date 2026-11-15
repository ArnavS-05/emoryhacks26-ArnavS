import { describe, expect, it } from 'vitest'
import { SUB_REGIONS } from '../../lib/i18n'
import {
  back, chooseIntensity, chooseOption, chooseQuality, chooseQuick, chooseRegion, chooseSub, clinicianMessage,
  initialComposer, onQuestion, patientMessage, type Turn,
} from './composer'

const turn = (response_type: string, options: any[] = []): Turn => ({
  id: 't1', original_text: 'Where do you feel pain?', translated_text: '', simplified_text: '', ai_engine: 'x',
  intent: { response_type }, options,
})

describe('composer — signature pain flow', () => {
  it('builds the message only from explicit selections', () => {
    const c = { pl: 'en' as const, cl: 'en' as const }
    let s = onQuestion(initialComposer, turn('body_location', ['head', 'chest', 'stomach', 'back'].map((r) => ({ id: r, anatomical_region: r }))))
    expect(s.stage).toBe('region')
    s = chooseRegion(s, 'stomach', c)
    expect(s.stage).toBe('subregion')
    s = chooseSub(s, SUB_REGIONS.stomach![0], c)
    s = chooseIntensity(s, 6, c)
    expect(s.stage).toBe('quality')
    s = chooseQuality(s, 'sharp', c)
    expect(s.stage).toBe('review')
    expect(patientMessage(s)).toBe('I have pain in my stomach, upper right. My pain is 6 out of 10. It feels sharp.')
    expect(s.selections.map((x) => x.step)).toEqual(['location', 'sub_location', 'intensity', 'quality'])
  })

  it('translates deterministically for a Spanish-speaking patient and English clinician', () => {
    const c = { pl: 'es' as const, cl: 'en' as const }
    let s = onQuestion(initialComposer, turn('body_location'))
    s = chooseRegion(s, 'chest', c)
    s = chooseSub(s, null, c)
    s = chooseIntensity(s, 0, c)
    expect(s.stage).toBe('review') // zero pain skips quality
    expect(patientMessage(s)).toBe('Tengo dolor en el pecho. Mi dolor es 0 de 10.')
    expect(clinicianMessage(s)).toBe('I have pain in my chest. My pain is 0 out of 10.')
  })

  it('back undoes the last selection', () => {
    const c = { pl: 'en' as const, cl: 'en' as const }
    let s = onQuestion(initialComposer, turn('body_location'))
    s = chooseRegion(s, 'legs', c)
    s = back(s)
    expect(s.stage).toBe('region')
    expect(s.selections).toHaveLength(0)
  })

  it('yes/no and phrase options', () => {
    const c = { pl: 'en' as const, cl: 'en' as const }
    let s = onQuestion(initialComposer, turn('yes_no'))
    s = chooseQuick(s, 'no', c)
    expect(clinicianMessage(s)).toBe('No.')
    s = onQuestion(initialComposer, turn('choice'))
    s = chooseOption(s, { id: 'ed-thirsty', text: 'I am thirsty', label: 'Tengo sed', clinician_label: 'I am thirsty' })
    expect(patientMessage(s)).toBe('Tengo sed.')
    expect(clinicianMessage(s)).toBe('I am thirsty.')
  })
})
