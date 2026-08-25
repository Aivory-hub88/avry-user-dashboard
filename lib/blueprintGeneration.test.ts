import { describe, expect, it } from 'vitest'
import { buildBlueprintPrompt, compactDiagnosticForBlueprint, isUsableBlueprint, parseBlueprintContent } from './blueprintGeneration'

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

describe('isUsableBlueprint — catches syntactically-valid-but-empty JSON, not just parse failure', () => {
  const VALID = {
    workflow_modules: [{ workflow_id: 'w1', name: 'Ticket triage', trigger: 'new ticket', steps: [{ type: 'ingestion', action: 'capture' }], integrations_required: [] }],
  } as any

  it('accepts a blueprint with at least one real module', () => {
    expect(isUsableBlueprint(VALID)).toBe(true)
  })

  it('rejects an empty workflow_modules array (the exact shape that used to slip through as a "real" result)', () => {
    expect(isUsableBlueprint({ ...VALID, workflow_modules: [] })).toBe(false)
  })

  it('rejects a missing workflow_modules field entirely', () => {
    expect(isUsableBlueprint({ organization: { name: 'Acme' } } as any)).toBe(false)
  })

  it('rejects a module with no steps', () => {
    expect(isUsableBlueprint({ workflow_modules: [{ name: 'Empty module', steps: [] }] } as any)).toBe(false)
  })

  it('rejects a module with no name', () => {
    expect(isUsableBlueprint({ workflow_modules: [{ name: '', steps: [{ type: 'ingestion' }] }] } as any)).toBe(false)
  })

  it('rejects null/undefined', () => {
    expect(isUsableBlueprint(null)).toBe(false)
    expect(isUsableBlueprint(undefined)).toBe(false)
  })

  it('end-to-end: parseBlueprintContent + isUsableBlueprint together reject well-formed-but-empty model output', () => {
    const modelOutput = JSON.stringify({
      blueprint_id: 'BP-1', version: '1.0', status: 'draft',
      organization: { name: 'Acme', industry: 'Retail', size: 'sme' },
      workflow_modules: [], // the model returned valid JSON with nothing in it
    })
    const parsed = parseBlueprintContent(modelOutput)
    expect(parsed).not.toBeNull() // JSON.parse succeeds — this is the trap
    expect(isUsableBlueprint(parsed)).toBe(false) // but it must still be treated as unusable
  })
})
