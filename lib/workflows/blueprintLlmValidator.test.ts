/**
 * blueprintLlmValidator — advisory-only, must fail open. Mocks the VPS
 * bridge call (no real network) since the actual LLM prompt behavior is
 * server-side/untracked; these tests only prove OUR contract: never throw,
 * never mutate the plan, and correctly forward what the bridge returns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PlannedWorkflow } from './blueprintPlanner'

const { callCopilotOperationMock } = vi.hoisted(() => ({ callCopilotOperationMock: vi.fn() }))
vi.mock('./bridgeCopilot', () => ({ callCopilotOperation: callCopilotOperationMock }))

import { llmValidatePlan } from './blueprintLlmValidator'

function plan(steps: PlannedWorkflow['steps']): PlannedWorkflow {
  return { trigger: 'Manual', steps, integrations: [], unresolvedIntegrations: [], warnings: [] }
}

beforeEach(() => {
  callCopilotOperationMock.mockReset()
})

describe('llmValidatePlan', () => {
  it('returns no warnings for an empty plan without calling the bridge', async () => {
    const result = await llmValidatePlan(plan([]), 'Empty')
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
    expect(callCopilotOperationMock).not.toHaveBeenCalled()
  })

  it('returns no warnings when the LLM reports no issues', async () => {
    callCopilotOperationMock.mockResolvedValue({ message: 'OK — no issues found.' })
    const result = await llmValidatePlan(
      plan([{ step: 1, action: 'Create account', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
  })

  it('surfaces the LLM message as a warning when it flags a concern', async () => {
    callCopilotOperationMock.mockResolvedValue({ message: 'Step 3 uses an AI Agent for a purely mechanical email send.' })
    const result = await llmValidatePlan(
      plan([{ step: 1, action: 'Send email', tool: 'Aivory AI', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain('AI Agent for a purely mechanical email send')
  })

  it('fails open (ok: false, no warnings, does not throw) when the bridge call rejects', async () => {
    callCopilotOperationMock.mockRejectedValue(new Error('VPS_BRIDGE_URL is not configured'))
    const result = await llmValidatePlan(
      plan([{ step: 1, action: 'Create account', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('fails open when the bridge returns an unexpected shape', async () => {
    callCopilotOperationMock.mockResolvedValue({ workflow: { steps: [] } }) // no `message`
    const result = await llmValidatePlan(
      plan([{ step: 1, action: 'Create account', tool: 'n8n', output: '' }]),
      'Onboarding',
    )
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
  })
})
