import { describe, expect, it } from 'vitest'
import { getAssessmentCopy } from './copy'
import { QUESTION_SPEC, buildFreeAnalysisView } from './scoring'
import { buildAssessmentPdf } from './pdf'

describe('free analysis PDF', () => {
  it('builds a one-page report from a scored run (fonts fall back offline)', async () => {
    const answers = Object.fromEntries(QUESTION_SPEC.map((q, i) => [q.id, i % 4]))
    const input = { companyName: 'PT Maju', industry: 'retail', companySize: 'small', answers }
    const v = buildFreeAnalysisView(input, 'en')
    const copy = getAssessmentCopy('en')
    const pdf = await buildAssessmentPdf({
      companyName: input.companyName, industryLabel: v.industryLabel, sizeLabel: v.sizeLabel,
      score: v.score, maturity: v.maturity, quickNote: v.quickNote,
      profile: v.profile.map(d => ({ label: d.label, score: d.score, driverLabel: d.weakest.label, driverScore: d.weakest.score })),
      strengths: v.strengths.map(s => s.label), blockers: v.blockers.map(b => b.label),
      insights: v.insights, narrative: v.narrative, closingHook: v.closingHook,
      diagnosticId: 'DIAG_TEST0001', generatedAt: new Date('2026-11-12T00:00:00Z'),
      upgradeUrl: 'https://example.test/dashboard/subscriptions',
      strings: copy.pdf, labels: copy.card, locale: 'en',
    })
    expect(pdf.getNumberOfPages()).toBe(1)
    expect(String(pdf.output()).length).toBeGreaterThan(1000)
  })
})
