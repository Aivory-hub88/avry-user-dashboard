/**
 * Route-level tests for the actual HTTP handler — the input-hardening
 * rejection path, the happy path with real planning, and the legacy
 * blueprintId payload, all through POST() itself rather than the planner
 * functions directly. The Copilot LLM bridge is mocked (no real network)
 * since its live behavior is out of this repo's control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { callCopilotOperationMock } = vi.hoisted(() => ({
  callCopilotOperationMock: vi.fn(),
}))
vi.mock('@/lib/workflows/bridgeCopilot', () => ({ callCopilotOperation: callCopilotOperationMock }))
// The paid-plan gate has its own tests (lib/planGate.test.ts); here the caller is a paying user.
vi.mock('@/lib/teamAccess', () => ({ requireModule: async () => null }))
vi.mock('@/lib/planGate', () => ({ requirePaidPlan: async () => ({ ok: true }) }))

import { POST } from './route'

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/console/workflows/from-blueprint', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  callCopilotOperationMock.mockReset().mockResolvedValue({ message: 'OK — no issues found.' })
})

describe('POST /api/console/workflows/from-blueprint', () => {
  it('rejects an empty workflow_steps array with 400', async () => {
    const res = await POST(req({ workflow_id: 'wf-1', workflow_title: 'Empty', workflow_steps: [] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBeDefined()
    expect(callCopilotOperationMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized workflow_steps payload with 400 without doing any planning work', async () => {
    const steps = Array.from({ length: 500 }, (_, i) => ({ type: 'execution', action: `Step ${i}` }))
    const res = await POST(req({ workflow_id: 'wf-2', workflow_title: 'Huge', workflow_steps: steps }))
    expect(res.status).toBe(400)
    expect(callCopilotOperationMock).not.toHaveBeenCalled()
    expect(callCopilotOperationMock).not.toHaveBeenCalled()
  })

  it('generates a real decomposed graph on the happy path and calls both validators', async () => {
    const res = await POST(req({
      workflow_id: 'wf-3',
      workflow_title: 'Employee Onboarding',
      workflow_steps: [
        { type: 'ingestion', action: 'Get new hire details from the HRIS system' },
        { type: 'execution', action: 'Create IT accounts, send welcome materials, and schedule orientation session' },
        { type: 'notification', action: 'Notify the hiring manager about onboarding status' },
      ],
      integrations_required: ['HRIS', 'Email'],
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.steps.length).toBeGreaterThan(3) // real decomposition, not 1:1
    expect(callCopilotOperationMock).toHaveBeenCalledTimes(1)
  })

  it('coerces an unknown step type instead of failing the whole request', async () => {
    const res = await POST(req({
      workflow_id: 'wf-4',
      workflow_title: 'Unknown type',
      workflow_steps: [{ type: 'frobnicate', action: 'Do the thing' }],
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.warnings?.some((w: string) => /unknown step type/i.test(w))).toBe(true)
  })

  it('still supports the legacy blueprintId handoff payload', async () => {
    const res = await POST(req({ blueprintId: 'bp-123', name: 'Legacy' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.blueprintId).toBe('bp-123')
  })

  it('rejects a request with neither workflow_steps nor blueprintId', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('does not fail the request when the LLM validator errors out (fail open)', async () => {
    callCopilotOperationMock.mockRejectedValue(new Error('bridge unreachable'))
    const res = await POST(req({
      workflow_id: 'wf-5',
      workflow_title: 'Resilience',
      workflow_steps: [{ type: 'execution', action: 'Create customer account' }],
    }))
    // The validators fail open internally — but this route also must not
    // 500 even if that contract were ever violated upstream, since the
    // whole handler is wrapped in try/catch.
    expect(res.status).toBe(200)
  })
})
