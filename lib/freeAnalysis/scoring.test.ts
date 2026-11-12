import { describe, expect, it } from 'vitest'
import { getAssessmentCopy } from './copy'
import {
  MAX_RAW, QUESTION_SPEC, TOTAL_QUESTIONS, WEIGHTS,
  buildFreeAnalysisView, computeScore, getBlockers, getClosingHook, getDimensionProfile,
  getMaturityLevel, getStrengths, parseFreeAnalysisInput, scoreFreeAnalysis,
} from './scoring'

const all = (v: number) => Object.fromEntries(QUESTION_SPEC.map(q => [q.id, v]))
const profile = { companyName: 'PT Maju Bersama', industry: 'retail', companySize: 'small' }
const en = getAssessmentCopy('en')

describe('free analysis instrument (identical to the landing page)', () => {
  it('has twelve questions with the landing page weights (total 13.7)', () => {
    expect(TOTAL_QUESTIONS).toBe(12)
    expect(Object.values(WEIGHTS).reduce((s, w) => s + w, 0)).toBeCloseTo(13.7, 10)
    expect(MAX_RAW).toBeCloseTo(41.1, 10)
    for (const q of QUESTION_SPEC) {
      expect(WEIGHTS[q.id]).toBeGreaterThan(0)
      expect(en.questions[q.id].options).toHaveLength(4)
      expect(getAssessmentCopy('id').questions[q.id].options).toHaveLength(4)
    }
  })

  it('scores the extremes 0 and 100', () => {
    expect(computeScore(all(0))).toBe(0)
    expect(computeScore(all(3))).toBe(100)
  })

  it('weights answers exactly like the landing page', () => {
    // Only data_availability (1.5) at 3: 4.5 / 41.1 = 10.9% → 11
    expect(computeScore({ ...all(0), data_availability: 3 })).toBe(11)
    // all 2: 2/3 → 67
    expect(computeScore(all(2))).toBe(67)
    // all 1: 1/3 → 33
    expect(computeScore(all(1))).toBe(33)
  })

  it('uses the paid maturity thresholds 80 / 65 / 50 / 35', () => {
    expect(getMaturityLevel(80)).toBe('Optimising')
    expect(getMaturityLevel(79)).toBe('Defined')
    expect(getMaturityLevel(65)).toBe('Defined')
    expect(getMaturityLevel(64)).toBe('Developing')
    expect(getMaturityLevel(50)).toBe('Developing')
    expect(getMaturityLevel(49)).toBe('Initiating')
    expect(getMaturityLevel(35)).toBe('Initiating')
    expect(getMaturityLevel(34)).toBe('Nascent')
  })

  it('names blockers below Defined and strengths at Developing or above, never both', () => {
    const answers = { ...all(1), data_availability: 3, systems_integration: 3, change_readiness: 2, internal_capability: 2 }
    const p = getDimensionProfile(answers, en)
    expect(p.find(d => d.key === 'data')!.score).toBe(100)
    expect(p.find(d => d.key === 'people')!.score).toBe(67)
    const blockers = getBlockers(p)
    expect(blockers.map(b => b.key)).toEqual(['process', 'strategy', 'governance'])
    const strengths = getStrengths(p, new Set(blockers.map(b => b.key)))
    expect(strengths.map(s => s.key)).toEqual(['data', 'people'])
  })

  it('leaves strengths empty when nothing reaches Developing', () => {
    const p = getDimensionProfile(all(1), en)
    const blockers = getBlockers(p)
    expect(getStrengths(p, new Set(blockers.map(b => b.key)))).toEqual([])
    expect(getClosingHook(p, en).finding).toMatch(/^Five parts/)
  })

  it('builds the localised view with narrative, quick note and insights', () => {
    const v = buildFreeAnalysisView({ ...profile, answers: all(2) }, 'id')
    expect(v.score).toBe(67)
    expect(v.maturity).toBe('Defined')
    expect(v.narrative).toContain('PT Maju Bersama')
    expect(v.narrative).toContain('67/100')
    expect(v.industryLabel).toBe('Ritel & e-commerce')
    expect(v.quickNote.title).toBe('Catatan singkat: 67/100 — Defined')
    expect(v.insights.length).toBeGreaterThan(0)
    expect(v.insights.length).toBeLessThanOrEqual(3)
  })
})

describe('parseFreeAnalysisInput', () => {
  it('accepts a complete submission', () => {
    expect(parseFreeAnalysisInput({ ...profile, answers: all(2) })).toEqual({ ...profile, answers: all(2) })
  })

  it('rejects partial, padded or out-of-range answers and a bad profile', () => {
    const { rework_rate: _omit, ...partial } = all(2)
    expect(parseFreeAnalysisInput({ ...profile, answers: partial })).toBeNull()
    expect(parseFreeAnalysisInput({ ...profile, answers: { ...all(2), extra: 1 } })).toBeNull()
    expect(parseFreeAnalysisInput({ ...profile, answers: { ...all(2), rework_rate: 4 } })).toBeNull()
    expect(parseFreeAnalysisInput({ ...profile, answers: { ...all(2), rework_rate: 1.5 } })).toBeNull()
    expect(parseFreeAnalysisInput({ ...profile, companyName: 'A', answers: all(2) })).toBeNull()
    expect(parseFreeAnalysisInput({ ...profile, industry: 'casino', answers: all(2) })).toBeNull()
    expect(parseFreeAnalysisInput(null)).toBeNull()
  })
})

describe('scoreFreeAnalysis', () => {
  it('stores canonical English labels and the server-computed score', () => {
    const at = new Date('2026-11-12T10:00:00Z')
    const s = scoreFreeAnalysis({ ...profile, answers: all(1) }, at)
    expect(s.score).toBe(33)
    expect(s.maturity).toBe('Nascent')
    expect(s.blockers).toEqual(['Process', 'Data', 'Strategy'])
    expect(s.dimensions).toEqual({ process: 33, data: 33, strategy: 33, governance: 33, people: 33 })
    expect(s.questionSetVersion).toBe(2)
    expect(s.completedAt).toBe('2026-11-12T10:00:00.000Z')
  })
})
