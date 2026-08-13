import { describe, expect, it } from 'vitest'
import { buildBlueprintPrompt, compactDiagnosticForBlueprint } from './blueprintGeneration'

describe('blueprint prompt grounding', () => {
  it('keeps business evidence while removing duplicated diagnostic projections', () => {
    const diagnostic = {
      diagnostic_id: 'diag-1',
      company: 'Bastion',
      scores: { composite: 61, maturityLevel: 'Developing', strategy: 80 },
      qualitative: { industry: 'Technology', primaryObjective: 'Improve operations' },
      risks: [{ risk: 'Runway risk', severity: 'MEDIUM' }],
      opportunities: [{ id: 'opp-1', title: 'Ticket automation', impact: 9 }],
      roomForImprovement: [{ area: 'Process', recommendedAction: 'Document workflows' }],
      roomForImprovementId: Array.from({ length: 100 }, () => ({ duplicated: true })),
      scoreDrivers: Array.from({ length: 100 }, () => ({ duplicated: true })),
    }

    const compact = compactDiagnosticForBlueprint(diagnostic)
    expect(compact.company).toBe('Bastion')
    expect((compact.opportunities as Array<Record<string, unknown>>)[0].title).toBe('Ticket automation')
    expect(compact).not.toHaveProperty('roomForImprovementId')
    expect(compact).not.toHaveProperty('scoreDrivers')
  })

  it('builds a materially smaller prompt than the raw diagnostic payload', () => {
    const diagnostic = {
      company: 'Bastion',
      scores: { composite: 61, maturityLevel: 'Developing' },
      qualitative: { industry: 'Technology', primaryObjective: 'Improve operations' },
      roomForImprovementId: Array.from({ length: 500 }, () => ({ verbose: 'duplicate projection '.repeat(20) })),
      scoreDriversId: Array.from({ length: 500 }, () => ({ verbose: 'duplicate projection '.repeat(20) })),
    }
    const prompt = buildBlueprintPrompt(diagnostic, 'en')
    expect(prompt.length).toBeLessThan(JSON.stringify(diagnostic).length)
  })
})
