import { describe, it, expect } from 'vitest'
import { localizeLlmResult, hasIndonesianAnalysis } from './llmResultLocale'

const EN = {
  score: 43,
  narrative_summary: 'English summary.',
  strengths: ['Leadership is supportive'],
  primary_constraints: ['No centralised data'],
  automation_opportunities: ['Automate order intake'],
  recommended_next_step: 'Digitise order capture.',
}
const WITH_ID = {
  ...EN,
  translations: {
    id: {
      narrative_summary: 'Ringkasan.',
      strengths: ['Kepemimpinan mendukung'],
      primary_constraints: ['Data belum terpusat'],
      automation_opportunities: ['Otomatiskan penerimaan pesanan'],
      recommended_next_step: 'Digitalkan pencatatan pesanan.',
    },
  },
}

describe('localizeLlmResult', () => {
  it('returns the Indonesian copy, including legacy aliases, for the id locale', () => {
    const v = localizeLlmResult(WITH_ID, 'id')!
    expect(v.isTranslatedId).toBe(true)
    expect(v.narrative_summary).toBe('Ringkasan.')
    expect(v.narrative).toBe('Ringkasan.')
    expect(v.blockers).toEqual(['Data belum terpusat'])
    expect(v.opportunities).toEqual(['Otomatiskan penerimaan pesanan'])
    expect(v.recommended_next_step).toBe('Digitalkan pencatatan pesanan.')
    expect(v.score).toBe(43)
  })

  it('keeps English for the en locale', () => {
    const v = localizeLlmResult(WITH_ID, 'en')!
    expect(v.isTranslatedId).toBe(false)
    expect(v.narrative_summary).toBe('English summary.')
  })

  it('falls back to English (flagged untranslated) for results stored before translations existed', () => {
    const v = localizeLlmResult(EN, 'id')!
    expect(v.isTranslatedId).toBe(false)
    expect(v.strengths).toEqual(EN.strengths)
    expect(hasIndonesianAnalysis(EN)).toBe(false)
  })

  it('keeps an English field when its translation is missing', () => {
    const partial = { ...EN, translations: { id: { narrative_summary: 'Ringkasan.', strengths: [] } } }
    const v = localizeLlmResult(partial, 'id')!
    expect(v.narrative_summary).toBe('Ringkasan.')
    expect(v.strengths).toEqual(EN.strengths)
  })

  it('passes null through', () => {
    expect(localizeLlmResult(null, 'id')).toBeNull()
  })
})
