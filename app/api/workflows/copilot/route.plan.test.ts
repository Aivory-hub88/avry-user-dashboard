import { describe, it, expect, vi, beforeEach } from 'vitest'

const gate = vi.fn()
const processMessage = vi.fn()

vi.mock('@/lib/planGate', () => ({ requirePaidPlan: (...a: unknown[]) => gate(...a) }))
vi.mock('@/lib/workflows/copilotStateMachine', () => ({
  CopilotStateMachine: class {
    processMessage = processMessage
    continuePending = vi.fn()
  },
}))

import { POST } from './route'

const req = (body: Record<string, unknown>) => ({ json: async () => body }) as never
const denied = (code: string, status: number) => ({
  ok: false,
  code,
  response: new Response(JSON.stringify({ code }), { status }),
})

beforeEach(() => {
  gate.mockReset()
  processMessage.mockReset()
  processMessage.mockResolvedValue({ stage: 'CLARIFYING', lastMessage: 'ok', conversationHistory: [] })
})

describe('copilot is paid-only', () => {
  it('a paying account gets the copilot', async () => {
    gate.mockResolvedValue({ ok: true })
    expect((await POST(req({ prompt: 'hi', sessionId: 's1' }))).status).toBe(200)
    expect(processMessage).toHaveBeenCalled()
  })

  it('a free account gets the 402 and no LLM call', async () => {
    gate.mockResolvedValue(denied('UPGRADE_REQUIRED', 402))
    const res = await POST(req({ prompt: 'hi', sessionId: 's1' }))
    expect(res.status).toBe(402)
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('a signed-out caller gets the 401', async () => {
    gate.mockResolvedValue(denied('UNAUTHENTICATED', 401))
    expect((await POST(req({ prompt: 'hi' }))).status).toBe(401)
    expect(processMessage).not.toHaveBeenCalled()
  })
})
