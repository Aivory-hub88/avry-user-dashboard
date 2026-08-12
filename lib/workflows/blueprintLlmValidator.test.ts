/**
 * blueprintLlmValidator — semantic review, must fail open. Mocks the VPS
 * bridge call (no real network) since the actual LLM prompt behavior is
 * server-side/untracked; these tests prove OUR contract: never throw, never
 * mutate the plan, parse structured findings defensively, and fail open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PlannedWorkflow } from './blueprintPlanner'

const { callCopilotOperationMock } = vi.hoisted(() => ({ callCopilotOperationMock: vi.fn() }))
vi.mock('./bridgeCopilot', () => ({ callCopilotOperation: callCopilotOperationMock }))

import { llmSemanticReview } from './blueprintLlmValidator'

function plan(steps: PlannedWorkflow['steps']): PlannedWorkflow {
  return { trigger: 'Manual', steps, integrations: [], unresolvedIntegrations: [], warnings: [] }
}

beforeEach(() => {
  callCopilotOperationMock.mockReset()
})

describe('llmSemanticReview', () => {
  it('returns no findings for an empty plan without calling the bridge', async () => {
    const result = await llmSemanticReview(plan([]), 'Empty')
    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
    expect(callCopilotOperationMock).not.toHaveBeenCalled()
  })

  it('returns no findings when the LLM replies with an empty JSON array', async () => {
    callCopilotOperationMock.mockResolvedValue({ message: '[]' })
    const result = await llmSemanticReview(
      plan([{ step: 1, action: 'Create account', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('parses structured JSON findings', async () => {
    callCopilotOperationMock.mockResolvedValue({
      message: JSON.stringify([
        { severity: 'error', step: 3, issue: 'escalate is not conditional', suggestion: 'wrap in an IF on is_delayed' },
      ]),
    })
    const result = await llmSemanticReview(
      plan([{ step: 1, action: 'Track progress', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      step: 3,
      issue: 'escalate is not conditional',
      suggestion: 'wrap in an IF on is_delayed',
    })
  })

  it('falls back to a single warning finding for prose', async () => {
    callCopilotOperationMock.mockResolvedValue({ message: 'Step 2 uses AI for a mechanical send.' })
    const result = await llmSemanticReview(
      plan([{ step: 1, action: 'Send email', tool: 'Aivory AI', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('warning')
    expect(result.findings[0].issue).toContain('AI for a mechanical send')
  })

  it('fails open (ok: false, no findings, does not throw) when the bridge rejects', async () => {
    callCopilotOperationMock.mockRejectedValue(new Error('VPS_BRIDGE_URL is not configured'))
    const result = await llmSemanticReview(
      plan([{ step: 1, action: 'Create account', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(false)
    expect(result.findings).toEqual([])
  })

  it('fails open when the bridge returns an unexpected shape', async () => {
    callCopilotOperationMock.mockResolvedValue({ workflow: { steps: [] } })
    const result = await llmSemanticReview(
      plan([{ step: 1, action: 'Create account', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
  })
})
