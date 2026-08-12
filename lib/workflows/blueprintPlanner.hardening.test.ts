/**
 * Hardening — the blueprint module is LLM/user-generated content reaching
 * this planner over an HTTP API, not trusted internal data. These tests
 * cover the "enterprise grade" concerns: malformed input never crashes,
 * oversized/adversarial input is capped rather than allowed to blow up
 * output size or hang, and sanitize/plan never throw.
 */
import { describe, it, expect } from 'vitest'
import {
  sanitizeBlueprintModuleInput,
  planWorkflowFromBlueprintModule,
  validatePlannedWorkflow,
  MAX_BLUEPRINT_STEPS,
  MAX_ACTION_TEXT_LENGTH,
  MAX_INTEGRATIONS,
  type PlannedStep,
} from './blueprintPlanner'

function flatten(steps: PlannedStep[]): PlannedStep[] {
  const out: PlannedStep[] = []
  for (const s of steps) {
    out.push(s)
    for (const b of s.branches ?? []) out.push(...flatten(b.steps))
  }
  return out
}

describe('sanitizeBlueprintModuleInput', () => {
  it('rejects an empty steps array', () => {
    const result = sanitizeBlueprintModuleInput({ steps: [] })
    expect(result.module).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects a non-array steps field', () => {
    const result = sanitizeBlueprintModuleInput({ steps: 'not an array' })
    expect(result.module).toBeNull()
  })

  it('rejects a payload with more than MAX_BLUEPRINT_STEPS steps', () => {
    const steps = Array.from({ length: MAX_BLUEPRINT_STEPS + 1 }, (_, i) => ({ type: 'execution', action: `Step ${i}` }))
    const result = sanitizeBlueprintModuleInput({ steps })
    expect(result.module).toBeNull()
    expect(result.errors[0]).toMatch(/exceeds the maximum/i)
  })

  it('accepts exactly MAX_BLUEPRINT_STEPS steps', () => {
    const steps = Array.from({ length: MAX_BLUEPRINT_STEPS }, (_, i) => ({ type: 'execution', action: `Step ${i}` }))
    const result = sanitizeBlueprintModuleInput({ steps })
    expect(result.module).not.toBeNull()
    expect(result.module!.steps.length).toBe(MAX_BLUEPRINT_STEPS)
  })

  it('drops steps with no usable action text and warns', () => {
    const result = sanitizeBlueprintModuleInput({
      steps: [{ type: 'execution', action: 'Do something' }, { type: 'execution', action: '   ' }, { type: 'execution' }],
    })
    expect(result.module!.steps.length).toBe(1)
    expect(result.warnings.some((w) => /dropped/i.test(w))).toBe(true)
  })

  it('rejects when every step has no usable action text', () => {
    const result = sanitizeBlueprintModuleInput({ steps: [{ action: '' }, { action: '   ' }] })
    expect(result.module).toBeNull()
  })

  it('coerces an unknown step type to execution and warns', () => {
    const result = sanitizeBlueprintModuleInput({ steps: [{ type: 'bogus_type', action: 'Do the thing' }] })
    expect(result.module!.steps[0].type).toBe('execution')
    expect(result.warnings.some((w) => /unknown step type/i.test(w))).toBe(true)
  })

  it('defaults a missing step type to execution without a warning (not "unknown", just absent)', () => {
    const result = sanitizeBlueprintModuleInput({ steps: [{ action: 'Do the thing' }] })
    expect(result.module!.steps[0].type).toBe('execution')
    expect(result.warnings.some((w) => /unknown step type/i.test(w))).toBe(false)
  })

  it('truncates action text beyond MAX_ACTION_TEXT_LENGTH and warns', () => {
    const huge = 'a'.repeat(MAX_ACTION_TEXT_LENGTH + 500)
    const result = sanitizeBlueprintModuleInput({ steps: [{ type: 'execution', action: huge }] })
    expect(result.module!.steps[0].action.length).toBe(MAX_ACTION_TEXT_LENGTH)
    expect(result.warnings.some((w) => /truncated/i.test(w))).toBe(true)
  })

  it('caps integrations_required at MAX_INTEGRATIONS', () => {
    const integrations = Array.from({ length: MAX_INTEGRATIONS + 20 }, (_, i) => `Integration ${i}`)
    const result = sanitizeBlueprintModuleInput({
      steps: [{ type: 'execution', action: 'Do something' }],
      integrations_required: integrations,
    })
    expect(result.module!.integrations_required.length).toBe(MAX_INTEGRATIONS)
  })

  it('ignores non-string entries in steps/integrations without throwing', () => {
    const result = sanitizeBlueprintModuleInput({
      steps: [null, 42, { type: 'execution', action: 'Valid step' }, 'a bare string'],
      integrations_required: [null, 42, 'CRM', {}],
    })
    expect(result.module).not.toBeNull()
    expect(result.module!.steps.length).toBe(1)
    expect(result.module!.integrations_required).toEqual(['CRM'])
  })

  it('never throws on completely garbage input', () => {
    const garbageInputs: unknown[] = [
      {},
      { steps: null },
      { steps: [{}] },
      { steps: [{ type: 123, action: {} }] },
      { steps: [{ action: 'ok' }], integrations_required: 'not an array' },
    ]
    for (const raw of garbageInputs) {
      expect(() => sanitizeBlueprintModuleInput(raw as any)).not.toThrow()
    }
  })
})

describe('planWorkflowFromBlueprintModule — defense in depth', () => {
  it('returns an empty safe plan instead of throwing when called directly with malformed input', () => {
    const cases = [
      { name: 'x', trigger: '', steps: undefined as any, integrations_required: [] },
      { name: 'x', trigger: '', steps: null as any, integrations_required: [] },
      { name: 'x', trigger: '', steps: [], integrations_required: [] },
    ]
    for (const testCase of cases) {
      const planned = planWorkflowFromBlueprintModule(testCase)
      expect(planned.steps).toEqual([])
      expect(() => validatePlannedWorkflow(planned)).not.toThrow()
    }
  })

  it('does not throw when given null/undefined module', () => {
    expect(() => planWorkflowFromBlueprintModule(null as any)).not.toThrow()
    expect(() => planWorkflowFromBlueprintModule(undefined as any)).not.toThrow()
  })
})

describe('adversarial decomposition — output size stays bounded', () => {
  it('caps atomic ops from a single step packed with hundreds of connectors', () => {
    const spammed = Array.from({ length: 300 }, (_, i) => `Action ${i}`).join(', and ')
    const planned = planWorkflowFromBlueprintModule({
      name: 'Adversarial',
      trigger: 'Manual',
      steps: [{ type: 'execution', action: spammed.slice(0, 2000) }],
      integrations_required: [],
    })
    const flat = flatten(planned.steps)
    // Bounded: the decomposition cap (12 per step) plus the always-appended
    // audit node — nowhere near the ~300 connectors present in the text.
    expect(flat.length).toBeLessThan(20)
    expect(planned.warnings.some((w) => /capped/i.test(w))).toBe(true)
  })

  it('caps ingestion sources named in a single step', () => {
    const manyIntegrations = Array.from({ length: 40 }, (_, i) => `Source${i}`)
    const action = `Get data from ${manyIntegrations.join(', ')}`
    const planned = planWorkflowFromBlueprintModule({
      name: 'Adversarial ingestion',
      trigger: 'Manual',
      steps: [{ type: 'ingestion', action: action.slice(0, 2000) }],
      integrations_required: manyIntegrations,
    })
    const flat = flatten(planned.steps)
    expect(flat.length).toBeLessThan(20)
  })

  it('completes quickly on large adversarial input (no catastrophic-backtracking hang)', () => {
    const longText = 'validasi dan review dan jadwalkan dan kirim dan buat dan CRM '.repeat(200).slice(0, 2000)
    const start = performance.now()
    const planned = planWorkflowFromBlueprintModule({
      name: 'Perf',
      trigger: 'Manual',
      steps: Array.from({ length: 50 }, () => ({ type: 'execution' as const, action: longText })),
      integrations_required: ['CRM', 'Email', 'Calendar'],
    })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(2000)
    expect(planned.steps.length).toBeGreaterThan(0)
  })
})

describe('multiple human_review steps in one module', () => {
  it('consumes all review steps into the same exception gate without crashing', () => {
    const planned = planWorkflowFromBlueprintModule({
      name: 'Double review',
      trigger: 'Manual',
      steps: [
        { type: 'ingestion', action: 'Get the record' },
        { type: 'ai_processing', action: 'Validate the record' },
        { type: 'human_review', action: 'Review missing fields' },
        { type: 'human_review', action: 'Review suspicious activity' },
        { type: 'execution', action: 'Process the record' },
      ],
      integrations_required: [],
    })
    const result = validatePlannedWorkflow(planned)
    expect(result.errors).toEqual([])
    const gate = planned.steps.find((s) => s.type === 'condition')
    expect(gate).toBeDefined()
    const exceptionBranchActions = gate!.branches!.flatMap((b) => b.steps).map((s) => s.action)
    expect(exceptionBranchActions.some((a) => /missing fields/i.test(a))).toBe(true)
    expect(exceptionBranchActions.some((a) => /suspicious activity/i.test(a))).toBe(true)
  })
})
